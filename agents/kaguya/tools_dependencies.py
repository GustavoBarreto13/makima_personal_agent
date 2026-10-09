"""Dependências entre tarefas (spec 075): "esta só pode começar depois daquela".

Uma tarefa está **bloqueada** quando tem ao menos uma dependência cujo bloqueador ainda está
aberto e vivo. Concluir (ou excluir) o bloqueador a libera sozinha — não existe flag a manter.
Ciclos (A→B→A) são barrados aqui, como o anti-ciclo de ``parent_id``.

Tabela: ``task_dependencies(task_id, blocked_by_id)``.
"""

from __future__ import annotations

from agents.db import get_conn, run_select

# Limite defensivo da busca de ciclo (a árvore real nunca chega perto).
_MAX_DEPTH = 200


def _would_cycle(cur, task_id: int, blocked_by_id: int) -> bool:
    """Diz se criar ``task_id`` bloqueada por ``blocked_by_id`` fecharia um ciclo.

    Há ciclo quando ``task_id`` já é (direta ou indiretamente) bloqueadora de ``blocked_by_id``:
    caminha pelos bloqueadores de ``blocked_by_id`` procurando ``task_id``.
    """
    seen: set[int] = set()
    frontier = [blocked_by_id]
    for _ in range(_MAX_DEPTH):
        if not frontier:
            return False
        if task_id in frontier:
            return True
        seen.update(frontier)
        cur.execute(
            "SELECT blocked_by_id FROM task_dependencies WHERE task_id = ANY(%s)", (frontier,)
        )
        frontier = [r[0] for r in cur.fetchall() if r[0] not in seen]
    return True   # profundidade absurda: trata como ciclo, por segurança


def add_dependency(task_id: int, blocked_by_id: int) -> dict:
    """Faz ``task_id`` depender de ``blocked_by_id`` (só começa depois que a outra for concluída).

    Args:
        task_id: A tarefa que fica bloqueada.
        blocked_by_id: A tarefa que precisa terminar antes.

    Returns:
        ``{"status": "ok"}`` ou erro (tarefa inexistente/excluída, mesma tarefa, ciclo).
    """
    if task_id == blocked_by_id:
        return {"status": "error", "message": "Uma tarefa não pode depender dela mesma."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM tasks WHERE id = ANY(%s) AND deleted_at IS NULL",
                ([task_id, blocked_by_id],),
            )
            if cur.fetchone()[0] != 2:
                return {"status": "error", "message": "Tarefa não encontrada."}
            if _would_cycle(cur, task_id, blocked_by_id):
                return {"status": "error", "message": "Isso criaria uma dependência circular."}
            cur.execute(
                "INSERT INTO task_dependencies (task_id, blocked_by_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (task_id, blocked_by_id),
            )
    return {"status": "ok", "message": "Dependência criada."}


def remove_dependency(task_id: int, blocked_by_id: int) -> dict:
    """Remove a dependência entre duas tarefas (idempotente).

    Args:
        task_id: A tarefa que estava bloqueada.
        blocked_by_id: A tarefa que a bloqueava.

    Returns:
        ``{"status": "ok"}``.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM task_dependencies WHERE task_id = %s AND blocked_by_id = %s",
                (task_id, blocked_by_id),
            )
    return {"status": "ok", "message": "Dependência removida."}


def list_dependencies(task_id: int) -> dict:
    """Lista de quem a tarefa depende e quem depende dela.

    Args:
        task_id: Id da tarefa.

    Returns:
        ``{"blocked_by": [...], "blocking": [...], "is_blocked": bool}`` — cada item traz
        ``id``, ``title`` e ``completed`` (a tarefa já terminou?). ``is_blocked`` considera só
        os bloqueadores ainda abertos. **Listagem**.
    """
    blocked_by = run_select(
        """
        SELECT b.id, b.title, (b.completed_at IS NOT NULL) AS completed
          FROM task_dependencies d JOIN tasks b ON b.id = d.blocked_by_id
         WHERE d.task_id = %(id)s AND b.deleted_at IS NULL
         ORDER BY b.title
        """,
        {"id": task_id},
    )
    blocking = run_select(
        """
        SELECT t.id, t.title, (t.completed_at IS NOT NULL) AS completed
          FROM task_dependencies d JOIN tasks t ON t.id = d.task_id
         WHERE d.blocked_by_id = %(id)s AND t.deleted_at IS NULL
         ORDER BY t.title
        """,
        {"id": task_id},
    )
    return {
        "blocked_by": blocked_by,
        "blocking": blocking,
        "is_blocked": any(not b["completed"] for b in blocked_by),
    }


def blocked_task_ids(task_ids: list[int]) -> set[int]:
    """Subconjunto de ``task_ids`` que está bloqueado agora (para marcar as linhas das listas).

    Args:
        task_ids: Ids a verificar.

    Returns:
        Ids com pelo menos um bloqueador aberto e vivo.
    """
    if not task_ids:
        return set()
    rows = run_select(
        """
        SELECT DISTINCT d.task_id
          FROM task_dependencies d JOIN tasks b ON b.id = d.blocked_by_id
         WHERE d.task_id = ANY(%(ids)s) AND b.completed_at IS NULL AND b.deleted_at IS NULL
        """,
        {"ids": list(task_ids)},
    )
    return {r["task_id"] for r in rows}
