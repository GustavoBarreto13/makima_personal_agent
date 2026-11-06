"""Fontes de dados dos lembretes do app (banco, Komi e Google) — alimenta `reminder_engine`.

Cada `collect_*` lê uma fonte e devolve `Reminder`s prontos; `collect_all()` junta todas isolando falhas
(uma fonte fora do ar nunca derruba as outras). A decisão de "quando avisar" mora em `reminder_engine.py`
(motor puro, testado sem banco); aqui só entra o acesso a dados.

Sem push duplicado: as reuniões do Google vêm de `gcal.list_events` com o `exclude` padrão, que já
esconde "Kaguya — Tarefas" e os 7 calendários-espelho (tudo isso é avisado pelas fontes nativas), mais
"Kaguya — Hábitos" (os hábitos são avisados por `collect_habits`).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Callable

from agents.db import run_select
from agents.kaguya import reminder_engine as eng
from agents.kaguya.task_state import chargeable_sql
from agents.kaguya.tz import SP_TZ

log = logging.getLogger("kaguya.reminder_sources")

# Código iCal do dia da semana (date.weekday(): segunda = 0), igual ao de habit_schedules.weekday.
_ICAL_WEEKDAY = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")

# Quantos dias à frente a Komi é consultada: o maior aviso configurável é de 27 dias (calendar_provider).
_KOMI_LOOKAHEAD_DAYS = 28


def collect_tasks(now: datetime) -> list[eng.Reminder]:
    """Tarefas e eventos com horário (ou bloco de tempo) que acontecem de ontem a amanhã.

    Só entram pendências reais do usuário (``chargeable_sql``: Homolog/Blocked/Backlog e GTD
    aguardando/algum dia não avisam), de lista não arquivada e já "iniciadas" (``start_date``).
    A janela ontem→amanhã cobre avisos com antecedência de até 1 dia e a virada da meia-noite.
    """
    hoje = now.astimezone(SP_TZ).date()
    rows = run_select(
        f"""
        SELECT t.id, t.title, t.type, t.due_date, t.due_time, t.start_at, t.reminder_lead_min,
               p.name AS project_name
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        LEFT JOIN task_columns c ON c.id = t.column_id
        WHERE t.parent_id IS NULL
          AND t.deleted_at IS NULL
          AND t.completed_at IS NULL
          AND p.archived_at IS NULL
          AND {chargeable_sql()}
          AND (t.start_date IS NULL OR t.start_date <= %(hoje)s)
          AND (
                (t.due_date BETWEEN %(ontem)s AND %(amanha)s AND t.due_time IS NOT NULL)
             OR (t.start_at >= %(ini)s AND t.start_at < %(fim)s)
          )
        """,
        {
            "hoje": hoje,
            "ontem": hoje - timedelta(days=1),
            "amanha": hoje + timedelta(days=1),
            "ini": now - timedelta(days=1),
            "fim": now + timedelta(days=2),
        },
    )
    return [r for r in (eng.task_reminder(row) for row in rows) if r is not None]


def collect_habits(now: datetime) -> list[eng.Reminder]:
    """Alertas dos hábitos agendados para o dia da semana de hoje e ainda sem check-in hoje."""
    hoje = now.astimezone(SP_TZ).date()
    rows = run_select(
        """
        SELECT h.id, h.name, hs.time_of_day, h.reminder_lead_min,
               EXISTS (SELECT 1 FROM habit_checkins k WHERE k.habit_id = h.id AND k.date = %(hoje)s) AS checked_today
        FROM habits h
        JOIN habit_schedules hs ON hs.habit_id = h.id
        WHERE h.archived_at IS NULL
          AND hs.weekday = %(dia)s
          AND hs.time_of_day IS NOT NULL
        """,
        {"hoje": hoje, "dia": _ICAL_WEEKDAY[hoje.weekday()]},
    )
    return [r for r in (eng.habit_reminder(row, hoje) for row in rows) if r is not None]


def collect_komi(now: datetime) -> list[eng.Reminder]:
    """Aniversários e datas importantes da Komi com lembrete (aviso às 9h do dia configurado)."""
    from agents.komi.calendar_provider import list_calendar_events  # lazy: a Komi pode nem estar aplicada

    hoje = now.astimezone(SP_TZ).date()
    itens = list_calendar_events(hoje.isoformat(), (hoje + timedelta(days=_KOMI_LOOKAHEAD_DAYS)).isoformat())
    return eng.komi_reminders(itens)


def collect_google(now: datetime) -> list[eng.Reminder]:
    """Reuniões marcadas direto no Google (não espelhadas da Makima) de hoje e amanhã."""
    from agents.kaguya import gcal

    hoje = now.astimezone(SP_TZ).date()
    eventos = gcal.list_events(
        hoje.isoformat(),
        (hoje + timedelta(days=1)).isoformat(),
        exclude=(*gcal._DEFAULT_EXCLUDE, "Kaguya — Hábitos"),
    )
    return eng.google_reminders(eventos)


def collect_summary(now: datetime) -> list[eng.Reminder]:
    """Resumo curto das 07:30: quantas tarefas hoje, atrasadas e o 1º compromisso com hora."""
    from agents.kaguya.tools_tasks import list_tasks_today

    hoje = now.astimezone(SP_TZ).date()
    dados = list_tasks_today(only_chargeable=True)
    do_dia = dados.get("today", [])
    comhora = sorted(
        (t for t in do_dia if t.get("due_time")), key=lambda t: t["due_time"]
    )
    primeiro = (comhora[0]["due_time"][:5], comhora[0]["title"]) if comhora else None
    resumo = eng.daily_summary(hoje, len(do_dia), len(dados.get("overdue", [])), primeiro)
    return [resumo] if resumo else []


# Fontes na ordem em que aparecem nos logs. (nome, função)
SOURCES: tuple[tuple[str, Callable[[datetime], list[eng.Reminder]]], ...] = (
    ("tarefas", collect_tasks),
    ("habitos", collect_habits),
    ("komi", collect_komi),
    ("google", collect_google),
    ("resumo", collect_summary),
)


def collect_all(now: datetime) -> tuple[list[eng.Reminder], list[str]]:
    """Reúne os candidatos de todas as fontes, isolando falhas.

    Returns:
        ``(lembretes, fontes_com_erro)``. Uma fonte que levanta exceção é registrada e pulada.
    """
    lembretes: list[eng.Reminder] = []
    falhas: list[str] = []
    for nome, fonte in SOURCES:
        try:
            lembretes.extend(fonte(now))
        except Exception:  # noqa: BLE001 — uma fonte fora do ar não derruba as outras
            log.exception("Fonte de lembretes '%s' falhou.", nome)
            falhas.append(nome)
    return lembretes, falhas
