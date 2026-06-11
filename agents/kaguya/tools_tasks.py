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

from datetime import date
from typing import Optional

from agents.db import get_conn, run_select
from agents.kaguya.tools_projects import resolve_project_id_by_name

# Incremento padrão entre posições manuais (mesma constante semântica do Journal).
_POSITION_STEP = 1000

# Conjuntos válidos para validação amigável antes de bater no CHECK do banco.
_VALID_PRIORITIES = {0, 1, 2, 3}
_VALID_TYPES = {"task", "event", "birthday"}

# Colunas da tarefa que viajam nas respostas (ordem estável; nested subtasks à parte).
_TASK_FIELDS = [
    "id", "project_id", "column_id", "parent_id", "title", "description", "type", "priority",
    "due_date", "due_time", "start_at", "end_at", "duration_min", "my_day_date", "position",
    "completed_at", "deleted_at", "created_at", "updated_at",
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
    """Anexa as subtarefas (vivas) a cada tarefa-pai, sob a chave ``subtasks``.

    Faz uma única query extra (todas as subtarefas dos pais de uma vez) para evitar
    N+1 — uma query por listagem, como o plano exige.

    Args:
        parents: Lista de tarefas-pai já serializadas.

    Returns:
        A mesma lista, com ``subtasks`` preenchido em cada item.
    """
    parent_ids = [p["id"] for p in parents]
    # Inicializa a chave em todos (mesmo os sem filhos) para um shape consistente.
    for p in parents:
        p["subtasks"] = []
    if not parent_ids:
        return parents
    subs = run_select(
        f"""
        SELECT {_TASK_COLUMNS} FROM tasks
        WHERE parent_id = ANY(%(ids)s) AND deleted_at IS NULL
        ORDER BY position, id
        """,
        {"ids": parent_ids},
    )
    # Indexa os pais por id para distribuir as subtarefas em O(n).
    by_id = {p["id"]: p for p in parents}
    for s in subs:
        by_id[s["parent_id"]]["subtasks"].append(_serialize_task(s))
    return parents


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
    return _attach_subtasks(parents)


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
    return {"overdue": overdue, "today": due_today}


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
    return out


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
) -> dict:
    """Cria uma tarefa (ou subtarefa) e a posiciona no fim da sua lista/escopo.

    Resolução da lista: ``project_id`` tem prioridade; senão tenta ``project_name``
    (usado pelo agente); se nada resolver, cai no **Inbox** (captura órfã).

    Args:
        title: Título (obrigatório, não-vazio).
        project_id: Id da lista (webapp envia isto).
        project_name: Nome da lista (agente envia isto; resolvido por prefixo).
        parent_id: Se informado, cria subtarefa (1 nível) sob essa tarefa-pai.
        priority: 0..3 (nenhuma/baixa/média/alta).
        type: ``task`` | ``event`` | ``birthday``.
        due_date: "YYYY-MM-DD" (opcional).
        due_time: "HH:MM" (exige ``due_date``).
        description: Notas (opcional).

    Returns:
        ``{"status": "ok", "id": <int>, "project_id": <int>}`` ou erro em português.
    """
    # ── Validações de entrada (mensagens amigáveis antes dos CHECKs do banco) ──
    if not title or not title.strip():
        return {"status": "error", "message": "O título não pode ser vazio."}
    if priority not in _VALID_PRIORITIES:
        return {"status": "error", "message": "Prioridade inválida (use 0, 1, 2 ou 3)."}
    if type not in _VALID_TYPES:
        return {"status": "error", "message": "Tipo inválido (use task, event ou birthday)."}
    if due_time and not due_date:
        return {"status": "error", "message": "Hora de vencimento exige uma data."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            # ── Subtarefa: valida o pai (existe, vivo, 1 nível, não concluído) ──
            if parent_id is not None:
                cur.execute(
                    "SELECT project_id, parent_id, completed_at, deleted_at FROM tasks WHERE id = %s",
                    (parent_id,),
                )
                parent = cur.fetchone()
                if not parent or parent[3] is not None:  # inexistente ou na lixeira
                    return {"status": "error", "message": "Tarefa-pai não encontrada."}
                if parent[1] is not None:  # o pai já é subtarefa → 2 níveis, proibido
                    return {"status": "error", "message": "Não é possível criar subtarefa de uma subtarefa (só 1 nível)."}
                if parent[2] is not None:  # pai concluído
                    return {"status": "error", "message": "A tarefa-pai está concluída — reabra-a antes de adicionar subtarefas."}
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
                resolved_column = None  # tarefa nova entra sem coluna (vai para a lista; Kanban opcional)
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

    return {"status": "ok", "id": new_id, "project_id": resolved_project, "message": f"Tarefa '{title.strip()}' criada."}


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
) -> dict:
    """Edita campos de uma tarefa; mover de lista aplica a regra da coluna do destino.

    Ao trocar ``project_id``, a tarefa entra na primeira coluna do board destino (ou
    fica sem coluna se o destino não tiver board) — a menos que ``column_id`` seja
    passado explicitamente.

    Args:
        task_id: Id da tarefa.
        title/description/priority/type/due_date/due_time/project_id/column_id:
            Campos a atualizar (todos opcionais; PATCH parcial).

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
            cur.execute("SELECT due_date FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,))
            existing = cur.fetchone()
            if not existing:
                return {"status": "error", "message": "Tarefa não encontrada."}

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

            # Mover de lista: aplica a regra da coluna do destino (se column_id não foi forçado).
            if project_id is not None:
                cur.execute("SELECT 1 FROM task_projects WHERE id = %s AND archived_at IS NULL", (project_id,))
                if not cur.fetchone():
                    return {"status": "error", "message": "Lista de destino não encontrada."}
                sets.append("project_id = %(project_id)s")
                params["project_id"] = project_id
                if column_id is None:
                    params["column_id"] = _first_column_id(cur, project_id)
                    sets.append("column_id = %(column_id)s")
            if column_id is not None:
                sets.append("column_id = %(column_id)s")
                params["column_id"] = column_id

            if not sets:
                return {"status": "error", "message": "Nada para atualizar."}

            sets.append("updated_at = now()")
            cur.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = %(id)s", params)
    return {"status": "ok", "message": "Tarefa atualizada."}


# ─────────────────────────────────────────────────────────────────────────────
# Concluir / reabrir
# ─────────────────────────────────────────────────────────────────────────────
def _complete_task_on_cursor(cur, task_id: int, cascade: bool = False) -> dict:
    """Completa uma tarefa usando um cursor já aberto (sem abrir transação própria).

    Extraído para que ``complete_payment_task`` (tarefa + despesa) possa completar a
    tarefa **na mesma transação** do lançamento financeiro (atomicidade — FR-014).

    Args:
        cur: Cursor psycopg2 ativo.
        task_id: Id da tarefa a completar.
        cascade: Se True, completa as subtarefas abertas junto.

    Returns:
        ``{"status": "ok"}`` ou ``{"status": "error", "needs_cascade": True, ...}``
        quando há subtarefas abertas e ``cascade`` é False.
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
    return {"status": "ok"}


def complete_task(task_id: int, cascade: bool = False) -> dict:
    """Completa uma tarefa (e suas subtarefas, se ``cascade``). Recebe também o drop na coluna done.

    Args:
        task_id: Id da tarefa.
        cascade: Se True, conclui em cascata as subtarefas abertas.

    Returns:
        Dicionário de status; com ``needs_cascade`` quando há subtarefas abertas e
        ``cascade`` é False (o canal pergunta e repete com ``cascade=True``).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            result = _complete_task_on_cursor(cur, task_id, cascade)
            if result["status"] == "error" and not result.get("needs_cascade"):
                # Erro "real" (tarefa inexistente): desfaz para não commitar nada.
                conn.rollback()
            elif result.get("needs_cascade"):
                conn.rollback()  # ainda não concluiu nada — só sinaliza a confirmação
    if result["status"] == "ok":
        result["message"] = "Tarefa concluída."
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
    return {"status": "ok", "message": "Tarefa reaberta."}


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
def delete_task(task_id: int) -> dict:
    """Soft delete: marca ``deleted_at`` na tarefa e nas subtarefas dela.

    Args:
        task_id: Id da tarefa a excluir.

    Returns:
        Dicionário de status (a tarefa fica restaurável na lixeira).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            # Marca a tarefa e suas subtarefas vivas de uma vez (a própria + filhas).
            cur.execute(
                "UPDATE tasks SET deleted_at = now(), updated_at = now() "
                "WHERE (id = %s OR parent_id = %s) AND deleted_at IS NULL",
                (task_id, task_id),
            )
    return {"status": "ok", "message": "Tarefa enviada para a lixeira."}


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
    return {"status": "ok", "message": "Tarefa restaurada."}
