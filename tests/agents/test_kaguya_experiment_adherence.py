"""Testes do motor puro de aderência de experimento — Tiny Experiments (spec 029).

São testes **puros** (sem banco), rápidos e determinísticos — o equivalente, para
experimentos, do gate puro de hábitos em ``test_kaguya_habit_strength.py``. Rodam SEMPRE
(não dependem de ``DATABASE_URL``) e são o gate do princípio "falha = dado": a aderência de
um experimento **não zera** por causa de uma falha isolada enquanto houver cumprimentos.

Como rodar:
    pytest tests/agents/test_kaguya_experiment_adherence.py -v
"""

from datetime import date, timedelta

from agents.kaguya import experiment_adherence as A

# Data de referência fixa para os testes serem determinísticos (uma segunda-feira).
HOJE = date(2026, 6, 29)  # 29/06/2026 é uma segunda-feira


def _logs(days_done):
    """Monta uma lista de check-ins ``{period_date, done}`` a partir de ``[(date, bool), ...]``."""
    return [{"period_date": d, "done": done} for d, done in days_done]


# ──────────────────────────────────────────────────────────────────────────────
# monday_of / period_date_for — normalização de período
# ──────────────────────────────────────────────────────────────────────────────
def test_monday_of_normaliza_para_segunda():
    """Qualquer dia da semana normaliza para a segunda-feira daquela semana."""
    assert A.monday_of(date(2026, 7, 1)) == date(2026, 6, 29)   # quarta → segunda
    assert A.monday_of(date(2026, 6, 29)) == date(2026, 6, 29)  # a própria segunda
    assert A.monday_of(date(2026, 7, 5)) == date(2026, 6, 29)   # domingo → segunda anterior


def test_period_date_for_diaria_e_semanal():
    """Diária mantém o dia; semanal ancora na segunda."""
    assert A.period_date_for(date(2026, 7, 1), "daily") == date(2026, 7, 1)
    assert A.period_date_for(date(2026, 7, 1), "weekly") == date(2026, 6, 29)


# ──────────────────────────────────────────────────────────────────────────────
# count_periods — contagem de períodos decorridos
# ──────────────────────────────────────────────────────────────────────────────
def test_count_periods_diario_inclusivo():
    """Diária conta os dias no intervalo fechado [start, end]."""
    assert A.count_periods(date(2026, 6, 1), date(2026, 6, 4), "daily") == 4


def test_count_periods_semanal_conta_semanas():
    """Semanal conta as semanas de calendário tocadas (pelas segundas)."""
    # 01/06 (seg) a 14/06 (dom) = duas semanas de calendário.
    assert A.count_periods(date(2026, 6, 1), date(2026, 6, 14), "weekly") == 2


def test_count_periods_antes_do_inicio_e_zero():
    """Se o fim efetivo é anterior ao início (não começou), decorreram 0 períodos."""
    assert A.count_periods(date(2026, 6, 10), date(2026, 6, 5), "daily") == 0


# ──────────────────────────────────────────────────────────────────────────────
# adherence_pct — razão simples, capada, sem divisão por zero
# ──────────────────────────────────────────────────────────────────────────────
def test_adherence_tres_de_quatro_da_75():
    """3 de 4 períodos cumpridos ⇒ 75%."""
    assert A.adherence_pct(3, 4) == 75


def test_adherence_seis_de_sete_da_86():
    """SC — uma falha isolada NÃO zera: 6 de 7 ⇒ 86% (> 0)."""
    assert A.adherence_pct(6, 7) == 86


def test_adherence_capa_em_cem():
    """Mais cumpridos que esperados (backfill agressivo) satura em 100."""
    assert A.adherence_pct(5, 3) == 100


def test_adherence_sem_periodo_decorrido_e_zero():
    """Sem período decorrido (0 esperados) a aderência é 0 — não estoura a divisão."""
    assert A.adherence_pct(0, 0) == 0
    assert A.adherence_pct(4, 0) == 100  # já cumpriu antes de qualquer esperado (backfill) → capa 100


# ──────────────────────────────────────────────────────────────────────────────
# summary — o resumo derivado ponta a ponta
# ──────────────────────────────────────────────────────────────────────────────
def test_summary_tres_de_quatro():
    """Experimento diário, 4 dias decorridos, 3 cumpridos ⇒ 75%."""
    start = HOJE - timedelta(days=3)   # 4 dias inclusive: start..HOJE
    logs = _logs([
        (start, True),
        (start + timedelta(days=1), True),
        (start + timedelta(days=2), False),
        (start + timedelta(days=3), True),
    ])
    s = A.summary(start_date=start, end_date=HOJE + timedelta(days=10),
                  cadence="daily", logs=logs, today=HOJE)
    assert s["periods_expected"] == 4
    assert s["periods_done"] == 3
    assert s["adherence_pct"] == 75


def test_summary_falha_isolada_nao_zera():
    """6 de 7 dias ⇒ 86% (> 0): a falha de um dia não zera a aderência."""
    start = HOJE - timedelta(days=6)   # 7 dias inclusive
    logs = _logs([(start + timedelta(days=i), i != 3) for i in range(7)])  # falha só no 4º dia
    s = A.summary(start_date=start, end_date=HOJE + timedelta(days=10),
                  cadence="daily", logs=logs, today=HOJE)
    assert s["periods_expected"] == 7
    assert s["periods_done"] == 6
    assert s["adherence_pct"] == 86


def test_summary_semanal_um_por_semana():
    """Cadência semanal: 1 check-in/semana conta 1 período (ancorado na segunda)."""
    start = HOJE - timedelta(days=7)   # semana passada e esta = 2 semanas
    logs = _logs([
        (A.monday_of(start), True),    # semana passada, cumprida
        (A.monday_of(HOJE), True),     # esta semana, cumprida
    ])
    s = A.summary(start_date=start, end_date=HOJE + timedelta(days=14),
                  cadence="weekly", logs=logs, today=HOJE)
    assert s["periods_expected"] == 2
    assert s["periods_done"] == 2
    assert s["adherence_pct"] == 100
    assert s["logged_current"] is True   # esta semana já tem check-in


def test_summary_periodos_pausados_saem_do_esperado():
    """Períodos pausados (D4/FR-017) não entram em periods_expected."""
    start = HOJE - timedelta(days=9)   # 10 dias decorridos
    logs = _logs([(start + timedelta(days=i), True) for i in range(6)])  # 6 cumpridos
    # Ficou 4 dias pausado (acumulados) → esperados = 10 - 4 = 6 → 6/6 = 100%.
    s = A.summary(start_date=start, end_date=HOJE + timedelta(days=5),
                  cadence="daily", paused_period_days=4, logs=logs, today=HOJE)
    assert s["periods_expected"] == 6
    assert s["adherence_pct"] == 100


def test_summary_pausa_aberta_descontada_on_the_fly():
    """Pausado agora: o intervalo [paused_at, hoje] também é descontado."""
    start = HOJE - timedelta(days=9)   # 10 dias decorridos
    paused_at = HOJE - timedelta(days=3)  # pausado há 3 dias
    logs = _logs([(start + timedelta(days=i), True) for i in range(7)])
    s = A.summary(start_date=start, end_date=HOJE + timedelta(days=5),
                  cadence="daily", status="paused", paused_at=paused_at,
                  logs=logs, today=HOJE)
    # 10 decorridos - 3 pausados on-the-fly = 7 esperados.
    assert s["periods_expected"] == 7


def test_summary_expected_capado_em_min_hoje_end():
    """periods_expected nunca passa do total entre start e min(hoje, end)."""
    start = HOJE - timedelta(days=2)   # só 3 dias decorridos até hoje
    end = HOJE + timedelta(days=30)    # fim bem no futuro
    s = A.summary(start_date=start, end_date=end, cadence="daily", logs=[], today=HOJE)
    assert s["periods_expected"] == 3   # capado em hoje, não no fim distante


def test_summary_days_remaining_e_overdue():
    """days_remaining e is_overdue refletem o prazo (FR-016)."""
    # Ainda dentro do prazo.
    s = A.summary(start_date=HOJE - timedelta(days=2), end_date=HOJE + timedelta(days=5),
                  cadence="daily", logs=[], today=HOJE)
    assert s["days_remaining"] == 5
    assert s["is_overdue"] is False
    # Passou do fim e ainda ativo → atrasado.
    s2 = A.summary(start_date=HOJE - timedelta(days=10), end_date=HOJE - timedelta(days=2),
                   cadence="daily", status="active", logs=[], today=HOJE)
    assert s2["days_remaining"] == -2
    assert s2["is_overdue"] is True


def test_summary_logged_current_diario():
    """logged_current fica True quando há check-in para hoje (cadência diária)."""
    start = HOJE - timedelta(days=2)
    sem_hoje = A.summary(start_date=start, end_date=HOJE + timedelta(days=5), cadence="daily",
                         logs=_logs([(start, True)]), today=HOJE)
    assert sem_hoje["logged_current"] is False
    com_hoje = A.summary(start_date=start, end_date=HOJE + timedelta(days=5), cadence="daily",
                         logs=_logs([(HOJE, False)]), today=HOJE)
    assert com_hoje["logged_current"] is True   # existe check-in de hoje (mesmo que done=False)
