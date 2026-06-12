"""Camada de lógica — listas (projetos), grupos e colunas de Kanban da Kaguya.

Este módulo é uma das duas metades da **camada de lógica única** do sistema de
tarefas (a outra é `tools_tasks.py`). Toda regra de negócio de listas/grupos/colunas
vive aqui; o canal Telegram (agente ADK) e o canal webapp (router FastAPI
`/api/tasks/*`) são fachadas finas e paritárias sobre estas funções (FR-002).

Convenções (iguais às tools da Nami):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem** retornam o dado direto (lista/dict sem "status").
    - Acesso ao banco via ``agents.db`` (psycopg2 síncrono).
    - Posições manuais são esparsas ×1000 (mesma ideia do Journal).

Contrato REST: ``specs/011-tasks-mvp/contracts/api-tasks.md``.
"""

from typing import Optional

from agents.db import get_conn, run_select, run_dml

# Incremento padrão entre posições manuais. Inserir um item entre dois vizinhos
# usa a média; só renumeramos quando a média colide (ver tools_tasks.reorder_task).
_POSITION_STEP = 1000


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos (não expostos como tools)
# ─────────────────────────────────────────────────────────────────────────────
def _get_inbox_id(cur) -> int:
    """Retorna o id do projeto Inbox usando um cursor já aberto.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação).

    Returns:
        O id (int) da lista Inbox (a única com ``is_inbox = TRUE``).

    Raises:
        RuntimeError: Se o Inbox não existir (schema não aplicado/seed ausente).
    """
    cur.execute("SELECT id FROM task_projects WHERE is_inbox LIMIT 1")
    row = cur.fetchone()
    if not row:
        # Sem Inbox o sistema não funciona — o seed do schema deveria tê-lo criado.
        raise RuntimeError("Inbox não encontrado — o schema/seed não foi aplicado.")
    return row[0]


def _next_position(cur, table: str, scope_col: Optional[str], scope_val) -> int:
    """Calcula a próxima posição esparsa (última + 1000) dentro de um escopo.

    Args:
        cur: Cursor psycopg2 ativo.
        table: Nome da tabela (``task_projects``, ``task_project_groups`` ou ``task_columns``).
        scope_col: Coluna que delimita o escopo (ex.: ``project_id`` p/ colunas) ou None.
        scope_val: Valor do escopo (ex.: o project_id) — ignorado se ``scope_col`` é None.

    Returns:
        Inteiro a usar como ``position`` do novo item.
    """
    # Monta o WHERE só quando há um escopo (colunas são por projeto; listas/grupos são globais).
    if scope_col:
        cur.execute(
            f"SELECT COALESCE(MAX(position), 0) + %s FROM {table} WHERE {scope_col} = %s",
            (_POSITION_STEP, scope_val),
        )
    else:
        cur.execute(f"SELECT COALESCE(MAX(position), 0) + %s FROM {table}", (_POSITION_STEP,))
    return cur.fetchone()[0]


def resolve_project_id_by_name(name: str) -> Optional[int]:
    """Resolve o id de uma lista pelo nome (exato, depois por prefixo, case-insensitive).

    Usado pelo agente quando o usuário cita uma lista por nome. O webapp já manda o id.

    Args:
        name: Nome (ou prefixo) da lista, como o usuário falou.

    Returns:
        O id da lista correspondente, ou None se nada casar.

    Example:
        >>> resolve_project_id_by_name("Inbox")  # doctest: +SKIP
        1
    """
    if not name or not name.strip():
        return None
    norm = name.strip().lower()
    # Busca entre listas vivas (não arquivadas). Match exato tem prioridade sobre prefixo.
    rows = run_select(
        """
        SELECT id, name FROM task_projects
        WHERE archived_at IS NULL
        ORDER BY position
        """
    )
    for r in rows:
        if r["name"].lower() == norm:
            return r["id"]
    for r in rows:
        if r["name"].lower().startswith(norm):
            return r["id"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Sidebar (listagem agregada)
# ─────────────────────────────────────────────────────────────────────────────
def get_sidebar() -> dict:
    """Monta o payload único da sidebar: grupos + listas + smart-lists salvas.

    Returns:
        Dicionário ``{"groups": [...], "projects": [...], "filters": [...]}`` onde cada
        projeto traz ``open_count`` (tarefas abertas) e ``has_board`` (tem ao menos uma
        coluna), e ``filters`` são as smart-lists salvas (fatia 013) para a seção própria
        da sidebar. Ordenado por ``position``; o Inbox sempre aparece (é uma lista normal
        com ``is_inbox = True``). É uma **listagem** — não tem campo "status".
    """
    # Import lazy: evita acoplar tools_projects a tools_filters no topo do módulo
    # (e qualquer surpresa de ordem de import na carga do pacote).
    from agents.kaguya.tools_filters import list_filters
    # Grupos ordenados pela posição manual.
    groups = run_select(
        "SELECT id, name, position FROM task_project_groups ORDER BY position, id"
    )

    # Listas vivas + contagem de tarefas abertas + se possuem board (subquery EXISTS).
    # COALESCE garante 0 quando a lista não tem tarefa aberta nenhuma.
    projects = run_select(
        """
        SELECT
            p.id, p.name, p.group_id, p.color, p.icon, p.is_inbox, p.position,
            EXISTS (SELECT 1 FROM task_columns c WHERE c.project_id = p.id) AS has_board,
            (
                SELECT COUNT(*) FROM tasks t
                WHERE t.project_id = p.id
                  AND t.deleted_at IS NULL
                  AND t.completed_at IS NULL
                  AND t.parent_id IS NULL          -- conta só tarefas-pai (subtarefas não inflam o número)
            ) AS open_count
        FROM task_projects p
        WHERE p.archived_at IS NULL
        ORDER BY p.is_inbox DESC, p.position, p.id   -- Inbox primeiro, depois por posição
        """
    )
    # Smart-lists salvas (fatia 013): a built-in "Hoje + Vencidas" é constante no front.
    return {"groups": groups, "projects": projects, "filters": list_filters()}


# ─────────────────────────────────────────────────────────────────────────────
# Grupos de listas
# ─────────────────────────────────────────────────────────────────────────────
def create_group(name: str) -> dict:
    """Cria um grupo de listas (pasta da sidebar).

    Args:
        name: Nome do grupo (ex.: "Pessoal").

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome do grupo não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            position = _next_position(cur, "task_project_groups", None, None)
            cur.execute(
                "INSERT INTO task_project_groups (name, position) VALUES (%s, %s) RETURNING id",
                (name.strip(), position),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"Grupo '{name.strip()}' criado."}


def update_group(group_id: int, name: Optional[str] = None, position: Optional[int] = None) -> dict:
    """Renomeia e/ou reordena um grupo.

    Args:
        group_id: Id do grupo.
        name: Novo nome (opcional).
        position: Nova posição manual (opcional).

    Returns:
        Dicionário de status. Erro se nada for informado ou o grupo não existir.
    """
    # Monta dinamicamente só os campos enviados (evita sobrescrever com NULL sem querer).
    sets, params = [], {"id": group_id}
    if name is not None:
        if not name.strip():
            return {"status": "error", "message": "O nome do grupo não pode ser vazio."}
        sets.append("name = %(name)s")
        params["name"] = name.strip()
    if position is not None:
        sets.append("position = %(position)s")
        params["position"] = position
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    affected = run_dml(f"UPDATE task_project_groups SET {', '.join(sets)} WHERE id = %(id)s", params)
    if affected == 0:
        return {"status": "error", "message": "Grupo não encontrado."}
    return {"status": "ok", "message": "Grupo atualizado."}


def delete_group(group_id: int) -> dict:
    """Exclui um grupo; as listas dele ficam sem grupo (``group_id = NULL``).

    A FK ``task_projects.group_id`` usa ``ON DELETE SET NULL``, então o próprio banco
    desvincula as listas — elas não são apagadas, só saem da pasta.

    Args:
        group_id: Id do grupo a excluir.

    Returns:
        Dicionário de status.
    """
    affected = run_dml("DELETE FROM task_project_groups WHERE id = %(id)s", {"id": group_id})
    if affected == 0:
        return {"status": "error", "message": "Grupo não encontrado."}
    return {"status": "ok", "message": "Grupo excluído; as listas dele ficaram sem grupo."}


# ─────────────────────────────────────────────────────────────────────────────
# Listas (projetos)
# ─────────────────────────────────────────────────────────────────────────────
def create_project(
    name: str,
    group_id: Optional[int] = None,
    color: Optional[str] = None,
    icon: Optional[str] = None,
) -> dict:
    """Cria uma lista (projeto).

    Args:
        name: Nome da lista.
        group_id: Grupo ao qual ela pertence (opcional).
        color: Cor de exibição (hex/oklch, opcional).
        icon: Emoji ou nome de ícone (opcional).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou erro.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome da lista não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            position = _next_position(cur, "task_projects", None, None)
            cur.execute(
                """
                INSERT INTO task_projects (name, group_id, color, icon, position)
                VALUES (%s, %s, %s, %s, %s) RETURNING id
                """,
                (name.strip(), group_id, color, icon, position),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"Lista '{name.strip()}' criada."}


def update_project(
    project_id: int,
    name: Optional[str] = None,
    group_id: Optional[int] = None,
    color: Optional[str] = None,
    icon: Optional[str] = None,
    position: Optional[int] = None,
) -> dict:
    """Renomeia, move de grupo, recolore ou reordena uma lista.

    Observação: passar ``group_id`` explicitamente como None não desvincula (porque o
    default já é None). Para "tirar do grupo" use a UI de mover; aqui só atualizamos o
    que vier diferente de None — comportamento seguro para edição parcial (PATCH).

    Args:
        project_id: Id da lista.
        name/group_id/color/icon/position: Campos a atualizar (todos opcionais).

    Returns:
        Dicionário de status.
    """
    sets, params = [], {"id": project_id}
    if name is not None:
        if not name.strip():
            return {"status": "error", "message": "O nome da lista não pode ser vazio."}
        sets.append("name = %(name)s")
        params["name"] = name.strip()
    if group_id is not None:
        sets.append("group_id = %(group_id)s")
        params["group_id"] = group_id
    if color is not None:
        sets.append("color = %(color)s")
        params["color"] = color
    if icon is not None:
        sets.append("icon = %(icon)s")
        params["icon"] = icon
    if position is not None:
        sets.append("position = %(position)s")
        params["position"] = position
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    affected = run_dml(f"UPDATE task_projects SET {', '.join(sets)} WHERE id = %(id)s", params)
    if affected == 0:
        return {"status": "error", "message": "Lista não encontrada."}
    return {"status": "ok", "message": "Lista atualizada."}


def delete_project(project_id: int, mode: str) -> dict:
    """Exclui uma lista, decidindo o destino das tarefas dela.

    Soft delete da lista (``archived_at``) — consistente com o princípio de soft delete
    do repo. As **colunas** do board são apagadas de fato (hard DELETE), pois são
    específicas da lista. O Inbox nunca pode ser excluído.

    Args:
        project_id: Id da lista a excluir.
        mode: ``"move_to_inbox"`` (tarefas vão para o Inbox, sem coluna) ou
            ``"delete_tasks"`` (tarefas viram lixeira via soft delete).

    Returns:
        Dicionário de status. Erro se for o Inbox, ``mode`` inválido ou lista inexistente.
    """
    if mode not in ("move_to_inbox", "delete_tasks"):
        return {"status": "error", "message": "Modo inválido: use 'move_to_inbox' ou 'delete_tasks'."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Confirma que a lista existe e não é o Inbox (indelével).
            cur.execute(
                "SELECT is_inbox, archived_at FROM task_projects WHERE id = %s", (project_id,)
            )
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "Lista não encontrada."}
            if row[0]:  # is_inbox
                return {"status": "error", "message": "O Inbox não pode ser excluído."}

            if mode == "move_to_inbox":
                inbox_id = _get_inbox_id(cur)
                # Reaponta TODAS as tarefas da lista para o Inbox e limpa a coluna
                # (o Inbox não tem board). Inclui concluídas/lixeira para não deixar
                # referências órfãs à lista arquivada.
                cur.execute(
                    "UPDATE tasks SET project_id = %s, column_id = NULL, updated_at = now() WHERE project_id = %s",
                    (inbox_id, project_id),
                )
                moved = cur.rowcount
                detail = f"{moved} tarefa(s) movida(s) para o Inbox"
            else:  # delete_tasks
                # Soft delete das tarefas vivas (vão para a lixeira, restauráveis).
                cur.execute(
                    "UPDATE tasks SET deleted_at = now(), updated_at = now() "
                    "WHERE project_id = %s AND deleted_at IS NULL",
                    (project_id,),
                )
                deleted = cur.rowcount
                detail = f"{deleted} tarefa(s) enviada(s) para a lixeira"

            # As colunas do board são removidas de fato (não fazem sentido sem a lista).
            cur.execute("DELETE FROM task_columns WHERE project_id = %s", (project_id,))
            # A lista é arquivada (soft delete) — some das views, preserva o histórico.
            cur.execute("UPDATE task_projects SET archived_at = now() WHERE id = %s", (project_id,))

    return {"status": "ok", "message": f"Lista excluída ({detail})."}


# ─────────────────────────────────────────────────────────────────────────────
# Colunas de Kanban
# ─────────────────────────────────────────────────────────────────────────────
def list_columns(project_id: int) -> list[dict]:
    """Lista as colunas do board de uma lista, ordenadas por posição.

    Args:
        project_id: Id da lista.

    Returns:
        Lista de dicionários (vazia se a lista não tem board). É uma **listagem**.
    """
    return run_select(
        """
        SELECT id, project_id, name, position, is_done_column
        FROM task_columns WHERE project_id = %(pid)s ORDER BY position, id
        """,
        {"pid": project_id},
    )


def create_column(project_id: int, name: str, is_done_column: bool = False) -> dict:
    """Cria uma coluna no board de uma lista (a primeira coluna ativa o Kanban).

    Garante no máximo uma coluna "concluído" por lista: se ``is_done_column`` for True
    e já existir uma, retorna erro (a UI deve desmarcar a antiga primeiro).

    Args:
        project_id: Id da lista dona do board.
        name: Nome da coluna.
        is_done_column: Se True, soltar um card aqui completa a tarefa.

    Returns:
        ``{"status": "ok", "id": <int>}`` ou erro.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome da coluna não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Confirma que a lista existe antes de criar a coluna.
            cur.execute("SELECT 1 FROM task_projects WHERE id = %s", (project_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Lista não encontrada."}
            if is_done_column:
                cur.execute(
                    "SELECT 1 FROM task_columns WHERE project_id = %s AND is_done_column", (project_id,)
                )
                if cur.fetchone():
                    return {"status": "error", "message": "Já existe uma coluna 'concluído' nesta lista."}
            position = _next_position(cur, "task_columns", "project_id", project_id)
            cur.execute(
                """
                INSERT INTO task_columns (project_id, name, is_done_column, position)
                VALUES (%s, %s, %s, %s) RETURNING id
                """,
                (project_id, name.strip(), is_done_column, position),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"Coluna '{name.strip()}' criada."}


def update_column(
    column_id: int,
    name: Optional[str] = None,
    position: Optional[int] = None,
    is_done_column: Optional[bool] = None,
) -> dict:
    """Renomeia, reordena ou marca/desmarca uma coluna como "concluído".

    Ao marcar como done, valida a unicidade (no máximo uma done por lista).

    Args:
        column_id: Id da coluna.
        name/position/is_done_column: Campos a atualizar (todos opcionais).

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT project_id FROM task_columns WHERE id = %s", (column_id,))
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "Coluna não encontrada."}
            project_id = row[0]

            sets, params = [], {"id": column_id}
            if name is not None:
                if not name.strip():
                    return {"status": "error", "message": "O nome da coluna não pode ser vazio."}
                sets.append("name = %(name)s")
                params["name"] = name.strip()
            if position is not None:
                sets.append("position = %(position)s")
                params["position"] = position
            if is_done_column is not None:
                if is_done_column:
                    # Verifica se já há outra coluna done na mesma lista (ignorando esta).
                    cur.execute(
                        "SELECT 1 FROM task_columns WHERE project_id = %s AND is_done_column AND id <> %s",
                        (project_id, column_id),
                    )
                    if cur.fetchone():
                        return {"status": "error", "message": "Já existe uma coluna 'concluído' nesta lista."}
                sets.append("is_done_column = %(done)s")
                params["done"] = is_done_column
            if not sets:
                return {"status": "error", "message": "Nada para atualizar."}

            cur.execute(f"UPDATE task_columns SET {', '.join(sets)} WHERE id = %(id)s", params)
    return {"status": "ok", "message": "Coluna atualizada."}


def delete_column(column_id: int) -> dict:
    """Exclui uma coluna; as tarefas dela ficam sem coluna (``column_id = NULL``).

    A FK ``tasks.column_id`` usa ``ON DELETE SET NULL`` — as tarefas não são apagadas,
    só perdem a coluna e voltam a aparecer apenas na lista.

    Args:
        column_id: Id da coluna a excluir.

    Returns:
        Dicionário de status.
    """
    affected = run_dml("DELETE FROM task_columns WHERE id = %(id)s", {"id": column_id})
    if affected == 0:
        return {"status": "error", "message": "Coluna não encontrada."}
    return {"status": "ok", "message": "Coluna excluída; as tarefas dela ficaram sem coluna."}
