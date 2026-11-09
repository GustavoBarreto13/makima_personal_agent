"""Motor PURO dos lembretes do app (sem banco, sem rede, sem relógio global).

O app Android avisa por push quando uma tarefa, evento, hábito, aniversário ou reunião está chegando,
sem depender do Google Calendar. Este módulo só decide **quando** e **o quê**: recebe dados já lidos
(`reminder_sources.py`) e devolve `Reminder`s; o job `app_reminders` (scheduler/) roda a cada minuto,
escolhe os que já deram a hora (`select_due`) e envia.

Regras (decididas com o usuário):
    - Tarefa/evento COM horário: avisa `reminder_lead_min` minutos antes (``None`` = padrão de 10; ``0`` =
      na hora; ``-1`` = sem aviso). Um bloco de tempo (`start_at`) vale mais que `due_time`.
    - Tarefa só com data: não tem aviso próprio — entra no resumo curto das 07:30.
    - Hábito: no horário marcado menos a antecedência do hábito, só nos dias marcados e se ainda não
      houve check-in no dia.
    - Dia inteiro (aniversários/datas da Komi): às 09:00 do dia de aviso (nunca de madrugada).
    - Reunião do Google: antecedência do próprio evento (popup); sem configuração própria, 10 min.

Idempotência: cada `Reminder` tem uma `key` que inclui o instante do evento e a antecedência; reagendar
muda a chave e rearma o aviso sozinho. Quem grava "já enviei" é o job (tabela `app_reminder_log`).

Todo horário é de São Paulo (``tz.SP_TZ``) — o container roda em UTC.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable

from agents.kaguya.tz import SP_TZ

# Antecedência quando a tarefa não define a sua.
DEFAULT_LEAD_MIN = 10
# Quanto tempo depois da hora um aviso ainda vale (scheduler fora do ar, deploy…). Depois disso é descartado.
GRACE_MIN = 15
# Hora do aviso de itens de dia inteiro e a hora mínima aceitável (nada de push de madrugada).
ALLDAY_HOUR = 9
ALLDAY_EARLIEST_HOUR = 8
# Resumo do dia.
SUMMARY_AT = time(7, 30)

# Links profundos (src/lib/deepLink.ts → rota do app). Formato da Kaguya: pages/kaguya/lib/routes.ts.
LINK_KAGUYA = "makima://kaguya/hoje"
LINK_HABITS = "makima://kaguya/habitos"
LINK_CALENDAR = "makima://kaguya/calendario"
LINK_KOMI = "makima://komi"


@dataclass(frozen=True)
class Reminder:
    """Um lembrete pronto para virar notificação.

    Attributes:
        key: Identifica ESTE aviso desta ocorrência (trava de "já enviei").
        fire_at: Instante (com fuso) em que o aviso deve sair.
        title: Título da notificação.
        body: Texto da notificação.
        link: Deep link aberto ao tocar.
        agent: Canal de notificação do Android ("kaguya", "komi"…).
        task_id: Id da tarefa, quando o lembrete é de uma tarefa (base dos botões da notificação).
        actions: Botões da notificação ("complete", "snooze_1h", "tomorrow"); vazio = sem botões.
    """

    key: str
    fire_at: datetime
    title: str
    body: str
    link: str
    agent: str = "kaguya"
    task_id: int | None = None
    actions: tuple[str, ...] = ()


# Botões dos lembretes de tarefa (tratados por webapp/backend/push_actions.py).
TASK_ACTIONS = ("complete", "snooze_1h", "tomorrow")


# ─── Utilidades ──────────────────────────────────────────────────────────────

def _as_sp(value: datetime) -> datetime:
    """Datetime com fuso de São Paulo (sem fuso é tratado como horário local já)."""
    return value.replace(tzinfo=SP_TZ) if value.tzinfo is None else value.astimezone(SP_TZ)


def _at(day: date, clock: time) -> datetime:
    """Combina data + hora do relógio local de São Paulo."""
    return datetime.combine(day, clock.replace(tzinfo=None), tzinfo=SP_TZ)


def lead_label(lead_min: int) -> str:
    """Texto curto da antecedência: 0 → "agora"; 10 → "em 10 min"; 90 → "em 1 h 30"; 1440 → "em 1 dia".

    Example:
        >>> lead_label(0), lead_label(10), lead_label(60), lead_label(1440)
        ('agora', 'em 10 min', 'em 1 h', 'em 1 dia')
    """
    if lead_min <= 0:
        return "agora"
    if lead_min < 60:
        return f"em {lead_min} min"
    if lead_min < 1440:
        horas, resto = divmod(lead_min, 60)
        return f"em {horas} h" if not resto else f"em {horas} h {resto:02d}"
    dias = lead_min // 1440
    return f"em {dias} dia" if dias == 1 else f"em {dias} dias"


def _clock(value: datetime) -> str:
    return value.strftime("%H:%M")


def _short(text: str, limit: int = 90) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# ─── Seleção ─────────────────────────────────────────────────────────────────

def select_due(reminders: Iterable[Reminder], now: datetime, grace_min: int = GRACE_MIN) -> list[Reminder]:
    """Filtra os lembretes que já deram a hora e ainda não passaram da janela de graça.

    Args:
        reminders: Candidatos de todas as fontes.
        now: Agora (com fuso).
        grace_min: Quantos minutos depois da hora o aviso ainda vale.

    Returns:
        Os vencidos, do mais antigo ao mais novo, sem chaves repetidas.
    """
    ok: dict[str, Reminder] = {}
    limite = now - timedelta(minutes=grace_min)
    for r in reminders:
        if limite <= r.fire_at <= now and r.key not in ok:
            ok[r.key] = r
    return sorted(ok.values(), key=lambda r: r.fire_at)


# ─── Tarefas e eventos ───────────────────────────────────────────────────────

def task_start(task: dict[str, Any]) -> datetime | None:
    """Instante em que a tarefa/evento acontece: bloco (`start_at`) ou data + hora; ``None`` se só tem data."""
    if task.get("start_at"):
        return _as_sp(task["start_at"])
    if task.get("due_date") and task.get("due_time"):
        due_date = task["due_date"]
        if isinstance(due_date, str):
            due_date = date.fromisoformat(due_date)
        due_time = task["due_time"]
        if isinstance(due_time, str):
            due_time = time.fromisoformat(due_time)
        return _at(due_date, due_time)
    return None


def task_reminder(task: dict[str, Any]) -> Reminder | None:
    """Lembrete de uma tarefa/evento com horário.

    Args:
        task: ``id``, ``title``, ``due_date``, ``due_time``, ``start_at``, ``reminder_lead_min``,
            ``project_name`` (opcional) e ``type`` (opcional).

    Returns:
        O lembrete, ou ``None`` se a tarefa não tem horário ou o usuário escolheu "sem aviso".
    """
    start = task_start(task)
    if start is None:
        return None
    lead = task.get("reminder_lead_min")
    lead = DEFAULT_LEAD_MIN if lead is None else int(lead)
    if lead < 0:
        return None

    partes = [_clock(start), lead_label(lead)]
    if task.get("project_name"):
        partes.append(str(task["project_name"]))
    return Reminder(
        key=f"task:{task['id']}:{start.isoformat(timespec='minutes')}:{lead}",
        fire_at=start - timedelta(minutes=lead),
        title=_short(str(task.get("title") or "Tarefa"), 60),
        body=" · ".join(partes),
        link=f"makima://kaguya/tarefa/{task['id']}",
        agent="kaguya",
        task_id=int(task["id"]),
        actions=TASK_ACTIONS,
    )


# ─── Hábitos ─────────────────────────────────────────────────────────────────

def habit_reminder(habit: dict[str, Any], today: date) -> Reminder | None:
    """Lembrete de um hábito para o dia ``today``.

    Args:
        habit: ``id``, ``name``, ``time_of_day`` (hora do alerta), ``reminder_lead_min`` (antecedência,
            padrão 0) e ``checked_today`` (já fez hoje?). Quem monta já filtrou o dia da semana.
        today: Data local de hoje.

    Returns:
        O lembrete, ou ``None`` se não há hora marcada ou o hábito já foi feito hoje.
    """
    when = habit.get("time_of_day")
    if when is None or habit.get("checked_today"):
        return None
    if isinstance(when, str):
        when = time.fromisoformat(when)
    lead = int(habit.get("reminder_lead_min") or 0)
    start = _at(today, when)
    return Reminder(
        key=f"habit:{habit['id']}:{today.isoformat()}:{_clock(start)}:{lead}",
        fire_at=start - timedelta(minutes=max(lead, 0)),
        title=_short(str(habit.get("name") or "Hábito"), 60),
        body=f"Hábito · {_clock(start)} · {lead_label(lead)}",
        link=LINK_HABITS,
        agent="kaguya",
    )


# ─── Dia inteiro (Komi) ──────────────────────────────────────────────────────

def allday_fire(day: date, minutes_before: int) -> datetime:
    """Quando avisar um item de dia inteiro que tem lembrete ``minutes_before`` (contado desde 00:00 do dia).

    Um aviso que cairia de madrugada (antes das 08:00) sobe para as 09:00 do mesmo dia — o caso de "avisar
    no próprio dia", que na conta dá 00:00.

    Example:
        >>> allday_fire(date(2026, 11, 10), 900).strftime("%d %H:%M")      # 1 dia antes, às 9h
        '09 09:00'
        >>> allday_fire(date(2026, 11, 10), 0).strftime("%d %H:%M")        # no dia: sobe de 00:00 para 09:00
        '10 09:00'
    """
    raw = _at(day, time(0, 0)) - timedelta(minutes=max(minutes_before, 0))
    if raw.hour < ALLDAY_EARLIEST_HOUR:
        raw = raw.replace(hour=ALLDAY_HOUR, minute=0)
    return raw


def komi_reminders(items: Iterable[dict[str, Any]]) -> list[Reminder]:
    """Lembretes dos itens de dia inteiro da Komi (aniversários e datas) que trazem ``reminders``.

    Args:
        items: CalendarItems de ``agents.komi.calendar_provider.list_calendar_events`` (``date``, ``title``,
            ``kind``, ``ref_id``, ``reminders`` = minutos antes do início do dia).
    """
    saida: list[Reminder] = []
    for item in items:
        if not item.get("reminders") or not item.get("date"):
            continue
        dia = date.fromisoformat(item["date"][:10])
        for minutos in item["reminders"]:
            fire = allday_fire(dia, int(minutos))
            dias = (dia - fire.date()).days
            quando = "hoje" if dias <= 0 else "amanhã" if dias == 1 else f"em {dias} dias"
            ref = item.get("ref_id") or _short(str(item.get("title", "")), 30)
            saida.append(
                Reminder(
                    key=f"komi:{item.get('kind', 'item')}:{ref}:{dia.isoformat()}:{int(minutos)}",
                    fire_at=fire,
                    title=_short(str(item.get("title") or "Komi"), 80),
                    body=quando.capitalize(),
                    link=LINK_KOMI,
                    agent="komi",
                )
            )
    return saida


# ─── Reuniões do Google ──────────────────────────────────────────────────────

def google_leads(reminders: dict[str, Any] | None) -> list[int]:
    """Antecedências (minutos) dos alertas de um evento do Google.

    ``useDefault`` (ou campo ausente) → o padrão do motor; ``overrides`` → só os de popup/e-mail são
    avisos humanos, usamos popup. Sem popup e sem padrão → nenhum.
    """
    if not reminders or reminders.get("useDefault", False):
        return [DEFAULT_LEAD_MIN]
    return sorted({int(o["minutes"]) for o in reminders.get("overrides", []) if o.get("method", "popup") == "popup"})


def google_reminders(events: Iterable[dict[str, Any]]) -> list[Reminder]:
    """Lembretes das reuniões do Google (``agents.kaguya.gcal.list_events``).

    Só eventos COM hora (``start`` com "T"); dia inteiro não tem hora para avisar. Um evento com vários
    alertas gera um lembrete por alerta.
    """
    saida: list[Reminder] = []
    for ev in events:
        start_raw = ev.get("start") or ""
        if "T" not in start_raw:
            continue
        start = _as_sp(datetime.fromisoformat(start_raw))
        for lead in google_leads(ev.get("reminders")):
            partes = [_clock(start), lead_label(lead)]
            if ev.get("location"):
                partes.append(_short(str(ev["location"]), 40))
            saida.append(
                Reminder(
                    key=f"gcal:{ev.get('id', '')}:{start.isoformat(timespec='minutes')}:{lead}",
                    fire_at=start - timedelta(minutes=lead),
                    title=_short(str(ev.get("summary") or "Compromisso"), 60),
                    body=" · ".join(partes),
                    link=LINK_CALENDAR,
                    agent="kaguya",
                )
            )
    return saida


# ─── Resumo do dia ───────────────────────────────────────────────────────────

def daily_summary(
    today: date,
    n_today: int,
    n_overdue: int,
    first_timed: tuple[str, str] | None = None,
) -> Reminder | None:
    """Push curto das 07:30: o que o dia tem, sem repetir o digest completo (que vai para o Discord).

    Args:
        today: Data local.
        n_today: Tarefas abertas para hoje.
        n_overdue: Tarefas atrasadas.
        first_timed: ``("HH:MM", "título")`` do primeiro compromisso com hora, se houver.

    Returns:
        O lembrete, ou ``None`` se o dia está vazio (não vale acordar o celular para dizer "nada").
    """
    if not (n_today or n_overdue or first_timed):
        return None
    partes = []
    if n_today:
        partes.append(f"{n_today} tarefa{'s' if n_today != 1 else ''} hoje")
    if n_overdue:
        partes.append(f"{n_overdue} atrasada{'s' if n_overdue != 1 else ''}")
    if first_timed:
        partes.append(f"1º: {first_timed[0]} {_short(first_timed[1], 40)}")
    return Reminder(
        key=f"summary:{today.isoformat()}",
        fire_at=_at(today, SUMMARY_AT),
        title="Kaguya · Seu dia",
        body=" · ".join(partes),
        link=LINK_KAGUYA,
        agent="kaguya",
    )
