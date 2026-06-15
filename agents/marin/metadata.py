"""Clientes puros de APIs externas de metadados de anime — agente Marin.

Este módulo é responsável por buscar e normalizar dados de animes a partir
de quatro fontes externas públicas: Jikan (wrapper MyAnimeList), AniList
(GraphQL), ARM (bridge MAL→TMDB) e TMDB (thumbnails de episódios).

Ele é PURO — não importa nada de `agents.db` e não acessa o banco de dados.
A camada `tools.py` usa as funções daqui para enriquecer o catálogo antes
de persistir no PostgreSQL.

APIs utilizadas:
    - Jikan:  https://api.jikan.moe/v4  (sem auth)
    - AniList: https://graphql.anilist.co  (GraphQL, sem auth)
    - ARM:    https://arm.haglund.dev/api/v2/ids  (bridge MAL→TMDB, sem auth)
    - TMDB:   https://api.themoviedb.org/3  (auth: TMDB_API_KEY no env)

Usage:
    from agents.marin.metadata import search_anime, enrich_anime

    # Busca rápida por título
    resultados = search_anime("Dungeon Meshi")

    # Enriquecimento completo de um anime já conhecido pelo MAL ID
    dados = enrich_anime(mal_id=52701)
"""

import logging        # Registra erros sem interromper o fluxo do agente
import os             # Lê variáveis de ambiente (TMDB_API_KEY)
import time           # Delays de rate limiting entre chamadas às APIs
from datetime import datetime, timezone  # Conversão de timestamps Unix para datas ISO

import requests       # Cliente HTTP para todas as APIs (já no requirements.txt)


# ─────────────────────────────────────────────────────────────────────────────
# LOGGER
# ─────────────────────────────────────────────────────────────────────────────

# Logger nomeado para este módulo — permite filtrar mensagens de log
# por módulo quando o sistema estiver rodando no container.
log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES: URLs base de cada API
# ─────────────────────────────────────────────────────────────────────────────

# Jikan: wrapper público da MyAnimeList API (sem autenticação).
# Expõe gêneros, estúdio e sinopse que a API oficial não disponibiliza sem escopo admin.
JIKAN_BASE = "https://api.jikan.moe/v4"

# AniList: plataforma GraphQL que tem banners e schedule de episódios futuros.
ANILIST_URL = "https://graphql.anilist.co"

# ARM: bridge da comunidade que mapeia MAL ID → TMDB ID (sem autenticação).
# Usado pelo Taiga, MAL-Sync e outras ferramentas de anime.
ARM_URL = "https://arm.haglund.dev/api/v2/ids"

# TMDB: base de metadados com thumbnails de episódios (autenticação via TMDB_API_KEY).
TMDB_BASE = "https://api.themoviedb.org/3"

# Prefixo de URL para imagens do TMDB no tamanho w780 (stills de episódio).
TMDB_IMG_W780 = "https://image.tmdb.org/t/p/w780"


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES: Rate limiting (delays entre chamadas)
# ─────────────────────────────────────────────────────────────────────────────

# Jikan permite ~3 req/s oficial, mas na prática 1 req a cada 1.2s é mais seguro.
# Evita 429 (Too Many Requests) nos picos de uso.
JIKAN_DELAY: float = 1.2

# AniList permite 90 req/min (~1.5 req/s). Delay 0.8s dá margem confortável.
ANILIST_DELAY: float = 0.8

# ARM não tem rate limit documentado. Delay conservador de 0.5s por chamada.
ARM_DELAY: float = 0.5

# TMDB permite 40 req/10s (~4 req/s). Delay 0.3s respeita esse limite.
TMDB_DELAY: float = 0.3


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES: Retry e backoff exponencial
# ─────────────────────────────────────────────────────────────────────────────

# Número máximo de tentativas antes de desistir e retornar None.
MAX_RETRIES: int = 3

# Base do backoff exponencial: tentativa 1→2s, tentativa 2→4s, tentativa 3→8s.
RETRY_BACKOFF: float = 2.0


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES: Configurações de negócio
# ─────────────────────────────────────────────────────────────────────────────

# Animes com episódios demais que travariam o rate limit do Jikan.
# O mal_id 21 é One Piece (1100+ episódios) — buscamos metadados gerais,
# mas pulamos a busca paginada de episódios para esse grupo.
MAL_EPISODE_BLACKLIST: frozenset[int] = frozenset({21})

# Máximo de dias de diferença entre o `aired_from` do anime e a data de estreia
# de uma temporada no TMDB para aceitar o match de season.
# Se a diferença for maior que 365 dias, a temporada é rejeitada.
TMDB_SEASON_MATCH_MAX_DAYS: int = 365


# ─────────────────────────────────────────────────────────────────────────────
# MAPEAMENTOS: normalização dos campos de API para o schema da Marin
# ─────────────────────────────────────────────────────────────────────────────

# Converte o campo `type` do Jikan para o enum `media_type` do nosso banco.
# Tipos não mapeados (ex.: "Music") ficam como None e são ignorados.
_JIKAN_TYPE_MAP: dict[str, str] = {
    "TV":      "tv",
    "Movie":   "movie",
    "OVA":     "ova",
    "Special": "special",
    "ONA":     "ona",
}

# Converte o campo `status` do Jikan para o enum `airing_status` do nosso banco.
# O valor "Not yet aired" é mapeado para "nao_lancado".
_JIKAN_STATUS_MAP: dict[str, str] = {
    "Currently Airing": "no_ar",
    "Finished Airing":  "finalizado",
    "Not yet aired":    "nao_lancado",
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPER PRIVADO: HTTP com retry e backoff exponencial
# ─────────────────────────────────────────────────────────────────────────────

def _http_get(
    url: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    timeout: int = 30,
) -> dict | None:
    """Faz uma requisição GET com retry exponencial automático.

    Comportamento de erro:
    - 404: retorna None imediatamente (recurso não existe — não é erro)
    - 429 ou 5xx: aguarda backoff exponencial e tenta novamente
    - Outros 4xx: loga o body de resposta e retorna None sem retry
    - Exceção de rede: aguarda backoff e tenta novamente
    - Após MAX_RETRIES tentativas: retorna None (falha definitiva)

    Args:
        url: URL completa da requisição.
        params: Query string como dict (opcional).
        headers: Cabeçalhos HTTP adicionais (opcional).
        timeout: Timeout em segundos por tentativa.

    Returns:
        Dict com o JSON de resposta ou None em caso de falha.

    Example:
        >>> _http_get("https://api.jikan.moe/v4/anime/52701")
        {"data": {...}}
    """
    # Itera de 1 até MAX_RETRIES (inclusive) para controlar o backoff
    for tentativa in range(1, MAX_RETRIES + 1):
        try:
            # Faz a chamada HTTP GET com os parâmetros fornecidos
            resp = requests.get(
                url,
                params=params,
                headers=headers,
                timeout=timeout,
            )

            # 404: recurso não existe — retorna None sem logar erro
            if resp.status_code == 404:
                return None

            # 429 (Too Many Requests) ou 5xx (erro do servidor):
            # aguarda backoff exponencial e tenta de novo
            if resp.status_code == 429 or resp.status_code >= 500:
                # Backoff exponencial: tentativa 1→2s, 2→4s, 3→8s
                espera = RETRY_BACKOFF * (2 ** (tentativa - 1))
                log.warning(
                    "HTTP %s em %s (tentativa %d/%d) — aguardando %.1fs",
                    resp.status_code, url, tentativa, MAX_RETRIES, espera,
                )
                time.sleep(espera)
                continue  # vai para a próxima tentativa

            # Outros erros 4xx (ex.: 400, 401, 403): loga preview do body e desiste
            if 400 <= resp.status_code < 500:
                log.error(
                    "HTTP %s em %s: %s",
                    resp.status_code, url, resp.text[:500],
                )
                return None

            # Sucesso (2xx): retorna o JSON ou um dict vazio se body for vazio
            return resp.json() if resp.content else {}

        except requests.RequestException as exc:
            # Exceção de rede (timeout, DNS, conexão recusada, etc.)
            # Aplica o mesmo backoff exponencial e tenta de novo
            espera = RETRY_BACKOFF * (2 ** (tentativa - 1))
            log.warning(
                "Exceção de rede em %s (tentativa %d/%d): %s — aguardando %.1fs",
                url, tentativa, MAX_RETRIES, exc, espera,
            )
            time.sleep(espera)

    # Chegou aqui: todas as tentativas falharam
    log.error("Falha definitiva após %d tentativas em %s", MAX_RETRIES, url)
    return None


def _http_post_json(
    url: str,
    *,
    json_body: dict,
    headers: dict | None = None,
    timeout: int = 30,
) -> dict | None:
    """Faz uma requisição POST com corpo JSON e retry exponencial.

    Usado exclusivamente pelo cliente AniList (GraphQL via POST).
    Segue o mesmo padrão de retry do _http_get.

    Args:
        url: URL completa da requisição.
        json_body: Corpo da requisição como dict (serializado para JSON).
        headers: Cabeçalhos HTTP adicionais (opcional).
        timeout: Timeout em segundos por tentativa.

    Returns:
        Dict com o JSON de resposta ou None em caso de falha.
    """
    for tentativa in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(
                url,
                json=json_body,
                headers=headers,
                timeout=timeout,
            )

            # 429 ou 5xx: backoff e retry
            if resp.status_code == 429 or resp.status_code >= 500:
                espera = RETRY_BACKOFF * (2 ** (tentativa - 1))
                log.warning(
                    "HTTP %s em %s (tentativa %d/%d) — aguardando %.1fs",
                    resp.status_code, url, tentativa, MAX_RETRIES, espera,
                )
                time.sleep(espera)
                continue

            # Outros 4xx: loga e retorna None
            if 400 <= resp.status_code < 500:
                log.error(
                    "HTTP %s em %s: %s",
                    resp.status_code, url, resp.text[:500],
                )
                return None

            return resp.json() if resp.content else {}

        except requests.RequestException as exc:
            espera = RETRY_BACKOFF * (2 ** (tentativa - 1))
            log.warning(
                "Exceção de rede em %s (tentativa %d/%d): %s — aguardando %.1fs",
                url, tentativa, MAX_RETRIES, exc, espera,
            )
            time.sleep(espera)

    log.error("Falha definitiva após %d tentativas em %s", MAX_RETRIES, url)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# HELPER PRIVADO: autenticação do TMDB (detecção dual v3/v4)
# ─────────────────────────────────────────────────────────────────────────────

def _tmdb_auth() -> tuple[dict | None, dict | None]:
    """Resolve os headers e params de autenticação do TMDB (v3 api_key).

    Returns:
        Tupla (headers, params). headers é sempre {} (sem auth no header);
        params contém {"api_key": key} quando configurado.
        Retorna (None, None) se TMDB_API_KEY não estiver configurado —
        TMDB é opcional para a Marin (thumbnails ficam None sem erro).
    """
    # Lê a API key v3 do ambiente — retorna None se não configurado
    key = os.environ.get("TMDB_API_KEY", "").strip()

    # Sem key configurada: TMDB desabilitado — thumbnails ficam NULL, sem erro
    if not key:
        return None, None

    # Autentica via query param ?api_key=... (padrão v3)
    return {}, {"api_key": key}


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES PÚBLICAS: Jikan
# ─────────────────────────────────────────────────────────────────────────────

def search_anime(query: str, limit: int = 5) -> list[dict]:
    """Busca animes no Jikan por título ou termo de pesquisa.

    Consulta o endpoint público `/anime` do Jikan e retorna uma lista
    normalizada com os campos principais de cada resultado. Útil para
    o usuário informar um título e o sistema identificar o `mal_id` correto
    antes de enriquecer os metadados completos.

    Args:
        query: Título ou termo de busca (ex.: "Dungeon Meshi", "shonen 2024").
        limit: Número máximo de resultados a retornar (padrão: 5).

    Returns:
        Lista de dicts com os campos: mal_id, title, title_english, type,
        airing_status, episodes_total, score, season, year, poster_url.
        Retorna lista vazia em caso de erro ou resultado vazio.

    Example:
        >>> resultados = search_anime("Delicious in Dungeon")
        >>> resultados[0]["title"]
        'Dungeon Meshi'
    """
    # Monta a URL de busca e os parâmetros de query string
    url = f"{JIKAN_BASE}/anime"
    params = {
        "q":     query,      # texto de busca
        "limit": limit,      # máximo de resultados
        "sfw":   "false",    # inclui conteúdo adulto (18+) se necessário
    }

    # Faz a requisição com retry automático
    dados = _http_get(url, params=params)

    # Delay de rate limiting após a chamada (independente de sucesso ou falha)
    time.sleep(JIKAN_DELAY)

    # Sem dados (erro ou API fora): retorna lista vazia sem quebrar o agente
    if not dados or "data" not in dados:
        return []

    # Normaliza cada item da lista para o formato interno do sistema
    resultados: list[dict] = []
    for item in dados["data"]:
        # Determina o tipo de mídia usando o mapeamento definido acima.
        # Tipos desconhecidos (ex.: "Music") ficam como None.
        media_type = _JIKAN_TYPE_MAP.get(item.get("type") or "", None)

        # Determina o status de exibição usando o mapeamento.
        # Status desconhecidos ficam como None.
        airing_status = _JIKAN_STATUS_MAP.get(item.get("status") or "", None)

        # Extrai a URL do pôster em alta resolução.
        # Navega pelo dict aninhado com .get() seguro em cada nível.
        imagens = item.get("images") or {}
        poster_url = (imagens.get("jpg") or {}).get("large_image_url")

        resultados.append({
            "mal_id":         item.get("mal_id"),
            "title":          item.get("title"),
            "title_english":  item.get("title_english"),
            "type":           media_type,         # já normalizado para nosso enum
            "airing_status":  airing_status,      # já normalizado para nosso enum
            "episodes_total": item.get("episodes"),
            "score":          item.get("score"),
            "season":         item.get("season"),
            "year":           item.get("year"),
            "poster_url":     poster_url,
        })

    return resultados


def jikan_get_full(mal_id: int) -> dict | None:
    """Busca metadados completos de um anime no Jikan.

    Consulta o endpoint `/anime/{mal_id}/full` que retorna todos os campos
    de metadados do anime, incluindo gêneros, estúdio, sinopse e temporada.
    Os campos são renomeados e normalizados para o schema do banco da Marin.

    Args:
        mal_id: ID do anime no MyAnimeList.

    Returns:
        Dict normalizado com os campos: title, title_english, title_japanese,
        media_type, season, studio, episodes_total, airing_status, overview,
        genres, poster_url, mal_updated_at. Retorna None se o anime não for
        encontrado ou em caso de erro.

    Example:
        >>> dados = jikan_get_full(52701)
        >>> dados["title"]
        'Dungeon Meshi'
    """
    # Monta a URL para o endpoint de metadados completos
    url = f"{JIKAN_BASE}/anime/{mal_id}/full"

    # Faz a requisição — 404 retorna None automaticamente pelo _http_get
    dados = _http_get(url)

    # Delay de rate limiting após a chamada
    time.sleep(JIKAN_DELAY)

    # Sem dados: anime não encontrado ou erro de rede
    if not dados or "data" not in dados:
        return None

    # Extrai o objeto principal da resposta
    item = dados["data"]

    # ── Media type (nosso enum) ───────────────────────────────────────────────
    # Converte "TV" → "tv", "Movie" → "movie", etc.
    media_type = _JIKAN_TYPE_MAP.get(item.get("type") or "", None)

    # ── Airing status (nosso enum) ────────────────────────────────────────────
    # Converte "Finished Airing" → "finalizado", "Currently Airing" → "no_ar", etc.
    airing_status = _JIKAN_STATUS_MAP.get(item.get("status") or "", None)

    # ── Temporada ─────────────────────────────────────────────────────────────
    # Combina "winter" + 2024 → "winter 2024". Se algum campo for None, fica None.
    season_name = item.get("season")   # ex.: "winter"
    season_year = item.get("year")     # ex.: 2024
    season = f"{season_name} {season_year}" if season_name and season_year else None

    # ── Estúdio ───────────────────────────────────────────────────────────────
    # Pega apenas o primeiro estúdio da lista (geralmente o principal).
    studios = item.get("studios") or []
    studio = studios[0]["name"] if studios else None

    # ── Gêneros ───────────────────────────────────────────────────────────────
    # Transforma lista de dicts [{name: "Adventure"}, ...] em lista de strings.
    genres_raw = item.get("genres") or []
    genres = [g["name"] for g in genres_raw if g.get("name")]

    # ── Pôster ────────────────────────────────────────────────────────────────
    # Tenta pegar a versão de alta resolução; fallback para versão normal.
    imagens = item.get("images") or {}
    jpg = imagens.get("jpg") or {}
    poster_url = jpg.get("large_image_url") or jpg.get("image_url")

    # ── Data de atualização (aired.from) ──────────────────────────────────────
    # Usada como `mal_updated_at` para controle de sincronização.
    # O campo `aired` do Jikan contém `from` e `to` com as datas de exibição.
    aired = item.get("aired") or {}
    mal_updated_at = aired.get("from")   # pode ser None para animes futuros

    return {
        "title":           item.get("title"),
        "title_english":   item.get("title_english"),
        "title_japanese":  item.get("title_japanese"),
        "media_type":      media_type,
        "season":          season,
        "studio":          studio,
        "episodes_total":  item.get("episodes"),
        "airing_status":   airing_status,
        "overview":        item.get("synopsis"),
        "genres":          genres,
        "poster_url":      poster_url,
        "mal_updated_at":  mal_updated_at,
    }


def jikan_get_episodes(mal_id: int) -> list[dict]:
    """Busca a lista completa de episódios de um anime no Jikan (paginado).

    Itera pelas páginas do endpoint `/anime/{mal_id}/episodes` até que
    `pagination.has_next_page` seja False. Respeita a blacklist — retorna
    lista vazia para animes com mais de 1000 episódios (como One Piece)
    para não travar o rate limit do Jikan.

    Args:
        mal_id: ID do anime no MyAnimeList.

    Returns:
        Lista de dicts por episódio com os campos: number, title, aired
        (string YYYY-MM-DD ou None), synopsis (truncado em 2000 chars),
        airing_status ('lancado' se `aired` preenchido, 'agendado' se não).
        Retorna lista vazia para animes na blacklist ou em caso de erro.

    Example:
        >>> eps = jikan_get_episodes(52701)
        >>> eps[0]
        {"number": 1, "title": "A Corpse That Won't Rot", "aired": "2024-01-04", ...}
    """
    # Verifica blacklist antes de qualquer requisição.
    # One Piece (mal_id=21) tem 1100+ episódios — fazer ~11 chamadas paginadas
    # seguidas violaria o rate limit do Jikan e travaria o processo.
    if mal_id in MAL_EPISODE_BLACKLIST:
        log.info("mal_id=%d está na blacklist — pulando busca de episódios.", mal_id)
        return []

    # Acumula todos os episódios de todas as páginas
    episodios: list[dict] = []
    pagina = 1  # começa na primeira página

    # Loop de paginação: continua enquanto houver mais páginas
    while True:
        url = f"{JIKAN_BASE}/anime/{mal_id}/episodes"
        params = {"page": pagina}

        # Faz a requisição desta página
        dados = _http_get(url, params=params)

        # Delay de rate limiting após cada chamada paginada
        time.sleep(JIKAN_DELAY)

        # Sem dados nesta página (erro ou página vazia): encerra a paginação
        if not dados or "data" not in dados:
            break

        # Processa cada episódio da página atual
        for ep in dados["data"]:
            # Extrai a data do episódio em formato ISO (só os 10 primeiros chars: YYYY-MM-DD).
            # O Jikan retorna "2024-01-04T00:00:00+00:00"; queremos só "2024-01-04".
            aired_raw = ep.get("aired")
            aired = aired_raw[:10] if aired_raw else None

            # Determina o status do episódio:
            # - Se tem data de exibição → já foi ao ar → "lancado"
            # - Se não tem data → ainda não foi ao ar → "agendado"
            airing_status = "lancado" if aired else "agendado"

            # Extrai a sinopse e trunca a 2000 chars para higiene de dados.
            # O Jikan às vezes retorna None para episódios sem sinopse cadastrada.
            synopsis_raw = ep.get("synopsis")
            synopsis = synopsis_raw[:2000] if synopsis_raw else None

            episodios.append({
                "number":        ep.get("mal_id"),    # numero do episodio (mal_id é o número aqui)
                "title":         ep.get("title"),
                "aired":         aired,                # formato YYYY-MM-DD ou None
                "synopsis":      synopsis,             # truncado em 2000 chars
                "airing_status": airing_status,        # 'lancado' ou 'agendado'
            })

        # Verifica se há mais páginas para buscar
        paginacao = dados.get("pagination") or {}
        tem_proxima = paginacao.get("has_next_page", False)

        if not tem_proxima:
            # Última página — encerra o loop
            break

        # Avança para a próxima página
        pagina += 1

    return episodios


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES PÚBLICAS: AniList (GraphQL)
# ─────────────────────────────────────────────────────────────────────────────

# Query GraphQL para buscar banner e schedule de episódios no AniList.
# Aceita `idMal` (MAL ID) diretamente — não precisa de ID próprio da AniList.
# `notYetAired: false` inclui episódios já exibidos no airingSchedule.
_ANILIST_QUERY = """
query ($malId: Int) {
  Media(idMal: $malId, type: ANIME) {
    id
    bannerImage
    airingSchedule(perPage: 100, notYetAired: false) {
      nodes {
        episode
        airingAt
      }
    }
  }
}
"""


def anilist_get_data(
    mal_id: int,
) -> tuple[int | None, str | None, list[dict]]:
    """Busca dados complementares do AniList via GraphQL.

    Consulta banner de alta qualidade e schedule de episódios (datas de exibição
    com precisão de timestamp Unix). Complementa os dados do Jikan, que não tem
    banners ou schedule futuro preciso.

    Args:
        mal_id: ID do anime no MyAnimeList (usado como `idMal` na query).

    Returns:
        Tupla com três elementos:
        - anilist_id: ID interno do anime na AniList (int) ou None.
        - banner_url: URL da imagem de banner (str) ou None.
        - schedule_episodes: Lista de dicts com {number: int, aired: str ISO,
          airing_status: 'lancado'|'agendado'}. Lista vazia se sem schedule.

    Example:
        >>> anilist_id, banner, schedule = anilist_get_data(52701)
        >>> banner
        'https://s4.anilist.co/file/anilistcdn/media/anime/banner/...'
    """
    # Headers obrigatórios para a API GraphQL do AniList
    headers = {"Content-Type": "application/json"}

    # Corpo da requisição POST com a query e as variáveis
    corpo = {
        "query":     _ANILIST_QUERY,
        "variables": {"malId": mal_id},
    }

    # Faz a requisição POST com retry automático
    dados = _http_post_json(ANILIST_URL, json_body=corpo, headers=headers)

    # Delay de rate limiting após a chamada
    time.sleep(ANILIST_DELAY)

    # Sem dados ou erro: retorna tuple de None/lista vazia sem quebrar o agente
    if not dados:
        return None, None, []

    # Navega na estrutura GraphQL: data → Media
    media = (dados.get("data") or {}).get("Media")

    # Se Media for null (anime não encontrado no AniList), retorna graciosamente
    if not media:
        return None, None, []

    # Extrai o ID interno da AniList (diferente do mal_id)
    anilist_id: int | None = media.get("id")

    # Extrai a URL do banner (pode ser None para animes sem banner)
    banner_url: str | None = media.get("bannerImage")

    # ── Schedule de episódios ─────────────────────────────────────────────────
    # O airingSchedule contém episódios passados e futuros com timestamp Unix.
    # Precisamos converter airingAt (Unix timestamp) → data ISO YYYY-MM-DD.
    schedule_raw = (media.get("airingSchedule") or {}).get("nodes") or []
    schedule_episodes: list[dict] = []

    for node in schedule_raw:
        numero = node.get("episode")
        airing_at = node.get("airingAt")  # timestamp Unix (segundos desde 1970)

        # Pula episódios sem timestamp (dados incompletos da AniList)
        if not numero or not airing_at:
            continue

        # Converte timestamp Unix para data ISO no fuso UTC.
        # Usamos UTC porque o TMDB e Jikan também usam UTC para datas.
        data_exibicao = datetime.fromtimestamp(airing_at, tz=timezone.utc).date().isoformat()

        # Compara com a data atual para determinar o status do episódio:
        # - Data no passado ou hoje → "lancado"
        # - Data no futuro → "agendado"
        hoje = datetime.now(timezone.utc).date().isoformat()
        airing_status = "lancado" if data_exibicao <= hoje else "agendado"

        schedule_episodes.append({
            "number":        numero,
            "aired":         data_exibicao,
            "airing_status": airing_status,
        })

    return anilist_id, banner_url, schedule_episodes


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES PÚBLICAS: ARM (bridge MAL → TMDB)
# ─────────────────────────────────────────────────────────────────────────────

def arm_get_tmdb_id(mal_id: int) -> tuple[int | None, str | None]:
    """Resolve o TMDB ID de um anime via ARM bridge.

    O ARM (Anime Relationships Mapper) é um serviço comunitário que mantém
    o mapeamento canônico entre MAL IDs e TMDB IDs. Usado pelo Taiga,
    MAL-Sync e outras ferramentas da comunidade de anime.

    Args:
        mal_id: ID do anime no MyAnimeList.

    Returns:
        Tupla (tmdb_id, media_type) onde:
        - tmdb_id: ID do anime no TMDB (int) ou None se não mapeado.
        - media_type: 'tv' ou 'movie' (str) ou None se não disponível.
        Retorna (None, None) se o anime não está no TMDB ou em caso de erro.

    Example:
        >>> tmdb_id, tipo = arm_get_tmdb_id(52701)
        >>> tmdb_id
        227765
        >>> tipo
        'tv'
    """
    # Monta a URL com o mal_id como parâmetro de busca
    url = ARM_URL
    params = {
        "source": "myanimelist",
        "id":     mal_id,
    }

    # Faz a requisição com retry automático
    dados = _http_get(url, params=params)

    # Delay de rate limiting após a chamada (hardcoded 0.5s conforme spec)
    time.sleep(ARM_DELAY)

    # Sem dados (erro ou anime não encontrado no ARM): retorna None graciosamente
    if not dados:
        return None, None

    # Extrai tmdb_id — pode ser None se o anime não está no TMDB
    tmdb_id = dados.get("tmdb")

    # Extrai o tipo: "tv" ou "movie" (ou None)
    media_type = dados.get("type")

    # Valida que o tipo é um dos valores esperados.
    # Se for outro valor (ex.: "ova"), retornamos None para evitar chamar
    # o endpoint errado do TMDB.
    if media_type not in ("tv", "movie"):
        return None, None

    return tmdb_id, media_type


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÕES PÚBLICAS: TMDB (thumbnails de episódios)
# ─────────────────────────────────────────────────────────────────────────────

def tmdb_get_episode_thumbnail(
    tmdb_id: int,
    mal_aired_from: str | None,
    episode_number: int,
) -> str | None:
    """Busca o thumbnail (still) de um episódio específico no TMDB.

    O TMDB organiza episódios por temporada, não por série completa.
    Para encontrar o episódio certo, precisamos primeiro identificar qual
    temporada (season_num) corresponde ao anime, usando a data de estreia
    como referência. Só então buscamos o thumbnail do episódio.

    Esta função só opera se `TMDB_API_KEY` estiver configurado no ambiente.
    Sem o token, retorna None imediatamente sem logar erro (comportamento
    esperado para instalações sem conta TMDB).

    Args:
        tmdb_id: ID da série no TMDB (obtido via arm_get_tmdb_id).
        mal_aired_from: Data de início do anime no formato ISO 8601
            (ex.: "2024-01-04T00:00:00+00:00" ou "2024-01-04").
            Usada para encontrar a temporada correta por proximidade de data.
        episode_number: Número do episódio dentro do anime.

    Returns:
        URL completa da imagem de thumbnail no formato w780 (str) ou None
        se o token não estiver configurado, episódio sem imagem, ou erro.

    Example:
        >>> url = tmdb_get_episode_thumbnail(227765, "2024-01-04", 1)
        >>> url
        'https://image.tmdb.org/t/p/w780/abc123.jpg'
    """
    # Verifica autenticação — sem token, TMDB está desabilitado
    tmdb_headers, tmdb_params = _tmdb_auth()
    if tmdb_headers is None:
        # Comportamento esperado quando TMDB_API_KEY não está configurado.
        # Não loga erro — é uma feature opcional.
        return None

    # ── Passo 1: Busca informações da série para listar as temporadas ──────────
    url_serie = f"{TMDB_BASE}/tv/{tmdb_id}"
    dados_serie = _http_get(url_serie, params=tmdb_params, headers=tmdb_headers)

    # Delay de rate limiting após chamada ao TMDB
    time.sleep(TMDB_DELAY)

    # Sem dados da série: não conseguimos identificar a temporada
    if not dados_serie:
        return None

    # ── Passo 2: Identifica a temporada correta por proximidade de data ────────
    # O TMDB pode ter várias temporadas para um anime (ex.: Shingeki no Kyojin
    # tem Temporada 1, 2, 3, 4, etc.). Precisamos identificar qual corresponde
    # ao `mal_aired_from` do anime que estamos processando.

    # Converte a data de início do anime para objeto date comparável.
    # Aceita tanto "2024-01-04T00:00:00+00:00" quanto "2024-01-04".
    data_inicio_anime = None
    if mal_aired_from:
        try:
            # Tenta parsear como datetime com timezone (formato completo do Jikan)
            data_inicio_anime = datetime.fromisoformat(mal_aired_from).date()
        except ValueError:
            try:
                # Fallback: parseia só os 10 primeiros chars como data simples
                data_inicio_anime = datetime.strptime(mal_aired_from[:10], "%Y-%m-%d").date()
            except ValueError:
                # Se não conseguir parsear, continua sem a data (season_num = 1)
                pass

    temporadas = dados_serie.get("seasons") or []

    # Número da temporada padrão: 1 (usado quando não conseguimos fazer o match por data)
    season_num = 1

    if data_inicio_anime and temporadas:
        # Encontra a temporada cuja data de estreia é mais próxima da data do anime.
        # Ignora temporadas especiais (season_number = 0, geralmente extras/OVAs).
        melhor_temporada = None
        menor_diferenca = None

        for temporada in temporadas:
            # Ignora temporada 0 (especiais) e temporadas sem data de estreia
            numero_temp = temporada.get("season_number", 0)
            data_str = temporada.get("air_date")

            if numero_temp == 0 or not data_str:
                continue

            try:
                data_temp = datetime.strptime(data_str[:10], "%Y-%m-%d").date()
            except ValueError:
                continue

            # Calcula diferença em dias entre a data da temporada e a data do anime
            diferenca = abs((data_temp - data_inicio_anime).days)

            # Rejeita temporadas com diferença maior que TMDB_SEASON_MATCH_MAX_DAYS (1 ano)
            if diferenca > TMDB_SEASON_MATCH_MAX_DAYS:
                continue

            # Atualiza o melhor match se esta temporada for mais próxima
            if menor_diferenca is None or diferenca < menor_diferenca:
                menor_diferenca = diferenca
                melhor_temporada = numero_temp

        # Usa a temporada encontrada, ou mantém o padrão 1 se não houve match
        if melhor_temporada is not None:
            season_num = melhor_temporada

    # ── Passo 3: Busca imagens do episódio na temporada identificada ───────────
    url_images = f"{TMDB_BASE}/tv/{tmdb_id}/season/{season_num}/episode/{episode_number}/images"
    dados_imagens = _http_get(url_images, params=tmdb_params, headers=tmdb_headers)

    # Delay de rate limiting após chamada ao TMDB
    time.sleep(TMDB_DELAY)

    # Sem dados ou sem stills: episódio sem thumbnail no TMDB
    if not dados_imagens:
        return None

    # Pega o primeiro still disponível (geralmente a imagem de melhor qualidade)
    stills = dados_imagens.get("stills") or []
    if not stills:
        return None

    # Monta a URL completa com o prefixo de imagem w780
    file_path = stills[0].get("file_path")
    if not file_path:
        return None

    return f"{TMDB_IMG_W780}{file_path}"


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÃO PÚBLICA: orquestrador principal
# ─────────────────────────────────────────────────────────────────────────────

def enrich_anime(mal_id: int, mal_aired_from: str | None = None) -> dict:
    """Enriquece um anime com dados de todas as APIs disponíveis.

    Orquestra as chamadas ao Jikan, AniList, ARM e TMDB em sequência,
    combinando os resultados em um único dict pronto para upsert no banco.
    Cada etapa tem fallback gracioso — se uma API falhar, os campos ficam
    como None sem interromper o processo ou lançar exceção.

    A ordem de chamadas é:
    1. jikan_get_full: metadados principais + data de início
    2. anilist_get_data: banner URL + schedule de episódios
    3. arm_get_tmdb_id: resolve tmdb_id para uso no TMDB
    4. jikan_get_episodes: lista completa de episódios (paginado)
    5. Merge de episódios Jikan + schedule AniList (AniList tem prioridade
       para datas dos episódios futuros)

    Args:
        mal_id: ID do anime no MyAnimeList.
        mal_aired_from: Data de início do anime (opcional). Se não fornecida,
            é extraída do retorno do jikan_get_full. Usada para o match de
            temporada no TMDB.

    Returns:
        Dict completo pronto para upsert no banco com os campos:
        title, title_english, title_japanese, media_type, season, studio,
        episodes_total, airing_status, overview, genres, poster_url,
        banner_url, anilist_id, tmdb_id, tmdb_type, jikan_episodes (lista),
        mal_aired_from. Campos indisponíveis ficam como None.

    Example:
        >>> dados = enrich_anime(52701)
        >>> dados["title"]
        'Dungeon Meshi'
        >>> dados["banner_url"]
        'https://s4.anilist.co/file/anilistcdn/media/anime/banner/...'
    """
    # ── Etapa 1: Jikan — metadados principais ─────────────────────────────────
    # Esta é a fonte primária de dados. Sem ela, retornamos um dict mínimo.
    try:
        jikan_data = jikan_get_full(mal_id)
    except Exception as exc:
        # Captura qualquer exceção inesperada para não interromper o processo
        log.error("Erro inesperado em jikan_get_full(%d): %s", mal_id, exc)
        jikan_data = None

    # Extrai `aired_from` do Jikan se não foi fornecido pelo chamador.
    # É usado para o match de temporada no TMDB mais adiante.
    if not mal_aired_from and jikan_data:
        mal_aired_from = jikan_data.get("mal_updated_at")

    # ── Etapa 2: AniList — banner e schedule de episódios ─────────────────────
    try:
        anilist_id, banner_url, schedule_episodes = anilist_get_data(mal_id)
    except Exception as exc:
        log.error("Erro inesperado em anilist_get_data(%d): %s", mal_id, exc)
        anilist_id = None
        banner_url = None
        schedule_episodes = []

    # ── Etapa 3: ARM — resolve TMDB ID ────────────────────────────────────────
    try:
        tmdb_id, tmdb_type = arm_get_tmdb_id(mal_id)
    except Exception as exc:
        log.error("Erro inesperado em arm_get_tmdb_id(%d): %s", mal_id, exc)
        tmdb_id = None
        tmdb_type = None

    # ── Etapa 4: Jikan — lista de episódios (paginado) ────────────────────────
    try:
        jikan_episodes = jikan_get_episodes(mal_id)
    except Exception as exc:
        log.error("Erro inesperado em jikan_get_episodes(%d): %s", mal_id, exc)
        jikan_episodes = []

    # ── Etapa 5: Merge de episódios Jikan + schedule AniList ──────────────────
    # O AniList tem datas mais precisas para episódios futuros.
    # Fazemos merge: criamos um índice por número de episódio do schedule AniList
    # e sobrescrevemos as datas dos episódios do Jikan quando disponíveis.
    if schedule_episodes:
        # Cria um mapa {number: {"aired": "...", "airing_status": "..."}}
        schedule_map = {ep["number"]: ep for ep in schedule_episodes}

        # Atualiza episódios do Jikan com dados mais precisos do AniList
        for ep in jikan_episodes:
            numero = ep.get("number")
            if numero in schedule_map:
                # Sobrescreve aired e airing_status com os dados do AniList
                ep["aired"] = schedule_map[numero]["aired"]
                ep["airing_status"] = schedule_map[numero]["airing_status"]

        # Adiciona episódios que estão no AniList mas não estavam no Jikan
        # (pode acontecer para episódios futuros não cadastrados ainda no Jikan)
        numeros_jikan = {ep.get("number") for ep in jikan_episodes}
        for ep_anilist in schedule_episodes:
            if ep_anilist["number"] not in numeros_jikan:
                jikan_episodes.append({
                    "number":        ep_anilist["number"],
                    "title":         None,       # AniList não tem título de episódio
                    "aired":         ep_anilist["aired"],
                    "synopsis":      None,
                    "airing_status": ep_anilist["airing_status"],
                })

    # ── Monta o dict final com todos os dados combinados ──────────────────────
    # Campos do Jikan ficam como None se jikan_data for None.
    resultado: dict = {
        # Campos principais do Jikan
        "title":          (jikan_data or {}).get("title"),
        "title_english":  (jikan_data or {}).get("title_english"),
        "title_japanese": (jikan_data or {}).get("title_japanese"),
        "media_type":     (jikan_data or {}).get("media_type"),
        "season":         (jikan_data or {}).get("season"),
        "studio":         (jikan_data or {}).get("studio"),
        "episodes_total": (jikan_data or {}).get("episodes_total"),
        "airing_status":  (jikan_data or {}).get("airing_status"),
        "overview":       (jikan_data or {}).get("overview"),
        "genres":         (jikan_data or {}).get("genres") or [],
        "poster_url":     (jikan_data or {}).get("poster_url"),

        # Campos do AniList
        "banner_url":     banner_url,
        "anilist_id":     anilist_id,

        # Campos do ARM + TMDB
        "tmdb_id":        tmdb_id,
        "tmdb_type":      tmdb_type,

        # Data de início (usada para match de temporada TMDB)
        "mal_aired_from": mal_aired_from,

        # Lista de episódios mesclada (Jikan + AniList)
        "jikan_episodes": jikan_episodes,
    }

    return resultado
