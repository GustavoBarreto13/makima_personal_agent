"""Testes de integração da camada de lógica de filmes (Akane — spec 015).

São testes de integração contra um PostgreSQL real.
TMDB e rede externa são mockados — nunca fazem chamadas reais.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_akane.py -v

Sem DATABASE_URL o módulo inteiro é pulado (skip).

Scenarios cobertos:
    SC-001: add_movie → log_watch → filme vira 'watched' + 1 sessão no diário
    SC-002: rewatch — 2 log_watch no mesmo filme → times_watched=2, 2 diary_entries
    SC-003: idempotência letterboxd_uri — add_movie com URI duplicada retorna error
    SC-005: TMDB fora → filme criado sem poster_url, sem exceção
    SC-006: get_stats com ano sem dados → retorna zeros sem crash
    SC-007: soft delete — delete_movie deixa diary_entries intactas
    SC-008: validação de rating — nota fora do intervalo retorna error
"""

import os
import unittest.mock as mock
from datetime import date

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip(
        "DATABASE_URL não definida — testes de integração da Akane pulados.",
        allow_module_level=True,
    )

from agents.db import get_conn, run_select  # noqa: E402

# Importa as tools após o skip (para não falhar no import sem banco)
from agents.akane.tools import (  # noqa: E402
    add_movie,
    log_watch,
    rate_movie,
    set_like,
    delete_movie,
    delete_diary_entry,
    get_movie_detail,
    get_stats,
    get_diary,
    get_watchlist,
    list_movies,
)

# Caminho do schema da Akane
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "akane", "schema_pg.sql",
)

# Tabelas a dropar antes de cada teste (dependentes primeiro para respeitar FKs)
_AKANE_TABLES = (
    "movie_favorites movie_people movie_vault_items "
    "movie_list_items movie_lists diary_entries movies"
)


@pytest.fixture(autouse=True)
def reset_schema():
    """Dropa e recria o schema de filmes antes de cada teste.

    Garante isolamento total — cada teste começa com banco vazio.
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Dropa em ordem de dependência (CASCADE para FKs)
            cur.execute(f"DROP TABLE IF EXISTS {_AKANE_TABLES.replace(' ', ', ')} CASCADE")
            # Recria do zero (IF NOT EXISTS protege contra schema parcialmente existente)
            cur.execute(schema_sql)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de teste
# ─────────────────────────────────────────────────────────────────────────────

def _add_mock_movie(title: str = "Duna", year: int = 2021) -> str:
    """Adiciona um filme sem chamar o TMDB real (retorna o ID).

    Mocka _enrich_movie_from_tmdb para retornar dict vazio (simula TMDB fora).
    """
    with mock.patch("agents.akane.tools._enrich_movie_from_tmdb", return_value={}):
        result = add_movie(title=title, year=year)
    assert result["status"] == "ok", f"add_movie falhou: {result}"
    return result["id"]


# ─────────────────────────────────────────────────────────────────────────────
# SC-001: add_movie → log_watch → watched + 1 sessão
# ─────────────────────────────────────────────────────────────────────────────

def test_sc001_add_and_log_watch():
    """SC-001: Adicionar um filme à watchlist e logar → vira 'watched' com 1 sessão."""
    # 1. Adiciona o filme (sem TMDB)
    movie_id = _add_mock_movie("Duna", 2021)

    # Verifica que foi criado como watchlist
    rows = run_select("SELECT status, times_watched FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert rows[0]["status"] == "watchlist"
    assert rows[0]["times_watched"] == 0

    # 2. Loga a sessão com nota
    result = log_watch(movie_id, watched_date="2026-06-01", rating=4.5)
    assert result["status"] == "ok"

    # 3. Verifica que o filme virou 'watched' e times_watched=1
    rows = run_select("SELECT status, times_watched, rating FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert rows[0]["status"] == "watched"
    assert rows[0]["times_watched"] == 1
    assert float(rows[0]["rating"]) == 4.5

    # 4. Verifica que existe exatamente 1 entrada no diário
    diary_rows = run_select("SELECT COUNT(*) AS cnt FROM diary_entries WHERE movie_id = %(id)s", {"id": movie_id})
    assert int(diary_rows[0]["cnt"]) == 1


# ─────────────────────────────────────────────────────────────────────────────
# SC-002: rewatch — 2 log_watch → times_watched=2, rewatch=TRUE no 2º
# ─────────────────────────────────────────────────────────────────────────────

def test_sc002_rewatch():
    """SC-002: Logar o mesmo filme 2 vezes → times_watched=2, 2 diary_entries, 2º é rewatch."""
    movie_id = _add_mock_movie("Cidade de Deus", 2002)

    # 1ª sessão (não é rewatch — primeira vez)
    r1 = log_watch(movie_id, watched_date="2026-01-10", rating=4.0)
    assert r1["status"] == "ok"
    assert r1["rewatch"] is False

    # 2ª sessão (deve ser inferida como rewatch — times_watched já era > 0)
    r2 = log_watch(movie_id, watched_date="2026-03-15", rating=4.5)
    assert r2["status"] == "ok"
    assert r2["rewatch"] is True

    # Verifica times_watched no banco
    rows = run_select("SELECT times_watched FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert int(rows[0]["times_watched"]) == 2

    # Verifica 2 sessões no diário
    diary_rows = run_select("SELECT rewatch FROM diary_entries WHERE movie_id = %(id)s ORDER BY watched_date", {"id": movie_id})
    assert len(diary_rows) == 2
    assert diary_rows[0]["rewatch"] is False    # 1ª sessão
    assert diary_rows[1]["rewatch"] is True     # 2ª sessão = rewatch


# ─────────────────────────────────────────────────────────────────────────────
# SC-003: idempotência letterboxd_uri
# ─────────────────────────────────────────────────────────────────────────────

def test_sc003_letterboxd_dedup():
    """SC-003: Adicionar filme com letterboxd_uri duplicada → error (idempotência)."""
    lb_uri = "https://letterboxd.com/film/duna/"

    with mock.patch("agents.akane.tools._enrich_movie_from_tmdb", return_value={}):
        # Primeira adição — deve funcionar
        r1 = add_movie(title="Duna", letterboxd_uri=lb_uri)
        assert r1["status"] == "ok"

        # Segunda adição com a mesma URI — deve retornar error (não duplicar)
        r2 = add_movie(title="Duna", letterboxd_uri=lb_uri)
        assert r2["status"] == "error"
        assert "já existe" in r2["message"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# SC-005: TMDB fora → filme criado sem poster_url, sem exceção
# ─────────────────────────────────────────────────────────────────────────────

def test_sc005_tmdb_fallback():
    """SC-005: Quando o TMDB está fora, add_movie cria o filme sem poster_url (sem exceção)."""
    # Simula TMDB retornando erro (requests.RequestException)
    with mock.patch("agents.akane.tools._tmdb_get", return_value=None):
        result = add_movie(title="Perfect Blue", year=1997)

    # Deve ter criado o filme sem quebrar
    assert result["status"] == "ok"

    # poster_url deve ser NULL
    rows = run_select(
        "SELECT poster_url, title FROM movies WHERE id = %(id)s",
        {"id": result["id"]},
    )
    assert rows[0]["poster_url"] is None
    assert rows[0]["title"] == "Perfect Blue"


# ─────────────────────────────────────────────────────────────────────────────
# SC-006: get_stats com ano sem dados → zeros sem crash
# ─────────────────────────────────────────────────────────────────────────────

def test_sc006_stats_empty_year():
    """SC-006: get_stats para um ano sem dados retorna zeros — nunca levanta exceção."""
    # Banco vazio, busca stats de um ano que definitivamente não tem dados
    result = get_stats(year=1900)

    # Não deve ter levantado exceção — verifica os valores zerados
    assert result["status"] == "ok"
    assert result["total_films"] == 0
    assert result["total_sessions"] == 0
    assert result["avg_rating"] is None
    assert result["top_genres"] == []
    assert result["top_directors"] == []
    # Histograma deve existir e estar zerado (nunca None)
    assert isinstance(result["rating_histogram"], dict)
    assert all(v == 0 for v in result["rating_histogram"].values())


# ─────────────────────────────────────────────────────────────────────────────
# SC-007: soft delete preserva diary_entries
# ─────────────────────────────────────────────────────────────────────────────

def test_sc007_soft_delete_preserves_diary():
    """SC-007: delete_movie marca deleted=TRUE mas preserva as diary_entries."""
    movie_id = _add_mock_movie("Grave of the Fireflies", 1988)
    log_watch(movie_id, watched_date="2026-05-01")

    # Verifica que existe 1 sessão antes do delete
    before = run_select("SELECT COUNT(*) AS cnt FROM diary_entries WHERE movie_id = %(id)s", {"id": movie_id})
    assert int(before[0]["cnt"]) == 1

    # Soft delete
    result = delete_movie(movie_id)
    assert result["status"] == "ok"

    # Filme deve estar marcado como deleted=TRUE
    rows = run_select("SELECT deleted FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert rows[0]["deleted"] is True

    # Diary_entries deve AINDA existir (soft delete não apaga histórico)
    after = run_select("SELECT COUNT(*) AS cnt FROM diary_entries WHERE movie_id = %(id)s", {"id": movie_id})
    assert int(after[0]["cnt"]) == 1


# ─────────────────────────────────────────────────────────────────────────────
# SC-008: validação de rating — nota inválida retorna error
# ─────────────────────────────────────────────────────────────────────────────

def test_sc008_rating_validation():
    """SC-008: Nota fora do intervalo [0.5, 5.0] ou passo inválido → error."""
    movie_id = _add_mock_movie("Spirited Away", 2001)

    # Nota acima de 5.0
    r = log_watch(movie_id, rating=5.5)
    assert r["status"] == "error"

    # Nota abaixo de 0.5
    r = log_watch(movie_id, rating=0.0)
    assert r["status"] == "error"

    # Nota com passo inválido (0.3 não é múltiplo de 0.5)
    r = log_watch(movie_id, rating=3.3)
    assert r["status"] == "error"

    # Notas válidas (apenas para confirmar que o filme não foi logado inadvertidamente)
    r = log_watch(movie_id, rating=4.5)
    assert r["status"] == "ok"

    r2 = log_watch(movie_id, rating=None)   # Sem nota é válido
    assert r2["status"] == "ok"


# ─────────────────────────────────────────────────────────────────────────────
# Testes adicionais: rate_movie, set_like, delete_diary_entry
# ─────────────────────────────────────────────────────────────────────────────

def test_rate_movie():
    """rate_movie atualiza nota e rating_source='own'."""
    movie_id = _add_mock_movie("Satoshi Kon Film")

    r = rate_movie(movie_id, 4.0)
    assert r["status"] == "ok"

    rows = run_select("SELECT rating, rating_source FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert float(rows[0]["rating"]) == 4.0
    assert rows[0]["rating_source"] == "own"

    # Rating inválido
    r = rate_movie(movie_id, 6.0)
    assert r["status"] == "error"


def test_set_like():
    """set_like alterna o campo liked corretamente."""
    movie_id = _add_mock_movie("Princess Mononoke")

    r = set_like(movie_id, True)
    assert r["status"] == "ok"

    rows = run_select("SELECT liked FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert rows[0]["liked"] is True

    r = set_like(movie_id, False)
    assert r["status"] == "ok"

    rows = run_select("SELECT liked FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert rows[0]["liked"] is False


def test_delete_diary_entry_recalculates_times_watched():
    """delete_diary_entry remove sessão e recalcula times_watched."""
    movie_id = _add_mock_movie("My Neighbor Totoro")

    # Loga 2 sessões
    log_watch(movie_id, watched_date="2026-01-01")
    r2 = log_watch(movie_id, watched_date="2026-02-01")
    diary_id = r2["diary_id"]

    # Verifica times_watched=2
    rows = run_select("SELECT times_watched FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert int(rows[0]["times_watched"]) == 2

    # Remove a 2ª sessão
    r = delete_diary_entry(diary_id)
    assert r["status"] == "ok"

    # times_watched deve ser recalculado para 1
    rows = run_select("SELECT times_watched FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert int(rows[0]["times_watched"]) == 1


def test_get_movie_detail_returns_all_sections():
    """get_movie_detail retorna as 4 seções: movie, people, vault, diary."""
    movie_id = _add_mock_movie("Castle in the Sky")
    log_watch(movie_id, watched_date="2026-06-01", rating=5.0, review="Perfeito!")

    result = get_movie_detail(movie_id)
    assert result["status"] == "ok"

    # Todas as seções devem existir
    assert "movie" in result
    assert "people" in result
    assert "vault" in result
    assert "diary" in result

    # Deve ter 1 sessão no diário
    assert len(result["diary"]) == 1
    assert float(result["diary"][0]["rating"]) == 5.0


def test_list_movies_filters():
    """list_movies com filtros de status retorna apenas os filmes corretos."""
    wl_id = _add_mock_movie("Watchlist Film")
    wd_id = _add_mock_movie("Watched Film")
    log_watch(wd_id, watched_date="2026-06-01")

    # Filtro watched
    watched = list_movies(status="watched")
    watched_ids = [m["id"] for m in watched]
    assert wd_id in watched_ids
    assert wl_id not in watched_ids

    # Filtro watchlist
    in_wl = list_movies(status="watchlist")
    wl_ids = [m["id"] for m in in_wl]
    assert wl_id in wl_ids
    assert wd_id not in wl_ids
