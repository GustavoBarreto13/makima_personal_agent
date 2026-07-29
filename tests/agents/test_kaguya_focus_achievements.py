"""Testes do motor puro de conquistas de foco (spec 062).

Puro (sem banco). Cada eixo do catálogo é testado no limiar exato (desbloqueia) e um
abaixo (continua bloqueado) — o mesmo estilo de gate dos outros motores puros da
Kaguya. Como nenhuma conquista é persistida, o teste central é: dado o MESMO
histórico, `evaluate` sempre devolve o mesmo resultado (determinístico).

Como rodar:
    pytest tests/agents/test_kaguya_focus_achievements.py -v
"""

from datetime import date

from agents.kaguya import focus_achievements as FA

HOJE = date(2026, 7, 29)


def _session(day: str, minutes: int, outcome: str = "completed", hour: int = 10, **extra) -> dict:
    base = {
        "date_local": day,
        "hour_local": hour,
        "duration_focused_min": minutes,
        "outcome": outcome,
        "project_id": None,
        "project_title": None,
    }
    base.update(extra)
    return base


def _badge(badges: list[dict], id_: str) -> dict:
    return next(b for b in badges if b["id"] == id_)


# ──────────────────────────────────────────────────────────────────────────────
# Sessões — marco de contagem
# ──────────────────────────────────────────────────────────────────────────────
def test_sessions_1_desbloqueia_na_primeira_concluida():
    badges = FA.evaluate([_session("2026-07-29", 25)], HOJE)
    assert _badge(badges, "sessions_1")["unlocked"] is True
    assert _badge(badges, "sessions_10")["unlocked"] is False


def test_sessions_10_bloqueada_com_9():
    sessions = [_session(f"2026-07-{i:02d}", 25) for i in range(1, 10)]
    badges = FA.evaluate(sessions, HOJE)
    b = _badge(badges, "sessions_10")
    assert b["unlocked"] is False
    assert b["progress"] == 9


def test_sessions_10_desbloqueia_na_decima():
    sessions = [_session(f"2026-07-{i:02d}", 25) for i in range(1, 11)]
    badges = FA.evaluate(sessions, HOJE)
    b = _badge(badges, "sessions_10")
    assert b["unlocked"] is True
    assert b["unlocked_at"] == "2026-07-10"


# ──────────────────────────────────────────────────────────────────────────────
# Horas totais
# ──────────────────────────────────────────────────────────────────────────────
def test_hours_10_desbloqueia_exatamente_no_limiar():
    # 24 sessões de 25min = 600min = 10h.
    sessions = [_session(f"2026-08-{i:02d}" if i <= 24 else "2026-09-01", 25) for i in range(1, 25)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "hours_10")["unlocked"] is True


def test_hours_10_bloqueada_abaixo_do_limiar():
    sessions = [_session("2026-07-29", 599)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "hours_10")["unlocked"] is False


# ──────────────────────────────────────────────────────────────────────────────
# Streak — usa o RECORDE histórico, não o streak atual
# ──────────────────────────────────────────────────────────────────────────────
def test_streak_3_desbloqueia_com_tres_dias_seguidos_no_passado():
    sessions = [
        _session("2026-06-01", 25),
        _session("2026-06-02", 25),
        _session("2026-06-03", 25),
    ]
    badges = FA.evaluate(sessions, HOJE)
    b = _badge(badges, "streak_3")
    assert b["unlocked"] is True
    assert b["unlocked_at"] == "2026-06-03"


def test_streak_3_bloqueada_com_dois_dias_seguidos():
    sessions = [_session("2026-06-01", 25), _session("2026-06-02", 25)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "streak_3")["unlocked"] is False


# ──────────────────────────────────────────────────────────────────────────────
# Sessão longa
# ──────────────────────────────────────────────────────────────────────────────
def test_long_session_60_desbloqueia_com_sessao_de_60():
    badges = FA.evaluate([_session("2026-07-29", 60)], HOJE)
    assert _badge(badges, "long_session_60")["unlocked"] is True


def test_long_session_60_bloqueada_com_59():
    badges = FA.evaluate([_session("2026-07-29", 59)], HOJE)
    assert _badge(badges, "long_session_60")["unlocked"] is False


# ──────────────────────────────────────────────────────────────────────────────
# Dia intenso
# ──────────────────────────────────────────────────────────────────────────────
def test_intense_day_sessions_desbloqueia_com_4_no_mesmo_dia():
    sessions = [_session("2026-07-29", 10) for _ in range(4)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "intense_day_sessions")["unlocked"] is True


def test_intense_day_sessions_bloqueada_com_3():
    sessions = [_session("2026-07-29", 10) for _ in range(3)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "intense_day_sessions")["unlocked"] is False


def test_intense_day_minutes_desbloqueia_com_4h_no_mesmo_dia():
    sessions = [_session("2026-07-29", 240)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "intense_day_minutes")["unlocked"] is True


# ──────────────────────────────────────────────────────────────────────────────
# Horário
# ──────────────────────────────────────────────────────────────────────────────
def test_early_bird_desbloqueia_antes_das_6h():
    badges = FA.evaluate([_session("2026-07-29", 25, hour=5)], HOJE)
    assert _badge(badges, "early_bird")["unlocked"] is True


def test_early_bird_bloqueada_as_6h():
    badges = FA.evaluate([_session("2026-07-29", 25, hour=6)], HOJE)
    assert _badge(badges, "early_bird")["unlocked"] is False


def test_night_owl_desbloqueia_as_23h():
    badges = FA.evaluate([_session("2026-07-29", 25, hour=23)], HOJE)
    assert _badge(badges, "night_owl")["unlocked"] is True


# ──────────────────────────────────────────────────────────────────────────────
# Resiliência — concluir e falhar no MESMO dia
# ──────────────────────────────────────────────────────────────────────────────
def test_resilience_desbloqueia_quando_completa_e_falha_no_mesmo_dia():
    sessions = [
        _session("2026-07-29", 5, "cancelled"),
        _session("2026-07-29", 25, "completed"),
    ]
    badges = FA.evaluate(sessions, HOJE)
    b = _badge(badges, "resilience")
    assert b["unlocked"] is True
    assert b["unlocked_at"] == "2026-07-29"


def test_resilience_bloqueada_se_falha_e_sucesso_em_dias_diferentes():
    sessions = [
        _session("2026-07-28", 5, "cancelled"),
        _session("2026-07-29", 25, "completed"),
    ]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "resilience")["unlocked"] is False


# ──────────────────────────────────────────────────────────────────────────────
# Fidelidade — 10h numa mesma lista
# ──────────────────────────────────────────────────────────────────────────────
def test_fidelity_desbloqueia_com_10h_na_mesma_lista():
    sessions = [
        _session(f"2026-07-{i:02d}", 60, project_id=1, project_title="Trabalho")
        for i in range(1, 11)
    ]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "fidelity")["unlocked"] is True


def test_fidelity_nao_soma_listas_diferentes():
    sessions = [
        _session("2026-07-01", 300, project_id=1, project_title="Trabalho"),
        _session("2026-07-02", 300, project_id=2, project_title="Pessoal"),
    ]
    badges = FA.evaluate(sessions, HOJE)
    # 300+300=600 no total, mas listas diferentes — nenhuma sozinha bate 600.
    assert _badge(badges, "fidelity")["unlocked"] is False


def test_fidelity_ignora_sessoes_sem_lista():
    sessions = [_session("2026-07-01", 600, project_id=None)]
    badges = FA.evaluate(sessions, HOJE)
    assert _badge(badges, "fidelity")["unlocked"] is False


# ──────────────────────────────────────────────────────────────────────────────
# Determinismo geral
# ──────────────────────────────────────────────────────────────────────────────
def test_evaluate_e_deterministico():
    sessions = [_session("2026-07-29", 25), _session("2026-07-28", 30, "cancelled")]
    assert FA.evaluate(sessions, HOJE) == FA.evaluate(sessions, HOJE)


def test_evaluate_lista_vazia_nao_quebra():
    badges = FA.evaluate([], HOJE)
    assert all(b["unlocked"] is False for b in badges)
