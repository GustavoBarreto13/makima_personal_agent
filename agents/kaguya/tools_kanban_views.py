"""Camada de lógica — views de Kanban configuráveis da Kaguya (spec 024).

Views salvas e nomeadas, **globais** (sem ``project_id``) e reutilizáveis em qualquer
board. Cada view captura:
    - ``display``: configuração de exibição — quais adornos aparecem (capacity meter,
      anel de subtarefas, rodapé-resumo, chips do card) e quais métricas vão nos 3
      slots do rodapé;
    - ``filter``: um ``FilterRules`` opcional (mesmo DSL das smart-lists), avaliado
      por ``tools_filters._build_where_from_rules`` — **sem motor de filtro novo**.

A view built-in **"Completa"** (``is_builtin = TRUE``) é semeada pelo schema e é
imutável: não pode ser editada nem deletada (R8/R22 da spec).

Convenções (iguais às outras tools da Kaguya):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem** retornam o dado direto (lista/dict, sem "status").
    - Acesso ao banco via ``agents.db`` (psycopg2 síncrono); ``Json`` adapta dict → JSONB.
"""

from typing import Optional

from psycopg2.extras import Json

from agents.db import get_conn, run_select, run_dml

# Reuso do motor de filtros das smart-lists (mesmo DSL) — sem ciclo: tools_filters
# não importa este módulo.
from agents.kaguya.tools_filters import _validate_rules, _build_where_from_rules

# Incremento padrão entre posições (mesma constante semântica das listas/filtros).
_POSITION_STEP = 1000

# Catálogo de métricas válidas para os slots do rodapé (espelha R15 / SummaryMetric do front).
_VALID_METRICS = {"abertas", "tempo_estimado", "concluidas", "concluidas_hoje", "em_andamento"}

# Adornos que o JSON de exibição pode ligar/desligar (espelha R23).
_VALID_ADORNOS = {"capacity_meter", "subtask_ring", "summary_footer", "card_chips"}


def _validate_display(display) -> Optional[str]:
    """Valida o shape do JSON ``display``; devolve mensagem de erro ou ``None`` se ok.

    Exige um objeto com ``adornos`` (dict de booleans, só chaves conhecidas) e
    ``slots`` (lista de **exatamente 3** chaves do catálogo de métricas).

    Args:
        display: O objeto de configuração de exibição a validar.

    Returns:
        Mensagem de erro (str) se inválido, ou ``None`` se ok.
    """
    if not isinstance(display, dict):
        return "A configuração de exibição precisa ser um objeto."
    adornos = display.get("adornos")
    if not isinstance(adornos, dict):
        return "A configuração de exibição precisa de 'adornos'."
    for chave, valor in adornos.items():
        if chave not in _VALID_ADORNOS:
            return f"Adorno desconhecido: '{chave}'."
        if not isinstance(valor, bool):
            return f"O adorno '{chave}' precisa ser verdadeiro/falso."
    slots = display.get("slots")
    if not isinstance(slots, list) or len(slots) != 3:
        return "A view precisa de exatamente 3 slots de métrica no rodapé."
    for metrica in slots:
        if metrica not in _VALID_METRICS:
            return f"Métrica de slot desconhecida: '{metrica}'."
    return None


def _is_builtin(view_id: int) -> Optional[bool]:
    """Diz se a view é built-in. Devolve ``None`` se ela não existir.

    Args:
        view_id: Id da view.

    Returns:
        ``True``/``False`` conforme ``is_builtin``, ou ``None`` se não houver linha.
    """
    rows = run_select("SELECT is_builtin FROM kanban_views WHERE id = %(id)s", {"id": view_id})
    return None if not rows else bool(rows[0]["is_builtin"])


def list_views() -> list:
    """Lista as views de Kanban, na ordem do seletor (``position``).

    Returns:
        Lista de ``{id, name, is_builtin, display, filter, position}``; ``display`` e
        ``filter`` voltam como dict/``None`` (JSONB). Sempre inclui a built-in
        "Completa". **Listagem**.
    """
    return run_select(
        "SELECT id, name, is_builtin, display, filter, position "
        "FROM kanban_views ORDER BY position, id"
    )


def create_view(name: str, display: dict, filter: Optional[dict] = None) -> dict:
    """Cria uma view customizada (nunca built-in).

    Args:
        name: Nome exibido no seletor.
        display: Configuração de exibição (ver ``_validate_display``).
        filter: ``FilterRules`` opcional (mesmo DSL das smart-lists) ou ``None``.

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome da view não pode ser vazio."}
    erro = _validate_display(display)
    if erro:
        return {"status": "error", "message": erro}
    # Filtro é opcional; se enviado, passa pela MESMA validação das smart-lists (≥1 condição).
    if filter is not None:
        erro_f = _validate_rules(filter)
        if erro_f:
            return {"status": "error", "message": erro_f}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(position), 0) + %s FROM kanban_views", (_POSITION_STEP,))
            position = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO kanban_views (name, is_builtin, display, filter, position) "
                "VALUES (%s, FALSE, %s, %s, %s) RETURNING id",
                (name.strip(), Json(display), Json(filter) if filter is not None else None, position),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"View '{name.strip()}' criada."}


def update_view(
    view_id: int,
    name: Optional[str] = None,
    display: Optional[dict] = None,
    filter: Optional[dict] = None,
    clear_filter: bool = False,
    position: Optional[int] = None,
) -> dict:
    """Edita uma view (PATCH parcial). A built-in "Completa" é imutável.

    Args:
        view_id: Id da view.
        name: Novo nome (opcional).
        display: Nova configuração de exibição (opcional; validada).
        filter: Novo ``FilterRules`` (opcional; validado). Ignorado se ``clear_filter``.
        clear_filter: Se ``True``, remove o filtro (seta NULL).
        position: Nova posição no seletor (opcional).

    Returns:
        Dicionário de status. Erro se a view não existir, for built-in, ou nada mudar.
    """
    builtin = _is_builtin(view_id)
    if builtin is None:
        return {"status": "error", "message": "View não encontrada."}
    if builtin:
        return {"status": "error", "message": "A view 'Completa' não pode ser editada."}

    sets, params = [], {"id": view_id}
    if name is not None:
        if not name.strip():
            return {"status": "error", "message": "O nome da view não pode ser vazio."}
        sets.append("name = %(name)s")
        params["name"] = name.strip()
    if display is not None:
        erro = _validate_display(display)
        if erro:
            return {"status": "error", "message": erro}
        sets.append("display = %(display)s")
        params["display"] = Json(display)
    if clear_filter:
        sets.append("filter = NULL")
    elif filter is not None:
        erro_f = _validate_rules(filter)
        if erro_f:
            return {"status": "error", "message": erro_f}
        sets.append("filter = %(filter)s")
        params["filter"] = Json(filter)
    if position is not None:
        sets.append("position = %(position)s")
        params["position"] = position
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    affected = run_dml(f"UPDATE kanban_views SET {', '.join(sets)} WHERE id = %(id)s", params)
    if affected == 0:
        return {"status": "error", "message": "View não encontrada."}
    return {"status": "ok", "message": "View atualizada."}


def delete_view(view_id: int) -> dict:
    """Exclui uma view customizada. A built-in "Completa" não pode ser deletada.

    Nenhuma tarefa/coluna é afetada (a view não possui tarefas).

    Args:
        view_id: Id da view a excluir.

    Returns:
        Dicionário de status.
    """
    builtin = _is_builtin(view_id)
    if builtin is None:
        return {"status": "error", "message": "View não encontrada."}
    if builtin:
        return {"status": "error", "message": "A view 'Completa' não pode ser excluída."}
    affected = run_dml("DELETE FROM kanban_views WHERE id = %(id)s", {"id": view_id})
    if affected == 0:
        return {"status": "error", "message": "View não encontrada."}
    return {"status": "ok", "message": "View excluída."}


# ─────────────────────────────────────────────────────────────────────────────
# Carga das tarefas do board com o filtro da view aplicado (spec 024, US3)
# ─────────────────────────────────────────────────────────────────────────────
def list_board_tasks(project_id: int, rules: Optional[dict] = None) -> list:
    """Tarefas-pai do board de uma lista, opcionalmente filtradas por um ``FilterRules``.

    Reusa ``list_tasks`` (subtarefas aninhadas, tags, ordenação por posição — mesma forma
    que o board já consome) e o motor do DSL (``_build_where_from_rules`` com
    ``default_open=False``): o filtro só **estreita** o conjunto, sem reimplementar a
    semântica das regras (R24/research R-1/R-2). A interseção é por id — nenhuma lógica de
    filtro vive aqui.

    Args:
        project_id: Id da lista (board).
        rules: ``FilterRules`` da view, ou ``None`` (sem filtro → board completo).

    Returns:
        Lista de tarefas-pai serializadas (mesma forma de ``list_tasks``). **Listagem**.
    """
    # Import lazy: evita ciclo de import com tools_tasks (que não importa este módulo).
    from agents.kaguya.tools_tasks import list_tasks

    parents = list_tasks(project_id, include_completed=False)
    if not rules:
        return parents

    # Ids das tarefas-pai desta lista que casam o filtro (semântica idêntica às smart-lists).
    where_sql, params, _orphans = _build_where_from_rules(rules, default_open=False)
    params = {**params, "pid_board": project_id}
    rows = run_select(
        f"SELECT t.id FROM tasks t WHERE t.project_id = %(pid_board)s AND {where_sql}",
        params,
    )
    match_ids = {r["id"] for r in rows}
    return [p for p in parents if p["id"] in match_ids]


def list_board_for_view(view_id: int, project_id: int) -> list:
    """Carrega o board de uma lista aplicando o filtro da view indicada.

    Args:
        view_id: Id da view (o filtro dela é lido do banco).
        project_id: Id da lista (board).

    Returns:
        Tarefas-pai do board, filtradas pelo ``filter`` da view (ou completas se a view
        não tiver filtro / não existir). **Listagem**.
    """
    rows = run_select("SELECT filter FROM kanban_views WHERE id = %(id)s", {"id": view_id})
    rules = rows[0]["filter"] if rows else None
    return list_board_tasks(project_id, rules)
