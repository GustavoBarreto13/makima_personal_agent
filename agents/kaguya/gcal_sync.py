"""Espelho de saída best-effort: sincroniza tarefas e hábitos Kaguya → Google Calendar.

Propósito
---------
Toda mutação de tarefa com data (create/update/complete/reopen/delete/restore/
set_time_block/clear_time_block) chama `push_task` ou `remove_task_event` após
o commit PostgreSQL, **fora da transação** (não segurar o lock durante HTTP).

Desde a spec 067, o mesmo padrão cobre os **alertas de hábito**: cada linha de
`habit_schedules` (um dia da semana + horário opcional) vira um evento recorrente
semanal no calendário dedicado "Kaguya — Hábitos" — separado de "Kaguya — Tarefas"
para o usuário poder silenciar/ocultar hábitos no Google sem afetar tarefas. Mutações
em hábito/schedule chamam `push_habit` ou `remove_habit_events`, mesma assinatura.

As funções públicas são **fire-and-forget assíncronas**: submetem o trabalho a
um worker thread de background e retornam imediatamente, sem bloquear o request.
Isso elimina a latência do round-trip ao Google no caminho crítico de cada save.

Internamente, `_push_task_sync`/`_remove_task_event_sync` e `_push_habit_sync`/
`_remove_habit_events_sync` continuam síncronos e **nunca levantam exceção** —
falhas do Google (rede, credenciais) são logadas como warning para diagnóstico, mas
não abortam a operação principal.

O espelho é controlado pela variável GCAL_SYNC_ENABLED (padrão: "true").
Se GCAL_SYNC_ENABLED=false, todas as chamadas viram no-op (sem submeter ao executor).

Executor
--------
Um único worker thread (``ThreadPoolExecutor(max_workers=1)``) serializa as
escritas no Google Calendar — preserva a ordem das mutações da mesma tarefa e
evita martelar a API com requisições paralelas. Instanciado em nível de módulo
(lazy, daemon): encerra junto com o processo sem await explícito.

Usage:
    >>> from agents.kaguya import gcal_sync
    >>> gcal_sync.push_task(task_id=42)          # fire-and-forget
    >>> gcal_sync.remove_task_event(task_id=42)  # fire-and-forget
    >>> gcal_sync.push_habit(habit_id=7)         # fire-and-forget
    >>> gcal_sync.remove_habit_events(habit_id=7)  # fire-and-forget
"""

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Importa o cliente Google Calendar compartilhado
from agents.kaguya import gcal
# Motor puro de recorrência — usado para o DTSTART e a RRULE dos alertas de hábito (spec 067)
from agents.kaguya import recurrence
# Importa o helper PostgreSQL compartilhado (run_select, run_dml)
from agents.db import run_select, run_dml

_log = logging.getLogger("kaguya.gcal_sync")

# Fuso horário de São Paulo — horários dos eventos devem sempre ser exibidos neste fuso.
# Quando o Google recebe um dateTime com offset +00:00, ele ignora o campo timeZone
# e posiciona o evento em UTC, resultando em -3h no calendário do usuário.
# A solução é sempre enviar o offset -03:00 (ou -02:00 em horário de verão) explícito.
_SP_TZ = ZoneInfo("America/Sao_Paulo")

# Lembrete popup 30min antes — aplicado a todo evento COM horário (time-blocking ou
# due_time), já que eventos de dia inteiro não disparam push por padrão no Google
# Calendar. `useDefault: False` é necessário para o override ter efeito (senão o
# Google ignora `overrides` e usa só o padrão do calendário "Kaguya — Tarefas").
_POPUP_REMINDER = {"useDefault": False, "overrides": [{"method": "popup", "minutes": 30}]}


def _to_sp_iso(val) -> str:
    """Converte um datetime ou string ISO para string ISO 8601 com offset de São Paulo.

    Aceita tanto objetos datetime quanto strings. Strings naive (sem offset) são
    tratadas como UTC (convenção do banco PostgreSQL: timestamptz armazena em UTC).
    O resultado final sempre tem o offset de São Paulo (ex.: "2026-06-15T14:00:00-03:00").
    Isso garante que o Google Calendar posicione o evento no horário correto — quando
    o dateTime tem offset explícito, o campo timeZone é ignorado pelo Google.

    Args:
        val: Objeto datetime (aware ou naive) ou string ISO 8601.

    Returns:
        String ISO 8601 com offset de São Paulo (ex.: "2026-06-15T14:00:00-03:00").
    """
    if isinstance(val, str):
        # Parseia a string para objeto datetime
        dt = datetime.fromisoformat(val)
    else:
        # Já é um objeto datetime — usa diretamente
        dt = val

    if dt.tzinfo is None:
        # Datetime naive (sem fuso) vindo do banco = UTC (padrão do PostgreSQL)
        # Associa UTC explicitamente antes de converter
        dt = dt.replace(tzinfo=timezone.utc)

    # Converte para São Paulo e retorna a string com o offset correto (-03:00 ou -02:00)
    return dt.astimezone(_SP_TZ).isoformat()


# ---------------------------------------------------------------------------
# Executor de módulo — single worker, FIFO, daemon
# ---------------------------------------------------------------------------

# max_workers=1 garante que as escritas ao Google Calendar são serializadas:
# - Preserva a ordem das mutações (create → update → delete da mesma tarefa)
# - Evita criar múltiplas conexões simultâneas com a API do Google
# thread_name_prefix facilita identificar o worker em stack traces e logs
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gcal-sync")


# ---------------------------------------------------------------------------
# Gate de feature — desabilita tudo sem afetar o CRUD de tarefas
# ---------------------------------------------------------------------------

def _enabled() -> bool:
    """Retorna True se o espelho Google está ativo.

    Lê GCAL_SYNC_ENABLED em cada chamada para permitir toggle em runtime
    (ex.: em testes, setar a variável depois de importar o módulo).

    Returns:
        True se o espelho deve operar; False se está desabilitado.
    """
    # "false" (qualquer caixa) desativa; qualquer outro valor mantém ativo
    return os.environ.get("GCAL_SYNC_ENABLED", "true").lower() != "false"


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _load_task(task_id: int) -> dict | None:
    """Carrega os campos necessários da tarefa para montar o evento.

    Args:
        task_id: ID da tarefa no banco.

    Returns:
        Dict com campos da tarefa ou None se não encontrada / soft-deletada.
    """
    rows = run_select(
        """
        SELECT id, title, due_date, due_time, start_at, end_at, completed_at,
               google_event_id, deleted_at
        FROM tasks
        WHERE id = %(task_id)s
        """,
        {"task_id": task_id},
    )
    return rows[0] if rows else None


def _build_event_payload(task: dict) -> dict:
    """Monta o payload do evento Google a partir dos campos da tarefa.

    Decisão timed vs all-day (data-model §5):
    - `start_at` preenchido → evento com hora (dateTime)
    - só `due_date` → evento de dia inteiro (all_day=True)

    Tarefa concluída recebe prefixo "✓ " no título para distinção visual
    no Google Calendar (sem remover o evento, que serve como histórico).

    Args:
        task: Dict com campos da tarefa (carregado por `_load_task`).

    Returns:
        Dict com os campos aceitos por `gcal.create_event` / `gcal.update_event`:
        summary, start, end, all_day, description.
        Retorna dict vazio se a tarefa não tiver data (não deve ser espelhada).
    """
    # Prefixo "✓ " quando a tarefa está concluída
    title = task["title"] or "(sem título)"
    if task.get("completed_at"):
        summary = f"✓ {title}"
    else:
        summary = title

    # Determina o tipo de evento: com hora ou dia inteiro
    if task.get("start_at"):
        # Tarefa com time-blocking: usar o bloco de tempo como horário do evento.
        # CRÍTICO: _to_sp_iso converte para offset de São Paulo (-03:00 ou -02:00).
        # Se enviássemos +00:00 (UTC), o Google ignoraria o campo timeZone e
        # posicionaria o evento 3h antes do horário desejado.
        start_str = _to_sp_iso(task["start_at"])

        # Usa end_at se disponível; senão deriva 30 min após start_at (já em SP).
        if task.get("end_at"):
            # Mesma conversão para end_at
            end_str = _to_sp_iso(task["end_at"])
        else:
            # Deriva end_at = start_at + 30 min a partir do datetime já convertido para SP
            try:
                # _to_sp_iso já retornou a string; parseia de volta para somar o delta
                start_dt_sp = datetime.fromisoformat(start_str)
                end_str = (start_dt_sp + timedelta(minutes=30)).isoformat()
            except ValueError:
                # Fallback improvável: repete o start (evento de duração zero)
                end_str = start_str

        return {
            "summary": summary,
            "start": start_str,
            "end": end_str,
            "all_day": False,
            "reminders": _POPUP_REMINDER,
        }

    elif task.get("due_date") and task.get("due_time"):
        # Tarefa com due_date + due_time, mas SEM time-block: também vira evento com
        # horário (antes virava all-day e o due_time era descartado — all-day não
        # dispara push por padrão no Google Calendar). due_date/due_time são
        # wall-clock LOCAL (colunas DATE/TIME simples, não timestamptz) — diferente de
        # start_at/end_at, não usar _to_sp_iso (que trataria naive como UTC e
        # deslocaria 3h); aqui anexamos o fuso de São Paulo diretamente.
        due_date_obj = task["due_date"]
        if not isinstance(due_date_obj, date):
            due_date_obj = date.fromisoformat(due_date_obj)
        start_dt = datetime.combine(due_date_obj, task["due_time"], tzinfo=_SP_TZ)
        end_dt = start_dt + timedelta(minutes=30)

        return {
            "summary": summary,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "all_day": False,
            "reminders": _POPUP_REMINDER,
        }

    elif task.get("due_date"):
        # Tarefa só com data (sem due_time): evento de dia inteiro
        # due_date pode ser um date object (psycopg2 retorna date) ou string
        due = task["due_date"]
        if hasattr(due, "isoformat"):
            due = due.isoformat()   # "YYYY-MM-DD"

        return {
            "summary": summary,
            "start": due,
            "end": due,   # Google exige end ≥ start; para all-day repete o dia
            "all_day": True,
        }

    else:
        # Tarefa sem data — não deve ser espelhada
        return {}


# ---------------------------------------------------------------------------
# Implementações síncronas internas (executadas no worker thread)
# ---------------------------------------------------------------------------

def _push_task_sync(task_id: int) -> None:
    """Cria ou atualiza o evento espelho desta tarefa no Google Calendar (síncrono).

    Chamado pelo executor de background — nunca diretamente pelo código de negócio.

    Fluxo:
    1. Carrega a tarefa do banco.
    2. Se a tarefa não tem data (due_date nem start_at), não espelha.
    3. Se `google_event_id` já existe → atualiza o evento existente (upsert idempotente).
    4. Se não existe → cria um novo evento no calendário "Kaguya — Tarefas" e salva
       o ID retornado em `tasks.google_event_id`.

    Nunca levanta exceção — qualquer falha (rede, credenciais, quota) é logada como
    warning para diagnóstico, mas não aborta a operação principal.

    Args:
        task_id: ID da tarefa a espelhar.
    """
    try:
        # Carrega os dados necessários do banco
        task = _load_task(task_id)
        if task is None:
            return   # Tarefa não encontrada (pode ter sido deletada permanentemente)

        # Monta o payload do evento
        payload = _build_event_payload(task)
        if not payload:
            return   # Tarefa sem data — não espelha

        # Garante que o calendário "Kaguya — Tarefas" existe (idempotente)
        kaguya_cal_id = gcal.ensure_kaguya_calendar()

        existing_event_id = task.get("google_event_id")

        if existing_event_id:
            # Evento já existe no Google — atualiza os campos que mudaram.
            # all_day passado explicitamente → fast-path em gcal.update_event (sem GET)
            gcal.update_event(
                calendar_id=kaguya_cal_id,
                event_id=existing_event_id,
                summary=payload["summary"],
                start=payload["start"],
                end=payload["end"],
                all_day=payload["all_day"],
                reminders=payload.get("reminders"),
            )
        else:
            # Evento ainda não existe — cria e salva o ID retornado
            result = gcal.create_event(
                calendar_id=kaguya_cal_id,
                summary=payload["summary"],
                start=payload["start"],
                end=payload["end"],
                all_day=payload["all_day"],
                reminders=payload.get("reminders"),
            )
            new_event_id = result.get("id")
            if new_event_id:
                # Persiste o ID do evento no banco para upserts futuros
                run_dml(
                    "UPDATE tasks SET google_event_id = %(eid)s WHERE id = %(tid)s",
                    {"eid": new_event_id, "tid": task_id},
                )

    except Exception:
        # Falha best-effort: logada como warning para diagnóstico.
        # O CRUD de tarefas não pode ser bloqueado por indisponibilidade do Google.
        _log.warning("falha no sync GCal task=%s", task_id, exc_info=True)


def _remove_task_event_sync(task_id: int) -> None:
    """Remove o evento espelho desta tarefa do Google Calendar e limpa o ID no banco (síncrono).

    Chamado pelo executor de background — nunca diretamente pelo código de negócio.

    Se a tarefa não tem `google_event_id`, retorna silenciosamente sem fazer nada.

    Nunca levanta exceção — qualquer falha Google é logada como warning.

    Args:
        task_id: ID da tarefa cujo evento deve ser removido.
    """
    try:
        # Carrega o google_event_id da tarefa
        task = _load_task(task_id)
        if task is None:
            return

        event_id = task.get("google_event_id")
        if not event_id:
            return   # Sem evento espelho — nada a remover

        # Garante o ID do calendário "Kaguya — Tarefas"
        kaguya_cal_id = gcal.ensure_kaguya_calendar()

        # Remove o evento do Google Calendar
        gcal.delete_event(calendar_id=kaguya_cal_id, event_id=event_id)

        # Limpa o ID no banco para evitar tentativas de update/delete futuros
        run_dml(
            "UPDATE tasks SET google_event_id = NULL WHERE id = %(tid)s",
            {"tid": task_id},
        )

    except Exception:
        # Falha best-effort: logada como warning para diagnóstico.
        _log.warning("falha ao remover evento GCal task=%s", task_id, exc_info=True)


# ---------------------------------------------------------------------------
# Alertas de hábito (spec 067) — helpers internos
# ---------------------------------------------------------------------------

# Duração padrão do evento quando o hábito não declara `duration_min` (mesma escolha
# de `_build_event_payload` para tarefa com start_at sem end_at — ver acima).
_HABIT_DEFAULT_MIN = 30


def _load_habit_with_schedules(habit_id: int) -> dict | None:
    """Carrega os campos de agenda do hábito e todas as suas linhas de `habit_schedules`.

    Args:
        habit_id: ID do hábito no banco.

    Returns:
        Dict com os campos do hábito e a chave extra `schedules` (lista de linhas de
        `habit_schedules`), ou None se o hábito não existir.
    """
    habits = run_select(
        """
        SELECT id, name, icon, reminder_lead_min, duration_min, archived_at
        FROM habits
        WHERE id = %(habit_id)s
        """,
        {"habit_id": habit_id},
    )
    if not habits:
        return None
    habit = habits[0]
    habit["schedules"] = run_select(
        """
        SELECT id, weekday, time_of_day, google_event_id
        FROM habit_schedules
        WHERE habit_id = %(habit_id)s
        ORDER BY id
        """,
        {"habit_id": habit_id},
    )
    return habit


def _build_habit_event_payload(habit: dict, schedule: dict, *, today_sp: date) -> dict:
    """Monta o payload do evento Google para uma linha de `habit_schedules`.

    Dois branches, espelhando `_build_event_payload` (tarefas) — decisão timed vs
    all-day, só que aqui a chave é `time_of_day is None`, não a presença de uma coluna:

    - **COM hora** → evento cronometrado, recorrente semanal (`RRULE:FREQ=WEEKLY;
      BYDAY=<dia>`), com lembrete popup `reminder_lead_min` minutos antes.
    - **SEM hora** → evento de dia inteiro, recorrente semanal, **sem** `reminders`
      (herda o padrão do calendário) — o Google não dispara push em all-day por
      padrão; trade-off aceito na decisão de produto da spec 067.

    Args:
        habit: Dict do hábito (de `_load_habit_with_schedules`).
        schedule: Uma linha de `habit_schedules` (`weekday`, `time_of_day`).
        today_sp: "Hoje" em America/Sao_Paulo — usado para calcular o DTSTART (a
            primeira ocorrência do dia da semana em/depois de hoje).

    Returns:
        Dict com os campos aceitos por `gcal.create_event` / `gcal.update_event`:
        summary, start, end, all_day, recurrence e (quando com hora) reminders.
    """
    dia = recurrence.next_weekday_on_or_after(schedule["weekday"], today_sp)
    rrule = [f"RRULE:{recurrence.build_rrule('WEEKLY', weekday=schedule['weekday'])}"]
    summary = f"{habit.get('icon') or '🔁'} {habit['name']}"

    if schedule.get("time_of_day") is not None:
        # COM hora: evento cronometrado + push. DTSTART já em São Paulo — datetime.combine
        # com tzinfo explícito, NUNCA _to_sp_iso (que trataria naive como UTC e deslocaria
        # 3h) — mesma regra já documentada para due_date+due_time de tarefas acima.
        inicio = datetime.combine(dia, schedule["time_of_day"], tzinfo=_SP_TZ)
        duracao = habit.get("duration_min") or _HABIT_DEFAULT_MIN
        fim = inicio + timedelta(minutes=duracao)
        return {
            "summary": summary,
            "start": inicio.isoformat(),
            "end": fim.isoformat(),
            "all_day": False,
            "recurrence": rrule,
            "reminders": {
                "useDefault": False,
                "overrides": [{"method": "popup", "minutes": habit.get("reminder_lead_min") or 0}],
            },
        }

    # SEM hora: evento de dia inteiro. end = start repete o dia (mesma convenção do
    # branch all-day de tarefas acima) — a API do Google trata end.date como exclusivo,
    # mas essa forma já está em produção lá; seguimos a mesma convenção aqui.
    dia_iso = dia.isoformat()
    return {
        "summary": summary,
        "start": dia_iso,
        "end": dia_iso,
        "all_day": True,
        "recurrence": rrule,
    }


def _push_habit_sync(habit_id: int) -> None:
    """Reconcilia TODOS os eventos-espelho de um hábito no Google Calendar (síncrono).

    Chamado pelo executor de background — nunca diretamente pelo código de negócio.

    Diferente de `_push_task_sync` (que trata uma tarefa = um evento), aqui um hábito
    pode ter várias linhas em `habit_schedules` (uma por dia da semana) — cada uma é
    seu próprio evento recorrente. A função faz upsert de cada linha por
    `google_event_id`: atualiza se já existe, cria e persiste o id se não.

    Hábito arquivado ou inexistente é ignorado (defensivo — o call site normal para
    arquivar é `remove_habit_events`, nunca este).

    Nunca levanta exceção — qualquer falha (rede, credenciais, quota) é logada como
    warning para diagnóstico, mas não aborta a operação principal.

    Args:
        habit_id: ID do hábito a reconciliar.
    """
    try:
        habit = _load_habit_with_schedules(habit_id)
        if habit is None or habit.get("archived_at"):
            return   # Hábito não encontrado ou arquivado — nada a espelhar

        schedules = habit.get("schedules") or []
        if not schedules:
            return   # Sem dias marcados — nada a espelhar

        habits_cal_id = gcal.ensure_habits_calendar()
        hoje_sp = datetime.now(_SP_TZ).date()

        for sch in schedules:
            payload = _build_habit_event_payload(habit, sch, today_sp=hoje_sp)
            existing_event_id = sch.get("google_event_id")

            if existing_event_id:
                # Evento já existe — atualiza os campos que mudaram.
                # all_day passado explicitamente → fast-path em gcal.update_event (sem GET)
                gcal.update_event(
                    calendar_id=habits_cal_id,
                    event_id=existing_event_id,
                    summary=payload["summary"],
                    start=payload["start"],
                    end=payload["end"],
                    all_day=payload["all_day"],
                    recurrence=payload["recurrence"],
                    reminders=payload.get("reminders"),
                )
            else:
                # Evento ainda não existe — cria e persiste o id na linha de schedule
                result = gcal.create_event(
                    calendar_id=habits_cal_id,
                    summary=payload["summary"],
                    start=payload["start"],
                    end=payload["end"],
                    all_day=payload["all_day"],
                    recurrence=payload["recurrence"],
                    reminders=payload.get("reminders"),
                )
                new_event_id = result.get("id")
                if new_event_id:
                    run_dml(
                        "UPDATE habit_schedules SET google_event_id = %(eid)s WHERE id = %(sid)s",
                        {"eid": new_event_id, "sid": sch["id"]},
                    )

    except Exception:
        # Falha best-effort: logada como warning para diagnóstico.
        # O CRUD de hábito não pode ser bloqueado por indisponibilidade do Google.
        _log.warning("falha no sync GCal habit=%s", habit_id, exc_info=True)


def _remove_habit_events_sync(habit_id: int) -> None:
    """Remove TODOS os eventos-espelho de um hábito do Google Calendar (síncrono).

    Chamado pelo executor de background — nunca diretamente pelo código de negócio.
    Usado ao arquivar um hábito (a nota de consistência preserva o histórico; os
    alertas no Google não fazem mais sentido).

    Nunca levanta exceção — qualquer falha Google é logada como warning.

    Args:
        habit_id: ID do hábito cujos eventos devem ser removidos.
    """
    try:
        schedules = run_select(
            """
            SELECT id, google_event_id FROM habit_schedules
            WHERE habit_id = %(habit_id)s AND google_event_id IS NOT NULL
            """,
            {"habit_id": habit_id},
        )
        if not schedules:
            return   # Sem eventos espelho — nada a remover

        habits_cal_id = gcal.ensure_habits_calendar()

        for sch in schedules:
            gcal.delete_event(calendar_id=habits_cal_id, event_id=sch["google_event_id"])

        # Limpa os ids no banco para evitar tentativas de update/delete futuros
        run_dml(
            "UPDATE habit_schedules SET google_event_id = NULL WHERE habit_id = %(habit_id)s",
            {"habit_id": habit_id},
        )

    except Exception:
        # Falha best-effort: logada como warning para diagnóstico.
        _log.warning("falha ao remover eventos GCal habit=%s", habit_id, exc_info=True)


def _remove_schedule_events_sync(event_ids: list[str]) -> None:
    """Remove uma lista específica de eventos-espelho do calendário "Kaguya — Hábitos" (síncrono).

    Chamado pelo executor de background — nunca diretamente pelo código de negócio.

    Diferente de `_remove_habit_events_sync` (que apaga TODOS os eventos de um hábito),
    esta função recebe diretamente os `google_event_id` a remover — usada por
    `tools_habits.set_habit_schedule` quando só ALGUNS dias saem do conjunto (o diff
    preserva os dias que ficam, então só os órfãos precisam ser apagados no Google).

    Nunca levanta exceção — qualquer falha Google é logada como warning.

    Args:
        event_ids: Lista de ids de evento do Google a remover.
    """
    try:
        if not event_ids:
            return
        habits_cal_id = gcal.ensure_habits_calendar()
        for event_id in event_ids:
            gcal.delete_event(calendar_id=habits_cal_id, event_id=event_id)
    except Exception:
        _log.warning("falha ao remover eventos GCal órfãos ids=%s", event_ids, exc_info=True)


# ---------------------------------------------------------------------------
# Funções públicas (fire-and-forget)
# ---------------------------------------------------------------------------

def push_task(task_id: int) -> None:
    """Agenda a criação/atualização do evento espelho desta tarefa no Google Calendar.

    Fire-and-forget: submete `_push_task_sync` ao worker thread de background e
    retorna imediatamente, sem bloquear o request. O save de tarefa não espera
    pelo round-trip ao Google.

    No-op silencioso se GCAL_SYNC_ENABLED=false.

    Args:
        task_id: ID da tarefa a espelhar.
    """
    if not _enabled():
        return
    _executor.submit(_push_task_sync, task_id)


def remove_task_event(task_id: int) -> None:
    """Agenda a remoção do evento espelho desta tarefa do Google Calendar.

    Fire-and-forget: submete `_remove_task_event_sync` ao worker thread de background
    e retorna imediatamente.

    No-op silencioso se GCAL_SYNC_ENABLED=false.

    Args:
        task_id: ID da tarefa cujo evento deve ser removido.
    """
    if not _enabled():
        return
    _executor.submit(_remove_task_event_sync, task_id)


def push_habit(habit_id: int) -> None:
    """Agenda a reconciliação de todos os eventos-espelho deste hábito no Google Calendar.

    Fire-and-forget: submete `_push_habit_sync` ao worker thread de background e
    retorna imediatamente. Chamado por `create_habit`/`update_habit`/
    `set_habit_schedule`/`unarchive_habit` (spec 067) — sempre depois do commit
    PostgreSQL.

    No-op silencioso se GCAL_SYNC_ENABLED=false.

    Args:
        habit_id: ID do hábito a reconciliar.
    """
    if not _enabled():
        return
    _executor.submit(_push_habit_sync, habit_id)


def remove_habit_events(habit_id: int) -> None:
    """Agenda a remoção de todos os eventos-espelho deste hábito do Google Calendar.

    Fire-and-forget: submete `_remove_habit_events_sync` ao worker thread de
    background e retorna imediatamente. Chamado por `archive_habit` (spec 067).

    No-op silencioso se GCAL_SYNC_ENABLED=false.

    Args:
        habit_id: ID do hábito cujos eventos devem ser removidos.
    """
    if not _enabled():
        return
    _executor.submit(_remove_habit_events_sync, habit_id)


def remove_schedule_events(event_ids: list[str]) -> None:
    """Agenda a remoção de uma lista específica de eventos do calendário "Kaguya — Hábitos".

    Fire-and-forget: submete `_remove_schedule_events_sync` ao worker thread de
    background e retorna imediatamente. Chamado por `set_habit_schedule` (spec 067)
    quando o diff de horários tira alguns dias do conjunto sem remover o hábito inteiro.

    No-op silencioso se GCAL_SYNC_ENABLED=false ou a lista estiver vazia.

    Args:
        event_ids: Lista de ids de evento do Google a remover.
    """
    if not _enabled() or not event_ids:
        return
    _executor.submit(_remove_schedule_events_sync, event_ids)
