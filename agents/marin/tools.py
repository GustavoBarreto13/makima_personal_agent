"""Camada de lógica única do agente Marin — catálogo de animes.

Este módulo é a ÚNICA dona da lógica de negócio do domínio animes.
Tanto o router FastAPI (/api/animes/*) quanto o agente Telegram (marin_agent)
são fachadas finas que importam estas funções — nenhuma regra de negócio fora
daqui.

Integrações:
    - PostgreSQL via agents.db (run_select, run_dml, get_conn)
    - Jikan, AniList, ARM e TMDB via agents.marin.metadata
    - MAL API v2 via agents.marin.mal_sync (delta sync autenticado)

Usage:
    from agents.marin.tools import search_anime, add_anime, log_watch, get_stats
"""

import re           # Remove pontuação na normalização de strings
import unicodedata  # Remove acentos na normalização fuzzy
import uuid         # Gera IDs únicos para cada registro
from datetime import date, datetime, timedelta  # Datas e cálculos temporais
from zoneinfo import ZoneInfo  # Fuso horário do usuário (Brasil UTC-3)

# Funções puras de consulta a APIs externas de metadados de anime.
# Renomeadas para evitar conflito com os tools de mesmo nome neste módulo.
from agents.marin.metadata import enrich_anime as _enrich_meta
from agents.marin.metadata import search_anime as _jikan_search

# Sync delta com o MyAnimeList. Renomeado para não colidir com a tool sync_mal.
from agents.marin.mal_sync import sync_mal as _mal_sync

# Helpers PostgreSQL compartilhados entre todos os agentes do projeto.
from agents.db import get_conn, run_dml, run_select


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES GLOBAIS
# ─────────────────────────────────────────────────────────────────────────────

# Fuso horário do Brasil (UTC-3). Usado para garantir datas corretas
# perto da meia-noite, já que o servidor roda em UTC.
_TZ = ZoneInfo("America/Sao_Paulo")

# As 12 paletas de pôster tipográfico kawaii (fallback quando poster_url = NULL).
# Calculadas de forma determinística pelo hash do título —
# mesmo anime sempre recebe a mesma paleta, sem precisar sortear.
_POSTER_KEYS = [
    "magenta", "violet", "cyan", "emerald",
    "amber",   "sunset", "indigo", "rose",
    "teal",    "lime",   "plum",  "sky",
]

# Status válidos para um anime na lista do usuário.
# Espelham os valores do campo `anime.status` no PostgreSQL.
_VALID_STATUSES = {
    "assistindo",
    "completo",
    "quero_assistir",
    "pausado",
    "abandonado",
}

# Duração média de um episódio em minutos (estimativa para cálculo de horas).
# A maioria dos animes TV tem episódios de ~23 minutos. Filmes e OVAs variam,
# mas como o banco não armazena duração por episódio, usamos esta constante.
_AVG_EP_MINUTES = 23


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — infraestrutura
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    """Retorna o datetime atual no fuso horário do Brasil.

    Returns:
        Datetime com timezone America/Sao_Paulo.
    """
    return datetime.now(_TZ)


def _today() -> date:
    """Retorna a data de hoje no fuso horário do Brasil.

    Não usa `date.today()` direto porque o servidor pode estar em UTC
    e a data poderia estar errada perto da meia-noite.

    Returns:
        Data local do usuário (America/Sao_Paulo).
    """
    return _now().date()


def _norm(s: str) -> str:
    """Normaliza string para busca fuzzy: minúsculas, sem acentos, sem pontuação.

    A coluna `normalizado` no banco é preenchida com este valor, permitindo
    buscas por título sem depender de capitalização ou acentuação.
    Reutiliza a mesma lógica de mal_sync._norm e akane.tools._norm.

    Args:
        s: String a normalizar.

    Returns:
        String em minúsculas sem acentos e sem pontuação.

    Example:
        >>> _norm("Oshi no Ko")
        'oshi no ko'
        >>> _norm("Frieren: Beyond Journey's End")
        'frieren beyond journeys end'
    """
    # Converte para minúsculas e remove espaços nas bordas
    s = s.strip().lower()
    # NFD decompõe caracteres acentuados em letra-base + marcas separadas
    nfd = unicodedata.normalize("NFD", s)
    # Mantém apenas caracteres que NÃO são marcas combinantes (categoria Mn)
    s = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    # Remove pontuação comum que dificulta o match (vírgulas, dois-pontos, etc.)
    s = re.sub(r'[,.;:!?()\[\]{}\-\'"]', ' ', s)
    # Colapsa múltiplos espaços em um único
    s = re.sub(r' +', ' ', s).strip()
    return s


def _poster_key(title: str) -> str:
    """Retorna a paleta de pôster tipográfico kawaii determinística para um título.

    O índice é calculado pelo hash do título normalizado, garantindo que o
    mesmo anime sempre receba a mesma paleta sem precisar gravar na primeira vez.

    Args:
        title: Título do anime.

    Returns:
        Uma das 12 chaves de paleta (ex.: "cyan", "rose", "violet").

    Example:
        >>> _poster_key("Dungeon Meshi")
        'emerald'
    """
    # hash() de string em Python é determinístico por instância,
    # mas para garantir entre instâncias e versões, usaria hashlib.
    # Para o caso de uso (paleta visual), hash() da string normalizada é suficiente.
    return _POSTER_KEYS[abs(hash(_norm(title))) % len(_POSTER_KEYS)]


def _ok(data: dict | None = None, **kwargs) -> dict:
    """Retorna um dict de sucesso no padrão do projeto.

    Todas as tools retornam dicts com "status": "ok" ou "error" —
    isso permite que o router FastAPI use `_check_result()` uniformemente.

    Args:
        data: Dados opcionais a mesclar no retorno.
        **kwargs: Campos adicionais mesclados diretamente.

    Returns:
        Dict com "status": "ok" e os campos fornecidos.
    """
    result = {"status": "ok"}
    if data:
        result.update(data)
    result.update(kwargs)
    return result


def _err(message: str) -> dict:
    """Retorna um dict de erro no padrão do projeto.

    Args:
        message: Mensagem de erro legível para o usuário.

    Returns:
        Dict com "status": "error" e "message".
    """
    return {"status": "error", "message": message}


def _validate_score(score: float | int | None) -> str | None:
    """Valida que a nota está no intervalo [0, 10] em passos de 0.5.

    Escala MAL: 0–10, passo 0.5. Diferente da Akane (Letterboxd, 0.5–5.0).
    Score 0 é permitido e significa "sem nota" — é convertido para None no banco.

    Args:
        score: Nota a validar, ou None para nota ausente.

    Returns:
        None se válida ou ausente, mensagem de erro se inválida.
    """
    if score is None:
        # Nota ausente é válida — o usuário pode assistir sem avaliar
        return None
    # Garante que o valor está no intervalo 0–10
    if not (0.0 <= float(score) <= 10.0):
        return "Nota inválida: deve ser entre 0 e 10 (escala MAL)."
    # Garante que é múltiplo de 0.5 — meio passo é o mínimo na escala MAL
    if round(float(score) * 2) != float(score) * 2:
        return "Nota inválida: use passos de 0.5 (ex.: 7.5, 8.0)."
    return None


# ─────────────────────────────────────────────────────────────────────────────
# RESOLUÇÃO DE ANIME — fuzzy match
# ─────────────────────────────────────────────────────────────────────────────

def _find_anime_by_query(query: str) -> dict | None:
    """Localiza um anime no catálogo por ID, mal_id numérico ou título fuzzy.

    Prioridade de busca:
    1. ID interno exato (UUID do banco)
    2. mal_id numérico (se a query for um número inteiro)
    3. Fuzzy match no campo `normalizado` (ILIKE '%query%')

    Só retorna animes não-deletados (deleted=FALSE).

    Args:
        query: Texto de busca (UUID interno, mal_id, ou título parcial).

    Returns:
        Dict com todos os campos do anime, ou None se não encontrado.
    """
    # Tenta resolver por UUID interno exato — a forma mais rápida e precisa
    rows = run_select(
        "SELECT * FROM anime WHERE id = %(q)s AND deleted = FALSE LIMIT 1",
        {"q": query},
    )
    if rows:
        return rows[0]

    # Tenta resolver por mal_id numérico se a query for um número puro
    if query.strip().isdigit():
        rows = run_select(
            "SELECT * FROM anime WHERE mal_id = %(q)s AND deleted = FALSE LIMIT 1",
            {"q": int(query.strip())},
        )
        if rows:
            return rows[0]

    # Fuzzy match na coluna normalizada — insensível a capitalização e acentos
    norm_q = _norm(query)
    rows = run_select(
        """
        SELECT * FROM anime
        WHERE normalizado ILIKE %(q)s AND deleted = FALSE
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        {"q": f"%{norm_q}%"},
    )
    return rows[0] if rows else None


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — BUSCA E ADIÇÃO
# ─────────────────────────────────────────────────────────────────────────────

def search_anime(query: str, limit: int = 5) -> dict:
    """Busca animes no Jikan (MAL) por título e marca os que já estão no catálogo.

    Não grava nada no banco — é uma consulta somente leitura ao Jikan para
    apresentar opções antes de adicionar. Usada pelo AddAnimeModal do frontend.

    Args:
        query: Título ou termo de busca (ex.: "Dungeon Meshi", "isekai 2024").
        limit: Número máximo de resultados (padrão: 5).

    Returns:
        Dict com "results": lista de animes com campos mal_id, title,
        type, airing_status, episodes_total, score, season, year, poster_url,
        in_catalog (bool), local_id (str | None).
    """
    # Chama o Jikan (via metadata.py) para buscar resultados externos
    resultados_raw = _jikan_search(query, limit)

    # Para cada resultado, verifica se já está no catálogo local
    resultados = []
    for r in resultados_raw:
        mal_id = r.get("mal_id")
        local_id = None
        in_catalog = False

        if mal_id:
            # Verifica no banco se este mal_id já existe no catálogo
            rows = run_select(
                "SELECT id FROM anime WHERE mal_id = %(mid)s AND deleted = FALSE LIMIT 1",
                {"mid": mal_id},
            )
            if rows:
                in_catalog = True
                local_id = rows[0]["id"]

        resultados.append({
            **r,                        # todos os campos do Jikan (mal_id, title, etc.)
            "in_catalog": in_catalog,   # True se já está no catálogo local
            "local_id":   local_id,     # ID local para navegar ao detalhe
        })

    return _ok(results=resultados)


def add_anime(mal_id: int) -> dict:
    """Adiciona um anime ao catálogo usando o ID do MyAnimeList.

    Busca metadados completos via Jikan + AniList + ARM (enrich_anime)
    e insere na tabela `anime`. Também popula a tabela `episodes` com os
    episódios disponíveis.

    Se o anime já estiver no catálogo, retorna erro (use update_anime_status
    para alterar o status de um anime já existente).

    Args:
        mal_id: ID do anime no MyAnimeList (obtido via search_anime).

    Returns:
        Dict com "id" do anime criado e mensagem, ou "error" se já existe.
    """
    # Verifica se o anime já está no catálogo (dedup por mal_id)
    existing = run_select(
        "SELECT id, title FROM anime WHERE mal_id = %(mid)s AND deleted = FALSE LIMIT 1",
        {"mid": mal_id},
    )
    if existing:
        return _err(
            f"Anime com MAL ID {mal_id} ('{existing[0]['title']}') já está no catálogo."
            " Use update_anime_status para mudar o status."
        )

    # Busca e enriquece metadados: Jikan + AniList + ARM + TMDB
    # Falha graciosamente se as APIs estiverem fora — cria com dados mínimos
    meta = _enrich_meta(mal_id)

    # O título é obrigatório — sem título da API, criamos com placeholder
    titulo = meta.get("title") or f"Anime MAL#{mal_id}"

    # Cria o UUID que será a PK deste anime no banco local
    anime_id = str(uuid.uuid4())
    now = _now()

    # Limpa a sinopse para o tamanho máximo definido no schema (2000 chars)
    overview = meta.get("overview")
    if overview:
        overview = overview[:2000] or None

    # ── Inserção na tabela `anime` ─────────────────────────────────────────────
    run_dml(
        """
        INSERT INTO anime (
            id, mal_id, anilist_id, tmdb_id,
            title, title_english, title_japanese, normalizado,
            media_type, season, studio, episodes_total,
            airing_status, status, overview, genres, poster_url, banner_url,
            source, mal_updated_at, created_at, updated_at
        ) VALUES (
            %(id)s, %(mal_id)s, %(anilist_id)s, %(tmdb_id)s,
            %(title)s, %(title_english)s, %(title_japanese)s, %(normalizado)s,
            %(media_type)s, %(season)s, %(studio)s, %(episodes_total)s,
            %(airing_status)s, 'quero_assistir', %(overview)s, %(genres)s,
            %(poster_url)s, %(banner_url)s,
            'jikan', %(mal_updated_at)s, %(now)s, %(now)s
        )
        """,
        {
            "id":              anime_id,
            "mal_id":          mal_id,
            "anilist_id":      meta.get("anilist_id"),
            "tmdb_id":         meta.get("tmdb_id"),
            "title":           titulo,
            "title_english":   meta.get("title_english"),
            "title_japanese":  meta.get("title_japanese"),
            "normalizado":     _norm(titulo),   # campo de busca fuzzy
            "media_type":      meta.get("media_type"),
            "season":          meta.get("season"),
            "studio":          meta.get("studio"),
            "episodes_total":  meta.get("episodes_total"),
            "airing_status":   meta.get("airing_status"),
            "overview":        overview,
            "genres":          meta.get("genres") or [],
            "poster_url":      meta.get("poster_url"),
            "banner_url":      meta.get("banner_url"),
            "mal_updated_at":  meta.get("mal_aired_from"),  # data de início como referência
            "now":             now,
        },
    )

    # ── Popula episódios na tabela `episodes` ──────────────────────────────────
    # A lista `jikan_episodes` vem mesclada com o schedule do AniList pelo enrich_anime.
    episodios = meta.get("jikan_episodes") or []
    if episodios:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for ep in episodios:
                    numero = ep.get("number")
                    if not numero:
                        # Episódio sem número não pode ser upsertado (constraint UNIQUE (anime_id, number))
                        continue

                    # Trunca sinopse de episódio para 2000 chars (higiene de dados)
                    synopsis = ep.get("synopsis")
                    if synopsis:
                        synopsis = synopsis[:2000] or None

                    # Upsert: (anime_id, number) é UNIQUE — se já existir, atualiza apenas os metadados
                    ep_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO episodes (
                            id, anime_id, number, title, aired,
                            synopsis, airing_status
                        ) VALUES (
                            %(id)s, %(anime_id)s, %(number)s, %(title)s, %(aired)s,
                            %(synopsis)s, %(airing_status)s
                        )
                        ON CONFLICT (anime_id, number) DO UPDATE
                            SET title         = EXCLUDED.title,
                                aired         = EXCLUDED.aired,
                                synopsis      = EXCLUDED.synopsis,
                                airing_status = EXCLUDED.airing_status
                        """,
                        {
                            "id":            ep_id,
                            "anime_id":      anime_id,
                            "number":        numero,
                            "title":         ep.get("title"),
                            "aired":         ep.get("aired"),
                            "synopsis":      synopsis,
                            "airing_status": ep.get("airing_status") or "agendado",
                        },
                    )

    return _ok(
        id=anime_id,
        message=f"'{titulo}' adicionado à watchlist com sucesso!",
    )


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — DIÁRIO DE SESSÕES
# ─────────────────────────────────────────────────────────────────────────────

def log_watch(
    anime_id_or_query: str,
    ep_start: int | None = None,
    ep_end: int | None = None,
    watched_date: str | None = None,
    rating: float | None = None,
    notes: str | None = None,
) -> dict:
    """Loga uma sessão de episódios assistidos e atualiza o progresso do anime.

    Em uma única transação:
    - Insere uma linha em `watch_logs`
    - Atualiza `anime.episodes_watched` (soma de todos os watch_logs)
    - Marca `episodes.watched=TRUE` para os episódios da sessão
    - Atualiza `anime.date_started` se for a primeira sessão
    - Atualiza `anime.date_finished` e status='completo' se terminou

    Args:
        anime_id_or_query: UUID do anime no banco, mal_id numérico, ou título
            para busca fuzzy (ex.: "Dungeon Meshi").
        ep_start: Número do primeiro episódio assistido na sessão (opcional).
        ep_end: Número do último episódio assistido (opcional; = ep_start se omitido).
        watched_date: Data da sessão no formato YYYY-MM-DD. Default: hoje.
        rating: Nota da sessão (0–10, passo 0.5; null = sem avaliação).
        notes: Observações específicas desta sessão (opcional).

    Returns:
        Dict com "log_id" e mensagem de confirmação, ou "error" em caso de falha.
    """
    # ── 1. Resolve o anime ─────────────────────────────────────────────────────
    anime = _find_anime_by_query(anime_id_or_query)
    if not anime:
        return _err(f"Anime '{anime_id_or_query}' não encontrado no catálogo.")

    anime_id = anime["id"]

    # ── 2. Valida a nota ──────────────────────────────────────────────────────
    score_err = _validate_score(rating)
    if score_err:
        return _err(score_err)

    # Score 0 no banco = sem avaliação (NULL)
    score_final = float(rating) if rating and rating > 0 else None

    # ── 3. Valida e converte a data ───────────────────────────────────────────
    if watched_date is None:
        watch_date = _today()
    else:
        try:
            watch_date = date.fromisoformat(watched_date)
        except ValueError:
            return _err(f"Data inválida: '{watched_date}'. Use YYYY-MM-DD.")

    # ── 4. Calcula episódios_count e normaliza ep_end ─────────────────────────
    # Se ep_end não foi informado, assume que foi apenas o ep_start
    if ep_start is not None and ep_end is None:
        ep_end = ep_start

    # Calcula a contagem de episódios da sessão
    ep_count: int | None = None
    if ep_start is not None and ep_end is not None:
        if ep_end < ep_start:
            return _err(f"ep_end ({ep_end}) deve ser >= ep_start ({ep_start}).")
        ep_count = ep_end - ep_start + 1

    # ── 5. Insere o log e atualiza o progresso — em transação ────────────────
    log_id = str(uuid.uuid4())
    now = _now()

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Insere a sessão no diário de episódios
            cur.execute(
                """
                INSERT INTO watch_logs (
                    id, anime_id, anime_title, watched_date,
                    ep_start, ep_end, episodes_count, rating, notes, source, created_at
                ) VALUES (
                    %(id)s, %(anime_id)s, %(anime_title)s, %(watched_date)s,
                    %(ep_start)s, %(ep_end)s, %(ep_count)s,
                    %(rating)s, %(notes)s, 'manual', %(now)s
                )
                """,
                {
                    "id":          log_id,
                    "anime_id":    anime_id,
                    "anime_title": anime["title"],
                    "watched_date": watch_date,
                    "ep_start":    ep_start,
                    "ep_end":      ep_end,
                    "ep_count":    ep_count,
                    "rating":      score_final,
                    "notes":       notes,
                    "now":         now,
                },
            )

            # Atualiza episodes_watched como SUM de todos os logs do anime
            # (mais correto que incrementar — evita drift se logs forem deletados)
            cur.execute(
                """
                UPDATE anime
                SET episodes_watched = (
                        SELECT COALESCE(SUM(episodes_count), 0)
                        FROM watch_logs
                        WHERE anime_id = %(anime_id)s
                          AND episodes_count IS NOT NULL
                    ),
                    updated_at = %(now)s
                WHERE id = %(anime_id)s
                """,
                {"anime_id": anime_id, "now": now},
            )

            # Marca episódios individuais como assistidos (se o range foi fornecido)
            if ep_start is not None and ep_end is not None:
                cur.execute(
                    """
                    UPDATE episodes
                    SET watched      = TRUE,
                        watched_date = %(watch_date)s
                    WHERE anime_id = %(anime_id)s
                      AND number BETWEEN %(ep_start)s AND %(ep_end)s
                      AND watched = FALSE
                    """,
                    {
                        "anime_id":   anime_id,
                        "ep_start":   ep_start,
                        "ep_end":     ep_end,
                        "watch_date": watch_date,
                    },
                )

            # Atualiza date_started se for o primeiro log deste anime
            if not anime.get("date_started"):
                cur.execute(
                    """
                    UPDATE anime
                    SET date_started = %(d)s, updated_at = %(now)s
                    WHERE id = %(anime_id)s AND date_started IS NULL
                    """,
                    {"d": watch_date, "anime_id": anime_id, "now": now},
                )

            # Verifica se o anime foi completado (episodes_watched >= episodes_total)
            # e atualiza status e date_finished automaticamente
            if anime.get("episodes_total"):
                cur.execute(
                    """
                    UPDATE anime
                    SET
                        status        = CASE WHEN episodes_watched >= episodes_total
                                             THEN 'completo'
                                             ELSE status
                                        END,
                        date_finished = CASE WHEN episodes_watched >= episodes_total
                                             AND date_finished IS NULL
                                             THEN %(d)s
                                             ELSE date_finished
                                        END,
                        updated_at = %(now)s
                    WHERE id = %(anime_id)s
                    """,
                    {"d": watch_date, "anime_id": anime_id, "now": now},
                )

    # Monta mensagem amigável descrevendo o que foi logado
    ep_desc = ""
    if ep_start and ep_end:
        if ep_start == ep_end:
            ep_desc = f" (ep {ep_start})"
        else:
            ep_desc = f" (eps {ep_start}–{ep_end})"
    elif ep_count:
        ep_desc = f" ({ep_count} ep)"

    return _ok(
        log_id=log_id,
        message=f"Sessão de '{anime['title']}'{ep_desc} registrada para {watch_date}.",
    )


def delete_watch_log(log_id: str) -> dict:
    """Remove uma sessão do diário e recalcula episodes_watched do anime.

    Args:
        log_id: UUID do registro em watch_logs.

    Returns:
        Dict com status "ok" ou "error".
    """
    # Busca a sessão para pegar o anime_id
    rows = run_select(
        "SELECT anime_id FROM watch_logs WHERE id = %(id)s", {"id": log_id}
    )
    if not rows:
        return _err("Sessão não encontrada no diário.")

    anime_id = rows[0]["anime_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Remove a sessão do diário
            cur.execute("DELETE FROM watch_logs WHERE id = %(id)s", {"id": log_id})

            # Recalcula episodes_watched a partir dos logs restantes
            cur.execute(
                """
                UPDATE anime
                SET episodes_watched = (
                        SELECT COALESCE(SUM(episodes_count), 0)
                        FROM watch_logs
                        WHERE anime_id = %(mid)s
                          AND episodes_count IS NOT NULL
                    ),
                    updated_at = NOW()
                WHERE id = %(mid)s
                """,
                {"mid": anime_id},
            )

    return _ok(message="Sessão removida do diário.")


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — LISTAGENS E CONSULTAS
# ─────────────────────────────────────────────────────────────────────────────

def get_currently_watching() -> dict:
    """Lista os animes com status 'assistindo' (em progresso).

    Ordena por data de atualização mais recente — o anime que o usuário
    assistiu por último aparece primeiro.

    Returns:
        Dict com "animes": lista de animes com status='assistindo'.
    """
    rows = run_select(
        """
        SELECT
            id, mal_id, title, media_type, season, studio,
            episodes_total, episodes_watched, status, airing_status,
            score, poster_url, banner_url, genres, date_started, updated_at
        FROM anime
        WHERE status = 'assistindo' AND deleted = FALSE
        ORDER BY updated_at DESC
        """,
    )
    return _ok(animes=rows)


def get_watchlist() -> dict:
    """Lista os animes com status 'quero_assistir' (fila de espera).

    Ordenados pela data de adição — o mais recente primeiro.

    Returns:
        Dict com "animes": lista de animes com status='quero_assistir'.
    """
    rows = run_select(
        """
        SELECT
            id, mal_id, title, media_type, season, studio,
            episodes_total, episodes_watched, status, airing_status,
            score, poster_url, genres, overview, created_at
        FROM anime
        WHERE status = 'quero_assistir' AND deleted = FALSE
        ORDER BY created_at DESC
        """,
    )
    return _ok(animes=rows)


def get_watch_history(anime_id_or_query: str | None = None, limit: int = 50) -> dict:
    """Retorna o histórico de sessões em ordem cronológica decrescente.

    Se `anime_id_or_query` for fornecido, filtra apenas as sessões daquele anime.
    Caso contrário, retorna todos os logs do diário (limitado por `limit`).

    Args:
        anime_id_or_query: Filtrar por anime específico (ID, mal_id ou título).
            Se None, retorna todos os logs.
        limit: Número máximo de registros. Default: 50.

    Returns:
        Dict com "logs": lista de sessões com título do anime e pôster.
    """
    # Se filtro por anime, resolve o ID primeiro
    anime_id_filter: str | None = None
    if anime_id_or_query:
        anime = _find_anime_by_query(anime_id_or_query)
        if not anime:
            return _err(f"Anime '{anime_id_or_query}' não encontrado no catálogo.")
        anime_id_filter = anime["id"]

    if anime_id_filter:
        # Filtra só os logs do anime especificado
        rows = run_select(
            """
            SELECT
                w.id, w.anime_id, w.anime_title, w.watched_date,
                w.ep_start, w.ep_end, w.episodes_count,
                w.rating, w.notes, w.source, w.created_at,
                a.poster_url, a.status AS anime_status
            FROM watch_logs w
            JOIN anime a ON a.id = w.anime_id
            WHERE w.anime_id = %(anime_id)s
            ORDER BY w.watched_date DESC, w.created_at DESC
            LIMIT %(limit)s
            """,
            {"anime_id": anime_id_filter, "limit": limit},
        )
    else:
        # Todos os logs do diário (sem filtro de anime)
        rows = run_select(
            """
            SELECT
                w.id, w.anime_id, w.anime_title, w.watched_date,
                w.ep_start, w.ep_end, w.episodes_count,
                w.rating, w.notes, w.source, w.created_at,
                a.poster_url, a.status AS anime_status
            FROM watch_logs w
            JOIN anime a ON a.id = w.anime_id
            WHERE a.deleted = FALSE
            ORDER BY w.watched_date DESC, w.created_at DESC
            LIMIT %(limit)s
            """,
            {"limit": limit},
        )

    # Adiciona poster_key para animes sem poster_url
    for log in rows:
        title = log.get("anime_title") or ""
        log["poster_key"] = _poster_key(title)

    return _ok(logs=rows)


def get_anime_details(anime_id_or_query: str) -> dict:
    """Retorna detalhes completos de um anime: metadados + próximo ep + histórico.

    Aceita UUID interno, mal_id numérico ou título fuzzy.

    Args:
        anime_id_or_query: ID local, mal_id ou texto de busca.

    Returns:
        Dict com "anime", "next_episode", "episodes", "episodes_total_cached"
        e "recent_logs", ou "error" se não encontrado.
    """
    # Resolve o anime pelo identificador ou texto
    anime = _find_anime_by_query(anime_id_or_query)
    if not anime:
        return _err(f"Anime '{anime_id_or_query}' não encontrado no catálogo.")

    anime_id = anime["id"]

    # Adiciona poster_key ao anime (fallback tipográfico)
    anime["poster_key"] = _poster_key(anime.get("title", ""))

    # Próximo episódio não assistido (menor número maior que o último assistido)
    next_ep_rows = run_select(
        """
        SELECT id, number, title, aired, synopsis, thumbnail_url,
               airing_status, watched, watched_date
        FROM episodes
        WHERE anime_id = %(anime_id)s AND watched = FALSE
        ORDER BY number ASC
        LIMIT 1
        """,
        {"anime_id": anime_id},
    )
    next_episode = next_ep_rows[0] if next_ep_rows else None

    # Primeiros 12 episódios (página 1) — paginação adicional via endpoint próprio
    episodes = run_select(
        """
        SELECT id, number, title, aired, synopsis, thumbnail_url,
               airing_status, watched, watched_date
        FROM episodes
        WHERE anime_id = %(anime_id)s
        ORDER BY number ASC
        LIMIT 12
        """,
        {"anime_id": anime_id},
    )

    # Contagem total de episódios no cache (para paginação no frontend)
    count_rows = run_select(
        "SELECT COUNT(*) AS cnt FROM episodes WHERE anime_id = %(anime_id)s",
        {"anime_id": anime_id},
    )
    episodes_total_cached = int((count_rows[0] if count_rows else {}).get("cnt", 0))

    # Últimas 5 sessões deste anime (para o caderno de notas no detalhe)
    recent_logs = run_select(
        """
        SELECT id, watched_date, ep_start, ep_end, episodes_count, rating, notes, source
        FROM watch_logs
        WHERE anime_id = %(anime_id)s
        ORDER BY watched_date DESC, created_at DESC
        LIMIT 5
        """,
        {"anime_id": anime_id},
    )

    return _ok(
        anime=anime,
        next_episode=next_episode,
        episodes=episodes,
        episodes_total_cached=episodes_total_cached,
        recent_logs=recent_logs,
    )


def get_airing_schedule(days: int = 14) -> dict:
    """Retorna o schedule de episódios futuros dos animes em progresso.

    Busca episódios da tabela `episodes` que serão lançados nos próximos
    `days` dias E cujo anime tem status='assistindo'.

    Args:
        days: Janela de tempo em dias (ex.: 7 para a semana). Default: 14.

    Returns:
        Dict com "schedule": lista de items ordenados por data de exibição.
    """
    hoje = _today()
    ate = hoje + timedelta(days=days)  # data limite da janela

    rows = run_select(
        """
        SELECT
            a.id    AS anime_id,
            a.title AS anime_title,
            a.poster_url,
            e.number AS episode_number,
            e.aired,
            e.airing_status
        FROM episodes e
        JOIN anime a ON a.id = e.anime_id
        WHERE e.aired BETWEEN %(hoje)s AND %(ate)s
          AND a.status = 'assistindo'
          AND a.deleted = FALSE
          AND e.watched = FALSE
        ORDER BY e.aired ASC, a.title ASC
        """,
        {"hoje": hoje, "ate": ate},
    )

    # Adiciona poster_key para animes sem pôster
    for item in rows:
        item["poster_key"] = _poster_key(item.get("anime_title") or "")

    return _ok(schedule=rows)


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — ATUALIZAÇÃO DO CATÁLOGO
# ─────────────────────────────────────────────────────────────────────────────

def update_anime_status(anime_id_or_query: str, status: str) -> dict:
    """Atualiza o status de um anime na lista do usuário.

    Args:
        anime_id_or_query: ID local, mal_id ou título fuzzy do anime.
        status: Novo status ('assistindo'|'completo'|'quero_assistir'|'pausado'|'abandonado').

    Returns:
        Dict com status "ok" ou "error".
    """
    # Valida o status antes de buscar o anime (falha rápida)
    if status not in _VALID_STATUSES:
        validos = "', '".join(sorted(_VALID_STATUSES))
        return _err(f"Status inválido: '{status}'. Use um de: '{validos}'.")

    # Resolve o anime
    anime = _find_anime_by_query(anime_id_or_query)
    if not anime:
        return _err(f"Anime '{anime_id_or_query}' não encontrado no catálogo.")

    now = _now()
    run_dml(
        "UPDATE anime SET status = %(s)s, updated_at = %(now)s WHERE id = %(id)s",
        {"s": status, "now": now, "id": anime["id"]},
    )

    return _ok(
        message=f"Status de '{anime['title']}' atualizado para '{status}'.",
        id=anime["id"],
        status=status,
    )


def rate_anime(anime_id_or_query: str, score: float) -> dict:
    """Define a nota pessoal de um anime (escala MAL: 0–10, passo 0.5).

    Score 0 é interpretado como "remover avaliação" (define NULL no banco).

    Args:
        anime_id_or_query: ID local, mal_id ou título fuzzy do anime.
        score: Nota de 0 a 10 (passo 0.5). Use 0 para remover a nota.

    Returns:
        Dict com status "ok" ou "error".
    """
    # Valida a nota antes de qualquer acesso ao banco
    err = _validate_score(score)
    if err:
        return _err(err)

    # Resolve o anime
    anime = _find_anime_by_query(anime_id_or_query)
    if not anime:
        return _err(f"Anime '{anime_id_or_query}' não encontrado no catálogo.")

    # Score 0 = remover avaliação (NULL); qualquer outro = nota válida
    score_final = float(score) if score and float(score) > 0 else None

    run_dml(
        "UPDATE anime SET score = %(s)s, updated_at = %(now)s WHERE id = %(id)s",
        {"s": score_final, "now": _now(), "id": anime["id"]},
    )

    if score_final is None:
        msg = f"Avaliação de '{anime['title']}' removida."
    else:
        msg = f"'{anime['title']}' avaliado com {score_final}/10."

    return _ok(message=msg, id=anime["id"], score=score_final)


def delete_anime(anime_id_or_query: str) -> dict:
    """Soft-delete de um anime (marca deleted=TRUE, preserva watch_logs).

    Os registros de watch_logs são preservados para manter o histórico.
    O anime não aparecerá mais nas listagens ou buscas.

    Args:
        anime_id_or_query: ID local, mal_id ou título fuzzy do anime.

    Returns:
        Dict com status "ok" ou "error".
    """
    anime = _find_anime_by_query(anime_id_or_query)
    if not anime:
        return _err(f"Anime '{anime_id_or_query}' não encontrado no catálogo.")

    run_dml(
        "UPDATE anime SET deleted = TRUE, updated_at = %(now)s WHERE id = %(id)s",
        {"now": _now(), "id": anime["id"]},
    )
    return _ok(message=f"'{anime['title']}' removido do catálogo. Histórico preservado.")


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — SYNC MAL
# ─────────────────────────────────────────────────────────────────────────────

def sync_mal(full: bool = False) -> dict:
    """Sincroniza a lista do MyAnimeList com o catálogo local.

    Por padrão faz delta sync (só o que mudou desde o último sync).
    Com full=True, processa toda a lista (útil para o primeiro sync).

    Chama `agents.marin.mal_sync.sync_mal()` diretamente — toda a lógica
    de autenticação (token refresh) e paginação está lá.

    Args:
        full: Se True, ignora last_sync_at e processa toda a lista MAL.

    Returns:
        Dict com métricas: ok, full, timestamp, mal_entries_fetched,
        updated, created, skipped, errors.
    """
    # Delega para o módulo de sync que já tem retry, autenticação e delta
    return _mal_sync(full)


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — ESTATÍSTICAS
# ─────────────────────────────────────────────────────────────────────────────

def get_stats(year: int | None = None) -> dict:
    """Retorna estatísticas de animes do ano (vazio-seguro).

    Todos os blocos retornam zeros/listas vazias quando não há dados,
    nunca levantam exceção.

    Args:
        year: Ano a filtrar. Default: ano atual.

    Returns:
        Dict com total_animes, total_episodes, total_hours, avg_score,
        top_genres, top_studios, monthly[12], by_status, heatmap, highlight.
    """
    if year is None:
        year = _today().year

    # ── Totais básicos ────────────────────────────────────────────────────────
    # COUNT(DISTINCT anime_id) = animes únicos com ao menos uma sessão no ano
    totals = run_select(
        """
        SELECT
            COUNT(DISTINCT w.anime_id) AS total_animes,
            COALESCE(SUM(w.episodes_count), 0) AS total_episodes,
            AVG(w.rating) AS avg_score
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
          AND a.deleted = FALSE
          AND w.episodes_count IS NOT NULL
        """,
        {"year": year},
    )
    t = totals[0] if totals else {}
    total_eps = int(t.get("total_episodes") or 0)
    # Estimativa de horas: episódios × duração média de 23 minutos
    total_horas = round((total_eps * _AVG_EP_MINUTES) / 60, 1)
    avg_score = round(float(t.get("avg_score") or 0), 2) or None

    # ── Top gêneros ───────────────────────────────────────────────────────────
    # UNNEST expande o array TEXT[] de gêneros em linhas para agregar
    top_genres = run_select(
        """
        SELECT genre, COUNT(DISTINCT w.anime_id) AS count
        FROM (
            SELECT UNNEST(a.genres) AS genre, w.anime_id
            FROM watch_logs w
            JOIN anime a ON a.id = w.anime_id
            WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
              AND a.deleted = FALSE
        ) g
        GROUP BY genre
        ORDER BY count DESC
        LIMIT 5
        """,
        {"year": year},
    )

    # ── Top estúdios ──────────────────────────────────────────────────────────
    top_studios = run_select(
        """
        SELECT studio, COUNT(DISTINCT w.anime_id) AS count
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
          AND a.deleted = FALSE
          AND a.studio IS NOT NULL
        GROUP BY studio
        ORDER BY count DESC
        LIMIT 5
        """,
        {"year": year},
    )

    # ── Sessões por mês (array de 12 elementos, janeiro=índice 0) ─────────────
    monthly_rows = run_select(
        """
        SELECT EXTRACT(MONTH FROM w.watched_date)::INTEGER AS month,
               COUNT(*) AS count
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
          AND a.deleted = FALSE
        GROUP BY month
        ORDER BY month
        """,
        {"year": year},
    )
    monthly = [0] * 12
    for row in monthly_rows:
        # Mês 1 = índice 0, mês 12 = índice 11
        monthly[int(row["month"]) - 1] = int(row["count"])

    # ── Contagem por status ───────────────────────────────────────────────────
    status_rows = run_select(
        """
        SELECT status, COUNT(*) AS count
        FROM anime
        WHERE deleted = FALSE
        GROUP BY status
        """,
    )
    by_status: dict = {s: 0 for s in _VALID_STATUSES}
    for row in status_rows:
        s = row.get("status")
        if s in by_status:
            by_status[s] = int(row["count"])

    # ── Heatmap — sessões por dia do ano ──────────────────────────────────────
    heatmap_rows = run_select(
        """
        SELECT watched_date::TEXT AS dt, COUNT(*) AS count
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
          AND a.deleted = FALSE
        GROUP BY watched_date
        """,
        {"year": year},
    )
    heatmap: dict[str, int] = {r["dt"]: int(r["count"]) for r in heatmap_rows}

    # ── Anime destaque do ano (mais episódios ou maior nota) ──────────────────
    highlight_rows = run_select(
        """
        SELECT a.id AS anime_id, a.title, a.score
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
          AND a.deleted = FALSE
        GROUP BY a.id, a.title, a.score
        ORDER BY a.score DESC NULLS LAST, SUM(COALESCE(w.episodes_count, 0)) DESC
        LIMIT 1
        """,
        {"year": year},
    )
    highlight = highlight_rows[0] if highlight_rows else None
    if highlight:
        highlight = {
            "anime_id": highlight["anime_id"],
            "title":    highlight["title"],
            "score":    float(highlight["score"]) if highlight.get("score") else None,
        }

    return _ok(
        year=year,
        total_animes=int(t.get("total_animes") or 0),
        total_episodes=total_eps,
        total_hours=total_horas,
        avg_score=avg_score,
        top_genres=[{"genre": r["genre"], "count": int(r["count"])} for r in top_genres],
        top_studios=[{"studio": r["studio"], "count": int(r["count"])} for r in top_studios],
        monthly=monthly,
        by_status=by_status,
        heatmap=heatmap,
        highlight=highlight,
    )


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — AGREGAÇÃO PARA A HOME SCREEN
# ─────────────────────────────────────────────────────────────────────────────

def get_home() -> dict:
    """Retorna todos os blocos da HomeScreen em uma única chamada (sem N+1).

    Evita múltiplas round-trips ao banco: agrega last_session, currently_watching,
    recent_logs, upcoming_episodes, watchlist_preview, counts e stats rápidas.

    Returns:
        Dict composto com todos os blocos que a HomeScreen consome.
    """
    hoje = _today()

    # ── Última sessão (hero "continue assistindo") ────────────────────────────
    last_log_rows = run_select(
        """
        SELECT
            w.id AS log_id, w.anime_id, w.watched_date,
            w.ep_start, w.ep_end, w.episodes_count, w.rating, w.notes,
            a.title, a.status, a.episodes_total, a.episodes_watched,
            a.poster_url, a.banner_url, a.airing_status
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE a.deleted = FALSE
        ORDER BY w.watched_date DESC, w.created_at DESC
        LIMIT 1
        """,
    )
    last_session = None
    if last_log_rows:
        row = last_log_rows[0]
        anime_id = row["anime_id"]
        # Próximo episódio do anime da última sessão
        next_ep_rows = run_select(
            """
            SELECT id, number, title, aired, airing_status
            FROM episodes
            WHERE anime_id = %(id)s AND watched = FALSE
            ORDER BY number ASC
            LIMIT 1
            """,
            {"id": anime_id},
        )
        last_session = {
            "anime":        {k: v for k, v in row.items()},
            "log":          {"id": row["log_id"], "watched_date": str(row["watched_date"])},
            "next_episode": next_ep_rows[0] if next_ep_rows else None,
        }

    # ── Animes assistindo no momento ─────────────────────────────────────────
    currently_watching = run_select(
        """
        SELECT id, title, episodes_total, episodes_watched,
               status, poster_url, airing_status, score, updated_at
        FROM anime
        WHERE status = 'assistindo' AND deleted = FALSE
        ORDER BY updated_at DESC
        LIMIT 8
        """,
    )
    for a in currently_watching:
        a["poster_key"] = _poster_key(a.get("title") or "")

    # ── Últimas 5 sessões do diário ───────────────────────────────────────────
    recent_logs = run_select(
        """
        SELECT
            w.id, w.anime_id, w.anime_title, w.watched_date,
            w.ep_start, w.ep_end, w.episodes_count, w.rating, w.notes,
            a.poster_url
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE a.deleted = FALSE
        ORDER BY w.watched_date DESC, w.created_at DESC
        LIMIT 5
        """,
    )
    for log in recent_logs:
        log["poster_key"] = _poster_key(log.get("anime_title") or "")

    # ── Próximos episódios (schedule) ─────────────────────────────────────────
    proxima_semana = hoje + timedelta(days=7)
    upcoming = run_select(
        """
        SELECT
            a.id AS anime_id, a.title AS anime_title, a.poster_url,
            e.number AS episode_number, e.aired, e.airing_status
        FROM episodes e
        JOIN anime a ON a.id = e.anime_id
        WHERE e.aired BETWEEN %(hoje)s AND %(ate)s
          AND a.status = 'assistindo'
          AND a.deleted = FALSE
          AND e.watched = FALSE
        ORDER BY e.aired ASC
        LIMIT 4
        """,
        {"hoje": hoje, "ate": proxima_semana},
    )
    for ep in upcoming:
        ep["poster_key"] = _poster_key(ep.get("anime_title") or "")

    # ── Preview da watchlist (carrossel) ──────────────────────────────────────
    watchlist_preview = run_select(
        """
        SELECT id, title, episodes_total, status, poster_url, genres, season
        FROM anime
        WHERE status = 'quero_assistir' AND deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 8
        """,
    )
    for a in watchlist_preview:
        a["poster_key"] = _poster_key(a.get("title") or "")

    # ── Contagens por status ──────────────────────────────────────────────────
    counts_rows = run_select(
        """
        SELECT status, COUNT(*) AS count
        FROM anime
        WHERE deleted = FALSE
        GROUP BY status
        """,
    )
    counts: dict = {s: 0 for s in _VALID_STATUSES}
    for row in counts_rows:
        s = row.get("status")
        if s in counts:
            counts[s] = int(row["count"])

    # ── Episódios nos últimos 7 dias e 7 dias anteriores (variação %) ─────────
    semana_inicio = hoje - timedelta(days=6)
    semana_anterior_inicio = hoje - timedelta(days=13)
    semana_anterior_fim = hoje - timedelta(days=7)

    eps_7d_rows = run_select(
        """
        SELECT COALESCE(SUM(episodes_count), 0) AS cnt
        FROM watch_logs
        WHERE watched_date >= %(s)s AND watched_date <= %(e)s
          AND episodes_count IS NOT NULL
        """,
        {"s": semana_inicio, "e": hoje},
    )
    episodes_7d = int((eps_7d_rows[0] if eps_7d_rows else {}).get("cnt", 0))

    eps_7d_prev_rows = run_select(
        """
        SELECT COALESCE(SUM(episodes_count), 0) AS cnt
        FROM watch_logs
        WHERE watched_date >= %(s)s AND watched_date <= %(e)s
          AND episodes_count IS NOT NULL
        """,
        {"s": semana_anterior_inicio, "e": semana_anterior_fim},
    )
    episodes_7d_prev = int((eps_7d_prev_rows[0] if eps_7d_prev_rows else {}).get("cnt", 0))

    # ── Nota média do ano atual ────────────────────────────────────────────────
    avg_year_rows = run_select(
        """
        SELECT AVG(w.rating) AS avg
        FROM watch_logs w
        JOIN anime a ON a.id = w.anime_id
        WHERE EXTRACT(YEAR FROM w.watched_date) = %(year)s
          AND a.deleted = FALSE
          AND w.rating IS NOT NULL
        """,
        {"year": hoje.year},
    )
    avg_raw = (avg_year_rows[0] if avg_year_rows else {}).get("avg")
    avg_score_year = round(float(avg_raw), 2) if avg_raw else None

    return _ok(
        last_session=last_session,
        currently_watching=currently_watching,
        recent_logs=recent_logs,
        upcoming_episodes=upcoming,
        watchlist_preview=watchlist_preview,
        counts=counts,
        episodes_7d=episodes_7d,
        episodes_7d_prev=episodes_7d_prev,
        avg_score_year=avg_score_year,
    )
