"""Sincronização dos mangás da Frieren com a lista de mangás do MyAnimeList (MAL).

Espelha o que a Marin faz com a lista de animes (`agents/marin/mal_sync.py`, spec 053):

* **Pull** (MAL → Frieren): `sync_manga_mal()` lê `GET /v2/users/@me/mangalist` e cria/atualiza
  livros. Mangá novo entra como livro novo (formato Mangá/HQ, contado em capítulos). Livro que
  já existe converge: o progresso avança por uma *sessão de ajuste* (`reading_logs.source =
  'mal_sync'`, nunca sobrescreve) e status/nota seguem o carimbo mais recente.
* **Push** (Frieren → MAL): `push_manga_status()` / `push_manga_delete()` são chamadas pelas tools
  de mutação local (`tools.py`) DEPOIS que a mudança já foi gravada. São *best-effort*: uma falha
  nunca desfaz nem bloqueia a operação local.

Anti-eco: o pull grava direto no banco e NUNCA chama as tools públicas (que fazem push). Como ele
só escreve quando o valor do MAL difere do local, um ciclo sem mudanças não grava nada.

O token OAuth é o mesmo da Marin (`MALAuth`, tabela `mal_sync_state`): um token cobre anime e mangá.

Mapeamento:
    reading / completed / on_hold / dropped / plan_to_read  ↔  lendo / lido / pausado / abandonado / quero_ler
    score 0–10 (inteiro)                                    ↔  rating 0.5–5 (score ÷ 2)
    num_chapters_read (ou num_volumes_read)                 ↔  posição (`page_end`) na unidade do livro

Usage:
    from agents.frieren.mal_sync import sync_manga_mal
    sync_manga_mal(full=False)            # delta
    sync_manga_mal(full=True, dry_run=True)   # só relata, não grava
"""

import logging
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import requests

from agents.db import get_conn, run_select
from agents.marin.mal_auth import MALAuth
from agents.marin.mal_sync import mal_get

logger = logging.getLogger(__name__)

# Fuso do usuário: a data de uma sessão de ajuste é o dia LOCAL em que o MAL registrou a mudança.
_TZ = ZoneInfo("America/Sao_Paulo")

# Endpoints da API v2 do MAL: a lista inteira, e o list_status de UM mangá.
_MAL_MANGALIST_URL = "https://api.myanimelist.net/v2/users/@me/mangalist"
_MAL_MANGA_STATUS_URL = "https://api.myanimelist.net/v2/manga/{mal_id}/my_list_status"

# Entradas por página (o MAL aceita até 1000; 100 evita respostas enormes, com sinopse).
_PAGE_LIMIT = 100

# Campos pedidos ao MAL: o próprio `mangalist` já traz capa, autores, gêneros e totais — assim a
# importação não depende do Jikan (nem do limite dele, 1 chamada por título).
_FIELDS = (
    "list_status{status,score,num_volumes_read,num_chapters_read,start_date,finish_date,updated_at},"
    "num_chapters,num_volumes,main_picture,genres,authors{first_name,last_name},start_date,media_type,synopsis"
)

# status do MAL ↔ status da Frieren.
_MAL_TO_LOCAL: dict[str, str] = {
    "reading": "lendo",
    "completed": "lido",
    "on_hold": "pausado",
    "dropped": "abandonado",
    "plan_to_read": "quero_ler",
}
_LOCAL_TO_MAL: dict[str, str] = {v: k for k, v in _MAL_TO_LOCAL.items()}
# "estante" e "wishlist" não existem no MAL: ficam de fora do push (não há equivalente honesto).

# Tipos do MAL que são livros de texto, não quadrinhos (o resto entra como Mangá/HQ).
_TEXT_MEDIA_TYPES = frozenset({"novel", "light_novel"})


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES PURAS — conversões (testáveis sem banco nem rede)
# ─────────────────────────────────────────────────────────────────────────────

def status_from_mal(status_mal: str | None) -> str:
    """Converter o status do MAL para o da Frieren.

    Args:
        status_mal: ``reading``, ``completed``, ``on_hold``, ``dropped`` ou ``plan_to_read``.

    Returns:
        O status local; valor desconhecido ou vazio vira ``quero_ler``.

    Example:
        >>> status_from_mal("completed")
        'lido'
        >>> status_from_mal(None)
        'quero_ler'
    """
    return _MAL_TO_LOCAL.get(status_mal or "", "quero_ler")


def rating_from_score(score: int | float | None) -> float | None:
    """Converter a nota do MAL (0–10) para a da Frieren (0.5–5, meia estrela = 1 ponto).

    Args:
        score: Nota inteira do MAL; 0 ou vazio significa "sem nota".

    Returns:
        Nota de 0.5 a 5.0, ou None quando não há nota.

    Example:
        >>> rating_from_score(9)
        4.5
        >>> rating_from_score(0) is None
        True
    """
    if not score or float(score) <= 0:
        return None
    return round(min(10.0, float(score)) / 2, 1)


def score_from_rating(rating: float | None) -> int | None:
    """Converter a nota da Frieren (0.5–5) para a do MAL (inteiro 1–10).

    Args:
        rating: Nota local; None não envia nada.

    Returns:
        Inteiro de 1 a 10, ou None se não há nota.

    Example:
        >>> score_from_rating(4.5)
        9
        >>> score_from_rating(None) is None
        True
    """
    if rating is None or float(rating) <= 0:
        return None
    return max(1, min(10, int(round(float(rating) * 2))))


def pick_unit(chapters_read: int, volumes_read: int) -> str:
    """Escolher a unidade de um mangá NOVO: capítulos, salvo quando só há volumes lidos.

    Args:
        chapters_read: ``num_chapters_read`` do MAL.
        volumes_read: ``num_volumes_read`` do MAL.

    Returns:
        ``"chapters"`` ou ``"volumes"``.

    Example:
        >>> pick_unit(12, 2)
        'chapters'
        >>> pick_unit(0, 3)
        'volumes'
        >>> pick_unit(0, 0)
        'chapters'
    """
    return "volumes" if not chapters_read and volumes_read else "chapters"


def progress_for_unit(unit: str, chapters_read: int, volumes_read: int) -> int | None:
    """Pegar do MAL a posição que corresponde à unidade do livro.

    Args:
        unit: Unidade do livro (``pages``, ``chapters`` ou ``volumes``).
        chapters_read: ``num_chapters_read`` do MAL.
        volumes_read: ``num_volumes_read`` do MAL.

    Returns:
        A posição, ou None para livros em páginas (o MAL não conta páginas).

    Example:
        >>> progress_for_unit("chapters", 12, 2)
        12
        >>> progress_for_unit("pages", 12, 2) is None
        True
    """
    if unit == "chapters":
        return int(chapters_read or 0)
    if unit == "volumes":
        return int(volumes_read or 0)
    return None


def _parse_dt(texto: str | None) -> datetime:
    """Ler um timestamp ISO 8601 do MAL como datetime com fuso (inválido vira "agora")."""
    try:
        return datetime.fromisoformat((texto or "").replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def _parse_date(texto: str | None) -> date | None:
    """Ler uma data completa ``YYYY-MM-DD`` do MAL (datas parciais, como só o ano, viram None)."""
    try:
        return date.fromisoformat(texto) if texto else None
    except ValueError:
        return None


def _author_text(authors: list[dict] | None) -> str | None:
    """Montar "Nome Sobrenome, Outro Autor" a partir de ``authors`` do MAL."""
    nomes = []
    for a in authors or []:
        node = a.get("node", {})
        nome = f"{node.get('first_name', '')} {node.get('last_name', '')}".strip()
        if nome and nome not in nomes:
            nomes.append(nome)
    return ", ".join(nomes) or None


# ─────────────────────────────────────────────────────────────────────────────
# ESTADO DO DELTA
# ─────────────────────────────────────────────────────────────────────────────

def _get_last_sync_at() -> datetime | None:
    """Ler o instante do último sync delta de mangá (None no primeiro uso)."""
    linhas = run_select("SELECT last_sync_at FROM frieren_mal_state WHERE id = 1")
    return linhas[0].get("last_sync_at") if linhas else None


def _update_last_sync_at(run_start: datetime) -> None:
    """Gravar o início do sync como novo ponto de corte do delta.

    Usa o INÍCIO (não o fim): mudanças feitas no MAL durante o sync são reprocessadas no próximo ciclo.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO frieren_mal_state (id, last_sync_at, updated_at)
                VALUES (1, %(t)s, NOW())
                ON CONFLICT (id) DO UPDATE SET last_sync_at = EXCLUDED.last_sync_at, updated_at = NOW()
                """,
                {"t": run_start},
            )


# ─────────────────────────────────────────────────────────────────────────────
# PULL — MAL → Frieren
# ─────────────────────────────────────────────────────────────────────────────

def _insert_manga(node: dict, ls: dict, mal_id: int, title: str) -> str:
    """Criar o livro de um mangá do MAL que ainda não existe aqui.

    Args:
        node: ``node`` da entrada (capa, autores, gêneros, totais…).
        ls: ``list_status`` da entrada.
        mal_id: ID da série no MAL.
        title: Título.

    Returns:
        ``"created"``.
    """
    chapters_read = int(ls.get("num_chapters_read") or 0)
    volumes_read = int(ls.get("num_volumes_read") or 0)
    unit = pick_unit(chapters_read, volumes_read)
    posicao = progress_for_unit(unit, chapters_read, volumes_read) or 0
    # num_chapters/num_volumes = 0 no MAL significa "ainda em publicação" → total desconhecido.
    total = int(node.get("num_volumes" if unit == "volumes" else "num_chapters") or 0) or None
    # Se o MAL diz que leu mais do que o total que ele mesmo informa, o total está defasado.
    if total and posicao > total:
        total = posicao

    status = status_from_mal(ls.get("status"))
    mal_updated = _parse_dt(ls.get("updated_at"))
    dia_mal = mal_updated.astimezone(_TZ).date()
    finish = _parse_date(ls.get("finish_date"))
    start = _parse_date(ls.get("start_date"))
    ano = (node.get("start_date") or "")[:4]
    media = (node.get("media_type") or "").lower()
    livro_id = str(uuid.uuid4())

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO books (
                    id, title, author, total_pages, cover_url, description, genre, published_year,
                    status, date_started, date_finished, date_abandoned, rating,
                    source, created_at, updated_at, deleted,
                    format, progress_unit, first_unit, mal_manga_id, mal_updated_at
                ) VALUES (
                    %(id)s, %(title)s, %(author)s, %(total)s, %(cover)s, %(desc)s, %(genre)s, %(year)s,
                    %(status)s, %(started)s, %(finished)s, %(abandoned)s, %(rating)s,
                    'mal_sync', NOW(), NOW(), FALSE,
                    %(format)s, %(unit)s, 1, %(mal_id)s, %(mal_updated)s
                )
                """,
                {
                    "id": livro_id, "title": title, "author": _author_text(node.get("authors")),
                    "total": total, "cover": (node.get("main_picture") or {}).get("large")
                    or (node.get("main_picture") or {}).get("medium"),
                    "desc": (node.get("synopsis") or "")[:500] or None,
                    "genre": ", ".join(g["name"] for g in node.get("genres") or [] if g.get("name")) or None,
                    "year": int(ano) if ano.isdigit() else None,
                    "status": status,
                    "started": start or (dia_mal if status in ("lendo", "lido") else None),
                    "finished": (finish or dia_mal) if status == "lido" else None,
                    "abandoned": dia_mal if status == "abandonado" else None,
                    "rating": rating_from_score(ls.get("score")),
                    "format": "fisico" if media in _TEXT_MEDIA_TYPES else "quadrinho",
                    "unit": unit, "mal_id": mal_id, "mal_updated": mal_updated,
                },
            )
            # O progresso inicial vira UMA sessão de ajuste (o contador sempre deriva das sessões).
            if posicao > 0:
                _insert_adjustment(cur, livro_id, title, 0, posicao, finish or dia_mal)
    return "created"


def _insert_adjustment(cur, book_id: str, title: str, de: int, ate: int, dia: date) -> None:
    """Gravar a sessão de ajuste que leva a posição de ``de`` até ``ate`` (origem ``mal_sync``)."""
    cur.execute(
        """
        INSERT INTO reading_logs (
            id, book_id, book_title, date, page_start, page_end, pages_read, source, created_at
        ) VALUES (
            %(id)s, %(book_id)s, %(title)s, %(date)s, %(de)s, %(ate)s, %(n)s, 'mal_sync', NOW()
        )
        """,
        {"id": str(uuid.uuid4()), "book_id": book_id, "title": title, "date": dia,
         "de": de, "ate": ate, "n": ate - de},
    )


def _upsert_manga_entry(entrada: dict) -> str:
    """Criar ou convergir UM livro a partir de uma entrada da mangalist do MAL.

    Args:
        entrada: Item de ``data`` da resposta do MAL (``node`` + ``list_status``).

    Returns:
        ``"created"``, ``"updated"`` ou ``"skipped"`` (nada mudou, ou foi excluído localmente).
    """
    node = entrada.get("node", {})
    ls = entrada.get("list_status", {})
    mal_id = int(node.get("id") or 0)
    if not mal_id:
        return "skipped"
    title = node.get("title") or f"mangá {mal_id}"

    rows = run_select("SELECT * FROM books WHERE mal_manga_id = %(m)s", {"m": mal_id})
    if not rows:
        return _insert_manga(node, ls, mal_id, title)

    livro = rows[0]
    # Excluído localmente: o pull não ressuscita (mesma decisão da Marin).
    if livro.get("deleted"):
        logger.info("MAL manga: mal_id=%d foi excluído localmente — pull não ressuscita.", mal_id)
        return "skipped"

    unit = livro.get("progress_unit") or "pages"
    mal_updated = _parse_dt(ls.get("updated_at"))
    dia_mal = mal_updated.astimezone(_TZ).date()
    finish = _parse_date(ls.get("finish_date"))
    start = _parse_date(ls.get("start_date"))
    status_mal = status_from_mal(ls.get("status"))
    rating_mal = rating_from_score(ls.get("score"))
    local_ts = livro.get("local_updated_at")
    # O MAL só "vence" status/nota quando é mais recente que a última mudança LOCAL conhecida;
    # senão o valor local é o novo e quem o leva ao MAL é o push das tools.
    mal_vence = local_ts is None or mal_updated > local_ts
    changed = False

    with get_conn() as conn:
        with conn.cursor() as cur:
            # ── 1. Progresso: "maior progresso vence" (o pull só avança) ─────
            mal_pos = progress_for_unit(unit, ls.get("num_chapters_read") or 0, ls.get("num_volumes_read") or 0)
            if mal_pos is not None:
                cur.execute(
                    "SELECT COALESCE(MAX(page_end), 0) AS pos FROM reading_logs WHERE book_id = %(b)s",
                    {"b": livro["id"]},
                )
                row = cur.fetchone()
                local_pos = int((row["pos"] if isinstance(row, dict) else row[0]) or 0)
                if mal_pos > local_pos:
                    _insert_adjustment(cur, livro["id"], livro["title"], local_pos, mal_pos, finish or dia_mal)
                    # Total defasado (o MAL leu mais do que o total cadastrado): acompanha a leitura.
                    if livro.get("total_pages") and mal_pos > int(livro["total_pages"]):
                        cur.execute("UPDATE books SET total_pages = %(t)s WHERE id = %(b)s",
                                    {"t": mal_pos, "b": livro["id"]})
                    changed = True

            # ── 2. Status e nota: o carimbo mais recente vence ───────────────
            if mal_vence and status_mal != livro.get("status"):
                # As datas acompanham o status (início ao ler, dia do abandono…) — regra da Frieren.
                from agents.frieren.tools import _status_set_sql
                cur.execute(
                    f"UPDATE books SET {_status_set_sql()}, updated_at = NOW() WHERE id = %(book_id)s",
                    {"status": status_mal, "today": str(dia_mal), "book_id": livro["id"]},
                )
                changed = True
            nota_local = float(livro["rating"]) if livro.get("rating") is not None else None
            if mal_vence and rating_mal != nota_local:
                cur.execute("UPDATE books SET rating = %(r)s, updated_at = NOW() WHERE id = %(b)s",
                            {"r": rating_mal, "b": livro["id"]})
                changed = True

            # ── 3. Datas do MAL entram só onde ainda não há data ─────────────
            if status_mal == "lido" and (mal_vence or livro.get("status") == "lido"):
                cur.execute(
                    "UPDATE books SET date_finished = COALESCE(date_finished, %(d)s) "
                    "WHERE id = %(b)s AND status = 'lido'",
                    {"d": finish or dia_mal, "b": livro["id"]},
                )
            if start:
                cur.execute("UPDATE books SET date_started = COALESCE(date_started, %(d)s) WHERE id = %(b)s",
                            {"d": start, "b": livro["id"]})

            # ── 4. Sempre grava o carimbo de última mudança conhecida no MAL ─
            if livro.get("mal_updated_at") != mal_updated:
                cur.execute("UPDATE books SET mal_updated_at = %(t)s WHERE id = %(b)s",
                            {"t": mal_updated, "b": livro["id"]})

    return "updated" if changed else "skipped"


def sync_manga_mal(full: bool = False, dry_run: bool = False) -> dict:
    """Sincronizar a lista de mangás do MAL com os livros da Frieren (pull).

    Delta por padrão: a lista vem ordenada por ``list_updated_at`` decrescente, então o laço para
    na primeira entrada mais antiga que o último sync. ``full=True`` processa tudo.

    Args:
        full: Ignora o ponto de corte e processa a lista inteira (1ª importação ou correção).
        dry_run: Só relata o que seria criado/atualizado; não grava livros nem avança o delta.

    Returns:
        Dicionário com ``ok``, ``full``, ``dry_run``, ``timestamp``, ``mal_entries_fetched``,
        ``created``, ``updated``, ``skipped``, ``errors`` e (no dry-run) ``would_create`` com
        os primeiros títulos que seriam criados.

    Example:
        >>> # sync_manga_mal(full=True, dry_run=True)["would_create"]  # ['Berserk', ...]
    """
    run_start = datetime.now(timezone.utc)
    last_sync_at = None if full else _get_last_sync_at()
    auth = MALAuth()
    fetched = created = updated = skipped = 0
    erros: list[dict] = []
    would_create: list[str] = []
    url = _MAL_MANGALIST_URL
    params: dict | None = {"fields": _FIELDS, "nsfw": "true", "limit": _PAGE_LIMIT, "sort": "list_updated_at"}
    continuar = True

    while continuar and url:
        resposta = mal_get(url, auth, params=params)
        params = None  # as páginas seguintes já vêm completas em `paging.next`
        if resposta is None:
            # Falha de API: para sem avançar o delta, para a próxima rodada tentar de novo.
            logger.error("MAL manga: falha ao buscar página — interrompendo.")
            erros.append({"mal_id": None, "msg": "falha ao buscar a mangalist no MAL"})
            return _result(False, full, dry_run, run_start, fetched, created, updated, skipped, erros, would_create)
        entradas = resposta.get("data", [])
        if not entradas:
            break

        for entrada in entradas:
            fetched += 1
            node = entrada.get("node", {})
            mal_id = node.get("id", 0)
            try:
                atualizado_em = (entrada.get("list_status") or {}).get("updated_at", "")
                if last_sync_at and atualizado_em and _parse_dt(atualizado_em) <= last_sync_at:
                    continuar = False  # tudo daqui para a frente já foi visto
                    break
                if dry_run:
                    existe = run_select("SELECT deleted FROM books WHERE mal_manga_id = %(m)s", {"m": mal_id})
                    if not existe:
                        created += 1
                        if len(would_create) < 30:
                            would_create.append(node.get("title") or f"mangá {mal_id}")
                    elif existe[0].get("deleted"):
                        skipped += 1
                    else:
                        updated += 1  # existe: pode ou não mudar (o dry-run não compara campo a campo)
                    continue
                resultado = _upsert_manga_entry(entrada)
                if resultado == "created":
                    created += 1
                elif resultado == "updated":
                    updated += 1
                else:
                    skipped += 1
            except Exception as exc:  # uma entrada ruim não derruba o sync inteiro
                logger.error("MAL manga: erro em mal_id=%s: %s", mal_id, exc, exc_info=True)
                erros.append({"mal_id": mal_id, "msg": str(exc)})
                skipped += 1

        if continuar:
            url = (resposta.get("paging") or {}).get("next")

    if not dry_run:
        try:
            _update_last_sync_at(run_start)
        except Exception as exc:
            logger.error("MAL manga: falha ao gravar last_sync_at: %s", exc)
            erros.append({"mal_id": None, "msg": f"last_sync_at não atualizado: {exc}"})
        if created or updated:
            try:
                from agents.kaguya import gcal_mirror as _gm
                _gm.mark_dirty("frieren")
            except Exception:
                pass

    return _result(True, full, dry_run, run_start, fetched, created, updated, skipped, erros, would_create)


def _result(ok, full, dry_run, run_start, fetched, created, updated, skipped, erros, would_create) -> dict:
    """Montar o dicionário de resultado do sync (mesmas chaves da Marin + ``dry_run``/``would_create``)."""
    return {
        "ok": ok, "full": full, "dry_run": dry_run, "timestamp": run_start.isoformat(),
        "mal_entries_fetched": fetched, "created": created, "updated": updated, "skipped": skipped,
        "errors": erros, "would_create": would_create,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PUSH — Frieren → MAL (best-effort)
# ─────────────────────────────────────────────────────────────────────────────

def push_manga_status(
    mal_manga_id: int | None,
    status: str | None = None,
    rating: float | None = None,
    chapters_read: int | None = None,
    volumes_read: int | None = None,
) -> bool:
    """Propagar uma mudança local para a lista de mangás do usuário no MAL.

    Só envia os campos informados (None = não mexer). A nota local (0.5–5) vira inteiro de 1 a 10.
    Status sem equivalente no MAL (``estante``, ``wishlist``) são ignorados.

    Args:
        mal_manga_id: ID da série no MAL; None/0 (livro sem vínculo) não faz nada.
        status: Status local.
        rating: Nota local.
        chapters_read: Capítulos lidos (livros contados em capítulos).
        volumes_read: Volumes lidos (livros contados em volumes).

    Returns:
        True se o MAL aceitou (ou não havia o que enviar); False em qualquer falha.
        Nunca levanta exceção.
    """
    if not mal_manga_id:
        return False
    body: dict[str, str] = {}
    mal_status = _LOCAL_TO_MAL.get(status or "")
    if mal_status:
        body["status"] = mal_status
    score = score_from_rating(rating)
    if score is not None:
        body["score"] = str(score)
    if chapters_read is not None:
        body["num_chapters_read"] = str(int(chapters_read))
    if volumes_read is not None:
        body["num_volumes_read"] = str(int(volumes_read))
    if not body:
        return True  # nada para enviar não é falha
    try:
        resposta = requests.patch(
            _MAL_MANGA_STATUS_URL.format(mal_id=mal_manga_id),
            headers=MALAuth().auth_header(),
            data=body,  # form-encoded, o formato que a API v2 do MAL exige
            timeout=15,
        )
        if resposta.status_code == 200:
            return True
        logger.warning("MAL manga push: status %d em mal_id=%d (%s)",
                       resposta.status_code, mal_manga_id, resposta.text[:200])
        return False
    except Exception as exc:  # best-effort: rede, token… nunca propaga
        logger.error("MAL manga push: erro em mal_id=%d: %s", mal_manga_id, exc)
        return False


def push_manga_delete(mal_manga_id: int | None) -> bool:
    """Remover o mangá da lista do usuário no MAL (404 conta como sucesso: já não estava lá).

    Args:
        mal_manga_id: ID da série no MAL; None/0 não faz nada.

    Returns:
        True se removido ou já ausente; False em qualquer outra falha. Nunca levanta exceção.
    """
    if not mal_manga_id:
        return False
    try:
        resposta = requests.delete(
            _MAL_MANGA_STATUS_URL.format(mal_id=mal_manga_id), headers=MALAuth().auth_header(), timeout=15
        )
        if resposta.status_code in (200, 404):
            return True
        logger.warning("MAL manga push: status %d ao remover mal_id=%d", resposta.status_code, mal_manga_id)
        return False
    except Exception as exc:
        logger.error("MAL manga push: erro ao remover mal_id=%d: %s", mal_manga_id, exc)
        return False
