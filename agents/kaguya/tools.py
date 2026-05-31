# Módulo de ferramentas do agente Kaguya — acesso completo ao TickTick via OAuth 2.0.
# Todas as funções públicas são tools registradas no ADK e retornam
# {"status": "ok"|"error", ...} — nunca lançam exceções para o agente.

import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests

# Logger do módulo — logs vão para stderr, visíveis nos logs do container
log = logging.getLogger(__name__)

# URL base da API Open do TickTick e endpoint de refresh OAuth
_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"

# Delay mínimo entre chamadas à API para respeitar o rate limit (200ms)
_API_DELAY = 0.2

# Prioridade numérica do TickTick → label legível para o usuário
PRIORITY_LABEL: dict[int, str] = {0: "Nenhuma", 1: "Baixa", 3: "Média", 5: "Alta"}

# Label de prioridade informado pelo usuário → valor numérico do TickTick
PRIORITY_VALUE: dict[str, int] = {"nenhuma": 0, "baixa": 1, "média": 3, "media": 3, "alta": 5}

# ── Cache do access token em memória ──────────────────────────────────────────
# Evita refresh desnecessário entre chamadas na mesma sessão do bot.
_cached_token: Optional[str] = None
_cached_expires_at: Optional[datetime] = None

# ── Cache de projetos em memória (TTL 5 min) ──────────────────────────────────
# Projetos são buscados dinamicamente da API para suportar renomeações e novos
# projetos sem mudança de código. Cache evita chamada à API em toda operação.
_projects_cache: list[dict] = []
_projects_cache_at: Optional[datetime] = None
_PROJECTS_CACHE_TTL = timedelta(minutes=5)


def _is_token_expired() -> bool:
    """Verifica se o access token em cache está expirado ou prestes a expirar (margem de 5 min)."""
    if _cached_token is None:
        return True
    if _cached_expires_at is None:
        return True  # sem data de expiração, assume expirado para forçar refresh seguro
    return datetime.now(timezone.utc) >= _cached_expires_at - timedelta(minutes=5)


def _refresh_token() -> str:
    """Obtém um novo access token via OAuth refresh grant e atualiza o cache em memória.

    Loga o novo token para que o usuário possa atualizar manualmente no Dokploy se necessário.
    Não persiste em arquivo — tokens ficam apenas em memória e em variáveis de ambiente.
    """
    global _cached_token, _cached_expires_at

    client_id = os.environ.get("TICKTICK_CLIENT_ID", "")
    client_secret = os.environ.get("TICKTICK_CLIENT_SECRET", "")
    refresh_token = os.environ.get("TICKTICK_REFRESH_TOKEN", "")

    if not client_id or not client_secret:
        raise EnvironmentError("TICKTICK_CLIENT_ID e TICKTICK_CLIENT_SECRET são obrigatórios")
    if not refresh_token:
        raise EnvironmentError(
            "TICKTICK_REFRESH_TOKEN não configurado. "
            "Configure a variável de ambiente no Dokploy."
        )

    log.info("TickTick: renovando access token via refresh grant")
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
    # TickTick pode rotacionar o refresh token — loga o novo para atualização manual
    new_refresh = data.get("refresh_token", refresh_token)
    if new_refresh != refresh_token:
        log.warning(
            f"TickTick: NOVO refresh token — atualize TICKTICK_REFRESH_TOKEN no Dokploy: {new_refresh}"
        )

    expires_in = int(data.get("expires_in", 15552000))  # padrão 180 dias
    _cached_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    log.info(f"TickTick: token renovado, expira em {_cached_expires_at.isoformat()}")
    log.info(f"TickTick: novo access token — atualize TICKTICK_ACCESS_TOKEN no Dokploy: {_cached_token}")

    return _cached_token


def _get_access_token() -> str:
    """Retorna um access token válido, renovando automaticamente se expirado.

    Se TICKTICK_REFRESH_TOKEN não estiver configurado, usa o access token diretamente
    sem tentar refresh — o TickTick emite tokens de 180 dias, então refresh é opcional.
    """
    global _cached_token, _cached_expires_at

    # Inicializa o cache na primeira chamada a partir das variáveis de ambiente
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
        # Só tenta refresh se o refresh token estiver disponível
        if os.environ.get("TICKTICK_REFRESH_TOKEN", ""):
            return _refresh_token()
        # Sem refresh token: usa o access token mesmo que pareça expirado.
        # O TickTick emite tokens de 180 dias — se expirou, o erro 401 vai aparecer
        # na chamada à API e o usuário precisará rodar get_token.py novamente.
        if not _cached_token:
            raise EnvironmentError(
                "TICKTICK_ACCESS_TOKEN não configurado. "
                "Execute get_token.py e configure a variável no Dokploy."
            )
        log.warning("TickTick: token pode estar expirado e sem refresh token configurado. Tentando mesmo assim.")

    return _cached_token


def _headers() -> dict:
    """Retorna os headers HTTP necessários para qualquer chamada à API do TickTick."""
    return {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
    }


def _api_get(path: str, params: dict = None) -> Optional[dict | list]:
    """Faz uma requisição GET à API do TickTick e retorna o JSON parseado ou None em caso de erro."""
    try:
        resp = requests.get(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        time.sleep(_API_DELAY)  # respeita o rate limit da API
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick GET {path} falhou: {e}")
        raise


def _api_post(path: str, body: dict = None) -> Optional[dict]:
    """Faz uma requisição POST à API do TickTick e retorna o JSON parseado ou None."""
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
    """Faz uma requisição DELETE à API do TickTick. Retorna True se bem-sucedido."""
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
    """Retorna a lista de projetos ativos do TickTick, com cache de 5 minutos.

    Busca dinamicamente da API para suportar novos projetos e renomeações
    sem necessidade de alterar código ou variáveis de ambiente.
    """
    global _projects_cache, _projects_cache_at
    now = datetime.now(timezone.utc)
    cache_expired = (
        not _projects_cache
        or _projects_cache_at is None
        or (now - _projects_cache_at) > _PROJECTS_CACHE_TTL
    )
    if cache_expired:
        raw = _api_get("/project")
        # Filtra projetos fechados/arquivados — só mantém os ativos
        _projects_cache = [p for p in (raw or []) if not p.get("closed")] if isinstance(raw, list) else []
        _projects_cache_at = now
    return _projects_cache


def _resolve_project(name: str) -> Optional[dict]:
    """Resolve um nome de projeto (case-insensitive, prefixo) para o objeto {id, name} do TickTick.

    Usa a lista dinâmica da API — suporta qualquer projeto existente no TickTick sem
    precisar de mapeamento hardcoded.

    Retorna None se não encontrar correspondência única.
    """
    norm = name.strip().lower()
    projects = _get_projects()
    # Tenta correspondência exata primeiro
    for p in projects:
        if p.get("name", "").lower() == norm:
            return p
    # Fallback: prefixo (ex.: "fin" → "Finanças")
    matches = [p for p in projects if p.get("name", "").lower().startswith(norm)]
    if len(matches) > 1:
        log.warning(f"Múltiplas correspondências para '{name}': {[p.get('name') for p in matches]}")
    return matches[0] if len(matches) == 1 else None


def _today_iso() -> str:
    """Retorna a data de hoje no formato ISO 8601 do TickTick (YYYY-MM-DDT00:00:00+0000)."""
    return date.today().strftime("%Y-%m-%dT00:00:00+0000")


def _format_task(task: dict, project_name: str = "") -> dict:
    """Converte um task dict bruto da API do TickTick para um formato limpo e legível.

    Resolve o nome do projeto a partir do cache se não for informado explicitamente.
    """
    project_id = task.get("projectId", "")
    # Resolve nome do projeto pelo cache se disponível
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
        "items": [  # checklist items dentro da tarefa
            {
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "status": "concluído" if item.get("status") == 2 else "pendente",
            }
            for item in task.get("items", [])
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS DE LEITURA — retornam dados do TickTick
# ─────────────────────────────────────────────────────────────────────────────


def list_projects() -> dict:
    """Lista todos os projetos ativos disponíveis no TickTick.

    Use para descobrir os projetos disponíveis quando o usuário mencionar um
    projeto desconhecido ou para apresentar as opções ao usuário.
    """
    try:
        projects = _get_projects()
        return {
            "status": "ok",
            "projects": [{"id": p.get("id"), "name": p.get("name")} for p in projects],
            "count": len(projects),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_tasks_today() -> dict:
    """Lista tarefas de hoje E tarefas atrasadas.

    Use quando o usuário perguntar "o que tenho para hoje?", "minhas tarefas de hoje"
    ou qualquer variação. O retorno já inclui atrasadas no campo "overdue" — não é
    necessário chamar list_overdue_tasks() separadamente.

    Subtarefas com dueDate de hoje aparecem no campo "subtasks_today" da tarefa pai,
    não como itens independentes na lista.
    """
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

            # Separa tarefas principais (sem parentId) de subtarefas (com parentId)
            main_tasks = [t for t in all_tasks if not t.get("parentId")]
            child_tasks = [t for t in all_tasks if t.get("parentId")]

            # Índice de subtarefas por parentId para lookup rápido
            subtasks_by_parent: dict[str, list] = {}
            for st in child_tasks:
                subtasks_by_parent.setdefault(st["parentId"], []).append(st)

            for task in main_tasks:
                if task.get("status", 0) == 2:
                    continue  # ignora concluídas

                due = task.get("dueDate", "")
                task_due_today = bool(due and due.startswith(today_str))
                task_overdue = bool(due and due[:10] < today_str)

                # Subtarefas desta tarefa pai que vencem hoje (ativas)
                children_today = [
                    _format_task(st, project_name)
                    for st in subtasks_by_parent.get(task.get("id", ""), [])
                    if st.get("dueDate", "").startswith(today_str) and st.get("status", 0) != 2
                ]

                if task_due_today or children_today:
                    # Tarefa vence hoje (ou tem subtarefas hoje) — vai para a lista principal
                    formatted = _format_task(task, project_name)
                    formatted["subtasks_today"] = children_today
                    tasks_today.append(formatted)
                elif task_overdue:
                    # Tarefa atrasada — vai para seção separada
                    formatted = _format_task(task, project_name)
                    formatted["subtasks_today"] = []
                    overdue.append(formatted)

        # Ordena atrasadas da mais antiga para a mais recente
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


def list_overdue_tasks() -> dict:
    """Lista todas as tarefas ativas com data de vencimento no passado.

    Use quando o usuário perguntar sobre tarefas atrasadas ou pendências.
    """
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
                # Tarefa atrasada: tem data, a data é anterior a hoje, e ainda está ativa
                if due and due[:10] < today_str and task.get("status", 0) != 2:
                    overdue.append(_format_task(task, project_name))
        # Ordena da mais atrasada para a mais recente
        overdue.sort(key=lambda t: t.get("due_date", ""))
        return {"status": "ok", "tasks": overdue, "count": len(overdue)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_tasks_by_project(project_name: str) -> dict:
    """Lista todas as tarefas ativas de um projeto específico.

    Parâmetros:
        project_name — Nome do projeto (aceita prefixo case-insensitive, ex: "fin" → "Finanças").
    """
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
            if t.get("status", 0) != 2  # exclui tarefas já concluídas
        ]
        return {"status": "ok", "tasks": tasks, "count": len(tasks), "project": project["name"]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def search_tasks(query: str) -> dict:
    """Busca tarefas pelo título (case-insensitive) em todos os projetos.

    Parâmetros:
        query — Texto para buscar no título das tarefas.

    Use quando o usuário referenciar uma tarefa pelo nome sem saber o projeto.
    Retorna tarefas ativas e concluídas que contenham o texto.
    """
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


def get_task_detail(task_id: str, project_id: str) -> dict:
    """Retorna todos os detalhes de uma tarefa: descrição, subtasks, checklist, tags, prioridade.

    Parâmetros:
        task_id    — ID da tarefa no TickTick.
        project_id — ID do projeto ao qual a tarefa pertence.

    Use quando o usuário pedir detalhes de uma tarefa específica ou para listar subtasks.
    """
    try:
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}
        formatted = _format_task(task)
        # Subtasks são tarefas normais com parentId apontando para esta tarefa
        data = _api_get(f"/project/{project_id}/data")
        subtasks = []
        if data and isinstance(data.get("tasks"), list):
            subtasks = [
                _format_task(t) for t in data["tasks"]
                if t.get("parentId") == task_id
            ]
        formatted["subtasks"] = subtasks
        return {"status": "ok", "task": formatted}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_subtasks(task_id: str, project_id: str) -> dict:
    """Lista as subtasks de uma tarefa pai.

    Parâmetros:
        task_id    — ID da tarefa pai.
        project_id — ID do projeto onde a tarefa pai está.

    Subtasks são tarefas filhas completas (com data/prioridade própria), diferentes
    de checklist items (itens simples sem data).
    """
    try:
        data = _api_get(f"/project/{project_id}/data")
        if not data:
            return {"status": "error", "message": "Projeto não encontrado"}
        subtasks = [
            _format_task(t) for t in data.get("tasks", [])
            if t.get("parentId") == task_id
        ]
        return {"status": "ok", "subtasks": subtasks, "count": len(subtasks)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS PÚBLICAS DE ESCRITA — criam, editam, completam e deletam no TickTick
# ─────────────────────────────────────────────────────────────────────────────


def create_task(
    title: str,
    project_name: str = "",
    due_date: str = "",
    priority: str = "Nenhuma",
    description: str = "",
) -> dict:
    """Cria uma nova tarefa no TickTick.

    Parâmetros:
        title        — Título da tarefa (obrigatório).
        project_name — Nome do projeto (opcional). Se omitido, cria no Inbox do TickTick.
        due_date     — Data de vencimento no formato YYYY-MM-DD (opcional).
        priority     — "Nenhuma", "Baixa", "Média" ou "Alta" (padrão: "Nenhuma").
        description  — Texto de descrição/notas (opcional).

    Retorna o ID e project_id da tarefa criada — guarde para operações subsequentes.
    """
    try:
        payload: dict = {
            "title": title,
            "priority": PRIORITY_VALUE.get(priority.strip().lower(), 0),
        }

        # Resolve o projeto dinamicamente se informado
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


def update_task(
    task_id: str,
    project_id: str,
    title: str = "",
    due_date: str = "",
    priority: str = "",
    description: str = "",
    project_name: str = "",
) -> dict:
    """Edita campos de uma tarefa existente. Apenas os campos informados (não-vazios) são alterados.

    Parâmetros:
        task_id      — ID da tarefa (obrigatório).
        project_id   — ID do projeto atual da tarefa (obrigatório).
        title        — Novo título (opcional).
        due_date     — Nova data no formato YYYY-MM-DD (opcional).
        priority     — Nova prioridade: "Nenhuma", "Baixa", "Média" ou "Alta" (opcional).
        description  — Novo texto de descrição (opcional).
        project_name — Mover para outro projeto pelo nome (opcional).
    """
    try:
        # A API do TickTick exige o objeto completo da tarefa no POST de atualização
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


def complete_task(task_id: str, project_id: str) -> dict:
    """Marca uma tarefa (ou subtask) como concluída no TickTick.

    Parâmetros:
        task_id    — ID da tarefa a completar.
        project_id — ID do projeto ao qual a tarefa pertence.
    """
    try:
        resp = _api_post(f"/project/{project_id}/task/{task_id}/complete")
        # A API retorna {} (body vazio) em caso de sucesso
        if resp is None:
            return {"status": "error", "message": f"Tarefa não encontrada ou já concluída: {task_id}"}
        return {"status": "ok", "message": "Tarefa concluída"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_task(task_id: str, project_id: str) -> dict:
    """Deleta permanentemente uma tarefa do TickTick.

    Parâmetros:
        task_id    — ID da tarefa a deletar.
        project_id — ID do projeto ao qual a tarefa pertence.

    ATENÇÃO: Operação irreversível. Confirme com o usuário antes de chamar.
    """
    try:
        success = _api_delete(f"/project/{project_id}/task/{task_id}")
        if not success:
            return {"status": "error", "message": f"Falha ao deletar tarefa: {task_id}"}
        return {"status": "ok", "message": "Tarefa deletada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_subtask(
    parent_task_id: str,
    parent_project_id: str,
    title: str,
    due_date: str = "",
    priority: str = "Nenhuma",
) -> dict:
    """Cria uma subtask (tarefa filha) dentro de uma tarefa existente.

    Parâmetros:
        parent_task_id    — ID da tarefa pai.
        parent_project_id — ID do projeto da tarefa pai.
        title             — Título da subtask.
        due_date          — Data de vencimento no formato YYYY-MM-DD (opcional).
        priority          — "Nenhuma", "Baixa", "Média" ou "Alta" (padrão: "Nenhuma").

    Subtasks são tarefas filhas completas (com ID próprio, data e prioridade),
    diferentes de checklist items (itens simples sem data).
    """
    try:
        payload: dict = {
            "title": title,
            "projectId": parent_project_id,
            "parentId": parent_task_id,  # campo que define a hierarquia no TickTick
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


def add_checklist_item(task_id: str, project_id: str, item_text: str) -> dict:
    """Adiciona um item de checklist simples a uma tarefa existente.

    Parâmetros:
        task_id    — ID da tarefa.
        project_id — ID do projeto da tarefa.
        item_text  — Texto do item a adicionar.

    Checklist items são itens simples sem data/prioridade própria (items[] na tarefa),
    diferentes de subtasks (que são tarefas filhas completas).
    """
    try:
        import uuid
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}

        # Adiciona o novo item à lista existente sem remover os anteriores
        new_item = {"id": str(uuid.uuid4()), "title": item_text, "status": 0}
        task["items"] = task.get("items", []) + [new_item]

        result = _api_post(f"/task/{task_id}", task)
        if result is None:  # None = 404, {} = sucesso (corpo vazio)
            return {"status": "error", "message": "Falha ao adicionar item de checklist"}

        return {"status": "ok", "item_id": new_item["id"], "message": f"Item adicionado: '{item_text}'"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def complete_checklist_item(task_id: str, project_id: str, item_id: str) -> dict:
    """Marca um item de checklist como concluído.

    Parâmetros:
        task_id    — ID da tarefa que contém o checklist.
        project_id — ID do projeto da tarefa.
        item_id    — ID do item de checklist a marcar como concluído.
    """
    try:
        task = _api_get(f"/project/{project_id}/task/{task_id}")
        if not task:
            return {"status": "error", "message": f"Tarefa não encontrada: {task_id}"}

        items = task.get("items", [])
        item_found = False
        for item in items:
            if item.get("id") == item_id:
                item["status"] = 2  # 2 = concluído no TickTick
                item_found = True
                break

        if not item_found:
            return {"status": "error", "message": f"Item de checklist não encontrado: {item_id}"}

        task["items"] = items
        result = _api_post(f"/task/{task_id}", task)
        if result is None:  # None = 404, {} = sucesso (corpo vazio)
            return {"status": "error", "message": "Falha ao atualizar checklist"}

        return {"status": "ok", "message": "Item de checklist concluído"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# TOOLS COMBINADAS — cross-agent: TickTick + BigQuery (Nami)
# Importam diretamente as funções de agents/nami/tools.py para manter o fluxo
# síncrono e evitar overhead de LLM. Não chamam o agente Nami — chamam as tools.
# ─────────────────────────────────────────────────────────────────────────────


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

    Retorna confirmação de ambas as operações ou detalhes do erro se alguma falhar.
    """
    # Importação local para evitar importação circular no nível do módulo
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

    # Passo 2: Lança a despesa no BigQuery via tools da Nami.
    # Executa mesmo se o TickTick falhou — as duas operações são independentes.
    try:
        name = transaction_name
        if not name:
            # Tenta obter o título da tarefa para usar como nome da transação
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

    # Status geral: "ok" apenas se as duas operações tiveram sucesso
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
    """
    try:
        # Inclui o valor na descrição para referência quando for completar depois
        full_description = description
        if amount > 0:
            full_description = f"Valor esperado: R${amount:.2f}. {description}".strip()

        return create_task(
            title=title,
            project_name=project_name,
            due_date=due_date,
            priority="Alta",  # lembretes de pagamento têm prioridade alta por padrão
            description=full_description,
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}
