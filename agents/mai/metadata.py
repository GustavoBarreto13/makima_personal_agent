"""Cliente TMDB para séries de TV — fatia 022 (Mai Sakurajima).

Encapsula todos os acessos à API TMDB v3 (api_key query param) para séries:
busca, detalhes de show, temporadas e episódios.

Regras críticas:
- Autenticação: api_key v3 via query param (`?api_key={TMDB_API_KEY}`).
- Temporada 0 (Specials): NUNCA é inserida no banco.
- Skip-logic incremental: episódio existente com air_date + still_url + já no passado → pular upsert.
- Retry: 3 tentativas com backoff 2s → 4s → 8s em 429, 5xx e erros de rede.
- 404: retorna None imediatamente (sem retry).

Usage:
    from agents.mai.metadata import search_tv, get_show, sync_seasons
    results = search_tv("Dark")
    show = get_show(94997)
    seasons = sync_seasons(conn, series_id, tmdb_id, seasons_count)
"""

import os               # Lê variáveis de ambiente (TMDB_API_KEY)
import time             # sleep() para o backoff exponencial do retry
import uuid             # Gera IDs únicos para linhas no banco
import logging          # Registra avisos e erros sem travar o programa
from datetime import date
from typing import Optional

# psycopg2 para executar queries SQL no PostgreSQL
import psycopg2.extras  # execute_values para upserts em lote

# ─── Logger ────────────────────────────────────────────────────────────────

# Logger isolado — não polui os logs de outros agentes
logger = logging.getLogger(__name__)

# ─── Constantes ────────────────────────────────────────────────────────────

# URL base da API TMDB v3 (endpoints de busca e detalhes)
_TMDB_BASE = "https://api.themoviedb.org/3"

# URL base para construção de URLs de imagens do TMDB
_IMG_BASE = "https://image.tmdb.org/t/p"

# Idioma preferencial para retorno de metadados (títulos, sinopses)
_LANG = "pt-BR"


def _tmdb_api_key() -> str:
    """Retorna a API key v3 do TMDB lida do ambiente.

    Returns:
        String com a API key.

    Raises:
        RuntimeError: Quando TMDB_API_KEY não está definido no ambiente.
    """
    key = os.environ.get("TMDB_API_KEY")
    if not key:
        raise RuntimeError("TMDB_API_KEY não configurado no ambiente")
    return key


def _img(path: Optional[str], size: str = "w500") -> Optional[str]:
    """Converte um path relativo do TMDB em URL completa de imagem.

    Args:
        path: Path relativo retornado pelo TMDB (ex.: '/abc.jpg'). None → None.
        size: Tamanho da imagem. Valores comuns: 'w500' (poster), 'w780' (still),
              'w1280' (backdrop), 'original'.

    Returns:
        URL completa ou None se path for None.

    Example:
        >>> _img('/abc.jpg', 'w500')
        'https://image.tmdb.org/t/p/w500/abc.jpg'
    """
    if not path:
        return None
    return f"{_IMG_BASE}/{size}{path}"


# ─── Retry com backoff exponencial ─────────────────────────────────────────

def _tmdb_get(url: str, params: Optional[dict] = None) -> Optional[dict]:
    """Faz GET na URL do TMDB com retry exponencial (3×, 2s→4s→8s).

    Trata 429 (rate limit) e 5xx (erro de servidor) com retry.
    404 retorna None imediatamente (sem retry) — é um estado válido.
    Erros de rede (ConnectionError, Timeout) também acionam retry.

    Args:
        url: URL completa do endpoint TMDB.
        params: Query params opcionais (ex.: {'language': 'pt-BR'}).

    Returns:
        Dict com a resposta JSON do TMDB, ou None para 404.

    Raises:
        RuntimeError: Quando todas as tentativas falham.
    """
    import requests  # Importado aqui para evitar dependência circular no topo

    # Backoff exponencial: 2s, 4s, 8s entre as tentativas
    delays = [2, 4, 8]

    for attempt, delay in enumerate(delays, start=1):
        try:
            # Injeta a api_key em todos os requests (autenticação v3)
            all_params = {"api_key": _tmdb_api_key(), **(params or {})}
            resp = requests.get(
                url,
                headers={"Accept": "application/json"},
                params=all_params,
                timeout=15,  # Evita travar indefinidamente
            )

            # 404 = série não encontrada no TMDB — retorna None sem tentar de novo
            if resp.status_code == 404:
                logger.warning("TMDB 404: %s", url)
                return None

            # Rate limit (429) ou erro de servidor (5xx): espera e tenta novamente
            if resp.status_code in (429,) or resp.status_code >= 500:
                logger.warning(
                    "TMDB %d em %s — tentativa %d/%d, aguardando %ds",
                    resp.status_code, url, attempt, len(delays), delay,
                )
                if attempt < len(delays):
                    time.sleep(delay)
                    continue
                # Última tentativa também falhou
                raise RuntimeError(
                    f"TMDB retornou {resp.status_code} após {len(delays)} tentativas"
                )

            # Qualquer outro erro (401, 403, etc.) — lança imediatamente
            resp.raise_for_status()
            return resp.json()

        except (requests.ConnectionError, requests.Timeout) as exc:
            # Falha de rede — tenta novamente se não for a última tentativa
            logger.warning(
                "Erro de rede ao acessar TMDB (%s) — tentativa %d/%d",
                exc, attempt, len(delays),
            )
            if attempt < len(delays):
                time.sleep(delay)
            else:
                raise RuntimeError(f"TMDB inacessível após {len(delays)} tentativas: {exc}") from exc

    # Nunca chega aqui (o loop sempre retorna ou levanta), mas satisfaz o type checker
    return None  # pragma: no cover


# ─── Busca ─────────────────────────────────────────────────────────────────

def search_tv(query: str, page: int = 1) -> list[dict]:
    """Busca séries no TMDB por texto livre.

    Não grava nada no banco — apenas retorna os resultados do TMDB
    para que o usuário escolha qual série adicionar.

    Args:
        query: Texto de busca (ex.: "Breaking Bad", "Game of Thrones").
        page: Página de resultados (default: 1). Cada página tem até 20 itens.

    Returns:
        Lista de dicts com campos normalizados: tmdb_id, title, title_original,
        first_air_date, overview, poster_url, genres (vazio — TMDB não retorna
        gêneros na busca, só IDs).

    Example:
        >>> results = search_tv("Dark")
        >>> results[0]['title']
        'Dark'
    """
    data = _tmdb_get(
        f"{_TMDB_BASE}/search/tv",
        params={"query": query, "language": _LANG, "page": page},
    )
    if not data:
        return []

    results = []
    for item in data.get("results", []):
        results.append({
            "tmdb_id":        item.get("id"),
            "title":          item.get("name") or item.get("original_name", ""),
            "title_original": item.get("original_name"),
            "first_air_date": item.get("first_air_date") or None,
            "overview":       item.get("overview") or None,
            # Poster em tamanho padrão w500 (thumbnail para busca)
            "poster_url":     _img(item.get("poster_path"), "w500"),
            # A busca retorna genre_ids (números), não nomes — normalização feita no get_show()
            "genre_ids":      item.get("genre_ids", []),
        })
    return results


# ─── Detalhes do show ───────────────────────────────────────────────────────

def get_show(tmdb_id: int) -> Optional[dict]:
    """Busca metadados completos de um show no TMDB.

    Retorna todos os campos necessários para popular a tabela `series`,
    incluindo network, seasons_count, episodes_count, gêneros (nomes),
    status de exibição e URLs de imagem.

    Args:
        tmdb_id: ID do show no TMDB.

    Returns:
        Dict normalizado ou None se o show não existir no TMDB.
    """
    # append_to_response=external_ids inclui o bloco external_ids (imdb_id, etc.)
    # na mesma chamada — evita um segundo request separado
    data = _tmdb_get(
        f"{_TMDB_BASE}/tv/{tmdb_id}",
        params={"language": _LANG, "append_to_response": "external_ids"},
    )
    if not data:
        return None

    # Converte o status TMDB para os valores do enum da tabela `series`
    status_map = {
        "Returning Series": "no_ar",
        "In Production":    "no_ar",
        "Pilot":            "no_ar",
        "Ended":            "finalizada",
        "Canceled":         "cancelada",
        "Planned":          "nao_lancada",
    }
    tmdb_status = data.get("status", "")
    series_status = status_map.get(tmdb_status, "no_ar")

    # Extrai o nome da rede principal (network[0]) — pode ser None
    networks = data.get("networks", [])
    network = networks[0].get("name") if networks else None

    # Extrai os nomes dos gêneros (TMDB retorna objetos {id, name})
    genres = [g["name"] for g in data.get("genres", []) if g.get("name")]

    # Título em pt-BR (retornado pelo TMDB quando language=pt-BR) ou original
    title = data.get("name") or data.get("original_name", "Sem título")

    return {
        "tmdb_id":        tmdb_id,
        "imdb_id":        data.get("external_ids", {}).get("imdb_id"),
        "title":          title,
        "title_original": data.get("original_name"),
        "first_air_date": data.get("first_air_date") or None,
        "last_air_date":  data.get("last_air_date") or None,
        "series_status":  series_status,
        "network":        network,
        "seasons_count":  data.get("number_of_seasons"),
        "episodes_count": data.get("number_of_episodes"),
        "overview":       data.get("overview") or None,
        "genres":         genres,
        # Poster w500 (catálogo); backdrop w1280 (banner de detalhe)
        "poster_url":     _img(data.get("poster_path"),   "w500"),
        "backdrop_url":   _img(data.get("backdrop_path"), "w1280"),
    }


# ─── Temporada e episódios ──────────────────────────────────────────────────

def get_season(tmdb_id: int, season_number: int) -> Optional[dict]:
    """Busca metadados de uma temporada e seus episódios no TMDB.

    Temporada 0 (Specials): deve ser IGNORADA pelo chamador — este
    método a retorna normalmente, mas sync_seasons() nunca a chama.

    Args:
        tmdb_id: ID do show no TMDB.
        season_number: Número da temporada (sempre >= 1; 0 = Specials, jamais chamado).

    Returns:
        Dict com campos da temporada e lista de episódios normalizados,
        ou None se a temporada não existir no TMDB.
    """
    data = _tmdb_get(
        f"{_TMDB_BASE}/tv/{tmdb_id}/season/{season_number}",
        params={"language": _LANG},
    )
    if not data:
        return None

    # Normaliza cada episódio retornado pelo TMDB
    episodes = []
    for ep in data.get("episodes", []):
        air_date = ep.get("air_date") or None
        still_url = _img(ep.get("still_path"), "w780")

        # Calcula airing_status baseado no air_date vs hoje
        airing_status = None
        if air_date:
            try:
                ep_date = date.fromisoformat(air_date)
                airing_status = "lancado" if ep_date <= date.today() else "agendado"
            except ValueError:
                # Data malformada — mantém airing_status como None
                airing_status = None

        episodes.append({
            "episode_number": ep.get("episode_number"),
            "title":          ep.get("name") or None,
            "air_date":       air_date,
            "overview":       (ep.get("overview") or "")[:2000] or None,
            "still_url":      still_url,
            "airing_status":  airing_status,
        })

    return {
        "season_number": season_number,
        "name":          data.get("name") or f"Temporada {season_number}",
        "episode_count": len(episodes),
        "air_date":      data.get("air_date") or None,
        "overview":      data.get("overview") or None,
        "poster_url":    _img(data.get("poster_path"), "w500"),
        "episodes":      episodes,
    }


# ─── Sincronização incremental ──────────────────────────────────────────────

def sync_seasons(
    conn,
    series_id: str,
    tmdb_id: int,
    seasons_count: int,
) -> dict:
    """Sincroniza temporadas e episódios de uma série no banco PostgreSQL.

    Para cada temporada (season_number >= 1, temporada 0 excluída):
    - Upserta a temporada na tabela `seasons`.
    - Para cada episódio: aplica skip-logic incremental antes de upsert.

    Skip-logic (episódio NÃO é atualizado quando):
    - Já existe no banco (seasons_number + episode_number presentes), E
    - air_date IS NOT NULL, E
    - still_url IS NOT NULL, E
    - air_date < hoje (já foi ao ar).
    Esses episódios têm dados completos e não mudam mais — evita chamadas desnecessárias.

    Args:
        conn: Conexão psycopg2 aberta (gerenciada pelo chamador).
        series_id: UUID da série na tabela `series`.
        tmdb_id: ID do show no TMDB.
        seasons_count: Número de temporadas a sincronizar.

    Returns:
        Dict com contadores: seasons_synced, episodes_upserted, episodes_skipped.
    """
    today = date.today()
    stats = {"seasons_synced": 0, "episodes_upserted": 0, "episodes_skipped": 0}

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Carrega todos os episódios existentes desta série para o skip-logic
        # (evita 1 query por episódio — carregamos tudo em memória de uma vez)
        cur.execute(
            """
            SELECT season_number, episode_number, air_date, still_url
            FROM series_episodes
            WHERE series_id = %s
            """,
            (series_id,),
        )
        # Mapa {(season_number, episode_number): {air_date, still_url}}
        existing: dict = {
            (r["season_number"], r["episode_number"]): r
            for r in cur.fetchall()
        }

    # Itera temporadas 1..seasons_count (temporada 0 = Specials, excluída)
    for sn in range(1, seasons_count + 1):
        season_data = get_season(tmdb_id, sn)
        if not season_data:
            # TMDB não tem dados desta temporada — pula sem erro
            logger.warning("TMDB sem dados para T%d do show %d", sn, tmdb_id)
            continue

        with conn.cursor() as cur:
            # Upserta a temporada (ON CONFLICT pelo UNIQUE(series_id, season_number))
            cur.execute(
                """
                INSERT INTO seasons (id, series_id, season_number, name,
                                     episode_count, air_date, overview, poster_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (series_id, season_number) DO UPDATE SET
                    name          = EXCLUDED.name,
                    episode_count = EXCLUDED.episode_count,
                    air_date      = EXCLUDED.air_date,
                    overview      = EXCLUDED.overview,
                    poster_url    = EXCLUDED.poster_url
                """,
                (
                    str(uuid.uuid4()),
                    series_id,
                    sn,
                    season_data["name"],
                    season_data["episode_count"],
                    season_data["air_date"],
                    season_data["overview"],
                    season_data["poster_url"],
                ),
            )
        stats["seasons_synced"] += 1

        # Processa episódios da temporada
        for ep in season_data["episodes"]:
            ep_num = ep["episode_number"]
            if ep_num is None:
                continue  # Episódio sem número — dado inválido do TMDB

            # Verifica se o episódio já existe no banco
            existing_ep = existing.get((sn, ep_num))
            if existing_ep:
                # Skip-logic: pula se tem dados completos e já foi ao ar
                has_air = existing_ep["air_date"] is not None
                has_still = existing_ep["still_url"] is not None
                already_aired = (
                    existing_ep["air_date"] is not None
                    and existing_ep["air_date"] < today
                )
                if has_air and has_still and already_aired:
                    stats["episodes_skipped"] += 1
                    continue

            # Upserta o episódio (ON CONFLICT pelo UNIQUE(series_id, season_number, episode_number))
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO series_episodes (id, series_id, season_number, episode_number,
                                         title, air_date, overview, still_url, airing_status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (series_id, season_number, episode_number) DO UPDATE SET
                        title          = EXCLUDED.title,
                        air_date       = EXCLUDED.air_date,
                        overview       = EXCLUDED.overview,
                        still_url      = EXCLUDED.still_url,
                        airing_status  = EXCLUDED.airing_status
                    """,
                    (
                        str(uuid.uuid4()),
                        series_id,
                        sn,
                        ep_num,
                        ep["title"],
                        ep["air_date"],
                        ep["overview"],
                        ep["still_url"],
                        ep["airing_status"],
                    ),
                )
            stats["episodes_upserted"] += 1

    logger.info(
        "sync_seasons série=%s: %d temporadas, %d eps upserted, %d skipped",
        series_id, stats["seasons_synced"], stats["episodes_upserted"], stats["episodes_skipped"],
    )
    return stats
