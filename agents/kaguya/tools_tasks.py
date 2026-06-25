"""Camada de lógica — CRUD de tarefas e subtarefas da Kaguya.

Metade principal da **camada de lógica única** (a outra é `tools_projects.py`).
Toda regra de negócio de tarefas vive aqui; Telegram (agente) e webapp (router
`/api/tasks/*`) são fachadas finas e paritárias sobre estas funções (FR-002).

Estados são **derivados** (sem coluna ``status``):
    - aberta   = ``completed_at IS NULL AND deleted_at IS NULL``
    - vencida  = aberta e ``due_date < hoje``
    - concluída= ``completed_at IS NOT NULL``
    - lixeira  = ``deleted_at IS NOT NULL`` (restaurável)

Convenções: mutações retornam ``{"status": ...}``; listagens retornam o dado direto.
Posições manuais são esparsas ×1000, com renormalização transparente em colisão (FR-008).

Contrato REST: ``specs/011-tasks-mvp/contracts/api-tasks.md``.
Regras detalhadas: ``specs/011-tasks-mvp/data-model.md``.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from agents.db import get_conn, run_select
from agents.kaguya import recurrence as rec_engine
from agents.kaguya.tools_projects import resolve_project_id_by_name
# Helpers de tags (etiquetas N:N). Import no topo é seguro: ``tools_tags`` só importa de
# ``agents.db`` no topo dele (as funções que precisam de ``tools_tasks`` fazem import lazy).
from agents.kaguya.tools_tags import _set_task_tags, _attach_tags

# Incremento padrão entre posições manuais (mesma constante semântica do Journal).
_POSITION_STEP = 1000

# Conjuntos válidos para validação amigável antes de bater no CHECK do banco.
_VALID_PRIORITIES = {0, 1, 2, 3}
_VALID_TYPES = {"task", "event", "birthday"}

# Colunas da tarefa que viajam nas respostas (ordem estável; nested subtasks à parte).
_TASK_FIELDS = [
    "id", "project_id", "column_id", "parent_id", "title", "description", "type", "priority",
    "due_date", "due_time", "start_at", "end_at", "duration_min", "my_day_date",
    # Incluído na fatia 019 (T015): id do evento Google Calendar vinculado a esta tarefa.
    # Viaja em TODAS as responses de tarefa (incluindo list_tasks_in_range usado pelo calendário).
    "google_event_id",
    "position", "completed_at", "deleted_at", "created_at", "updated_at",
]
# Lista simples (sem alias) — para queries sem JOIN.
_TASK_COLUMNS = ", ".join(_TASK_FIELDS)


def _qualified(alias: str) -> str:
    """Retorna a lista de colunas de tasks com prefixo de alias (ex.: ``t.id, t.title, ...``).

    Necessário em queries com JOIN em ``task_projects`` (que também tem ``id``,
    ``position``, ``created_at`` — sem o prefixo o Postgres acusa coluna ambígua).
    """
    return ", ".join(f"{alias}.{f}" for f in _TASK_FIELDS)


# ─────────────────────────────────────────────────────────────────────────────
# Serialização — converte datas/horas para strings JSON estáveis
# ─────────────────────────────────────────────────────────────────────────────
def _serialize_task(row: dict) -> dict:
    """Converte os campos temporais de uma linha de ``tasks`` para strings ISO.

    O webapp (FastAPI) e o agente (LLM) consomem o mesmo dicionário; padronizar as
    datas como texto evita surpresas de serialização e bate com o contrato REST
    (``due_date`` = "YYYY-MM-DD", ``due_time`` = "HH:MM").

    Args:
        row: Dicionário vindo do ``run_select`` (uma linha de tasks).

    Returns:
        O mesmo dicionário com campos de data/hora/timestamp como strings (ou None).
    """
    out = dict(row)
    # Garante shape estável: campos da fatia 025 com defaults para não quebrar consumidores.
    out.setdefault("assignees", [])
    out.setdefault("parent_title", None)
    # Datas simples → "YYYY-MM-DD"
    for f in ("due_date", "my_day_date"):
        if out.get(f) is not None:
            out[f] = out[f].isoformat()
    # Hora → "HH:MM" (corta segundos, que não usamos)
    if out.get("due_time") is not None:
        out["due_time"] = out["due_time"].strftime("%H:%M")
    # Timestamps com timezone → ISO 8601 completo
    for f in ("start_at", "end_at", "completed_at", "deleted_at", "created_at", "updated_at"):
        if out.get(f) is not None:
            out[f] = out[f].isoformat()
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ─────────────────────────────────────────────────────────────────────────────
def _get_inbox_id(cur) -> int:
    """Retorna o id do Inbox usando um cursor aberto (ver tools_projects._get_inbox_id)."""
    cur.execute("SELECT id FROM task_projects WHERE is_inbox LIMIT 1")
    row = cur.fetchone()
    if not row:
        raise RuntimeError("Inbox não encontrado — o schema/seed não foi aplicado.")
    return row[0]


def _get_birthdays_list_id(cur) -> int:
    """Retorna o id da lista "Aniversários", criando-a sob demanda na primeira chamada.

    Análogo a _get_inbox_id, mas para a lista especial de aniversários do sync
    Komi↔Kaguya (fase 026). A lista não é semeada pelo schema/seed — é criada
    aqui ao primeiro uso para não existir em instâncias sem o sync ativado.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).

    Returns:
        ID (int) da lista "Aniversários" — criada se não existir.

    Example:
        >>> with get_conn() as conn:
        ...     with conn.cursor() as cur:
        ...         list_id = _get_birthdays_list_id(cur)
    """
    # Tenta encontrar a lista já existente (idempotência)
    cur.execute("SELECT id FROM task_projects WHERE is_birthdays LIMIT 1")
    row = cur.fetchone()
    if row:
        return row[0]

    # Primeira chamada: cria a lista "Aniversários" com ícone e cor padrão
    cur.execute(
        "INSERT INTO task_projects (name, icon, color, is_birthdays) "
        "VALUES (%s, %s, %s, TRUE) RETURNING id",
        ("Aniversários", "🎂", "#FF6B6B"),
    )
    return cur.fetchone()[0]


def _first_column_id(cur, project_id: int) -> Optional[int]:
    """Retorna a primeira coluna (menor ``position``) do board de uma lista, ou None.

    Usado ao mover uma tarefa para outra lista: ela entra na primeira coluna do
    destino, ou fica sem coluna se o destino não tiver board.
    """
    cur.execute(
        "SELECT id FROM task_columns WHERE project_id = %s ORDER BY position, id LIMIT 1",
        (project_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _attach_subtasks(parents: list[dict]) -> list[dict]:
    """Anexa toda a subárvore (N níveis) de subtarefas vivas a cada tarefa-pai.

    Usa uma única query ``WITH RECURSIVE`` para carregar todos os descendentes das
    raízes de uma vez — sem N+1, sem múltiplas roundtrips. O resultado é aninhado
    recursivamente: cada tarefa recebe ``subtasks`` com seus filhos diretos; cada
    filho recebe os próprios filhos, e assim por diante.

    Args:
        parents: Lista de tarefas-pai (``parent_id IS NULL``) já serializadas.

    Returns:
        A mesma lista com ``subtasks`` preenchido em profundidade arbitrária.
    """
    root_ids = [p["id"] for p in parents]
    # Inicializa a chave em todos os nós raiz (mesmo os sem filhos) para shape estável.
    for p in parents:
        p["subtasks"] = []
    if not root_ids:
        return parents

    # CTE recursiva: começa nas raízes e desce até não haver mais filhos vivos.
    # A coluna ``depth`` serve como proteção de loop (cap 12) e para ordenar o build.
    all_descendants = run_select(
        f"""
        WITH RECURSIVE subtree AS (
            -- âncoras: filhos diretos dos nós raiz passados
            SELECT {_TASK_COLUMNS}, 1 AS depth
            FROM tasks
            WHERE parent_id = ANY(%(root_ids)s) AND deleted_at IS NULL
            UNION ALL
            -- passo recursivo: filhos dos nós já encontrados (profundidade < 12)
            SELECT {", ".join(f"t.{f}" for f in _TASK_FIELDS)}, st.depth + 1
            FROM tasks t
            JOIN subtree st ON t.parent_id = st.id
            WHERE t.deleted_at IS NULL AND st.depth < 12
        )
        SELECT * FROM subtree
        ORDER BY depth, position, id
        """,
        {"root_ids": root_ids},
    )

    # Monta um índice único de TODOS os nós conhecidos (raízes + descendentes).
    # Depois percorre os descendentes em ordem de profundidade (âncoras primeiro)
    # para aninhar sob o pai correto em O(n).
    node_map: dict[int, dict] = {p["id"]: p for p in parents}

    for row in all_descendants:
        node = _serialize_task(row)
        node["subtasks"] = []
        node_map[node["id"]] = node

    # Segunda passagem: encosta cada descendente no "subtasks" do pai.
    for row in all_descendants:
        child_id = row["id"]
        parent_id = row["parent_id"]
        child_node = node_map.get(child_id)
        parent_node = node_map.get(parent_id)
        if child_node is not None and parent_node is not None:
            parent_node["subtasks"].append(child_node)

    return parents


def _attach_assignees(tasks: list[dict]) -> list[dict]:
    """Anexa os responsáveis (da Komi) a cada tarefa, sob a chave ``assignees``.

    Faz uma única query batch em ``person_links JOIN people`` para evitar N+1.
    Funciona para qualquer lista plana de tarefas (raízes, subtarefas, buscas, etc.).

    Args:
        tasks: Lista de tarefas já serializadas (com campo ``id``).

    Returns:
        A mesma lista com ``assignees`` preenchido em cada item (lista vazia se ninguém).
    """
    # Inicializa a chave em todos para um shape sempre consistente.
    for t in tasks:
        t["assignees"] = []
    if not tasks:
        return tasks

    task_ids = [t["id"] for t in tasks]
    # entity_id é TEXT na tabela, então fazemos cast explícito ao comparar.
    rows = run_select(
        """
        SELECT pl.entity_id::int AS task_id, p.id, p.name, p.avatar_url
        FROM person_links pl
        JOIN people p ON p.id = pl.person_id
        WHERE pl.entity_type = 'task'
          AND pl.entity_id = ANY(%(ids)s::text[])
          AND p.deleted = FALSE
        ORDER BY p.name
        """,
        {"ids": [str(tid) for tid in task_ids]},
    )

    # Distribui os responsáveis pela tarefa correspondente em O(n).
    by_task: dict[int, list] = {t["id"]: t["assignees"] for t in tasks}
    for r in rows:
        assignee = {"id": r["id"], "name": r["name"], "avatar_url": r["avatar_url"]}
        by_task.get(r["task_id"], []).append(assignee)

    return tasks


def _serialize_recurrence(row: dict) -> dict:
    """Converte uma linha de ``task_recurrences`` no objeto do contrato REST.

    Args:
        row: Dicionário com ``rrule``, ``mode``, ``anchor_date``, ``active``.

    Returns:
        Dicionário com a âncora como string ISO (``anchor_date`` = "YYYY-MM-DD").
    """
    return {
        "rrule": row["rrule"],
        "mode": row["mode"],
        # anchor_date é um date do banco; vira string ISO para o JSON/eco.
        "anchor_date": row["anchor_date"].isoformat() if row.get("anchor_date") else None,
        "active": row["active"],
    }


def _attach_recurrence(parents: list[dict]) -> list[dict]:
    """Anexa a regra de recorrência **ativa** (se houver) a cada tarefa-pai.

    Faz uma única query para todos os pais (evita N+1, igual a ``_attach_subtasks``).
    Define sempre as chaves ``recurrence`` (objeto ou None) e ``recurrence_text``
    (descrição pt-BR via ``describe_rrule``) para um shape de resposta consistente.

    Args:
        parents: Lista de tarefas-pai já serializadas.

    Returns:
        A mesma lista, com ``recurrence``/``recurrence_text`` preenchidos.
    """
    # Inicializa as chaves em todos (mesmo os sem regra) para um shape estável.
    for p in parents:
        p["recurrence"] = None
        p["recurrence_text"] = None
    ids = [p["id"] for p in parents]
    if not ids:
        return parents
    rows = run_select(
        """
        SELECT task_id, rrule, mode, anchor_date, active
        FROM task_recurrences
        WHERE task_id = ANY(%(ids)s) AND active
        """,
        {"ids": ids},
    )
    by_id = {p["id"]: p for p in parents}
    for r in rows:
        parent = by_id.get(r["task_id"])
        if parent is not None:
            parent["recurrence"] = _serialize_recurrence(r)
            # Texto amigável para a UI/eco não precisar decodificar RRULE.
            parent["recurrence_text"] = rec_engine.describe_rrule(r["rrule"])
    return parents


# ─────────────────────────────────────────────────────────────────────────────
# Recorrência — validação, definição e geração da próxima ocorrência
# ─────────────────────────────────────────────────────────────────────────────
def _validate_recurrence(rrule: str, mode: str, due_date) -> Optional[str]:
    """Valida uma regra de recorrência antes de persistir; retorna a mensagem de erro ou None.

    Args:
        rrule: Regra RFC 5545.
        mode: ``fixed`` | ``after_completion``.
        due_date: A âncora (date ou string ISO); recorrência exige data.

    Returns:
        ``None`` se a regra é válida; senão uma mensagem em português.
    """
    if due_date is None:
        return "Defina uma data de vencimento antes de tornar a tarefa recorrente."
    # Aceita tanto date quanto string ISO (create_task passa string; o banco devolve date).
    if isinstance(due_date, str):
        try:
            due_date = date.fromisoformat(due_date)
        except ValueError:
            return "Data de vencimento inválida."
    if mode not in (rec_engine.MODE_FIXED, rec_engine.MODE_AFTER_COMPLETION):
        return "Modo de recorrência inválido (use 'fixed' ou 'after_completion')."
    # Tenta calcular uma próxima ocorrência: valida de fato a RRULE (rrulestr levanta se inválida).
    try:
        rec_engine.next_occurrence(rrule, due_date, mode, current_due=due_date, completed_on=due_date)
    except Exception:
        return "Regra de recorrência inválida."
    return None


def _set_recurrence_on_cursor(cur, task_id: int, rrule: str, mode: str) -> dict:
    """Anexa/substitui a regra de recorrência de uma tarefa usando um cursor aberto.

    A âncora (``anchor_date``) nasce igual ao ``due_date`` da tarefa e **não** é alterada ao
    reeditar a regra (edge case 8 da master: editar a regra não move a âncora).

    Args:
        cur: Cursor psycopg2 ativo.
        task_id: Id da tarefa (tarefa-pai; subtarefas não recorrem).
        rrule: Regra RFC 5545.
        mode: ``fixed`` | ``after_completion``.

    Returns:
        ``{"status": "ok"}`` ou ``{"status": "error", "message": ...}``.
    """
    cur.execute("SELECT due_date, parent_id FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,))
    row = cur.fetchone()
    if not row:
        return {"status": "error", "message": "Tarefa não encontrada."}
    due_date, parent_id = row
    if parent_id is not None:
        return {"status": "error", "message": "Subtarefas não podem ser recorrentes."}
    err = _validate_recurrence(rrule, mode, due_date)
    if err:
        return {"status": "error", "message": err}
    # ON CONFLICT (task_id): a tabela tem UNIQUE(task_id) — reeditar não duplica e mantém a âncora.
    cur.execute(
        """
        INSERT INTO task_recurrences (task_id, rrule, mode, anchor_date, active)
        VALUES (%s, %s, %s, %s, TRUE)
        ON CONFLICT (task_id) DO UPDATE
            SET rrule = EXCLUDED.rrule, mode = EXCLUDED.mode, active = TRUE
        """,
        (task_id, rrule, mode, due_date),
    )
    return {"status": "ok"}


def _generate_next_occurrence(cur, task_id: int) -> Optional[dict]:
    """Gera a próxima ocorrência de uma tarefa recorrente (modelo "completar-e-gerar").

    Pressupõe que a tarefa ``task_id`` acabou de ser consumida (concluída ou excluída como
    "só esta"). Cria uma **nova linha viva** herdando os campos, com as subtarefas resetadas
    para não-concluídas (edge case 6), e **realoca** a regra (``task_recurrences.task_id``)
    para a nova linha. Se a série se esgotou, desativa a regra e não gera nada.

    Args:
        cur: Cursor psycopg2 ativo (mesma transação da conclusão/exclusão).
        task_id: Id da ocorrência consumida.

    Returns:
        ``{"generated_task_id": int, "next_due_date": str}`` quando gerou; ``None`` quando a
        tarefa não é recorrente ativa ou a série terminou.
    """
    # A regra é 1:1 com a tarefa VIVA; busca a regra ativa atrelada a esta tarefa.
    cur.execute(
        "SELECT id, rrule, mode, anchor_date FROM task_recurrences WHERE task_id = %s AND active",
        (task_id,),
    )
    rule = cur.fetchone()
    if not rule:
        return None  # não é recorrente (ou série já encerrada)
    rec_id, rrule, mode, anchor_date = rule

    # Campos da ocorrência consumida (herdados pela próxima).
    cur.execute(
        "SELECT project_id, title, description, type, priority, due_date, due_time FROM tasks WHERE id = %s",
        (task_id,),
    )
    project_id, title, description, ttype, priority, due_date, due_time = cur.fetchone()

    # Calcula a próxima data pela semântica do motor puro (research.md §3).
    nxt = rec_engine.next_occurrence(
        rrule, anchor_date, mode, current_due=due_date, completed_on=date.today()
    )
    if nxt is None:
        # Série esgotada (COUNT/UNTIL): desativa a regra, não gera.
        cur.execute("UPDATE task_recurrences SET active = FALSE WHERE id = %s", (rec_id,))
        return None

    # A nova ocorrência entra no fim da lista; em board, na primeira coluna (nunca na "done").
    new_column = _first_column_id(cur, project_id)
    cur.execute(
        f"SELECT COALESCE(MAX(position), 0) + %s FROM tasks WHERE project_id = %s AND parent_id IS NULL",
        (_POSITION_STEP, project_id),
    )
    position = cur.fetchone()[0]
    cur.execute(
        """
        INSERT INTO tasks
            (project_id, column_id, parent_id, title, description, type, priority, due_date, due_time, position)
        VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (project_id, new_column, title, description, ttype, priority, nxt, due_time, position),
    )
    new_id = cur.fetchone()[0]

    # Move a regra para a nova linha viva (UNIQUE(task_id) continua válido).
    cur.execute("UPDATE task_recurrences SET task_id = %s WHERE id = %s", (new_id, rec_id))

    # Reset de subárvore (BFS): clona toda a hierarquia de subtarefas da ocorrência consumida
    # como ABERTAS na nova ocorrência (edge case 6). Mantém o mapeamento old_id → new_id
    # para aninhar corretamente ao descer para filhos de filhos.
    queue = [(task_id, new_id)]   # fila BFS: (id_original, id_novo_pai)
    while queue:
        old_parent, new_parent = queue.pop(0)
        cur.execute(
            "SELECT id, title, description, type, priority, position FROM tasks "
            "WHERE parent_id = %s AND deleted_at IS NULL ORDER BY position, id",
            (old_parent,),
        )
        for old_id, s_title, s_desc, s_type, s_prio, s_pos in cur.fetchall():
            cur.execute(
                """
                INSERT INTO tasks (project_id, parent_id, title, description, type, priority, position)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (project_id, new_parent, s_title, s_desc, s_type, s_prio, s_pos),
            )
            new_child_id = cur.fetchone()[0]
            # Enfileira para clonar os filhos deste nó no próximo nível.
            queue.append((old_id, new_child_id))

    return {"generated_task_id": new_id, "next_due_date": nxt.isoformat()}


def set_recurrence(task_id: int, rrule: str, mode: str = "fixed") -> dict:
    """Anexa/substitui a regra de recorrência de uma tarefa (atalho público).

    Args:
        task_id: Id da tarefa (tarefa-pai com ``due_date``).
        rrule: Regra RFC 5545 (use ``recurrence.build_rrule`` para montar).
        mode: ``fixed`` (default) ou ``after_completion``.

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            result = _set_recurrence_on_cursor(cur, task_id, rrule, mode)
            if result["status"] == "error":
                conn.rollback()  # nada deve persistir em caso de regra inválida
    if result["status"] == "ok":
        result["message"] = "Recorrência definida."
    return result


def clear_recurrence(task_id: int) -> dict:
    """Remove a regra de recorrência de uma tarefa (volta a ser tarefa simples).

    Args:
        task_id: Id da tarefa.

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM task_recurrences WHERE task_id = %s", (task_id,))
    return {"status": "ok", "message": "Recorrência removida."}


# ─────────────────────────────────────────────────────────────────────────────
# Listagens
# ─────────────────────────────────────────────────────────────────────────────
def list_tasks(project_id: int, include_completed: bool = False) -> list[dict]:
    """Lista as tarefas-pai de uma lista (com subtarefas aninhadas), ordenadas por posição.

    Serve tanto a view lista quanto o Kanban (o front agrupa por ``column_id``).

    Args:
        project_id: Id da lista.
        include_completed: Se True, inclui também as tarefas-pai concluídas.

    Returns:
        Lista de tarefas-pai serializadas, cada uma com ``subtasks`` (lista). **Listagem**.
    """
    # Filtro de conclusão montado de forma parametrizada (sem interpolar valores).
    completed_clause = "" if include_completed else "AND completed_at IS NULL"
    parents = run_select(
        f"""
        SELECT {_TASK_COLUMNS} FROM tasks
        WHERE project_id = %(pid)s AND parent_id IS NULL AND deleted_at IS NULL
        {completed_clause}
        ORDER BY position, id
        """,
        {"pid": project_id},
    )
    parents = [_serialize_task(p) for p in parents]
    parents = _attach_subtasks(parents)   # árvore N-níveis recursiva (fatia 025)
    parents = _attach_recurrence(parents)
    # Anexa as tags (etiquetas) de cada tarefa-pai para a TaskRow mostrar os chips.
    parents = _attach_tags(parents)
    # Achata raízes + subtarefas em um único array flat para o batch de assignees (Komi).
    flat: list[dict] = []
    def _collect(nodes: list[dict]) -> None:
        for n in nodes:
            flat.append(n)
            if n.get("subtasks"):
                _collect(n["subtasks"])
    _collect(parents)
    _attach_assignees(flat)
    return parents


def list_tasks_today() -> dict:
    """Lista tarefas de hoje e vencidas (abertas), com o nome da lista em cada uma.

    Returns:
        ``{"overdue": [...], "today": [...]}`` — tarefas-pai abertas com ``due_date``
        anterior a hoje (overdue) ou igual a hoje (today). Cada item traz
        ``project_name`` para o consumidor agrupar. **Listagem**.
    """
    rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t JOIN task_projects p ON p.id = t.project_id
        WHERE t.parent_id IS NULL
          AND t.deleted_at IS NULL
          AND t.completed_at IS NULL
          AND t.due_date IS NOT NULL
          AND t.due_date <= CURRENT_DATE
        ORDER BY t.due_date, t.priority DESC, t.position
        """
    )
    today = date.today().isoformat()
    overdue, due_today = [], []
    for r in rows:
        item = _serialize_task(r)
        item["project_name"] = r["project_name"]
        # due_date já é string ISO aqui; compara como texto (ISO ordena cronologicamente).
        (due_today if item["due_date"] == today else overdue).append(item)
    # Anexa a recorrência ativa (glyph/eco) e as tags às tarefas das duas seções.
    _attach_recurrence(overdue)
    _attach_recurrence(due_today)
    _attach_tags(overdue)
    _attach_tags(due_today)
    return {"overdue": overdue, "today": due_today}


def list_eisenhower_tasks() -> list[dict]:
    """Lista todas as tarefas-pai abertas para a view Eisenhower.

    Retorna todas as tarefas abertas (não concluídas, não deletadas) sem filtro de
    lista — a classificação em quadrantes (urgente × importante) é feita no consumidor
    (front ou agente) sobre estes dados. Inclui ``project_name`` para contexto.

    Returns:
        Lista de tarefas-pai abertas com tags e ``project_name``, ordenadas por
        ``due_date`` ASC (NULL por último), prioridade DESC e posição.
    """
    rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        WHERE t.parent_id IS NULL
          AND t.completed_at IS NULL
          AND t.deleted_at IS NULL
        ORDER BY
            t.due_date ASC NULLS LAST,
            t.priority DESC,
            t.position
        """,
    )
    out = [_serialize_task(r) for r in rows]
    return _attach_tags(out)


def search_tasks(query: str) -> list[dict]:
    """Busca tarefas abertas por texto no título ou na descrição (ILIKE, case-insensitive).

    Args:
        query: Termo de busca.

    Returns:
        Lista plana de tarefas abertas que casam, com ``project_name``. **Listagem**.
    """
    if not query or not query.strip():
        return []
    rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t JOIN task_projects p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL AND t.completed_at IS NULL
          AND (t.title ILIKE %(q)s OR t.description ILIKE %(q)s)
        ORDER BY t.due_date NULLS LAST, t.priority DESC, t.position
        """,
        {"q": f"%{query.strip()}%"},
    )
    out = []
    for r in rows:
        item = _serialize_task(r)
        item["project_name"] = r["project_name"]
        out.append(item)
    out = _attach_recurrence(out)
    # Anexa as tags para os resultados da busca também mostrarem os chips.
    return _attach_tags(out)


def get_task(task_id: int) -> dict:
    """Busca uma tarefa específica pelo id, com subtarefas, recorrência, tags e responsáveis.

    Usado principalmente pelo frontend para reabrir uma tarefa mencionada em notas
    (chips [[id|Título]] no editor Markdown). Retorna o mesmo shape de list_tasks,
    mas para uma única tarefa pelo seu id.

    Args:
        task_id: Id numérico da tarefa a buscar.

    Returns:
        A tarefa serializada com subtasks/recurrence/tags/assignees se encontrada,
        ou ``{"status": "error", "message": "..."}`` se não existir ou estiver deletada.

    Example:
        >>> result = get_task(42)
        >>> result["title"]
        'Revisar proposta'
    """
    # Busca a tarefa pelo id, excluindo soft-deletes (deleted_at IS NOT NULL)
    rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        WHERE t.id = %(tid)s AND t.deleted_at IS NULL
        """,
        {"tid": task_id},
    )
    if not rows:
        # Tarefa não encontrada ou soft-deletada
        return {"status": "error", "message": f"Tarefa #{task_id} não encontrada."}

    # Serializa o resultado — converte datas/timestamps para strings ISO
    task = _serialize_task(rows[0])
    # Adiciona project_name para o frontend exibir o contexto da tarefa
    task["project_name"] = rows[0]["project_name"]

    # Agrupa num array de um elemento para usar os helpers de batch
    # (todos os helpers operam sobre listas para evitar N+1 queries)
    batch = [task]
    _attach_subtasks(batch)    # subtarefas aninhadas (árvore N-níveis)
    _attach_recurrence(batch)  # regra de recorrência ativa, se houver
    _attach_tags(batch)        # etiquetas (N:N via task_tags/task_tag_links)
    _attach_assignees(batch)   # responsáveis da Komi (person_links)

    # Retorna a tarefa única (fora do array) com status de sucesso
    return {"status": "ok", **batch[0]}


def list_trash(project_id: Optional[int] = None) -> list[dict]:
    """Lista as tarefas na lixeira (soft delete), opcionalmente de uma lista só.

    Args:
        project_id: Se informado, filtra pela lista; senão, traz de todas.

    Returns:
        Lista de tarefas soft-deletadas (mais recentes primeiro). **Listagem**.
    """
    where = "deleted_at IS NOT NULL"
    params: dict = {}
    if project_id is not None:
        where += " AND project_id = %(pid)s"
        params["pid"] = project_id
    rows = run_select(
        f"SELECT {_TASK_COLUMNS} FROM tasks WHERE {where} ORDER BY deleted_at DESC", params
    )
    return [_serialize_task(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Criação
# ─────────────────────────────────────────────────────────────────────────────
def create_task(
    title: str,
    project_id: Optional[int] = None,
    project_name: Optional[str] = None,
    parent_id: Optional[int] = None,
    priority: int = 0,
    type: str = "task",
    due_date: Optional[str] = None,
    due_time: Optional[str] = None,
    description: Optional[str] = None,
    recurrence: Optional[dict] = None,
    column_id: Optional[int] = None,
    tags: Optional[list] = None,
    person_ids: Optional[list] = None,
    allow_empty_title: bool = False,
) -> dict:
    """Cria uma tarefa (ou subtarefa) e a posiciona no fim da sua lista/escopo.

    Resolução da lista: ``project_id`` tem prioridade; senão tenta ``project_name``
    (usado pelo agente); se nada resolver, cai no **Inbox** (captura órfã).

    Resolução da coluna (Kanban): se ``column_id`` for passado, a tarefa nasce nessa coluna
    (validada contra a lista). Se não for passado mas a lista **tiver board** (≥1 coluna), a
    tarefa cai na **primeira coluna** — assim ela aparece no Kanban e a view Lista e o Kanban
    nunca divergem. Listas sem board continuam com a tarefa sem coluna (Kanban é opcional).

    Args:
        title: Título da tarefa. Normalmente não-vazio; mas o webapp pode criar uma linha
            placeholder vazia para edição inline — nesses casos passa ``allow_empty_title=True``.
        project_id: Id da lista (webapp envia isto).
        project_name: Nome da lista (agente envia isto; resolvido por prefixo).
        parent_id: Se informado, cria subtarefa (N níveis) sob essa tarefa-pai.
        priority: 0..3 (nenhuma/baixa/média/alta).
        type: ``task`` | ``event`` | ``birthday``.
        due_date: "YYYY-MM-DD" (opcional).
        due_time: "HH:MM" (exige ``due_date``).
        description: Notas (opcional).
        recurrence: ``{"rrule": str, "mode": "fixed"|"after_completion"}`` (opcional). Exige
            ``due_date`` (a âncora). ``type="birthday"`` + ``due_date`` cria recorrência anual
            automática mesmo sem este parâmetro.
        column_id: Coluna de Kanban onde criar a tarefa (opcional). Ignorado em subtarefas. Se
            omitido e a lista tiver board, usa a primeira coluna automaticamente.
        tags: Lista de nomes de tag a vincular (opcional). Tags inexistentes são criadas
            na hora; o nome é único ignorando caixa (``Mercado`` == ``mercado``).
        person_ids: Lista de UUIDs de pessoas a vincular à tarefa (spec 014 / FR-009). Opcional.
        allow_empty_title: Se ``True``, permite criar a tarefa com título vazio (string vazia
            ``""``). Usado exclusivamente pelo router do webapp para criação inline na árvore
            de tarefas — o agente Telegram nunca passa ``True`` e continua recebendo erro
            amigável se tentar criar uma tarefa sem título.

    Returns:
        ``{"status": "ok", "id": <int>, "project_id": <int>}`` ou erro em português.
    """
    # Normaliza o título: aceita None ou ausente do body — trata como string vazia.
    # Isso evita AttributeError em title.strip() quando o webapp omite o campo.
    title = title or ""

    # ── Validações de entrada (mensagens amigáveis antes dos CHECKs do banco) ──
    # Título vazio é bloqueado para o agente Telegram (allow_empty_title=False por padrão).
    # O webapp passa allow_empty_title=True para criar linhas-placeholder da edição inline.
    if not allow_empty_title and not title.strip():
        return {"status": "error", "message": "O título não pode ser vazio."}
    if priority not in _VALID_PRIORITIES:
        return {"status": "error", "message": "Prioridade inválida (use 0, 1, 2 ou 3)."}
    if type not in _VALID_TYPES:
        return {"status": "error", "message": "Tipo inválido (use task, event ou birthday)."}
    if due_time and not due_date:
        return {"status": "error", "message": "Hora de vencimento exige uma data."}

    # ── Recorrência: resolve a intenção e valida ANTES de escrever (get_conn commita no return) ──
    # Aniversário com data vira recorrência anual automática (mesmo sem o parâmetro explícito).
    rec = recurrence
    if type == "birthday" and due_date and rec is None:
        rec = {"rrule": rec_engine.build_rrule("YEARLY"), "mode": "fixed"}
    if rec is not None:
        if parent_id is not None:
            return {"status": "error", "message": "Subtarefas não podem ser recorrentes."}
        err = _validate_recurrence(rec.get("rrule", ""), rec.get("mode", "fixed"), due_date)
        if err:
            return {"status": "error", "message": err}

    with get_conn() as conn:
        with conn.cursor() as cur:
            # ── Subtarefa: valida o pai (existe, vivo, profundidade ≤ 12, não concluído) ──
            if parent_id is not None:
                cur.execute(
                    "SELECT project_id, parent_id, completed_at, deleted_at FROM tasks WHERE id = %s",
                    (parent_id,),
                )
                parent = cur.fetchone()
                if not parent or parent[3] is not None:  # inexistente ou na lixeira
                    return {"status": "error", "message": "Tarefa-pai não encontrada."}
                if parent[2] is not None:  # pai concluído
                    return {"status": "error", "message": "A tarefa-pai está concluída — reabra-a antes de adicionar subtarefas."}
                # Verifica o limite de profundidade (12 níveis) subindo a árvore via CTE.
                cur.execute(
                    """
                    WITH RECURSIVE ancestors AS (
                        SELECT id, parent_id, 1 AS depth
                        FROM tasks WHERE id = %s
                        UNION ALL
                        SELECT t.id, t.parent_id, a.depth + 1
                        FROM tasks t JOIN ancestors a ON t.id = a.parent_id
                        WHERE a.depth < 14
                    )
                    SELECT COALESCE(MAX(depth), 0) FROM ancestors
                    """,
                    (parent_id,),
                )
                depth_of_parent = cur.fetchone()[0]
                if depth_of_parent >= 12:
                    return {"status": "error", "message": "Profundidade máxima de 12 níveis atingida."}
                # Subtarefa herda a lista do pai e nasce sem coluna.
                resolved_project = parent[0]
                resolved_column = None
                scope_filter = "parent_id = %s"
                scope_val = parent_id
            else:
                # ── Tarefa-pai: resolve a lista (id > nome > Inbox) ──
                if project_id is not None:
                    cur.execute("SELECT id FROM task_projects WHERE id = %s AND archived_at IS NULL", (project_id,))
                    if not cur.fetchone():
                        return {"status": "error", "message": "Lista não encontrada."}
                    resolved_project = project_id
                elif project_name:
                    resolved_project = resolve_project_id_by_name(project_name) or _get_inbox_id(cur)
                else:
                    resolved_project = _get_inbox_id(cur)
                # ── Coluna do Kanban (só para tarefa-pai) ──
                if column_id is not None:
                    # Coluna explícita: precisa existir E pertencer à lista resolvida.
                    cur.execute(
                        "SELECT 1 FROM task_columns WHERE id = %s AND project_id = %s",
                        (column_id, resolved_project),
                    )
                    if not cur.fetchone():
                        return {"status": "error", "message": "Coluna não encontrada nesta lista."}
                    resolved_column = column_id
                else:
                    # Sem coluna explícita: se a lista tiver board, entra na 1ª coluna (aparece no
                    # Kanban e mantém Lista⇄Kanban em sincronia); sem board, fica sem coluna.
                    resolved_column = _first_column_id(cur, resolved_project)
                scope_filter = "project_id = %s AND parent_id IS NULL"
                scope_val = resolved_project

            # ── Posição: fim do escopo (irmãos da mesma lista/pai) ──
            cur.execute(
                f"SELECT COALESCE(MAX(position), 0) + %s FROM tasks WHERE {scope_filter}",
                (_POSITION_STEP, scope_val),
            )
            position = cur.fetchone()[0]

            # ── Insere ──
            cur.execute(
                """
                INSERT INTO tasks
                    (project_id, column_id, parent_id, title, description, type, priority,
                     due_date, due_time, position)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    resolved_project, resolved_column, parent_id, title.strip(),
                    description, type, priority, due_date, due_time, position,
                ),
            )
            new_id = cur.fetchone()[0]

            # Recorrência: a tarefa já existe e a regra foi validada acima → anexa na mesma transação.
            if rec is not None:
                _set_recurrence_on_cursor(cur, new_id, rec["rrule"], rec.get("mode", "fixed"))

            # Tags: grava o conjunto de etiquetas na MESMA transação (criando as que faltarem).
            if tags is not None:
                _set_task_tags(cur, new_id, tags)

            # Vínculos de pessoas — mesma transação (spec 014 / FR-009). Import lazy para
            # evitar ciclo agents.kaguya → agents.komi → agents.kaguya.
            if person_ids:
                from agents.komi.tools import link_person_on_cursor  # noqa: PLC0415
                for pid in person_ids:
                    link_person_on_cursor(cur, pid, "task", new_id)

    result = {"status": "ok", "id": new_id, "project_id": resolved_project, "message": f"Tarefa '{title.strip()}' criada."}
    # Espelha no Google Calendar fora da transação (best-effort; nunca bloqueia o CRUD)
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(new_id)
    except Exception:
        pass
    # Hook Kaguya→Komi: cria person_date na Komi quando a tarefa é de aniversário (fase 026).
    # Lazy import dentro do try/except evita ciclo agents.kaguya → agents.komi → agents.kaguya.
    if type == "birthday":
        try:
            from agents.kaguya import komi_sync as _ks
            _ks.push_birthday(new_id)
        except Exception:
            pass
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Edição / mover
# ─────────────────────────────────────────────────────────────────────────────
def update_task(
    task_id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
    priority: Optional[int] = None,
    type: Optional[str] = None,
    due_date: Optional[str] = None,
    due_time: Optional[str] = None,
    project_id: Optional[int] = None,
    column_id: Optional[int] = None,
    recurrence: Optional[dict] = None,
    clear_recurrence: bool = False,
    tags: Optional[list] = None,
    duration_min: Optional[int] = None,
    person_ids: Optional[list] = None,
) -> dict:
    """Edita campos de uma tarefa; mover de lista aplica a regra da coluna do destino.

    Ao trocar ``project_id``, a tarefa entra na primeira coluna do board destino (ou
    fica sem coluna se o destino não tiver board) — a menos que ``column_id`` seja
    passado explicitamente.

    Args:
        task_id: Id da tarefa.
        title/description/priority/type/due_date/due_time/project_id/column_id:
            Campos a atualizar (todos opcionais; PATCH parcial).
        recurrence: ``{"rrule", "mode"}`` para anexar/editar a regra (mantém a âncora — edge 8).
        clear_recurrence: Se True, remove a regra (tarefa volta a ser simples).
        tags: Se informado (lista de nomes), substitui o conjunto de tags da tarefa
            (lista vazia = remover todas). ``None`` = não mexe nas tags.
        duration_min: Estimativa de duração em minutos (insumo da CapacityBar do Meu Dia).
        person_ids: Se informado (lista de UUIDs), **substitui** o conjunto de responsáveis
            (fatia 025). Lista vazia = remover todos. ``None`` = não mexe.

    Returns:
        Dicionário de status.
    """
    # Validações dos campos enumerados.
    if priority is not None and priority not in _VALID_PRIORITIES:
        return {"status": "error", "message": "Prioridade inválida (use 0, 1, 2 ou 3)."}
    if type is not None and type not in _VALID_TYPES:
        return {"status": "error", "message": "Tipo inválido (use task, event ou birthday)."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT due_date, project_id FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,))
            existing = cur.fetchone()
            if not existing:
                return {"status": "error", "message": "Tarefa não encontrada."}
            current_project_id = existing[1]   # lista atual — base para detectar troca real de lista

            sets, params = [], {"id": task_id}
            if title is not None:
                if not title.strip():
                    return {"status": "error", "message": "O título não pode ser vazio."}
                sets.append("title = %(title)s")
                params["title"] = title.strip()
            if description is not None:
                sets.append("description = %(description)s")
                params["description"] = description
            if priority is not None:
                sets.append("priority = %(priority)s")
                params["priority"] = priority
            if type is not None:
                sets.append("type = %(type)s")
                params["type"] = type
            if due_date is not None:
                sets.append("due_date = %(due_date)s")
                params["due_date"] = due_date
            if due_time is not None:
                # Hora exige data: ou a nova data veio junto, ou a tarefa já tinha data.
                if not due_date and existing[0] is None:
                    return {"status": "error", "message": "Hora de vencimento exige uma data."}
                sets.append("due_time = %(due_time)s")
                params["due_time"] = due_time

            # Mover de lista: só aplica a regra da coluna quando o project_id MUDA de verdade.
            # (Antes, qualquer PATCH com project_id — mesmo igual ao atual, como o TaskModal
            # sempre envia — resetava a coluna para a primeira; por isso editar a prioridade
            # jogava o card de volta pra 1ª coluna.)
            if project_id is not None and project_id != current_project_id:
                cur.execute("SELECT 1 FROM task_projects WHERE id = %s AND archived_at IS NULL", (project_id,))
                if not cur.fetchone():
                    return {"status": "error", "message": "Lista de destino não encontrada."}
                sets.append("project_id = %(project_id)s")
                params["project_id"] = project_id
                if column_id is None:
                    params["column_id"] = _first_column_id(cur, project_id)
                    sets.append("column_id = %(column_id)s")
            if column_id is not None:
                # Valida que a coluna pertence à lista efetiva da tarefa (após eventual troca
                # de lista feita acima). Sem essa checagem, um column_id de outra lista seria
                # gravado e o card ficaria invisível no board desta lista.
                # Nota: create_task já faz essa validação em ~linha 647; aqui espelhamos.
                effective_project = params.get("project_id", current_project_id)
                cur.execute(
                    "SELECT 1 FROM task_columns WHERE id = %s AND project_id = %s",
                    (column_id, effective_project),
                )
                if not cur.fetchone():
                    return {"status": "error", "message": "Coluna não pertence à lista da tarefa."}
                sets.append("column_id = %(column_id)s")
                params["column_id"] = column_id

            # Estimativa de duração do Meu Dia (fatia 016).
            if duration_min is not None:
                sets.append("duration_min = %(duration_min)s")
                params["duration_min"] = duration_min

            # Há algo a fazer? campos OU recorrência OU tags OU responsáveis (fatia 025).
            if (not sets and recurrence is None and not clear_recurrence
                    and type != "birthday" and tags is None and person_ids is None):
                return {"status": "error", "message": "Nada para atualizar."}

            # Aplica as mudanças de campo (se houver) antes de mexer na recorrência.
            if sets:
                sets.append("updated_at = now()")
                cur.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = %(id)s", params)

            # Tags: aplica o conjunto exato de etiquetas (lista vazia = remover todas).
            if tags is not None:
                _set_task_tags(cur, task_id, tags)

            # Responsáveis (Komi) — semântica de substituição: apaga os antigos e insere os novos.
            # Import lazy dentro da transação para evitar ciclo circular entre módulos.
            if person_ids is not None:
                from agents.komi.tools import unlink_people_on_cursor, link_person_on_cursor  # noqa: PLC0415
                unlink_people_on_cursor(cur, "task", task_id)
                for pid in person_ids:
                    link_person_on_cursor(cur, pid, "task", task_id)

            # ── Recorrência: limpar, definir, ou garantir a anual ao virar aniversário ──
            rec_result = None
            if clear_recurrence:
                cur.execute("DELETE FROM task_recurrences WHERE task_id = %s", (task_id,))
            elif recurrence is not None:
                rec_result = _set_recurrence_on_cursor(
                    cur, task_id, recurrence.get("rrule", ""), recurrence.get("mode", "fixed")
                )
            elif type == "birthday":
                # Virou aniversário: se tiver data e ainda não tiver regra, cria a anual automática.
                cur.execute("SELECT due_date FROM tasks WHERE id = %s", (task_id,))
                dd = cur.fetchone()[0]
                if dd is not None:
                    cur.execute("SELECT 1 FROM task_recurrences WHERE task_id = %s AND active", (task_id,))
                    if not cur.fetchone():
                        rec_result = _set_recurrence_on_cursor(
                            cur, task_id, rec_engine.build_rrule("YEARLY"), "fixed"
                        )
            # Regra inválida → desfaz tudo (a edição de campos também) para não persistir pela metade.
            if rec_result is not None and rec_result["status"] == "error":
                conn.rollback()
                return rec_result
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(task_id)
    except Exception:
        pass
    # Hook Kaguya→Komi: propaga para Komi se a tarefa é (ou virou) aniversário (fase 026).
    # O SELECT do type ocorre APÓS o commit para pegar o valor atualizado.
    # O komi_sync.push_birthday compara due_date atual — no-op se já sincronizado (anti-loop).
    try:
        from agents.db import run_select as _rs
        _type_rows = _rs("SELECT type FROM tasks WHERE id = %(tid)s", {"tid": task_id})
        if _type_rows and _type_rows[0]["type"] == "birthday":
            from agents.kaguya import komi_sync as _ks
            _ks.push_birthday(task_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Tarefa atualizada."}


# ─────────────────────────────────────────────────────────────────────────────
# Concluir / reabrir
# ─────────────────────────────────────────────────────────────────────────────
def _complete_task_on_cursor(cur, task_id: int, cascade: bool = False, end_series: bool = False) -> dict:
    """Completa uma tarefa usando um cursor já aberto (sem abrir transação própria).

    Extraído para que ``complete_payment_task`` (tarefa + despesa) possa completar a
    tarefa **na mesma transação** do lançamento financeiro (atomicidade — FR-014). Se a tarefa
    for recorrente ativa, a próxima ocorrência é gerada aqui mesmo (modelo "completar-e-gerar")
    — então pagamentos recorrentes também regeneram atomicamente.

    Args:
        cur: Cursor psycopg2 ativo.
        task_id: Id da tarefa a completar.
        cascade: Se True, completa as subtarefas abertas junto.
        end_series: Se True (numa recorrente), encerra a série — conclui sem gerar a próxima e
            desativa a regra (preserva o histórico).

    Returns:
        ``{"status": "ok", "generated_task_id"?: int, "next_due_date"?: str}`` ou
        ``{"status": "error", "needs_cascade": True, ...}`` quando há subtarefas abertas e
        ``cascade`` é False.
    """
    cur.execute(
        "SELECT parent_id, completed_at, deleted_at FROM tasks WHERE id = %s", (task_id,)
    )
    row = cur.fetchone()
    if not row or row[2] is not None:
        return {"status": "error", "message": "Tarefa não encontrada."}

    # Se for tarefa-pai, verifica subtarefas abertas antes de concluir.
    if row[0] is None:
        cur.execute(
            "SELECT COUNT(*) FROM tasks WHERE parent_id = %s AND completed_at IS NULL AND deleted_at IS NULL",
            (task_id,),
        )
        open_subs = cur.fetchone()[0]
        if open_subs > 0 and not cascade:
            # O canal deve confirmar com o usuário e repetir com cascade=True.
            return {
                "status": "error",
                "needs_cascade": True,
                "open_subtasks": open_subs,
                "message": f"Esta tarefa tem {open_subs} subtarefa(s) aberta(s). Concluir todas?",
            }
        if open_subs > 0 and cascade:
            cur.execute(
                "UPDATE tasks SET completed_at = now(), updated_at = now() "
                "WHERE parent_id = %s AND completed_at IS NULL AND deleted_at IS NULL",
                (task_id,),
            )

    # Completa a própria tarefa.
    cur.execute(
        "UPDATE tasks SET completed_at = now(), updated_at = now() WHERE id = %s", (task_id,)
    )

    # ── Recorrência: gerar a próxima ocorrência ou encerrar a série ──
    result = {"status": "ok"}
    cur.execute("SELECT 1 FROM task_recurrences WHERE task_id = %s AND active", (task_id,))
    if cur.fetchone():
        if end_series:
            # "Concluir para sempre": desativa a regra (preserva histórico), não gera a próxima.
            cur.execute("UPDATE task_recurrences SET active = FALSE WHERE task_id = %s", (task_id,))
            result["generated_task_id"] = None
            result["series_ended"] = True
        else:
            gen = _generate_next_occurrence(cur, task_id)
            result["generated_task_id"] = gen["generated_task_id"] if gen else None
            if gen:
                result["next_due_date"] = gen["next_due_date"]
    return result


def complete_task(task_id: int, cascade: bool = False, end_series: bool = False) -> dict:
    """Completa uma tarefa (e suas subtarefas, se ``cascade``). Recebe também o drop na coluna done.

    Numa tarefa recorrente, concluir gera a próxima ocorrência (``generated_task_id``/
    ``next_due_date`` na resposta); ``end_series=True`` encerra a série em vez de gerar.

    Args:
        task_id: Id da tarefa.
        cascade: Se True, conclui em cascata as subtarefas abertas.
        end_series: Se True (recorrente), encerra a série em vez de gerar a próxima.

    Returns:
        Dicionário de status; com ``needs_cascade`` quando há subtarefas abertas e
        ``cascade`` é False (o canal pergunta e repete com ``cascade=True``).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            result = _complete_task_on_cursor(cur, task_id, cascade, end_series)
            if result["status"] == "error" and not result.get("needs_cascade"):
                # Erro "real" (tarefa inexistente): desfaz para não commitar nada.
                conn.rollback()
            elif result.get("needs_cascade"):
                conn.rollback()  # ainda não concluiu nada — só sinaliza a confirmação
    if result["status"] == "ok":
        result["message"] = "Tarefa concluída."
        try:
            from agents.kaguya import gcal_sync as _gs
            _gs.push_task(task_id)
        except Exception:
            pass
    return result


def reopen_task(task_id: int) -> dict:
    """Reabre uma tarefa concluída (limpa ``completed_at``).

    Bloqueia reabrir uma subtarefa cujo pai está concluído (estado inconsistente):
    sugere reabrir o pai primeiro.

    Args:
        task_id: Id da tarefa a reabrir.

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT parent_id, deleted_at FROM tasks WHERE id = %s", (task_id,)
            )
            row = cur.fetchone()
            if not row or row[1] is not None:
                return {"status": "error", "message": "Tarefa não encontrada."}
            # Se é subtarefa, o pai precisa estar aberto.
            if row[0] is not None:
                cur.execute("SELECT completed_at FROM tasks WHERE id = %s", (row[0],))
                parent = cur.fetchone()
                if parent and parent[0] is not None:
                    return {
                        "status": "error",
                        "message": "A tarefa-pai está concluída — reabra-a primeiro.",
                    }
            cur.execute(
                "UPDATE tasks SET completed_at = NULL, updated_at = now() WHERE id = %s", (task_id,)
            )
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(task_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Tarefa reaberta."}


# ─────────────────────────────────────────────────────────────────────────────
# Mover / re-parentear (fatia 025) — DnD 3 zonas + indent/outdent/promote
# ─────────────────────────────────────────────────────────────────────────────
def move_task(
    task_id: int,
    new_parent_id: Optional[int],
    after_id: Optional[int] = None,
    before_id: Optional[int] = None,
) -> dict:
    """Move uma tarefa para um novo pai (re-parentear) e posiciona entre vizinhos.

    Cobre os 3 casos do drag-and-drop de árvore:
    - ``before`` / ``after`` (same parent): muda apenas posição no mesmo escopo
    - ``child`` (novo pai): muda ``parent_id`` + ``project_id`` + calcula nova posição

    Validações:
    - Anti-ciclo: ``new_parent_id`` não pode ser a própria tarefa nem nenhum descendente.
    - Profundidade: a subárvore movida não pode ultrapassar 12 níveis.
    - Mãe concluída: não pode receber subtarefas.

    Args:
        task_id: Tarefa a mover.
        new_parent_id: Novo pai (``None`` para promover a tarefa-raiz).
        after_id: Vizinho que deve ficar **antes** no destino (opcional).
        before_id: Vizinho que deve ficar **depois** no destino (opcional).

    Returns:
        ``{"status": "ok", "position": <int>}`` ou erro.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Carrega estado atual da tarefa.
            cur.execute(
                "SELECT project_id, parent_id, deleted_at FROM tasks WHERE id = %s",
                (task_id,),
            )
            row = cur.fetchone()
            if not row or row[2] is not None:
                return {"status": "error", "message": "Tarefa não encontrada."}
            current_project_id, current_parent_id = row[0], row[1]

            # ── Anti-ciclo: proíbe tornar um descendente o novo pai ──
            if new_parent_id is not None:
                if new_parent_id == task_id:
                    return {"status": "error", "message": "Uma tarefa não pode ser seu próprio pai."}
                # Busca todos os descendentes da tarefa movida (CTE recursiva).
                cur.execute(
                    """
                    WITH RECURSIVE desc_tree AS (
                        SELECT id FROM tasks WHERE parent_id = %s AND deleted_at IS NULL
                        UNION ALL
                        SELECT t.id FROM tasks t
                        JOIN desc_tree d ON t.parent_id = d.id
                        WHERE t.deleted_at IS NULL
                    )
                    SELECT id FROM desc_tree WHERE id = %s
                    """,
                    (task_id, new_parent_id),
                )
                if cur.fetchone():
                    return {"status": "error", "message": "Não é possível mover uma tarefa para dentro de um de seus descendentes."}

                # Valida o novo pai (existe, não concluído, sem lixeira).
                cur.execute(
                    "SELECT project_id, completed_at, deleted_at FROM tasks WHERE id = %s",
                    (new_parent_id,),
                )
                new_parent_row = cur.fetchone()
                if not new_parent_row or new_parent_row[2] is not None:
                    return {"status": "error", "message": "Tarefa-pai de destino não encontrada."}
                if new_parent_row[1] is not None:
                    return {"status": "error", "message": "A tarefa-pai de destino está concluída."}

                # Verifica profundidade: o pai de destino não pode estar a ≥ 11 níveis
                # (deixa espaço para a subárvore movida atingir 12 no total).
                cur.execute(
                    """
                    WITH RECURSIVE ancestors AS (
                        SELECT id, parent_id, 1 AS depth
                        FROM tasks WHERE id = %s
                        UNION ALL
                        SELECT t.id, t.parent_id, a.depth + 1
                        FROM tasks t JOIN ancestors a ON t.id = a.parent_id
                        WHERE a.depth < 14
                    )
                    SELECT COALESCE(MAX(depth), 0) FROM ancestors
                    """,
                    (new_parent_id,),
                )
                dest_depth = cur.fetchone()[0]
                if dest_depth >= 11:
                    return {"status": "error", "message": "Profundidade máxima de 12 níveis atingida no destino."}

                resolved_project = new_parent_row[0]
            else:
                # Promovendo a tarefa-raiz: mantém o project_id atual.
                resolved_project = current_project_id

            # ── Calcula nova posição (ponto médio entre vizinhos no novo escopo) ──
            scope_cond = "project_id = %s AND parent_id IS NOT DISTINCT FROM %s"
            scope_params = (resolved_project, new_parent_id)

            cur.execute(
                f"""
                SELECT id, position FROM tasks
                WHERE {scope_cond}
                  AND deleted_at IS NULL AND id <> %s
                ORDER BY position, id
                """,
                (*scope_params, task_id),
            )
            scope_rows = cur.fetchall()
            order = [r[0] for r in scope_rows]
            pos_by_id = {r[0]: r[1] for r in scope_rows}

            def _mid_pos() -> int:
                """Calcula posição de destino pelo ponto médio entre after_id e before_id."""
                if after_id and after_id in pos_by_id:
                    lo = pos_by_id[after_id]
                    idx = order.index(after_id)
                    hi = pos_by_id[order[idx + 1]] if idx + 1 < len(order) else None
                    if hi is None:
                        return lo + _POSITION_STEP
                    mid = (lo + hi) // 2
                    return mid if mid > lo else None  # type: ignore[return-value]
                if before_id and before_id in pos_by_id:
                    hi = pos_by_id[before_id]
                    idx = order.index(before_id)
                    lo = pos_by_id[order[idx - 1]] if idx > 0 else None
                    if lo is None:
                        mid = hi // 2
                        return mid if mid < hi else None  # type: ignore[return-value]
                    mid = (lo + hi) // 2
                    return mid if mid > lo else None  # type: ignore[return-value]
                # Sem vizinhos: fim do escopo.
                return (pos_by_id[order[-1]] + _POSITION_STEP) if order else _POSITION_STEP

            target = _mid_pos()
            # Se o ponto médio colidiu (sem inteiro livre), renormaliza o escopo e tenta de novo.
            if target is None:
                for rank, tid in enumerate(order, start=1):
                    cur.execute("UPDATE tasks SET position = %s WHERE id = %s", (rank * _POSITION_STEP, tid))
                pos_by_id = {tid: (i + 1) * _POSITION_STEP for i, tid in enumerate(order)}
                target = _mid_pos() or (_POSITION_STEP * (len(order) + 1))

            # ── Aplica o move atômico ──
            cur.execute(
                """
                UPDATE tasks
                SET parent_id = %s, project_id = %s, position = %s, column_id = NULL,
                    updated_at = now()
                WHERE id = %s
                """,
                (new_parent_id, resolved_project, target, task_id),
            )

            # Re-parenteia os descendentes: herdam o novo project_id para ficarem
            # no mesmo grupo visual (mantém a coesão da subárvore).
            if resolved_project != current_project_id:
                cur.execute(
                    """
                    WITH RECURSIVE moved_sub AS (
                        SELECT id FROM tasks WHERE parent_id = %s AND deleted_at IS NULL
                        UNION ALL
                        SELECT t.id FROM tasks t
                        JOIN moved_sub m ON t.parent_id = m.id
                        WHERE t.deleted_at IS NULL
                    )
                    UPDATE tasks SET project_id = %s, column_id = NULL, updated_at = now()
                    WHERE id IN (SELECT id FROM moved_sub)
                    """,
                    (task_id, resolved_project),
                )

    # Espelha no GCal fora da transação (best-effort).
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(task_id)
    except Exception:
        pass
    return {"status": "ok", "position": target, "message": "Tarefa movida."}


# ─────────────────────────────────────────────────────────────────────────────
# Reordenação manual (posições esparsas + renormalização)
# ─────────────────────────────────────────────────────────────────────────────
def reorder_task(task_id: int, after_id: Optional[int] = None, before_id: Optional[int] = None) -> dict:
    """Reordena uma tarefa entre dois vizinhos (posição esparsa; renormaliza em colisão).

    O escopo de ordenação é o conjunto de tarefas com a **mesma lista e mesmo pai**
    (top-level juntas; subtarefas de um pai juntas).

    Args:
        task_id: Tarefa a mover.
        after_id: Vizinho que deve ficar **antes** dela (opcional).
        before_id: Vizinho que deve ficar **depois** dela (opcional).

    Returns:
        ``{"status": "ok", "position": <int>}`` ou erro.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT project_id, parent_id FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "Tarefa não encontrada."}
            project_id, parent_id = row

            def _load_scope() -> tuple[list[int], dict[int, int]]:
                """Carrega o escopo (mesma lista + mesmo pai) **sem** a tarefa movida.

                ``IS NOT DISTINCT FROM`` trata NULL = NULL (subtarefas de pais distintos
                e tarefas top-level são escopos separados).

                Returns:
                    (ordem dos ids por posição, mapa id→posição).
                """
                cur.execute(
                    """
                    SELECT id, position FROM tasks
                    WHERE project_id = %s AND parent_id IS NOT DISTINCT FROM %s
                      AND deleted_at IS NULL AND id <> %s
                    ORDER BY position, id
                    """,
                    (project_id, parent_id, task_id),
                )
                rows = cur.fetchall()
                return [r[0] for r in rows], {r[0]: r[1] for r in rows}

            def _bounds(order: list[int], pos_by_id: dict[int, int]) -> tuple:
                """Deriva (limite_inferior, limite_superior) a partir de after_id/before_id.

                "Inserir após after_id" = entre after_id e quem vem depois dele.
                "Inserir antes de before_id" = entre quem vem antes e before_id.
                Sem vizinhos → fim do escopo.
                """
                if after_id is not None and after_id in pos_by_id:
                    lower = pos_by_id[after_id]
                    idx = order.index(after_id)
                    upper = pos_by_id[order[idx + 1]] if idx + 1 < len(order) else None
                    return lower, upper
                if before_id is not None and before_id in pos_by_id:
                    upper = pos_by_id[before_id]
                    idx = order.index(before_id)
                    lower = pos_by_id[order[idx - 1]] if idx - 1 >= 0 else None
                    return lower, upper
                # Sem vizinhos: solta no fim (após o último), ou 1000 se o escopo está vazio.
                return (pos_by_id[order[-1]] if order else 0), None

            def _target(lower, upper) -> tuple[int, bool]:
                """Calcula a posição-alvo e se houve colisão (não há inteiro livre entre os limites)."""
                if lower is not None and upper is not None:
                    mid = (lower + upper) // 2
                    return mid, (mid <= lower or mid >= upper)
                if lower is not None:                      # fim da lista
                    return lower + _POSITION_STEP, False
                if upper is not None:                      # começo da lista
                    mid = upper // 2
                    return mid, (mid <= 0 or mid >= upper)
                return _POSITION_STEP, False               # escopo vazio

            order, pos_by_id = _load_scope()
            lower, upper = _bounds(order, pos_by_id)
            target, collision = _target(lower, upper)

            # Colisão → renumera o escopo em passos de 1000 e recalcula (agora há folga).
            if collision:
                for rank, tid in enumerate(order, start=1):
                    cur.execute("UPDATE tasks SET position = %s WHERE id = %s", (rank * _POSITION_STEP, tid))
                pos_by_id = {tid: (i + 1) * _POSITION_STEP for i, tid in enumerate(order)}
                lower, upper = _bounds(order, pos_by_id)
                target, _ = _target(lower, upper)

            cur.execute(
                "UPDATE tasks SET position = %s, updated_at = now() WHERE id = %s", (target, task_id)
            )
    return {"status": "ok", "position": target, "message": "Ordem atualizada."}


# ─────────────────────────────────────────────────────────────────────────────
# Soft delete / restaurar
# ─────────────────────────────────────────────────────────────────────────────
def delete_task(task_id: int, scope: str = "this") -> dict:
    """Soft delete: marca ``deleted_at`` na tarefa e nas subtarefas dela.

    Numa tarefa recorrente, ``scope`` decide o destino da série:
    ``this`` (default) exclui só esta ocorrência e **gera a próxima**; ``series`` exclui esta e
    **desativa** a regra (sem gerar) — a regra é preservada como histórico.

    Args:
        task_id: Id da tarefa a excluir.
        scope: ``this`` | ``series`` (só relevante em recorrentes).

    Returns:
        Dicionário de status (a tarefa fica restaurável na lixeira).
    """
    if scope not in ("this", "series"):
        return {"status": "error", "message": "Escopo inválido (use 'this' ou 'series')."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}

            # ── Recorrência: gera a próxima (this) ou desativa a regra (series), antes de excluir ──
            generated = None
            cur.execute("SELECT 1 FROM task_recurrences WHERE task_id = %s AND active", (task_id,))
            if cur.fetchone():
                if scope == "series":
                    cur.execute("UPDATE task_recurrences SET active = FALSE WHERE task_id = %s", (task_id,))
                else:  # "this": a série continua — gera a próxima ocorrência antes do soft delete
                    generated = _generate_next_occurrence(cur, task_id)

            # Marca a tarefa e suas subtarefas vivas de uma vez (a própria + filhas).
            cur.execute(
                "UPDATE tasks SET deleted_at = now(), updated_at = now() "
                "WHERE (id = %s OR parent_id = %s) AND deleted_at IS NULL",
                (task_id, task_id),
            )
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.remove_task_event(task_id)
    except Exception:
        pass
    # Hook Kaguya→Komi: remove o person_date correspondente SOMENTE quando scope='series'
    # (encerra a série inteira). scope='this' apaga apenas a ocorrência — a série continua,
    # então o person_date é preservado.
    # A tarefa já está soft-deleted quando este hook roda (deleted_at IS NOT NULL), mas o
    # birthday_sync_links ainda existe porque soft-delete NÃO dispara ON DELETE CASCADE.
    if scope == "series":
        try:
            from agents.db import run_select as _rs
            _type_rows = _rs("SELECT type FROM tasks WHERE id = %(tid)s", {"tid": task_id})
            if _type_rows and _type_rows[0]["type"] == "birthday":
                from agents.kaguya import komi_sync as _ks
                _ks.remove_birthday(task_id)
        except Exception:
            pass
    result = {"status": "ok", "message": "Tarefa enviada para a lixeira."}
    if generated:
        result["generated_task_id"] = generated["generated_task_id"]
    return result


def restore_task(task_id: int) -> dict:
    """Restaura uma tarefa da lixeira (limpa ``deleted_at`` da tarefa e das subtarefas).

    Args:
        task_id: Id da tarefa soft-deletada.

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NOT NULL", (task_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada na lixeira."}
            cur.execute(
                "UPDATE tasks SET deleted_at = NULL, updated_at = now() "
                "WHERE id = %s OR parent_id = %s",
                (task_id, task_id),
            )
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(task_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Tarefa restaurada."}


# ─────────────────────────────────────────────────────────────────────────────
# Meu Dia — Fase 3 / fatia 016
# ─────────────────────────────────────────────────────────────────────────────

def _today_sp() -> date:
    """Retorna a data de hoje no fuso America/Sao_Paulo."""
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def add_to_my_day(task_id: int, date_str: Optional[str] = None) -> dict:
    """Marca uma tarefa como parte do Meu Dia de uma data (padrão: hoje).

    ``my_day_date`` é independente de ``due_date``: uma tarefa pode estar no
    plano de hoje sem vencer hoje, e vice-versa.

    Args:
        task_id: Id da tarefa.
        date_str: Data no formato "YYYY-MM-DD". ``None`` = hoje (fuso SP).

    Returns:
        Dicionário de status.
    """
    # Usa hoje se o chamador não informar data explícita.
    target = date_str if date_str else _today_sp().isoformat()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            cur.execute(
                "UPDATE tasks SET my_day_date = %s, updated_at = now() WHERE id = %s",
                (target, task_id),
            )
    return {"status": "ok", "message": f"Adicionada ao Meu Dia de {target}."}


def remove_from_my_day(task_id: int) -> dict:
    """Tira uma tarefa do Meu Dia (``my_day_date = NULL``), sem apagá-la.

    Args:
        task_id: Id da tarefa.

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            cur.execute(
                "UPDATE tasks SET my_day_date = NULL, updated_at = now() WHERE id = %s",
                (task_id,),
            )
    return {"status": "ok", "message": "Removida do Meu Dia."}


def reschedule_pending(task_id: int, when: str) -> dict:
    """Atalho do ritual de pendências de ontem: ajusta ``my_day_date`` conforme a intenção.

    Args:
        task_id: Id da tarefa.
        when: ``"today"`` (hoje), ``"tomorrow"`` (amanhã), ``"later"`` (NULL — tira do Meu
            Dia, mas mantém a tarefa). Nunca apaga a tarefa.

    Returns:
        Dicionário de status.
    """
    if when not in ("today", "tomorrow", "later"):
        return {"status": "error", "message": "Valor de 'when' inválido. Use today, tomorrow ou later."}

    hoje = _today_sp()
    if when == "today":
        target: Optional[str] = hoje.isoformat()
    elif when == "tomorrow":
        target = (hoje + timedelta(days=1)).isoformat()
    else:
        target = None   # "later" → remove do Meu Dia

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            cur.execute(
                "UPDATE tasks SET my_day_date = %s, updated_at = now() WHERE id = %s",
                (target, task_id),
            )
    msg = {"today": "Movida para hoje.", "tomorrow": "Movida para amanhã.", "later": "Retirada do Meu Dia."}.get(when, "Atualizada.")
    return {"status": "ok", "message": msg}


def set_estimate(task_id: int, duration_min: int) -> dict:
    """Grava a estimativa de duração de uma tarefa (insumo da CapacityBar).

    Args:
        task_id: Id da tarefa.
        duration_min: Estimativa em minutos (deve ser positivo).

    Returns:
        Dicionário de status.
    """
    if duration_min <= 0:
        return {"status": "error", "message": "A estimativa deve ser um número positivo de minutos."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            cur.execute(
                "UPDATE tasks SET duration_min = %s, updated_at = now() WHERE id = %s",
                (duration_min, task_id),
            )
    return {"status": "ok", "message": f"Estimativa de {duration_min} min gravada."}


def set_time_block(
    task_id: int,
    start_at: str,
    end_at: Optional[str] = None,
    duration_min: Optional[int] = None,
) -> dict:
    """Grava o bloco de tempo de uma tarefa (time-blocking).

    Se ``end_at`` não for informado, é derivado de ``start_at + (duration_min or 30min)``.
    Valida a CHECK do schema: ``end_at`` exige ``start_at`` (nunca levanta IntegrityError 500).

    Args:
        task_id: Id da tarefa.
        start_at: Início do bloco, ISO 8601 (ex.: "2026-06-13T14:00:00-03:00").
        end_at: Fim do bloco. Derivado se ausente.
        duration_min: Duração em minutos para derivar ``end_at`` (senão usa 30 min).
            Também atualiza a coluna ``duration_min`` da tarefa quando informado.

    Returns:
        Dicionário de status.
    """
    # Valida e parseia start_at.
    try:
        start_dt = datetime.fromisoformat(start_at)
    except ValueError:
        return {"status": "error", "message": "Formato de 'start_at' inválido. Use ISO 8601."}

    # Deriva end_at se não foi informado.
    if end_at is None:
        minutos = duration_min if duration_min and duration_min > 0 else 30
        end_dt = start_dt + timedelta(minutes=minutos)
        end_at = end_dt.isoformat()
    else:
        try:
            end_dt = datetime.fromisoformat(end_at)
        except ValueError:
            return {"status": "error", "message": "Formato de 'end_at' inválido. Use ISO 8601."}
        if end_dt <= start_dt:
            return {"status": "error", "message": "O horário de fim deve ser posterior ao de início."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}

            # Atualiza bloco e, se veio duration_min, grava a estimativa também.
            if duration_min and duration_min > 0:
                cur.execute(
                    "UPDATE tasks SET start_at = %s, end_at = %s, duration_min = %s, updated_at = now() WHERE id = %s",
                    (start_at, end_at, duration_min, task_id),
                )
            else:
                cur.execute(
                    "UPDATE tasks SET start_at = %s, end_at = %s, updated_at = now() WHERE id = %s",
                    (start_at, end_at, task_id),
                )
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(task_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Bloco de tempo gravado.", "start_at": start_at, "end_at": end_at}


def clear_time_block(task_id: int) -> dict:
    """Remove o bloco de tempo de uma tarefa (``start_at = end_at = NULL``).

    A tarefa continua no plano do Meu Dia; só sai da timeline.

    Args:
        task_id: Id da tarefa.

    Returns:
        Dicionário de status.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,)
            )
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            cur.execute(
                "UPDATE tasks SET start_at = NULL, end_at = NULL, updated_at = now() WHERE id = %s",
                (task_id,),
            )
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_task(task_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Bloco de tempo removido."}


# ─────────────────────────────────────────────────────────────────────────────
# Integração gcal para o Meu Dia
# ─────────────────────────────────────────────────────────────────────────────

def _gcal_events_for_day(day_str: str) -> tuple[list[dict], list[tuple[int, int]], bool]:
    """Busca os eventos do Google Calendar para um dia, aplica preferências de visibilidade
    e calcula as tuplas de minutos (início, fim) para alimentar o compute_capacity.

    Nunca levanta — qualquer falha (Google offline, sem credencial, sem prefs) retorna
    ``([], [], False)`` sinalizando ``calendar_ok=False`` na capacity.

    Args:
        day_str: Data no formato "YYYY-MM-DD".

    Returns:
        Tupla de três valores:
            - eventos_serial: lista de dicts prontos para serialização JSON.
              Cada item: {id, title, start, end, all_day, calendar_id,
              calendar_name, color}.
            - eventos_tuplas: lista de (inicio_min, fim_min) em minutos desde
              a meia-noite BRT, apenas para eventos com hora (all_day=False).
              Usados por compute_capacity.
            - cal_ok: True quando o Google respondeu com sucesso.
    """
    try:
        from agents.kaguya import gcal as _gcal
        from agents.kaguya.calendar_prefs import get_calendar_prefs

        # Lê prefs salvas — dict keyed por calendar_id ("gcal:<cal_id>")
        prefs_list = get_calendar_prefs()
        prefs: dict[str, dict] = {p["calendar_id"]: p for p in prefs_list}

        # Busca os eventos do Google (exclui espelho Kaguya e TickTick por padrão)
        raw_events = _gcal.list_events(day_str, day_str)

        eventos_serial: list[dict] = []
        eventos_tuplas: list[tuple[int, int]] = []

        for ev in raw_events:
            # Chave de pref: "gcal:<id_do_calendário>"
            pref_key = f"gcal:{ev.get('calendar_id', '')}"
            pref = prefs.get(pref_key, {})

            # Calendários invisíveis são pulados
            if not pref.get("visible", True):
                continue

            start: str = ev.get("start", "")
            end: str   = ev.get("end", "")
            all_day    = "T" not in start  # data sem "T" = dia inteiro

            item: dict = {
                "id":            ev.get("id", ""),
                "title":         ev.get("summary", "(sem título)"),
                "start":         start if not all_day else None,
                "end":           end   if not all_day else None,
                "all_day":       all_day,
                "calendar_id":   ev.get("calendar_id", ""),
                "calendar_name": ev.get("calendar_name", ""),
                "color":         pref.get("color"),  # None → usa cor padrão no frontend
            }
            eventos_serial.append(item)

            # Tupla de minutos para capacity — só para eventos com hora
            if not all_day and start and end:
                try:
                    # _to_brt já normalizou para -03:00; extrair H e M diretamente
                    # é suficiente pois o offset é sempre -03:00 (horário de Brasília)
                    from datetime import datetime
                    dt_ini = datetime.fromisoformat(start)
                    dt_fim = datetime.fromisoformat(end)
                    ini_min = dt_ini.hour * 60 + dt_ini.minute
                    fim_min = dt_fim.hour * 60 + dt_fim.minute
                    if fim_min > ini_min:  # eventos mal formados (duração negativa) são pulados
                        eventos_tuplas.append((ini_min, fim_min))
                except (ValueError, AttributeError):
                    pass  # evento com datetime inválido — pula, não quebra

        return eventos_serial, eventos_tuplas, True

    except Exception:
        return [], [], False


def list_my_day(date_str: Optional[str] = None) -> dict:
    """Monta o ritual do Meu Dia: plano, pendências de ontem, sugestões e capacity.

    Chamada pelo endpoint ``GET /api/tasks/my-day`` e pelas tools de Telegram.
    A capacity é calculada cruzando as estimativas das tarefas com os eventos do
    Google Calendar lidos via ``tools_calendar`` (MCP existente). Se o Calendar não
    responder, retorna ``capacity.calendar_ok = False`` e ``agenda_min = 0`` — nunca
    quebra a tela (FR-008 / SC-005).

    Args:
        date_str: Data no formato "YYYY-MM-DD". ``None`` = hoje (fuso SP).

    Returns:
        ``{date, plano, pendencias_ontem, sugestoes, capacity}`` — listagem direta
        (sem ``status``), pois cada seção pode ser vazia.
    """
    from agents.kaguya.capacity import compute_capacity
    from agents.kaguya.tools_tags import _attach_tags

    hoje = date.fromisoformat(date_str) if date_str else _today_sp()
    hoje_str = hoje.isoformat()
    amanha_str = (hoje + timedelta(days=7)).isoformat()   # janela das sugestões (≤7 dias)

    # Usa _qualified("t") pois há JOIN com task_projects (evita colunas ambíguas).
    # run_select() retorna dicts via RealDictCursor — indispensável para que _serialize_task
    # e o acesso a r["project_name"] funcionem. Abrir conn.cursor() sem factory retornaria
    # tuplas e causaria TypeError nos acessos por nome (era o bug do HTTP 500 no Meu Dia).
    campos = _qualified("t")

    # ── Plano de hoje: my_day_date == hoje, abertas (qualquer nível — fatia 025) ──
    # LEFT JOIN tasks mae: traz o título da tarefa-mãe para subtarefas mostrarem o badge.
    # Removido o filtro parent_id IS NULL: subtarefas explicitamente adicionadas ao Meu Dia
    # agora aparecem aqui. Sugestões mantém o filtro (evita poluição com sub-itens).
    plano_rows = run_select(
        f"""
        SELECT {campos}, p.name AS project_name, mae.title AS parent_title
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        LEFT JOIN tasks mae ON mae.id = t.parent_id
        WHERE t.my_day_date = %(hoje)s
          AND t.completed_at IS NULL
          AND t.deleted_at IS NULL
        ORDER BY t.start_at NULLS LAST, t.position
        """,
        {"hoje": hoje_str},
    )

    # ── Pendências de ontem: my_day_date < hoje, abertas (qualquer nível — fatia 025) ──
    pendencias_rows = run_select(
        f"""
        SELECT {campos}, p.name AS project_name, mae.title AS parent_title
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        LEFT JOIN tasks mae ON mae.id = t.parent_id
        WHERE t.my_day_date < %(hoje)s
          AND t.completed_at IS NULL
          AND t.deleted_at IS NULL
        ORDER BY t.my_day_date, t.position
        """,
        {"hoje": hoje_str},
    )

    # ── Sugestões: vencem em ≤7 dias, fora do plano de hoje, abertas, pai APENAS ──
    # Sugestões ficam root-only para evitar poluição com sub-itens (decisão do spec 025).
    sugestoes_rows = run_select(
        f"""
        SELECT {campos}, p.name AS project_name, NULL::text AS parent_title
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        WHERE t.due_date BETWEEN %(hoje)s AND %(amanha)s
          AND (t.my_day_date IS NULL OR t.my_day_date != %(hoje)s)
          AND t.completed_at IS NULL
          AND t.deleted_at IS NULL
          AND t.parent_id IS NULL
        ORDER BY t.due_date, t.priority DESC
        """,
        {"hoje": hoje_str, "amanha": amanha_str},
    )

    # Serializa, anexa tags e assignees em bloco (sem N+1).
    # run_select já devolveu dicts — _serialize_task e r["project_name"] funcionam normalmente.
    # parent_title (novo) é injetado diretamente na tarefa serializada para o frontend.
    def _prepare(rows: list) -> list:
        items = []
        for r in rows:
            item = _serialize_task(r)
            item["project_name"] = r["project_name"]
            # parent_title: None para tarefas raízes, título da mãe para subtarefas.
            item["parent_title"] = r.get("parent_title")
            items.append(item)
        # Anexa tags e responsáveis em batch para evitar N+1.
        _attach_tags(items)
        _attach_assignees(items)
        return items

    plano = _prepare(plano_rows)
    pendencias = _prepare(pendencias_rows)
    sugestoes = _prepare(sugestoes_rows)

    # ── Capacity: estimativas das tarefas + eventos do Google Calendar do dia ──
    # _gcal_events_for_day aplica as prefs de visibilidade salvas e calcula as tuplas
    # de minutos para o compute_capacity. Nunca levanta — falha → cal_ok=False.
    eventos_serial, eventos_tuplas, cal_ok = _gcal_events_for_day(hoje_str)

    estimativas = [t.get("duration_min") for t in plano]
    cap = compute_capacity(estimativas, eventos_tuplas, calendar_ok=cal_ok)
    cap["no_plano"] = len(plano)   # sobrescreve com a contagem real do plano

    return {
        "date": hoje_str,
        "plano": plano,
        "pendencias_ontem": pendencias,
        "sugestoes": sugestoes,
        "capacity": cap,
        # Eventos do Google Calendar do dia (já filtrados por visibilidade).
        # Usados pela timeline do Meu Dia. Lista vazia quando o Google não responde.
        "eventos": eventos_serial,
    }
