"""Camada de lógica — **Foco / Pomodoro gameficado** (spec 037 + spec 062).

Ciclo pomodoro da Kaguya: o usuário inicia uma sessão de foco (ligada a uma tarefa, a
um hábito, ou avulsa), escolhe a duração (presets 25/5, 50/10 ou custom), e a sessão
fica ativa até ser concluída, cancelada, ou fechada automaticamente por abandono.
**Webapp-only**: nenhuma função aqui é registrada como tool no agente ADK (mesma
decisão das specs 024/029/030/035/036) — ``tools.py`` só re-exporta para o router REST
consumir.

Princípio central: **nada persistido derivado** (mesmo padrão de
``goal_progress``/``habit_strength``/``experiment_adherence``/``focus_stats``/
``focus_achievements``). O único dado gravado é o registro bruto da sessão
(``focus_sessions``); tempo restante, fase (foco/pausa), estatísticas do dia/semana,
streak, conquistas e a "espécie" da árvore da floresta são sempre calculados na
leitura — nunca um cronômetro persistido, nunca um contador de XP salvo.

**Spec 062 — desfecho de 3 vias.** O antigo booleano ``completed`` foi substituído por
``outcome`` (``"completed"``/``"cancelled"``/``"abandoned"``): concluir, desistir
(``cancel_session``, com motivo opcional em texto livre) e ser fechada por timeout
(``_close_if_abandoned``) agora são três desfechos distintos — é o que torna "onde eu
falhei" uma pergunta respondível pelo overview, e não só "quanto tempo eu foquei".

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem/leitura** retornam o dado direto (lista/dict).
    - Acesso ao banco via ``agents.db``; "hoje"/dia local sempre em **UTC-3**
      (``AT TIME ZONE 'America/Sao_Paulo'`` nas queries de agregação — nunca
      ``CURRENT_DATE``/``NOW()::date`` puro).

Ver ``specs/037-tasks-focus-pomodoro/data-model.md`` e o plano da spec 062 (floresta,
vínculo com hábitos, overview de falhas).
"""

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import psycopg2.extras

from agents.db import get_conn, run_select

from agents.kaguya import focus_achievements as FA
from agents.kaguya import focus_stats as FS

# Fuso do usuário (UTC-3) — toda derivação de "hoje" passa por aqui.
_SP_TZ = ZoneInfo("America/Sao_Paulo")

_PREFS_SELECT = "SELECT focus_min, break_min FROM focus_prefs WHERE id = 1"

# Join completo usado por toda leitura de sessão: tarefa (título), hábito (nome) e,
# através da tarefa, a lista (nome/cor/contexto) — é o que alimenta os rankings
# "onde eu foco" e a cor da árvore na floresta.
_SESSION_JOIN = """
    FROM focus_sessions fs
    LEFT JOIN tasks t ON t.id = fs.task_id
    LEFT JOIN habits h ON h.id = fs.habit_id
    LEFT JOIN task_projects p ON p.id = t.project_id
"""

_SESSION_COLUMNS = """
    fs.id, fs.task_id, t.title AS task_title,
    fs.habit_id, h.name AS habit_name,
    t.project_id AS project_id, p.name AS project_title, p.color AS project_color,
    p.context AS context,
    fs.started_at, fs.ended_at,
    fs.duration_planned_min, fs.break_planned_min, fs.outcome, fs.cancel_reason, fs.note
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
        "habit_id": row.get("habit_id"),
        "habit_name": row.get("habit_name"),
        "project_id": row.get("project_id"),
        "project_title": row.get("project_title"),
        "project_color": row.get("project_color"),
        "started_at": row["started_at"].isoformat(),
        "ended_at": row["ended_at"].isoformat() if row["ended_at"] else None,
        "duration_planned_min": row["duration_planned_min"],
        "break_planned_min": row["break_planned_min"],
        "outcome": row.get("outcome"),
        "cancel_reason": row.get("cancel_reason"),
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
    # Progresso 0..1 da copa da árvore (widget) — cresce durante o foco, congela na pausa.
    session["growth"] = max(0.0, min(1.0, elapsed_sec / focus_sec)) if focus_sec else 1.0
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
    Grava ``outcome='abandoned'`` (spec 062) — distinto de ``cancelled`` (desistência
    ativa do usuário): é essa distinção que torna "onde eu falhei" visível no overview.

    Args:
        cur: Cursor já aberto na transação corrente.
        row: Linha da sessão ativa (dict com ``started_at``, ``duration_planned_min``,
            ``break_planned_min``).

    Returns:
        Sempre ``None`` — a sessão fechada por abandono nunca é "a ativa" para quem
        chamou (mesmo comportamento de antes, só o outcome gravado mudou).
    """
    now = datetime.now(row["started_at"].tzinfo)
    deadline = row["started_at"] + timedelta(
        minutes=row["duration_planned_min"] + row["break_planned_min"]
    )
    if now < deadline:
        return None

    ended_at = row["started_at"] + timedelta(minutes=row["duration_planned_min"])
    cur.execute(
        "UPDATE focus_sessions SET ended_at = %s, outcome = 'abandoned' WHERE id = %s",
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
            f"SELECT {_SESSION_COLUMNS} {_SESSION_JOIN} WHERE fs.ended_at IS NULL"
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
    task_id: Optional[int] = None,
    habit_id: Optional[int] = None,
    focus_min: int = 25,
    break_min: int = 5,
    force: bool = False,
) -> dict:
    """Inicia uma sessão de foco — de uma tarefa, de um hábito, ou avulsa (FR-001).

    Se já existe uma sessão ativa e ``force`` é falso, recusa (FR-003 — o frontend
    deve confirmar com o usuário antes de reenviar com ``force=True``); a sessão
    forçosamente encerrada vira ``cancelled`` (o usuário trocou de alvo, não abandonou).
    Sempre grava a escolha de duração em ``focus_prefs`` como o novo padrão (R4).

    ``task_id`` e ``habit_id`` podem coexistir (foco numa tarefa que também é o
    movimento de um hábito) — nenhum dos dois exclui o outro; ambos podem ser
    ``None`` (sessão avulsa).

    Args:
        task_id: Tarefa vinculada, ou ``None``.
        habit_id: Hábito vinculado (spec 062) — concluir a sessão faz o check-in
            automaticamente (ver :func:`finish_session`), ou ``None``.
        focus_min: Minutos de foco planejados.
        break_min: Minutos de pausa planejados.
        force: Se ``True``, cancela a sessão ativa existente antes de iniciar.

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
                "UPDATE focus_sessions SET ended_at = now(), outcome = 'cancelled', "
                "cancel_reason = 'Substituída por uma nova sessão' WHERE id = %s",
                (active["id"],),
            )

        cur.execute(
            "UPDATE focus_prefs SET focus_min = %s, break_min = %s WHERE id = 1",
            (focus_min, break_min),
        )
        cur.execute(
            "INSERT INTO focus_sessions (task_id, habit_id, duration_planned_min, break_planned_min) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (task_id, habit_id, focus_min, break_min),
        )
        new_id = cur.fetchone()["id"]

        cur.execute(f"SELECT {_SESSION_COLUMNS} {_SESSION_JOIN} WHERE fs.id = %s", (new_id,))
        row = dict(cur.fetchone())
        return _derive_phase(row)


def finish_session(session_id: int, note: Optional[str] = None) -> dict:
    """Conclui a sessão ativa — antecipadamente ou no fim natural (FR-005).

    Registra o tempo efetivamente focado (nunca mais que o planejado) e grava
    ``outcome='completed'``. **Se a sessão tem ``habit_id`` vinculado**, faz o
    check-in do hábito na MESMA transação (spec 062) — concluir uma sessão "focada
    NO hábito X" marca o hábito cumprido hoje sem exigir confirmação dupla do
    usuário (mesmo padrão transacional de ``complete_payment_task``, cross-agent
    Kaguya+Nami). O check-in usa o dia local (America/Sao_Paulo) do fim da sessão,
    não o UTC do servidor.
    """
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT started_at, duration_planned_min, habit_id FROM focus_sessions "
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
            "UPDATE focus_sessions SET ended_at = %s, outcome = 'completed', note = %s WHERE id = %s",
            (ended_at, note, session_id),
        )

        habit_checked_in = False
        if row.get("habit_id"):
            # Import lazy — evita ciclo entre tools_focus e tools_habits (mesmo
            # padrão do link_person_on_cursor da Komi).
            from agents.kaguya.tools_habits import _check_in_on_cursor

            dia_local = ended_at.astimezone(_SP_TZ).date().isoformat()
            habit_checked_in = _check_in_on_cursor(cur, row["habit_id"], dia_local)

        return {
            "status": "ok",
            "session": {
                "id": session_id,
                "duration_focused_min": duration_focused_min,
                "outcome": "completed",
                "habit_checked_in": habit_checked_in,
            },
        }


def cancel_session(session_id: int, reason: Optional[str] = None) -> dict:
    """Cancela a sessão ativa — desistência ativa do usuário (FR-005, spec 062).

    Grava ``outcome='cancelled'`` + um motivo **opcional** em texto livre (o
    frontend pergunta "o que te tirou do foco?" mas o campo é pulável). Distinto de
    ``_close_if_abandoned`` (fechamento por timeout, sem o usuário ter voltado ao
    painel) — os dois entram nas estatísticas de falha, mas separadamente.
    """
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE focus_sessions SET ended_at = now(), outcome = 'cancelled', cancel_reason = %s "
            "WHERE id = %s AND ended_at IS NULL",
            (reason, session_id),
        )
        if cur.rowcount == 0:
            return {"status": "error", "message": "sessão não encontrada ou já encerrada"}
        return {"status": "ok"}


def _query_sessions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    task_id: Optional[int] = None,
) -> list[dict]:
    """Consulta sessões com o join completo (tarefa+hábito+lista) já serializadas.

    Base compartilhada por `list_sessions_for_range` (janela de datas — dia/semana),
    `get_focus_achievements`/`get_focus_heatmap` (histórico inteiro, sem bound) e
    `get_task_focus_summary` (filtro por tarefa). Inclui **todas** as sessões
    encerradas (concluídas, canceladas, abandonadas) mais a ativa — ao contrário da
    versão pré-062, que só trazia concluídas+ativa: os motores puros
    (`focus_stats`/`focus_achievements`) são quem decide o que fazer com cada
    desfecho, não a query.

    Args:
        start_date: Início do intervalo (dia local), ou ``None`` para sem limite.
        end_date: Fim do intervalo (dia local), ou ``None`` para sem limite.
        task_id: Filtra por uma tarefa específica, ou ``None`` para todas.

    Returns:
        Lista de dicts no contrato esperado por `focus_stats.py`/`focus_achievements.py`
        (`date_local`, `hour_local`, `duration_focused_min`, `outcome`, ...).
    """
    where = []
    params: dict = {}
    if start_date and end_date:
        where.append(
            "(COALESCE(fs.ended_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date "
            "BETWEEN %(start)s AND %(end)s"
        )
        params["start"] = start_date
        params["end"] = end_date
    if task_id is not None:
        where.append("fs.task_id = %(task_id)s")
        params["task_id"] = task_id
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    rows = run_select(
        f"""
        SELECT
            {_SESSION_COLUMNS},
            (COALESCE(fs.ended_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date AS date_local,
            EXTRACT(HOUR FROM fs.started_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour_local
        {_SESSION_JOIN}
        {where_sql}
        ORDER BY fs.started_at
        """,
        params,
    )
    result = []
    for row in rows:
        ended_at = row["ended_at"] or datetime.now(row["started_at"].tzinfo)
        result.append({
            "id": row["id"],
            "task_id": row["task_id"],
            "task_title": row.get("task_title"),
            "habit_id": row.get("habit_id"),
            "habit_name": row.get("habit_name"),
            "project_id": row.get("project_id"),
            "project_title": row.get("project_title"),
            "project_color": row.get("project_color"),
            "context": row.get("context"),
            "started_at": row["started_at"].isoformat(),
            "ended_at": row["ended_at"].isoformat() if row["ended_at"] else None,
            "date_local": row["date_local"].isoformat(),
            "hour_local": int(row["hour_local"]),
            "duration_planned_min": row["duration_planned_min"],
            "duration_focused_min": _duration_focused_min(row, ended_at),
            "outcome": row.get("outcome"),
            "cancel_reason": row.get("cancel_reason"),
        })
    return result


def list_sessions_for_range(start_date: str, end_date: str) -> list[dict]:
    """Sessões (todos os desfechos + ativa) cujo dia local cai em ``[start_date, end_date]``.

    ``date_local`` usa ``ended_at`` quando a sessão já fechou, senão ``now()`` (sessão
    ativa conta parcialmente no dia de hoje), sempre em America/Sao_Paulo (FR-012).

    Returns:
        Ver `_query_sessions` — inclui canceladas/abandonadas (spec 062); os motores
        puros de `focus_stats.py` filtram por `outcome` conforme a estatística.
    """
    return _query_sessions(start_date, end_date)


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
    """Sessões ENCERRADAS de um dia local (default: hoje) — inclui falhas (spec 062).

    Antes da 062 só trazia concluídas; agora traz qualquer desfecho fechado
    (concluída/cancelada/abandonada, nunca a ativa) para o dia poder mostrar "onde
    eu falhei", não só "quanto foquei" (US3).
    """
    day = date_str or _today_sp().isoformat()
    rows = run_select(
        f"""
        SELECT {_SESSION_COLUMNS}
        {_SESSION_JOIN}
        WHERE fs.ended_at IS NOT NULL
          AND (fs.ended_at AT TIME ZONE 'America/Sao_Paulo')::date = %(day)s
        ORDER BY fs.started_at
        """,
        {"day": day},
    )
    result = []
    for row in rows:
        result.append({
            "id": row["id"],
            "task_id": row["task_id"],
            "task_title": row.get("task_title"),
            "habit_id": row.get("habit_id"),
            "habit_name": row.get("habit_name"),
            "project_id": row.get("project_id"),
            "project_title": row.get("project_title"),
            "project_color": row.get("project_color"),
            "started_at": row["started_at"].isoformat(),
            "duration_focused_min": _duration_focused_min(row, row["ended_at"]),
            "outcome": row.get("outcome"),
            "cancel_reason": row.get("cancel_reason"),
            "note": row.get("note"),
        })
    return result


def get_focus_stats(start_date: str, end_date: str) -> dict:
    """Payload único do overview de foco — o que alimenta a tela inteira (spec 062).

    Orquestra os motores puros de `focus_stats.py` sobre a mesma janela de sessões;
    nenhuma agregação é feita aqui além de montar o dict de resposta (a lógica vive
    toda nos motores puros, testável isoladamente).

    Args:
        start_date: Início do período (dia local, "AAAA-MM-DD").
        end_date: Fim do período (dia local, "AAAA-MM-DD").

    Returns:
        ``{totals, by_day, by_hour, outcome, streak, longest_streak, top_tasks,
        top_projects, top_habits, by_context, recent_reasons, sessions}``.
        ``streak``/``longest_streak`` são calculados sobre o histórico INTEIRO (não
        só o período pedido) — um streak não deveria "desaparecer" só porque o
        usuário está olhando a semana passada.
    """
    sessions = _query_sessions(start_date, end_date)
    all_sessions = _query_sessions()  # histórico inteiro — só para streak/recorde

    day_totals = FS.aggregate_by_day(sessions)
    all_day_totals = FS.aggregate_by_day(all_sessions)

    # Zero-fill dia a dia — a "floresta"/gráfico do período não pode ter buracos.
    by_day = []
    d, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    while d <= end:
        iso = d.isoformat()
        stats = day_totals.get(iso, {"total_min": 0, "sessoes": 0})
        by_day.append({"date": iso, **stats})
        d += timedelta(days=1)

    # Zero-fill 24h — o gráfico "quando eu foco" sempre desenha as 24 colunas.
    hour_stats = FS.aggregate_by_hour(sessions)
    by_hour = [
        {"hour": h, **hour_stats.get(h, {"completed_min": 0, "completed_n": 0, "failed_n": 0})}
        for h in range(24)
    ]

    recent_reasons = [
        {"date": s["date_local"], "reason": s["cancel_reason"], "outcome": s["outcome"]}
        for s in sorted(sessions, key=lambda s: s["started_at"], reverse=True)
        if s.get("outcome") in ("cancelled", "abandoned") and s.get("cancel_reason")
    ][:10]

    return {
        "totals": {
            "total_min": sum(v["total_min"] for v in day_totals.values()),
            "sessoes": sum(v["sessoes"] for v in day_totals.values()),
        },
        "by_day": by_day,
        "by_hour": by_hour,
        "outcome": FS.outcome_stats(sessions),
        "streak": FS.current_streak(all_day_totals, _today_sp()),
        "longest_streak": FS.longest_streak(all_day_totals),
        "top_tasks": FS.top_by(sessions, "task_id"),
        "top_projects": FS.top_by(sessions, "project_id"),
        "top_habits": FS.top_by(sessions, "habit_id"),
        "by_context": FS.top_by(sessions, "context"),
        "recent_reasons": recent_reasons,
        "sessions": sessions,
    }


def get_focus_heatmap(year: int) -> list[dict]:
    """Heatmap anual de minutos focados por dia — espelha `get_habit_history(year)`.

    Args:
        year: Ano (ex.: 2026).

    Returns:
        Lista esparsa ``[{date, total_min, sessoes}]`` — só dias com sessão
        produtiva aparecem (o frontend densifica, mesmo padrão de `HabitHeatmap`).
    """
    start, end = f"{year}-01-01", f"{year}-12-31"
    sessions = _query_sessions(start, end)
    day_totals = FS.aggregate_by_day(sessions)
    return [{"date": d, **stats} for d, stats in sorted(day_totals.items())]


def get_focus_achievements() -> list[dict]:
    """Avalia o catálogo inteiro de conquistas contra o histórico completo de sessões."""
    sessions = _query_sessions()
    return FA.evaluate(sessions, _today_sp())


def get_task_focus_summary(task_id: int) -> dict:
    """Tempo acumulado de foco numa tarefa específica (para o cabeçalho do TaskModal).

    Args:
        task_id: Id da tarefa.

    Returns:
        ``{total_min, sessoes, last_session_at}`` — só sessões concluídas contam
        (mesmo critério de `aggregate_by_day`); `last_session_at` é `None` se nunca
        houve nenhuma.
    """
    sessions = _query_sessions(task_id=task_id)
    completed = [s for s in sessions if s.get("outcome") == "completed"]
    total_min = sum(s.get("duration_focused_min") or 0 for s in completed)
    last_session_at = max((s["started_at"] for s in completed), default=None)
    return {
        "total_min": total_min,
        "sessoes": len(completed),
        "last_session_at": last_session_at,
    }
