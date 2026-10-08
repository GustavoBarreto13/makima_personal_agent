"""Testes da spec 074 — fase 1: estatísticas da Marin no contrato `StatsPayload` + campos novos.

Duas camadas:
  - funções puras (período, sequências, temporada, montagem do payload): rodam sem banco;
  - integração com PostgreSQL real (episódios reais, completos/dropados do período, soft delete,
    favoritos, abandono): puladas sem DATABASE_URL. Jikan/AniList/MAL nunca são chamados — os
    animes são inseridos direto por SQL.

Execute com:
    pytest tests/agents/test_marin_stats.py -v
    DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test" pytest tests/agents/test_marin_stats.py -v
"""

import os
import unittest.mock as mock
import uuid
from datetime import date

import pytest

import agents.marin.tools_stats as stats

HOJE = date(2026, 10, 8)


# ─── período e sequências ─────────────────────────────────────────────────────

def test_period_bounds_ano_corrente_vai_ate_hoje_e_compara_com_o_mesmo_trecho():
    assert stats.period_bounds(2026, None, HOJE) == (
        date(2026, 1, 1), HOJE, date(2025, 1, 1), date(2025, 10, 8))


def test_period_bounds_mes_inteiro_e_ano_passado_inteiro():
    assert stats.period_bounds(2026, 2, HOJE) == (
        date(2026, 2, 1), date(2026, 2, 28), date(2025, 2, 1), date(2025, 2, 28))
    assert stats.period_bounds(2024, None, HOJE)[:2] == (date(2024, 1, 1), date(2024, 12, 31))


def test_streaks_atual_vale_ate_ontem_e_lacuna_quebra():
    assert stats.compute_streaks(["2026-10-06", "2026-10-07"], HOJE) == {"best": 2, "current": 2}
    assert stats.compute_streaks(["2026-10-01", "2026-10-03"], HOJE) == {"best": 1, "current": 0}
    assert stats.compute_streaks([], HOJE) == {"best": 0, "current": 0}


# ─── temporada ────────────────────────────────────────────────────────────────

def test_season_label_traduz_ingles_aceita_portugues_e_rejeita_lixo():
    assert stats.season_label("winter 2024") == "Inverno 2024"
    assert stats.season_label("Fall 2019") == "Outono 2019"
    assert stats.season_label("Verão 2021") == "Verão 2021"
    assert stats.season_label("2024") is None
    assert stats.season_label("monsoon 2024") is None
    assert stats.season_label(None) is None


# ─── montagem do payload ──────────────────────────────────────────────────────

def _totals(**over):
    base = {"animes": 0, "sessions": 0, "episodes": 0, "completed": 0, "dropped": 0, "avg_score": None}
    return {**base, **over}


def _build(**over):
    args = dict(
        year=2026, month=None, today=HOJE,
        totals=_totals(), prev_totals=_totals(),
        daily=[], scores=[], rankings={}, top_anime=None, liked=[],
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


def test_payload_tem_as_metricas_exigidas_pelo_design_system():
    assert [k["key"] for k in _build()["kpis"]] == [
        "episodes", "animes", "hours", "completed", "dropped", "avg_rating"]


def test_payload_horas_vem_de_episodios_e_nota_do_mal_vira_estrelas():
    p = _build(
        totals=_totals(animes=3, episodes=46, completed=2, dropped=1, avg_score=8.0),
        prev_totals=_totals(episodes=23, avg_score=7.0),
    )
    assert p["previous"] == {"label": "2025"}
    assert _kpi(p, "hours")["value"] == round(46 * 23 / 60, 1)
    assert _kpi(p, "avg_rating")["value"] == 4.0 and _kpi(p, "avg_rating")["prev"] == 3.5
    assert _kpi(p, "avg_rating")["absoluteDelta"] is True
    assert _kpi(p, "dropped")["value"] == 1


def test_payload_distribuicao_um_ponto_mal_vale_meia_estrela():
    p = _build(scores=[10, 9, 9, 1, 0.5, 7.5])
    by = {b["bucket"]: b["count"] for b in p["distribution"]}
    assert [b["bucket"] for b in p["distribution"]][:2] == ["5.0", "4.5"]
    assert by["5.0"] == 1 and by["4.5"] == 2 and by["0.5"] == 2       # 1 e 0.5 caem na meia estrela
    assert by["4.0"] == 1                                              # 7.5 arredonda para 8 → 4.0


def test_payload_monthly_soma_episodios_por_mes():
    p = _build(daily=[{"date": "2026-01-05", "value": 3}, {"date": "2026-01-20", "value": 2},
                      {"date": "2026-03-01", "value": 7}])
    assert p["monthlyUnit"] == "episódios"
    assert p["monthly"][0]["value"] == 5 and p["monthly"][2]["value"] == 7 and len(p["monthly"]) == 12


def test_payload_recordes_maratona_sequencia_e_mais_assistido():
    p = _build(
        daily=[{"date": "2026-10-05", "value": 12}, {"date": "2026-10-06", "value": 2},
               {"date": "2026-10-07", "value": 1}],
        top_anime={"title": "Frieren", "episodes": 28},
    )
    r = {x["label"]: x for x in p["records"]}
    assert r["Maior maratona"]["value"] == "12 episódios" and r["Maior maratona"]["detail"] == "05/10/2026"
    assert r["Maior sequência"]["value"] == "3 dias" and r["Sequência atual"]["value"] == "3 dias"
    assert r["Mais assistido"]["detail"] == "Frieren"


def test_payload_recordes_ignoram_dias_de_fora_do_periodo():
    p = _build(month=3, daily=[{"date": "2026-01-05", "value": 20}])
    assert not any(r["label"] == "Maior maratona" for r in p["records"])


def test_payload_rankings_omite_vazios_e_titula_os_demais():
    p = _build(rankings={"studios": [{"label": "MAPPA", "count": 3}], "genres": [], "seasons": [], "formats": []})
    assert list(p["rankings"]) == ["studios"]
    assert p["rankings"]["studios"]["title"] == "Estúdios"


def test_payload_momentos_trazem_pôster_subtitulo_e_nota_em_estrelas():
    p = _build(liked=[{"id": "a1", "title": "Frieren", "studio": "Madhouse", "season": "fall 2023",
                       "poster_url": "http://x/p.jpg", "score": 9.0}])
    m = p["moments"][0]
    assert m["subtitle"] == "Madhouse · Outono 2023" and m["rating"] == 4.5 and m["image"] == "http://x/p.jpg"


def test_payload_primeiro_ano_limita_o_seletor_e_nunca_passa_do_ano_pedido():
    assert _build(first_year=2021)["first_year"] == 2021
    assert _build(first_year=2030)["first_year"] == 2026
    assert _build()["first_year"] == 2026


def test_mes_invalido_devolve_erro_sem_tocar_no_banco():
    with mock.patch.object(stats, "_today", return_value=HOJE):
        assert stats.get_stats_payload(2026, 13)["status"] == "error"


# ─── integração com PostgreSQL ────────────────────────────────────────────────

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="requer DATABASE_URL (PostgreSQL de teste)")


@pytest.fixture
def db():
    """Schema da Marin limpo; devolve o módulo de tools."""
    from agents.db import get_conn
    import agents.marin.tools as tools

    with open(os.path.join(_ROOT, "agents", "marin", "schema_pg.sql"), encoding="utf-8") as f:
        sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS anime_favorites, anime_list_items, anime_lists, "
                        "episodes, watch_logs, anime CASCADE")
            cur.execute(sql)
    return tools


def _anime(title="Frieren", status="assistindo", studio="Madhouse", season="fall 2023",
           genres=("Fantasia", "Aventura"), score=9.0, total=28, **extra):
    from agents.db import run_dml
    aid = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO anime (id, title, normalizado, status, studio, season, genres, score, episodes_total,
                           media_type, created_at, updated_at)
        VALUES (%(id)s, %(t)s, %(n)s, %(st)s, %(studio)s, %(season)s, %(g)s, %(sc)s, %(tot)s, 'tv', NOW(), NOW())
        """,
        {"id": aid, "t": title, "n": title.lower(), "st": status, "studio": studio, "season": season,
         "g": list(genres), "sc": score, "tot": total},
    )
    return aid


def _log(aid, day, eps, title="Frieren"):
    from agents.db import run_dml
    run_dml(
        """
        INSERT INTO watch_logs (id, anime_id, anime_title, watched_date, ep_start, ep_end, episodes_count)
        VALUES (%(id)s, %(a)s, %(t)s, %(d)s, 1, %(e)s, %(e)s)
        """,
        {"id": str(uuid.uuid4()), "a": aid, "t": title, "d": day, "e": eps},
    )


def _kpi_val(p, key):
    return _kpi(p, key)["value"]


@pytestmark_db
def test_episodios_sao_reais_e_ranking_conta_anime_distinto(db):
    aid = _anime()
    _log(aid, "2026-05-01", 3)
    _log(aid, "2026-05-02", 5)
    p = stats.get_stats_payload(2026)
    assert p["status"] == "ok"
    assert _kpi_val(p, "episodes") == 8 and _kpi_val(p, "animes") == 1     # 2 sessões, 1 anime
    genres = {i["label"]: i["count"] for i in p["rankings"]["genres"]["items"]}
    assert genres == {"Fantasia": 1, "Aventura": 1}
    assert p["rankings"]["studios"]["items"] == [{"label": "Madhouse", "count": 1}]
    assert p["rankings"]["seasons"]["items"] == [{"label": "Outono 2023", "count": 1}]
    assert p["rankings"]["formats"]["items"] == [{"label": "TV", "count": 1}]
    assert {b["bucket"]: b["count"] for b in p["distribution"]}["4.5"] == 1   # 9.0 MAL → 4.5 estrelas


@pytestmark_db
def test_completos_e_dropados_sao_do_periodo_nao_do_acervo(db):
    from agents.db import run_dml
    a = _anime("A", status="completo")
    b = _anime("B", status="completo")
    c = _anime("C", status="abandonado")
    run_dml("UPDATE anime SET date_finished = '2026-03-10' WHERE id = %(i)s", {"i": a})
    run_dml("UPDATE anime SET date_finished = '2025-03-10' WHERE id = %(i)s", {"i": b})
    run_dml("UPDATE anime SET date_abandoned = '2026-04-01' WHERE id = %(i)s", {"i": c})
    p = stats.get_stats_payload(2026)
    assert _kpi_val(p, "completed") == 1 and _kpi_val(p, "dropped") == 1
    assert _kpi(p, "completed")["prev"] is None or _kpi(p, "completed")["prev"] == 1


@pytestmark_db
def test_anime_apagado_fica_fora_de_tudo(db):
    aid = _anime()
    _log(aid, "2026-05-01", 4)
    db.delete_anime(aid)
    p = stats.get_stats_payload(2026)
    assert _kpi_val(p, "episodes") == 0 and p["rankings"] == {} and p["daily"] == []


@pytestmark_db
def test_ano_sem_dados_devolve_zeros(db):
    p = stats.get_stats_payload(1999)
    assert p["status"] == "ok" and _kpi_val(p, "episodes") == 0 and p["previous"] is None


@pytestmark_db
def test_abandonar_grava_a_data_e_sair_do_abandono_limpa(db):
    from agents.db import run_select
    aid = _anime()
    db.update_anime_status(aid, "abandonado")
    row = run_select("SELECT date_abandoned FROM anime WHERE id = %(i)s", {"i": aid})[0]
    assert row["date_abandoned"] == db._today()
    db.update_anime_status(aid, "assistindo")
    assert run_select("SELECT date_abandoned FROM anime WHERE id = %(i)s", {"i": aid})[0]["date_abandoned"] is None


@pytestmark_db
def test_coracao_e_vitrine_de_favoritos(db):
    a, b = _anime("A"), _anime("B")
    assert db.set_anime_liked(a, True)["liked"] is True
    r = db.set_favorites([b, a])
    assert [f["id"] for f in r["favorites"]] == [b, a]
    assert db.set_favorites([a] * 2)["status"] == "error"                 # repetido
    assert db.set_favorites([a, b, a, b, a])["status"] == "error"         # mais de 4
    assert db.set_favorites(["nao-existe"])["status"] == "error"
    assert db.set_favorites([])["favorites"] == []
    p = stats.get_stats_payload(2026)
    assert p["moments"] == []


@pytestmark_db
def test_restaurar_anime_e_sessao_devolvem_o_estado(db):
    from agents.db import run_select
    aid = _anime(total=2)
    db.delete_anime(aid)
    assert db.restore_anime(aid)["status"] == "ok"
    assert db.restore_anime(aid)["status"] == "error"                     # já estava ativo
    lid = str(uuid.uuid4())
    r = db.restore_watch_log(aid, lid, "2026-05-01", 1, 2, 2, rating=9.0, notes="ok")
    assert r["status"] == "ok"
    row = run_select("SELECT episodes_watched, status FROM anime WHERE id = %(i)s", {"i": aid})[0]
    assert row["episodes_watched"] == 2 and row["status"] == "completo"   # a sessão devolvida completa
    assert db.restore_watch_log(aid, lid, "2026-05-01", 1, 2, 2)["status"] == "error"   # ID repetido
