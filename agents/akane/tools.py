"""Camada de lógica única do agente Akane — cinemateca pessoal de filmes.

Este módulo é a ÚNICA dona da lógica de negócio do domínio filmes.
Tanto o router FastAPI (/api/movies/*) quanto o agente Telegram (akane_agent)
são fachadas finas que importam estas funções — nenhuma regra de negócio fora
daqui (FR-016).

Integrações:
    - PostgreSQL via agents.db (run_select, run_dml, get_conn)
    - TMDB API (v3 api_key, TMDB_API_KEY) — metadados e pôsteres com fallback gracioso
    - Letterboxd RSS/CSV — ingestão (via scripts de sync)

Usage:
    from agents.akane.tools import add_movie, log_watch, get_stats
"""

import hashlib      # Hash determinístico (estável entre processos) da paleta de pôster
import os           # Lê variáveis de ambiente (TMDB_API_KEY, etc.)
import re           # Remove pontuação na normalização de strings
import time         # Backoff exponencial nas chamadas ao TMDB
import unicodedata  # Remove acentos na normalização fuzzy
import uuid         # Gera IDs únicos para cada filme/sessão/etc.
from datetime import datetime, date, timedelta  # Tipos de data — fuso São Paulo
from zoneinfo import ZoneInfo        # Fuso horário do Brasil

import requests     # Chamadas HTTP ao TMDB e Letterboxd (já no requirements.txt)

# Helpers de banco compartilhados entre todos os agentes
from agents.db import get_conn, run_select, run_dml


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES GLOBAIS
# ─────────────────────────────────────────────────────────────────────────────

# Fuso horário do usuário (Brasil — UTC-3).
# Usado em _today() para garantir datas corretas perto da meia-noite.
_TZ = ZoneInfo("America/Sao_Paulo")

# URL base da TMDB API v3. Auth = api_key v3 em TMDB_API_KEY.
_TMDB_BASE = "https://api.themoviedb.org/3"

# Prefixos de URL para imagens do TMDB.
# w500 = pôsteres (proporção 2:3); w1280 = backdrops (hero horizontal).
_TMDB_IMG_POSTER   = "https://image.tmdb.org/t/p/w500"
_TMDB_IMG_BACKDROP = "https://image.tmdb.org/t/p/w1280"

# Idioma dos metadados TMDB — inglês (spec 050, FR-005). Filmes gravados antes desta
# mudança continuam em português até "Buscar Dados" ser acionado neles (sem migração em massa).
_TMDB_LANG = "en-US"

# As 14 paletas de pôster tipográfico (fallback quando poster_url é NULL).
# Cada paleta define bg (fundo), ink (texto) e accent (cor de destaque).
# Mapeadas por um hash do título do filme para ser determinístico
# (mesmo título → sempre a mesma paleta).
_POSTER_PALETTES = [
    "noir", "ember", "rose", "neon", "teal", "gold", "ink",
    "blood", "forest", "dusk", "bone", "slate", "wine", "sea",
]

# Status válidos de um filme no catálogo.
_VALID_STATUSES = {"watchlist", "watched"}

# Tipos válidos de item no Cofre de conteúdos.
_VALID_VAULT_TYPES = {"video", "article", "essay", "review"}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — infraestrutura
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    """Retorna o datetime atual no fuso horário de São Paulo.

    Returns:
        Datetime com timezone America/Sao_Paulo.
    """
    return datetime.now(_TZ)


def _today() -> date:
    """Retorna a data de hoje no fuso horário de São Paulo.

    Não usa date.today() direto porque o servidor pode estar em UTC
    e a data poderia estar errada perto da meia-noite no Brasil.

    Returns:
        Data local do usuário (America/Sao_Paulo).
    """
    return _now().date()


def _norm(s: str) -> str:
    """Normaliza string para busca fuzzy: minúsculas, sem acentos, sem pontuação.

    Usa decomposição NFD para separar a letra base do diacrítico (acento),
    depois descarta os diacríticos (categoria Unicode "Mn"). Assim "Duna",
    "duna" e "düna" são tratados como iguais.

    Args:
        s: String a normalizar.

    Returns:
        String em minúsculas sem acentos e sem pontuação.

    Example:
        >>> _norm("Amélie (2001)")
        'amelie 2001'
    """
    # Tira espaços nas bordas e converte para minúsculas
    s = s.strip().lower()
    # NFD decompõe caracteres acentuados em letra-base + marcas separadas
    nfd = unicodedata.normalize("NFD", s)
    # Mantém apenas caracteres que NÃO são marcas combinantes (categoria Mn)
    s = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    # Remove pontuação comum (vírgula, dois-pontos, etc.) para não separar palavras
    s = re.sub(r'[,.;:!?()\[\]{}]', ' ', s)
    # Colapsa múltiplos espaços em um único
    s = re.sub(r' +', ' ', s).strip()
    return s


def _poster_palette(title: str) -> str:
    """Retorna uma paleta de pôster tipográfico determinística baseada no título.

    O índice é calculado pelo hash MD5 do título normalizado, garantindo que o
    mesmo filme sempre receba a mesma paleta — em qualquer execução do
    processo. Importante usar `hashlib.md5` (e não o `hash()` nativo do
    Python): `hash()` de string é salgado por processo via `PYTHONHASHSEED`
    e muda a cada reinício do servidor, quebrando a determinística prometida.

    Args:
        title: Título do filme.

    Returns:
        Nome de uma das 14 paletas (ex.: "teal", "noir", "rose").

    Example:
        >>> _poster_palette("Perfect Blue")
        'teal'
    """
    # hashlib.md5 é estável entre processos/reinícios, diferente de hash() nativo
    digest = hashlib.md5(_norm(title).encode()).hexdigest()
    return _POSTER_PALETTES[int(digest, 16) % len(_POSTER_PALETTES)]


def _ok(data: dict | None = None, **kwargs) -> dict:
    """Retorna um dict de sucesso no padrão do projeto.

    Args:
        data: Dados opcionais a mesclar no retorno.
        **kwargs: Campos adicionais.

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


def _validate_rating(rating: float | int | None) -> str | None:
    """Valida que a nota está no intervalo [0.5, 5.0] em passos de 0.5.

    Args:
        rating: Nota a validar, ou None para nota ausente.

    Returns:
        None se válida, mensagem de erro se inválida.
    """
    if rating is None:
        # Nota ausente é permitida (assistiu sem avaliar)
        return None
    # Verifica o intervalo numérico
    if not (0.5 <= float(rating) <= 5.0):
        return "Nota inválida: deve ser entre 0.5 e 5.0"
    # Verifica que é múltiplo de 0.5 (meia-estrela é o mínimo)
    if round(float(rating) * 2) != float(rating) * 2:
        return "Nota inválida: use passos de 0.5 (ex.: 3.5, 4.0)"
    return None


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTE TMDB — com retry/backoff e fallback gracioso
# ─────────────────────────────────────────────────────────────────────────────

def _tmdb_api_key() -> str:
    """Retorna a API key v3 do TMDB lida do ambiente.

    Returns:
        String com a API key, ou string vazia se não configurada
        (as chamadas falharão graciosamente — fallback SC-005).
    """
    return os.environ.get("TMDB_API_KEY", "")


def _tmdb_get(path: str, params: dict | None = None, retries: int = 3) -> dict | None:
    """Faz uma requisição GET à TMDB API com retry/backoff exponencial.

    Em caso de falha (timeout, rede, 4xx/5xx), retorna None em vez de
    lançar exceção — garantindo fallback gracioso (SC-005).

    Args:
        path: Caminho da API (ex.: "/search/movie").
        params: Query params opcionais.
        retries: Número máximo de tentativas.

    Returns:
        Dict com a resposta JSON, ou None em caso de falha.
    """
    url = f"{_TMDB_BASE}{path}"
    # Injeta api_key em todos os requests (autenticação v3)
    all_params = {"api_key": _tmdb_api_key(), **(params or {})}
    for attempt in range(retries):
        try:
            # Timeout de 10s para não travar o fluxo em caso de lentidão
            resp = requests.get(url, headers={"Accept": "application/json"}, params=all_params, timeout=10)
            if resp.status_code == 200:
                return resp.json()
            # Qualquer status não-200 é tratado como falha suave
            return None
        except requests.RequestException:
            # Em caso de erro de rede, aguarda antes de tentar de novo
            if attempt < retries - 1:
                time.sleep(2 ** attempt)  # 1s, 2s, 4s
    return None


def _tmdb_search(title: str, year: int | None = None) -> list[dict]:
    """Busca filmes no TMDB por título (e opcionalmente ano).

    Args:
        title: Título do filme a buscar.
        year: Ano de lançamento para refinar a busca (opcional).

    Returns:
        Lista de resultados TMDB (dicts com id, title, release_date, poster_path, etc.),
        ou lista vazia em caso de falha.
    """
    params = {"query": title, "language": _TMDB_LANG}
    if year:
        params["year"] = str(year)

    data = _tmdb_get("/search/movie", params=params)
    if not data:
        return []
    # Retorna até 6 resultados para não sobrecarregar a UI de busca
    return data.get("results", [])[:6]


def _tmdb_detail(tmdb_id: int) -> dict | None:
    """Busca detalhes completos de um filme no TMDB, incluindo créditos.

    Faz duas chamadas: detalhes do filme e créditos (para extrair o diretor).

    Args:
        tmdb_id: ID do filme no TMDB.

    Returns:
        Dict com campos combinados (details + director list), ou None em caso de falha.
    """
    # Detalhes principais (gêneros, runtime, idioma, poster, backdrop)
    details = _tmdb_get(f"/movie/{tmdb_id}", params={"language": _TMDB_LANG})
    if not details:
        return None

    # Créditos para extrair o(s) diretor(es)
    credits = _tmdb_get(f"/movie/{tmdb_id}/credits")
    directors: list[str] = []
    if credits:
        # Filtra apenas quem tem job='Director' na equipe (crew)
        directors = [
            m["name"]
            for m in credits.get("crew", [])
            if m.get("job") == "Director"
        ]

    # Monta URLs completas de pôster e backdrop
    poster_url   = f"{_TMDB_IMG_POSTER}{details['poster_path']}"   if details.get("poster_path")   else None
    backdrop_url = f"{_TMDB_IMG_BACKDROP}{details['backdrop_path']}" if details.get("backdrop_path") else None

    # Extrai o ano do campo release_date (YYYY-MM-DD)
    release_year = None
    release_date = details.get("release_date", "")
    if release_date and len(release_date) >= 4:
        try:
            release_year = int(release_date[:4])
        except ValueError:
            pass

    # Monta o payload de metadados que vai para o banco
    return {
        "tmdb_id":     details.get("id"),
        "imdb_id":     details.get("imdb_id"),
        "title":       details.get("title"),
        "year":        release_year,
        "director":    directors,
        "genres":      [g["name"] for g in details.get("genres", [])],
        "runtime":     details.get("runtime"),
        # Trunca sinopse em 2000 chars para não exagerar no banco
        "overview":    (details.get("overview") or "")[:2000] or None,
        "poster_url":  poster_url,
        "backdrop_url": backdrop_url,
    }


def _enrich_movie_from_tmdb(title: str, year: int | None = None, tmdb_id: int | None = None) -> dict:
    """Enriquece um filme com metadados do TMDB.

    Tenta buscar pelo tmdb_id se fornecido; caso contrário, busca por título+ano
    e usa o primeiro resultado.

    Em caso de falha (API fora, não encontrado), retorna dict vazio — o filme
    será criado sem metadados do TMDB, mas sem quebrar o fluxo (SC-005).

    Args:
        title: Título do filme para busca.
        year: Ano de lançamento (opcional, melhora a busca).
        tmdb_id: ID TMDB direto (evita a busca por texto).

    Returns:
        Dict com campos TMDB preenchidos, ou dict vazio em caso de falha.
    """
    # Se já temos o tmdb_id, buscamos direto (mais preciso)
    if tmdb_id:
        detail = _tmdb_detail(tmdb_id)
        return detail or {}

    # Caso contrário, buscamos por texto e usamos o primeiro resultado
    results = _tmdb_search(title, year)
    if not results:
        return {}

    first = results[0]
    detail = _tmdb_detail(first["id"])
    return detail or {}


# ─────────────────────────────────────────────────────────────────────────────
# RESOLUÇÃO DE IDENTIDADE — dedup entre fontes (spec 050, FR-010)
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_movie_identity(
    letterboxd_uri: str | None,
    tmdb_id: int | None,
    title: str,
    year: int | None,
) -> str | None:
    """Resolve se um filme já existe no catálogo, por identidade externa ou título+ano.

    Ordem de resolução (spec 050, FR-010): letterboxd_uri exato → tmdb_id exato →
    título normalizado (+ ano, quando disponível) como último recurso. Usada tanto
    por `add_movie` (cadastro manual) quanto por `upsert_movie_from_letterboxd`
    (sync RSS/CSV) para que o mesmo filme nunca gere dois registros, venha de
    onde vier.

    Args:
        letterboxd_uri: URI do Letterboxd, se conhecida.
        tmdb_id: ID do TMDB, se conhecido (informado ou já resolvido via enriquecimento).
        title: Título do filme (usado no fallback por normalizado).
        year: Ano de lançamento (usado no fallback, quando disponível).

    Returns:
        Id do filme já existente no catálogo, ou None se nenhum for encontrado.
    """
    if letterboxd_uri:
        rows = run_select(
            "SELECT id FROM movies WHERE letterboxd_uri = %(uri)s AND deleted = FALSE",
            {"uri": letterboxd_uri},
        )
        if rows:
            return rows[0]["id"]

    if tmdb_id:
        rows = run_select(
            "SELECT id FROM movies WHERE tmdb_id = %(tid)s AND deleted = FALSE",
            {"tid": tmdb_id},
        )
        if rows:
            return rows[0]["id"]

    # Último recurso: título normalizado (+ ano, quando disponível). Sem tmdb_id nem
    # ano confiável, o risco de falso positivo entre remakes/homônimos é assumido
    # (ver Edge Cases da spec 050) — melhor que duplicar silenciosamente.
    if not title:
        return None
    if year is not None:
        rows = run_select(
            "SELECT id FROM movies WHERE normalizado = %(norm)s AND year = %(year)s AND deleted = FALSE",
            {"norm": _norm(title), "year": year},
        )
    else:
        rows = run_select(
            "SELECT id FROM movies WHERE normalizado = %(norm)s AND deleted = FALSE",
            {"norm": _norm(title)},
        )
    return rows[0]["id"] if rows else None


def _merge_into_existing_movie(
    movie_id: str,
    letterboxd_uri: str | None,
    source: str,
    rating: float | None = None,
) -> dict:
    """Funde uma identidade recém-encontrada no filme já existente, em vez de duplicar.

    Só preenche `letterboxd_uri`/`source`/`rating` quando estavam vazios — nunca
    sobrescreve um dado já presente no registro existente (US6).

    Args:
        movie_id: Id do filme já existente no catálogo.
        letterboxd_uri: URI a anexar, se o registro existente ainda não tiver um.
        source: Origem da tentativa de criação (só grava se o registro não tinha
            letterboxd_uri, isto é, se essa é a primeira vez que ele "vem" do Letterboxd).
        rating: Nota a anexar, se o registro existente ainda não tiver uma (spec 050
            follow-up — `ratings.csv` fundindo num filme já cadastrado sem nota).

    Returns:
        Dict com status "merged" e o id do filme existente.
    """
    if letterboxd_uri or rating is not None:
        run_dml(
            """
            UPDATE movies
            SET letterboxd_uri = COALESCE(letterboxd_uri, %(uri)s),
                source = CASE WHEN letterboxd_uri IS NULL AND %(uri)s IS NOT NULL
                              THEN %(source)s ELSE source END,
                rating = COALESCE(rating, %(rating)s),
                rating_source = CASE WHEN rating IS NULL AND %(rating)s IS NOT NULL
                                     THEN 'letterboxd' ELSE rating_source END,
                updated_at = %(now)s
            WHERE id = %(id)s
            """,
            {
                "id": movie_id,
                "uri": letterboxd_uri,
                "source": source,
                "rating": rating,
                "now": _now(),
            },
        )
    return {
        "status": "merged",
        "id": movie_id,
        "message": "Filme já existia no catálogo — vínculo atualizado em vez de duplicado.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# RESOLUÇÃO DE FILME — fuzzy match (padrão _find_book_by_query da Frieren)
# ─────────────────────────────────────────────────────────────────────────────

def _find_movie_by_query(query: str) -> dict | None:
    """Localiza um filme no catálogo por título, letterboxd_uri ou tmdb_id.

    Prioridade:
    1. letterboxd_uri exato
    2. tmdb_id (se a query for numérica)
    3. Fuzzy match no título normalizado (ILIKE '%query%')

    Só retorna filmes não-deletados (deleted=FALSE).

    Args:
        query: Texto de busca (título parcial, URI do Letterboxd ou ID TMDB).

    Returns:
        Dict com os dados do filme, ou None se não encontrado.
    """
    # Tenta resolver por letterboxd_uri exato (dedup primária)
    rows = run_select(
        "SELECT * FROM movies WHERE letterboxd_uri = %(q)s AND deleted = FALSE LIMIT 1",
        {"q": query},
    )
    if rows:
        return rows[0]

    # Tenta resolver por tmdb_id numérico
    if query.isdigit():
        rows = run_select(
            "SELECT * FROM movies WHERE tmdb_id = %(q)s AND deleted = FALSE LIMIT 1",
            {"q": int(query)},
        )
        if rows:
            return rows[0]

    # Fuzzy match no título normalizado (coluna persistida)
    norm_q = _norm(query)
    rows = run_select(
        """
        SELECT * FROM movies
        WHERE normalizado ILIKE %(q)s AND deleted = FALSE
        ORDER BY last_watched_date DESC NULLS LAST, created_at DESC
        LIMIT 1
        """,
        {"q": f"%{norm_q}%"},
    )
    return rows[0] if rows else None


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — CATÁLOGO E DIÁRIO (Onda 1 / US1)
# ─────────────────────────────────────────────────────────────────────────────

def search_movie(q: str) -> list[dict]:
    """Busca filmes no TMDB por título (para os modais de busca da UI).

    Não grava nada no banco — é somente uma consulta ao TMDB para apresentar
    opções ao usuário antes de adicionar ou logar.

    Args:
        q: Texto de busca (título ou parte dele).

    Returns:
        Lista de até 6 resultados TMDB com tmdb_id, title, year, poster_url,
        director, local_id (id em `movies` se o filme já estiver catalogado,
        senão None) e in_catalog (atalho booleano equivalente a local_id is
        not None) — permite ao caller oferecer "registrar reassistida" em vez
        de tentar recriar o filme (FR-006).
    """
    # Busca no TMDB e transforma para o shape esperado pela UI
    results = _tmdb_search(q)

    # Consulta em lote (evita N+1) quais desses tmdb_ids já estão no catálogo
    tmdb_ids = [r["id"] for r in results if r.get("id") is not None]
    existing_by_tmdb_id: dict[int, str] = {}
    if tmdb_ids:
        existing_rows = run_select(
            "SELECT id, tmdb_id FROM movies WHERE tmdb_id = ANY(%(ids)s) AND deleted = FALSE",
            {"ids": tmdb_ids},
        )
        existing_by_tmdb_id = {row["tmdb_id"]: row["id"] for row in existing_rows}

    formatted = []
    for r in results:
        # Extrai o ano do campo release_date
        year = None
        rd = r.get("release_date", "")
        if rd and len(rd) >= 4:
            try:
                year = int(rd[:4])
            except ValueError:
                pass

        # URL do pôster (None se não houver)
        poster_url = f"{_TMDB_IMG_POSTER}{r['poster_path']}" if r.get("poster_path") else None

        local_id = existing_by_tmdb_id.get(r.get("id"))

        formatted.append({
            "tmdb_id":    r.get("id"),
            "title":      r.get("title", ""),
            "year":       year,
            "poster_url": poster_url,
            # O diretor não vem na busca — seria necessária uma chamada extra por ID
            # Para manter a busca rápida, retornamos lista vazia (preenchida no detalhe)
            "director":   [],
            "local_id":   local_id,
            "in_catalog": local_id is not None,
        })
    return formatted


def add_movie(
    title: str | None = None,
    tmdb_id: int | None = None,
    status: str = "watchlist",
    year: int | None = None,
    letterboxd_uri: str | None = None,
    source: str = "manual",
    enrich_tmdb: bool = True,
    rating: float | None = None,
) -> dict:
    """Adiciona um filme ao catálogo (watchlist ou watched).

    Se tmdb_id for fornecido, busca metadados completos do TMDB.
    Em caso de falha do TMDB, o filme é criado com os dados disponíveis
    (sem poster_url) — nunca bloqueia o fluxo (SC-005).

    Args:
        title: Título do filme (obrigatório se tmdb_id não for fornecido).
        tmdb_id: ID do TMDB — se fornecido, enriquece com metadados completos.
        status: Status inicial ('watchlist' | 'watched').
        year: Ano de lançamento (opcional se tmdb_id fornecido).
        letterboxd_uri: URL do filme no Letterboxd (para dedup do RSS/CSV).
        source: Origem da entrada ('manual' | 'letterboxd_rss' | 'letterboxd_csv').
        enrich_tmdb: Se False, não consulta o TMDB — filme criado só com os dados
            fornecidos (spec 050, FR-003: opção "sem enriquecimento externo").
        rating: Nota vinda do Letterboxd (ex.: ratings.csv sem sessão de diário
            correspondente) — grava com `rating_source='letterboxd'`.

    Returns:
        Dict com status "ok" e id do filme criado, ou "error" se já existe.
    """
    # Valida o status fornecido
    if status not in _VALID_STATUSES:
        return _err(f"Status inválido: '{status}'. Use 'watchlist' ou 'watched'.")

    # Um título ou um tmdb_id é obrigatório
    if not title and not tmdb_id:
        return _err("Forneça ao menos o título ou o tmdb_id do filme.")

    # ── Resolução de identidade (spec 050, FR-010) — antes do enriquecimento ──
    # Fast-exit: URI ou tmdb_id exatos informados pelo chamador já bastam para achar
    # um filme existente, sem gastar uma chamada TMDB à toa. Funde em vez de duplicar.
    if letterboxd_uri or tmdb_id:
        existing_id = _resolve_movie_identity(letterboxd_uri, tmdb_id, title or "", year)
        if existing_id:
            return _merge_into_existing_movie(existing_id, letterboxd_uri, source, rating)

    # ── Enriquecimento via TMDB ────────────────────────────────────────────────
    # Falha graciosamente: se a API estiver fora, cria o filme sem metadados.
    # enrich_tmdb=False (--no-tmdb) pula a chamada por completo (FR-003).
    meta = _enrich_movie_from_tmdb(title or "", year, tmdb_id) if enrich_tmdb else {}

    # O tmdb_id do enriquecimento pode diferir do fornecido (se buscou por texto)
    final_tmdb_id = meta.get("tmdb_id") or tmdb_id
    # Preferência: título informado > título do enriquecimento TMDB > fallback.
    # Sem o meta.get("title"), logar direto de um resultado TMDB (só tmdb_id, sem
    # title) gravava "Filme desconhecido" mesmo quando o TMDB já tinha respondido
    # com o título certo — ano/diretor/gêneros ficavam certos, só o título errava.
    final_title   = title or meta.get("title") or "Filme desconhecido"

    # ── Resolução de identidade novamente — agora com o tmdb_id resolvido pelo ──
    # enriquecimento (ou fallback por título+ano se o TMDB não achou nada/estava fora)
    existing_id = _resolve_movie_identity(letterboxd_uri, final_tmdb_id, final_title, meta.get("year") or year)
    if existing_id:
        return _merge_into_existing_movie(existing_id, letterboxd_uri, source, rating)

    # ── Inserção no banco ──────────────────────────────────────────────────────
    movie_id = str(uuid.uuid4())
    now = _now()

    run_dml(
        """
        INSERT INTO movies (
            id, tmdb_id, imdb_id, letterboxd_uri, title, normalizado, year,
            director, genres, runtime, overview, poster_url, backdrop_url,
            poster_palette, status, rating, rating_source, source, created_at, updated_at
        ) VALUES (
            %(id)s, %(tmdb_id)s, %(imdb_id)s, %(letterboxd_uri)s,
            %(title)s, %(normalizado)s, %(year)s,
            %(director)s, %(genres)s, %(runtime)s, %(overview)s,
            %(poster_url)s, %(backdrop_url)s, %(poster_palette)s,
            %(status)s, %(rating)s, %(rating_source)s, %(source)s, %(now)s, %(now)s
        )
        """,
        {
            "id":              movie_id,
            "tmdb_id":         final_tmdb_id,
            "imdb_id":         meta.get("imdb_id"),
            "letterboxd_uri":  letterboxd_uri,
            "title":           final_title,
            # Coluna normalizado é usada para fuzzy match na busca
            "normalizado":     _norm(final_title),
            "year":            meta.get("year") or year,
            "director":        meta.get("director") or [],
            "genres":          meta.get("genres") or [],
            "runtime":         meta.get("runtime"),
            "overview":        meta.get("overview"),
            "poster_url":      meta.get("poster_url"),
            "backdrop_url":    meta.get("backdrop_url"),
            # Paleta determinística para o pôster tipográfico de fallback
            "poster_palette":  _poster_palette(final_title),
            "status":          status,
            "rating":          rating,
            "rating_source":   "letterboxd" if rating is not None else None,
            "source":          source,
            "now":             now,
        },
    )

    return _ok(id=movie_id, message=f"Filme '{final_title}' adicionado ao catálogo.")


def log_watch(
    movie_id: str,
    watched_date: str | date | None = None,
    rating: float | None = None,
    review: str | None = None,
    tags: list[str] | None = None,
    rewatch: bool | None = None,
    source: str = "manual",
) -> dict:
    """Loga uma sessão de visualização (uma vez que o filme foi assistido).

    Insere uma linha em diary_entries E atualiza movies (status, last_watched_date,
    times_watched, rating e rating_source) — tudo na mesma transação PostgreSQL.

    Infere rewatch=TRUE automaticamente se o filme já tiver sessão anterior.
    rating_source='own' quando logado manualmente; 'letterboxd' quando vem do sync.

    Args:
        movie_id: ID do filme no catálogo.
        watched_date: Data em que foi assistido (YYYY-MM-DD ou date). Default: hoje.
        rating: Nota daquela sessão (0.5–5.0, opcional — pode assistir sem avaliar).
        review: Texto da review (opcional).
        tags: Lista de etiquetas da sessão (opcional).
        rewatch: Se é revisão. Se None, inferido automaticamente.
        source: Origem ('manual' | 'letterboxd_rss' | 'letterboxd_csv').

    Returns:
        Dict com status "ok" e diary_id, ou "error" em caso de falha.
    """
    # Valida a nota antes de qualquer outra coisa
    rating_err = _validate_rating(rating)
    if rating_err:
        return _err(rating_err)

    # Converte a data para objeto date
    if watched_date is None:
        watch_date = _today()
    elif isinstance(watched_date, str):
        try:
            watch_date = date.fromisoformat(watched_date)
        except ValueError:
            return _err(f"Data inválida: '{watched_date}'. Use o formato YYYY-MM-DD.")
    else:
        watch_date = watched_date

    # Verifica se o filme existe (sem soft-delete)
    movies = run_select(
        "SELECT id, title, times_watched, letterboxd_uri FROM movies WHERE id = %(id)s AND deleted = FALSE",
        {"id": movie_id},
    )
    if not movies:
        return _err(f"Filme '{movie_id}' não encontrado no catálogo.")

    movie = movies[0]

    # Infere rewatch: TRUE se o filme já tem sessão registrada
    is_rewatch = rewatch if rewatch is not None else (movie["times_watched"] > 0)

    # Determina rating_source: 'letterboxd' quando vem do sync; 'own' quando manual
    rating_source = "letterboxd" if source in ("letterboxd_rss", "letterboxd_csv") else "own"

    # ── Transação: insere sessão + atualiza o filme ────────────────────────────
    diary_id = str(uuid.uuid4())
    now = _now()

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Insere a sessão no diário
            cur.execute(
                """
                INSERT INTO diary_entries (
                    id, movie_id, movie_title, watched_date, rating, rewatch,
                    review, tags, letterboxd_uri, source, created_at
                ) VALUES (
                    %(id)s, %(movie_id)s, %(movie_title)s, %(watched_date)s,
                    %(rating)s, %(rewatch)s, %(review)s, %(tags)s,
                    %(letterboxd_uri)s, %(source)s, %(now)s
                )
                """,
                {
                    "id":             diary_id,
                    "movie_id":       movie_id,
                    "movie_title":    movie["title"],
                    "watched_date":   watch_date,
                    "rating":         rating,
                    "rewatch":        is_rewatch,
                    "review":         review,
                    # psycopg2 aceita list nativa para TEXT[]
                    "tags":           tags or [],
                    "letterboxd_uri": movie.get("letterboxd_uri"),
                    "source":         source,
                    "now":            now,
                },
            )

            # Atualiza o catálogo: status→watched, contagem de sessões, data e nota
            cur.execute(
                """
                UPDATE movies
                SET
                    status           = 'watched',
                    times_watched    = times_watched + 1,
                    last_watched_date = %(watched_date)s,
                    -- Atualiza a nota "atual" do filme somente se foi fornecida
                    rating           = COALESCE(%(rating)s, rating),
                    rating_source    = CASE
                                         WHEN %(rating)s IS NOT NULL THEN %(rating_source)s
                                         ELSE rating_source
                                       END,
                    updated_at       = %(now)s
                WHERE id = %(movie_id)s
                """,
                {
                    "movie_id":      movie_id,
                    "watched_date":  watch_date,
                    "rating":        rating,
                    "rating_source": rating_source,
                    "now":           now,
                },
            )

    return _ok(
        diary_id=diary_id,
        message=f"Sessão de '{movie['title']}' logada para {watch_date}.",
        rewatch=is_rewatch,
    )


def rate_movie(movie_id: str, rating: float) -> dict:
    """Define a nota atual/favorita de um filme (rating_source='own').

    Args:
        movie_id: ID do filme.
        rating: Nota (0.5–5.0).

    Returns:
        Dict com status "ok" ou "error".
    """
    # Valida o intervalo da nota
    err = _validate_rating(rating)
    if err:
        return _err(err)

    # Verifica se o filme existe
    rows = run_select("SELECT title FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")

    # Atualiza nota e rating_source='own' (nota dada manualmente)
    run_dml(
        "UPDATE movies SET rating = %(r)s, rating_source = 'own', updated_at = %(now)s WHERE id = %(id)s",
        {"r": float(rating), "now": _now(), "id": movie_id},
    )
    return _ok(message=f"Nota de '{rows[0]['title']}' atualizada para {rating}.")


def set_like(movie_id: str, liked: bool) -> dict:
    """Marca ou desmarca o "coração" (curtir) de um filme.

    Args:
        movie_id: ID do filme.
        liked: True para curtir, False para descurtir.

    Returns:
        Dict com status "ok" ou "error".
    """
    rows = run_select("SELECT title FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")

    run_dml(
        "UPDATE movies SET liked = %(l)s, updated_at = %(now)s WHERE id = %(id)s",
        {"l": liked, "now": _now(), "id": movie_id},
    )
    action = "curtido" if liked else "descurtido"
    return _ok(message=f"'{rows[0]['title']}' {action}.")


def add_to_watchlist(
    title: str | None = None,
    tmdb_id: int | None = None,
    year: int | None = None,
    letterboxd_uri: str | None = None,
) -> dict:
    """Adiciona um filme à watchlist (atalho para add_movie com status='watchlist').

    Args:
        title: Título do filme.
        tmdb_id: ID TMDB (opcional, enriquece metadados).
        year: Ano de lançamento (opcional).
        letterboxd_uri: URI do Letterboxd (opcional).

    Returns:
        Dict com status "ok" ou "error".
    """
    return add_movie(
        title=title,
        tmdb_id=tmdb_id,
        status="watchlist",
        year=year,
        letterboxd_uri=letterboxd_uri,
    )


def update_movie_status(movie_id: str, status: str) -> dict:
    """Atualiza o status de um filme (watchlist → watched ou vice-versa).

    Args:
        movie_id: ID do filme.
        status: Novo status ('watchlist' | 'watched').

    Returns:
        Dict com status "ok" ou "error".
    """
    if status not in _VALID_STATUSES:
        return _err(f"Status inválido: '{status}'. Use 'watchlist' ou 'watched'.")

    rows = run_select("SELECT title FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")

    run_dml(
        "UPDATE movies SET status = %(s)s, updated_at = %(now)s WHERE id = %(id)s",
        {"s": status, "now": _now(), "id": movie_id},
    )
    return _ok(message=f"Status de '{rows[0]['title']}' atualizado para '{status}'.")


def set_notes(movie_id: str, notes: str) -> dict:
    """Atualiza as anotações soltas do filme (campo notes, ≠ review da sessão).

    Args:
        movie_id: ID do filme.
        notes: Texto das anotações (pode ser vazio para limpar).

    Returns:
        Dict com status "ok" ou "error".
    """
    rows = run_select("SELECT title FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")

    run_dml(
        "UPDATE movies SET notes = %(n)s, updated_at = %(now)s WHERE id = %(id)s",
        {"n": notes or None, "now": _now(), "id": movie_id},
    )
    return _ok(message=f"Anotações de '{rows[0]['title']}' salvas.")


def refresh_movie_metadata(movie_id: str, tmdb_id: int | None = None) -> dict:
    """Rebusca metadados do TMDB e sobrescreve os campos de catálogo do filme.

    Botão "Buscar Dados" no detalhe do filme (spec 050, FR-006/FR-007). Nunca toca
    nos dados pessoais (status, rating, liked, tags, notes) nem de proveniência
    (letterboxd_uri, source, created_at) — só os campos de catálogo mudam.

    Args:
        movie_id: ID do filme a atualizar.
        tmdb_id: Se informado, usa esse id diretamente — fluxo de "escolher outro
            candidato" quando o filme foi associado ao título errado. Se omitido,
            usa o tmdb_id já salvo no filme, ou busca por título+ano.

    Returns:
        Dict com status "ok" e o filme atualizado, ou "error" se o filme não existe
        ou a busca no TMDB falhou (nesse caso, nenhuma coluna é tocada).
    """
    rows = run_select("SELECT * FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")
    movie = rows[0]

    # Resolve o alvo: tmdb_id informado > tmdb_id já salvo > busca por título+ano
    target_tmdb_id = tmdb_id or movie.get("tmdb_id")
    if target_tmdb_id:
        detail = _tmdb_detail(target_tmdb_id)
    else:
        results = _tmdb_search(movie["title"], movie.get("year"))
        detail = _tmdb_detail(results[0]["id"]) if results else None

    if not detail:
        return _err("Não foi possível buscar metadados no TMDB — o filme não foi alterado.")

    # Título vem do TMDB — é justamente o que corrige um match errado (FR-007);
    # se o TMDB não trouxer título por algum motivo, mantém o atual.
    new_title = detail.get("title") or movie["title"]
    run_dml(
        """
        UPDATE movies
        SET tmdb_id = %(tmdb_id)s, imdb_id = %(imdb_id)s, title = %(title)s,
            normalizado = %(normalizado)s, year = %(year)s, director = %(director)s,
            genres = %(genres)s, runtime = %(runtime)s, overview = %(overview)s,
            poster_url = %(poster_url)s, backdrop_url = %(backdrop_url)s,
            poster_palette = %(poster_palette)s, updated_at = %(now)s
        WHERE id = %(id)s
        """,
        {
            "id":             movie_id,
            "tmdb_id":        detail.get("tmdb_id") or target_tmdb_id,
            "imdb_id":        detail.get("imdb_id"),
            "title":          new_title,
            "normalizado":    _norm(new_title),
            "year":           detail.get("year") or movie.get("year"),
            "director":       detail.get("director") or [],
            "genres":         detail.get("genres") or [],
            "runtime":        detail.get("runtime"),
            "overview":       detail.get("overview"),
            "poster_url":     detail.get("poster_url"),
            "backdrop_url":   detail.get("backdrop_url"),
            "poster_palette": _poster_palette(new_title),
            "now":            _now(),
        },
    )

    updated = run_select("SELECT * FROM movies WHERE id = %(id)s", {"id": movie_id})
    return _ok(movie=updated[0])


def update_movie_catalog(
    movie_id: str,
    title: str | None = None,
    year: int | None = None,
    director: list[str] | None = None,
    genres: list[str] | None = None,
    runtime: int | None = None,
    overview: str | None = None,
) -> dict:
    """Edita manualmente os campos de catálogo de um filme (spec 050, FR-008).

    Atualização parcial — só os campos passados (não-None) mudam. Campos pessoais
    (status, rating, liked, notes) continuam editáveis pelas tools já existentes
    (`update_movie_status`, `rate_movie`, `set_like`, `set_notes`).

    Args:
        movie_id: ID do filme a editar.
        title: Novo título, se estiver sendo corrigido (recalcula `normalizado`).
        year: Novo ano de lançamento.
        director: Nova lista de diretores.
        genres: Nova lista de gêneros.
        runtime: Nova duração em minutos.
        overview: Nova sinopse.

    Returns:
        Dict com status "ok" e o filme atualizado, ou "error" se não encontrado.
    """
    rows = run_select("SELECT id FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")

    # Monta o SET dinamicamente — só os campos informados entram na query
    fields: dict = {}
    if title is not None:
        fields["title"] = title
        fields["normalizado"] = _norm(title)
    if year is not None:
        fields["year"] = year
    if director is not None:
        fields["director"] = director
    if genres is not None:
        fields["genres"] = genres
    if runtime is not None:
        fields["runtime"] = runtime
    if overview is not None:
        fields["overview"] = overview

    if not fields:
        return _err("Nenhum campo informado para atualizar.")

    fields["updated_at"] = _now()
    set_clause = ", ".join(f"{col} = %({col})s" for col in fields)
    run_dml(
        f"UPDATE movies SET {set_clause} WHERE id = %(id)s",
        {**fields, "id": movie_id},
    )

    updated = run_select("SELECT * FROM movies WHERE id = %(id)s", {"id": movie_id})
    return _ok(movie=updated[0])


def list_movies(
    status: str | None = None,
    sort: str = "recent",
    genre: str | None = None,
    tag: str | None = None,
    filter: str | None = None,
) -> list[dict]:
    """Lista filmes do catálogo com filtros e ordenação.

    Args:
        status: Filtrar por 'watched' ou 'watchlist' (None = todos).
        sort: Ordenação ('recent'|'rating'|'title'|'director'|'year'|'runtime').
        genre: Filtrar por gênero (match parcial em movies.genres).
        tag: Filtrar por etiqueta (modo "tela de etiqueta").
        filter: Chip de filtro ('all'|'watched'|'liked'|'watchlist'|'rated').

    Returns:
        Lista de filmes com campos para o grid (id, title, year, poster_url, etc.).
    """
    # Constrói os filtros da query dinamicamente
    conditions = ["deleted = FALSE"]
    params: dict = {}

    # Filtro de chip (prioritário sobre status)
    if filter == "liked":
        conditions.append("liked = TRUE")
    elif filter == "rated":
        conditions.append("rating IS NOT NULL")
    elif filter in ("watched", "watchlist"):
        conditions.append("status = %(status)s")
        params["status"] = filter
    elif status:
        conditions.append("status = %(status)s")
        params["status"] = status

    # Filtro por gênero (match em array TEXT[])
    if genre:
        conditions.append("%(genre)s ILIKE ANY(genres)")
        params["genre"] = f"%{genre}%"

    # Filtro por etiqueta (modo "tela de etiqueta")
    if tag:
        conditions.append("%(tag)s = ANY(tags)")
        params["tag"] = tag

    # Mapeamento de sort para coluna SQL
    sort_map = {
        "recent":   "last_watched_date DESC NULLS LAST, created_at DESC",
        "rating":   "rating DESC NULLS LAST",
        "title":    "normalizado ASC",
        "director": "director ASC",   # TEXT[] — ordena pelo primeiro elemento
        "year":     "year DESC NULLS LAST",
        "runtime":  "runtime ASC NULLS LAST",
    }
    order_by = sort_map.get(sort, "last_watched_date DESC NULLS LAST, created_at DESC")

    sql = f"""
        SELECT
            id, title, year, director, genres, runtime, poster_url, poster_palette, status,
            rating, rating_source, liked, tags, times_watched, last_watched_date
        FROM movies
        WHERE {" AND ".join(conditions)}
        ORDER BY {order_by}
    """
    return run_select(sql, params)


def get_watchlist() -> list[dict]:
    """Retorna os filmes na watchlist ordenados por data de criação.

    Returns:
        Lista de filmes com status='watchlist'.
    """
    return run_select(
        """
        SELECT id, title, year, poster_url, poster_palette, director,
               genres, runtime, overview, liked, tags
        FROM movies
        WHERE status = 'watchlist' AND deleted = FALSE
        ORDER BY created_at DESC
        """,
    )


def get_diary(limit: int = 50) -> list[dict]:
    """Retorna as sessões do diário em ordem cronológica decrescente.

    Args:
        limit: Número máximo de sessões a retornar. Default: 50.

    Returns:
        Lista de entradas do diário com poster_url do filme.
    """
    return run_select(
        """
        SELECT
            d.id, d.movie_id, d.movie_title,
            m.poster_url, m.poster_palette,
            d.watched_date, d.rating, d.rewatch, d.review, d.tags
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE m.deleted = FALSE
        ORDER BY d.watched_date DESC, d.created_at DESC
        LIMIT %(limit)s
        """,
        {"limit": limit},
    )


def get_movie_detail(movie_id: str) -> dict:
    """Retorna o detalhe completo de um filme: metadados + people + vault + diário.

    Aceita ID direto ou texto para fuzzy match.

    Args:
        movie_id: ID do filme ou texto para busca fuzzy.

    Returns:
        Dict com "movie", "people", "vault" e "diary", ou "error" se não encontrado.
    """
    # Tenta resolver por ID exato primeiro; se não encontrar, faz fuzzy match
    rows = run_select(
        "SELECT * FROM movies WHERE id = %(id)s AND deleted = FALSE",
        {"id": movie_id},
    )
    if not rows:
        # Tenta fuzzy match pelo texto
        movie_row = _find_movie_by_query(movie_id)
        if not movie_row:
            return _err(f"Filme '{movie_id}' não encontrado.")
    else:
        movie_row = rows[0]

    real_id = movie_row["id"]

    # Busca elenco/equipe do filme
    people = run_select(
        "SELECT id, name, role, is_person_tag, person_id FROM movie_people WHERE movie_id = %(id)s ORDER BY id",
        {"id": real_id},
    )

    # Busca itens do Cofre de conteúdos
    vault = run_select(
        "SELECT id, type, title, url, source FROM movie_vault_items WHERE movie_id = %(id)s ORDER BY created_at DESC",
        {"id": real_id},
    )

    # Busca histórico de sessões (mais recente primeiro)
    diary = run_select(
        """
        SELECT id, watched_date, rating, rewatch, review, tags
        FROM diary_entries
        WHERE movie_id = %(id)s
        ORDER BY watched_date DESC, created_at DESC
        """,
        {"id": real_id},
    )

    return _ok(movie=movie_row, people=people, vault=vault, diary=diary)


def get_stats(year: int | None = None) -> dict:
    """Retorna estatísticas de filmes do ano (vazio-seguro — SC-006).

    Cada bloco retorna zeros/listas vazias quando não há dados no ano,
    nunca levanta exceção.

    Args:
        year: Ano a filtrar. Default: ano atual.

    Returns:
        Dict com total_films, total_sessions, avg_rating, top_genres,
        top_directors, rating_histogram.
    """
    if year is None:
        year = _today().year

    # ── Totais básicos ─────────────────────────────────────────────────────────
    totals_rows = run_select(
        """
        SELECT
            COUNT(DISTINCT d.movie_id) AS total_films,
            COUNT(d.id)                AS total_sessions,
            AVG(d.rating)              AS avg_rating,
            COUNT(CASE WHEN d.rewatch THEN 1 END) AS rewatches
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
          AND m.deleted = FALSE
        """,
        {"year": year},
    )
    totals = totals_rows[0] if totals_rows else {}
    avg_rating = round(float(totals.get("avg_rating") or 0), 2) or None

    # ── Top gêneros ───────────────────────────────────────────────────────────
    # UNNEST expande o array TEXT[] de gêneros em linhas individuais para agregar
    top_genres = run_select(
        """
        SELECT genre, COUNT(*) AS count
        FROM (
            SELECT UNNEST(m.genres) AS genre
            FROM diary_entries d
            JOIN movies m ON m.id = d.movie_id
            WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
              AND m.deleted = FALSE
        ) g
        GROUP BY genre
        ORDER BY count DESC
        LIMIT 5
        """,
        {"year": year},
    )

    # ── Top diretores ─────────────────────────────────────────────────────────
    top_directors = run_select(
        """
        SELECT director, COUNT(*) AS count
        FROM (
            SELECT UNNEST(m.director) AS director
            FROM diary_entries d
            JOIN movies m ON m.id = d.movie_id
            WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
              AND m.deleted = FALSE
        ) dirs
        GROUP BY director
        ORDER BY count DESC
        LIMIT 5
        """,
        {"year": year},
    )

    # ── Histograma de notas (0.5 a 5.0) ──────────────────────────────────────
    # Inicializa todos os buckets com 0 (garante que a UI não quebre)
    # "rating" existe nas DUAS tabelas do JOIN (movies e diary_entries), então
    # precisa do alias "d." — sem ele o PostgreSQL recusa a query inteira com
    # o erro 42702 ("column reference is ambiguous"). Contamos a nota da SESSÃO
    # (diary_entries), não a nota final do filme.
    hist: dict = {str(r / 2): 0 for r in range(1, 11)}
    hist_rows = run_select(
        """
        SELECT CAST(d.rating AS TEXT) AS rating, COUNT(*) AS count
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
          AND d.rating IS NOT NULL
          AND m.deleted = FALSE
        GROUP BY d.rating
        """,
        {"year": year},
    )
    for row in hist_rows:
        # Normaliza para uma casa decimal (ex.: "4" → "4.0", "4.5" → "4.5")
        key = str(float(row["rating"]))
        if key in hist:
            hist[key] = row["count"]

    return _ok(
        year=year,
        total_films=int(totals.get("total_films") or 0),
        total_sessions=int(totals.get("total_sessions") or 0),
        rewatches=int(totals.get("rewatches") or 0),
        avg_rating=avg_rating,
        top_genres=[{"genre": r["genre"], "count": r["count"]} for r in top_genres],
        top_directors=[{"director": r["director"], "count": r["count"]} for r in top_directors],
        rating_histogram=hist,
    )


def delete_movie(movie_id: str) -> dict:
    """Soft-delete de um filme (marca deleted=TRUE, preserva diary_entries).

    Args:
        movie_id: ID do filme.

    Returns:
        Dict com status "ok" ou "error".
    """
    rows = run_select("SELECT title FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id})
    if not rows:
        return _err("Filme não encontrado.")

    run_dml(
        "UPDATE movies SET deleted = TRUE, updated_at = %(now)s WHERE id = %(id)s",
        {"now": _now(), "id": movie_id},
    )
    return _ok(message=f"'{rows[0]['title']}' removido do catálogo.")


def delete_diary_entry(diary_id: str) -> dict:
    """Remove uma sessão do diário e recalcula times_watched / last_watched_date do filme.

    Args:
        diary_id: ID da entrada do diário.

    Returns:
        Dict com status "ok" ou "error".
    """
    # Busca a sessão para pegar o movie_id
    rows = run_select("SELECT movie_id FROM diary_entries WHERE id = %(id)s", {"id": diary_id})
    if not rows:
        return _err("Entrada do diário não encontrada.")

    movie_id = rows[0]["movie_id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Remove a sessão
            cur.execute("DELETE FROM diary_entries WHERE id = %(id)s", {"id": diary_id})

            # Recalcula times_watched e last_watched_date a partir das sessões restantes
            cur.execute(
                """
                UPDATE movies
                SET
                    times_watched     = (SELECT COUNT(*) FROM diary_entries WHERE movie_id = %(mid)s),
                    last_watched_date = (
                        SELECT MAX(watched_date)
                        FROM diary_entries
                        WHERE movie_id = %(mid)s
                    ),
                    updated_at = %(now)s
                WHERE id = %(mid)s
                """,
                {"mid": movie_id, "now": _now()},
            )

    return _ok(message="Sessão removida do diário.")


def update_diary_entry(
    diary_id: str,
    watched_date: str | date | None = None,
    rating: float | None = None,
    review: str | None = None,
    tags: list[str] | None = None,
    rewatch: bool | None = None,
) -> dict:
    """Edita manualmente uma sessão do diário (spec 050, FR-009).

    Atualização parcial — só os campos passados (não-None) mudam. Depois de
    aplicar, recalcula `times_watched`/`last_watched_date` do filme dono da sessão
    (mesmo padrão de `delete_diary_entry`), já que editar a data pode mudar qual é
    a sessão mais recente.

    Args:
        diary_id: ID da sessão a editar.
        watched_date: Nova data da sessão (string ISO ou date).
        rating: Nova nota da sessão (0.5–5.0).
        review: Novo texto da resenha.
        tags: Nova lista de etiquetas da sessão.
        rewatch: Nova flag de revisão (editável diretamente — sem recalcular a
            partir do histórico, ao contrário do que acontece na criação).

    Returns:
        Dict com status "ok", a sessão atualizada e os agregados recalculados do
        filme (`last_watched_date`, `times_watched`), ou "error" se não encontrada
        ou a nota for inválida.
    """
    rows = run_select("SELECT movie_id FROM diary_entries WHERE id = %(id)s", {"id": diary_id})
    if not rows:
        return _err("Sessão não encontrada.")
    movie_id = rows[0]["movie_id"]

    if rating is not None:
        rating_error = _validate_rating(rating)
        if rating_error:
            return _err(rating_error)

    # Converte string ISO para date, se necessário (mesmo padrão de log_watch)
    parsed_date = watched_date
    if isinstance(watched_date, str):
        parsed_date = date.fromisoformat(watched_date)

    fields: dict = {}
    if parsed_date is not None:
        fields["watched_date"] = parsed_date
    if rating is not None:
        fields["rating"] = float(rating)
    if review is not None:
        fields["review"] = review
    if tags is not None:
        fields["tags"] = tags
    if rewatch is not None:
        fields["rewatch"] = rewatch

    if not fields:
        return _err("Nenhum campo informado para atualizar.")

    set_clause = ", ".join(f"{col} = %({col})s" for col in fields)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE diary_entries SET {set_clause} WHERE id = %(id)s",
                {**fields, "id": diary_id},
            )
            # Recalcula os agregados do filme — a edição pode ter mudado qual
            # sessão é a mais recente, ou o total (embora o total não mude aqui)
            cur.execute(
                """
                UPDATE movies
                SET
                    times_watched     = (SELECT COUNT(*) FROM diary_entries WHERE movie_id = %(mid)s),
                    last_watched_date = (SELECT MAX(watched_date) FROM diary_entries WHERE movie_id = %(mid)s),
                    updated_at = %(now)s
                WHERE id = %(mid)s
                """,
                {"mid": movie_id, "now": _now()},
            )

    entry = run_select("SELECT * FROM diary_entries WHERE id = %(id)s", {"id": diary_id})
    movie = run_select(
        "SELECT last_watched_date, times_watched FROM movies WHERE id = %(id)s",
        {"id": movie_id},
    )
    return _ok(entry=entry[0], movie=movie[0])


def reorder_diary_entries(watched_date: str | date, ordered_ids: list[str]) -> dict:
    """Reordena sessões de um mesmo dia (spec 050, FR-012).

    O Letterboxd não exporta horário — a ordem dentro de um `watched_date` é
    controlada por `created_at` (FR-011). Esta tool reatribui `created_at` para as
    sessões informadas, espaçadas por 1 segundo a partir da meia-noite daquele dia,
    na ordem em que aparecem em `ordered_ids` (índice 0 = mais antiga do dia).

    Args:
        watched_date: Data cujas sessões serão reordenadas.
        ordered_ids: IDs das sessões daquele dia, na ordem desejada.

    Returns:
        Dict com status "ok", ou "error" se algum id não pertence a uma sessão
        com essa data (operação tudo-ou-nada — nenhuma mudança é aplicada).
    """
    parsed_date = watched_date
    if isinstance(watched_date, str):
        parsed_date = date.fromisoformat(watched_date)

    if not ordered_ids:
        return _err("Nenhum id informado para reordenar.")

    # Valida que todos os ids pertencem a sessões com essa data, antes de
    # aplicar qualquer mudança (operação tudo-ou-nada)
    rows = run_select(
        "SELECT id FROM diary_entries WHERE watched_date = %(date)s AND id = ANY(%(ids)s)",
        {"date": parsed_date, "ids": ordered_ids},
    )
    if len(rows) != len(ordered_ids):
        return _err("Um ou mais ids não pertencem a uma sessão com essa data.")

    midnight = datetime.combine(parsed_date, datetime.min.time(), tzinfo=_TZ)
    with get_conn() as conn:
        with conn.cursor() as cur:
            for i, entry_id in enumerate(ordered_ids):
                cur.execute(
                    "UPDATE diary_entries SET created_at = %(ts)s WHERE id = %(id)s",
                    {"ts": midnight + timedelta(seconds=i), "id": entry_id},
                )

    return _ok(message="Ordem das sessões atualizada.")


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — FAVORITOS (Onda 4 / US4)
# ─────────────────────────────────────────────────────────────────────────────

def get_favorites() -> dict:
    """Retorna a vitrine de favoritos em ordem de posição.

    Returns:
        Dict com "favorites": lista ordenada de filmes favoritos.
    """
    rows = run_select(
        """
        SELECT m.id, m.title, m.poster_url, m.poster_palette, f.position
        FROM movie_favorites f
        JOIN movies m ON m.id = f.movie_id
        WHERE m.deleted = FALSE
        ORDER BY f.position
        """,
    )
    return _ok(favorites=rows)


def set_favorites(ids: list[str]) -> dict:
    """Substitui a vitrine de favoritos (máximo 4 filmes vistos).

    Realiza a operação em transação: delete-all + insert (garante consistência).

    Args:
        ids: Lista de IDs de filmes na ordem desejada (posição 0, 1, 2, 3).

    Returns:
        Dict com status "ok" e os novos favoritos, ou "error" se inválido.
    """
    if len(ids) > 4:
        return _err("A vitrine de favoritos aceita no máximo 4 filmes.")

    # Valida que todos os IDs existem, não estão deletados e têm status='watched'
    for fid in ids:
        rows = run_select(
            "SELECT title, status FROM movies WHERE id = %(id)s AND deleted = FALSE",
            {"id": fid},
        )
        if not rows:
            return _err(f"Filme '{fid}' não encontrado.")
        if rows[0]["status"] != "watched":
            return _err(
                f"'{rows[0]['title']}' ainda não foi assistido. "
                "Só filmes com status 'watched' podem ser favoritos."
            )

    # Substitui o conjunto inteiro em transação
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM movie_favorites")
            for pos, fid in enumerate(ids):
                cur.execute(
                    "INSERT INTO movie_favorites (movie_id, position) VALUES (%(mid)s, %(pos)s)",
                    {"mid": fid, "pos": pos},
                )

    return get_favorites()


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — AGREGAÇÕES (Onda 4 / US4)
# ─────────────────────────────────────────────────────────────────────────────

def get_home() -> dict:
    """Retorna todos os blocos da tela Início em uma única chamada ao servidor.

    Evita N+1: favorites + recent_activity + watchlist_highlight +
    rating_histogram + sessions_7d (e variação) + last_session + counts.
    Todos os blocos são vazio-seguros (SC-006).

    Returns:
        Dict composto com todos os blocos do Início.
    """
    today = _today()

    # ── Favoritos ─────────────────────────────────────────────────────────────
    favorites = run_select(
        """
        SELECT m.id, m.title, m.poster_url, m.poster_palette, f.position
        FROM movie_favorites f
        JOIN movies m ON m.id = f.movie_id
        WHERE m.deleted = FALSE
        ORDER BY f.position
        """,
    )

    # ── Atividade recente (últimas 4 sessões) ──────────────────────────────────
    # "liked" é coluna de movies (m), não de diary_entries (d) — usar o alias certo.
    recent_activity = run_select(
        """
        SELECT d.id, d.movie_id, d.movie_title, m.poster_url, m.poster_palette,
               d.watched_date, d.rating, d.rewatch, m.liked, d.review
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE m.deleted = FALSE
        ORDER BY d.watched_date DESC, d.created_at DESC
        LIMIT 4
        """,
    )

    # ── Watchlist em destaque (carrossel) ─────────────────────────────────────
    watchlist_highlight = run_select(
        """
        SELECT id, title, year, poster_url, poster_palette, director, runtime
        FROM movies
        WHERE status = 'watchlist' AND deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 8
        """,
    )

    # ── Histograma de notas (ano atual) ──────────────────────────────────────
    # "rating" existe nas DUAS tabelas do JOIN (movies e diary_entries), então
    # precisa do alias "d." — sem ele o PostgreSQL recusa a query inteira com
    # o erro 42702 ("column reference is ambiguous"). Contamos a nota da SESSÃO
    # (diary_entries), não a nota final do filme.
    hist: dict = {str(r / 2): 0 for r in range(1, 11)}
    hist_rows = run_select(
        """
        SELECT CAST(d.rating AS TEXT) AS rating, COUNT(*) AS count
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE d.rating IS NOT NULL AND m.deleted = FALSE
          AND EXTRACT(YEAR FROM d.watched_date) = %(year)s
        GROUP BY d.rating
        """,
        {"year": today.year},
    )
    for row in hist_rows:
        key = str(float(row["rating"]))
        if key in hist:
            hist[key] = row["count"]

    # ── Sessões nos últimos 7 dias e variação vs. 7 dias anteriores ───────────
    from datetime import timedelta
    week_start = today - timedelta(days=6)
    prev_start = today - timedelta(days=13)
    prev_end   = today - timedelta(days=7)

    # Exclui sessões de filmes soft-deletados da contagem (FR-002)
    s7_rows = run_select(
        """
        SELECT COUNT(*) AS cnt FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE d.watched_date >= %(s)s AND d.watched_date <= %(e)s AND m.deleted = FALSE
        """,
        {"s": week_start, "e": today},
    )
    s7 = int(s7_rows[0]["cnt"]) if s7_rows else 0

    s7p_rows = run_select(
        """
        SELECT COUNT(*) AS cnt FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE d.watched_date >= %(s)s AND d.watched_date <= %(e)s AND m.deleted = FALSE
        """,
        {"s": prev_start, "e": prev_end},
    )
    s7_prev = int(s7p_rows[0]["cnt"]) if s7p_rows else 0

    # ── Última sessão (hero) ───────────────────────────────────────────────────
    last_rows = run_select(
        """
        SELECT d.movie_title AS title, d.rating, d.watched_date
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE m.deleted = FALSE
        ORDER BY d.watched_date DESC, d.created_at DESC
        LIMIT 1
        """,
    )
    last_session = last_rows[0] if last_rows else None

    # ── Contagens gerais ───────────────────────────────────────────────────────
    counts_rows = run_select(
        """
        SELECT
            (SELECT COUNT(*) FROM movies WHERE status = 'watched'   AND deleted = FALSE) AS films_watched,
            (SELECT COUNT(*) FROM diary_entries d
             JOIN movies m ON m.id = d.movie_id WHERE m.deleted = FALSE)                 AS diary,
            (SELECT COUNT(*) FROM movies WHERE status = 'watchlist' AND deleted = FALSE) AS watchlist
        """,
    )
    counts = counts_rows[0] if counts_rows else {"films_watched": 0, "diary": 0, "watchlist": 0}

    return _ok(
        favorites=favorites,
        recent_activity=recent_activity,
        watchlist_highlight=watchlist_highlight,
        rating_histogram=hist,
        sessions_7d=s7,
        sessions_7d_prev=s7_prev,
        last_session=last_session,
        counts=counts,
    )


def get_rewind(year: int | None = None) -> dict:
    """Retorna o year-in-review (= get_stats enriquecido com mais destaques).

    Inclui: rewatches, total_minutes, monthly[12], top_people,
    top_decade, max_sessions, favorite, liked_count.
    Todos os blocos são vazio-seguros (SC-006).

    Args:
        year: Ano do Rewind. Default: ano atual.

    Returns:
        Dict com todos os blocos do Rewind.
    """
    # Começa pelo get_stats base
    base = get_stats(year)
    if year is None:
        year = _today().year

    # ── Total de minutos assistidos ───────────────────────────────────────────
    min_rows = run_select(
        """
        SELECT COALESCE(SUM(m.runtime), 0) AS total_minutes
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s AND m.deleted = FALSE
        """,
        {"year": year},
    )
    total_minutes = int(min_rows[0]["total_minutes"]) if min_rows else 0

    # ── Sessões por mês (array de 12 valores, jan→dez) ────────────────────────
    monthly_rows = run_select(
        """
        SELECT EXTRACT(MONTH FROM watched_date)::INTEGER AS month, COUNT(*) AS count
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s AND m.deleted = FALSE
        GROUP BY month
        """,
        {"year": year},
    )
    monthly = [0] * 12
    for row in monthly_rows:
        # Índice 0-based (mês 1 = índice 0)
        monthly[int(row["month"]) - 1] = int(row["count"])

    # ── Filme curtido no ano (liked_count) ───────────────────────────────────
    liked_rows = run_select(
        """
        SELECT COUNT(DISTINCT d.movie_id) AS liked_count
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
          AND m.deleted = FALSE AND m.liked = TRUE
        """,
        {"year": year},
    )
    liked_count = int(liked_rows[0]["liked_count"]) if liked_rows else 0

    # ── Top pessoas (direção + elenco + equipe) ───────────────────────────────
    # Exibe o nome original (com acentos/capitalização), não o normalizado de busca
    top_people = run_select(
        """
        SELECT p.name AS name, COUNT(DISTINCT d.movie_id) AS count,
               ARRAY_AGG(DISTINCT p.role) AS roles
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        JOIN movie_people p ON p.movie_id = m.id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s AND m.deleted = FALSE
        GROUP BY p.name
        ORDER BY count DESC
        LIMIT 5
        """,
        {"year": year},
    )

    # ── Década mais assistida ─────────────────────────────────────────────────
    decade_rows = run_select(
        """
        SELECT (FLOOR(m.year / 10) * 10)::INTEGER AS decade, COUNT(*) AS count
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
          AND m.deleted = FALSE AND m.year IS NOT NULL
        GROUP BY decade
        ORDER BY count DESC
        LIMIT 1
        """,
        {"year": year},
    )
    top_decade = decade_rows[0] if decade_rows else None

    # ── Maior maratona (maior número de sessões num único dia) ────────────────
    marathon_rows = run_select(
        """
        SELECT COUNT(*) AS sessions
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s AND m.deleted = FALSE
        GROUP BY d.watched_date
        ORDER BY sessions DESC
        LIMIT 1
        """,
        {"year": year},
    )
    max_sessions = int(marathon_rows[0]["sessions"]) if marathon_rows else 0

    # ── Filme destaque do ano (maior nota) ────────────────────────────────────
    fav_rows = run_select(
        """
        SELECT m.id, m.title, d.rating
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s
          AND d.rating IS NOT NULL AND m.deleted = FALSE
        ORDER BY d.rating DESC, d.watched_date DESC
        LIMIT 1
        """,
        {"year": year},
    )
    favorite = fav_rows[0] if fav_rows else None

    # Mescla os dados do get_stats com os destaques do Rewind
    return _ok(
        **{k: v for k, v in base.items() if k not in ("status",)},
        total_minutes=total_minutes,
        monthly=monthly,
        liked_count=liked_count,
        top_people=[
            {"name": r["name"], "count": r["count"], "roles": r["roles"] or []}
            for r in top_people
        ],
        top_decade=top_decade,
        max_sessions=max_sessions,
        favorite=favorite,
    )


def get_heatmap(year: int | None = None) -> dict:
    """Retorna sessões por dia do ano para o heatmap.

    Args:
        year: Ano do heatmap. Default: ano atual.

    Returns:
        Dict com "year" e "days": lista de {date, count} para cada dia do ano.
    """
    if year is None:
        year = _today().year

    # Conta sessões por dia (apenas dias com sessão)
    rows = run_select(
        """
        SELECT watched_date::TEXT AS date, COUNT(*) AS count
        FROM diary_entries d
        JOIN movies m ON m.id = d.movie_id
        WHERE EXTRACT(YEAR FROM d.watched_date) = %(year)s AND m.deleted = FALSE
        GROUP BY watched_date
        ORDER BY watched_date
        """,
        {"year": year},
    )

    # Constrói um dict de {data: count} para lookup rápido
    counts_by_date: dict = {r["date"]: r["count"] for r in rows}

    # Gera todos os dias do ano, com 0 onde não há sessão
    from datetime import timedelta
    start = date(year, 1, 1)
    end   = date(year, 12, 31)
    days = []
    current = start
    while current <= end:
        key = current.isoformat()
        days.append({"date": key, "count": counts_by_date.get(key, 0)})
        current += timedelta(days=1)

    return _ok(year=year, days=days)


def get_top_people(limit: int = 10) -> list[dict]:
    """Retorna as pessoas que mais aparecem no catálogo (direção + elenco + equipe).

    Args:
        limit: Número máximo de pessoas. Default: 10.

    Returns:
        Lista de {name, count, roles}.
    """
    return run_select(
        """
        SELECT p.name, COUNT(DISTINCT p.movie_id) AS count,
               ARRAY_AGG(DISTINCT p.role) AS roles
        FROM movie_people p
        JOIN movies m ON m.id = p.movie_id
        WHERE m.deleted = FALSE
        GROUP BY p.name
        ORDER BY count DESC
        LIMIT %(limit)s
        """,
        {"limit": limit},
    )


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — LISTAS (Onda 5 / US5)
# ─────────────────────────────────────────────────────────────────────────────

def get_lists() -> list[dict]:
    """Retorna todas as listas com metadados e mini-pôsteres dos primeiros filmes.

    Returns:
        Lista de coleções com id, name, description, accent, ranked, count.
    """
    # Busca as listas com a contagem de filmes em cada uma
    return run_select(
        """
        SELECT
            l.id::TEXT, l.name, l.description, l.accent, l.ranked,
            COUNT(li.movie_id) AS count
        FROM movie_lists l
        LEFT JOIN movie_list_items li ON li.list_id = l.id
        GROUP BY l.id
        ORDER BY l.created_at DESC
        """,
    )


def get_list(list_id: str) -> dict:
    """Retorna os detalhes de uma lista com os filmes que a compõem.

    Args:
        list_id: UUID da lista.

    Returns:
        Dict com "list" e "films", ou "error" se não encontrada.
    """
    lists = run_select(
        "SELECT id::TEXT, name, description, accent, ranked FROM movie_lists WHERE id = %(id)s",
        {"id": list_id},
    )
    if not lists:
        return _err("Lista não encontrada.")

    # Filmes da lista, ordenados pela posição
    films = run_select(
        """
        SELECT m.id, m.title, m.year, m.poster_url, m.poster_palette,
               m.rating, m.liked, li.position
        FROM movie_list_items li
        JOIN movies m ON m.id = li.movie_id
        WHERE li.list_id = %(lid)s AND m.deleted = FALSE
        ORDER BY li.position NULLS LAST, li.movie_id
        """,
        {"lid": list_id},
    )
    return _ok(list=lists[0], films=films)


def create_list(name: str, description: str = "", accent: str | None = None, ranked: bool = False) -> dict:
    """Cria uma nova lista/coleção de filmes.

    Args:
        name: Nome da lista.
        description: Descrição opcional.
        accent: Cor de acento OKLCH (opcional).
        ranked: Se a lista é ordenada (ranking).

    Returns:
        Dict com status "ok" e id da lista criada.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO movie_lists (name, description, accent, ranked)
                VALUES (%(name)s, %(desc)s, %(accent)s, %(ranked)s)
                RETURNING id::TEXT
                """,
                {"name": name, "desc": description, "accent": accent, "ranked": ranked},
            )
            new_id = cur.fetchone()[0]

    return _ok(id=new_id, message=f"Lista '{name}' criada.")


def update_list(list_id: str, **kwargs) -> dict:
    """Atualiza campos de uma lista (name, description, accent, ranked).

    Args:
        list_id: UUID da lista.
        **kwargs: Campos a atualizar.

    Returns:
        Dict com status "ok" ou "error".
    """
    allowed = {"name", "description", "accent", "ranked"}
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        return _err("Nenhum campo para atualizar.")

    sets = ", ".join(f"{k} = %({k})s" for k in fields)
    fields["list_id"] = list_id
    run_dml(f"UPDATE movie_lists SET {sets} WHERE id = %(list_id)s", fields)
    return _ok(message="Lista atualizada.")


def delete_list(list_id: str) -> dict:
    """Remove uma lista (e seus itens por CASCADE).

    Args:
        list_id: UUID da lista.

    Returns:
        Dict com status "ok" ou "error".
    """
    rows = run_select("SELECT name FROM movie_lists WHERE id = %(id)s", {"id": list_id})
    if not rows:
        return _err("Lista não encontrada.")

    run_dml("DELETE FROM movie_lists WHERE id = %(id)s", {"id": list_id})
    return _ok(message=f"Lista '{rows[0]['name']}' removida.")


def add_to_list(list_id: str, movie_id: str, position: int | None = None) -> dict:
    """Adiciona um filme a uma lista.

    Args:
        list_id: UUID da lista.
        movie_id: ID do filme.
        position: Posição na lista (opcional).

    Returns:
        Dict com status "ok" ou "error".
    """
    # Verifica se a lista existe
    if not run_select("SELECT id FROM movie_lists WHERE id = %(id)s", {"id": list_id}):
        return _err("Lista não encontrada.")
    # Verifica se o filme existe
    if not run_select("SELECT id FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id}):
        return _err("Filme não encontrado.")

    run_dml(
        """
        INSERT INTO movie_list_items (movie_id, list_id, position)
        VALUES (%(mid)s, %(lid)s, %(pos)s)
        ON CONFLICT (movie_id, list_id) DO UPDATE SET position = EXCLUDED.position
        """,
        {"mid": movie_id, "lid": list_id, "pos": position},
    )
    return _ok(message="Filme adicionado à lista.")


def remove_from_list(list_id: str, movie_id: str) -> dict:
    """Remove um filme de uma lista.

    Args:
        list_id: UUID da lista.
        movie_id: ID do filme.

    Returns:
        Dict com status "ok" ou "error".
    """
    run_dml(
        "DELETE FROM movie_list_items WHERE list_id = %(lid)s AND movie_id = %(mid)s",
        {"lid": list_id, "mid": movie_id},
    )
    return _ok(message="Filme removido da lista.")


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — ETIQUETAS (Onda 5 / US5)
# ─────────────────────────────────────────────────────────────────────────────

def get_tags() -> dict:
    """Retorna a nuvem de etiquetas com contagem e flag de pessoa.

    Tags de 'movies.tags' são agregadas; person=True quando casa com um
    movie_people que tem is_person_tag=TRUE.

    Returns:
        Dict com "tags": lista de {name, count, person}.
    """
    # Agrega todas as tags dos filmes não-deletados
    tag_rows = run_select(
        """
        SELECT tag, COUNT(*) AS count
        FROM (
            SELECT UNNEST(tags) AS tag
            FROM movies
            WHERE deleted = FALSE AND tags IS NOT NULL
        ) t
        GROUP BY tag
        ORDER BY count DESC, tag ASC
        """,
    )

    # Busca quais tags são de pessoas (is_person_tag=TRUE)
    person_tags_rows = run_select(
        "SELECT DISTINCT normalizado FROM movie_people WHERE is_person_tag = TRUE",
    )
    person_norms = {r["normalizado"] for r in person_tags_rows}

    tags = []
    for row in tag_rows:
        tags.append({
            "name":   row["tag"],
            "count":  row["count"],
            # Marca como pessoa se o nome normalizado da tag casar com uma pessoa
            "person": _norm(row["tag"]) in person_norms,
        })

    return _ok(tags=tags)


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS — COFRE DE CONTEÚDOS (Onda 5 / US5)
# ─────────────────────────────────────────────────────────────────────────────

def get_vault(movie_id: str) -> list[dict]:
    """Retorna os itens do Cofre de um filme.

    Args:
        movie_id: ID do filme.

    Returns:
        Lista de itens do Cofre (id, type, title, url, source).
    """
    return run_select(
        """
        SELECT id, type, title, url, source
        FROM movie_vault_items
        WHERE movie_id = %(id)s
        ORDER BY created_at DESC
        """,
        {"id": movie_id},
    )


def add_vault_item(
    movie_id: str,
    type: str,
    title: str,
    url: str | None = None,
    source: str | None = None,
) -> dict:
    """Adiciona um item ao Cofre de um filme.

    Args:
        movie_id: ID do filme.
        type: Tipo do conteúdo ('video'|'article'|'essay'|'review').
        title: Título do conteúdo.
        url: URL do conteúdo (opcional — alguns são só título).
        source: Domínio de exibição (ex.: youtube.com). Derivado da URL se não fornecido.

    Returns:
        Dict com status "ok" e id do item criado, ou "error".
    """
    if type not in _VALID_VAULT_TYPES:
        return _err(f"Tipo inválido: '{type}'. Use 'video', 'article', 'essay' ou 'review'.")

    if not run_select("SELECT id FROM movies WHERE id = %(id)s AND deleted = FALSE", {"id": movie_id}):
        return _err("Filme não encontrado.")

    # Deriva o domínio da URL se não fornecido explicitamente
    if url and not source:
        try:
            from urllib.parse import urlparse
            source = urlparse(url).netloc.replace("www.", "") or None
        except Exception:
            pass

    item_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO movie_vault_items (id, movie_id, type, title, url, source)
        VALUES (%(id)s, %(mid)s, %(type)s, %(title)s, %(url)s, %(source)s)
        """,
        {"id": item_id, "mid": movie_id, "type": type, "title": title, "url": url, "source": source},
    )
    return _ok(id=item_id, message=f"Conteúdo '{title}' salvo no Cofre.")


def delete_vault_item(vault_id: str) -> dict:
    """Remove um item do Cofre.

    Args:
        vault_id: ID do item.

    Returns:
        Dict com status "ok" ou "error".
    """
    rows = run_select("SELECT title FROM movie_vault_items WHERE id = %(id)s", {"id": vault_id})
    if not rows:
        return _err("Item do Cofre não encontrado.")

    run_dml("DELETE FROM movie_vault_items WHERE id = %(id)s", {"id": vault_id})
    return _ok(message=f"'{rows[0]['title']}' removido do Cofre.")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE SYNC (usados por scripts/sync_letterboxd.py) — Onda 2 / US2
# ─────────────────────────────────────────────────────────────────────────────

def upsert_movie_from_letterboxd(
    title: str,
    year: int | None,
    letterboxd_uri: str,
    rating: float | None,
    review: str | None,
    watched_date: date,
    source: str = "letterboxd_rss",
    enrich_tmdb: bool = True,
    created_at: datetime | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Cria ou atualiza um filme + sessão vindos do Letterboxd (RSS ou CSV).

    Dedup de sessão por (letterboxd_uri, watched_date). Dedup de filme por
    letterboxd_uri e, se não encontrar, por tmdb_id/título+ano (spec 050, FR-010) —
    evita duplicar um filme cadastrado manualmente que a importação/sync reencontra
    depois, anexando o letterboxd_uri ao registro existente em vez de criar outro.
    rating_source = 'letterboxd' quando a nota vem do Letterboxd.

    Args:
        title: Título do filme.
        year: Ano de lançamento.
        letterboxd_uri: URL do filme no Letterboxd (chave de dedup).
        rating: Nota do Letterboxd (0.5–5.0, ou None se sem nota).
        review: Texto da review (pode ser None).
        watched_date: Data em que foi assistido.
        source: 'letterboxd_rss' ou 'letterboxd_csv'.
        enrich_tmdb: Se True, tenta buscar metadados do TMDB (com fallback gracioso).
        created_at: Timestamp explícito da sessão (spec 050, FR-011) — usado pela
            importação em lote para garantir que, dentro do mesmo `watched_date`, a
            ordem das sessões reflita a ordem das linhas do export. Se omitido, usa
            o instante atual (comportamento de sempre, para o sync RSS).
        tags: Etiquetas da sessão (coluna "Tags" do diary.csv).

    Returns:
        Dict com status ('created'|'updated'|'skipped') e id do filme — quando o
        filme é encontrado por tmdb_id/título+ano (fusão de identidade), o retorno é
        'updated' sobre o registro existente, não 'created'.
    """
    # ── Dedup de sessão: (letterboxd_uri, watched_date) ──────────────────────
    # Se a sessão já existe, pula (idempotência — SC-003). Esta função NUNCA
    # atualiza uma sessão já existente com review/tags — quem faz isso é
    # `backfill_diary_review`, chamada só a partir de reviews.csv.
    diary_exists = run_select(
        """
        SELECT id FROM diary_entries
        WHERE letterboxd_uri = %(uri)s AND watched_date = %(date)s
        """,
        {"uri": letterboxd_uri, "date": watched_date},
    )
    if diary_exists:
        return {"status": "skipped", "id": None}

    # ── Dedup de filme: letterboxd_uri, depois tmdb_id/título+ano (FR-010) ──────
    movie_rows = run_select(
        "SELECT id, times_watched, rating FROM movies WHERE letterboxd_uri = %(uri)s",
        {"uri": letterboxd_uri},
    )
    movie_created = False
    # Enriquecimento resolvido uma única vez — reaproveitado tanto para checar
    # identidade via tmdb_id quanto para os campos do INSERT, se for filme novo.
    meta: dict = _enrich_movie_from_tmdb(title, year) if (enrich_tmdb and not movie_rows) else {}

    if not movie_rows:
        # Não achou por letterboxd_uri — tenta achar por tmdb_id/título+ano antes de
        # decidir que é um filme genuinamente novo (evita duplicar um cadastro manual)
        existing_id = _resolve_movie_identity(None, meta.get("tmdb_id"), title, meta.get("year") or year)
        if existing_id:
            run_dml(
                """
                UPDATE movies
                SET letterboxd_uri = COALESCE(letterboxd_uri, %(uri)s), updated_at = %(now)s
                WHERE id = %(id)s
                """,
                {"id": existing_id, "uri": letterboxd_uri, "now": _now()},
            )
            movie_rows = run_select(
                "SELECT id, times_watched, rating FROM movies WHERE id = %(id)s",
                {"id": existing_id},
            )

    if not movie_rows:
        # Filme genuinamente novo: cria no catálogo (com ou sem enriquecimento TMDB)
        movie_id = str(uuid.uuid4())
        now = _now()
        run_dml(
            """
            INSERT INTO movies (
                id, tmdb_id, imdb_id, letterboxd_uri, title, normalizado, year,
                director, genres, runtime, overview, poster_url, backdrop_url,
                poster_palette, status, rating, rating_source, source,
                last_watched_date, times_watched, created_at, updated_at
            ) VALUES (
                %(id)s, %(tmdb_id)s, %(imdb_id)s, %(uri)s, %(title)s, %(norm)s,
                %(year)s, %(director)s, %(genres)s, %(runtime)s, %(overview)s,
                %(poster_url)s, %(backdrop_url)s, %(palette)s,
                'watched', %(rating)s, %(rating_source)s, %(source)s,
                %(watched_date)s, 1, %(now)s, %(now)s
            )
            """,
            {
                "id":            movie_id,
                "tmdb_id":       meta.get("tmdb_id"),
                "imdb_id":       meta.get("imdb_id"),
                "uri":           letterboxd_uri,
                "title":         title,
                "norm":          _norm(title),
                "year":          meta.get("year") or year,
                "director":      meta.get("director") or [],
                "genres":        meta.get("genres") or [],
                "runtime":       meta.get("runtime"),
                "overview":      meta.get("overview"),
                "poster_url":    meta.get("poster_url"),
                "backdrop_url":  meta.get("backdrop_url"),
                "palette":       _poster_palette(title),
                "rating":        float(rating) if rating is not None else None,
                "rating_source": "letterboxd" if rating is not None else None,
                "source":        source,
                "watched_date":  watched_date,
                "now":           now,
            },
        )
        movie_created = True
    else:
        # Filme já existe: atualiza rating e letterboxd_uri se necessário
        movie_id = movie_rows[0]["id"]
        now = _now()
        if rating is not None:
            run_dml(
                """
                UPDATE movies
                SET rating = %(r)s, rating_source = 'letterboxd',
                    times_watched = times_watched + 1,
                    last_watched_date = GREATEST(COALESCE(last_watched_date, %(d)s), %(d)s),
                    updated_at = %(now)s
                WHERE id = %(id)s
                """,
                {"r": float(rating), "d": watched_date, "now": now, "id": movie_id},
            )
        else:
            run_dml(
                """
                UPDATE movies
                SET times_watched = times_watched + 1,
                    last_watched_date = GREATEST(COALESCE(last_watched_date, %(d)s), %(d)s),
                    updated_at = %(now)s
                WHERE id = %(id)s
                """,
                {"d": watched_date, "now": now, "id": movie_id},
            )

    # ── Insere a sessão no diário ──────────────────────────────────────────────
    # Verifica rewatch: TRUE se o filme já tinha sessão antes desta
    existing_sessions = run_select(
        "SELECT COUNT(*) AS cnt FROM diary_entries WHERE movie_id = %(id)s",
        {"id": movie_id},
    )
    is_rewatch = int((existing_sessions[0] if existing_sessions else {}).get("cnt", 0)) > 0

    diary_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO diary_entries (
            id, movie_id, movie_title, watched_date, rating, rewatch,
            review, tags, letterboxd_uri, source, created_at
        ) VALUES (
            %(id)s, %(mid)s, %(title)s, %(date)s, %(rating)s, %(rewatch)s,
            %(review)s, %(tags)s, %(uri)s, %(source)s, %(created_at)s
        )
        ON CONFLICT (letterboxd_uri, watched_date) WHERE letterboxd_uri IS NOT NULL
        DO NOTHING
        """,
        {
            "id":         diary_id,
            "mid":        movie_id,
            "title":      title,
            "date":       watched_date,
            "rating":     float(rating) if rating is not None else None,
            "rewatch":    is_rewatch,
            "review":     review,
            "tags":       tags or None,
            "uri":        letterboxd_uri,
            "source":     source,
            # Explícito (spec 050, FR-011) quando a importação em lote precisa
            # garantir ordem entre sessões do mesmo dia; senão, agora mesmo.
            "created_at": created_at or _now(),
        },
    )

    return {"status": "created" if movie_created else "updated", "id": movie_id}


def backfill_diary_review(
    letterboxd_uri: str,
    watched_date: date,
    review: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Preenche review/tags de uma sessão do diário já existente (reviews.csv).

    Não cria sessão nova: se não encontrar `(letterboxd_uri, watched_date)` em
    `diary_entries`, retorna `"no_session"` sem gravar nada — Diário continua sendo
    estritamente o que veio do `diary.csv` (spec 050, follow-up). Só preenche os
    campos que ainda estão vazios: nunca sobrescreve uma review ou tags já
    presentes (nem as que vieram do diary.csv, nem uma edição manual do usuário
    via `update_diary_entry`).

    Args:
        letterboxd_uri: URI do filme (parte da chave de dedup da sessão).
        watched_date: Data da sessão a enriquecer.
        review: Texto da review vindo de reviews.csv.
        tags: Etiquetas da sessão vindas de reviews.csv.

    Returns:
        Dict com status "updated" (algum campo foi preenchido), "skipped" (sessão
        existe mas já tinha os dois campos preenchidos) ou "no_session" (nenhuma
        sessão com essa URI+data — reviews.csv sem par em diary.csv).
    """
    rows = run_select(
        """
        SELECT id, review, tags FROM diary_entries
        WHERE letterboxd_uri = %(uri)s AND watched_date = %(date)s
        """,
        {"uri": letterboxd_uri, "date": watched_date},
    )
    if not rows:
        return {"status": "no_session", "id": None}

    existing = rows[0]
    fields: dict = {}
    if review and not existing.get("review"):
        fields["review"] = review
    if tags and not existing.get("tags"):
        fields["tags"] = tags

    if not fields:
        return {"status": "skipped", "id": existing["id"]}

    set_clause = ", ".join(f"{col} = %({col})s" for col in fields)
    run_dml(
        f"UPDATE diary_entries SET {set_clause} WHERE id = %(id)s",
        {**fields, "id": existing["id"]},
    )
    return {"status": "updated", "id": existing["id"]}


# ─────────────────────────────────────────────────────────────────────────────
# CROSS-AGENT — Kaguya (lembrete/sessão de filme) — Onda 3 / US3
# ─────────────────────────────────────────────────────────────────────────────

def create_movie_reminder(movie_query: str, when: str) -> dict:
    """Cria um lembrete/sessão de filme via Kaguya (cross-agent).

    "me lembra de assistir X sábado" → cria uma tarefa/lembrete na Kaguya
    (e/ou evento no Calendar), sem duplicar a entrada na watchlist.

    Args:
        movie_query: Título (ou parte) do filme.
        when: Quando quer assistir (ex.: "sábado", "2026-06-20").

    Returns:
        Dict com status "ok" ou "error".
    """
    # Resolve o filme para ter o título correto na tarefa
    movie = _find_movie_by_query(movie_query)
    movie_title = movie["title"] if movie else movie_query

    try:
        # Importa a lógica da Kaguya em tempo de execução para evitar import circular
        # O padrão cross-agent do projeto é chamada direta à camada de lógica
        from agents.kaguya.tools_tasks import create_task

        # Cria a tarefa de lembrete com o título do filme e a data/hora solicitada
        result = create_task(
            title=f"Assistir: {movie_title}",
            due_date=when,  # A Kaguya interpreta datas em pt-BR
        )
        if result.get("status") == "ok":
            return _ok(message=f"Lembrete criado para assistir '{movie_title}' em '{when}'.")
        else:
            return _err(result.get("message", "Erro ao criar lembrete na Kaguya."))
    except Exception as e:
        return _err(f"Não foi possível criar o lembrete via Kaguya: {e}")
