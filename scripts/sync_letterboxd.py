"""Sincronização do diário do Letterboxd via RSS.

Busca o feed RSS público do usuário e ingere as entradas no catálogo de filmes
da Akane (PostgreSQL), usando `upsert_movie_from_letterboxd` em tools.py.

Dedup garantido: mesma URI + mesma data → skipped (SC-003).
TMDB opcional: enriquece metadados quando TMDB_TOKEN está definido; se a API
estiver fora, cria o filme só com os dados do Letterboxd (SC-005).

Usage:
    # Importa e chama diretamente (ex.: via endpoint web):
    from scripts.sync_letterboxd import run_sync
    result = run_sync()

    # Roda da linha de comando (ex.: cron diário no container):
    python -m scripts.sync_letterboxd
    python -m scripts.sync_letterboxd --yesterday   # apenas itens de ontem
    python -m scripts.sync_letterboxd -v            # log detalhado
"""

import argparse          # Argumentos de linha de comando (--yesterday, -v)
import logging           # Sistema de logs estruturado
import os                # Variáveis de ambiente (LETTERBOXD_USERNAME)
import sys               # sys.stderr para logs, sys.exit para saída com erro
import time              # Backoff exponencial entre tentativas de HTTP
import xml.etree.ElementTree as ET  # Parser XML nativo — lê o feed RSS
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo        # Fuso horário de São Paulo

import requests          # HTTP — já no requirements.txt

# Importa a função de upsert da camada de lógica da Akane.
# O script é um script de manutenção; a lógica de negócio fica em tools.py (FR-016).
from agents.akane.tools import upsert_movie_from_letterboxd

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

# URL do feed RSS público do Letterboxd — {username} é substituído dinamicamente
_LETTERBOXD_RSS = "https://letterboxd.com/{username}/rss/"

# Número máximo de itens lidos do feed por execução.
# O Letterboxd mostra os 50 mais recentes; mais que isso exige paginação (não suportada no RSS).
_RSS_LIMIT = 50

# Número máximo de tentativas em caso de falha de rede
_MAX_RETRIES = 3

# Base do backoff exponencial (segundos): 2s, 4s, 8s nas tentativas 1, 2, 3
_RETRY_BACKOFF = 2.0

# Namespaces do XML do RSS do Letterboxd — necessários para acessar campos proprietários
# como <letterboxd:filmTitle> e <letterboxd:memberRating>
_LETTERBOXD_NS = {
    "letterboxd": "https://letterboxd.com",
    "dc":         "http://purl.org/dc/elements/1.1/",
}

# Fuso do usuário — garante comparações de data corretas
_TZ = ZoneInfo("America/Sao_Paulo")

# Logger do módulo — mensagens vão para stderr para não poluir stdout
log = logging.getLogger("sync_letterboxd")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS INTERNOS
# ─────────────────────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    """Remove tags HTML de um texto (ex.: a descrição RSS do Letterboxd).

    Args:
        text: String possivelmente contendo tags HTML.

    Returns:
        Texto sem tags HTML, com espaços extras normalizados.

    Example:
        >>> _strip_html("<p>Ótimo filme!</p>")
        'Ótimo filme!'
    """
    import re
    import html as html_module
    # Remove todas as tags HTML com regex simples (não precisa de BeautifulSoup aqui)
    sem_tags = re.sub(r"<[^>]+>", " ", text)
    # Decodifica entidades HTML como &amp; &lt; &gt;
    decodificado = html_module.unescape(sem_tags)
    # Normaliza múltiplos espaços em branco em um único espaço
    return " ".join(decodificado.split())


def _fetch_rss(username: str) -> list[dict]:
    """Busca e parseia o feed RSS do Letterboxd para um usuário.

    Usa retry com backoff exponencial. Retorna lista de dicts com os campos
    de cada entrada de filme (sem itens que não são filmes).

    Args:
        username: Nome de usuário do Letterboxd.

    Returns:
        Lista de dicts com keys: title, year, url, rating, watched_date, review.
        Lista vazia se o feed não puder ser obtido.
    """
    # Monta a URL do RSS com o username configurado
    url = _LETTERBOXD_RSS.format(username=username)
    log.info(f"Buscando RSS do Letterboxd: {url}")

    # Tenta até _MAX_RETRIES vezes com backoff exponencial
    raw_resp = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            # User-Agent necessário para evitar bloqueio de bot pelo Letterboxd
            raw_resp = requests.get(
                url,
                timeout=30,
                headers={"User-Agent": "Mozilla/5.0 (compatible; Makima/1.0)"},
            )
            raw_resp.raise_for_status()
            break  # Sucesso — sai do loop de retry
        except requests.RequestException as exc:
            # Calcula o tempo de espera: 2s, 4s, 8s...
            wait = _RETRY_BACKOFF * (2 ** (attempt - 1))
            log.warning(f"Erro ao buscar RSS (tentativa {attempt}/{_MAX_RETRIES}): {exc} — aguardando {wait:.1f}s")
            time.sleep(wait)
            raw_resp = None

    # Se todas as tentativas falharam, retorna lista vazia (gracioso — SC-005 style)
    if raw_resp is None:
        log.error("Falha definitiva ao buscar RSS do Letterboxd — sync cancelado")
        return []

    # Parseia o XML do feed RSS
    try:
        root = ET.fromstring(raw_resp.content)
    except ET.ParseError as exc:
        log.error(f"Erro ao parsear XML do RSS: {exc}")
        return []

    # Extrai itens do feed (limita a _RSS_LIMIT para não sobrecarregar)
    items = root.findall(".//item")[:_RSS_LIMIT]
    log.info(f"RSS: {len(items)} itens encontrados no feed (max {_RSS_LIMIT})")

    entradas: list[dict] = []
    for item in items:
        # Apenas itens com <letterboxd:filmTitle> são filmes —
        # listas, follows e reviews sem filme não têm esse campo.
        film_title = item.findtext("letterboxd:filmTitle", namespaces=_LETTERBOXD_NS)
        if not film_title:
            continue  # Pula: não é entrada de filme

        link = item.findtext("link") or ""
        year_text = item.findtext("letterboxd:filmYear", namespaces=_LETTERBOXD_NS)
        # Converte ano para int, ou None se não estiver presente
        year: int | None = int(year_text) if year_text and year_text.isdigit() else None

        # memberRating é None quando o usuário assistiu sem dar nota
        rating_text = item.findtext("letterboxd:memberRating", namespaces=_LETTERBOXD_NS)
        rating: float | None = float(rating_text) if rating_text else None

        watched_date_text = item.findtext("letterboxd:watchedDate", namespaces=_LETTERBOXD_NS)
        if not watched_date_text:
            # Se não tem data de assistência, usa a data de publicação do item
            pub_date_text = item.findtext("pubDate") or ""
            watched_date_text = pub_date_text[:10]  # "YYYY-MM-DD"

        # Tenta converter a data em objeto date
        try:
            watched_date = date.fromisoformat(watched_date_text[:10])
        except ValueError:
            log.warning(f"Data inválida '{watched_date_text}' em '{film_title}' — pulando")
            continue

        # A <description> do RSS contém HTML com poster + review — extrai só texto
        description = item.findtext("description") or ""
        review = _strip_html(description)[:2000]  # Limita a 2000 chars (campo da tabela)

        entradas.append({
            "title":        film_title,
            "year":         year,
            "letterboxd_uri": link,   # URL do filme no Letterboxd = chave de dedup
            "rating":       rating,
            "watched_date": watched_date,
            "review":       review or None,
        })

    log.info(f"RSS: {len(entradas)} entradas de filmes parseadas")
    return entradas


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÃO PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def run_sync(yesterday_only: bool = False, enrich_tmdb: bool = True) -> dict:
    """Sincroniza o diário Letterboxd RSS com o catálogo da Akane.

    Busca o feed RSS do usuário configurado em LETTERBOXD_USERNAME e chama
    `upsert_movie_from_letterboxd` para cada entrada, de forma idempotente.

    Args:
        yesterday_only: Se True, ignora entradas cujo watched_date não seja ontem.
                        Útil para o cron diário (só o que foi assistido ontem).
        enrich_tmdb: Se True, tenta enriquecer com TMDB (com fallback gracioso).

    Returns:
        Dict com contadores: created, updated, skipped, errors.

    Example:
        >>> result = run_sync()
        >>> result['created']
        3
    """
    # Verifica se o username do Letterboxd está configurado
    username = os.getenv("LETTERBOXD_USERNAME")
    if not username:
        log.error("LETTERBOXD_USERNAME não configurada — defina a variável de ambiente")
        return {"created": 0, "updated": 0, "skipped": 0, "errors": 1}

    # Busca e parseia o RSS
    entradas = _fetch_rss(username)
    if not entradas:
        log.warning("Nenhuma entrada retornada do RSS — sync encerrado sem erros")
        return {"created": 0, "updated": 0, "skipped": 0, "errors": 0}

    # Filtra por ontem se --yesterday foi passado
    if yesterday_only:
        # "ontem" no fuso de São Paulo
        ontem = (datetime.now(tz=_TZ) - timedelta(days=1)).date()
        entradas_filtradas = [e for e in entradas if e["watched_date"] == ontem]
        log.info(f"Modo --yesterday: {len(entradas_filtradas)} de {len(entradas)} entradas correspondem a {ontem}")
        entradas = entradas_filtradas

    # Contadores de resultado
    criados  = 0
    atualizados = 0
    pulados  = 0
    erros    = 0

    # Processa cada entrada
    for entrada in entradas:
        try:
            result = upsert_movie_from_letterboxd(
                title=entrada["title"],
                year=entrada["year"],
                letterboxd_uri=entrada["letterboxd_uri"],
                rating=entrada["rating"],
                review=entrada["review"],
                watched_date=entrada["watched_date"],
                source="letterboxd_rss",
                enrich_tmdb=enrich_tmdb,
            )
            status = result.get("status")
            if status == "created":
                criados += 1
                log.info(f"✓ Criado:    {entrada['title']} ({entrada['watched_date']})")
            elif status == "updated":
                atualizados += 1
                log.info(f"↻ Atualizado: {entrada['title']} ({entrada['watched_date']})")
            elif status == "skipped":
                pulados += 1
                log.debug(f"○ Pulado:    {entrada['title']} ({entrada['watched_date']}) — já existe")
            else:
                # Status desconhecido — conta como erro
                erros += 1
                log.warning(f"? Status inesperado '{status}' para '{entrada['title']}'")

        except Exception as exc:
            # Captura qualquer exceção inesperada para não interromper o sync
            erros += 1
            log.error(f"Erro ao processar '{entrada['title']}': {exc}", exc_info=True)

    # Resumo final
    log.info(
        f"Sync concluído — criados: {criados}, atualizados: {atualizados}, "
        f"pulados: {pulados}, erros: {erros}"
    )
    return {
        "created":  criados,
        "updated":  atualizados,
        "skipped":  pulados,
        "errors":   erros,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — CLI
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Parser de argumentos de linha de comando
    parser = argparse.ArgumentParser(
        description="Sincroniza o diário Letterboxd RSS com o catálogo da Akane",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python -m scripts.sync_letterboxd              # sync completo (50 mais recentes)
  python -m scripts.sync_letterboxd --yesterday  # só itens de ontem
  python -m scripts.sync_letterboxd -v           # log detalhado (DEBUG)
  python -m scripts.sync_letterboxd --no-tmdb    # sem chamadas ao TMDB
""",
    )
    parser.add_argument(
        "--yesterday",
        action="store_true",
        help="Processa apenas entradas assistidas ontem (para cron diário)",
    )
    parser.add_argument(
        "--no-tmdb",
        action="store_true",
        help="Desabilita enriquecimento TMDB (mais rápido; sem metadados extras)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Log detalhado (nível DEBUG)",
    )
    args = parser.parse_args()

    # Configura o logging de acordo com o nível solicitado
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )

    # Executa o sync
    resultado = run_sync(
        yesterday_only=args.yesterday,
        enrich_tmdb=not args.no_tmdb,
    )

    # Imprime o resumo no stdout como JSON (útil para scripts e webhooks)
    import json
    print(json.dumps(resultado, ensure_ascii=False))

    # Sai com código de erro se houve algum erro de processamento
    sys.exit(0 if resultado["errors"] == 0 else 1)
