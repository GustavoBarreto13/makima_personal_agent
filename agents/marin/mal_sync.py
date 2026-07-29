"""Sincronização delta MAL → catálogo local de animes — agente Marin.

Este módulo busca a lista de animes do usuário no MyAnimeList (API v2) e
atualiza o banco de dados PostgreSQL local (tabela `anime`).

Estratégia delta:
    A API do MAL ordena a lista por `list_updated_at` DESC. O sync para de
    processar entradas quando encontra `updated_at <= last_sync_at` — assim
    apenas os animes alterados desde o último sync são processados, reduzindo
    chamadas à API e tempo de execução.

Uso típico:
    sync_mal()           # delta — só o que mudou desde o último sync
    sync_mal(full=True)  # processa toda a lista (ignorando last_sync_at)

Usage:
    from agents.marin.mal_sync import sync_mal
"""

import logging        # Registra erros e progresso do sync
import re             # Remove pontuação na normalização de strings (busca fuzzy)
import time           # Delay entre retries em caso de rate limit
import unicodedata    # Remove acentos na normalização fuzzy de títulos
import uuid           # Gera IDs únicos para novos animes inseridos no banco
from datetime import date, datetime, timezone  # Controle de timestamps e comparação de datas
from zoneinfo import ZoneInfo  # Fuso horário local para datas de fallback (spec 053)

import requests       # Chamadas HTTP à API do MAL

# Autenticação OAuth2 do MAL (access_token automático com refresh)
from agents.marin.mal_auth import MALAuth

# Enriquecimento de metadados (Jikan+AniList+ARM+TMDB) — usado ao importar
# um anime novo vindo do pull, para não deixá-lo "pelado" no catálogo (spec 053, FR-007).
from agents.marin.metadata import enrich_anime as _enrich_meta

# Helpers PostgreSQL compartilhados entre os agentes
from agents.db import get_conn, run_select, run_dml

# Fuso horário do usuário — usado como fallback quando o MAL não informa uma
# data explícita (finish_date/updated_at) para uma sessão de ajuste.
_TZ = ZoneInfo("America/Sao_Paulo")


# ─────────────────────────────────────────────────────────────────────────────
# LOGGER
# ─────────────────────────────────────────────────────────────────────────────

# Logger nomeado para filtrar mensagens de sync nas logs do container
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

# Endpoint da API v2 do MAL para obter a animelist do usuário autenticado.
# @me = usuário dono do access_token (não precisa informar o username).
_MAL_ANIMELIST_URL = "https://api.myanimelist.net/v2/users/@me/animelist"

# Número máximo de entradas por página na API do MAL.
# O MAL aceita até 1000, mas 100 é seguro e evita respostas muito grandes.
_MAL_PAGE_LIMIT = 100

# Mapeamento dos status do MAL para os status usados no banco local.
# O MAL usa inglês (snake_case); o banco usa português para consistência
# com os outros agentes (frieren, akane).
_MAL_STATUS_MAP: dict[str, str] = {
    "watching":      "assistindo",    # Assistindo atualmente
    "completed":     "completo",       # Terminou de assistir
    "on_hold":       "pausado",        # Pausado temporariamente
    "dropped":       "abandonado",     # Desistiu do anime
    "plan_to_watch": "quero_assistir", # Pretende assistir no futuro
}

# Mapeamento inverso (push local → MAL, spec 053 FR-009) — bijetivo por construção,
# já que _MAL_STATUS_MAP não tem valores duplicados.
_LOCAL_STATUS_TO_MAL: dict[str, str] = {v: k for k, v in _MAL_STATUS_MAP.items()}

# Endpoint da API v2 do MAL para ler/gravar o list_status de UM anime específico
# (diferente de _MAL_ANIMELIST_URL, que lista a coleção inteira).
_MAL_LIST_STATUS_URL = "https://api.myanimelist.net/v2/anime/{mal_id}/my_list_status"

# Número máximo de tentativas em caso de erro HTTP 429 (rate limit) ou 5xx
_MAX_RETRIES = 3

# Delay base em segundos para backoff exponencial entre retries
_RETRY_BASE_DELAY_SECONDS = 2


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — normalização e HTTP
# ─────────────────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Normaliza string para comparação fuzzy (lower, sem acentos, sem pontuação).

    Usado para preencher o campo `normalizado` na tabela `anime`, que permite
    buscar por título sem depender de capitalização ou acentuação.

    Args:
        s: String original (pode ter acentos, maiúsculas, pontuação).

    Returns:
        String normalizada — minúscula, sem acentos, sem pontuação, sem espaços
        no início/fim.

    Example:
        >>> _norm("Oshi no Ko")
        'oshi no ko'
        >>> _norm("Frieren: Beyond Journey's End")
        'frieren beyond journeys end'
    """
    # Converte para minúsculas antes de normalizar acentos
    s = s.lower()

    # NFD (Decomposição de Compatibilidade de Normalização) separa cada caractere
    # acentuado em dois: a letra base + o acento (combining mark).
    # Ex.: 'ã' → 'a' + '̃' (til combinante)
    s = unicodedata.normalize("NFD", s)

    # Remove os acentos (combining marks — categoria "Mn" = Mark, Nonspacing)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")

    # Remove pontuação, mantendo apenas letras, números e espaços
    s = re.sub(r"[^\w\s]", "", s)

    # Remove espaços no início e fim
    return s.strip()


def _mal_get(
    url: str,
    auth: MALAuth,
    params: dict | None = None,
) -> dict | None:
    """Executa GET autenticado na MAL API com retry em caso de erros temporários.

    Usa o header Bearer do MALAuth (que renova o token automaticamente se
    necessário). Retry com backoff exponencial em caso de 429 (rate limit)
    ou erros 5xx (servidor temporariamente indisponível).

    Args:
        url: URL completa do endpoint MAL (ex.: _MAL_ANIMELIST_URL).
        auth: Instância de MALAuth para gerar o header de autorização.
        params: Parâmetros de query string (ex.: {"limit": 100, "nsfw": "true"}).

    Returns:
        Dicionário com o corpo da resposta JSON, ou None em caso de erro
        persistente após todas as tentativas (não levanta exceção — o sync
        pode continuar com os dados já obtidos).
    """
    # Headers necessários para autenticar na API v2 do MAL
    headers = auth.auth_header()

    for tentativa in range(1, _MAX_RETRIES + 1):
        try:
            resposta = requests.get(
                url,
                headers=headers,
                params=params or {},
                timeout=15,  # Timeout para evitar travamento indefinido
            )

            if resposta.status_code == 200:
                # Sucesso — retorna o JSON parseado
                return resposta.json()

            elif resposta.status_code == 429:
                # Rate limit atingido — aguarda e tenta novamente
                delay = _RETRY_BASE_DELAY_SECONDS ** tentativa
                logger.warning(
                    "MAL API rate limit (tentativa %d/%d). Aguardando %ds...",
                    tentativa, _MAX_RETRIES, delay
                )
                time.sleep(delay)

            elif resposta.status_code >= 500:
                # Erro de servidor do MAL — pode ser temporário
                delay = _RETRY_BASE_DELAY_SECONDS ** tentativa
                logger.warning(
                    "MAL API erro %d (tentativa %d/%d). Aguardando %ds...",
                    resposta.status_code, tentativa, _MAX_RETRIES, delay
                )
                time.sleep(delay)

            else:
                # Erro 4xx (ex.: 401 Unauthorized, 404 Not Found) — não é temporário
                logger.error(
                    "MAL API erro permanente %d em %s",
                    resposta.status_code, url
                )
                return None

        except requests.RequestException as exc:
            # Erro de rede (timeout, DNS, conexão recusada)
            delay = _RETRY_BASE_DELAY_SECONDS ** tentativa
            logger.warning(
                "MAL API erro de rede (tentativa %d/%d): %s. Aguardando %ds...",
                tentativa, _MAX_RETRIES, exc, delay
            )
            if tentativa < _MAX_RETRIES:
                time.sleep(delay)

    # Esgotou todas as tentativas sem sucesso
    logger.error("MAL API: todas as %d tentativas falharam para %s", _MAX_RETRIES, url)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — banco de dados
# ─────────────────────────────────────────────────────────────────────────────

def _parse_mal_datetime(updated_at_str: str, mal_id: int) -> datetime:
    """Converte o `updated_at` (ISO 8601) de uma entry MAL para datetime aware.

    Args:
        updated_at_str: String ISO 8601 do campo `updated_at` da entry MAL.
        mal_id: Usado só para a mensagem de log em caso de formato inválido.

    Returns:
        Datetime com timezone UTC (fallback: momento atual, se o formato vier
        inesperado da API).
    """
    try:
        return datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        logger.warning(
            "MAL sync: updated_at inválido '%s' para mal_id=%d. Usando NOW().",
            updated_at_str, mal_id
        )
        return datetime.now(timezone.utc)


def _parse_mal_date(date_str: str | None) -> date | None:
    """Converte um `finish_date` (formato 'YYYY-MM-DD') do MAL para `date`.

    Args:
        date_str: String de data simples do MAL, ou None/vazia.

    Returns:
        `date` correspondente, ou None se ausente/inválida.
    """
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None


def _insert_enriched_anime(
    mal_id: int,
    title_fallback: str,
    status_banco: str,
    episodes_watched: int,
    score_final: float | None,
    mal_updated_at: datetime,
    finish_date: date | None,
) -> str:
    """Insere um anime novo vindo do pull, já enriquecido (spec 053, FR-007).

    Mesma forma de INSERT que `tools.add_anime`, mas com o progresso/nota/status
    que já vêm do MAL (em vez dos defaults de um anime recém-adicionado
    manualmente). Se `episodes_watched > 0`, também cria uma sessão de ajuste
    no diário cobrindo os episódios já assistidos — sem isso, `episodes_watched`
    ficaria "solto" (SC-006 exige que o contador seja sempre derivável das
    sessões).

    Args:
        mal_id: ID do anime no MyAnimeList.
        title_fallback: Título vindo da própria entry MAL (usado se o
            enriquecimento falhar ou não achar título).
        status_banco: Status já convertido para o padrão local.
        episodes_watched: Progresso já assistido, conforme o MAL.
        score_final: Nota já convertida (None = sem nota).
        mal_updated_at: Timestamp do MAL para este list_status.
        finish_date: Data de término no MAL, se o anime já estiver completo.

    Returns:
        'created' (sempre — falhas de enriquecimento não impedem a criação).
    """
    # Busca metadados completos — falha graciosamente (anime entra com o mínimo)
    try:
        meta = _enrich_meta(mal_id)
    except Exception as exc:
        logger.error("MAL sync: falha ao enriquecer mal_id=%d: %s", mal_id, exc)
        meta = {}

    titulo = meta.get("title") or title_fallback
    anime_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    overview = meta.get("overview")
    if overview:
        overview = overview[:2000] or None

    episodes_total = meta.get("episodes_total")

    run_dml(
        """
        INSERT INTO anime (
            id, mal_id, anilist_id, tmdb_id,
            title, title_english, title_japanese, normalizado,
            media_type, season, studio, episodes_total,
            airing_status, status, episodes_watched, score,
            overview, genres, poster_url, banner_url,
            source, mal_updated_at, date_finished, created_at, updated_at
        ) VALUES (
            %(id)s, %(mal_id)s, %(anilist_id)s, %(tmdb_id)s,
            %(title)s, %(title_english)s, %(title_japanese)s, %(normalizado)s,
            %(media_type)s, %(season)s, %(studio)s, %(episodes_total)s,
            %(airing_status)s, %(status)s, %(episodes_watched)s, %(score)s,
            %(overview)s, %(genres)s, %(poster_url)s, %(banner_url)s,
            'mal_sync', %(mal_updated_at)s, %(date_finished)s, %(now)s, %(now)s
        )
        ON CONFLICT DO NOTHING
        """,
        {
            "id":               anime_id,
            "mal_id":           mal_id,
            "anilist_id":       meta.get("anilist_id"),
            "tmdb_id":          meta.get("tmdb_id"),
            "title":            titulo,
            "title_english":    meta.get("title_english"),
            "title_japanese":   meta.get("title_japanese"),
            "normalizado":      _norm(titulo),
            "media_type":       meta.get("media_type"),
            "season":           meta.get("season"),
            "studio":           meta.get("studio"),
            "episodes_total":   episodes_total,
            "airing_status":    meta.get("airing_status"),
            "status":           status_banco,
            "episodes_watched": episodes_watched,
            "score":            score_final,
            "overview":         overview,
            "genres":           meta.get("genres") or [],
            "poster_url":       meta.get("poster_url"),
            "banner_url":       meta.get("banner_url"),
            "mal_updated_at":   mal_updated_at,
            "date_finished":    finish_date if status_banco == "completo" else None,
            "now":              now,
        },
    )

    # Popula episódios em cache + marca como assistidos os já cobertos pelo MAL
    episodios = meta.get("jikan_episodes") or []
    if episodios:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for ep in episodios:
                    numero = ep.get("number")
                    if not numero:
                        continue
                    synopsis = ep.get("synopsis")
                    if synopsis:
                        synopsis = synopsis[:2000] or None
                    watched_flag = numero <= episodes_watched
                    cur.execute(
                        """
                        INSERT INTO episodes (
                            id, anime_id, number, title, aired,
                            synopsis, thumbnail_url, airing_status, watched, watched_date
                        ) VALUES (
                            %(id)s, %(anime_id)s, %(number)s, %(title)s, %(aired)s,
                            %(synopsis)s, %(thumbnail_url)s, %(airing_status)s, %(watched)s, %(wd)s
                        )
                        ON CONFLICT (anime_id, number) DO UPDATE
                            SET title         = EXCLUDED.title,
                                aired         = EXCLUDED.aired,
                                synopsis      = EXCLUDED.synopsis,
                                thumbnail_url = EXCLUDED.thumbnail_url,
                                airing_status = EXCLUDED.airing_status
                        """,
                        {
                            "id":            str(uuid.uuid4()),
                            "anime_id":      anime_id,
                            "number":        numero,
                            "title":         ep.get("title"),
                            "aired":         ep.get("aired"),
                            "synopsis":      synopsis,
                            "thumbnail_url": ep.get("thumbnail_url"),
                            "airing_status": ep.get("airing_status") or "agendado",
                            "watched":       watched_flag,
                            "wd":            finish_date if watched_flag else None,
                        },
                    )

    # Sessão de ajuste cobrindo o progresso já existente no MAL (SC-006)
    if episodes_watched > 0:
        watch_date = finish_date or mal_updated_at.astimezone(_TZ).date()
        run_dml(
            """
            INSERT INTO watch_logs (
                id, anime_id, anime_title, watched_date,
                ep_start, ep_end, episodes_count, source, created_at
            ) VALUES (
                %(id)s, %(anime_id)s, %(title)s, %(wd)s,
                1, %(ep_end)s, %(ep_count)s, 'mal_sync', %(now)s
            )
            """,
            {
                "id":       str(uuid.uuid4()),
                "anime_id": anime_id,
                "title":    titulo,
                "wd":       watch_date,
                "ep_end":   episodes_watched,
                "ep_count": episodes_watched,
                "now":      now,
            },
        )
        run_dml(
            "UPDATE anime SET date_started = %(wd)s WHERE id = %(id)s AND date_started IS NULL",
            {"wd": watch_date, "id": anime_id},
        )

    return "created"


def _upsert_mal_entry(
    mal_id: int,
    title: str,
    status_mal: str,
    episodes_watched: int,
    score: float,
    updated_at_str: str,
    finish_date_str: str | None = None,
) -> str:
    """Insere ou atualiza uma entrada MAL no catálogo local de animes.

    Se o anime já existe (identificado por `mal_id`), converge o progresso
    para uma sessão de ajuste no diário (nunca mais sobrescreve
    `episodes_watched` direto — spec 053, FR-002) e resolve divergências de
    status/nota por timestamp mais recente conhecido (FR-004). Se não existe,
    cria um novo registro já enriquecido (FR-007).

    Anti-eco (FR-003): esta função nunca chama as tools públicas de mutação
    local (`log_watch`, `update_anime_status`, `rate_anime`) — só elas
    disparam push para o MAL. Como o pull só grava o que já difere do estado
    local, um ciclo sem mudanças novas não escreve nada (idempotente).

    Args:
        mal_id: ID único do anime no MyAnimeList.
        title: Título do anime conforme retornado pela API do MAL.
        status_mal: Status na lista MAL em inglês (ex.: "watching", "completed").
        episodes_watched: Número de episódios assistidos até o momento, no MAL.
        score: Nota do usuário de 0 a 10. Score 0 = sem avaliação (vira NULL).
        updated_at_str: String ISO 8601 do campo `updated_at` da entry MAL.
        finish_date_str: Data de término no MAL ('YYYY-MM-DD'), se disponível.

    Returns:
        String indicando o resultado: 'created' | 'updated' | 'skipped'.
    """
    status_banco = _MAL_STATUS_MAP.get(status_mal, "quero_assistir")
    score_final: float | None = score if score and score > 0 else None
    mal_updated_at = _parse_mal_datetime(updated_at_str, mal_id)
    finish_date = _parse_mal_date(finish_date_str)

    # ── Anime já existe? ──────────────────────────────────────────────────────
    rows = run_select(
        "SELECT * FROM anime WHERE mal_id = %(mal_id)s AND deleted = FALSE",
        {"mal_id": mal_id},
    )

    if not rows:
        # Edge case: se existir um registro SOFT-DELETADO com esse mal_id, o
        # pull NÃO ressuscita (decisão documentada no plan.md) — só ignora.
        deleted_rows = run_select(
            "SELECT id FROM anime WHERE mal_id = %(mal_id)s AND deleted = TRUE",
            {"mal_id": mal_id},
        )
        if deleted_rows:
            logger.info(
                "MAL sync: mal_id=%d foi excluído localmente — pull não ressuscita.",
                mal_id,
            )
            return "skipped"

        return _insert_enriched_anime(
            mal_id, title, status_banco, episodes_watched, score_final,
            mal_updated_at, finish_date,
        )

    # ── Anime existe — converge ───────────────────────────────────────────────
    anime = rows[0]
    anime_id = anime["id"]
    local_progress = int(anime.get("episodes_watched") or 0)
    mal_progress = int(episodes_watched or 0)
    episodes_total = anime.get("episodes_total")
    local_status = anime.get("status")
    local_score = float(anime["score"]) if anime.get("score") is not None else None
    local_updated_at = anime.get("local_updated_at")

    changed = False

    with get_conn() as conn:
        with conn.cursor() as cur:
            # ── 1. Progresso: "maior progresso vence" (Assumptions do spec) ──
            # Se o MAL está atrás do local, o pull não mexe em nada — o próprio
            # push (disparado pela mutação local) vai levar o MAL a convergir.
            if mal_progress > local_progress:
                ep_start = local_progress + 1
                ep_end = mal_progress
                # Anime completo no MAL com episodes_total conhecido: cobre até
                # o total real, não só o num_episodes_watched (que o MAL às
                # vezes deixa desatualizado para séries finalizadas) — FR-005.
                if status_banco == "completo" and episodes_total and ep_end < episodes_total:
                    ep_end = episodes_total

                watch_date = finish_date or mal_updated_at.astimezone(_TZ).date()

                cur.execute(
                    """
                    INSERT INTO watch_logs (
                        id, anime_id, anime_title, watched_date,
                        ep_start, ep_end, episodes_count, source, created_at
                    ) VALUES (
                        %(id)s, %(anime_id)s, %(title)s, %(wd)s,
                        %(es)s, %(ee)s, %(ec)s, 'mal_sync', NOW()
                    )
                    """,
                    {
                        "id": str(uuid.uuid4()), "anime_id": anime_id, "title": title,
                        "wd": watch_date, "es": ep_start, "ee": ep_end,
                        "ec": ep_end - ep_start + 1,
                    },
                )
                cur.execute(
                    """
                    UPDATE episodes
                    SET watched = TRUE, watched_date = %(wd)s
                    WHERE anime_id = %(anime_id)s
                      AND number BETWEEN %(es)s AND %(ee)s
                      AND watched = FALSE
                    """,
                    {"anime_id": anime_id, "es": ep_start, "ee": ep_end, "wd": watch_date},
                )
                # episodes_watched sempre derivado da soma das sessões (nunca gravado direto)
                cur.execute(
                    """
                    UPDATE anime
                    SET episodes_watched = (
                            SELECT COALESCE(SUM(episodes_count), 0)
                            FROM watch_logs
                            WHERE anime_id = %(id)s AND episodes_count IS NOT NULL
                        ),
                        date_started = COALESCE(date_started, %(wd)s),
                        updated_at = NOW()
                    WHERE id = %(id)s
                    """,
                    {"id": anime_id, "wd": watch_date},
                )
                changed = True

            # ── 2. Status/nota: convergência determinística (FR-004) ─────────
            # O MAL só "vence" quando seu timestamp é mais recente que a última
            # mutação local conhecida (ou quando nunca houve mutação local
            # registrada) — senão, o valor local já é o mais novo e o próximo
            # push (das tools) é quem propaga para o MAL, não o pull.
            mal_wins = local_updated_at is None or mal_updated_at > local_updated_at

            sets: list[str] = []
            params: dict = {"id": anime_id}
            if mal_wins and status_banco != local_status:
                sets.append("status = %(status)s")
                params["status"] = status_banco
            if mal_wins and score_final != local_score:
                sets.append("score = %(score)s")
                params["score"] = score_final
            if sets:
                cur.execute(
                    f"UPDATE anime SET {', '.join(sets)}, updated_at = NOW() WHERE id = %(id)s",
                    params,
                )
                changed = True

            # ── 3. Completo no MAL → completo local (FR-005) ──────────────────
            if status_banco == "completo":
                cur.execute(
                    """
                    UPDATE anime
                    SET date_finished = COALESCE(date_finished, %(fd)s)
                    WHERE id = %(id)s AND status = 'completo'
                    """,
                    {"fd": finish_date or mal_updated_at.astimezone(_TZ).date(), "id": anime_id},
                )

            # ── 4. Sempre grava o carimbo de última mudança conhecida no MAL ──
            if anime.get("mal_updated_at") != mal_updated_at:
                cur.execute(
                    "UPDATE anime SET mal_updated_at = %(t)s WHERE id = %(id)s",
                    {"t": mal_updated_at, "id": anime_id},
                )

    return "updated" if changed else "skipped"


def _get_last_sync_at() -> datetime | None:
    """Lê o timestamp do último sync bem-sucedido da tabela mal_sync_state.

    Returns:
        Datetime com timezone do último sync, ou None se nunca sincronizou
        (first run) ou se a coluna for NULL.
    """
    linhas = run_select(
        "SELECT last_sync_at FROM mal_sync_state WHERE id = 1"
    )

    if not linhas:
        return None  # Linha singleton não existe ainda

    # last_sync_at pode ser None (NULL no banco) — é None no primeiro sync
    return linhas[0].get("last_sync_at")


def _update_last_sync_at(run_start: datetime) -> None:
    """Atualiza o campo last_sync_at com o timestamp de início do sync.

    Usa o timestamp de INÍCIO (não fim) para garantir que entradas MAL
    modificadas DURANTE o sync sejam reprocessadas no próximo ciclo —
    evitamos janela cega de mudanças feitas enquanto o sync estava rodando.

    Args:
        run_start: Datetime (UTC) de quando o sync começou.
    """
    run_dml(
        """
        UPDATE mal_sync_state
        SET last_sync_at = %(run_start)s,
            updated_at   = NOW()
        WHERE id = 1
        """,
        {"run_start": run_start}
    )

    logger.debug("MAL sync: last_sync_at atualizado para %s", run_start.isoformat())


# ─────────────────────────────────────────────────────────────────────────────
# PUSH — local → MAL (spec 053, FR-001)
# ─────────────────────────────────────────────────────────────────────────────

def push_list_status(
    mal_id: int | None,
    status: str | None = None,
    score: float | None = None,
    num_watched_episodes: int | None = None,
) -> bool:
    """Propaga uma mudança local para a lista do usuário no MAL (best-effort).

    Chamada pelas tools públicas de mutação local (`tools.py`) depois que a
    alteração já foi confirmada no banco — nunca bloqueia nem desfaz a
    operação local em caso de falha (FR-001). Envia só os campos informados
    (`None` = não mexer naquele campo do list_status no MAL).

    Conversão de escala (FR-008): a nota local (0–10, passo 0.5) é
    arredondada para o inteiro mais próximo antes de enviar — a escala do MAL
    é inteira. `score=0` remove a avaliação (mesma semântica local e MAL).

    Args:
        mal_id: ID do anime no MyAnimeList. Se None/0, não faz nada (anime
            sem vínculo com o MAL — US1 cenário 5).
        status: Novo status local (será convertido via `_LOCAL_STATUS_TO_MAL`).
        score: Nova nota local (0–10, passo 0.5; None = não mexer na nota).
        num_watched_episodes: Novo total de episódios assistidos.

    Returns:
        True se a chamada foi aceita pelo MAL (HTTP 200), False em qualquer
        outro caso (sem vínculo, token inválido, rede fora, erro do MAL) —
        nunca levanta exceção.
    """
    if not mal_id:
        return False

    body: dict[str, str] = {}
    if status is not None:
        mal_status = _LOCAL_STATUS_TO_MAL.get(status)
        if mal_status:
            body["status"] = mal_status
    if score is not None:
        body["score"] = str(int(round(score)))
    if num_watched_episodes is not None:
        body["num_watched_episodes"] = str(num_watched_episodes)

    if not body:
        return True  # Nada para enviar — não é uma falha

    try:
        auth = MALAuth()
        headers = auth.auth_header()
        resposta = requests.patch(
            _MAL_LIST_STATUS_URL.format(mal_id=mal_id),
            headers=headers,
            data=body,  # form-encoded — mesmo formato exigido pela API v2 do MAL
            timeout=15,
        )
        if resposta.status_code == 200:
            return True
        logger.warning(
            "MAL push: status %d ao atualizar mal_id=%d (%s)",
            resposta.status_code, mal_id, resposta.text[:200],
        )
        return False
    except Exception as exc:
        # Qualquer falha (rede, token, etc.) é best-effort — nunca propaga.
        logger.error("MAL push: erro ao atualizar mal_id=%d: %s", mal_id, exc)
        return False


def push_delete(mal_id: int | None) -> bool:
    """Remove o anime da lista do usuário no MAL (best-effort).

    Usada por `tools.delete_anime` — o soft-delete local acontece sempre,
    independente do resultado desta chamada.

    Args:
        mal_id: ID do anime no MyAnimeList. Se None/0, não faz nada.

    Returns:
        True se removido (ou já ausente — 404 conta como sucesso), False em
        qualquer outra falha. Nunca levanta exceção.
    """
    if not mal_id:
        return False
    try:
        auth = MALAuth()
        headers = auth.auth_header()
        resposta = requests.delete(
            _MAL_LIST_STATUS_URL.format(mal_id=mal_id),
            headers=headers,
            timeout=15,
        )
        if resposta.status_code in (200, 404):
            return True
        logger.warning("MAL push: status %d ao remover mal_id=%d", resposta.status_code, mal_id)
        return False
    except Exception as exc:
        logger.error("MAL push: erro ao remover mal_id=%d: %s", mal_id, exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÃO PÚBLICA PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def sync_mal(full: bool = False) -> dict:
    """Sincroniza a lista do MyAnimeList com o catálogo local de animes.

    Por padrão faz delta sync: só processa entradas com `updated_at > last_sync_at`.
    Com `full=True`, processa toda a lista independente do last_sync_at.

    A lista da API MAL é ordenada por `list_updated_at` DESC (mais recente
    primeiro). O delta sync para de iterar quando encontra uma entrada com
    `updated_at <= last_sync_at`, pois todas as entradas seguintes são mais
    antigas e não precisam ser reprocessadas.

    Args:
        full: Se True, ignora last_sync_at e processa toda a lista.
            Útil para o primeiro sync ou para corrigir inconsistências.

    Returns:
        Dicionário com métricas do sync:
            - ok: True se o sync completou sem erros críticos.
            - full: Se foi um full sync (True) ou delta (False).
            - timestamp: ISO 8601 de quando o sync rodou.
            - mal_entries_fetched: Total de entradas MAL processadas.
            - updated: Animes atualizados no banco.
            - created: Animes novos inseridos no banco.
            - skipped: Entradas sem alteração no banco.
            - errors: Lista de dicts com mal_id e msg de erros não fatais.

    Example:
        >>> resultado = sync_mal()
        >>> # {"ok": True, "full": False, "updated": 3, "created": 0, ...}
    """
    # Registra o INÍCIO do sync ANTES de qualquer chamada à API.
    # Isso garante que entradas modificadas DURANTE o sync sejam capturadas
    # no próximo ciclo (usamos run_start, não agora-no-final, como referência).
    run_start = datetime.now(timezone.utc)

    logger.info(
        "MAL sync: iniciando %s sync em %s",
        "full" if full else "delta",
        run_start.isoformat()
    )

    # Carrega o timestamp do último sync para usar como ponto de corte no delta
    last_sync_at = _get_last_sync_at() if not full else None

    if last_sync_at:
        logger.info("MAL sync: delta desde %s", last_sync_at.isoformat())
    else:
        logger.info("MAL sync: sem last_sync_at — processando toda a lista")

    # Cria a instância de autenticação (carrega tokens do banco automaticamente)
    auth = MALAuth()

    # Métricas acumuladas ao longo do sync
    total_fetched = 0  # Entradas MAL processadas (incluindo as paradas pelo delta)
    total_updated = 0  # Animes atualizados no banco
    total_created = 0  # Animes novos inseridos no banco
    total_skipped = 0  # Entradas que não alteraram nada no banco
    erros: list[dict] = []  # Erros não fatais (uma entrada ruim não para o sync)

    # Flag de controle do loop de paginação
    continuar = True

    # URL inicial — as próximas páginas virão no campo `paging.next` da resposta
    url_proxima = _MAL_ANIMELIST_URL

    # Parâmetros do primeiro request — nos requests seguintes, usamos a URL
    # completa de `paging.next` que já inclui os parâmetros necessários
    params_iniciais: dict = {
        # Campos extras do list_status que queremos na resposta.
        # finish_date (spec 053, FR-005): data real de término no MAL, usada na
        # sessão de ajuste quando o anime chega/vira 'completed'.
        "fields": "list_status{score,num_episodes_watched,status,updated_at,finish_date}",
        "nsfw":   "true",     # Inclui conteúdo adulto (lista pessoal completa)
        "limit":  _MAL_PAGE_LIMIT,
        "sort":   "list_updated_at",  # Mais recente primeiro — essencial para o delta
    }

    # Controla se é a primeira página (precisa dos params_iniciais) ou paginação
    primeira_pagina = True

    # ── Loop de paginação ────────────────────────────────────────────────────
    while continuar and url_proxima:
        # Primeira página usa os parâmetros definidos acima;
        # páginas seguintes usam a URL completa da API (sem params adicionais)
        if primeira_pagina:
            resposta = _mal_get(url_proxima, auth, params=params_iniciais)
            primeira_pagina = False
        else:
            # A URL de paginação já inclui todos os parâmetros necessários
            resposta = _mal_get(url_proxima, auth, params=None)

        if resposta is None:
            # Falha na chamada à API (já logado em _mal_get)
            # Registra como erro e para o loop — não queremos perder o last_sync_at
            logger.error("MAL sync: falha ao buscar página. Interrompendo sync.")
            continuar = False
            break

        # Extrai as entradas da resposta (campo "data" é uma lista de animes)
        entradas: list[dict] = resposta.get("data", [])

        if not entradas:
            # Página vazia — fim da lista
            logger.debug("MAL sync: página vazia — fim da lista MAL")
            break

        # ── Processa cada entrada da página ──────────────────────────────────
        for entrada in entradas:
            total_fetched += 1

            try:
                # Extrai os campos de identificação do anime
                node = entrada.get("node", {})
                mal_id: int = node.get("id", 0)
                title: str  = node.get("title", f"anime_{mal_id}")

                # Extrai os campos do status na lista do usuário
                list_status = entrada.get("list_status", {})
                status_mal: str   = list_status.get("status", "plan_to_watch")
                episodes: int     = list_status.get("num_episodes_watched", 0)
                score: float      = float(list_status.get("score", 0) or 0)
                updated_at_str: str = list_status.get("updated_at", "")
                finish_date_str: str | None = list_status.get("finish_date")

                # ── Verificação delta: para quando encontra entrada não modificada ──
                if last_sync_at and updated_at_str:
                    try:
                        # Converte o updated_at da entrada para datetime comparável
                        entry_updated_at = datetime.fromisoformat(
                            updated_at_str.replace("Z", "+00:00")
                        )

                        # A lista está ordenada por updated_at DESC.
                        # Quando a entrada atual é mais antiga que o last_sync_at,
                        # todas as seguintes também serão — podemos parar.
                        if entry_updated_at <= last_sync_at:
                            logger.debug(
                                "MAL sync: delta atingiu entrada não modificada "
                                "(mal_id=%d, updated_at=%s <= last_sync=%s). Parando.",
                                mal_id, updated_at_str, last_sync_at.isoformat()
                            )
                            continuar = False
                            break  # Sai do for — o while também vai parar (continuar=False)

                    except ValueError:
                        # Se o updated_at for inválido, processa a entrada mesmo assim
                        logger.warning(
                            "MAL sync: updated_at inválido '%s' para mal_id=%d. "
                            "Processando mesmo assim.",
                            updated_at_str, mal_id
                        )

                # Mal_id 0 indica dado inválido da API — pula
                if not mal_id:
                    logger.warning("MAL sync: entrada sem mal_id válido — pulando")
                    total_skipped += 1
                    continue

                # ── Upsert no banco ──────────────────────────────────────────
                resultado = _upsert_mal_entry(
                    mal_id=mal_id,
                    title=title,
                    status_mal=status_mal,
                    episodes_watched=episodes,
                    score=score,
                    updated_at_str=updated_at_str,
                    finish_date_str=finish_date_str,
                )

                # Acumula as métricas de acordo com o resultado do upsert
                if resultado == "created":
                    total_created += 1
                    logger.debug("MAL sync: novo anime criado — mal_id=%d '%s'", mal_id, title)
                elif resultado == "updated":
                    total_updated += 1
                    logger.debug("MAL sync: anime atualizado — mal_id=%d '%s'", mal_id, title)
                else:
                    # 'skipped' — nenhuma linha afetada (ex.: anime com deleted=TRUE)
                    total_skipped += 1

            except Exception as exc:
                # Erro em uma entrada específica não deve parar o sync inteiro.
                # Registra o erro e continua com as próximas entradas.
                mal_id_erro = entrada.get("node", {}).get("id", "?")
                logger.error(
                    "MAL sync: erro ao processar mal_id=%s: %s",
                    mal_id_erro, exc,
                    exc_info=True
                )
                erros.append({
                    "mal_id": mal_id_erro,
                    "msg":    str(exc),
                })
                total_skipped += 1  # Conta como skipped para não distorcer métricas

        # ── Paginação: busca a URL da próxima página ──────────────────────────
        if continuar:
            # O campo `paging.next` contém a URL completa da próxima página,
            # ou está ausente quando chegamos na última página
            paging = resposta.get("paging", {})
            url_proxima = paging.get("next")  # None quando não há próxima página

            if url_proxima:
                logger.debug("MAL sync: buscando próxima página...")
            else:
                logger.debug("MAL sync: última página atingida")

    # ── Atualiza last_sync_at no banco ───────────────────────────────────────
    # Usa run_start (momento de início do sync), não agora, para garantir que
    # mudanças feitas no MAL DURANTE o sync sejam capturadas no próximo ciclo.
    try:
        _update_last_sync_at(run_start)
    except Exception as exc:
        # Falha ao atualizar last_sync_at é um erro de banco — registra mas não falha o sync
        logger.error("MAL sync: falha ao atualizar last_sync_at: %s", exc)
        erros.append({"mal_id": None, "msg": f"last_sync_at não atualizado: {exc}"})

    # ── Resultado final ───────────────────────────────────────────────────────
    resultado_final = {
        "ok":                 True,            # Sync completou (mesmo com erros individuais)
        "full":               full,            # True se foi full sync
        "timestamp":          run_start.isoformat(),  # Quando o sync iniciou
        "mal_entries_fetched": total_fetched,  # Total de entradas processadas da API
        "updated":            total_updated,   # Animes atualizados no banco
        "created":            total_created,   # Animes novos criados
        "skipped":            total_skipped,   # Entradas sem alteração ou com erro
        "errors":             erros,           # Erros individuais (lista de dicts)
    }

    logger.info(
        "MAL sync: concluído — %d buscados, %d atualizados, %d criados, "
        "%d pulados, %d erros",
        total_fetched, total_updated, total_created, total_skipped, len(erros)
    )

    return resultado_final
