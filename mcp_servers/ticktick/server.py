# Servidor MCP do TickTick — expõe as tools genéricas de gestão de tarefas via MCP stdio.
# Roda como processo filho do agente Kaguya (iniciado pelo ADK via MCPToolset).
# Lê as credenciais OAuth do TickTick das variáveis de ambiente herdadas do processo pai.

import logging
import os
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests
from mcp.server.fastmcp import FastMCP

# Inicializa o servidor MCP com um nome descritivo
mcp = FastMCP("ticktick")

log = logging.getLogger(__name__)

# URL base da API Open do TickTick e endpoint de refresh OAuth
_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"

# Delay mínimo entre chamadas à API para respeitar o rate limit (200ms)
_API_DELAY = 0.2

# Prioridade numérica do TickTick → label legível
PRIORITY_LABEL: dict[int, str] = {0: "Nenhuma", 1: "Baixa", 3: "Média", 5: "Alta"}

# Label informado pelo usuário → valor numérico do TickTick
PRIORITY_VALUE: dict[str, int] = {"nenhuma": 0, "baixa": 1, "média": 3, "media": 3, "alta": 5}

# ── Cache do access token em memória ──────────────────────────────────────────
_cached_token: Optional[str] = None
_cached_expires_at: Optional[datetime] = None

# ── Cache de projetos em memória (TTL 5 min) ──────────────────────────────────
_projects_cache: list[dict] = []
_projects_cache_at: Optional[datetime] = None
_PROJECTS_CACHE_TTL = timedelta(minutes=5)


def _is_token_expired() -> bool:
    """Verifica se o access token está expirado ou prestes a expirar (margem de 5 min).
    Sem data de expiração configurada (TICKTICK_EXPIRES_AT vazio), assume válido."""
    if _cached_token is None:
        return True
    if _cached_expires_at is None:
        return False  # sem informação de expiração → assume válido
    return datetime.now(timezone.utc) >= _cached_expires_at - timedelta(minutes=5)


def _refresh_token() -> str:
    """Obtém novo access token via OAuth refresh grant e atualiza o cache."""
    global _cached_token, _cached_expires_at

    client_id = os.environ.get("TICKTICK_CLIENT_ID", "")
    client_secret = os.environ.get("TICKTICK_CLIENT_SECRET", "")
    refresh_token = os.environ.get("TICKTICK_REFRESH_TOKEN", "")

    if not client_id or not client_secret:
        raise EnvironmentError("TICKTICK_CLIENT_ID e TICKTICK_CLIENT_SECRET são obrigatórios")
    if not refresh_token:
        raise EnvironmentError("TICKTICK_REFRESH_TOKEN não configurado")

    resp = requests.post(
        _TICKTICK_OAUTH_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    _cached_token = data["access_token"]
    new_refresh = data.get("refresh_token", refresh_token)
    if new_refresh != refresh_token:
        log.warning(f"TickTick: NOVO refresh token — atualize TICKTICK_REFRESH_TOKEN no Dokploy: {new_refresh}")

    expires_in = int(data.get("expires_in", 15552000))
    _cached_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    log.info(f"TickTick: token renovado, expira em {_cached_expires_at.isoformat()}")
    # Exibe apenas os primeiros 8 chars para identificação sem expor o token completo
    log.info(f"TickTick: novo access token — atualize TICKTICK_ACCESS_TOKEN no Dokploy: {_cached_token[:8]}***")

    return _cached_token


def _get_access_token() -> str:
    """Retorna um access token válido, renovando automaticamente se expirado."""
    global _cached_token, _cached_expires_at

    if _cached_token is None:
        _cached_token = os.environ.get("TICKTICK_ACCESS_TOKEN", "")
        expires_str = os.environ.get("TICKTICK_EXPIRES_AT", "")
        if expires_str:
            try:
                _cached_expires_at = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
                if _cached_expires_at.tzinfo is None:
                    _cached_expires_at = _cached_expires_at.replace(tzinfo=timezone.utc)
            except ValueError:
                _cached_expires_at = None

    if _is_token_expired():
        if os.environ.get("TICKTICK_REFRESH_TOKEN", ""):
            return _refresh_token()
        if not _cached_token:
            raise EnvironmentError("TICKTICK_ACCESS_TOKEN não configurado")
        log.warning("TickTick: token pode estar expirado. Tentando mesmo assim.")

    return _cached_token


def _headers() -> dict:
    """Retorna headers HTTP necessários para qualquer chamada à API do TickTick."""
    return {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
    }


def _api_get(path: str, params: dict = None) -> Optional[dict | list]:
    """Requisição GET à API do TickTick. Retorna JSON ou None em caso de 404."""
    try:
        resp = requests.get(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        time.sleep(_API_DELAY)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick GET {path} falhou: {e}")
        raise


def _api_post(path: str, body: dict = None) -> Optional[dict]:
    """Requisição POST à API do TickTick. Retorna JSON ou None em caso de 404."""
    try:
        resp = requests.post(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
            json=body or {},
            timeout=30,
        )
        time.sleep(_API_DELAY)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick POST {path} falhou: {e}")
        raise


def _api_delete(path: str) -> bool:
    """Requisição DELETE à API do TickTick. Retorna True se bem-sucedido."""
    try:
        resp = requests.delete(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
            timeout=30,
        )
        time.sleep(_API_DELAY)
        return resp.status_code in (200, 204)
    except Exception as e:
        log.error(f"TickTick DELETE {path} falhou: {e}")
        raise


def _get_projects() -> list[dict]:
    """Retorna projetos ativos do TickTick com cache de 5 minutos."""
    global _projects_cache, _projects_cache_at
    now = datetime.now(timezone.utc)
    cache_expired = (
        not _projects_cache
        or _projects_cache_at is None
        or (now - _projects_cache_at) > _PROJECTS_CACHE_TTL
    )
    if cache_expired:
        raw = _api_get("/project")
        _projects_cache = [p for p in (raw or []) if not p.get("closed")] if isinstance(raw, list) else []
        _projects_cache_at = now
    return _projects_cache


def _resolve_project(name: str) -> Optional[dict]:
    """Resolve nome de projeto (case-insensitive, prefixo) para objeto {id, name}."""
    norm = name.strip().lower()
    projects = _get_projects()
    for p in projects:
        if p.get("name", "").lower() == norm:
            return p
    matches = [p for p in projects if p.get("name", "").lower().startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _format_task(task: dict, project_name: str = "") -> dict:
    """Converte task dict bruto da API para formato limpo e legível."""
    project_id = task.get("projectId", "")
    if not project_name and _projects_cache:
        for p in _projects_cache:
            if p.get("id") == project_id:
                project_name = p.get("name", project_id)
                break
    return {
        "id": task.get("id", ""),
        "project_id": project_id,
        "project": project_name or project_id,
        "title": task.get("title", ""),
        "status": "concluída" if task.get("status") == 2 else "ativa",
        "priority": PRIORITY_LABEL.get(task.get("priority", 0), "Nenhuma"),
        "due_date": task.get("dueDate", ""),
        "description": task.get("content", ""),
        "tags": task.get("tags", []),
        "items": [
            {
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "status": "concluído" if item.get("status") == 2 else "pendente",
            }
            for item in task.get("items", [])
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS MCP — LEITURA
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def list_projects() -> dict:
    """Lista todos os projetos ativos disponíveis no TickTick."""
    try:
        projects = _get_projects()
        return {
            "status": "ok",
            "projects": [{"id": p.get("id"), "name": p.get("name")} for p in projects],
            "count": len(projects),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def list_tasks_today() -> dict:
    """Lista tarefas de hoje E tarefas atrasadas. Inclui atrasadas no campo 'overdue'."""
    try:
        today_str = date.today().strftime("%Y-%m-%d")
        tasks_today = []
        overdue = []

        for project in _get_projects():
            project_id = project.get("id", "")
            project_name = project.get("name", "")
            data = _api_get(f"/project/{project_id}/data")
            if not data or not isinstance(data.get("tasks"), list):
                continue

            all_tasks = data["tasks"]
            main_tasks = [t for t in all_tasks if not t.get("parentId")]
            child_tasks = [t for t in all_tasks if t.get("parentId")]

            subtasks_by_parent: dict[str, list] = {}
            for st in child_tasks:
                subtasks_by_parent.setdefault(st["parentId"], []).append(st)

            for task in main_tasks:
                if task.get("status", 0) == 2:
                    continue

                due = task.get("dueDate", "")
                task_due_today = bool(due and due.startswith(today_str))
                task_overdue = bool(due and due[:10] < today_str)

                children_today = [
                    _format_task(st, project_name)
                    for st in subtasks_by_parent.get(task.get("id", ""), [])
                    if st.get("dueDate", "").startswith(today_str) and st.get("status", 0) != 2
                ]

                if task_due_today or children_today:
                    formatted = _format_task(task, project_name)
                    formatted["subtasks_today"] = children_today
                    tasks_today.append(formatted)
                elif task_overdue:
                    formatted = _format_task(task, project_name)
                    formatted["subtasks_today"] = []
                    overdue.append(formatted)

        overdue.sort(key=lambda t: t.get("due_date", ""))
        return {
            "status": "ok",
            "tasks": tasks_today,
            "overdue": overdue,
            "count": len(tasks_today),
            "overdue_count": len(overdue),
            "date": today_str,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def list_overdue_tasks() -> dict:
    """Lista todas as tarefas ativas com data de vencimento no passado."""
    try:
        today_str = date.today().strftime("%Y-%m-%d")
        overdue = []
        for project in _get_projects():
            project_id = project.get("id", "")
            project_name = project.get("name", "")
            data = _api_get(f"/project/{project_id}/data")
            if not data or not isinstance(data.get("tasks"), list):
                continue
            for task in data["tasks"]:
                due = task.get("dueDate", "")
                if due and due[:10] < today_str and task.get("status", 0) != 2:
                    overdue.append(_format_task(task, project_name))
        overdue.sort(key=lambda t: t.get("due_date", ""))
        return {"status": "ok", "tasks": overdue, "count": len(overdue)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def list_tasks_by_project(project_name: str) -> dict:
    """Lista todas as tarefas ativas de um projeto específico (aceita prefixo case-insensitive)."""
    try:
        project = _resolve_project(project_name)
        if not project:
            available = [p.get("name") for p in _get_projects()]
            return {"status": "error", "message": f"Projeto '{project_name}' não encontrado. Disponíveis: {available}"}
        data = _api_get(f"/project/{project['id']}/data")
        if not data:
            return {"status": "error", "message": f"Projeto não encontrado: {project['id']}"}
        tasks = [
            _format_task(t, project["name"])
            for t in data.get("tasks", [])
            if t.get("status", 0) != 2
        ]
        return {"status": "ok", "tasks": tasks, "count": len(tasks), "project": project["name"]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def search_tasks(query: str) -> dict:
    """Busca tarefas pelo título (case-insensitive) em todos os projetos."""
    try:
        norm_query = query.strip().lower()
        matches = []
        for project in _get_projects():
            project_id = project.get("id", "")
            project_name = project.get("name", "")
            data = _api_get(f"/project/{project_id}/data")
            if not data or not isinstance(data.get("tasks"), list):
                continue
            for task in data["tasks"]:
                if norm_query in task.get("title", "").lower():
                    matches.append(_format_task(task, project_name))
        return {"status": "ok", "tasks": matches, "count": len(matches), "query": query}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def get_task_detail(task_id: str, project_id: str) -> dict:
    """Retorna todos os detalhes de uma tarefa: descrição, subtasks, checklist, tags, prioridade."""
    try:
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}
        formatted = _format_task(task)
        data = _api_get(f"/project/{project_id}/data")
        subtasks = []
        if data and isinstance(data.get("tasks"), list):
            subtasks = [_format_task(t) for t in data["tasks"] if t.get("parentId") == task_id]
        formatted["subtasks"] = subtasks
        return {"status": "ok", "task": formatted}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def list_subtasks(task_id: str, project_id: str) -> dict:
    """Lista as subtasks (tarefas filhas completas) de uma tarefa pai."""
    try:
        data = _api_get(f"/project/{project_id}/data")
        if not data:
            return {"status": "error", "message": "Projeto não encontrado"}
        subtasks = [_format_task(t) for t in data.get("tasks", []) if t.get("parentId") == task_id]
        return {"status": "ok", "subtasks": subtasks, "count": len(subtasks)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS MCP — ESCRITA
# ─────────────────────────────────────────────────────────────────────────────

@mcp.tool()
def create_task(
    title: str,
    project_name: str = "",
    due_date: str = "",
    priority: str = "Nenhuma",
    description: str = "",
) -> dict:
    """Cria uma nova tarefa no TickTick. Retorna o id e project_id da tarefa criada."""
    try:
        payload: dict = {
            "title": title,
            "priority": PRIORITY_VALUE.get(priority.strip().lower(), 0),
        }
        if project_name:
            project = _resolve_project(project_name)
            if not project:
                available = [p.get("name") for p in _get_projects()]
                return {"status": "error", "message": f"Projeto '{project_name}' não encontrado. Disponíveis: {available}"}
            payload["projectId"] = project["id"]
        if due_date:
            payload["dueDate"] = f"{due_date}T00:00:00+0000"
        if description:
            payload["content"] = description

        result = _api_post("/task", payload)
        if not result or "id" not in result:
            return {"status": "error", "message": "API não retornou ID da tarefa criada"}

        return {
            "status": "ok",
            "id": result["id"],
            "project_id": result.get("projectId", ""),
            "message": f"Tarefa criada: '{title}'" + (f" em {project_name}" if project_name else ""),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def update_task(
    task_id: str,
    project_id: str,
    title: str = "",
    due_date: str = "",
    priority: str = "",
    description: str = "",
    project_name: str = "",
) -> dict:
    """Edita campos de uma tarefa existente. Apenas os campos informados (não-vazios) são alterados."""
    try:
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}
        if title:
            task["title"] = title
        if due_date:
            task["dueDate"] = f"{due_date}T00:00:00+0000"
        if priority:
            task["priority"] = PRIORITY_VALUE.get(priority.strip().lower(), task.get("priority", 0))
        if description:
            task["content"] = description
        if project_name:
            project = _resolve_project(project_name)
            if not project:
                return {"status": "error", "message": f"Projeto '{project_name}' não encontrado"}
            task["projectId"] = project["id"]

        result = _api_post(f"/task/{task_id}", task)
        if not result:
            return {"status": "error", "message": "Falha ao atualizar tarefa"}
        return {"status": "ok", "message": f"Tarefa '{task.get('title')}' atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def complete_task(task_id: str, project_id: str) -> dict:
    """Marca uma tarefa (ou subtask) como concluída no TickTick."""
    try:
        resp = _api_post(f"/project/{project_id}/task/{task_id}/complete")
        if resp is None:
            return {"status": "error", "message": f"Tarefa não encontrada ou já concluída: {task_id}"}
        return {"status": "ok", "message": "Tarefa concluída"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def delete_task(task_id: str, project_id: str) -> dict:
    """Deleta permanentemente uma tarefa. ATENÇÃO: irreversível. Confirme com o usuário antes."""
    try:
        success = _api_delete(f"/project/{project_id}/task/{task_id}")
        if not success:
            return {"status": "error", "message": f"Falha ao deletar tarefa: {task_id}"}
        return {"status": "ok", "message": "Tarefa deletada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def create_subtask(
    parent_task_id: str,
    parent_project_id: str,
    title: str,
    due_date: str = "",
    priority: str = "Nenhuma",
) -> dict:
    """Cria uma subtask (tarefa filha com ID próprio) dentro de uma tarefa existente."""
    try:
        payload: dict = {
            "title": title,
            "projectId": parent_project_id,
            "parentId": parent_task_id,
            "priority": PRIORITY_VALUE.get(priority.strip().lower(), 0),
        }
        if due_date:
            payload["dueDate"] = f"{due_date}T00:00:00+0000"

        result = _api_post("/task", payload)
        if not result or "id" not in result:
            return {"status": "error", "message": "API não retornou ID da subtask criada"}

        return {
            "status": "ok",
            "id": result["id"],
            "parent_task_id": parent_task_id,
            "message": f"Subtask criada: '{title}'",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def add_checklist_item(task_id: str, project_id: str, item_text: str) -> dict:
    """Adiciona um item de checklist simples (sem data/prioridade) a uma tarefa existente."""
    try:
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}

        new_item = {"id": str(uuid.uuid4()), "title": item_text, "status": 0}
        task["items"] = task.get("items", []) + [new_item]

        result = _api_post(f"/task/{task_id}", task)
        if result is None:
            return {"status": "error", "message": "Falha ao adicionar item de checklist"}

        return {"status": "ok", "item_id": new_item["id"], "message": f"Item adicionado: '{item_text}'"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@mcp.tool()
def complete_checklist_item(task_id: str, project_id: str, item_id: str) -> dict:
    """Marca um item de checklist como concluído."""
    try:
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}

        items = task.get("items", [])
        item_found = False
        for item in items:
            if item.get("id") == item_id:
                item["status"] = 2
                item_found = True
                break

        if not item_found:
            return {"status": "error", "message": f"Item de checklist não encontrado: {item_id}"}

        task["items"] = items
        result = _api_post(f"/task/{task_id}", task)
        if result is None:
            return {"status": "error", "message": "Falha ao atualizar checklist"}

        return {"status": "ok", "message": "Item de checklist concluído"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Entry point — roda o servidor via stdio (protocolo MCP padrão)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # O FastMCP roda via stdio por padrão — ideal para ser invocado como processo filho
    mcp.run()
