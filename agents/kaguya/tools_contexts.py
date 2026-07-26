"""Camada de lógica — contextos de execução dedicados das tarefas da Kaguya (spec 034).

Sexta peça da camada de lógica (junto de ``tools_tasks.py``, ``tools_projects.py``,
``tools_tags.py``, ``tools_filters.py`` e ``tools_views.py``). Mesmo padrão estrutural
de ``tools_tags.py`` (CRUD simples + nome único case-insensitive), mas contexto é campo
**dedicado** (coluna ``tasks.context_id``), não uma relação N:N — no máximo um contexto
por tarefa (data-model.md § "`task_contexts`").
"""

from typing import Optional

from agents.db import get_conn, run_select, run_dml

_POSITION_STEP = 1000


def list_contexts() -> list:
    """Lista os contextos, na ordem da sidebar (``position``).

    Returns:
        Lista de ``{id, name, icon, position}``. **Listagem**.
    """
    return run_select("SELECT id, name, icon, position FROM task_contexts ORDER BY position, id")


def create_context(name: str, icon: Optional[str] = None) -> dict:
    """Cria um contexto de execução (nome único, ignorando caixa).

    Args:
        name: Nome do contexto (ex.: "@casa").
        icon: Ícone opcional (emoji).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou erro se o nome já existir.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome do contexto não pode ser vazio."}
    exists = run_select(
        "SELECT 1 FROM task_contexts WHERE LOWER(name) = LOWER(%(n)s)", {"n": name.strip()}
    )
    if exists:
        return {"status": "error", "message": f"Já existe um contexto chamado '{name.strip()}'."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(position), 0) + %s FROM task_contexts", (_POSITION_STEP,))
            position = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO task_contexts (name, icon, position) VALUES (%s, %s, %s) RETURNING id",
                (name.strip(), icon, position),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"Contexto '{name.strip()}' criado."}


def update_context(
    context_id: int,
    name: Optional[str] = None,
    icon: Optional[str] = None,
    position: Optional[int] = None,
) -> dict:
    """Edita um contexto (PATCH parcial — só os campos enviados).

    Args:
        context_id: Id do contexto.
        name: Novo nome (opcional; valida unicidade contra os demais).
        icon: Novo ícone (opcional).
        position: Nova posição na sidebar (opcional).

    Returns:
        Dicionário de status.
    """
    sets, params = [], {"id": context_id}
    if name is not None:
        if not name.strip():
            return {"status": "error", "message": "O nome do contexto não pode ser vazio."}
        dup = run_select(
            "SELECT 1 FROM task_contexts WHERE LOWER(name) = LOWER(%(n)s) AND id <> %(id)s",
            {"n": name.strip(), "id": context_id},
        )
        if dup:
            return {"status": "error", "message": f"Já existe um contexto chamado '{name.strip()}'."}
        sets.append("name = %(name)s")
        params["name"] = name.strip()
    if icon is not None:
        sets.append("icon = %(icon)s")
        params["icon"] = icon
    if position is not None:
        sets.append("position = %(position)s")
        params["position"] = position
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    affected = run_dml(f"UPDATE task_contexts SET {', '.join(sets)} WHERE id = %(id)s", params)
    if affected == 0:
        return {"status": "error", "message": "Contexto não encontrado."}
    return {"status": "ok", "message": "Contexto atualizado."}


def delete_context(context_id: int) -> dict:
    """Exclui um contexto — as tarefas que o usavam **apenas** ficam sem contexto.

    ``ON DELETE SET NULL`` em ``tasks.context_id`` cuida da desassociação; nenhuma
    tarefa é apagada (FR-005).

    Args:
        context_id: Id do contexto a excluir.

    Returns:
        Dicionário de status.
    """
    affected = run_dml("DELETE FROM task_contexts WHERE id = %(id)s", {"id": context_id})
    if affected == 0:
        return {"status": "error", "message": "Contexto não encontrado."}
    return {"status": "ok", "message": "Contexto excluído."}
