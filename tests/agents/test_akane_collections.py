"""Testes de integração — Listas, Etiquetas, Cofre e Pessoas (Onda 5 — spec 015).

Sem DATABASE_URL o módulo inteiro é pulado (skip).

Scenarios cobertos:
    SC-010a: lista round-trip — criar lista, adicionar filme, listar, remover filme, deletar lista
    SC-010b: filtro por etiqueta — list_movies(tag=X) retorna só filmes com essa tag
    SC-010c: Cofre — add_vault_item, get_vault, delete_vault_item
    SC-010d: notas — set_notes persiste no banco
    SC-010e: pessoas — get_movie_detail inclui people[]
    SC-009: favoritos — set_favorites + get_favorites round-trip, limite 4, só 'watched'
"""

import os
import unittest.mock as mock
from datetime import date

import pytest

# Sem banco configurado, pula o módulo inteiro
if not os.environ.get("DATABASE_URL"):
    pytest.skip(
        "DATABASE_URL não definida — testes de coleções (Akane Onda 5) pulados.",
        allow_module_level=True,
    )

from agents.db import get_conn, run_select  # noqa: E402
from agents.akane.tools import (  # noqa: E402
    add_movie,
    log_watch,
    set_notes,
    list_movies,
    get_movie_detail,
    create_list,
    delete_list,
    get_list,
    get_lists,
    add_to_list,
    remove_from_list,
    get_tags,
    get_vault,
    add_vault_item,
    delete_vault_item,
    get_favorites,
    set_favorites,
)

# Caminho do schema da Akane
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "akane", "schema_pg.sql",
)

# Tabelas a dropar antes de cada teste
_AKANE_TABLES = (
    "movie_favorites movie_people movie_vault_items "
    "movie_list_items movie_lists diary_entries movies"
)


@pytest.fixture(autouse=True)
def reset_schema():
    """Dropa e recria o schema de filmes antes de cada teste."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_AKANE_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de teste
# ─────────────────────────────────────────────────────────────────────────────

def _add_mock_movie(title: str = "Duna", year: int = 2021) -> str:
    """Adiciona um filme sem chamar TMDB (retorna o ID)."""
    with mock.patch("agents.akane.tools._enrich_movie_from_tmdb", return_value={}):
        r = add_movie(title=title, year=year)
    assert r["status"] == "ok", f"add_movie falhou: {r}"
    return r["id"]


def _add_watched_movie(title: str = "Duna", year: int = 2021) -> str:
    """Adiciona um filme e loga uma sessão (status='watched')."""
    movie_id = _add_mock_movie(title, year)
    log_watch(movie_id, watched_date="2026-06-01")
    return movie_id


# ─────────────────────────────────────────────────────────────────────────────
# SC-010a: Lista round-trip
# ─────────────────────────────────────────────────────────────────────────────

def test_sc010a_list_round_trip():
    """SC-010a: Criar lista, adicionar filme, listar, remover, deletar."""
    movie_id = _add_mock_movie("Akira", 1988)

    # 1. Cria a lista
    r_create = create_list(name="Animação Japonesa", description="Clássicos do anime")
    assert r_create["status"] == "ok"
    list_id = r_create["id"]

    # 2. Lista deve aparecer em get_lists
    r_lists = get_lists()
    list_ids = [l["id"] for l in r_lists]
    assert list_id in list_ids

    # 3. Adiciona o filme à lista
    r_add = add_to_list(list_id=list_id, movie_id=movie_id)
    assert r_add["status"] == "ok"

    # 4. get_list deve incluir o filme
    r_detail = get_list(list_id)
    assert r_detail["status"] == "ok"
    film_ids = [f["id"] for f in r_detail["films"]]
    assert movie_id in film_ids

    # 5. Remove o filme da lista
    r_remove = remove_from_list(list_id=list_id, movie_id=movie_id)
    assert r_remove["status"] == "ok"

    # Verifica que a lista está vazia
    r_detail_after = get_list(list_id)
    assert len(r_detail_after["films"]) == 0

    # 6. Deleta a lista
    r_delete = delete_list(list_id)
    assert r_delete["status"] == "ok"

    # Verifica que a lista não aparece mais
    r_lists_after = get_lists()
    assert list_id not in [l["id"] for l in r_lists_after]


# ─────────────────────────────────────────────────────────────────────────────
# SC-010b: Filtro por etiqueta
# ─────────────────────────────────────────────────────────────────────────────

def test_sc010b_tag_filter():
    """SC-010b: list_movies(tag=X) retorna apenas filmes com a tag X."""
    # Adiciona 2 filmes — um com tag 'anime', outro sem tag
    id_anime  = _add_mock_movie("Nausicaa", 1984)
    id_outro  = _add_mock_movie("Matrix", 1999)

    # Loga sessões para ambos ficarem como 'watched'
    log_watch(id_anime,  watched_date="2026-05-01", tags=["anime", "miyazaki"])
    log_watch(id_outro, watched_date="2026-05-02")

    # Filtro por tag 'anime'
    filmes_anime = list_movies(tag="anime")
    ids_retornados = [m["id"] for m in filmes_anime]
    assert id_anime in ids_retornados, "Filme com tag 'anime' deveria aparecer"
    assert id_outro not in ids_retornados, "Filme sem tag 'anime' não deveria aparecer"

    # Filtro por tag 'miyazaki' (segunda tag)
    filmes_miyazaki = list_movies(tag="miyazaki")
    ids_miyazaki = [m["id"] for m in filmes_miyazaki]
    assert id_anime in ids_miyazaki


# ─────────────────────────────────────────────────────────────────────────────
# SC-010c: Cofre (vault)
# ─────────────────────────────────────────────────────────────────────────────

def test_sc010c_vault_crud():
    """SC-010c: Adicionar item ao Cofre, buscar, remover."""
    movie_id = _add_mock_movie("Perfect Blue", 1997)

    # Verifica que o cofre está vazio inicialmente
    r_empty = get_vault(movie_id)
    assert r_empty["status"] == "ok"
    assert len(r_empty["items"]) == 0

    # Adiciona um item de vídeo ao cofre
    r_add = add_vault_item(
        movie_id=movie_id,
        type="video",
        title="Análise de Perfect Blue",
        url="https://youtube.com/watch?v=example",
        source="YouTube",
    )
    assert r_add["status"] == "ok"
    vault_id = r_add["id"]

    # Cofre deve ter 1 item
    r_vault = get_vault(movie_id)
    assert len(r_vault["items"]) == 1
    assert r_vault["items"][0]["title"] == "Análise de Perfect Blue"
    assert r_vault["items"][0]["type"] == "video"

    # Remove o item do cofre
    r_del = delete_vault_item(vault_id)
    assert r_del["status"] == "ok"

    # Cofre deve estar vazio novamente
    r_vault_after = get_vault(movie_id)
    assert len(r_vault_after["items"]) == 0


# ─────────────────────────────────────────────────────────────────────────────
# SC-010d: Notas persistem no banco
# ─────────────────────────────────────────────────────────────────────────────

def test_sc010d_notes_persist():
    """SC-010d: set_notes persiste o texto no banco e get_movie_detail retorna."""
    movie_id = _add_mock_movie("Grave of the Fireflies", 1988)
    texto_nota = "Um dos filmes mais tristes que já vi. Assistir com lenço."

    r = set_notes(movie_id, texto_nota)
    assert r["status"] == "ok"

    # Verifica diretamente no banco
    rows = run_select("SELECT notes FROM movies WHERE id = %(id)s", {"id": movie_id})
    assert rows[0]["notes"] == texto_nota

    # get_movie_detail também deve retornar as notas
    detail = get_movie_detail(movie_id)
    assert detail["movie"]["notes"] == texto_nota


# ─────────────────────────────────────────────────────────────────────────────
# SC-010e: Pessoas no detalhe
# ─────────────────────────────────────────────────────────────────────────────

def test_sc010e_people_in_detail():
    """SC-010e: get_movie_detail inclui people[] (via movie_people)."""
    movie_id = _add_mock_movie("Princess Mononoke", 1997)

    # Insere manualmente um person (simula o enriquecimento TMDB que o faria normalmente)
    import uuid
    person_id = str(uuid.uuid4())
    from agents.db import run_dml
    run_dml(
        """
        INSERT INTO movie_people (id, movie_id, name, normalizado, role, is_person_tag)
        VALUES (%(id)s, %(movie_id)s, %(name)s, %(norm)s, %(role)s, %(person_tag)s)
        """,
        {
            "id":         person_id,
            "movie_id":   movie_id,
            "name":       "Hayao Miyazaki",
            "norm":       "hayao miyazaki",
            "role":       "Director",
            "person_tag": True,
        },
    )

    # Verifica que get_movie_detail retorna a pessoa
    detail = get_movie_detail(movie_id)
    assert detail["status"] == "ok"
    people_names = [p["name"] for p in detail["people"]]
    assert "Hayao Miyazaki" in people_names


# ─────────────────────────────────────────────────────────────────────────────
# SC-009: Favoritos — round-trip + limite 4 + só 'watched'
# ─────────────────────────────────────────────────────────────────────────────

def test_sc009_favorites_round_trip():
    """SC-009: set_favorites + get_favorites — persiste no servidor."""
    # Cria 3 filmes assistidos
    ids = [
        _add_watched_movie("Duna", 2021),
        _add_watched_movie("Akira", 1988),
        _add_watched_movie("Nausicaa", 1984),
    ]

    # Define os 3 como favoritos
    r_set = set_favorites(ids=ids)
    assert r_set["status"] == "ok"

    # Recupera e verifica
    r_get = get_favorites()
    fav_ids = [f["id"] for f in r_get["favorites"]]
    for movie_id in ids:
        assert movie_id in fav_ids

    # Verifica que a ordem de posição está correta
    assert r_get["favorites"][0]["id"] == ids[0]


def test_sc009_favorites_max_4():
    """SC-009: set_favorites com 5 filmes retorna error (limite = 4)."""
    ids = [_add_watched_movie(f"Film {i}", 2020 + i) for i in range(5)]

    r = set_favorites(ids=ids)
    assert r["status"] == "error"
    assert "4" in r["message"]  # Mensagem deve citar o limite


def test_sc009_favorites_only_watched():
    """SC-009: Filme com status='watchlist' não pode ser favorito."""
    # Adiciona um filme à watchlist (sem logar)
    watchlist_id = _add_mock_movie("Não assisti ainda", 2024)

    r = set_favorites(ids=[watchlist_id])
    assert r["status"] == "error", "Filme da watchlist não deve poder ser favorito"


def test_sc009_favorites_empty():
    """SC-009: set_favorites([]) limpa os favoritos."""
    watched_id = _add_watched_movie("Spirited Away", 2001)
    set_favorites(ids=[watched_id])

    # Limpa favoritos
    r = set_favorites(ids=[])
    assert r["status"] == "ok"

    r_get = get_favorites()
    assert len(r_get["favorites"]) == 0


# ─────────────────────────────────────────────────────────────────────────────
# Teste adicional: get_tags retorna as etiquetas corretamente
# ─────────────────────────────────────────────────────────────────────────────

def test_get_tags_returns_tags():
    """get_tags retorna etiquetas dos filmes assistidos."""
    movie_id = _add_mock_movie("My Neighbor Totoro", 1988)
    log_watch(movie_id, watched_date="2026-06-01", tags=["ghibli", "infantil", "miyazaki"])

    r = get_tags()
    assert r["status"] == "ok"
    tag_names = [t["name"] for t in r["tags"]]

    for tag in ["ghibli", "infantil", "miyazaki"]:
        assert tag in tag_names, f"Tag '{tag}' deveria aparecer em get_tags"


# ─────────────────────────────────────────────────────────────────────────────
# Teste adicional: vault com tipo inválido retorna error
# ─────────────────────────────────────────────────────────────────────────────

def test_vault_invalid_type():
    """add_vault_item com tipo inválido retorna error."""
    movie_id = _add_mock_movie("Castle in the Sky", 1986)

    r = add_vault_item(movie_id=movie_id, type="podcast", title="Análise inválida")
    assert r["status"] == "error"
    assert "tipo" in r["message"].lower() or "inválido" in r["message"].lower()
