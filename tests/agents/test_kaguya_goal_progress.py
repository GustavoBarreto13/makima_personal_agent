"""Testes do motor puro de progresso de meta — Metas (spec 030).

São testes **puros** (sem banco), rápidos e determinísticos — o equivalente, para metas, do
gate puro de aderência em ``test_kaguya_experiment_adherence.py``. Rodam SEMPRE (não dependem de
``DATABASE_URL``) e travam a regra de combinação de progresso (métrica + marcos) e a saturação
do valor acima do alvo.

Como rodar:
    pytest tests/agents/test_kaguya_goal_progress.py -v
"""

from datetime import date

from agents.kaguya import goal_progress as G

HOJE = date(2026, 7, 1)


# ──────────────────────────────────────────────────────────────────────────────
# metric_pct — dimensão métrica (satura em 100, None quando não há métrica)
# ──────────────────────────────────────────────────────────────────────────────
def test_metric_pct_tres_de_doze():
    """3 de 12 ⇒ 25%."""
    assert G.metric_pct(12, 3) == 25


def test_metric_pct_satura_acima_do_alvo():
    """Valor acima do alvo (15 de 12) satura em 100 sem erro."""
    assert G.metric_pct(12, 15) == 100


def test_metric_pct_sem_metrica_e_none():
    """Sem métrica-alvo (None ou 0) → None (não é dimensão presente)."""
    assert G.metric_pct(None, 5) is None
    assert G.metric_pct(0, 5) is None


def test_metric_pct_atual_zero():
    """Valor atual zero → 0%."""
    assert G.metric_pct(12, 0) == 0


# ──────────────────────────────────────────────────────────────────────────────
# milestones_pct — dimensão marcos (None quando não há marcos)
# ──────────────────────────────────────────────────────────────────────────────
def test_milestones_pct_um_de_tres():
    """1 de 3 marcos ⇒ 33%."""
    assert G.milestones_pct(1, 3) == 33


def test_milestones_pct_sem_marcos_e_none():
    """Sem marcos (total 0) → None."""
    assert G.milestones_pct(0, 0) is None


def test_milestones_pct_todos_concluidos():
    """Todos concluídos ⇒ 100%."""
    assert G.milestones_pct(3, 3) == 100


# ──────────────────────────────────────────────────────────────────────────────
# progress — combinação das dimensões presentes (D2)
# ──────────────────────────────────────────────────────────────────────────────
def test_progress_so_metrica():
    """Só métrica: progress_pct = metric_pct."""
    r = G.progress(metric_target=12, metric_current=3, milestones_done=0, milestones_total=0)
    assert r["metric_pct"] == 25
    assert r["milestones_pct"] is None
    assert r["progress_pct"] == 25


def test_progress_so_marcos():
    """Só marcos: progress_pct = milestones_pct."""
    r = G.progress(metric_target=None, metric_current=0, milestones_done=1, milestones_total=3)
    assert r["metric_pct"] is None
    assert r["milestones_pct"] == 33
    assert r["progress_pct"] == 33


def test_progress_metrica_e_marcos_e_media():
    """Métrica + marcos: progress_pct é a média das duas dimensões (25 e 33 ⇒ 29)."""
    r = G.progress(metric_target=12, metric_current=3, milestones_done=1, milestones_total=3)
    assert r["metric_pct"] == 25
    assert r["milestones_pct"] == 33
    assert r["progress_pct"] == 29   # round((25 + 33) / 2)


def test_progress_sem_metrica_e_sem_marcos_e_none():
    """Sem métrica e sem marcos: progress_pct is None (meta direcional)."""
    r = G.progress(metric_target=None, metric_current=0, milestones_done=0, milestones_total=0)
    assert r["progress_pct"] is None


def test_progress_acima_do_alvo_no_combinado():
    """Valor acima do alvo entra como 100 na média (100 e 50 ⇒ 75)."""
    r = G.progress(metric_target=12, metric_current=15, milestones_done=1, milestones_total=2)
    assert r["metric_pct"] == 100
    assert r["milestones_pct"] == 50
    assert r["progress_pct"] == 75


# ──────────────────────────────────────────────────────────────────────────────
# deadline_status — prazo/atraso (UTC-3 resolvido pelo chamador)
# ──────────────────────────────────────────────────────────────────────────────
def test_deadline_status_dentro_do_prazo():
    """Prazo no futuro e meta ativa → não atrasada."""
    r = G.deadline_status(date(2026, 7, 10), "active", HOJE)
    assert r["days_remaining"] == 9
    assert r["is_overdue"] is False


def test_deadline_status_atrasada():
    """Prazo passado e meta ativa → atrasada, days_remaining negativo."""
    r = G.deadline_status(date(2026, 6, 28), "active", HOJE)
    assert r["days_remaining"] == -3
    assert r["is_overdue"] is True


def test_deadline_status_encerrada_nunca_atrasada():
    """Meta encerrada nunca é sinalizada como atrasada, mesmo com prazo vencido."""
    r = G.deadline_status(date(2026, 6, 28), "closed", HOJE)
    assert r["is_overdue"] is False
