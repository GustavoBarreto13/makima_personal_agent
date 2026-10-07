"""Testes da spec 073 — fase 1: estatísticas e Início da Frieren no contrato do Design System.

Só funções puras (período, sequências, montagem do payload, ritmo da Início, validação de nota):
rodam sem banco. O que depende de SQL é coberto pelo router mockado em tests/test_books_router.py.

Execute com:
    pytest tests/agents/test_frieren_stats.py -v
"""

from datetime import date

import agents.frieren.tools as tools
import agents.frieren.tools_stats as stats

HOJE = date(2026, 10, 7)


def _totals(**over) -> dict:
    """Totais zerados de um período, com os campos que o teste quiser mudar."""
    base = {"started": 0, "finished": 0, "abandoned": 0, "pages": 0, "sessions": 0,
            "days_reading": 0, "days_per_book": None, "longest_pages": 0, "avg_rating": None}
    base.update(over)
    return base


def _payload(**over) -> dict:
    """Payload do ano corrente com entradas vazias, sobrescrevendo o que o teste pedir."""
    args = dict(year=2026, month=None, today=HOJE, totals=_totals(), prev_totals=_totals(),
                daily=[], ratings=[], rankings={}, longest=None, fastest=None, moments=[])
    args.update(over)
    return stats.build_stats_payload(**args)


def _kpi(payload: dict, key: str) -> dict:
    return next(k for k in payload["kpis"] if k["key"] == key)


# ─── período e sequências ─────────────────────────────────────────────────────

def test_period_bounds_ano_corrente_vai_ate_hoje_e_compara_com_o_mesmo_trecho():
    assert stats.period_bounds(2026, None, HOJE) == (
        date(2026, 1, 1), HOJE, date(2025, 1, 1), date(2025, 10, 7))


def test_period_bounds_mes_inteiro():
    assert stats.period_bounds(2026, 2, HOJE) == (
        date(2026, 2, 1), date(2026, 2, 28), date(2025, 2, 1), date(2025, 2, 28))


def test_sequencia_conta_dias_seguidos_e_nao_dias_com_registro():
    # Bug do legado: 4 dias com leitura espalhados viravam "sequência de 4".
    dias = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-07"]
    assert stats.compute_streaks(dias, HOJE) == {"best": 1, "current": 0}


def test_sequencia_atual_vale_ate_ontem():
    assert stats.compute_streaks(["2026-10-05", "2026-10-06"], HOJE) == {"best": 2, "current": 2}


# ─── KPIs ─────────────────────────────────────────────────────────────────────

def test_kpis_cobrem_as_metricas_minimas_do_design_system():
    # statsRequired.frieren em webapp/frontend/src/design/conformance.json (yearly_goal vem do front)
    obrigatorias = {"books_started", "books_finished", "books_abandoned", "pages", "pages_per_day",
                    "days_reading", "days_per_book", "longest_book"}
    assert obrigatorias <= {k["key"] for k in _payload()["kpis"]}


def test_paginas_por_dia_divide_pelos_dias_do_calendario():
    # 1/jan a 7/out de 2026 = 280 dias; 2800 páginas → 10 por dia (não 2800/dias com leitura).
    p = _payload(totals=_totals(pages=2800, days_reading=40, sessions=40))
    assert _kpi(p, "pages_per_day")["value"] == 10.0


def test_abandonados_tem_kpi_proprio_e_nao_entram_em_lidos():
    p = _payload(totals=_totals(finished=3, abandoned=2, sessions=1))
    assert _kpi(p, "books_finished")["value"] == 3
    assert _kpi(p, "books_abandoned")["value"] == 2


def test_sem_historico_anterior_nao_mostra_delta():
    p = _payload(totals=_totals(finished=2, sessions=3))
    assert p["previous"] is None
    assert all(k["prev"] is None for k in p["kpis"])


def test_com_historico_anterior_mostra_delta():
    p = _payload(totals=_totals(finished=2, sessions=3), prev_totals=_totals(finished=1, sessions=1))
    assert p["previous"] == {"label": "2025"}
    assert _kpi(p, "books_finished")["prev"] == 1


# ─── distribuição, mensal, recordes, momentos ─────────────────────────────────

def test_distribuicao_tem_os_10_degraus_inclusive_abaixo_de_3():
    p = _payload(ratings=[0.5, 1.0, 2.5, 4.5, 4.5, 5.0])
    buckets = {d["bucket"]: d["count"] for d in p["distribution"]}
    assert list(buckets) == ["5.0", "4.5", "4.0", "3.5", "3.0", "2.5", "2.0", "1.5", "1.0", "0.5"]
    assert buckets["0.5"] == 1 and buckets["2.5"] == 1 and buckets["4.5"] == 2


def test_paginas_por_mes_somam_o_diario():
    daily = [{"date": "2026-01-02", "value": 30}, {"date": "2026-01-20", "value": 20},
             {"date": "2026-03-01", "value": 15}]
    p = _payload(daily=daily)
    assert p["monthly"][0] == {"month": 1, "value": 50}
    assert p["monthly"][2] == {"month": 3, "value": 15}
    assert p["monthlyUnit"] == "páginas"


def test_recordes_dia_recorde_sequencia_livro_mais_longo():
    daily = [{"date": "2026-10-05", "value": 40}, {"date": "2026-10-06", "value": 90},
             {"date": "2026-10-07", "value": 10}]
    p = _payload(daily=daily, totals=_totals(finished=2, pages=140, sessions=3),
                 longest={"title": "Duna", "pages": 680}, fastest={"title": "Novela", "days": 1})
    rec = {r["label"]: r for r in p["records"]}
    assert rec["Dia recorde"]["value"] == "90 páginas"
    assert rec["Dia recorde"]["detail"] == "06/10/2026"
    assert rec["Maior sequência"]["value"] == "3 dias"
    assert rec["Sequência atual"]["value"] == "3 dias"
    assert rec["Livro mais longo"]["detail"] == "Duna"
    assert rec["Leitura mais rápida"]["value"] == "1 dia"


def test_generos_diferentes_entram_nos_recordes():
    rec = {r["label"]: r["value"] for r in _payload(genre_count=5)["records"]}
    assert rec["Gêneros diferentes"] == "5"


def test_leitura_mais_rapida_so_aparece_com_dois_livros_ou_mais():
    p = _payload(totals=_totals(finished=1, sessions=1), fastest={"title": "Duna", "days": 37})
    assert "Leitura mais rápida" not in {r["label"] for r in p["records"]}


def test_momentos_no_formato_do_contrato():
    p = _payload(moments=[{"id": "b1", "title": "Duna", "author": "Frank Herbert",
                           "cover_url": None, "rating": 4.5}])
    assert p["moments"] == [{"id": "b1", "title": "Duna", "subtitle": "Frank Herbert",
                             "image": None, "rating": 4.5}]


def test_first_year_nunca_passa_do_ano_pedido():
    assert _payload(first_year=2023)["first_year"] == 2023
    assert _payload(first_year=None)["first_year"] == 2026


def test_idioma_com_regiao_vira_o_mesmo_nome():
    assert stats._lang_label("pt-BR") == stats._lang_label("pt") == "Português"


# ─── ritmo da Início ──────────────────────────────────────────────────────────

def test_ritmo_usa_dias_corridos_e_preenche_zeros():
    daily = [{"date": "2026-10-07", "value": 20}, {"date": "2026-10-01", "value": 10},
             {"date": "2026-09-30", "value": 99}]
    r = stats.build_home_rhythm(daily, HOJE)
    assert r["pages_7d"] == 30          # 1/out a 7/out
    assert r["pages_7d_prev"] == 99     # 24/set a 30/set
    assert r["pages_30d"] == 129        # 8/set a 7/out
    assert len(r["spark"]) == 21 and r["spark"][-1] == {"date": "2026-10-07", "value": 20}
    assert r["spark"][-2]["value"] == 0  # 6/out sem leitura entra como zero


# ─── validação de nota ────────────────────────────────────────────────────────

def test_nota_aceita_meia_estrela_de_0_5_a_5():
    assert all(tools._rating_error(v) is None for v in (None, 0.5, 1.0, 3.5, 5.0))


def test_nota_recusa_fora_do_passo_e_do_intervalo():
    assert all(tools._rating_error(v) for v in (0.0, 4.3, 5.5, -1.0))
    # O router reconhece o erro por este trecho (lista _FRIEREN_ERRORS).
    assert "a avaliação deve ser" in tools._rating_error(4.3).lower()
