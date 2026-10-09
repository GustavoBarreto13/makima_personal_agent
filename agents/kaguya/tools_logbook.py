"""Logbook de concluídas, atividade por tarefa e lixeira completa (spec 075).

- **Logbook**: o que foi concluído, por dia LOCAL (America/Sao_Paulo), com filtro de espaço/lista/busca.
- **Atividade**: a linha do tempo de uma tarefa (``task_activity``): criada, reagendada, no Meu Dia…
- **Lixeira**: só as raízes excluídas (uma árvore excluída conta uma vez), com a lista de origem, a data
  e quantos descendentes saíram junto; restaurar em lote, excluir de vez e esvaziar.
"""

from __future__ import annotations

from typing import Optional

from agents.db import get_conn, run_select
from agents.kaguya import tools_tasks as T

_DAY_LOCAL = "(t.completed_at AT TIME ZONE 'America/Sao_Paulo')::date"


def list_completed(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    space: Optional[str] = None,
    project_id: Optional[int] = None,
    query: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """Lista as tarefas concluídas (logbook), da mais recente para a mais antiga.

    Args:
        start_date / end_date: Dia local inicial/final inclusivo (``YYYY-MM-DD``).
        space: ``work`` | ``personal`` (espaço da lista da tarefa); ``None`` = todos.
        project_id: Só desta lista.
        query: Texto no título ou nas notas.
        limit / offset: Paginação (``limit`` máx. 500).

    Returns:
        ``{"items": [...], "total": n, "by_day": {"YYYY-MM-DD": n}}``. Cada item traz
        ``completed_day`` (dia local), ``project_name`` e ``context``. **Listagem**.
    """
    where = ["t.deleted_at IS NULL", "t.completed_at IS NOT NULL"]
    params: dict = {}
    if start_date:
        where.append(f"{_DAY_LOCAL} >= %(a)s")
        params["a"] = start_date
    if end_date:
        where.append(f"{_DAY_LOCAL} <= %(b)s")
        params["b"] = end_date
    if space in ("work", "personal"):
        where.append("p.context = %(space)s")
        params["space"] = space
    if project_id is not None:
        where.append("t.project_id = %(pid)s")
        params["pid"] = project_id
    if query and query.strip():
        where.append("(t.title ILIKE %(q)s OR t.description ILIKE %(q)s)")
        params["q"] = f"%{query.strip()}%"
    where_sql = " AND ".join(where)

    total = run_select(
        f"SELECT COUNT(*) AS n FROM tasks t JOIN task_projects p ON p.id = t.project_id WHERE {where_sql}", params
    )[0]["n"]
    by_day_rows = run_select(
        f"SELECT {_DAY_LOCAL} AS day, COUNT(*) AS n FROM tasks t JOIN task_projects p ON p.id = t.project_id "
        f"WHERE {where_sql} GROUP BY 1 ORDER BY 1 DESC",
        params,
    )
    rows = run_select(
        f"""
        SELECT {T._qualified("t")}, p.name AS project_name, p.context, mae.title AS parent_title,
               {_DAY_LOCAL} AS completed_day
          FROM tasks t
          JOIN task_projects p ON p.id = t.project_id
          LEFT JOIN tasks mae ON mae.id = t.parent_id
         WHERE {where_sql}
         ORDER BY t.completed_at DESC, t.id DESC
         LIMIT %(limit)s OFFSET %(offset)s
        """,
        {**params, "limit": max(1, min(int(limit), 500)), "offset": max(0, int(offset))},
    )
    items = []
    for r in rows:
        item = T._serialize_task(r)
        item["project_name"] = r["project_name"]
        item["context"] = r["context"] or "personal"
        item["parent_title"] = r["parent_title"]
        item["completed_day"] = r["completed_day"].isoformat()
        items.append(item)
    return {
        "items": items,
        "total": int(total),
        "by_day": {r["day"].isoformat(): int(r["n"]) for r in by_day_rows},
    }


def get_task_activity(task_id: int, limit: int = 100) -> list[dict]:
    """Linha do tempo de uma tarefa (mais recente primeiro).

    Args:
        task_id: Id da tarefa.
        limit: Máximo de eventos (padrão 100).

    Returns:
        ``[{"kind", "from_value", "to_value", "at"}, ...]``. **Listagem**.
    """
    rows = run_select(
        "SELECT kind, from_value, to_value, at FROM task_activity WHERE task_id = %(id)s "
        "ORDER BY at DESC, id DESC LIMIT %(n)s",
        {"id": task_id, "n": max(1, min(int(limit), 500))},
    )
    return [{**r, "at": r["at"].isoformat()} for r in rows]


# ── Lixeira ────────────────────────────────────────────────────────────────

_TRASH_ROOTS = """
    t.deleted_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tasks par WHERE par.id = t.parent_id AND par.deleted_at = t.deleted_at)
"""


def list_trash_detailed(space: Optional[str] = None, project_id: Optional[int] = None) -> list[dict]:
    """Lixeira por árvore: cada tarefa excluída (raiz) com origem, data e nº de descendentes.

    Args:
        space: ``work`` | ``personal`` para filtrar pela lista de origem.
        project_id: Só desta lista.

    Returns:
        Tarefas serializadas + ``project_name``, ``context``, ``descendants``; mais recentes primeiro.
        **Listagem**.
    """
    where = [_TRASH_ROOTS]
    params: dict = {}
    if space in ("work", "personal"):
        where.append("p.context = %(space)s")
        params["space"] = space
    if project_id is not None:
        where.append("t.project_id = %(pid)s")
        params["pid"] = project_id
    rows = run_select(
        f"""
        SELECT {T._qualified("t")}, p.name AS project_name, p.context,
               (WITH RECURSIVE d AS (
                    SELECT c.id FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at = t.deleted_at
                    UNION ALL
                    SELECT x.id FROM tasks x JOIN d ON x.parent_id = d.id WHERE x.deleted_at = t.deleted_at
                ) SELECT COUNT(*) FROM d) AS descendants
          FROM tasks t JOIN task_projects p ON p.id = t.project_id
         WHERE {' AND '.join(where)}
         ORDER BY t.deleted_at DESC, t.id DESC
        """,
        params,
    )
    out = []
    for r in rows:
        item = T._serialize_task(r)
        item["project_name"] = r["project_name"]
        item["context"] = r["context"] or "personal"
        item["descendants"] = int(r["descendants"])
        out.append(item)
    return out


def restore_many(task_ids: list[int]) -> dict:
    """Restaura várias árvores da lixeira (cada uma traz de volta só o que saiu junto com ela).

    Args:
        task_ids: Raízes a restaurar.

    Returns:
        ``{"status": "ok", "restored": n}``.
    """
    restored = 0
    for tid in task_ids:
        if T.restore_task(int(tid)).get("status") == "ok":
            restored += 1
    return {"status": "ok", "restored": restored, "message": f"{restored} tarefa(s) restaurada(s)."}


def purge_tasks(task_ids: list[int]) -> dict:
    """Exclui DE VEZ tarefas que já estão na lixeira (irreversível; descendentes vão junto).

    Só toca em tarefas com ``deleted_at`` preenchido — uma tarefa viva nunca é apagada por aqui.

    Args:
        task_ids: Raízes na lixeira.

    Returns:
        ``{"status": "ok", "purged": n}``.
    """
    ids = sorted({int(i) for i in task_ids})
    if not ids:
        return {"status": "error", "message": "Nenhuma tarefa informada."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            # FK parent_id é ON DELETE CASCADE: apagar a raiz leva os descendentes (e tags/atividade).
            cur.execute("DELETE FROM tasks WHERE id = ANY(%s) AND deleted_at IS NOT NULL", (ids,))
            purged = cur.rowcount
    return {"status": "ok", "purged": purged, "message": f"{purged} tarefa(s) excluída(s) de vez."}


def empty_trash(older_than_days: Optional[int] = None) -> dict:
    """Esvazia a lixeira (opcionalmente só o que está lá há mais de N dias). Irreversível.

    Args:
        older_than_days: Se informado, só purga o excluído há mais que isso.

    Returns:
        ``{"status": "ok", "purged": n}``.
    """
    sql = "DELETE FROM tasks WHERE deleted_at IS NOT NULL"
    params: list = []
    if older_than_days is not None:
        sql += " AND deleted_at < now() - make_interval(days => %s)"
        params.append(int(older_than_days))
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            purged = cur.rowcount
    return {"status": "ok", "purged": purged, "message": f"Lixeira esvaziada ({purged})."}
