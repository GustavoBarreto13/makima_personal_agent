"""Testes do router de tarefas (webapp/backend/routers/tasks.py).

Usa o TestClient do FastAPI e **mocka** as funções da camada de lógica
(``agents.kaguya.tools_*``) — não toca no banco. O foco é o contrato HTTP:
roteamento, parsing de body Pydantic, mapeamento status→HTTP e o caso especial
do ``needs_cascade`` (que NÃO pode virar 400).

Execute com:
    pytest tests/test_tasks_router.py -v
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from webapp.backend.main import app
from webapp.backend.deps import require_user


# Autenticação: substitui require_user por um usuário fixo (sem cookie real).
def _mock_user():
    """Retorna um usuário de teste (evita exigir cookie assinado)."""
    return {"email": "test@example.com", "name": "Test User"}


app.dependency_overrides[require_user] = _mock_user
client = TestClient(app, raise_server_exceptions=True)

# Prefixo do router de tarefas (registrado em main.py).
_BASE = "/api/tasks"


# ─────────────────────────────────────────────────────────────────────────────
# Listagens (não passam por _check_result — retornam dado direto)
# ─────────────────────────────────────────────────────────────────────────────
@patch("webapp.backend.routers.tasks.get_sidebar")
def test_get_sidebar(mock_sidebar):
    """GET /sidebar retorna o payload da sidebar (listagem, sem 'status')."""
    mock_sidebar.return_value = {"groups": [], "projects": [{"id": 1, "name": "Inbox", "is_inbox": True}]}
    resp = client.get(f"{_BASE}/sidebar")
    assert resp.status_code == 200
    assert resp.json()["projects"][0]["name"] == "Inbox"


@patch("webapp.backend.routers.tasks.list_tasks")
def test_list_tasks(mock_list):
    """GET / lista as tarefas de uma lista."""
    mock_list.return_value = [{"id": 10, "title": "t", "subtasks": []}]
    resp = client.get(f"{_BASE}?project_id=1")
    assert resp.status_code == 200
    assert resp.json()[0]["id"] == 10
    mock_list.assert_called_once_with(1, False)


@patch("webapp.backend.routers.tasks.list_tasks_today")
def test_today(mock_today):
    """GET /today retorna {overdue, today}."""
    mock_today.return_value = {"overdue": [], "today": []}
    resp = client.get(f"{_BASE}/today")
    assert resp.status_code == 200
    assert "overdue" in resp.json() and "today" in resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# Mutações felizes (status ok → 200/201)
# ─────────────────────────────────────────────────────────────────────────────
@patch("webapp.backend.routers.tasks.create_task")
def test_create_task_ok(mock_create):
    """POST / cria tarefa e devolve 201."""
    mock_create.return_value = {"status": "ok", "id": 42, "project_id": 1}
    resp = client.post(_BASE, json={"title": "nova", "priority": 2})
    assert resp.status_code == 201
    assert resp.json()["id"] == 42
    # exclude_unset garante que só os campos enviados chegam à tool
    mock_create.assert_called_once_with(title="nova", priority=2)


@patch("webapp.backend.routers.tasks.create_project")
def test_create_project_ok(mock_create):
    """POST /projects cria lista e devolve 201."""
    mock_create.return_value = {"status": "ok", "id": 5}
    resp = client.post(f"{_BASE}/projects", json={"name": "Casa"})
    assert resp.status_code == 201
    assert resp.json()["id"] == 5


@patch("webapp.backend.routers.tasks.update_task")
def test_update_task_ok(mock_update):
    """PATCH /{id} edita e devolve 200."""
    mock_update.return_value = {"status": "ok"}
    resp = client.patch(f"{_BASE}/42", json={"priority": 3})
    assert resp.status_code == 200
    mock_update.assert_called_once_with(42, priority=3)


# ─────────────────────────────────────────────────────────────────────────────
# Caso especial: needs_cascade NÃO vira 400
# ─────────────────────────────────────────────────────────────────────────────
@patch("webapp.backend.routers.tasks.complete_task")
def test_complete_needs_cascade_is_200(mock_complete):
    """POST /{id}/complete com subtarefas abertas → 200 + needs_cascade (não 400)."""
    mock_complete.return_value = {"status": "error", "needs_cascade": True, "open_subtasks": 2, "message": "..."}
    resp = client.post(f"{_BASE}/42/complete", json={})
    assert resp.status_code == 200
    assert resp.json()["needs_cascade"] is True


@patch("webapp.backend.routers.tasks.complete_task")
def test_complete_ok(mock_complete):
    """POST /{id}/complete sem subtarefas → 200 ok."""
    mock_complete.return_value = {"status": "ok", "message": "Tarefa concluída."}
    resp = client.post(f"{_BASE}/42/complete", json={"cascade": True})
    assert resp.status_code == 200
    mock_complete.assert_called_once_with(42, True)


# ─────────────────────────────────────────────────────────────────────────────
# Erros de negócio → 400 com mensagem em português
# ─────────────────────────────────────────────────────────────────────────────
@patch("webapp.backend.routers.tasks.delete_project")
def test_delete_inbox_is_400(mock_delete):
    """DELETE /projects/{id} no Inbox → 400 (indelével)."""
    mock_delete.return_value = {"status": "error", "message": "O Inbox não pode ser excluído."}
    resp = client.delete(f"{_BASE}/projects/1?mode=move_to_inbox")
    assert resp.status_code == 400
    assert "Inbox" in resp.json()["detail"]


@patch("webapp.backend.routers.tasks.create_task")
def test_create_task_nonexistent_project_is_400(mock_create):
    """POST / com lista inexistente → 400."""
    mock_create.return_value = {"status": "error", "message": "Lista não encontrada."}
    resp = client.post(_BASE, json={"title": "x", "project_id": 999})
    assert resp.status_code == 400


def test_delete_project_requires_mode():
    """DELETE /projects/{id} sem ?mode= → 422 (query obrigatória do Pydantic/FastAPI)."""
    resp = client.delete(f"{_BASE}/projects/5")
    assert resp.status_code == 422


@patch("webapp.backend.routers.tasks.reorder_task")
def test_reorder_ok(mock_reorder):
    """POST /{id}/position reordena e devolve 200."""
    mock_reorder.return_value = {"status": "ok", "position": 1500}
    resp = client.post(f"{_BASE}/42/position", json={"after_id": 10, "before_id": 11})
    assert resp.status_code == 200
    mock_reorder.assert_called_once_with(42, 10, 11)


@patch("webapp.backend.routers.tasks.restore_task")
def test_restore_ok(mock_restore):
    """POST /{id}/restore restaura e devolve 200."""
    mock_restore.return_value = {"status": "ok"}
    resp = client.post(f"{_BASE}/42/restore")
    assert resp.status_code == 200
