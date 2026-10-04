"""Testes da spec 072 — fase 1: estatísticas da Akane no contrato `StatsPayload` + campos novos.

Duas camadas:
  - funções puras (período, sequências, montagem do payload): rodam sem banco;
  - integração com PostgreSQL real (contagem por filme distinto, soft delete, `watchlist_added_at`):
    puladas sem DATABASE_URL. TMDB e rede são mockados.

Execute com:
    pytest tests/agents/test_akane_stats.py -v
    DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test" pytest tests/agents/test_akane_stats.py -v
"""

import os
import unittest.mock as mock
from datetime import date

import pytest

import agents.akane.tools_stats as stats

HOJE = date(2026, 10, 3)


# ─── período ──────────────────────────────────────────────────────────────────

def test_period_bounds_mes_inteiro_e_mesmo_mes_do_ano_anterior():
    assert stats.period_bounds(2026, 2, HOJE) == (
        date(2026, 2, 1), date(2026, 2, 28), date(2025, 2, 1), date(2025, 2, 28))


def test_period_bounds_ano_corrente_vai_ate_hoje_e_compara_com_o_mesmo_trecho():
    assert stats.period_bounds(2026, None, HOJE) == (
        date(2026, 1, 1), HOJE, date(2025, 1, 1), date(2025, 10, 3))


def test_period_bounds_ano_passado_e_o_ano_todo():
    assert stats.period_bounds(2024, None, HOJE) == (
        date(2024, 1, 1), date(2024, 12, 31), date(2023, 1, 1), date(2023, 12, 31))


def test_period_bounds_29_de_fevereiro_vira_28_no_ano_nao_bissexto():
    start, end, prev_start, prev_end = stats.period_bounds(2028, None, date(2028, 2, 29))
    assert end == date(2028, 2, 29) and prev_end == date(2027, 2, 28)


# ─── sequências ───────────────────────────────────────────────────────────────

def test_streaks_atual_vale_ate_ontem():
    s = stats.compute_streaks(["2026-10-01", "2026-10-02"], HOJE)
    assert s == {"best": 2, "current": 2}


def test_streaks_sessao_hoje_conta_e_lacuna_quebra():
    s = stats.compute_streaks(["2026-09-20", "2026-09-21", "2026-09-22", "2026-10-03"], HOJE)
    assert s == {"best": 3, "current": 1}


def test_streaks_duplicadas_ignoradas_e_vazio_seguro():
    assert stats.compute_streaks(["2026-10-02", "2026-10-02"], HOJE) == {"best": 1, "current": 1}
    assert stats.compute_streaks([], HOJE) == {"best": 0, "current": 0}


# ─── montagem do payload ──────────────────────────────────────────────────────

def _totals(**over):
    base = {"films": 0, "sessions": 0, "rewatches": 0, "minutes": 0, "avg_rating": None,
            "cinema": 0, "located": 0}
    return {**base, **over}


def _build(**over):
    args = dict(
        year=2026, month=None, today=HOJE,
        totals=_totals(), prev_totals=_totals(),
        watchlist={"added": 0, "watched": 0}, prev_watchlist={"added": 0, "watched": 0},
        daily=[], ratings=[], rankings={}, most_rewatched=None, liked=[],
    )
    args.update(over)
    return stats.build_stats_payload(**args)


def _kpi(payload, key):
    return next(k for k in payload["kpis"] if k["key"] == key)


def test_payload_vazio_nao_quebra_e_nao_inventa_delta():
    p = _build()
    assert p["period"] == {"year": 2026, "month": None, "label": "2026"}
    assert p["previous"] is None
    assert all(k["prev"] is None for k in p["kpis"])
    assert p["rankings"] == {} and p["records"] == [] and p["moments"] == []
    assert len(p["distribution"]) == 10 and all(b["count"] == 0 for b in p["distribution"])


def test_payload_tem_as_oito_metricas_exigidas_pelo_design_system():
    keys = [k["key"] for k in _build()["kpis"]]
    assert keys == ["films", "sessions", "hours", "rewatches", "avg_rating",
                    "cinema_share", "watchlist_added", "watchlist_watched"]


def test_payload_kpis_horas_cinema_e_delta():
    p = _build(
        totals=_totals(films=10, sessions=12, rewatches=2, minutes=1230, avg_rating=3.75, cinema=3, located=6),
        prev_totals=_totals(films=8, sessions=8, minutes=600, avg_rating=3.5, cinema=1, located=4),
        watchlist={"added": 5, "watched": 2}, prev_watchlist={"added": 1, "watched": 1},
    )
    assert p["previous"] == {"label": "2025"}
    assert _kpi(p, "hours")["value"] == 20.5 and _kpi(p, "hours")["prev"] == 10.0
    assert _kpi(p, "cinema_share")["value"] == 50.0 and _kpi(p, "cinema_share")["prev"] == 25.0
    assert _kpi(p, "avg_rating")["absoluteDelta"] is True and _kpi(p, "avg_rating")["value"] == 3.75
    assert _kpi(p, "watchlist_added")["value"] == 5


def test_payload_cinema_sem_sessao_com_local_e_zero_nao_divisao_por_zero():
    p = _build(totals=_totals(films=1, sessions=1))
    assert _kpi(p, "cinema_share")["value"] == 0.0


def test_payload_mes_usa_rotulo_do_mes_e_do_mesmo_mes_do_ano_anterior():
    p = _build(month=3, prev_totals=_totals(sessions=4))
    assert p["period"]["label"] == "Março de 2026" and p["previous"] == {"label": "Março de 2025"}


def test_payload_monthly_soma_sessoes_por_mes_do_ano():
    p = _build(daily=[{"date": "2026-01-05", "value": 2}, {"date": "2026-01-20", "value": 1},
                      {"date": "2026-03-02", "value": 4}])
    values = {m["month"]: m["value"] for m in p["monthly"]}
    assert values[1] == 3 and values[2] == 0 and values[3] == 4 and len(p["monthly"]) == 12
    assert p["monthlyUnit"] == "sessões"


def test_payload_distribuicao_de_5_a_meia_estrela_com_arredondamento():
    p = _build(ratings=[5.0, 4.5, 4.5, 0.5, 3.2])
    by_bucket = {b["bucket"]: b["count"] for b in p["distribution"]}
    assert [b["bucket"] for b in p["distribution"]][:2] == ["5.0", "4.5"]
    assert by_bucket["4.5"] == 2 and by_bucket["0.5"] == 1 and by_bucket["3.0"] == 1  # 3.2 → 3.0


def test_payload_rankings_omite_vazios_e_titula_os_demais():
    p = _build(rankings={"genres": [{"label": "Drama", "count": 3}], "directors": [], "decades": []})
    assert list(p["rankings"]) == ["genres"]
    assert p["rankings"]["genres"] == {"title": "Gêneros", "items": [{"label": "Drama", "count": 3}]}


def test_payload_recordes_maratona_sequencia_e_mais_revisto():
    daily = [{"date": "2026-09-30", "value": 1}, {"date": "2026-10-01", "value": 3},
             {"date": "2026-10-02", "value": 1}, {"date": "2026-10-03", "value": 1}]
    p = _build(daily=daily, most_rewatched={"title": "Perfect Blue", "sessions": 3})
    by_label = {r["label"]: r for r in p["records"]}
    assert by_label["Maior maratona"]["value"] == "3 filmes" and by_label["Maior maratona"]["detail"] == "01/10/2026"
    assert by_label["Maior sequência"]["value"] == "4 dias"
    assert by_label["Sequência atual"]["value"] == "4 dias"
    assert by_label["Mais revisto"] == {"label": "Mais revisto", "value": "3×", "detail": "Perfect Blue"}


def test_payload_recordes_ignoram_dias_de_fora_do_periodo():
    daily = [{"date": "2026-01-10", "value": 5}, {"date": "2026-03-10", "value": 2}]
    p = _build(month=3, daily=daily)
    by_label = {r["label"]: r for r in p["records"]}
    assert by_label["Maior maratona"]["value"] == "2 filmes"   # os 5 de janeiro não entram em março
    assert "Sequência atual" not in by_label


def test_payload_primeiro_ano_limita_o_seletor_e_nunca_passa_do_ano_pedido():
    assert _build(first_year=2019)["first_year"] == 2019
    assert _build()["first_year"] == 2026                      # sem histórico: o próprio ano
    assert _build(first_year=2030)["first_year"] == 2026       # defesa: nunca depois do ano consultado


def test_payload_momentos_trazem_poster_ano_e_nota():
    p = _build(liked=[{"id": "m1", "title": "Duna", "year": 2021, "poster_url": "http://x/p.jpg", "rating": 4.5}])
    assert p["moments"] == [{"id": "m1", "title": "Duna", "subtitle": "2021", "image": "http://x/p.jpg", "rating": 4.5}]


def test_rotulos_de_idioma_e_pais_caem_no_codigo_quando_desconhecidos():
    assert stats._lang_label("ja") == "Japonês" and stats._lang_label("xx") == "XX"
    assert stats._country_label("JP") == "Japão" and stats._country_label("zz") == "ZZ"


def test_mes_invalido_devolve_erro_sem_tocar_no_banco():
    assert stats.get_stats_payload(2026, 13)["status"] == "error"


# ─── integração (PostgreSQL real) ─────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_AKANE_TABLES = ("movie_favorites, movie_people, movie_vault_items, movie_list_items, movie_lists, "
                 "diary_entries, movie_watch_locations, movies")


@pytest.fixture
def db():
    """Schema da Akane (+ Komi) limpo; devolve o módulo de tools."""
    from agents.db import get_conn
    import agents.akane.tools as tools

    with open(os.path.join(_ROOT, "agents", "akane", "schema_pg.sql"), encoding="utf-8") as f:
        akane_sql = f.read()
    with open(os.path.join(_ROOT, "agents", "komi", "schema_pg.sql"), encoding="utf-8") as f:
        komi_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_AKANE_TABLES} CASCADE")
            cur.execute(komi_sql)
            cur.execute(akane_sql)
    return tools


_META = {"genres": ["Drama", "Mistério"], "director": ["Satoshi Kon"], "runtime": 81, "year": 1997,
         "original_language": "ja", "countries": ["JP"]}


def _add(tools, title="Perfect Blue", status="watched", meta=None):
    with mock.patch("agents.akane.tools._enrich_movie_from_tmdb", return_value=meta or _META):
        r = tools.add_movie(title=title, status=status)
    assert r["status"] == "ok", r
    return r["id"]


@pytestmark_db
def test_rewatch_nao_infla_ranking_nem_horas_contam_por_sessao(db):
    movie = _add(db)
    db.log_watch(movie, watched_date="2026-05-01", rating=4.5)
    db.log_watch(movie, watched_date="2026-05-02", rating=5.0)
    p = stats.get_stats_payload(2026)
    assert p["status"] == "ok"
    assert _kpi(p, "films")["value"] == 1 and _kpi(p, "sessions")["value"] == 2
    assert _kpi(p, "rewatches")["value"] == 1
    assert _kpi(p, "hours")["value"] == round(2 * 81 / 60, 1)
    genres = {i["label"]: i["count"] for i in p["rankings"]["genres"]["items"]}
    assert genres == {"Drama": 1, "Mistério": 1}                       # um filme, não duas sessões
    assert p["rankings"]["directors"]["items"] == [{"label": "Satoshi Kon", "count": 1}]
    assert p["rankings"]["decades"]["items"] == [{"label": "1990s", "count": 1}]
    assert p["rankings"]["countries"]["items"] == [{"label": "Japão", "count": 1}]
    assert p["rankings"]["languages"]["items"] == [{"label": "Japonês", "count": 1}]
    by_bucket = {b["bucket"]: b["count"] for b in p["distribution"]}
    assert by_bucket["5.0"] == 1 and by_bucket["4.5"] == 0             # só a nota mais recente do filme
    assert any(r["label"] == "Mais revisto" for r in p["records"])


@pytestmark_db
def test_filme_apagado_fica_fora_de_tudo(db):
    movie = _add(db)
    db.log_watch(movie, watched_date="2026-05-01", rating=4.0)
    db.delete_movie(movie)
    p = stats.get_stats_payload(2026)
    assert _kpi(p, "films")["value"] == 0 and _kpi(p, "sessions")["value"] == 0
    assert p["rankings"] == {} and p["daily"] == []


@pytestmark_db
def test_ano_sem_dados_devolve_zeros(db):
    p = stats.get_stats_payload(1999)
    assert p["status"] == "ok" and _kpi(p, "films")["value"] == 0 and p["previous"] is None


@pytestmark_db
def test_cinema_vs_casa_usa_o_tipo_do_local_da_sessao(db):
    movie = _add(db)
    cine = db.create_watch_location("Cinemark", "cinema")["location"]["id"]
    casa = db.create_watch_location("Netflix", "streaming")["location"]["id"]
    db.log_watch(movie, watched_date="2026-05-01", watch_location_id=cine)
    db.log_watch(movie, watched_date="2026-05-02", watch_location_id=casa)
    db.log_watch(movie, watched_date="2026-05-03")                      # sem local: fora da proporção
    assert _kpi(stats.get_stats_payload(2026), "cinema_share")["value"] == 50.0


@pytestmark_db
def test_watchlist_added_at_no_ciclo_quero_ver_visto_quero_ver(db):
    from agents.db import run_select
    movie = _add(db, status="watchlist")

    def added_at():
        return run_select("SELECT watchlist_added_at FROM movies WHERE id = %(id)s", {"id": movie})[0]["watchlist_added_at"]

    first = added_at()
    assert first is not None                                            # entrou no Quero ver
    db.update_movie_status(movie, "watched")
    assert added_at() == first                                          # ver o filme não apaga a data
    db.update_movie_status(movie, "watchlist")
    assert added_at() > first                                           # voltar registra nova entrada


@pytestmark_db
def test_logar_filme_recem_criado_como_watchlist_nao_conta_como_quero_ver(db):
    from agents.db import run_select
    movie = _add(db, status="watchlist")                                # fluxo antigo: add → logWatch
    db.log_watch(movie, watched_date="2026-05-01")
    row = run_select("SELECT watchlist_added_at FROM movies WHERE id = %(id)s", {"id": movie})[0]
    assert row["watchlist_added_at"] is None
    assert _kpi(stats.get_stats_payload(2026), "watchlist_added")["value"] == 0


@pytestmark_db
def test_vistos_do_quero_ver_conta_a_primeira_sessao_de_quem_passou_pela_lista(db):
    from agents.db import run_dml
    movie = _add(db, status="watchlist")
    # simula um filme que ficou semanas no Quero ver antes da 1ª sessão
    run_dml("UPDATE movies SET watchlist_added_at = NOW() - INTERVAL '20 days' WHERE id = %(id)s", {"id": movie})
    db.log_watch(movie, watched_date="2026-05-01")
    p = stats.get_stats_payload(2026)
    assert _kpi(p, "watchlist_watched")["value"] == 1


@pytestmark_db
def test_companhia_conta_sessoes_com_a_pessoa(db):
    from agents.komi.tools import create_person
    ana = create_person(name="Ana")["id"]
    movie = _add(db)
    db.log_watch(movie, watched_date="2026-05-01", companion_ids=[ana])
    db.log_watch(movie, watched_date="2026-05-02", companion_ids=[ana])
    p = stats.get_stats_payload(2026)
    assert p["rankings"]["companions"]["items"] == [{"label": "Ana", "count": 2}]
