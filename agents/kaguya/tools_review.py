"""Camada de lógica — Revisão semanal guiada (spec 035).

Nona peça da **camada de lógica única** da Kaguya. Fecha o bloco GTD aberto pela spec 034: um
ritual de **6 passos** (inbox zero, próximas ações, aguardando, listas/projetos, calendário,
algum dia/talvez) que agrega dados **já existentes** (nenhum passo reimplementa uma consulta —
ver `agents/kaguya/CLAUDE.md` § "Revisão semanal"), mais um registro leve que permite retomar
uma revisão abandonada e alimenta o lembrete de domingo (scheduler) e o indicador do painel.

**Webapp-only**: nenhuma função aqui é registrada como tool no agente ADK (research.md R10,
spec.md § Assumptions "pelo Telegram vai apenas o lembrete") — `tools.py` só re-exporta.

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem/leitura** retornam o dado direto (lista/dict).
    - Acesso ao banco via ``agents.db``; "hoje"/"7 dias" sempre em **UTC-3** (America/Sao_Paulo).

Contrato REST: ``specs/035-tasks-weekly-review/contracts/rest-api.md``.
Regras/schema: ``specs/035-tasks-weekly-review/data-model.md``.
"""

from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from agents.db import run_select, run_dml

# Fuso do usuário (UTC-3) — toda janela de "7 dias"/"semana" passa por aqui, nunca CURRENT_DATE.
_SP_TZ = ZoneInfo("America/Sao_Paulo")

# Os 6 passos fixos do ritual, na ordem de exibição (FR-001). Não é tabela — é o vocabulário
# fechado que `steps_seen` (TEXT[] em task_weekly_reviews) pode conter.
_ALL_STEPS = ["inbox", "next_actions", "waiting", "lists", "calendar", "someday"]


def _now_sp() -> datetime:
    """Devolve o instante atual, aware, no fuso America/Sao_Paulo (nunca UTC puro)."""
    return datetime.now(_SP_TZ)


def _serialize_review(row: dict) -> dict:
    """Converte os timestamps de uma linha de ``task_weekly_reviews`` para ISO 8601."""
    out = dict(row)
    for f in ("started_at", "completed_at"):
        if out.get(f) is not None:
            out[f] = out[f].isoformat()
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Estado da revisão — iniciar/retomar, marcar passo, concluir
# ─────────────────────────────────────────────────────────────────────────────
def get_open_review() -> Optional[dict]:
    """Devolve a revisão aberta (``completed_at IS NULL``), ou ``None`` se nenhuma existir.

    Returns:
        ``{"id", "started_at", "completed_at", "steps_seen", "note"}`` ou ``None``.
        **Leitura pura** — não cria nada.
    """
    rows = run_select(
        "SELECT id, started_at, completed_at, steps_seen, note FROM task_weekly_reviews "
        "WHERE completed_at IS NULL LIMIT 1"
    )
    return _serialize_review(rows[0]) if rows else None


def start_or_resume_review() -> dict:
    """Inicia uma revisão nova, ou retoma a aberta se já existir (FR-005 — no máximo uma).

    Primeiro tenta achar uma revisão aberta; só faz ``INSERT`` se não achar nenhuma. O índice
    único parcial ``uq_task_weekly_reviews_open`` é a rede de segurança contra corrida — o
    caminho normal (uso solo) nunca chega a disparar o `UniqueViolation` (research.md R2).

    Returns:
        A revisão (aberta ou recém-criada) com ``resumed: bool`` indicando qual dos dois
        caminhos foi tomado. **Mutação** (pode criar uma linha), mas sem campo "status" —
        o shape espelha ``get_open_review`` mais o flag, para o frontend consumir direto.
    """
    existing = get_open_review()
    if existing:
        return {**existing, "resumed": True}

    rows = run_select(
        "INSERT INTO task_weekly_reviews (started_at, steps_seen) "
        "VALUES (now(), '{}') RETURNING id, started_at, completed_at, steps_seen, note"
    )
    created = _serialize_review(rows[0])
    return {**created, "resumed": False}


def mark_step_seen(review_id: int, step: str) -> dict:
    """Marca um passo como visto na revisão aberta (idempotente — repetir não duplica).

    Args:
        review_id: Id da revisão — deve ser a que está atualmente aberta.
        step: Um de ``_ALL_STEPS`` (inbox/next_actions/waiting/lists/calendar/someday).

    Returns:
        ``{"status": "ok", "steps_seen": [...]}`` ou ``{"status": "error", "message": ...}``
        se o passo for desconhecido ou a revisão não for a aberta atual.
    """
    if step not in _ALL_STEPS:
        return {"status": "error", "message": f"Passo inválido: {step!r}."}

    rows = run_select(
        "SELECT steps_seen FROM task_weekly_reviews WHERE id = %(id)s AND completed_at IS NULL",
        {"id": review_id},
    )
    if not rows:
        return {"status": "error", "message": "Revisão não encontrada ou já concluída."}

    # array_append + DISTINCT via CASE evita duplicar o mesmo passo (idempotente).
    run_dml(
        """
        UPDATE task_weekly_reviews
        SET steps_seen = CASE
            WHEN %(step)s = ANY(steps_seen) THEN steps_seen
            ELSE array_append(steps_seen, %(step)s)
        END
        WHERE id = %(id)s
        """,
        {"id": review_id, "step": step},
    )
    updated = run_select(
        "SELECT steps_seen FROM task_weekly_reviews WHERE id = %(id)s", {"id": review_id}
    )
    return {"status": "ok", "steps_seen": updated[0]["steps_seen"]}


def complete_review(review_id: int, note: Optional[str] = None) -> dict:
    """Conclui a revisão — exige que os 6 passos já tenham sido vistos (FR-006).

    Args:
        review_id: Id da revisão aberta a concluir.
        note: Nota final livre (opcional).

    Returns:
        ``{"status": "ok", "id", "completed_at"}`` em sucesso; em falta de passos,
        ``{"status": "error", "error": "steps_pending", "missing": [...]}``.
    """
    rows = run_select(
        "SELECT steps_seen FROM task_weekly_reviews WHERE id = %(id)s AND completed_at IS NULL",
        {"id": review_id},
    )
    if not rows:
        return {"status": "error", "message": "Revisão não encontrada ou já concluída."}

    seen = set(rows[0]["steps_seen"])
    missing = [s for s in _ALL_STEPS if s not in seen]
    if missing:
        return {"status": "error", "error": "steps_pending", "missing": missing}

    result = run_select(
        "UPDATE task_weekly_reviews SET completed_at = now(), note = %(note)s "
        "WHERE id = %(id)s RETURNING completed_at",
        {"id": review_id, "note": note},
    )
    return {"status": "ok", "id": review_id, "completed_at": result[0]["completed_at"].isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# Histórico e indicador (US4)
# ─────────────────────────────────────────────────────────────────────────────
def get_last_completed_review() -> Optional[dict]:
    """Devolve a revisão concluída mais recente, ou ``None`` se nenhuma foi concluída ainda.

    O "há N dias" é calculado no FRONTEND a partir do ``completed_at`` (ISO UTC) — nunca aqui
    com ``CURRENT_DATE`` puro (research.md R9 / regra global do fuso).

    Returns:
        ``{"completed_at", "note"}`` ou ``None``. **Leitura**.
    """
    rows = run_select(
        "SELECT completed_at, note FROM task_weekly_reviews "
        "WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1"
    )
    if not rows:
        return None
    return {"completed_at": rows[0]["completed_at"].isoformat(), "note": rows[0]["note"]}


def list_review_history() -> list:
    """Lista as revisões concluídas, mais recente primeiro (FR-004 — histórico).

    Returns:
        Lista de ``{"id", "started_at", "completed_at", "note"}``. **Listagem**.
    """
    rows = run_select(
        "SELECT id, started_at, completed_at, note FROM task_weekly_reviews "
        "WHERE completed_at IS NOT NULL ORDER BY completed_at DESC"
    )
    return [_serialize_review(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Passo 3 — Aguardando, ordenado pelos mais antigos (research.md R4)
# ─────────────────────────────────────────────────────────────────────────────
def list_waiting_ordered() -> list:
    """Lista as tarefas 'aguardando' (mesmas condições do built-in ``waiting`` da spec 034),

    ordenadas pelas mais antigas primeiro (``waiting_since ASC``) — a DSL genérica de
    smart-lists não tem ``order_by``; este passo precisa de destaque por antiguidade
    (FR-003), então consulta direto em vez de estender a DSL para um único uso.

    Returns:
        Lista de ``{"id", "title", "waiting_note", "waiting_since", "days_waiting"}``,
        mais antigas primeiro. **Listagem**.
    """
    rows = run_select(
        """
        SELECT id, title, waiting_note, waiting_since,
               EXTRACT(DAY FROM now() - waiting_since)::int AS days_waiting
        FROM tasks
        WHERE deleted_at IS NULL AND completed_at IS NULL AND gtd_status = 'waiting'
        ORDER BY waiting_since ASC NULLS LAST, id
        """
    )
    out = []
    for r in rows:
        item = dict(r)
        if item.get("waiting_since") is not None:
            item["waiting_since"] = item["waiting_since"].isoformat()
        out.append(item)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Passo 4 — marca de revisão de lista (research.md R3)
# ─────────────────────────────────────────────────────────────────────────────
def mark_project_reviewed(project_id: int) -> dict:
    """Registra ``last_reviewed_at = now()`` numa lista (marca "revisada agora").

    Não pertence só ao wizard — é uma propriedade da lista, pode ser chamada fora da
    revisão também (ex.: uma faxina ad-hoc).

    Args:
        project_id: Id da lista.

    Returns:
        ``{"status": "ok", "project_id", "last_reviewed_at"}`` ou erro se a lista não existir.
    """
    rows = run_select(
        "UPDATE task_projects SET last_reviewed_at = now() WHERE id = %(id)s "
        "RETURNING last_reviewed_at",
        {"id": project_id},
    )
    if not rows:
        return {"status": "error", "message": "Lista não encontrada."}
    return {
        "status": "ok",
        "project_id": project_id,
        "last_reviewed_at": rows[0]["last_reviewed_at"].isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Lembrete de domingo (US3 / scheduler) — research.md R8
# ─────────────────────────────────────────────────────────────────────────────
def get_reminder_summary() -> dict:
    """Monta o resumo usado pelo job agendado ``weekly_review_reminder``.

    ``should_send`` é ``True`` somente se **nenhuma** revisão foi concluída nos últimos 7
    dias corridos (fuso America/Sao_Paulo) — FR-007. Não expõe rota REST própria; é chamada
    só pelo script do scheduler (contracts/rest-api.md § "Telegram").

    Returns:
        ``{"should_send": bool, "inbox_count": int, "stale_waiting_count": int}``.
    """
    # Import lazy — evita ciclo (tools_tasks importa tools_projects; tools_review fica à parte).
    from agents.kaguya.tools_tasks import list_inbox_queue

    seven_days_ago = _now_sp() - timedelta(days=7)
    recent = run_select(
        "SELECT 1 FROM task_weekly_reviews WHERE completed_at >= %(cutoff)s LIMIT 1",
        {"cutoff": seven_days_ago},
    )
    should_send = not recent

    inbox_count = list_inbox_queue()["total"]

    stale = run_select(
        "SELECT COUNT(*) AS n FROM tasks "
        "WHERE deleted_at IS NULL AND completed_at IS NULL AND gtd_status = 'waiting' "
        "AND waiting_since < %(cutoff)s",
        {"cutoff": seven_days_ago},
    )
    stale_waiting_count = stale[0]["n"]

    return {
        "should_send": should_send,
        "inbox_count": inbox_count,
        "stale_waiting_count": stale_waiting_count,
    }
