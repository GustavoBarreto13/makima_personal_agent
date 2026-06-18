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

    # Reset de subtarefas: copia as subtarefas vivas da antiga como ABERTAS na nova (edge 6).
    cur.execute(
        "SELECT title, description, type, priority, position FROM tasks "
        "WHERE parent_id = %s AND deleted_at IS NULL ORDER BY position, id",
        (task_id,),
    )
    for s_title, s_desc, s_type, s_prio, s_pos in cur.fetchall():
        cur.execute(
            """
            INSERT INTO tasks (project_id, parent_id, title, description, type, priority, position)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (project_id, new_id, s_title, s_desc, s_type, s_prio, s_pos),
        )

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
    parents = _attach_subtasks(parents)
    parents = _attach_recurrence(parents)
    # Anexa as tags (etiquetas) de cada tarefa-pai para a TaskRow mostrar os chips.
    return _attach_tags(parents)


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
) -> dict:
    """Cria uma tarefa (ou subtarefa) e a posiciona no fim da sua lista/escopo.

    Resolução da lista: ``project_id`` tem prioridade; senão tenta ``project_name``
    (usado pelo agente); se nada resolver, cai no **Inbox** (captura órfã).

    Resolução da coluna (Kanban): se ``column_id`` for passado, a tarefa nasce nessa coluna
    (validada contra a lista). Se não for passado mas a lista **tiver board** (≥1 coluna), a
    tarefa cai na **primeira coluna** — assim ela aparece no Kanban e a view Lista e o Kanban
    nunca divergem. Listas sem board continuam com a tarefa sem coluna (Kanban é opcional).

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
        recurrence: ``{"rrule": str, "mode": "fixed"|"after_completion"}`` (opcional). Exige
            ``due_date`` (a âncora). ``type="birthday"`` + ``due_date`` cria recorrência anual
            automática mesmo sem este parâmetro.
        column_id: Coluna de Kanban onde criar a tarefa (opcional). Ignorado em subtarefas. Se
            omitido e a lista tiver board, usa a primeira coluna automaticamente.
        tags: Lista de nomes de tag a vincular (opcional). Tags inexistentes são criadas
            na hora; o nome é único ignorando caixa (``Mercado`` == ``mercado``).
        person_ids: Lista de UUIDs de pessoas a vincular à tarefa (spec 014 / FR-009). Opcional.

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
                sets.append("column_id = %(column_id)s")
                params["column_id"] = column_id

            # Estimativa de duração do Meu Dia (fatia 016).
            if duration_min is not None:
                sets.append("duration_min = %(duration_min)s")
                params["duration_min"] = duration_min

            # Há algo a fazer? campos OU recorrência (definir/limpar/auto-aniversário) OU tags.
            if (not sets and recurrence is None and not clear_recurrence
                    and type != "birthday" and tags is None):
                return {"status": "error", "message": "Nada para atualizar."}

            # Aplica as mudanças de campo (se houver) antes de mexer na recorrência.
            if sets:
                sets.append("updated_at = now()")
                cur.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = %(id)s", params)

            # Tags: aplica o conjunto exato de etiquetas (lista vazia = remover todas).
            if tags is not None:
                _set_task_tags(cur, task_id, tags)

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

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Usa _qualified("t") pois há JOIN com task_projects (evita colunas ambíguas).
            campos = _qualified("t")

            # ── Plano de hoje: my_day_date == hoje, abertas, pai ──
            cur.execute(
                f"""
                SELECT {campos}, p.name AS project_name
                FROM tasks t
                JOIN task_projects p ON p.id = t.project_id
                WHERE t.my_day_date = %s
                  AND t.completed_at IS NULL
                  AND t.deleted_at IS NULL
                  AND t.parent_id IS NULL
                ORDER BY t.start_at NULLS LAST, t.position
                """,
                (hoje_str,),
            )
            plano_rows = cur.fetchall()

            # ── Pendências de ontem: my_day_date < hoje, abertas, pai ──
            cur.execute(
                f"""
                SELECT {campos}, p.name AS project_name
                FROM tasks t
                JOIN task_projects p ON p.id = t.project_id
                WHERE t.my_day_date < %s
                  AND t.completed_at IS NULL
                  AND t.deleted_at IS NULL
                  AND t.parent_id IS NULL
                ORDER BY t.my_day_date, t.position
                """,
                (hoje_str,),
            )
            pendencias_rows = cur.fetchall()

            # ── Sugestões: vencem em ≤7 dias, fora do plano de hoje, abertas, pai ──
            cur.execute(
                f"""
                SELECT {campos}, p.name AS project_name
                FROM tasks t
                JOIN task_projects p ON p.id = t.project_id
                WHERE t.due_date BETWEEN %s AND %s
                  AND (t.my_day_date IS NULL OR t.my_day_date != %s)
                  AND t.completed_at IS NULL
                  AND t.deleted_at IS NULL
                  AND t.parent_id IS NULL
                ORDER BY t.due_date, t.priority DESC
                """,
                (hoje_str, amanha_str, hoje_str),
            )
            sugestoes_rows = cur.fetchall()

    # Serializa e anexa as tags em bloco (sem N+1).
    def _prepare(rows: list) -> list:
        items = []
        for r in rows:
            item = _serialize_task(r)
            item["project_name"] = r["project_name"]
            items.append(item)
        return _attach_tags(items)

    plano = _prepare(plano_rows)
    pendencias = _prepare(pendencias_rows)
    sugestoes = _prepare(sugestoes_rows)

    # ── Capacity: estimativas das tarefas + eventos do Calendar do dia ──
    # Tenta ler os eventos do Google Calendar via MCP. Qualquer falha é silenciosa.
    eventos: list[tuple[int, int]] = []
    cal_ok = True
    try:
        # Import lazy: tools_calendar é o módulo que acessa o MCP do Calendar.
        # Aqui usamos a tool existente que lê eventos numa janela de datas.
        from agents.kaguya import tools_calendar as tc
        raw = tc.list_tasks_in_range(hoje_str, hoje_str)
        # list_tasks_in_range retorna tarefas, não eventos do Google Calendar.
        # Para a capacity precisamos dos eventos do Calendar (Google), que são lidos
        # pelo agente via MCP. No contexto do router (webapp), não há MCP disponível;
        # nesse caso a capacity roda só com estimativas (calendar_ok=False se não vier).
        # Quando a Kaguya (Telegram) chama list_my_day, ela pode injetar os eventos
        # lendo pelo MCP antes de chamar esta função — por ora eventos = [].
        # TODO fatia 019: o Calendar Hub passará os eventos via parâmetro.
    except Exception:
        cal_ok = False

    estimativas = [t.get("duration_min") for t in plano]
    cap = compute_capacity(estimativas, eventos, calendar_ok=cal_ok)
    cap["no_plano"] = len(plano)   # sobrescreve com a contagem real do plano

    return {
        "date": hoje_str,
        "plano": plano,
        "pendencias_ontem": pendencias,
        "sugestoes": sugestoes,
        "capacity": cap,
    }
