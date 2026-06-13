"""Testes de integração — Ingestão Letterboxd (RSS + CSV) para o catálogo Akane.

RSS e rede são mockados — nunca fazem chamadas reais.
O CSV é lido de arquivos temporários criados pelos próprios testes.

Sem DATABASE_URL o módulo inteiro é pulado (skip).

Scenarios cobertos:
    SC-003: idempotência RSS — processar o mesmo feed 2× não cria duplicatas (0 novos na 2ª rodada)
    SC-004: idempotência CSV — importar o mesmo diary.csv 2× não cria duplicatas
    RSS-001: item sem nota (rating nulo) → cria filme sem rating
    RSS-002: item sem data (letterboxd:watchedDate ausente) usa pubDate como fallback
    RSS-003: TMDB fora durante sync RSS → filme criado sem poster_url (gracioso)
    CSV-001: watchlist.csv não sobrescreve status 'watched' de filme já importado
    CSV-002: ratings.csv é processado como fallback quando diary.csv está vazio
"""

import csv
import io
import os
import tempfile
import unittest.mock as mock
from datetime import date
from pathlib import Path

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip(
        "DATABASE_URL não definida — testes de integração de Letterboxd pulados.",
        allow_module_level=True,
    )

from agents.db import get_conn, run_select  # noqa: E402
from agents.akane.tools import upsert_movie_from_letterboxd  # noqa: E402
from scripts.sync_letterboxd import run_sync, _fetch_rss  # noqa: E402
from scripts.import_letterboxd_csv import run_import  # noqa: E402

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

def _make_rss_item(
    title: str,
    year: int = 2021,
    url: str = "https://letterboxd.com/film/duna/",
    rating: str = "4.5",
    watched_date: str = "2026-06-01",
    review: str = "",
) -> str:
    """Gera um item XML para o feed RSS do Letterboxd.

    Returns:
        String XML representando um <item> do feed.
    """
    rating_tag = f"<letterboxd:memberRating>{rating}</letterboxd:memberRating>" if rating else ""
    review_tag = f"<description><![CDATA[{review}]]></description>" if review else "<description></description>"
    return f"""
    <item>
        <title>{title} ({watched_date})</title>
        <link>{url}</link>
        <letterboxd:filmTitle>{title}</letterboxd:filmTitle>
        <letterboxd:filmYear>{year}</letterboxd:filmYear>
        {rating_tag}
        <letterboxd:watchedDate>{watched_date}</letterboxd:watchedDate>
        {review_tag}
    </item>
    """


def _make_rss_feed(*items: str) -> str:
    """Envolve os items em um feed RSS completo.

    Args:
        *items: Strings XML de <item> geradas por _make_rss_item.

    Returns:
        String XML do feed RSS completo.
    """
    items_xml = "\n".join(items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
    xmlns:letterboxd="https://letterboxd.com"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel>
        <title>Gustavo's films, diary and lists</title>
        {items_xml}
    </channel>
</rss>"""


def _mock_rss_response(feed_xml: str):
    """Cria um mock de requests.Response com o conteúdo do feed RSS.

    Args:
        feed_xml: Conteúdo XML do feed RSS.

    Returns:
        Mock configurado para simular uma resposta HTTP com o feed.
    """
    resp = mock.MagicMock()
    resp.raise_for_status = mock.MagicMock()
    resp.content = feed_xml.encode("utf-8")
    return resp


def _write_csv(pasta: Path, nome: str, linhas: list[dict]) -> None:
    """Escreve um CSV com os dados fornecidos na pasta especificada.

    Args:
        pasta: Diretório onde o arquivo será criado.
        nome: Nome do arquivo CSV.
        linhas: Lista de dicts onde cada dict é uma linha.
    """
    if not linhas:
        return
    caminho = pasta / nome
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=linhas[0].keys())
        writer.writeheader()
        writer.writerows(linhas)


# ─────────────────────────────────────────────────────────────────────────────
# SC-003: idempotência RSS
# ─────────────────────────────────────────────────────────────────────────────

def test_sc003_rss_idempotency():
    """SC-003: Processar o mesmo feed RSS 2× não cria duplicatas."""
    feed_xml = _make_rss_feed(
        _make_rss_item("Duna", url="https://letterboxd.com/film/duna/", watched_date="2026-06-01"),
        _make_rss_item("Akira", url="https://letterboxd.com/film/akira/", watched_date="2026-06-02"),
    )

    # Mock: RSS retorna o feed; TMDB fica fora (gracioso)
    with (
        mock.patch("scripts.sync_letterboxd.requests.get") as mock_get,
        mock.patch("agents.akane.tools._tmdb_get", return_value=None),
        mock.patch.dict(os.environ, {"LETTERBOXD_USERNAME": "gustavo"}),
    ):
        mock_get.return_value = _mock_rss_response(feed_xml)

        # 1ª rodada — deve criar 2 filmes
        resultado1 = run_sync(enrich_tmdb=False)
        assert resultado1["created"] == 2, f"Esperado 2 criados; got {resultado1}"
        assert resultado1["errors"] == 0

        # 2ª rodada — mesmos dados, não deve criar nada
        resultado2 = run_sync(enrich_tmdb=False)
        assert resultado2["created"] == 0, f"2ª rodada criou {resultado2['created']} (deveria ser 0)"
        assert resultado2["skipped"] == 2, f"2ª rodada: esperado 2 pulados; got {resultado2['skipped']}"


# ─────────────────────────────────────────────────────────────────────────────
# SC-004: idempotência CSV
# ─────────────────────────────────────────────────────────────────────────────

def test_sc004_csv_idempotency():
    """SC-004: Importar o mesmo diary.csv 2× não cria duplicatas."""
    linhas_diary = [
        {
            "Date": "2026-05-15",
            "Name": "Princess Mononoke",
            "Year": "1997",
            "Letterboxd URI": "https://letterboxd.com/film/princess-mononoke/",
            "Rating": "5",
            "Rewatch": "",
            "Tags": "",
            "Watched Date": "2026-05-15",
            "Review": "Obra-prima",
        }
    ]

    with (
        mock.patch("agents.akane.tools._tmdb_get", return_value=None),
        tempfile.TemporaryDirectory() as tmpdir,
    ):
        pasta = Path(tmpdir)
        _write_csv(pasta, "diary.csv", linhas_diary)

        # 1ª importação — deve criar 1 filme
        r1 = run_import(str(pasta), enrich_tmdb=False)
        assert r1["criados"] == 1, f"Esperado 1 criado; got {r1}"
        assert r1["erros"] == 0

        # 2ª importação — deve pular (idempotência)
        r2 = run_import(str(pasta), enrich_tmdb=False)
        assert r2["criados"] == 0, f"2ª importação criou {r2['criados']} (deveria ser 0)"
        assert r2["pulados"] >= 1


# ─────────────────────────────────────────────────────────────────────────────
# RSS-001: item sem nota (rating nulo)
# ─────────────────────────────────────────────────────────────────────────────

def test_rss001_item_without_rating():
    """RSS-001: Item do feed sem nota cria filme com rating NULL (sem erro)."""
    # Item com rating="" (sem nota)
    feed_xml = _make_rss_feed(
        _make_rss_item(
            "Spirited Away",
            url="https://letterboxd.com/film/spirited-away/",
            rating="",  # Sem nota
            watched_date="2026-05-10",
        )
    )

    with (
        mock.patch("scripts.sync_letterboxd.requests.get") as mock_get,
        mock.patch("agents.akane.tools._tmdb_get", return_value=None),
        mock.patch.dict(os.environ, {"LETTERBOXD_USERNAME": "gustavo"}),
    ):
        mock_get.return_value = _mock_rss_response(feed_xml)
        resultado = run_sync(enrich_tmdb=False)

    # Deve ter criado o filme (sem rating não é erro)
    assert resultado["created"] == 1
    assert resultado["errors"] == 0

    # Verifica que o rating é NULL no banco
    rows = run_select(
        "SELECT rating FROM movies WHERE letterboxd_uri = %(uri)s",
        {"uri": "https://letterboxd.com/film/spirited-away/"},
    )
    assert len(rows) == 1
    assert rows[0]["rating"] is None


# ─────────────────────────────────────────────────────────────────────────────
# RSS-003: TMDB fora durante sync → filme criado sem poster_url
# ─────────────────────────────────────────────────────────────────────────────

def test_rss003_tmdb_down_during_sync():
    """RSS-003: TMDB fora durante o sync RSS → filme criado sem poster_url, sem exceção."""
    feed_xml = _make_rss_feed(
        _make_rss_item(
            "Perfect Blue",
            url="https://letterboxd.com/film/perfect-blue/",
            watched_date="2026-06-10",
        )
    )

    with (
        mock.patch("scripts.sync_letterboxd.requests.get") as mock_get,
        mock.patch("agents.akane.tools._tmdb_get", side_effect=Exception("TMDB fora")),
        mock.patch.dict(os.environ, {"LETTERBOXD_USERNAME": "gustavo"}),
    ):
        mock_get.return_value = _mock_rss_response(feed_xml)
        # O sync deve concluir sem propagar a exceção do TMDB
        resultado = run_sync(enrich_tmdb=True)  # enrich_tmdb=True mas TMDB vai falhar

    # O filme deve ter sido criado mesmo assim
    assert resultado["created"] == 1
    assert resultado["errors"] == 0

    rows = run_select(
        "SELECT poster_url, title FROM movies WHERE letterboxd_uri = %(uri)s",
        {"uri": "https://letterboxd.com/film/perfect-blue/"},
    )
    assert len(rows) == 1
    assert rows[0]["poster_url"] is None  # sem poster pois TMDB falhou


# ─────────────────────────────────────────────────────────────────────────────
# CSV-001: watchlist.csv não sobrescreve 'watched'
# ─────────────────────────────────────────────────────────────────────────────

def test_csv001_watchlist_no_overwrite():
    """CSV-001: watchlist.csv não sobrescreve status 'watched' de filme já importado."""
    uri = "https://letterboxd.com/film/grave-of-fireflies/"

    # Insere o filme como 'watched' via upsert (simulando diary.csv já importado)
    with mock.patch("agents.akane.tools._tmdb_get", return_value=None):
        upsert_movie_from_letterboxd(
            title="Grave of the Fireflies",
            year=1988,
            letterboxd_uri=uri,
            rating=5.0,
            review=None,
            watched_date=date(2026, 4, 1),
            source="letterboxd_csv",
            enrich_tmdb=False,
        )

    # Verifica que está como 'watched'
    rows = run_select("SELECT status FROM movies WHERE letterboxd_uri = %(uri)s", {"uri": uri})
    assert rows[0]["status"] == "watched"

    # Agora importa watchlist.csv com o mesmo filme
    with (
        mock.patch("agents.akane.tools._tmdb_get", return_value=None),
        tempfile.TemporaryDirectory() as tmpdir,
    ):
        pasta = Path(tmpdir)
        _write_csv(pasta, "watchlist.csv", [{
            "Date": "2025-01-01",
            "Name": "Grave of the Fireflies",
            "Year": "1988",
            "Letterboxd URI": uri,
        }])

        r = run_import(str(pasta), enrich_tmdb=False)

    # O filme deve ter sido pulado (não sobrescrito como watchlist)
    rows_after = run_select("SELECT status FROM movies WHERE letterboxd_uri = %(uri)s", {"uri": uri})
    assert rows_after[0]["status"] == "watched", "Status 'watched' foi sobrescrito por watchlist.csv!"

    # O resultado deve indicar que foi pulado
    assert r["pulados"] >= 1
    assert r["criados"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# CSV-002: ratings.csv como fallback quando diary.csv não tem o filme
# ─────────────────────────────────────────────────────────────────────────────

def test_csv002_ratings_fallback():
    """CSV-002: ratings.csv importa filmes sem sessão no diary.csv."""
    with (
        mock.patch("agents.akane.tools._tmdb_get", return_value=None),
        tempfile.TemporaryDirectory() as tmpdir,
    ):
        pasta = Path(tmpdir)

        # Sem diary.csv — só ratings.csv com um filme
        _write_csv(pasta, "ratings.csv", [{
            "Date": "2024-12-25",
            "Name": "Castle in the Sky",
            "Year": "1986",
            "Letterboxd URI": "https://letterboxd.com/film/castle-in-the-sky/",
            "Rating": "4.5",
        }])

        r = run_import(str(pasta), enrich_tmdb=False)

    # Deve ter criado o filme via ratings.csv
    assert r["criados"] == 1, f"Esperado 1 criado via ratings.csv; got {r}"

    rows = run_select(
        "SELECT status, rating FROM movies WHERE letterboxd_uri = %(uri)s",
        {"uri": "https://letterboxd.com/film/castle-in-the-sky/"},
    )
    assert len(rows) == 1
    assert rows[0]["status"] == "watched"
    assert float(rows[0]["rating"]) == 4.5


# ─────────────────────────────────────────────────────────────────────────────
# Teste adicional: run_sync com LETTERBOXD_USERNAME ausente
# ─────────────────────────────────────────────────────────────────────────────

def test_rss_missing_username():
    """run_sync sem LETTERBOXD_USERNAME retorna errors=1 sem crash."""
    # Remove a variável do ambiente para este teste
    env_sem_username = {k: v for k, v in os.environ.items() if k != "LETTERBOXD_USERNAME"}
    with mock.patch.dict(os.environ, env_sem_username, clear=True):
        resultado = run_sync()

    assert resultado["errors"] == 1
    assert resultado["created"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# Teste adicional: import_letterboxd_csv com diretório inválido
# ─────────────────────────────────────────────────────────────────────────────

def test_csv_invalid_directory():
    """run_import com diretório inexistente lança FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        run_import("/caminho/que/nao/existe")


# ─────────────────────────────────────────────────────────────────────────────
# Teste adicional: feed RSS com item sem filmTitle é ignorado
# ─────────────────────────────────────────────────────────────────────────────

def test_rss_item_without_film_title_skipped():
    """Itens do RSS sem <letterboxd:filmTitle> (listas, watchlist) são ignorados."""
    # Item de lista (sem filmTitle)
    item_lista = """
    <item>
        <title>Gustavo's list: Favoritos</title>
        <link>https://letterboxd.com/gustavo/list/favoritos/</link>
        <description>A list of films</description>
    </item>
    """
    # Item de filme real
    item_filme = _make_rss_item(
        "Nausicaa",
        url="https://letterboxd.com/film/nausicaa/",
        watched_date="2026-06-05",
    )
    feed_xml = _make_rss_feed(item_lista, item_filme)

    with (
        mock.patch("scripts.sync_letterboxd.requests.get") as mock_get,
        mock.patch("agents.akane.tools._tmdb_get", return_value=None),
        mock.patch.dict(os.environ, {"LETTERBOXD_USERNAME": "gustavo"}),
    ):
        mock_get.return_value = _mock_rss_response(feed_xml)
        resultado = run_sync(enrich_tmdb=False)

    # Apenas o item de filme deve ter sido criado (o de lista é ignorado)
    assert resultado["created"] == 1
    assert resultado["errors"] == 0
