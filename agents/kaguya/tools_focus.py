"""Camada de lógica — **Foco / Pomodoro** (spec 037).

Ciclo pomodoro da Kaguya: o usuário inicia uma sessão de foco (ligada a uma tarefa ou
avulsa), escolhe a duração (presets 25/5, 50/10 ou custom), e a sessão fica ativa até
ser concluída, cancelada, ou fechada automaticamente por abandono. **Webapp-only**:
nenhuma função aqui é registrada como tool no agente ADK (mesma decisão das specs
024/029/030/035/036) — ``tools.py`` só re-exporta para o router REST consumir.

Princípio central: **nada persistido derivado** (mesmo padrão de
``goal_progress``/``habit_strength``/``experiment_adherence``). O único dado gravado é
o registro bruto da sessão (``focus_sessions``); tempo restante, fase (foco/pausa) e
estatísticas do dia/semana são sempre calculados na leitura a partir de ``started_at`` —
nunca um cronômetro persistido, nunca contado no cliente sem uma base real de servidor.

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem/leitura** retornam o dado direto (lista/dict).
    - Acesso ao banco via ``agents.db``; "hoje"/dia local sempre em **UTC-3**
      (``AT TIME ZONE 'America/Sao_Paulo'`` nas queries de agregação — nunca
      ``CURRENT_DATE``/``NOW()::date`` puro).

Ver ``specs/037-tasks-focus-pomodoro/data-model.md`` e ``contracts/rest-api.md``.
"""

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import psycopg2.extras

from agents.db import get_conn, run_select

from agents.kaguya import focus_stats as FS

# Fuso do usuário (UTC-3) — toda derivação de "hoje" passa por aqui.
_SP_TZ = ZoneInfo("America/Sao_Paulo")

_PREFS_SELECT = "SELECT focus_min, break_min FROM focus_prefs WHERE id = 1"

_SESSION_COLUMNS = """
    fs.id, fs.task_id, t.title AS task_title, fs.started_at, fs.ended_at,
    fs.duration_planned_min, fs.break_planned_min, fs.completed, fs.note
"""


def _today_sp() -> date:
    """Data de hoje no fuso do usuário (America/Sao_Paulo) — nunca UTC puro."""
    return datetime.now(_SP_TZ).date()


def _serialize_session(row: dict) -> dict:
    """Monta o dict de resposta de uma sessão (sem derivar fase/tempo — ver ``_derive_phase``)."""
    return {
        "id": row["id"],
        "task_id": row["task_id"],
        "task_title": row.get("task_title"),
        "started_at": row["started_at"].isoformat(),
        "ended_at": row["ended_at"].isoformat() if row["ended_at"] else None,
        "duration_planned_min": row["duration_planned_min"],
        "break_planned_min": row["break_planned_min"],
        "completed": row["completed"],
        "note": row.get("note"),
    }


def _derive_phase(row: dict) -> dict:
    """Calcula fase (``"foco"``/``"pausa"``) e tempo restante a partir de ``started_at``.

    Nunca lê um cronômetro salvo — o tempo restante é sempre
    ``duração_planejada (+ pausa) - decorrido_real``, recalculado a cada chamada (R1).
    """
    now = datetime.now(row["started_at"].tzinfo)
    elapsed_sec = (now - row["started_at"]).total_seconds()
    focus_sec = row["duration_planned_min"] * 60
    break_sec = row["break_planned_min"] * 60

    if elapsed_sec < focus_sec:
        phase = "foco"
        remaining_sec = focus_sec - elapsed_sec
    else:
        phase = "pausa"
        remaining_sec = focus_sec + break_sec - elapsed_sec

    session = _serialize_session(row)
    session["phase"] = phase
    session["remaining_sec"] = max(0, int(remaining_sec))
    return session


def _duration_focused_min(row: dict, ended_at: datetime) -> int:
    """Tempo efetivamente focado, nunca maior que o planejado (SC-004)."""
    elapsed_min = (ended_at - row["started_at"]).total_seconds() / 60
    return int(min(row["duration_planned_min"], max(0, elapsed_min)))


def _close_if_abandoned(cur, row: dict) -> Optional[dict]:
    """Fecha automaticamente uma sessão vencida (R2), sem esperar por nenhum job/cron.

    Vencida = tempo decorrido já passou de foco+pausa planejados e a sessão continua
    aberta (``ended_at IS NULL``). Credita no máximo o tempo de foco planejado — nunca
    a pausa nem o tempo real que passou até o usuário voltar ao painel (FR-008/SC-004).

    Args:
        cur: Cursor já aberto na transação corrente.
        row: Linha da sessão ativa (dict com ``started_at``, ``duration_planned_min``,
            ``break_planned_min``).

    Returns:
        A própria ``row`` com ``ended_at``/``completed`` atualizados se foi fechada
        automaticamente; ``None`` se a sessão ainda está genuinamente ativa.
    """
    now = datetime.now(row["started_at"].tzinfo)
    deadline = row["started_at"] + timedelta(
        minutes=row["duration_planned_min"] + row["break_planned_min"]
    )
    if now < deadline:
        return None

    ended_at = row["started_at"] + timedelta(minutes=row["duration_planned_min"])
    cur.execute(
        "UPDATE focus_sessions SET ended_at = %s, completed = FALSE WHERE id = %s",
        (ended_at, row["id"]),
    )
    return None


def get_focus_prefs() -> dict:
    """Devolve a preferência atual de duração (foco/pausa), lembrada entre sessões."""
    rows = run_select(_PREFS_SELECT)
    if not rows:
        return {"focus_min": 25, "break_min": 5}
    return rows[0]


def get_active_session() -> Optional[dict]:
    """Devolve a sessão ativa (com fase/tempo restante derivados), fechando antes
    qualquer sessão abandonada (R2). ``None`` se não há nenhuma sessão aberta.
    """
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"SELECT {_SESSION_COLUMNS} FROM focus_sessions fs "
            "LEFT JOIN tasks t ON t.id = fs.task_id "
            "WHERE fs.ended_at IS NULL"
        )
        row = cur.fetchone()
        if row is None:
            return None
        row = dict(row)
        _close_if_abandoned(cur, row)
        # Confere se ainda está aberta após a checagem de abandono.
        cur.execute("SELECT ended_at FROM focus_sessions WHERE id = %s", (row["id"],))
        still_open = cur.fetchone()
        if still_open is None or still_open["ended_at"] is not None:
            return None
        return _derive_phase(row)


def start_session(
    task_id: Optional[int],
    focus_min: int,
    break_min: int,
    force: bool = False,
) -> dict:
    """Inicia uma sessão de foco — de uma tarefa ou avulsa (FR-001).

    Se já existe uma sessão ativa e ``force`` é falso, recusa (FR-003 — o frontend
    deve confirmar com o usuário antes de reenviar com ``force=True``). Sempre grava
    a escolha em ``focus_prefs`` como o novo padrão (R4).

    Args:
        task_id: Tarefa vinculada, ou ``None`` para sessão avulsa.
        focus_min: Minutos de foco planejados.
        break_min: Minutos de pausa planejados.
        force: Se ``True``, fecha (cancela) a sessão ativa existente antes de iniciar.

    Returns:
        A sessão criada (com fase/tempo restante) ou
        ``{"status": "error", "message": "já existe uma sessão de foco ativa"}``.
    """
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM focus_sessions WHERE ended_at IS NULL")
        active = cur.fetchone()
        if active is not None:
            if not force:
                return {"status": "error", "message": "já existe uma sessão de foco ativa"}
            cur.execute(
                "UPDATE focus_sessions SET ended_at = now(), completed = FALSE WHERE id = %s",
                (active["id"],),
            )

        cur.execute(
            "UPDATE focus_prefs SET focus_min = %s, break_min = %s WHERE id = 1",
            (focus_min, break_min),
        )
        cur.execute(
            "INSERT INTO focus_sessions (task_id, duration_planned_min, break_planned_min) "
            "VALUES (%s, %s, %s) RETURNING id",
            (task_id, focus_min, break_min),
        )
        new_id = cur.fetchone()["id"]

        cur.execute(
            f"SELECT {_SESSION_COLUMNS} FROM focus_sessions fs "
            "LEFT JOIN tasks t ON t.id = fs.task_id WHERE fs.id = %s",
            (new_id,),
        )
        row = dict(cur.fetchone())
        return _derive_phase(row)


def finish_session(session_id: int, note: Optional[str] = None) -> dict:
    """Conclui a sessão ativa — antecipadamente ou no fim natural (FR-005).

    Registra o tempo efetivamente focado (nunca mais que o planejado).
    """
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT started_at, duration_planned_min FROM focus_sessions "
            "WHERE id = %s AND ended_at IS NULL",
            (session_id,),
        )
        row = cur.fetchone()
        if row is None:
            return {"status": "error", "message": "sessão não encontrada ou já encerrada"}

        ended_at = datetime.now(row["started_at"].tzinfo)
        row = dict(row)
        duration_focused_min = _duration_focused_min(row, ended_at)
        cur.execute(
            "UPDATE focus_sessions SET ended_at = %s, completed = TRUE, note = %s WHERE id = %s",
            (ended_at, note, session_id),
        )
        return {
            "status": "ok",
            "session": {
                "id": session_id,
                "duration_focused_min": duration_focused_min,
                "completed": True,
            },
        }


def cancel_session(session_id: int) -> dict:
    """Cancela a sessão ativa — não entra nas estatísticas (FR-005)."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE focus_sessions SET ended_at = now(), completed = FALSE "
            "WHERE id = %s AND ended_at IS NULL",
            (session_id,),
        )
        if cur.rowcount == 0:
            return {"status": "error", "message": "sessão não encontrada ou já encerrada"}
        return {"status": "ok"}


def list_sessions_for_range(start_date: str, end_date: str) -> list[dict]:
    """Sessões (ativas + concluídas) cujo dia local cai no intervalo ``[start_date, end_date]``.

    ``date_local`` usa ``ended_at`` quando a sessão já fechou, senão ``now()`` (sessão
    ativa conta parcialmente no dia de hoje) — sempre convertido para America/Sao_Paulo
    (FR-012). Canceladas e abandonadas (``completed = FALSE``) não entram — só
    concluídas (``completed = TRUE``) e a ativa (ainda ``NULL``) contam no resumo.
    """
    rows = run_select(
        """
        SELECT
            fs.id, fs.task_id, t.title AS task_title, fs.started_at, fs.ended_at,
            fs.duration_planned_min, fs.completed,
            (COALESCE(fs.ended_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date AS date_local
        FROM focus_sessions fs
        LEFT JOIN tasks t ON t.id = fs.task_id
        WHERE (fs.completed IS TRUE OR fs.ended_at IS NULL)
          AND (COALESCE(fs.ended_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date
              BETWEEN %(start)s AND %(end)s
        ORDER BY fs.started_at
        """,
        {"start": start_date, "end": end_date},
    )
    result = []
    for row in rows:
        ended_at = row["ended_at"] or datetime.now(row["started_at"].tzinfo)
        result.append(
            {
                "id": row["id"],
                "task_id": row["task_id"],
                "task_title": row.get("task_title"),
                "started_at": row["started_at"],
                "date_local": row["date_local"].isoformat(),
                "duration_focused_min": _duration_focused_min(row, ended_at),
                "completed": row["completed"],
            }
        )
    return result


def get_focus_today() -> dict:
    """Resumo do dia local: tempo total focado + número de sessões (FR-010)."""
    today = _today_sp()
    sessions = list_sessions_for_range(today.isoformat(), today.isoformat())
    stats = FS.aggregate_by_day(sessions)
    day_stats = stats.get(today.isoformat(), {"total_min": 0, "sessoes": 0})
    return {"date": today.isoformat(), **day_stats}


def get_focus_week() -> dict:
    """Série dos últimos 7 dias locais (hoje incluso), com dias sem sessão zerados (FR-010)."""
    today = _today_sp()
    start = today - timedelta(days=6)
    sessions = list_sessions_for_range(start.isoformat(), today.isoformat())
    stats = FS.aggregate_by_day(sessions)
    days = []
    for i in range(7):
        d = (start + timedelta(days=i)).isoformat()
        day_stats = stats.get(d, {"total_min": 0, "sessoes": 0})
        days.append({"date": d, **day_stats})
    return {"days": days}


def get_focus_history(date_str: Optional[str] = None) -> list[dict]:
    """Sessões concluídas de um dia local (default: hoje) — tarefa, horário, duração (US3)."""
    day = date_str or _today_sp().isoformat()
    rows = run_select(
        """
        SELECT fs.id, fs.task_id, t.title AS task_title, fs.started_at, fs.ended_at,
               fs.duration_planned_min, fs.note
        FROM focus_sessions fs
        LEFT JOIN tasks t ON t.id = fs.task_id
        WHERE fs.completed IS TRUE
          AND (fs.ended_at AT TIME ZONE 'America/Sao_Paulo')::date = %(day)s
        ORDER BY fs.started_at
        """,
        {"day": day},
    )
    result = []
    for row in rows:
        result.append(
            {
                "id": row["id"],
                "task_id": row["task_id"],
                "task_title": row.get("task_title"),
                "started_at": row["started_at"].isoformat(),
                "duration_focused_min": _duration_focused_min(row, row["ended_at"]),
                "note": row.get("note"),
            }
        )
    return result
