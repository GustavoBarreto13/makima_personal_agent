"""Enriquecimento em lote dos animes importados via MAL sync — agente Marin.

O sync MAL (`sync_mal`) importa animes com dados mínimos: título, status,
episódios assistidos e nota. Este script complementa esse processo buscando
metadados completos (poster, sinopse, estúdio, gêneros, banner, episódios)
via Jikan + AniList + ARM para todos os animes sem `poster_url`.

Critério de seleção:
    Animes com `poster_url IS NULL` e `mal_id IS NOT NULL` e `deleted = FALSE`.
    Use --force para re-enriquecer todos, independente de já terem poster.

Rate limiting:
    Cada chamada a `enrich_anime` já inclui os delays internos do metadata.py
    (Jikan: 1.2s, AniList: 0.8s, ARM: 0.5s, mais paginação de episódios).
    Para 400 animes sem episódios, o tempo estimado é ~12 min.
    Para 400 animes com episódios (média 12 eps por anime, 1 req/pág):
    ~12 min base + ~10 min de episódios = ~22 min total.

Usage:
    # Enriquece apenas os sem poster (padrão)
    python scripts/enrich_marin.py

    # Re-enriquece todos, mesmo os que já têm poster
    python scripts/enrich_marin.py --force

    # Processa apenas os 50 primeiros (útil para testar)
    python scripts/enrich_marin.py --limit 50

    # No VPS (dentro do container):
    docker exec makima-web sh -c "cd /app && python -m scripts.enrich_marin"
"""

import argparse    # Lê os argumentos de linha de comando (--force, --limit)
import logging     # Exibe progresso e erros durante o processamento
import os          # Lê variáveis de ambiente (DATABASE_URL, TMDB_TOKEN)
import sys         # sys.path e sys.exit()
import uuid        # Gera IDs únicos para episódios inseridos

# Adiciona o root do projeto ao path para importar agents/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Acesso ao banco PostgreSQL compartilhado
from agents.db import get_conn, run_dml, run_select  # noqa: E402

# Função de enriquecimento: Jikan + AniList + ARM + TMDB
from agents.marin.metadata import enrich_anime  # noqa: E402


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO DE LOGGING
# ─────────────────────────────────────────────────────────────────────────────

# Formato simples com timestamp, nível e mensagem — legível no terminal e
# em logs de container (docker logs makima-web)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)

# Logger principal deste script
log = logging.getLogger("enrich_marin")

# Silencia os loggers internos do metadata.py (eles logam em DEBUG).
# O script controla o que aparece no terminal — não precisamos ver cada delay.
logging.getLogger("agents.marin.metadata").setLevel(logging.WARNING)
logging.getLogger("agents.marin.mal_auth").setLevel(logging.WARNING)


# ─────────────────────────────────────────────────────────────────────────────
# QUERY: seleciona animes candidatos ao enriquecimento
# ─────────────────────────────────────────────────────────────────────────────

def _buscar_candidatos(force: bool, limite: int | None) -> list[dict]:
    """Retorna animes do catálogo que precisam de enriquecimento.

    Args:
        force: Se True, retorna todos os animes (mesmo com poster).
               Se False, retorna apenas os sem poster_url.
        limite: Número máximo de animes a retornar. None = sem limite.

    Returns:
        Lista de dicts com {id, mal_id, title} em ordem de criação.
    """
    # Filtra por poster_url IS NULL quando não for --force
    filtro_poster = "" if force else "AND poster_url IS NULL"

    # Limita o resultado quando --limit for fornecido
    clausula_limit = f"LIMIT {limite}" if limite else ""

    sql = f"""
        SELECT id, mal_id, title
          FROM anime
         WHERE deleted = FALSE
           AND mal_id IS NOT NULL
           {filtro_poster}
         ORDER BY created_at ASC
         {clausula_limit}
    """

    return run_select(sql)


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE: aplica os metadados enriquecidos no banco
# ─────────────────────────────────────────────────────────────────────────────

def _aplicar_enriquecimento(anime_id: str, mal_id: int, meta: dict) -> None:
    """Atualiza a linha do anime com os metadados recebidos do enrich_anime.

    Não sobrescreve status, episodes_watched, score, tags, notes, date_started
    ou date_finished — esses campos são gerenciados pelo usuário.

    Args:
        anime_id: UUID do anime no banco (PK da tabela `anime`).
        mal_id: ID do anime no MyAnimeList (para logging).
        meta: Dict retornado por enrich_anime() com os campos de metadados.
    """
    # Trunca a sinopse para 2000 chars (limite definido no schema PostgreSQL)
    overview = meta.get("overview")
    if overview:
        overview = overview[:2000] or None

    # Atualiza apenas os campos de metadados — preserva progresso do usuário
    run_dml(
        """
        UPDATE anime
           SET title          = COALESCE(%(title)s,          title),
               title_english  = COALESCE(%(title_english)s,  title_english),
               title_japanese = COALESCE(%(title_japanese)s, title_japanese),
               normalizado    = COALESCE(%(normalizado)s,    normalizado),
               media_type     = COALESCE(%(media_type)s,     media_type),
               season         = COALESCE(%(season)s,         season),
               studio         = COALESCE(%(studio)s,         studio),
               episodes_total = COALESCE(%(episodes_total)s, episodes_total),
               airing_status  = COALESCE(%(airing_status)s,  airing_status),
               overview       = COALESCE(%(overview)s,       overview),
               genres         = COALESCE(%(genres)s,         genres),
               poster_url     = COALESCE(%(poster_url)s,     poster_url),
               banner_url     = COALESCE(%(banner_url)s,     banner_url),
               anilist_id     = COALESCE(%(anilist_id)s,     anilist_id),
               tmdb_id        = COALESCE(%(tmdb_id)s,        tmdb_id),
               source         = 'jikan',
               updated_at     = NOW()
         WHERE id = %(id)s
        """,
        {
            "id":              anime_id,
            "title":           meta.get("title"),
            "title_english":   meta.get("title_english"),
            "title_japanese":  meta.get("title_japanese"),
            # Recalcula normalizado com o título enriquecido (pode ter mudado)
            "normalizado":     _norm(meta.get("title") or ""),
            "media_type":      meta.get("media_type"),
            "season":          meta.get("season"),
            "studio":          meta.get("studio"),
            "episodes_total":  meta.get("episodes_total"),
            "airing_status":   meta.get("airing_status"),
            "overview":        overview,
            # COALESCE não funciona direto com arrays — passamos None para não sobrescrever
            "genres":          meta.get("genres") or None,
            "poster_url":      meta.get("poster_url"),
            "banner_url":      meta.get("banner_url"),
            "anilist_id":      meta.get("anilist_id"),
            "tmdb_id":         meta.get("tmdb_id"),
        },
    )


def _upsert_episodios(anime_id: str, episodios: list[dict]) -> int:
    """Insere ou atualiza episódios do anime na tabela `episodes`.

    Args:
        anime_id: UUID do anime no banco.
        episodios: Lista de dicts do Jikan/AniList com os campos de episódio.

    Returns:
        Número de episódios inseridos/atualizados com sucesso.
    """
    # Sem episódios retornados pelas APIs, não há nada a fazer
    if not episodios:
        return 0

    count = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            for ep in episodios:
                numero = ep.get("number")

                # Episódio sem número não pode ser persistido (UNIQUE anime_id, number)
                if not numero:
                    continue

                # Trunca sinopse para 2000 chars
                synopsis = ep.get("synopsis")
                if synopsis:
                    synopsis = synopsis[:2000] or None

                # Upsert: se já existir o episódio, atualiza metadados
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
                        "id":            str(uuid.uuid4()),
                        "anime_id":      anime_id,
                        "number":        numero,
                        "title":         ep.get("title"),
                        "aired":         ep.get("aired"),
                        "synopsis":      synopsis,
                        "airing_status": ep.get("airing_status", "agendado"),
                    },
                )
                count += 1

    return count


# ─────────────────────────────────────────────────────────────────────────────
# HELPER: normalização de títulos (mesma lógica de tools.py)
# ─────────────────────────────────────────────────────────────────────────────

import re           # noqa: E402  (importado após o bloco principal para organização)
import unicodedata  # noqa: E402


def _norm(s: str) -> str:
    """Normaliza título para o campo `normalizado` (lower, sem acentos, sem pontuação).

    Args:
        s: String a normalizar.

    Returns:
        String normalizada — minúscula, sem acentos, sem pontuação.
    """
    if not s:
        return ""

    # Minúscula → NFD → remove combining marks → remove pontuação
    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^\w\s]", "", s)
    return s.strip()


# ─────────────────────────────────────────────────────────────────────────────
# PONTO DE ENTRADA
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    """Executa o enriquecimento em lote dos animes sem metadados completos."""

    # ── Parse de argumentos de linha de comando ───────────────────────────────
    parser = argparse.ArgumentParser(
        description="Enriquece animes importados pelo MAL sync com dados do Jikan/AniList/ARM."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-enriquece todos os animes, mesmo os que já têm poster_url.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Processa no máximo N animes (útil para testar antes de rodar tudo).",
    )
    args = parser.parse_args()

    # ── Busca candidatos ──────────────────────────────────────────────────────
    log.info("Buscando animes candidatos ao enriquecimento...")
    candidatos = _buscar_candidatos(force=args.force, limite=args.limit)

    if not candidatos:
        log.info("Nenhum anime para enriquecer. Use --force para re-enriquecer todos.")
        return

    total = len(candidatos)
    modo = "full (--force)" if args.force else "sem poster"
    log.info("Encontrados %d animes para enriquecer [modo: %s]", total, modo)

    # Estimativa de tempo: cada enrich_anime leva ~3–4s base (Jikan + AniList + ARM)
    # mais ~1.2s por página de episódios. Estimativa conservadora: 5s por anime.
    estimativa_min = round(total * 5 / 60, 1)
    log.info("Estimativa conservadora: ~%s min (pode ser mais com episódios)", estimativa_min)

    # ── Processa cada anime ───────────────────────────────────────────────────
    ok = 0          # Animes enriquecidos com sucesso
    erros = 0       # Animes que falharam (erro de API ou banco)
    sem_poster = 0  # Animes onde o Jikan não retornou poster (dados incompletos)

    for i, row in enumerate(candidatos, start=1):
        anime_id  = row["id"]
        mal_id    = row["mal_id"]
        titulo    = row["title"]

        log.info(
            "[%d/%d] Enriquecendo mal_id=%d — %s",
            i, total, mal_id, titulo,
        )

        try:
            # Chama Jikan + AniList + ARM + TMDB (delays internos já incluídos)
            meta = enrich_anime(mal_id)

            # Aplica metadados no banco (UPDATE da linha do anime)
            _aplicar_enriquecimento(anime_id, mal_id, meta)

            # Insere/atualiza episódios (se o Jikan retornou algum)
            episodios = meta.get("jikan_episodes") or []
            n_eps = _upsert_episodios(anime_id, episodios)

            # Loga o resultado do anime
            poster_status = "✓ poster" if meta.get("poster_url") else "⚠ sem poster"
            log.info(
                "  → %s | %d eps | %s",
                poster_status,
                n_eps,
                meta.get("title") or titulo,
            )

            # Conta animes onde o Jikan não retornou poster (metadados incompletos)
            if not meta.get("poster_url"):
                sem_poster += 1

            ok += 1

        except Exception as exc:
            # Erro em um anime não deve parar o lote inteiro.
            # Loga o erro e continua com o próximo.
            log.error(
                "  ✗ Erro ao enriquecer mal_id=%d (%s): %s",
                mal_id, titulo, exc,
                exc_info=True,
            )
            erros += 1

    # ── Resumo final ──────────────────────────────────────────────────────────
    log.info("")
    log.info("═══════════════════════════════════")
    log.info("Enriquecimento concluído!")
    log.info("  Total processados : %d", total)
    log.info("  Sucesso           : %d", ok)
    log.info("  Sem poster (Jikan): %d", sem_poster)
    log.info("  Erros             : %d", erros)
    log.info("═══════════════════════════════════")

    if sem_poster:
        log.info(
            "Dica: %d animes ficaram sem poster. "
            "Pode ser conteúdo adulto/removido do Jikan, ou mal_id incorreto.",
            sem_poster,
        )

    if erros:
        log.warning(
            "%d animes falharam. Rode novamente — os que já foram enriquecidos "
            "não serão reprocessados (já têm poster_url).",
            erros,
        )


if __name__ == "__main__":
    main()
