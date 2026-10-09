"""Spec 075 — cadência de revisão das listas (pura, banco simulado)."""

from datetime import datetime, timezone

from agents.kaguya import tools_projects as P


def _row(pid, name, interval, days_since, reviewed=True):
    last = datetime(2026, 6, 1, tzinfo=timezone.utc) if reviewed else None
    return {"id": pid, "name": name, "context": "work", "review_interval_days": interval,
            "last_reviewed_at": last, "days_since": days_since}


def test_precisa_revisar_ordena_pelas_mais_atrasadas(monkeypatch):
    monkeypatch.setattr(P, "run_select", lambda *a, **k: [
        _row(1, "Em dia", 14, 3),                 # revisada há 3 dias, cadência 14 → fora
        _row(2, "Vence hoje", 7, 7),              # exatamente no prazo → entra, 0 dias de atraso
        _row(3, "Atrasada", 7, 20),               # 13 dias de atraso
        _row(4, "Nunca revisada", 30, 30, reviewed=False),
    ])
    due = P.list_projects_due_review()
    assert [d["name"] for d in due] == ["Atrasada", "Nunca revisada", "Vence hoje"]
    assert due[0]["days_overdue"] == 13 and due[1]["last_reviewed_at"] is None


def test_update_project_valida_cadencia(monkeypatch):
    monkeypatch.setattr(P, "run_dml", lambda *a, **k: 1)
    assert P.update_project(1, review_interval_days=0)["status"] == "error"
    assert P.update_project(1, review_interval_days=14)["status"] == "ok"
    assert P.update_project(1, review_interval_days=None)["status"] == "ok"   # None = sem cadência
    assert P.update_project(1, sequential=True)["status"] == "ok"
    assert P.update_project(1)["status"] == "error"                           # nada informado
