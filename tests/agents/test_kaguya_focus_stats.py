"""Testes do motor puro de estatísticas de foco (spec 037 + spec 062).

São testes **puros** (sem banco), rápidos e determinísticos — o equivalente, para
foco, do gate puro de `test_kaguya_habit_strength.py`. Cobrem os casos que a spec 062
foi desenhada para responder: streak com buraco no meio, streak que não quebra antes
de o usuário focar hoje, taxa de conclusão e "quanto tempo eu aguento antes de largar".

Como rodar:
    pytest tests/agents/test_kaguya_focus_stats.py -v
"""

from datetime import date

from agents.kaguya import focus_stats as FS


def _session(day: str, minutes: int, outcome: str = "completed", hour: int = 10, **extra) -> dict:
    """Monta um dict de sessão mínimo válido para os motores puros."""
    base = {
        "date_local": day,
        "hour_local": hour,
        "duration_focused_min": minutes,
        "outcome": outcome,
    }
    base.update(extra)
    return base


# ──────────────────────────────────────────────────────────────────────────────
# aggregate_by_day
# ──────────────────────────────────────────────────────────────────────────────
def test_aggregate_by_day_soma_so_produtivas():
    sessions = [
        _session("2026-07-27", 25, "completed"),
        _session("2026-07-27", 10, "completed"),
        _session("2026-07-27", 99, "cancelled"),  # não deve entrar na soma
        _session("2026-07-26", 50, "completed"),
    ]
    result = FS.aggregate_by_day(sessions)
    assert result == {
        "2026-07-27": {"total_min": 35, "sessoes": 2},
        "2026-07-26": {"total_min": 50, "sessoes": 1},
    }


def test_aggregate_by_day_sessao_ativa_conta_parcial():
    # outcome=None é a sessão ainda ativa — conta parcial, mesmo padrão da spec 037.
    sessions = [_session("2026-07-29", 12, outcome=None)]
    result = FS.aggregate_by_day(sessions)
    assert result == {"2026-07-29": {"total_min": 12, "sessoes": 1}}


# ──────────────────────────────────────────────────────────────────────────────
# aggregate_by_hour
# ──────────────────────────────────────────────────────────────────────────────
def test_aggregate_by_hour_separa_concluidas_de_falhas():
    sessions = [
        _session("2026-07-27", 25, "completed", hour=9),
        _session("2026-07-27", 5, "abandoned", hour=22),
        _session("2026-07-28", 10, "cancelled", hour=22),
    ]
    result = FS.aggregate_by_hour(sessions)
    assert result[9] == {"completed_min": 25, "completed_n": 1, "failed_n": 0}
    assert result[22] == {"completed_min": 0, "completed_n": 0, "failed_n": 2}


# ──────────────────────────────────────────────────────────────────────────────
# outcome_stats
# ──────────────────────────────────────────────────────────────────────────────
def test_outcome_stats_ignora_sessao_ativa():
    sessions = [
        _session("2026-07-27", 25, "completed"),
        _session("2026-07-27", 5, outcome=None),  # ativa — sem desfecho, não conta
    ]
    stats = FS.outcome_stats(sessions)
    assert stats["completed"] == 1
    assert stats["cancelled"] == 0
    assert stats["abandoned"] == 0
    assert stats["completion_pct"] == 100


def test_outcome_stats_avg_min_before_quit_so_conta_falhas():
    sessions = [
        _session("2026-07-27", 25, "completed"),
        _session("2026-07-27", 5, "cancelled"),
        _session("2026-07-27", 15, "abandoned"),
    ]
    stats = FS.outcome_stats(sessions)
    assert stats["avg_min_before_quit"] == 10.0  # (5+15)/2, ignora a concluída de 25
    assert stats["completion_pct"] == 33  # 1 de 3 encerradas


def test_outcome_stats_sem_falhas_devolve_none():
    sessions = [_session("2026-07-27", 25, "completed")]
    stats = FS.outcome_stats(sessions)
    assert stats["avg_min_before_quit"] is None


# ──────────────────────────────────────────────────────────────────────────────
# current_streak — o caso mais delicado: não pode quebrar antes de focar hoje
# ──────────────────────────────────────────────────────────────────────────────
def test_current_streak_com_buraco_no_meio_conta_so_o_trecho_recente():
    today = date(2026, 7, 29)
    day_totals = {
        "2026-07-29": {"total_min": 25, "sessoes": 1},
        "2026-07-28": {"total_min": 25, "sessoes": 1},
        "2026-07-26": {"total_min": 25, "sessoes": 1},  # buraco em 27 — quebra a corrente
    }
    assert FS.current_streak(day_totals, today) == 2


def test_current_streak_hoje_vazio_nao_zera_ainda():
    # Usuário ainda não focou hoje, mas focou ontem — streak continua valendo até
    # o dia virar sem sessão nenhuma (regra explícita da spec 062).
    today = date(2026, 7, 29)
    day_totals = {"2026-07-28": {"total_min": 25, "sessoes": 1}}
    assert FS.current_streak(day_totals, today) == 1


def test_current_streak_vazio_e_zero():
    assert FS.current_streak({}, date(2026, 7, 29)) == 0


def test_current_streak_nem_ontem_nem_hoje_e_zero():
    today = date(2026, 7, 29)
    day_totals = {"2026-07-20": {"total_min": 25, "sessoes": 1}}
    assert FS.current_streak(day_totals, today) == 0


# ──────────────────────────────────────────────────────────────────────────────
# longest_streak
# ──────────────────────────────────────────────────────────────────────────────
def test_longest_streak_pega_o_maior_trecho_nao_o_ultimo():
    day_totals = {
        "2026-07-01": {"total_min": 25, "sessoes": 1},
        "2026-07-02": {"total_min": 25, "sessoes": 1},
        "2026-07-03": {"total_min": 25, "sessoes": 1},
        "2026-07-10": {"total_min": 25, "sessoes": 1},
        "2026-07-11": {"total_min": 25, "sessoes": 1},
    }
    assert FS.longest_streak(day_totals) == 3


def test_longest_streak_vazio_e_zero():
    assert FS.longest_streak({}) == 0


# ──────────────────────────────────────────────────────────────────────────────
# top_by
# ──────────────────────────────────────────────────────────────────────────────
def test_top_by_ordena_desc_e_ignora_falhas():
    sessions = [
        _session("2026-07-27", 25, "completed", task_id=1, task_title="Escrever"),
        _session("2026-07-27", 10, "completed", task_id=1, task_title="Escrever"),
        _session("2026-07-27", 99, "cancelled", task_id=1, task_title="Escrever"),
        _session("2026-07-27", 50, "completed", task_id=2, task_title="Revisar"),
    ]
    result = FS.top_by(sessions, "task_id")
    assert result == [
        {"task_id": 2, "label": "Revisar", "total_min": 50, "sessoes": 1},
        {"task_id": 1, "label": "Escrever", "total_min": 35, "sessoes": 2},
    ]


def test_top_by_ignora_valor_none():
    sessions = [
        _session("2026-07-27", 25, "completed", task_id=None, task_title=None),
        _session("2026-07-27", 10, "completed", task_id=1, task_title="Escrever"),
    ]
    result = FS.top_by(sessions, "task_id")
    assert len(result) == 1
    assert result[0]["task_id"] == 1
