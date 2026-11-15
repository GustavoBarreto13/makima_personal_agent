"""Testes do GET /api/hub/today (nova home "Hoje") — blocos isolados, sempre HTTP 200.

Execute com:
    pytest tests/test_hub_today.py -v
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from webapp.backend.deps import require_user
from webapp.backend.main import app

app.dependency_overrides[require_user] = lambda: {"email": "test@example.com", "name": "Test"}
client = TestClient(app, raise_server_exceptions=True)

R = "webapp.backend.routers.hub"


def test_today_sempre_200_mesmo_com_tudo_falhando():
    with patch(f"{R}._now_block", side_effect=RuntimeError("x")), \
         patch(f"{R}._attention_block", side_effect=RuntimeError("x")), \
         patch(f"{R}._numbers_block", side_effect=RuntimeError("x")):
        r = client.get("/api/hub/today")
    assert r.status_code == 200
    body = r.json()
    assert body["now"] == {"focus": None, "next": None}
    assert body["attention"] == [] and body["numbers"] == {}
    assert len(body["date"]) == 10


def test_today_devolve_blocos_quando_ok():
    atencao = [{"id": "overdue", "agent": "kaguya", "tone": "danger", "label": "2 tarefas vencidas", "action": "Ver", "href": "/tasks#hoje"}]
    with patch(f"{R}._now_block", return_value={"focus": None, "next": {"title": "Reunião", "time": "14:00", "href": "/tasks"}}), \
         patch(f"{R}._attention_block", return_value=atencao), \
         patch(f"{R}._numbers_block", return_value={"kaguya_hoje": {"v": "5", "k": "tarefas hoje", "href": "/tasks"}}):
        body = client.get("/api/hub/today").json()
    assert body["now"]["next"]["time"] == "14:00"
    assert body["attention"] == atencao
    assert body["numbers"]["kaguya_hoje"]["v"] == "5"


def test_attention_block_isola_cada_fonte():
    from webapp.backend.routers.hub import _attention_block

    with patch("agents.kaguya.tools_tasks.list_tasks_today", side_effect=RuntimeError("x")), \
         patch("agents.nami.tools_plan.get_month_plan", return_value={"status": "ok", "a_pagar": [
             {"kind": "conta", "id": 1, "name": "Luz", "valor": 184.0, "due": "2026-11-16", "status": "pendente"}]}), \
         patch("agents.komi.tools.upcoming_birthdays", side_effect=RuntimeError("x")):
        itens = _attention_block()
    assert len(itens) == 1 and itens[0]["agent"] == "nami" and itens[0]["label"].startswith("Luz · R$ 184")
    # "Pagar" enganava (só abre a Nami): o rótulo honesto é "Ver", e cada tipo tem ícone próprio.
    assert itens[0]["action"] == "Ver" and itens[0]["icon"] == "money"


def test_attention_block_icones_por_tipo():
    from webapp.backend.routers.hub import _attention_block

    with patch("agents.kaguya.tools_tasks.list_tasks_today", return_value={"overdue": [{}, {}], "today": []}), \
         patch("agents.nami.tools_plan.get_month_plan", return_value={"status": "ok", "a_pagar": []}), \
         patch("agents.komi.tools.upcoming_birthdays", return_value={"status": "ok", "birthdays": [
             {"person_id": "p1", "name": "Bia", "in_days": 1}]}):
        itens = {i["id"]: i for i in _attention_block()}
    assert itens["overdue"]["icon"] == "task" and itens["bday-p1"]["icon"] == "cake"
    assert itens["bday-p1"]["label"] == "Aniversário de Bia · amanhã"
