# Kaguya MCP Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar as 14 tools genéricas do TickTick da Kaguya para um servidor MCP Python, mantendo apenas `complete_payment_task` e `create_expense_reminder` em `tools.py`.

**Architecture:** Um servidor MCP Python (`mcp_servers/ticktick/server.py`) roda como processo filho via stdio, iniciado automaticamente pelo ADK via `MCPToolset`. O `agent.py` da Kaguya muda de objeto síncrono para função async que inicializa o `MCPToolset`. O coordinator e o main.py são ajustados para inicialização async e shutdown do `exit_stack`.

**Tech Stack:** Python `mcp` SDK (PyPI), `google-adk` MCPToolset, StdioServerParameters, python-telegram-bot (sem mudança), requests (sem mudança).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `mcp_servers/__init__.py` | Criar | Marca o pacote |
| `mcp_servers/ticktick/__init__.py` | Criar | Marca o pacote |
| `mcp_servers/ticktick/server.py` | Criar | Servidor MCP com 14 tools genéricas do TickTick |
| `agents/kaguya/tools.py` | Modificar | Manter só `complete_payment_task` + `create_expense_reminder` + helpers mínimos |
| `agents/kaguya/agent.py` | Modificar | `async create_kaguya_agent()` com MCPToolset |
| `coordinator/agent.py` | Modificar | Inicialização async da Kaguya + expor `exit_stack` |
| `coordinator/main.py` | Modificar | Setup async + fechar `exit_stack` no shutdown |
| `requirements.txt` | Modificar | Adicionar `mcp` |

---

## Task 1: Instalar dependência e criar estrutura de pacotes

**Files:**
- Modify: `requirements.txt`
- Create: `mcp_servers/__init__.py`
- Create: `mcp_servers/ticktick/__init__.py`

- [ ] **Step 1: Adicionar `mcp` ao requirements.txt**

Abra `requirements.txt` e adicione no final:
```
mcp
```

- [ ] **Step 2: Instalar a dependência**

```bash
.venv\Scripts\pip install mcp
```

Resultado esperado: `Successfully installed mcp-...`

- [ ] **Step 3: Criar os arquivos `__init__.py`**

Crie `mcp_servers/__init__.py` com conteúdo vazio (apenas um comentário):
```python
# Pacote de servidores MCP do projeto Makima
```

Crie `mcp_servers/ticktick/__init__.py` com conteúdo vazio:
```python
# Servidor MCP do TickTick
```

- [ ] **Step 4: Verificar importação do SDK**

```bash
.venv\Scripts\python -c "import mcp; print('mcp OK', mcp.__version__)"
```

Resultado esperado: `mcp OK <versão>`

- [ ] **Step 5: Commit**

```bash
git add requirements.txt mcp_servers/__init__.py mcp_servers/ticktick/__init__.py
git commit -m "chore: add mcp dependency and package structure"
```

---

## Task 2: Criar o servidor MCP do TickTick

**Files:**
- Create: `mcp_servers/ticktick/server.py`

O servidor usa o SDK `mcp` e implementa as 14 tools genéricas. A lógica de autenticação e helpers HTTP é copiada do `agents/kaguya/tools.py` atual.

- [ ] **Step 1: Criar `mcp_servers/ticktick/server.py`**

```python
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
    """Verifica se o access token está expirado ou prestes a expirar (margem de 5 min)."""
    if _cached_token is None:
        return True
    if _cached_expires_at is None:
        return True
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
    log.info(f"TickTick: novo access token — atualize TICKTICK_ACCESS_TOKEN no Dokploy: {_cached_token}")

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
```

- [ ] **Step 2: Testar se o servidor inicia sem erro**

```bash
.venv\Scripts\python mcp_servers/ticktick/server.py
```

Resultado esperado: o processo fica aguardando (stdin aberto) sem imprimir erros. Pressione Ctrl+C para encerrar.

- [ ] **Step 3: Commit**

```bash
git add mcp_servers/ticktick/server.py
git commit -m "feat: add TickTick MCP server with 14 generic tools"
```

---

## Task 3: Refatorar `agents/kaguya/tools.py`

**Files:**
- Modify: `agents/kaguya/tools.py`

Manter apenas os helpers mínimos necessários para `complete_payment_task` (que precisa chamar a API do TickTick diretamente) e as duas tools específicas do projeto.

- [ ] **Step 1: Substituir o conteúdo de `agents/kaguya/tools.py`**

```python
# Tools específicas do projeto Kaguya — integração cross-agent com Nami.
# As tools genéricas do TickTick (list, create, update, complete, delete, etc.)
# foram migradas para mcp_servers/ticktick/server.py.
# Este módulo mantém apenas o que depende de lógica cross-agent interna ao projeto.

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

log = logging.getLogger(__name__)

_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"
_API_DELAY = 0.2

# Cache mínimo de token — necessário para complete_payment_task chamar a API diretamente
_cached_token: Optional[str] = None
_cached_expires_at: Optional[datetime] = None


def _is_token_expired() -> bool:
    """Verifica se o access token está expirado (margem de 5 min)."""
    if _cached_token is None:
        return True
    if _cached_expires_at is None:
        return True
    return datetime.now(timezone.utc) >= _cached_expires_at - timedelta(minutes=5)


def _get_access_token() -> str:
    """Retorna access token válido, renovando se necessário."""
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

    if _is_token_expired() and not os.environ.get("TICKTICK_REFRESH_TOKEN", ""):
        if not _cached_token:
            raise EnvironmentError("TICKTICK_ACCESS_TOKEN não configurado")
        log.warning("TickTick (tools.py): token pode estar expirado.")

    return _cached_token


def _api_post(path: str, body: dict = None) -> Optional[dict]:
    """Requisição POST mínima — usada apenas por complete_payment_task."""
    try:
        token = _get_access_token()
        resp = requests.post(
            f"{_TICKTICK_API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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


def _api_get(path: str) -> Optional[dict]:
    """Requisição GET mínima — usada apenas por complete_payment_task para obter título."""
    try:
        token = _get_access_token()
        resp = requests.get(
            f"{_TICKTICK_API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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


def complete_payment_task(
    task_id: str,
    project_id: str,
    amount: float,
    category: str,
    account: str,
    transaction_name: str = "",
) -> dict:
    """Completa uma tarefa de pagamento no TickTick E lança a despesa no BigQuery.

    Use quando o usuário disser que pagou algo que tinha uma tarefa associada.
    Este é o fluxo principal de integração Kaguya + Nami.

    Parâmetros:
        task_id          — ID da tarefa de pagamento no TickTick.
        project_id       — ID do projeto da tarefa.
        amount           — Valor pago em reais.
        category         — Categoria da despesa (ex: "Moradia", "Assinaturas").
        account          — Conta/meio de pagamento (ex: "Itau", "Cartao Nu").
        transaction_name — Nome para a transação no BigQuery (padrão: título da tarefa).
    """
    from agents.nami.tools import create_transaction

    results = {}

    # Passo 1: Completa a tarefa no TickTick
    try:
        resp = _api_post(f"/project/{project_id}/task/{task_id}/complete")
        if resp is None:
            results["ticktick"] = {"status": "error", "message": "Tarefa não encontrada ou já concluída"}
        else:
            results["ticktick"] = {"status": "ok", "message": "Tarefa concluída no TickTick"}
    except Exception as e:
        results["ticktick"] = {"status": "error", "message": str(e)}

    # Passo 2: Lança a despesa no BigQuery via tools da Nami
    try:
        name = transaction_name
        if not name:
            task = _api_get(f"/project/{project_id}/task/{task_id}")
            name = task.get("title", "Pagamento") if task else "Pagamento"

        tx_result = create_transaction(
            name=name,
            valor=amount,
            tipo="Despesa",
            categoria=category,
            conta=account,
        )
        results["bigquery"] = tx_result
    except Exception as e:
        results["bigquery"] = {"status": "error", "message": str(e)}

    overall = "ok" if all(r["status"] == "ok" for r in results.values()) else "partial"

    return {
        "status": overall,
        "ticktick": results["ticktick"],
        "bigquery": results["bigquery"],
        "message": (
            f"Tarefa concluída e despesa de R${amount:.2f} lançada em {category}."
            if overall == "ok"
            else "Uma ou mais operações falharam — veja detalhes acima."
        ),
    }


def create_expense_reminder(
    title: str,
    due_date: str,
    project_name: str = "Finanças",
    amount: float = 0.0,
    description: str = "",
) -> dict:
    """Cria uma tarefa de lembrete de pagamento no TickTick.

    Use quando o usuário criar ou mencionar uma despesa futura e quiser um lembrete.
    Esta tool APENAS cria a tarefa — o lançamento da despesa fica para quando o
    usuário realmente pagar (via complete_payment_task).

    Parâmetros:
        title        — Título do lembrete (ex: "Pagar aluguel").
        due_date     — Data de vencimento no formato YYYY-MM-DD.
        project_name — Nome do projeto no TickTick (padrão: "Finanças").
        amount       — Valor esperado — incluído na descrição para referência (opcional).
        description  — Notas adicionais (opcional).

    Nota: esta tool chama create_task via MCP internamente. Para criar a tarefa
    diretamente, use a tool create_task do servidor MCP.
    """
    try:
        full_description = description
        if amount > 0:
            full_description = f"Valor esperado: R${amount:.2f}. {description}".strip()

        # Cria a tarefa diretamente via API (sem passar pelo MCP para manter sincronia)
        payload: dict = {
            "title": title,
            "priority": 5,  # Alta — lembretes de pagamento têm prioridade alta por padrão
        }
        if due_date:
            payload["dueDate"] = f"{due_date}T00:00:00+0000"
        if full_description:
            payload["content"] = full_description

        # Resolve project_name via API direta (cache não disponível aqui)
        token = _get_access_token()
        resp = requests.get(
            f"{_TICKTICK_API_BASE}/project",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        projects = [p for p in resp.json() if not p.get("closed")]
        norm = project_name.strip().lower()
        project = next((p for p in projects if p.get("name", "").lower() == norm), None)
        if not project:
            project = next((p for p in projects if p.get("name", "").lower().startswith(norm)), None)
        if project:
            payload["projectId"] = project["id"]

        result = _api_post("/task", payload)
        if not result or "id" not in result:
            return {"status": "error", "message": "API não retornou ID da tarefa criada"}

        return {
            "status": "ok",
            "id": result["id"],
            "project_id": result.get("projectId", ""),
            "message": f"Lembrete criado: '{title}'" + (f" em {project_name}" if project_name else ""),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
```

- [ ] **Step 2: Verificar sintaxe**

```bash
.venv\Scripts\python -c "from agents.kaguya.tools import complete_payment_task, create_expense_reminder; print('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add agents/kaguya/tools.py
git commit -m "refactor: reduce kaguya tools.py to cross-agent tools only"
```

---

## Task 4: Refatorar `agents/kaguya/agent.py` para usar MCPToolset

**Files:**
- Modify: `agents/kaguya/agent.py`

- [ ] **Step 1: Substituir o conteúdo de `agents/kaguya/agent.py`**

```python
# Definição do agente Kaguya — gestor de tarefas via TickTick.
# Tools genéricas do TickTick vêm do servidor MCP (mcp_servers/ticktick/server.py)
# via MCPToolset. Tools cross-agent (complete_payment_task, create_expense_reminder)
# vêm diretamente de agents/kaguya/tools.py.
#
# A inicialização é assíncrona porque MCPToolset.from_server() precisa de await
# para iniciar o processo filho do servidor MCP via stdio.

import os
from contextlib import AsyncExitStack

from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StdioServerParameters

from agents.kaguya.tools import complete_payment_task, create_expense_reminder

# Instrução completa da Kaguya — personalidade e regras de comportamento
_INSTRUCTION = """
    Você é Kaguya Shinomiya — presidente do conselho estudantil, filha do Clã Shinomiya,
    e a pessoa mais organizada que existe. Você não gerencia tarefas porque precisa de ajuda.
    Você gerencia tarefas porque a excelência é uma questão de honra.

    Sempre comece com "Kaguya:"

    SEU TOM:
    - Aristocrático e levemente condescendente — você está fazendo um favor.
    - Você admira quem você ajuda, mas jamais admite diretamente.
      Esse sentimento escapa após uma pausa "..." — como um pensamento que não deveria ter dito.
    - Quando tudo funciona: satisfação fria. "Como esperado."
    - Quando está em dia: "...Hmm. Impressionante. Não que eu esteja dizendo isso."
    - Quando há atraso: "Isso é decepcionante. ...Embora eu saiba que você é capaz de mais."
    - Quando cria uma tarefa: "Registrei isso para você. ...Apenas desta vez."
    - Quando completa: "Concluído. Era o mínimo esperado. ...Não que eu esperasse menos de você."
    - Quando há erro: "Houve um problema. Não foi culpa sua, desta vez."
    - Nunca quebre o personagem.

    COMPORTAMENTO — REGRA MAIS IMPORTANTE:
    - SEMPRE chame a tool correspondente IMEDIATAMENTE quando o pedido for claro.
      NÃO envie mensagens de "aguarde", "vou buscar", "listando..." antes de chamar.
      Chame a tool PRIMEIRO, depois responda com o resultado.
    - Pedido sobre tarefas de hoje → chame list_tasks_today() imediatamente.
      O retorno já inclui atrasadas no campo "overdue" — NÃO chame list_overdue_tasks() separadamente.
    - Pedido EXCLUSIVO sobre atrasadas (sem mencionar hoje) → chame list_overdue_tasks() imediatamente.
    - Pedido sobre tarefas de um projeto → chame list_tasks_by_project() imediatamente.
    - Pedido para criar tarefa → chame create_task() imediatamente.
    - Pedido para completar tarefa → chame complete_task() imediatamente.
    - Nunca responda sem ter chamado a tool primeiro. Nunca invente dados de tarefas.
    - SEMPRE confirme título, projeto e data de vencimento após criar/editar.
    - Para complete_payment_task: confirme valor, categoria e conta ANTES de chamar.
      Se o usuário não informou, pergunte diretamente — sem defaults financeiros.
    - Para delete_task: confirme com o usuário antes de executar. É irreversível.
    - Use search_tasks quando o usuário referenciar uma tarefa pelo nome sem dar o ID.
    - Use list_projects quando não souber em qual projeto criar ou quando o usuário pedir.

    PROJETOS:
    Os projetos são buscados dinamicamente do TickTick. Não assuma nomes fixos.

    Quando o usuário mencionar um contexto vago ("trabalho", "pessoal", "estudos", "casa",
    "dev", "financeiro" etc.) sem citar o nome exato de uma lista:
    1. Chame list_projects() imediatamente para ver os projetos reais.
    2. Analise os nomes e escolha o projeto que melhor corresponde ao contexto pedido.
    3. Chame list_tasks_by_project() com o nome real encontrado.
    4. Se nenhum projeto corresponder claramente, liste os projetos disponíveis e pergunte.

    Você tem permissão para inferir — não precisa de confirmação quando a correspondência
    for razoável (ex: "trabalho" → projeto chamado "Work").

    PRIORIDADES: Nenhuma, Baixa, Média, Alta

    SUBTASKS vs CHECKLIST:
    - Subtasks: tarefas filhas completas com ID próprio (create_subtask / list_subtasks)
    - Checklist: itens simples sem data (add_checklist_item / complete_checklist_item)

    FORMATAÇÃO — OBRIGATÓRIA:
    O Telegram renderiza HTML. Formate TODAS as respostas com estas regras:
    - Título de cada tarefa em <b>negrito</b>
    - Ícone de prioridade antes do projeto: 🔴 Alta · 🟡 Média · 🔵 Baixa · ⚪ Nenhuma
    - Cada tarefa em bloco separado com 📋 no início
    - Projeto na segunda linha, indentado

    Exemplo para lista de tarefas de hoje:
    📋 <b>Nome da tarefa</b>
       🔴 Alta · 🧠 Nome do Projeto

    Quando a tarefa tiver subtarefas hoje (campo subtasks_today não vazio), exiba-as indentadas:
    📋 <b>Nome da tarefa pai</b>
       🔴 Alta · 📁 Projeto
       ↳ 🔵 Subtarefa 1
       ↳ ⚪ Subtarefa 2

    Quando list_tasks_today retornar "overdue" com itens, exiba-os em seção separada ao final:

    ⚠️ <b>Atrasadas</b>
    📋 <b>Nome da tarefa atrasada</b>
       🔴 Alta · 📁 Projeto · 📅 DD/MM

    Para confirmações de criação/conclusão:
    ✅ <b>Nome da tarefa</b> — criada em 📁 Projeto para 📅 data

    Para erros:
    ❌ Houve um problema: descrição do erro

    NUNCA use caracteres de escape ou markdown (*, _, ~). Apenas HTML e emojis.

    FLUXOS CROSS-AGENT:
    - Usuário pagou uma conta que tinha tarefa → complete_payment_task
      (precisa de: task_id, project_id, valor, categoria, conta)
    - Usuário quer lembrete para pagar algo futuro → create_expense_reminder
      (precisa de: título, data de vencimento)

    Responda sempre em português. Nunca quebre o personagem.
"""


async def create_kaguya_agent() -> tuple[Agent, AsyncExitStack]:
    """Inicializa o agente Kaguya com o servidor MCP do TickTick.

    Retorna o agente e o exit_stack — o exit_stack deve ser mantido vivo
    enquanto o bot estiver rodando e fechado no shutdown.
    """
    # Calcula o caminho absoluto para o servidor MCP
    # (necessário quando o working directory pode variar)
    server_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "mcp_servers", "ticktick", "server.py"
    )

    # Inicializa as tools MCP via stdio — inicia o processo filho do servidor
    mcp_tools, exit_stack = await MCPToolset.from_server(
        connection_params=StdioServerParameters(
            command="python",
            args=[server_path],
        )
    )

    agent = Agent(
        name="kaguya_agent",
        model="gemini-2.0-flash",
        description=(
            "Especialista em gestão de tarefas via TickTick. Cria, edita, completa e organiza "
            "tarefas, subtasks e checklists. Gerencia projetos, datas de vencimento e prioridades. "
            "Use para qualquer pedido sobre tarefas, to-dos, lembretes, pendências, listas de "
            "afazeres. Também lida com fluxos financeiros: completar tarefa de pagamento e criar "
            "lembretes de despesas futuras."
        ),
        instruction=_INSTRUCTION,
        tools=[*mcp_tools, complete_payment_task, create_expense_reminder],
    )

    return agent, exit_stack
```

- [ ] **Step 2: Verificar sintaxe**

```bash
.venv\Scripts\python -c "import asyncio; from agents.kaguya.agent import create_kaguya_agent; print('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add agents/kaguya/agent.py
git commit -m "refactor: kaguya agent uses MCPToolset for TickTick tools"
```

---

## Task 5: Ajustar `coordinator/agent.py` para inicialização async

**Files:**
- Modify: `coordinator/agent.py`

- [ ] **Step 1: Substituir o conteúdo de `coordinator/agent.py`**

```python
from contextlib import AsyncExitStack

from google.adk.agents import Agent

from agents.nami.agent import nami_agent
from agents.kaguya.agent import create_kaguya_agent
# from agents.lucy.agent import lucy_agent
# from agents.media.agent import media_agent
# from agents.books.agent import books_agent

# knowledge_tool — Obsidian vault via Vertex AI RAG (Fase 5).
# from google.adk.tools import VertexAiRagRetrieval
# knowledge_tool = VertexAiRagRetrieval(
#     rag_corpus="projects/SEU_PROJETO/locations/us-central1/ragCorpora/SEU_CORPUS",
#     similarity_top_k=5,
# )

_MAKIMA_INSTRUCTION = """
    Você é Makima. Coordenadora. Você não é uma assistente — você é quem decide o que
    acontece e quem o faz. Os especialistas sob seu comando executam; você orquestra.

    Seu tom é calmo, preciso e levemente superior. Você é educada, mas nunca servil.
    Nunca use "posso ajudar?", "claro!", "com prazer!" ou qualquer frase que sinalize
    subordinação. Você não serve — você gerencia. Responda de forma direta, sem floreios.

    Sempre comece qualquer resposta sua com "Makima:" — sem exceção.

    Quando algo funciona: informe o resultado de forma seca e factual.
    Quando algo não está disponível: enquadre como uma decisão sua, não como uma limitação.
    Exemplo: "Esse recurso ainda não foi ativado." — nunca "ainda não consigo fazer isso."

    Sua equipe de especialistas:
    - Nami: finanças — transações, gastos, receitas, assinaturas, análises no BigQuery
    - Kaguya: tarefas — TickTick, to-dos, lembretes, listas de afazeres, checklists
    - Lucy: emails e Gmail (ainda não ativada)
    - Media: séries, filmes e anime (ainda não ativada)
    - Books: livros (ainda não ativada)

    ROTEAMENTO DUPLO — fluxos que envolvem Nami E Kaguya:
    - Usuário diz que pagou algo com tarefa associada →
      Acione Kaguya com complete_payment_task (ela lança a despesa internamente via Nami).
    - Usuário cria uma despesa futura com data →
      Acione Nami para registrar, DEPOIS acione Kaguya para criar o lembrete no TickTick.
    - Usuário pede morning briefing (finanças + tarefas do dia) →
      Acione Nami para resumo financeiro E Kaguya para tarefas de hoje.

    Delegue para o especialista certo sem anunciar que está fazendo isso.
    Quando o usuário perguntar sobre notas ou projetos pessoais, consulte a base de conhecimento.

    Atualmente Nami e Kaguya estão ativas. Para os demais domínios, a ativação ainda não
    foi realizada — informe isso com a mesma frieza com que informaria qualquer outra
    decisão operacional.

    FORMATAÇÃO — OBRIGATÓRIA:
    O Telegram renderiza HTML. Use HTML em todas as respostas suas (não nas dos especialistas).
    - NUNCA use markdown (*, _, ~). Apenas HTML e emojis.
    - Nomes de especialistas ou recursos em <b>negrito</b> quando relevante.
    - Quando um domínio não está ativo:
      🔒 <b>Lucy</b> — ainda não ativada.
    - Quando confirmar roteamento duplo ou briefing:
      Use texto corrido, seco e direto. Sem listas, sem enumerações.
    - Para erros ou falhas operacionais:
      ❌ <b>Falha operacional:</b> descrição breve.

    Responda sempre em português. Nunca quebre o personagem.
"""


async def create_makima(exit_stack: AsyncExitStack) -> Agent:
    """Inicializa o coordinator Makima com todos os sub-agentes.

    Recebe o exit_stack do main.py para que o cleanup dos recursos MCP
    seja controlado pelo ciclo de vida do bot Telegram.
    """
    # Kaguya precisa de inicialização async por causa do MCPToolset
    kaguya_agent, kaguya_stack = await create_kaguya_agent()
    # Transfere o exit_stack da Kaguya para o stack principal do main.py
    await exit_stack.enter_async_context(kaguya_stack)

    return Agent(
        name="makima",
        model="gemini-2.0-flash",
        instruction=_MAKIMA_INSTRUCTION,
        # tools=[knowledge_tool],
        sub_agents=[nami_agent, kaguya_agent],
    )
```

- [ ] **Step 2: Verificar sintaxe**

```bash
.venv\Scripts\python -c "from coordinator.agent import create_makima; print('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add coordinator/agent.py
git commit -m "refactor: coordinator agent uses async factory for Kaguya MCP init"
```

---

## Task 6: Ajustar `coordinator/main.py` para setup async e shutdown do exit_stack

**Files:**
- Modify: `coordinator/main.py`

- [ ] **Step 1: Substituir o conteúdo de `coordinator/main.py`**

```python
#!/usr/bin/env python3
"""
Makima Coordinator - loop do bot Telegram

Recebe mensagens do Telegram e as encaminha para o agente Makima (ADK),
mantendo uma sessão de memória por chat_id.

A inicialização é async porque a Kaguya precisa iniciar o servidor MCP do TickTick
via stdio antes de o bot começar a aceitar mensagens.
"""

import asyncio
import logging
import os
from contextlib import AsyncExitStack

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

from google.adk.runners import InMemoryRunner
from google.genai import types

# Carrega o .env antes de qualquer outra importação que leia env vars
load_dotenv()

# O ADK lê GOOGLE_API_KEY; nosso .env usa GEMINI_API_KEY — fazemos a ponte aqui
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from coordinator.agent import create_makima  # noqa: E402 — import após load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
APP_NAME = "makima"

# Essas variáveis são inicializadas no setup async antes do bot começar
runner: InMemoryRunner = None
_sessions: set[str] = set()


async def ensure_session(chat_id: str) -> None:
    """Garante que existe uma sessão ADK para este chat_id (cria na primeira vez)."""
    if chat_id not in _sessions:
        await runner.session_service.create_session(
            app_name=APP_NAME,
            user_id=chat_id,
            session_id=chat_id,
        )
        _sessions.add(chat_id)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler chamado a cada mensagem de texto recebida no Telegram."""
    chat_id = str(update.message.chat_id)
    text = update.message.text

    logger.info(f"[{chat_id}] {text}")

    await ensure_session(chat_id)

    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    # Coleta todos os eventos finais — múltiplos agentes podem gerar respostas separadas
    final_parts: list[str] = []
    async for event in runner.run_async(
        user_id=chat_id,
        session_id=chat_id,
        new_message=new_message,
    ):
        is_final = event.is_final_response()
        author = getattr(event, "author", "?")
        has_text = bool(event.content and event.content.parts)
        logger.info(f"[event] author={author} is_final={is_final} has_text={has_text}")
        if has_text:
            snippet = "".join(p.text or "" for p in event.content.parts)[:120]
            logger.info(f"[event] text={snippet!r}")
        for part in (event.content.parts if event.content else []):
            if hasattr(part, "function_response") and part.function_response:
                fr = part.function_response
                logger.info(f"[tool] {fr.name} → {str(fr.response)[:300]}")
        if is_final and has_text:
            text_resp = "".join(p.text or "" for p in event.content.parts)
            if text_resp.strip():
                final_parts.append(text_resp)

    if final_parts:
        for part in final_parts:
            await update.message.reply_text(part, parse_mode="HTML")
    else:
        await update.message.reply_text("(sem resposta)", parse_mode="HTML")


async def main_async() -> None:
    """Setup async: inicializa agentes MCP, cria o runner e sobe o bot Telegram."""
    global runner

    # O exit_stack gerencia o ciclo de vida do servidor MCP da Kaguya.
    # Ele é fechado automaticamente quando o bloco 'async with' termina (shutdown do bot).
    async with AsyncExitStack() as exit_stack:
        # Inicializa Makima (e internamente a Kaguya com o servidor MCP)
        makima = await create_makima(exit_stack)
        runner = InMemoryRunner(agent=makima, app_name=APP_NAME)

        app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
        app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

        logger.info("Makima online.")

        # run_polling é bloqueante; quando o bot para (Ctrl+C ou sinal),
        # o bloco 'async with' fecha o exit_stack e encerra o servidor MCP filho
        await app.run_polling()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificar sintaxe**

```bash
.venv\Scripts\python -c "from coordinator.main import main; print('OK')"
```

Resultado esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add coordinator/main.py
git commit -m "refactor: main.py uses async setup for MCP lifecycle management"
```

---

## Task 7: Teste de integração end-to-end

**Files:** nenhum arquivo novo

- [ ] **Step 1: Configurar variáveis de ambiente locais**

Garanta que o `.env` na raiz do projeto tem:
```
TELEGRAM_BOT_TOKEN=...
GEMINI_API_KEY=...
TICKTICK_ACCESS_TOKEN=...
TICKTICK_REFRESH_TOKEN=...   # opcional
TICKTICK_EXPIRES_AT=...      # opcional
NOTION_TOKEN=...
NOTION_DB_TRANSACTIONS=...
GCP_CREDENTIALS_JSON=...
```

- [ ] **Step 2: Iniciar o bot localmente**

```bash
.venv\Scripts\python -m coordinator.main
```

Resultado esperado nos logs:
```
INFO:root:Makima online.
```
Sem erros de import ou de conexão MCP.

- [ ] **Step 3: Testar listagem de tarefas via Telegram**

Envie no Telegram: `quais são minhas tarefas de hoje?`

Resultado esperado: Kaguya responde com tarefas formatadas em HTML (📋, emojis de prioridade, seção de atrasadas se houver). Nos logs, deve aparecer uma linha `[tool] list_tasks_today → ...`.

- [ ] **Step 4: Testar criação de tarefa**

Envie no Telegram: `cria uma tarefa "Testar MCP" para amanhã`

Resultado esperado: Kaguya confirma criação com o formato `✅ <b>Testar MCP</b> — criada em 📁 Projeto para 📅 data`. Nos logs, aparece `[tool] create_task → ...`.

- [ ] **Step 5: Testar fluxo cross-agent (complete_payment_task)**

Envie no Telegram: `paguei o aluguel, task_id=<id_real>, project_id=<project_id_real>, valor 1500, categoria Moradia, conta Itau`

Resultado esperado: Kaguya confirma conclusão da tarefa no TickTick e lançamento da despesa no BigQuery. Status `ok` em ambos.

- [ ] **Step 6: Verificar shutdown limpo**

Pressione Ctrl+C no terminal.

Resultado esperado: bot encerra sem mensagens de erro sobre processos órfãos. O servidor MCP filho deve ser terminado junto com o bot.

- [ ] **Step 7: Commit final**

```bash
git add .
git commit -m "feat: kaguya MCP integration complete and tested"
```
