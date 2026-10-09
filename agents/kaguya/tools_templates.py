"""Duplicar e templates de tarefa e de lista (spec 075).

- **Duplicar** copia a árvore numa transação só (atômico): a cópia nasce aberta, sem Meu Dia, sem
  evento no Google, sem série/recorrência (para não gerar uma segunda série por engano).
- **Template** é um snapshot JSON reaplicável. Datas viram **deslocamentos em dias** a partir de hoje
  (``due_offset_days``), então "Viagem" aplicada em outro dia entrega prazos coerentes.

Tabelas: ``task_templates`` (``payload`` JSONB). Aplicar reutiliza ``create_task``/``create_project``.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from agents.db import get_conn, run_dml, run_select
from agents.kaguya import tools_projects as P
from agents.kaguya import tools_tasks as T
from agents.kaguya.tz import today_sp

_POSITION_STEP = 1000
# Campos de uma tarefa que um duplicado/snapshot carrega (sem estado de ciclo de vida).
_COPY_FIELDS = "title, description, type, priority, duration_min, gtd_status, context_id, waiting_note"


# ── Duplicar ──────────────────────────────────────────────────────────────────

def _copy_tree(cur, root_id: int, *, dest_project: int, dest_parent: Optional[int], column_map: dict,
               title_suffix: str = "") -> int:
    """Copia ``root_id`` e todos os descendentes vivos para ``dest_project`` (BFS). Devolve o id da nova raiz."""
    cur.execute(
        f"SELECT {_COPY_FIELDS}, due_date, due_time, column_id, id FROM tasks WHERE id = %s", (root_id,)
    )
    row = cur.fetchone()
    cur.execute(
        "SELECT COALESCE(MAX(position), 0) + %s FROM tasks WHERE project_id = %s AND parent_id IS NOT DISTINCT FROM %s",
        (_POSITION_STEP, dest_project, dest_parent),
    )
    position = cur.fetchone()[0]
    (title, desc, ttype, prio, dur, gtd, ctx, wnote, due, due_time, col, _old) = row
    new_col = column_map.get(col) if dest_parent is None else None
    cur.execute(
        """
        INSERT INTO tasks (project_id, column_id, parent_id, title, description, type, priority,
                           duration_min, gtd_status, context_id, waiting_note, due_date, due_time, position)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (dest_project, new_col, dest_parent, title + title_suffix, desc, ttype, prio, dur, gtd, ctx, wnote,
         due, due_time, position),
    )
    new_root = cur.fetchone()[0]
    cur.execute(
        "INSERT INTO task_tag_links (task_id, tag_id) SELECT %s, tag_id FROM task_tag_links WHERE task_id = %s "
        "ON CONFLICT DO NOTHING",
        (new_root, root_id),
    )
    cur.execute("SELECT id FROM tasks WHERE parent_id = %s AND deleted_at IS NULL ORDER BY position, id", (root_id,))
    for (child_id,) in cur.fetchall():
        _copy_tree(cur, child_id, dest_project=dest_project, dest_parent=new_root, column_map=column_map)
    return new_root


def duplicate_task(task_id: int) -> dict:
    """Duplica uma tarefa com todas as subtarefas, na mesma lista e coluna.

    Args:
        task_id: Tarefa a duplicar (qualquer nível; a cópia mantém o mesmo pai).

    Returns:
        ``{"status": "ok", "id": <nova>}`` ou erro.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT project_id, parent_id, column_id FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "Tarefa não encontrada."}
            project_id, parent_id, column_id = row
            new_id = _copy_tree(
                cur, task_id, dest_project=project_id, dest_parent=parent_id,
                column_map={column_id: column_id}, title_suffix=" (cópia)",
            )
            T._log_activity(cur, new_id, "created", to_value=project_id)
    return {"status": "ok", "id": new_id, "message": "Tarefa duplicada."}


def duplicate_project(project_id: int, include_tasks: bool = True) -> dict:
    """Duplica uma lista: nome com "(cópia)", mesmas colunas e — se ``include_tasks`` — as tarefas ABERTAS.

    Args:
        project_id: Lista a duplicar.
        include_tasks: Copiar as tarefas abertas (com subtarefas e tags).

    Returns:
        ``{"status": "ok", "id": <nova lista>}`` ou erro.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name, group_id, color, icon, context, review_interval_days, sequential, is_inbox "
                "FROM task_projects WHERE id = %s AND archived_at IS NULL AND deleted_at IS NULL",
                (project_id,),
            )
            src = cur.fetchone()
            if not src:
                return {"status": "error", "message": "Lista não encontrada."}
            name, group_id, color, icon, context, interval, sequential, is_inbox = src
            if is_inbox:
                return {"status": "error", "message": "O Inbox não pode ser duplicado."}
            cur.execute("SELECT COALESCE(MAX(position), 0) + %s FROM task_projects", (_POSITION_STEP,))
            position = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO task_projects (group_id, name, color, icon, context, review_interval_days, sequential, position) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (group_id, f"{name} (cópia)", color, icon, context, interval, sequential, position),
            )
            new_project = cur.fetchone()[0]
            column_map: dict = {}
            cur.execute(
                "SELECT id, name, is_done_column, position FROM task_columns WHERE project_id = %s ORDER BY position, id",
                (project_id,),
            )
            for old_id, cname, is_done, cpos in cur.fetchall():
                cur.execute(
                    "INSERT INTO task_columns (project_id, name, is_done_column, position) VALUES (%s, %s, %s, %s) RETURNING id",
                    (new_project, cname, is_done, cpos),
                )
                column_map[old_id] = cur.fetchone()[0]
            copied = 0
            if include_tasks:
                cur.execute(
                    "SELECT id FROM tasks WHERE project_id = %s AND parent_id IS NULL AND deleted_at IS NULL "
                    "AND completed_at IS NULL ORDER BY position, id",
                    (project_id,),
                )
                for (tid,) in cur.fetchall():
                    _copy_tree(cur, tid, dest_project=new_project, dest_parent=None, column_map=column_map)
                    copied += 1
    return {"status": "ok", "id": new_project, "tasks_copied": copied, "message": "Lista duplicada."}


# ── Templates ─────────────────────────────────────────────────────────────────

def _snapshot_task(task_id: int, today: date) -> Optional[dict]:
    """Árvore da tarefa como payload de template (datas viram deslocamento em dias a partir de hoje)."""
    rows = run_select(
        f"SELECT id, {_COPY_FIELDS}, due_date FROM tasks WHERE id = %(id)s AND deleted_at IS NULL", {"id": task_id}
    )
    if not rows:
        return None
    r = rows[0]
    tags = [t["name"] for t in run_select(
        "SELECT g.name FROM task_tag_links l JOIN task_tags g ON g.id = l.tag_id WHERE l.task_id = %(id)s ORDER BY g.name",
        {"id": task_id},
    )]
    children = run_select(
        "SELECT id FROM tasks WHERE parent_id = %(id)s AND deleted_at IS NULL ORDER BY position, id", {"id": task_id}
    )
    return {
        "title": r["title"], "description": r["description"], "type": r["type"], "priority": r["priority"],
        "duration_min": r["duration_min"], "tags": tags,
        "due_offset_days": (r["due_date"] - today).days if r["due_date"] else None,
        "subtasks": [s for c in children if (s := _snapshot_task(c["id"], today))],
    }


def create_task_template(task_id: int, name: str, space: Optional[str] = None) -> dict:
    """Salva uma tarefa (com subtarefas, tags e estimativa) como template reaplicável.

    Args:
        task_id: Tarefa de origem.
        name: Nome do template (único entre os templates de tarefa, ignorando caixa).
        space: ``work`` | ``personal``; padrão = espaço da lista da tarefa.

    Returns:
        ``{"status": "ok", "id": <template>}`` ou erro.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "Dê um nome ao template."}
    payload = _snapshot_task(task_id, today_sp())
    if payload is None:
        return {"status": "error", "message": "Tarefa não encontrada."}
    if space not in ("work", "personal"):
        space = (run_select(
            "SELECT p.context FROM tasks t JOIN task_projects p ON p.id = t.project_id WHERE t.id = %(id)s",
            {"id": task_id},
        ) or [{"context": "personal"}])[0]["context"]
    return _save_template("task", name.strip(), space, payload)


def create_project_template(project_id: int, name: str) -> dict:
    """Salva uma lista (colunas + tarefas abertas) como template reaplicável.

    Args:
        project_id: Lista de origem.
        name: Nome do template.

    Returns:
        ``{"status": "ok", "id": <template>}`` ou erro.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "Dê um nome ao template."}
    proj = run_select(
        "SELECT name, color, icon, context, review_interval_days, sequential FROM task_projects "
        "WHERE id = %(id)s AND archived_at IS NULL AND deleted_at IS NULL AND NOT is_inbox",
        {"id": project_id},
    )
    if not proj:
        return {"status": "error", "message": "Lista não encontrada."}
    today = today_sp()
    columns = run_select(
        "SELECT name, is_done_column FROM task_columns WHERE project_id = %(id)s ORDER BY position, id", {"id": project_id}
    )
    roots = run_select(
        "SELECT id FROM tasks WHERE project_id = %(id)s AND parent_id IS NULL AND deleted_at IS NULL "
        "AND completed_at IS NULL ORDER BY position, id",
        {"id": project_id},
    )
    p = proj[0]
    payload = {
        "name": p["name"], "color": p["color"], "icon": p["icon"],
        "review_interval_days": p["review_interval_days"], "sequential": bool(p["sequential"]),
        "columns": [{"name": c["name"], "is_done_column": bool(c["is_done_column"])} for c in columns],
        "tasks": [s for r in roots if (s := _snapshot_task(r["id"], today))],
    }
    return _save_template("project", name.strip(), p["context"], payload)


def _save_template(kind: str, name: str, space: str, payload: dict) -> dict:
    from psycopg2.extras import Json
    rows = run_select(
        "SELECT 1 FROM task_templates WHERE kind = %(k)s AND LOWER(name) = LOWER(%(n)s)", {"k": kind, "n": name}
    )
    if rows:
        return {"status": "error", "message": f"Já existe um template '{name}'."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO task_templates (kind, name, context, payload) VALUES (%s, %s, %s, %s) RETURNING id",
                (kind, name, space, Json(payload)),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"Template '{name}' salvo."}


def list_templates(kind: Optional[str] = None, space: Optional[str] = None) -> list[dict]:
    """Lista os templates (sem o payload pesado).

    Args:
        kind: ``task`` | ``project`` | ``None`` (todos).
        space: ``work`` | ``personal`` | ``None``.

    Returns:
        ``[{id, kind, name, context, created_at}]`` por nome. **Listagem**.
    """
    where, params = ["TRUE"], {}
    if kind in ("task", "project"):
        where.append("kind = %(k)s")
        params["k"] = kind
    if space in ("work", "personal"):
        where.append("context = %(s)s")
        params["s"] = space
    rows = run_select(
        f"SELECT id, kind, name, context, created_at FROM task_templates WHERE {' AND '.join(where)} ORDER BY LOWER(name)",
        params,
    )
    return [{**r, "created_at": r["created_at"].isoformat()} for r in rows]


def delete_template(template_id: int) -> dict:
    """Exclui um template.

    Args:
        template_id: Id do template.

    Returns:
        ``{"status": "ok"}`` ou erro.
    """
    if not run_dml("DELETE FROM task_templates WHERE id = %(id)s", {"id": template_id}):
        return {"status": "error", "message": "Template não encontrado."}
    return {"status": "ok", "message": "Template excluído."}


def _apply_task(node: dict, *, project_id: int, parent_id: Optional[int], base: date, column_id: Optional[int]) -> int:
    due = base + timedelta(days=node["due_offset_days"]) if node.get("due_offset_days") is not None else None
    created = T.create_task(
        title=node["title"], project_id=project_id, parent_id=parent_id, priority=node.get("priority") or 0,
        type=node.get("type") or "task", due_date=due.isoformat() if due else None,
        description=node.get("description"), tags=node.get("tags") or None,
        column_id=column_id if parent_id is None else None,
    )
    if created["status"] != "ok":
        raise ValueError(created["message"])
    new_id = created["id"]
    if node.get("duration_min"):
        T.update_task(new_id, duration_min=node["duration_min"])
    for sub in node.get("subtasks", []):
        _apply_task(sub, project_id=project_id, parent_id=new_id, base=base, column_id=None)
    return new_id


def apply_template(template_id: int, project_id: Optional[int] = None, name: Optional[str] = None,
                   base_date: Optional[str] = None) -> dict:
    """Aplica um template: cria a tarefa (em ``project_id``) ou a lista inteira.

    Args:
        template_id: Template a aplicar.
        project_id: Para template de tarefa: lista de destino (padrão: Inbox).
        name: Para template de lista: nome da nova lista (padrão: o do snapshot).
        base_date: Dia ``YYYY-MM-DD`` que vale como "hoje" nos deslocamentos (padrão: hoje).

    Returns:
        ``{"status": "ok", "id": <tarefa ou lista criada>}`` ou erro.
    """
    rows = run_select("SELECT kind, context, payload FROM task_templates WHERE id = %(id)s", {"id": template_id})
    if not rows:
        return {"status": "error", "message": "Template não encontrado."}
    kind, space, payload = rows[0]["kind"], rows[0]["context"], rows[0]["payload"]
    try:
        base = date.fromisoformat(base_date) if base_date else today_sp()
    except ValueError:
        return {"status": "error", "message": "Data base inválida: use YYYY-MM-DD."}
    try:
        if kind == "task":
            return {"status": "ok", "id": _apply_task(payload, project_id=project_id or _inbox_id(), parent_id=None,
                                                      base=base, column_id=None), "message": "Template aplicado."}
        created = P.create_project(name=(name or payload["name"]), color=payload.get("color"), icon=payload.get("icon"))
        if created["status"] != "ok":
            return created
        pid = created["id"]
        run_dml(
            "UPDATE task_projects SET context = %(c)s, review_interval_days = %(r)s, sequential = %(s)s WHERE id = %(id)s",
            {"c": space, "r": payload.get("review_interval_days"), "s": bool(payload.get("sequential")), "id": pid},
        )
        first_col = None
        for i, col in enumerate(payload.get("columns", [])):
            c = P.create_column(pid, col["name"], is_done_column=bool(col.get("is_done_column")))
            if i == 0 and c.get("status") == "ok":
                first_col = c["id"]
        for node in payload.get("tasks", []):
            _apply_task(node, project_id=pid, parent_id=None, base=base, column_id=first_col)
        return {"status": "ok", "id": pid, "message": "Template aplicado."}
    except ValueError as exc:
        return {"status": "error", "message": str(exc)}


def _inbox_id() -> int:
    return run_select("SELECT id FROM task_projects WHERE is_inbox LIMIT 1")[0]["id"]
