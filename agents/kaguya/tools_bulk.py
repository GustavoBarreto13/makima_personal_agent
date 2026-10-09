"""Edição em massa de tarefas (spec 075) — uma transação só, com snapshot para "Desfazer".

``bulk_update_tasks`` aplica UMA ação a vários ids e devolve ``undo``: um snapshot JSON do estado
anterior que ``undo_bulk_update`` sabe reverter. Tudo-ou-nada: se qualquer id falhar, nada muda.

Ações: ``complete`` · ``reopen`` · ``delete`` · ``set_project`` · ``set_priority`` · ``set_due_date`` ·
``set_start_date`` · ``add_tag`` · ``remove_tag`` · ``add_to_my_day`` · ``remove_from_my_day``.
"""

from __future__ import annotations

from typing import Any, Optional

from agents.db import get_conn
from agents.kaguya import tools_tasks as T

# Campos escalares que o snapshot sabe guardar e restaurar (allowlist: nunca interpola nome vindo de fora).
_RESTORABLE = {
    "project_id", "column_id", "priority", "due_date", "due_time", "start_date", "my_day_date",
}

ACTIONS = (
    "complete", "reopen", "delete", "set_project", "set_priority", "set_due_date",
    "set_start_date", "add_tag", "remove_tag", "add_to_my_day", "remove_from_my_day",
)


def _iso(v: Any) -> Any:
    """Valores de data/hora do banco → texto, para o snapshot ser JSON."""
    return v.isoformat() if hasattr(v, "isoformat") else v


def _snapshot(cur, ids: list[int], fields: tuple[str, ...]) -> list[dict]:
    """Guarda o valor atual de ``fields`` (allowlist) para cada tarefa em ``ids``."""
    assert set(fields) <= _RESTORABLE, fields
    cur.execute(f"SELECT id, {', '.join(fields)} FROM tasks WHERE id = ANY(%s)", (ids,))
    return [{"id": r[0], **{f: _iso(v) for f, v in zip(fields, r[1:])}} for r in cur.fetchall()]


def bulk_update_tasks(task_ids: list[int], action: str, value: Any = None) -> dict:
    """Aplica ``action`` a todas as ``task_ids`` numa única transação.

    Args:
        task_ids: Tarefas-alvo (sem repetição; precisam existir e estar vivas).
        action: Uma de :data:`ACTIONS`.
        value: Parâmetro da ação — ``set_project``: id da lista; ``set_priority``: 0–3;
            ``set_due_date``/``set_start_date``/``add_to_my_day``: ``YYYY-MM-DD`` (ou ``None``:
            limpa a data / usa hoje no Meu Dia); ``add_tag``/``remove_tag``: nome da tag.

    Returns:
        ``{"status": "ok", "affected": n, "undo": {...}}`` — passe ``undo`` a
        :func:`undo_bulk_update` para reverter — ou ``{"status": "error", "message": ...}``.
    """
    ids = sorted({int(i) for i in task_ids})
    if not ids:
        return {"status": "error", "message": "Nenhuma tarefa selecionada."}
    if action not in ACTIONS:
        return {"status": "error", "message": f"Ação inválida: use uma de {', '.join(ACTIONS)}."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM tasks WHERE id = ANY(%s) AND deleted_at IS NULL", (ids,))
            if len(cur.fetchall()) != len(ids):
                return {"status": "error", "message": "Alguma tarefa não foi encontrada."}
            result = _apply(cur, ids, action, value)
            if result["status"] == "error":
                conn.rollback()
                return result
    _sync_calendar(ids, action, result)
    result["affected"] = len(ids)
    return result


def _apply(cur, ids: list[int], action: str, value: Any) -> dict:
    """Executa a ação no cursor aberto e devolve ``{"status", "undo"}``."""
    if action == "complete":
        pairs, done = [], []          # pairs: [original, ocorrência gerada] das recorrentes
        for tid in ids:
            res = T._complete_task_on_cursor(cur, tid, cascade=True)
            if res["status"] == "error":
                return res
            done.append(tid)
            if res.get("generated_task_id"):
                pairs.append([tid, res["generated_task_id"]])
        return {"status": "ok", "undo": {
            "kind": "reopen", "ids": done, "pairs": pairs, "generated": [g for _, g in pairs]}}

    if action == "reopen":
        cur.execute(
            "UPDATE tasks SET completed_at = NULL, updated_at = now() "
            "WHERE id = ANY(%s) AND completed_at IS NOT NULL RETURNING id",
            (ids,),
        )
        reopened = [r[0] for r in cur.fetchall()]
        for tid in reopened:
            T._log_activity(cur, tid, "reopened")
        return {"status": "ok", "undo": {"kind": "complete", "ids": reopened}}

    if action == "delete":
        for tid in ids:
            cur.execute(
                T._DESCENDANTS_CTE + "UPDATE tasks SET deleted_at = now(), updated_at = now() "
                "WHERE (id = %s OR id IN (SELECT id FROM d)) AND deleted_at IS NULL",
                (tid, tid),
            )
            T._log_activity(cur, tid, "deleted")
        return {"status": "ok", "undo": {"kind": "restore", "ids": ids}}

    if action == "set_project":
        try:
            project_id = int(value)
        except (TypeError, ValueError):
            return {"status": "error", "message": "Informe a lista de destino."}
        cur.execute(
            "SELECT 1 FROM task_projects WHERE id = %s AND archived_at IS NULL AND deleted_at IS NULL",
            (project_id,),
        )
        if not cur.fetchone():
            return {"status": "error", "message": "Lista de destino não encontrada."}
        snap = _snapshot(cur, ids, ("project_id", "column_id"))
        first_col = T._first_column_id(cur, project_id)
        cur.execute(
            T._DESCENDANTS_CTE.replace("parent_id = %s", "parent_id = ANY(%s)")
            + "UPDATE tasks SET project_id = %s, updated_at = now() WHERE id IN (SELECT id FROM d)",
            (ids, project_id),
        )
        cur.execute(
            "UPDATE tasks SET project_id = %s, column_id = %s, updated_at = now() WHERE id = ANY(%s)",
            (project_id, first_col, ids),
        )
        for s in snap:
            if s["project_id"] != project_id:
                T._log_activity(cur, s["id"], "moved", from_value=s["project_id"], to_value=project_id)
        return {"status": "ok", "undo": {"kind": "restore_fields", "rows": snap, "cascade_project": True}}

    if action == "set_priority":
        if value not in (0, 1, 2, 3):
            return {"status": "error", "message": "Prioridade inválida (use 0, 1, 2 ou 3)."}
        snap = _snapshot(cur, ids, ("priority",))
        cur.execute("UPDATE tasks SET priority = %s, updated_at = now() WHERE id = ANY(%s)", (value, ids))
        return {"status": "ok", "undo": {"kind": "restore_fields", "rows": snap}}

    if action == "set_due_date":
        snap = _snapshot(cur, ids, ("due_date", "due_time"))
        # Sem data, a hora cai junto (CHECK: due_time exige due_date).
        cur.execute(
            "UPDATE tasks SET due_date = %s, due_time = CASE WHEN %s::date IS NULL THEN NULL ELSE due_time END, "
            "due_reminder_sent_at = NULL, updated_at = now() WHERE id = ANY(%s)",
            (value, value, ids),
        )
        for s in snap:
            if s["due_date"] != value:
                T._log_activity(cur, s["id"], "rescheduled", from_value=s["due_date"], to_value=value)
        return {"status": "ok", "undo": {"kind": "restore_fields", "rows": snap}}

    if action == "set_start_date":
        snap = _snapshot(cur, ids, ("start_date",))
        cur.execute(
            "UPDATE tasks SET start_date = %s, updated_at = now() WHERE id = ANY(%s) "
            "AND (%s::date IS NULL OR due_date IS NULL OR due_date >= %s::date)",
            (value, ids, value, value),
        )
        if cur.rowcount != len(ids):
            return {"status": "error", "message": "A data de início não pode ser depois do vencimento."}
        for tid in ids:
            T._log_activity(cur, tid, "deferred", to_value=value)
        return {"status": "ok", "undo": {"kind": "restore_fields", "rows": snap}}

    if action in ("add_tag", "remove_tag"):
        name = (value or "").strip()
        if not name:
            return {"status": "error", "message": "Informe a tag."}
        cur.execute("SELECT task_id, tag_id FROM task_tag_links WHERE task_id = ANY(%s)", (ids,))
        before = [[r[0], r[1]] for r in cur.fetchall()]
        for tid in ids:
            cur.execute("SELECT g.name FROM task_tag_links l JOIN task_tags g ON g.id = l.tag_id WHERE l.task_id = %s", (tid,))
            names = [r[0] for r in cur.fetchall()]
            lowered = {n.lower() for n in names}
            if action == "add_tag" and name.lower() not in lowered:
                names.append(name)
            elif action == "remove_tag":
                names = [n for n in names if n.lower() != name.lower()]
            else:
                continue
            T._set_task_tags(cur, tid, names)
        return {"status": "ok", "undo": {"kind": "restore_tag_links", "ids": ids, "links": before}}

    if action in ("add_to_my_day", "remove_from_my_day"):
        snap = _snapshot(cur, ids, ("my_day_date",))
        target = None
        if action == "add_to_my_day":
            target = value or T._today_sp().isoformat()
        cur.execute("UPDATE tasks SET my_day_date = %s, updated_at = now() WHERE id = ANY(%s)", (target, ids))
        for s in snap:
            T._log_activity(cur, s["id"], "my_day_in" if target else "my_day_out",
                            from_value=s["my_day_date"], to_value=target)
        return {"status": "ok", "undo": {"kind": "restore_fields", "rows": snap}}

    return {"status": "error", "message": "Ação não implementada."}


def _sync_calendar(ids: list[int], action: str, result: dict) -> None:
    """Espelha no Google Calendar (best-effort, fora da transação) as tarefas afetadas."""
    try:
        from agents.kaguya import gcal_sync as _gs
        if action == "delete":
            for tid in ids:
                _gs.remove_task_event(tid)
            return
        touched = list(ids) + list(result.get("undo", {}).get("generated", []))
        for tid in touched:
            _gs.push_task(tid)
    except Exception:  # noqa: BLE001 — espelho é acessório
        pass


def undo_bulk_update(undo: dict) -> dict:
    """Reverte uma ação em massa a partir do ``undo`` devolvido por :func:`bulk_update_tasks`.

    Args:
        undo: O snapshot (``kind`` + dados). Só aceita os tipos que a própria função gera.

    Returns:
        ``{"status": "ok"}`` ou erro.
    """
    kind = (undo or {}).get("kind")
    with get_conn() as conn:
        with conn.cursor() as cur:
            if kind == "reopen":
                cur.execute("UPDATE tasks SET completed_at = NULL, updated_at = now() WHERE id = ANY(%s)", (undo["ids"],))
                for tid, gid in undo.get("pairs", []):
                    # A ocorrência que a conclusão gerou volta para a lixeira (a série não duplica)
                    # e a regra de recorrência retorna à tarefa original.
                    cur.execute("UPDATE tasks SET deleted_at = now(), updated_at = now() WHERE id = %s", (gid,))
                    cur.execute("UPDATE task_recurrences SET task_id = %s WHERE task_id = %s", (tid, gid))
            elif kind == "complete":
                for tid in undo["ids"]:
                    T._complete_task_on_cursor(cur, tid, cascade=True)
            elif kind == "restore":
                for tid in undo["ids"]:
                    cur.execute("SELECT deleted_at FROM tasks WHERE id = %s", (tid,))
                    row = cur.fetchone()
                    if row and row[0] is not None:
                        cur.execute(
                            "WITH RECURSIVE d AS (SELECT id FROM tasks WHERE parent_id = %s AND deleted_at = %s "
                            "UNION ALL SELECT t.id FROM tasks t JOIN d ON t.parent_id = d.id WHERE t.deleted_at = %s) "
                            "UPDATE tasks SET deleted_at = NULL, updated_at = now() WHERE id = %s OR id IN (SELECT id FROM d)",
                            (tid, row[0], row[0], tid),
                        )
            elif kind == "restore_fields":
                for row in undo["rows"]:
                    fields = [f for f in row if f != "id" and f in _RESTORABLE]
                    if fields:
                        sets = ", ".join(f"{f} = %s" for f in fields)
                        cur.execute(
                            f"UPDATE tasks SET {sets}, updated_at = now() WHERE id = %s",
                            [row[f] for f in fields] + [row["id"]],
                        )
                if undo.get("cascade_project"):
                    for row in undo["rows"]:
                        cur.execute(
                            T._DESCENDANTS_CTE + "UPDATE tasks SET project_id = %s WHERE id IN (SELECT id FROM d)",
                            (row["id"], row["project_id"]),
                        )
            elif kind == "restore_tag_links":
                cur.execute("DELETE FROM task_tag_links WHERE task_id = ANY(%s)", (undo["ids"],))
                for tid, tag_id in undo["links"]:
                    cur.execute(
                        "INSERT INTO task_tag_links (task_id, tag_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (tid, tag_id),
                    )
            else:
                return {"status": "error", "message": "Desfazer inválido."}
    _sync_calendar(list(undo.get("ids") or [r["id"] for r in undo.get("rows", [])]), "undo", {})
    return {"status": "ok", "message": "Alteração desfeita."}
