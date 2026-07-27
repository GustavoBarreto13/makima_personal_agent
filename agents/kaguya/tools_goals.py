"""Camada de lógica — **Metas** (spec 030).

Oitava peça da **camada de lógica única** da Kaguya (junto de ``tools_tasks``, ``tools_projects``,
``tools_tags``, ``tools_filters``, ``tools_kanban_views``, ``tools_habits`` e ``tools_experiments``).
Aqui vive TODA a regra de negócio das metas; o webapp (router ``/api/tasks/goals/*``) é uma fachada
fina sobre estas funções. **Webapp-first**: nesta fatia NENHUMA função é registrada no agente ADK
(research D8) — a fachada ``tools.py`` só re-exporta, deixando o ponto de extensão marcado.

O que é uma "meta": a camada de **direção** com prazo à qual os experimentos/tarefas/hábitos (os
"movimentos") se vinculam. O progresso combina uma métrica-alvo (atual/alvo) e marcos
(concluídos/total), calculado na leitura pelo motor puro ``goal_progress`` — nunca persistido.
Encerra com uma **revisão** (desfecho + aprendizado). Ver ``specs/030-tasks-metas/``.

O **vínculo** é uma coluna ``goal_id`` (FK ``ON DELETE SET NULL``) em ``tiny_experiments``, ``tasks``
e ``habits`` — cardinalidade "um item ↔ no máximo uma meta" (D1). Excluir a meta **desvincula**,
nunca apaga os itens (FR-010/SC-005).

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem/leitura** retornam o dado direto (lista/dict).
    - Acesso ao banco via ``agents.db``; "hoje" sempre em **UTC-3**.

Contrato REST: ``specs/030-tasks-metas/contracts/api-goals.md``.
Regras/estados: ``specs/030-tasks-metas/data-model.md``.
"""

from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from agents.db import get_conn, run_select
from agents.kaguya import goal_progress as GP
from agents.kaguya import goal_link_providers as GLP

# Fuso do usuário (UTC-3) — toda derivação de "hoje"/prazo passa por aqui (nunca CURRENT_DATE).
_SP_TZ = ZoneInfo("America/Sao_Paulo")

# Sentinela para distinguir "campo não enviado" de "enviado como None (limpar)" no update.
_UNSET = object()

# Conjuntos válidos — validamos aqui para devolver erro amigável (400) antes do CHECK do banco.
_VALID_STATUS = {"active", "closed"}
_VALID_OUTCOMES = {"achieved", "missed", "revise"}
_VALID_ITEM_TYPES = {"experiment", "task", "habit"}

# Mapa item_type → (tabela, coluna de título, filtro de "vivo/ativo" para vínculo/movimentos).
_ITEM_TABLES = {
    "experiment": ("tiny_experiments", "title", "TRUE"),
    "task":       ("tasks",            "title", "deleted_at IS NULL"),
    "habit":      ("habits",           "name",  "archived_at IS NULL"),
}
# Filtro extra na lista de VINCULÁVEIS (itens em aberto/em andamento — não os já encerrados).
_LINKABLE_FILTER = {
    "experiment": "status <> 'completed'",
    "task":       "deleted_at IS NULL AND completed_at IS NULL AND parent_id IS NULL",
    "habit":      "archived_at IS NULL",
}

# Colunas persistidas de goals (ordem estável nas respostas).
_GOAL_FIELDS = [
    "id", "title", "why", "life_area", "metric_target", "metric_unit", "metric_current",
    "metric_mode", "deadline", "anti_goals", "accountability", "status", "outcome", "review",
    "created_at", "updated_at",
]
_GOAL_COLUMNS = ", ".join(_GOAL_FIELDS)
_VALID_METRIC_MODES = {"manual", "auto"}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ─────────────────────────────────────────────────────────────────────────────
def _today() -> date:
    """Retorna a data de "hoje" no fuso do usuário (UTC-3), nunca a data UTC do container."""
    return datetime.now(_SP_TZ).date()


def _serialize_milestone(row: dict) -> dict:
    """Serializa um marco (``goal_milestones``) para o JSON."""
    return {"id": row["id"], "title": row["title"], "done": row["done"]}


def _external_links_by_provider(goal_id: int) -> dict[str, list[str]]:
    """Carrega os vínculos externos de uma meta, agrupados por ``provider_id``.

    Args:
        goal_id: Id da meta.

    Returns:
        Mapa ``{provider_id: [entity_id, ...]}`` (vazio se a meta não tem vínculos externos).
    """
    rows = run_select(
        "SELECT provider_id, entity_id FROM goal_external_links WHERE goal_id = %(g)s ORDER BY id",
        {"g": goal_id},
    )
    by_provider: dict[str, list[str]] = {}
    for r in rows:
        by_provider.setdefault(r["provider_id"], []).append(r["entity_id"])
    return by_provider


def _resolve_external_movements(goal_id: int) -> dict[str, dict]:
    """Resolve o estado ATUAL dos vínculos externos de uma meta, agrupado por provedor.

    Chama ``goal_link_providers.resolve`` uma vez por provedor vinculado (best-effort — FR-008):
    se um provedor falhar/não existir, o grupo aparece com ``unavailable: True`` e a lista de
    itens fica vazia, sem afetar os demais grupos nem derrubar a consulta da meta.

    Args:
        goal_id: Id da meta.

    Returns:
        Mapa ``{provider_id: {"provider_name", "unavailable", "items": [...]}}``.
    """
    by_provider = _external_links_by_provider(goal_id)
    if not by_provider:
        return {}
    providers_by_id = {p["id"]: p["name"] for p in GLP.list_providers()}
    out: dict[str, dict] = {}
    for provider_id, ids in by_provider.items():
        resolved = GLP.resolve(provider_id, ids)
        out[provider_id] = {
            "provider_name": providers_by_id.get(provider_id, provider_id),
            "unavailable": resolved is None,
            "items": resolved or [],
        }
    return out


def _auto_metric_value(external_movements: dict[str, dict]) -> int:
    """Conta quantos itens vinculados (de qualquer provedor) estão ``done`` — R6.

    Provedores marcados ``unavailable`` não contribuem para a contagem (não há como saber o
    estado deles agora), mas também não derrubam a soma dos demais.

    Args:
        external_movements: Saída de :func:`_resolve_external_movements`.

    Returns:
        Quantidade de itens com ``done: True`` entre os resolvidos com sucesso.
    """
    return sum(
        1
        for group in external_movements.values()
        for item in group["items"]
        if item.get("done")
    )


def _serialize_goal(
    row: dict,
    milestones: Optional[list] = None,
    *,
    include_milestones: bool = False,
    today: Optional[date] = None,
    external_movements: Optional[dict] = None,
) -> dict:
    """Monta o dicionário de uma meta: campos persistidos + derivados (progresso, prazo).

    O progresso vem do motor puro :func:`goal_progress.progress` (métrica + marcos), calculado na
    leitura — nunca persistido. Em modo ``auto`` (``metric_mode == "auto"``), o valor da métrica
    IGNORA a coluna ``metric_current`` armazenada e usa a contagem ao vivo dos vínculos externos
    (R6) — por isso o chamador deve passar ``external_movements`` quando a meta estiver em modo
    automático (senão o valor automático aparece como 0). Datas viram ``"YYYY-MM-DD"`` e
    timestamps ISO 8601 (contrato REST).

    Args:
        row: Linha de ``goals`` (via ``run_select``; ``NUMERIC`` já vem como float).
        milestones: Marcos da meta ``[{id, title, done}, ...]`` — usados para contar (e, se
            ``include_milestones``, anexados). ``None``/vazio = meta sem marcos.
        include_milestones: Se ``True``, anexa o array ``milestones`` (usado no detalhe).
        today: Data de referência (padrão: hoje UTC-3).
        external_movements: Saída de :func:`_resolve_external_movements`, só necessária quando
            ``row["metric_mode"] == "auto"``.

    Returns:
        Dicionário da meta pronto para o JSON da API.
    """
    ref = today or _today()
    ms = milestones or []
    total = len(ms)
    done = sum(1 for m in ms if m["done"])
    metric_mode = row.get("metric_mode", "manual")
    metric_current = row.get("metric_current")
    if metric_mode == "auto":
        metric_current = _auto_metric_value(external_movements or {})
    prog = GP.progress(
        metric_target=row.get("metric_target"),
        metric_current=metric_current,
        milestones_done=done,
        milestones_total=total,
    )
    dl = GP.deadline_status(row["deadline"], row["status"], ref)

    out = {
        "id": row["id"],
        "title": row["title"],
        "why": row.get("why"),
        "life_area": row.get("life_area"),
        "metric_target": row.get("metric_target"),
        "metric_unit": row.get("metric_unit"),
        "metric_current": metric_current,
        "metric_mode": metric_mode,
        "deadline": row["deadline"].isoformat(),
        "anti_goals": row.get("anti_goals"),
        "accountability": row.get("accountability"),
        "status": row["status"],
        "outcome": row.get("outcome"),
        "review": row.get("review"),
        # Derivados (não persistidos):
        "metric_pct": prog["metric_pct"],
        "milestones_total": total,
        "milestones_done": done,
        "milestones_pct": prog["milestones_pct"],
        "progress_pct": prog["progress_pct"],
        "days_remaining": dl["days_remaining"],
        "is_overdue": dl["is_overdue"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }
    if include_milestones:
        out["milestones"] = [_serialize_milestone(m) for m in ms]
    return out


def _fetch_goal(cur, goal_id: int) -> Optional[dict]:
    """Carrega uma linha de ``goals`` por id usando um cursor aberto (ou None)."""
    cur.execute(f"SELECT {_GOAL_COLUMNS} FROM goals WHERE id = %s", (goal_id,))
    row = cur.fetchone()
    return dict(zip(_GOAL_FIELDS, row)) if row else None


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de metas (US1)
# ─────────────────────────────────────────────────────────────────────────────
def create_goal(
    title: str,
    deadline: str,
    why: Optional[str] = None,
    life_area: Optional[str] = None,
    metric_target: Optional[float] = None,
    metric_unit: Optional[str] = None,
    anti_goals: Optional[str] = None,
    accountability: Optional[str] = None,
) -> dict:
    """Cria uma meta nova (US1).

    Valida o título (não-vazio) e o ``deadline`` antes de bater no banco.

    Args:
        title: Título específico (obrigatório).
        deadline: Prazo em ``"AAAA-MM-DD"`` (obrigatório).
        why: Porquê/motivação (opcional).
        life_area: Área da vida — etiqueta livre (opcional).
        metric_target: Métrica-alvo numérica (opcional).
        metric_unit: Unidade da métrica (opcional).
        anti_goals: O que evitar (opcional).
        accountability: Nota de responsabilização (opcional).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    titulo = (title or "").strip()
    if not titulo:
        return {"status": "error", "message": "O título da meta não pode ser vazio."}
    try:
        date.fromisoformat(deadline)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Data inválida: use o formato AAAA-MM-DD."}

    rows = run_select(
        """
        INSERT INTO goals (title, deadline, why, life_area, metric_target, metric_unit,
                           anti_goals, accountability)
        VALUES (%(title)s, %(dl)s, %(why)s, %(area)s, %(mt)s, %(mu)s, %(ag)s, %(acc)s)
        RETURNING id
        """,
        {"title": titulo, "dl": deadline, "why": why, "area": life_area,
         "mt": metric_target, "mu": metric_unit, "ag": anti_goals, "acc": accountability},
    )
    return {"status": "ok", "id": rows[0]["id"], "message": f"Meta '{titulo}' criada."}


def list_goals(include_completed: bool = False) -> list:
    """Lista as metas, já com os campos derivados (progresso etc.) e "hoje" em UTC-3.

    Por padrão traz só as ativas (usa o índice parcial ``idx_goals_active``);
    ``include_completed=True`` inclui as encerradas (para a seção de "encerradas", US3).
    Carrega TODOS os marcos das metas listadas numa única query (evita N+1).

    Args:
        include_completed: Se ``True``, inclui também as metas encerradas.

    Returns:
        Lista de dicionários de meta (sem o array ``milestones`` — payload enxuto). É uma **listagem**.
    """
    where = "" if include_completed else "WHERE status = 'active'"
    goals = run_select(
        f"""
        SELECT {_GOAL_COLUMNS} FROM goals
        {where}
        ORDER BY (status = 'closed'), deadline, id
        """
    )
    if not goals:
        return []

    ids = [g["id"] for g in goals]
    ms_rows = run_select(
        "SELECT id, goal_id, title, done FROM goal_milestones WHERE goal_id = ANY(%(ids)s) ORDER BY created_at, id",
        {"ids": ids},
    )
    by_goal: dict[int, list] = {g["id"]: [] for g in goals}
    for m in ms_rows:
        by_goal[m["goal_id"]].append(m)

    hoje = _today()
    # Métrica automática exige resolver os vínculos externos ao vivo — só feito para as metas
    # em modo "auto" (a maioria é manual; evita custo desnecessário no caso comum).
    return [
        _serialize_goal(
            g, by_goal[g["id"]], today=hoje,
            external_movements=_resolve_external_movements(g["id"]) if g.get("metric_mode") == "auto" else None,
        )
        for g in goals
    ]


def get_goal(goal_id: int) -> dict:
    """Busca uma meta com os derivados, os ``milestones`` e os ``movements`` (US1 + US2).

    Args:
        goal_id: Id da meta.

    Returns:
        Dicionário da meta (com ``milestones`` ordenados e ``movements`` agrupados por tipo), ou
        ``{"status": "error", ...}`` se não existir (o router converte em 400).
    """
    rows = run_select(f"SELECT {_GOAL_COLUMNS} FROM goals WHERE id = %(id)s", {"id": goal_id})
    if not rows:
        return {"status": "error", "message": "Meta não encontrada."}
    milestones = run_select(
        "SELECT id, title, done FROM goal_milestones WHERE goal_id = %(id)s ORDER BY created_at, id",
        {"id": goal_id},
    )
    # Uma única resolução dos vínculos externos serve tanto a métrica automática (R6) quanto a
    # exibição em movements.external — evita chamar o provedor duas vezes.
    external = _resolve_external_movements(goal_id)
    out = _serialize_goal(rows[0], milestones, include_milestones=True, external_movements=external)
    out["movements"] = _movements_for_goal(goal_id)
    out["movements"]["external"] = external
    return out


def update_goal(
    goal_id: int,
    title=_UNSET,
    why=_UNSET,
    life_area=_UNSET,
    metric_target=_UNSET,
    metric_unit=_UNSET,
    metric_current=_UNSET,
    deadline=_UNSET,
    anti_goals=_UNSET,
    accountability=_UNSET,
) -> dict:
    """Edita uma meta (PATCH parcial — só os campos enviados são aplicados).

    Usa a sentinela :data:`_UNSET` para distinguir "não enviado" de "enviado como None" (campos
    opcionais podem ser limpos com ``None``). ``metric_current`` atualiza o valor atual (FR-005).
    ``deadline``, quando enviado, é revalidado.

    Args:
        goal_id: Id da meta.
        title/why/life_area/metric_target/metric_unit/metric_current/deadline/anti_goals/accountability:
            campos a atualizar (ver contrato).

    Returns:
        Dicionário de status. Erro se nada mudar, algo for inválido, o id não existir, ou se
        ``metric_current`` for enviado numa meta em modo automático (FR-003/AC3 — a edição manual
        é bloqueada; use :func:`set_metric_mode` para voltar a manual antes de editar).
    """
    goal_rows = run_select("SELECT metric_mode FROM goals WHERE id = %(id)s", {"id": goal_id})
    if not goal_rows:
        return {"status": "error", "message": "Meta não encontrada."}
    if metric_current is not _UNSET and goal_rows[0]["metric_mode"] == "auto":
        return {
            "status": "error",
            "message": "Esta meta está em modo automático — o valor vem dos itens vinculados. "
                       "Mude para manual antes de editar o valor atual.",
        }

    sets, params = [], {"id": goal_id}

    if title is not _UNSET:
        t = (title or "").strip()
        if not t:
            return {"status": "error", "message": "O título da meta não pode ser vazio."}
        sets.append("title = %(title)s"); params["title"] = t
    if deadline is not _UNSET:
        try:
            date.fromisoformat(deadline)
        except (TypeError, ValueError):
            return {"status": "error", "message": "Data inválida: use o formato AAAA-MM-DD."}
        sets.append("deadline = %(dl)s"); params["dl"] = deadline
    # Campos de texto/numéricos opcionais — aceitam None (limpar).
    for field, col, key in [
        (why, "why", "why"), (life_area, "life_area", "area"),
        (metric_target, "metric_target", "mt"), (metric_unit, "metric_unit", "mu"),
        (metric_current, "metric_current", "mc"), (anti_goals, "anti_goals", "ag"),
        (accountability, "accountability", "acc"),
    ]:
        if field is not _UNSET:
            sets.append(f"{col} = %({key})s"); params[key] = field

    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    sets.append("updated_at = now()")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE goals SET {', '.join(sets)} WHERE id = %(id)s", params)
            if cur.rowcount == 0:
                return {"status": "error", "message": "Meta não encontrada."}
    return {"status": "ok", "message": "Meta atualizada."}


def delete_goal(goal_id: int) -> dict:
    """Exclui uma meta (**hard delete** — D4): marcos por CASCADE, itens vinculados por SET NULL.

    Os itens de execução (experimentos/tarefas/hábitos) **não são apagados** — apenas
    desvinculados (o ``ON DELETE SET NULL`` da coluna ``goal_id`` cuida disso). FR-010/SC-005.

    Args:
        goal_id: Id da meta.

    Returns:
        Dicionário de status (erro se não existir).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM goals WHERE id = %s", (goal_id,))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Meta não encontrada."}
    return {"status": "ok", "message": "Meta excluída."}


# ─────────────────────────────────────────────────────────────────────────────
# Marcos (US1)
# ─────────────────────────────────────────────────────────────────────────────
def add_milestone(goal_id: int, title: str) -> dict:
    """Adiciona um marco a uma meta.

    Args:
        goal_id: Id da meta.
        title: Nome do marco (não-vazio).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou erro.
    """
    t = (title or "").strip()
    if not t:
        return {"status": "error", "message": "O nome do marco não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            if not _fetch_goal(cur, goal_id):
                return {"status": "error", "message": "Meta não encontrada."}
            cur.execute(
                "INSERT INTO goal_milestones (goal_id, title) VALUES (%s, %s) RETURNING id",
                (goal_id, t),
            )
            mid = cur.fetchone()[0]
    return {"status": "ok", "id": mid, "message": "Marco adicionado."}


def update_milestone(milestone_id: int, title=_UNSET, done=_UNSET) -> dict:
    """Edita um marco (renomear e/ou concluir/reabrir — FR-005).

    Args:
        milestone_id: Id do marco.
        title: Novo nome (opcional).
        done: Novo estado concluído/pendente (opcional).

    Returns:
        Dicionário de status.
    """
    sets, params = [], {"id": milestone_id}
    if title is not _UNSET:
        t = (title or "").strip()
        if not t:
            return {"status": "error", "message": "O nome do marco não pode ser vazio."}
        sets.append("title = %(title)s"); params["title"] = t
    if done is not _UNSET:
        sets.append("done = %(done)s"); params["done"] = bool(done)
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE goal_milestones SET {', '.join(sets)} WHERE id = %(id)s", params)
            if cur.rowcount == 0:
                return {"status": "error", "message": "Marco não encontrado."}
    return {"status": "ok", "message": "Marco atualizado."}


def delete_milestone(milestone_id: int) -> dict:
    """Remove um marco.

    Args:
        milestone_id: Id do marco.

    Returns:
        Dicionário de status (erro se não existir).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM goal_milestones WHERE id = %s", (milestone_id,))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Marco não encontrado."}
    return {"status": "ok", "message": "Marco removido."}


def list_goal_areas() -> list:
    """Contagem de metas **ativas** por área da vida (SC-006).

    Metas sem área caem no grupo ``null``. Serve ao apoio à decisão "menos é mais".

    Returns:
        Lista ``[{"life_area": str|None, "active_count": int}]`` ordenada por contagem. É uma **listagem**.
    """
    rows = run_select(
        """
        SELECT life_area, COUNT(*) AS active_count
        FROM goals WHERE status = 'active'
        GROUP BY life_area
        ORDER BY active_count DESC, life_area NULLS LAST
        """
    )
    return [{"life_area": r["life_area"], "active_count": int(r["active_count"])} for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Vínculo de movimentos (US2)
# ─────────────────────────────────────────────────────────────────────────────
def _movements_for_goal(goal_id: int) -> dict:
    """Agrega os itens vinculados a uma meta, agrupados por tipo, cada um com status mínimo (FR-009).

    Reusa os serializadores das outras camadas (``get_experiment``/``get_habit``) para o status
    derivado (aderência/consistência). Itens removidos/arquivados são filtrados — não quebram a
    tela (edge case). Import lazy para evitar qualquer ciclo de import.

    Args:
        goal_id: Id da meta.

    Returns:
        ``{"experiments": [...], "tasks": [...], "habits": [...]}``.
    """
    from agents.kaguya.tools_experiments import get_experiment  # lazy — evita ciclo
    from agents.kaguya.tools_habits import get_habit            # lazy — evita ciclo

    # Experimentos (qualquer status): status + aderência via motor da 029.
    experiments = []
    for r in run_select("SELECT id FROM tiny_experiments WHERE goal_id = %(g)s ORDER BY id", {"g": goal_id}):
        e = get_experiment(r["id"])
        if e.get("status") == "error":
            continue
        experiments.append({"id": e["id"], "title": e["title"], "status": e["status"],
                            "adherence_pct": e["adherence_pct"]})

    # Tarefas vivas: aberta/concluída.
    tasks = [
        {"id": t["id"], "title": t["title"], "completed": t["completed_at"] is not None}
        for t in run_select(
            "SELECT id, title, completed_at FROM tasks WHERE goal_id = %(g)s AND deleted_at IS NULL ORDER BY id",
            {"g": goal_id},
        )
    ]

    # Hábitos ativos: consistência via motor "caixa d'água".
    habits = []
    for r in run_select("SELECT id FROM habits WHERE goal_id = %(g)s AND archived_at IS NULL ORDER BY id", {"g": goal_id}):
        h = get_habit(r["id"])
        if h.get("status") == "error":
            continue
        habits.append({"id": h["id"], "name": h["name"], "consistency": h["consistency"]})

    return {"experiments": experiments, "tasks": tasks, "habits": habits}


def link_movement(goal_id: int, item_type: str, item_id: int) -> dict:
    """Vincula um item de execução (experimento/tarefa/hábito) a uma meta (US2).

    Seta a coluna ``goal_id`` na tabela do item. Reatribuição sobrescreve (cardinalidade D1 — um
    item só pertence a uma meta). Valida que a meta e o item existem e que o item está vivo/ativo
    (edge case: vincular item arquivado/removido → erro).

    Args:
        goal_id: Id da meta.
        item_type: ``"experiment"`` | ``"task"`` | ``"habit"``.
        item_id: Id do item.

    Returns:
        Dicionário de status.
    """
    if item_type not in _VALID_ITEM_TYPES:
        return {"status": "error", "message": "Tipo de item inválido."}
    table, _title, alive = _ITEM_TABLES[item_type]
    with get_conn() as conn:
        with conn.cursor() as cur:
            if not _fetch_goal(cur, goal_id):
                return {"status": "error", "message": "Meta não encontrada."}
            # Só vincula itens vivos/ativos (o filtro `alive` varia por tipo).
            cur.execute(f"UPDATE {table} SET goal_id = %s WHERE id = %s AND {alive}", (goal_id, item_id))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Item não encontrado ou indisponível para vínculo."}
    return {"status": "ok", "message": "Item vinculado à meta."}


def unlink_movement(item_type: str, item_id: int) -> dict:
    """Desvincula um item de execução de sua meta (seta ``goal_id = NULL``) — US2.

    O item continua existindo intacto na sua seção de origem (FR-010).

    Args:
        item_type: ``"experiment"`` | ``"task"`` | ``"habit"``.
        item_id: Id do item.

    Returns:
        Dicionário de status.
    """
    if item_type not in _VALID_ITEM_TYPES:
        return {"status": "error", "message": "Tipo de item inválido."}
    table, _title, _alive = _ITEM_TABLES[item_type]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE {table} SET goal_id = NULL WHERE id = %s AND goal_id IS NOT NULL", (item_id,))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Item não estava vinculado."}
    return {"status": "ok", "message": "Item desvinculado."}


def list_linkable_items(item_type: str) -> list:
    """Lista itens de um tipo que podem ser vinculados a uma meta (US2).

    Traz os itens vivos/em andamento do tipo pedido, cada um com ``linked_goal_id`` (a meta a que
    já pertence, se houver) para a UI avisar que vincular vai **reatribuir** (cardinalidade D1).

    Args:
        item_type: ``"experiment"`` | ``"task"`` | ``"habit"``.

    Returns:
        Lista ``[{"id", "label", "linked_goal_id"}]``. É uma **listagem**.
    """
    if item_type not in _VALID_ITEM_TYPES:
        return []
    table, title_col, _alive = _ITEM_TABLES[item_type]
    where = _LINKABLE_FILTER[item_type]
    rows = run_select(
        f"SELECT id, {title_col} AS label, goal_id AS linked_goal_id FROM {table} WHERE {where} ORDER BY id DESC"
    )
    return [{"id": r["id"], "label": r["label"], "linked_goal_id": r["linked_goal_id"]} for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Vínculo externo (cross-agent) + métrica automática — spec 036
# ─────────────────────────────────────────────────────────────────────────────
def list_goal_link_providers() -> list:
    """Lista os provedores de vínculo de meta registrados (ex.: livros da Frieren).

    Returns:
        Lista ``[{"id", "name"}, ...]``. É uma **listagem**.
    """
    return GLP.list_providers()


def search_goal_link_items(provider_id: str, query: str) -> list:
    """Busca itens vinculáveis num provedor (US1 — passo 1 do picker de vínculo).

    Args:
        provider_id: Chave do provedor (ver :func:`list_goal_link_providers`).
        query: Texto de busca.

    Returns:
        Lista de itens do provedor, ou ``[]`` se o provedor não existir/falhar (best-effort —
        FR-008). É uma **listagem**.
    """
    result = GLP.search(provider_id, query)
    return result or []


def link_external_item(goal_id: int, provider_id: str, entity_id: str) -> dict:
    """Vincula um item de outro agente a uma meta (US1).

    Idempotente (``ON CONFLICT DO NOTHING``) — vincular o mesmo item duas vezes não duplica.
    Não exclusivo: o mesmo item pode ser vinculado a mais de uma meta (edge case do spec).

    Args:
        goal_id: Id da meta.
        provider_id: Chave do provedor (ex.: ``"frieren_books"``).
        entity_id: Id da entidade no domínio dono (ex.: uuid do livro).

    Returns:
        Dicionário de status (erro se a meta não existir).
    """
    if not run_select("SELECT 1 FROM goals WHERE id = %(id)s", {"id": goal_id}):
        return {"status": "error", "message": "Meta não encontrada."}
    run_select(
        """
        INSERT INTO goal_external_links (goal_id, provider_id, entity_id)
        VALUES (%(g)s, %(p)s, %(e)s)
        ON CONFLICT (goal_id, provider_id, entity_id) DO NOTHING
        RETURNING id
        """,
        {"g": goal_id, "p": provider_id, "e": entity_id},
    )
    return {"status": "ok", "message": "Item vinculado à meta."}


def unlink_external_item(goal_id: int, provider_id: str, entity_id: str) -> dict:
    """Desvincula um item externo de uma meta (US1).

    O item de origem (ex.: o livro na Frieren) permanece intacto — só o vínculo é removido
    (FR-011).

    Args:
        goal_id: Id da meta.
        provider_id: Chave do provedor.
        entity_id: Id da entidade vinculada.

    Returns:
        Dicionário de status (erro se o vínculo não existir).
    """
    affected = _delete_external_link(goal_id, provider_id, entity_id)
    if affected == 0:
        return {"status": "error", "message": "Vínculo não encontrado."}
    return {"status": "ok", "message": "Item desvinculado."}


def _delete_external_link(goal_id: int, provider_id: str, entity_id: str) -> int:
    """Remove uma linha de ``goal_external_links``; devolve quantas linhas foram afetadas.

    Isolado numa função própria (em vez de inline em :func:`unlink_external_item`) só para manter
    o padrão de cursor explícito usado no resto do módulo.

    Args:
        goal_id: Id da meta.
        provider_id: Chave do provedor.
        entity_id: Id da entidade vinculada.

    Returns:
        Número de linhas removidas (0 ou 1 — a UNIQUE garante no máximo uma).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM goal_external_links WHERE goal_id = %s AND provider_id = %s AND entity_id = %s",
                (goal_id, provider_id, entity_id),
            )
            return cur.rowcount


def set_metric_mode(goal_id: int, mode: str) -> dict:
    """Alterna o modo da métrica de uma meta entre ``"manual"`` e ``"auto"`` (R7).

    ``manual → auto``: só troca o modo — a leitura passa a calcular o valor ao vivo. ``auto →
    manual``: calcula o valor automático uma última vez e o grava em ``metric_current`` antes de
    trocar o modo (edge case do spec: "o último valor calculado vira o valor manual inicial").

    Args:
        goal_id: Id da meta.
        mode: ``"manual"`` | ``"auto"``.

    Returns:
        Dicionário de status (erro se o modo for inválido ou a meta não existir).
    """
    if mode not in _VALID_METRIC_MODES:
        return {"status": "error", "message": "Modo inválido: use manual ou auto."}
    goal_rows = run_select("SELECT metric_mode FROM goals WHERE id = %(id)s", {"id": goal_id})
    if not goal_rows:
        return {"status": "error", "message": "Meta não encontrada."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            if mode == "manual" and goal_rows[0]["metric_mode"] == "auto":
                # Congela o último valor calculado antes de voltar a ser editável (edge case).
                frozen = _auto_metric_value(_resolve_external_movements(goal_id))
                cur.execute(
                    "UPDATE goals SET metric_mode = 'manual', metric_current = %s, updated_at = now() WHERE id = %s",
                    (frozen, goal_id),
                )
            else:
                cur.execute(
                    "UPDATE goals SET metric_mode = %s, updated_at = now() WHERE id = %s",
                    (mode, goal_id),
                )
    return {"status": "ok", "message": "Modo da métrica atualizado."}


# ─────────────────────────────────────────────────────────────────────────────
# Revisão / encerramento (US3)
# ─────────────────────────────────────────────────────────────────────────────
def review_goal(goal_id: int, outcome: str, review: str) -> dict:
    """Encerra uma meta com a revisão: desfecho + aprendizado (US3, FR-013).

    Grava ``outcome`` e ``review`` e seta ``status = 'closed'`` (terminal). Permite encerramento
    antecipado (FR-014). Os ``goal_id`` dos itens **permanecem** (vínculos históricos — D5). Erro
    se a meta já estiver encerrada.

    Args:
        goal_id: Id da meta.
        outcome: ``"achieved"`` | ``"missed"`` | ``"revise"``.
        review: Texto do aprendizado.

    Returns:
        Dicionário de status.
    """
    if outcome not in _VALID_OUTCOMES:
        return {"status": "error", "message": "Desfecho inválido: use achieved, missed ou revise."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            goal = _fetch_goal(cur, goal_id)
            if not goal:
                return {"status": "error", "message": "Meta não encontrada."}
            if goal["status"] == "closed":
                return {"status": "error", "message": "Esta meta já foi encerrada."}
            cur.execute(
                "UPDATE goals SET status = 'closed', outcome = %s, review = %s, updated_at = now() "
                "WHERE id = %s",
                (outcome, review, goal_id),
            )
    return {"status": "ok", "id": goal_id, "message": "Meta encerrada."}
