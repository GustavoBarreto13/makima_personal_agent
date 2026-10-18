"""Provedor de calendário para o agente Komi (Pessoas).

Fornece ao Calendar Hub (e, por ele, ao calendário da Kaguya e ao espelho "Komi — Pessoas"
do Google Calendar) dois tipos de evento, ambos de dia inteiro:

  - **Aniversário** — campo de toda pessoa (``people.birth_day``/``birth_month``/``birth_year``).
    Repete todo ano; com o ano de nascimento o título traz a idade. O 29/02 em ano comum cai
    em 28/02 (é o dia em que se comemora). Desde a spec 077 o aniversário NÃO é mais uma
    tarefa da Kaguya: este provedor é a única fonte dele no calendário.
  - **Outras datas importantes** (``person_dates``) — casamento, formatura... Se
    ``recurring`` for verdadeiro, repete todo ano; senão só aparece no próprio dia.

Cada item leva ``reminders`` (minutos antes do início do dia) calculados a partir do
lembrete da pessoa/da data; o espelho do Google transforma isso num alerta de verdade.

Usage:
    >>> from agents.komi.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")        # doctest: +SKIP
    >>> itens[0]["title"]                                                # doctest: +SKIP
    '🎂 aniversário — João'
"""

from __future__ import annotations

import calendar
import datetime

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "komi",
    "account": "makima",
    "kind": "base",
    "name": "Komi · Pessoas",
    "color": "oklch(0.70 0.13 150)",  # verde suave — cuidado e proximidade
}

# O lembrete aparece às 9h do dia de aviso (em minutos desde 00:00).
_HORA_DO_AVISO = 9 * 60
# O Google só aceita lembretes de até 4 semanas antes (40320 minutos).
_MAX_DIAS_ANTES = 27


def reminder_minutes(dias_antes: int | None) -> int | None:
    """Converter "N dias antes" em minutos antes do início de um evento de dia inteiro.

    Evento de dia inteiro começa à 00:00; um aviso "1 dia antes às 9h" dispara 15h antes
    (900 min). O Google não aceita minutos negativos, então "no próprio dia" (0 dia) dispara
    à 00:00 do dia — é o mais tarde possível para esse tipo de evento.

    Args:
        dias_antes: Quantos dias antes avisar (0 = no dia) ou ``None`` (sem lembrete).

    Returns:
        Minutos antes do início do evento, ou ``None`` se não há lembrete.

    Example:
        >>> reminder_minutes(1)
        900
        >>> reminder_minutes(0)
        0
        >>> reminder_minutes(None) is None
        True
    """
    if dias_antes is None:
        return None
    dias = max(0, min(int(dias_antes), _MAX_DIAS_ANTES))
    return 0 if dias == 0 else dias * 24 * 60 - _HORA_DO_AVISO


def _ocorrencia(dia: int, mes: int, ano: int) -> datetime.date:
    """Calcular a data de um aniversário/data anual num ano, tratando 29/02.

    Args:
        dia: Dia do mês.
        mes: Mês.
        ano: Ano em que se quer a ocorrência.

    Returns:
        A data; 29/02 em ano não bissexto vira 28/02.

    Example:
        >>> _ocorrencia(29, 2, 2027)
        datetime.date(2027, 2, 28)
    """
    if (dia, mes) == (29, 2) and not calendar.isleap(ano):
        dia = 28
    return datetime.date(ano, mes, dia)


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retornar os aniversários e as datas importantes de pessoas no intervalo.

    Datas recorrentes são projetadas para cada ano dentro da janela — essencial para
    janelas que cruzam dez→jan. Datas únicas só entram se o dia cair na janela.

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de CalendarItem com: cal, date, all_day, title, kind, ref_id, deep_link,
        color, start, end, loc e ``reminders`` (minutos antes, opcional), ordenada por data.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")        # doctest: +SKIP
        [{"cal": "komi", "date": "2026-06-14", "all_day": True, "kind": "birthday", ...}]
    """
    inicio = datetime.date.fromisoformat(start)
    fim = datetime.date.fromisoformat(end)
    itens: list[dict] = []

    # ── 1. Aniversários: campo da pessoa, projetado em cada ano da janela ─────────
    pessoas = run_select(
        """
        SELECT id, name, birth_day, birth_month, birth_year, birthday_remind_days
        FROM people WHERE deleted = FALSE AND birth_day IS NOT NULL
        """,
        {},
    )
    for p in pessoas:
        for ano in range(inicio.year, fim.year + 1):
            quando = _ocorrencia(p["birth_day"], p["birth_month"], ano)
            if inicio <= quando <= fim:
                itens.append(_item_aniversario(p, quando))

    # ── 2. Outras datas importantes (casamento, formatura...) ─────────────────────
    # Sem filtrar por data no SQL: uma data recorrente precisa do mês/dia originais para ser
    # projetada no ano da janela, mesmo tendo sido cadastrada em outro ano.
    datas = run_select(
        """
        SELECT pd.id, pd.label, pd.date, pd.recurring, pd.remind_days_before, p.name, p.id AS person_id
        FROM person_dates pd
        JOIN people p ON p.id = pd.person_id AND p.deleted = FALSE
        ORDER BY pd.date
        """,
        {},
    )
    for d in datas:
        guardada = d["date"] if isinstance(d["date"], datetime.date) else datetime.date.fromisoformat(str(d["date"]))
        if d["recurring"]:
            for ano in range(inicio.year, fim.year + 1):
                quando = _ocorrencia(guardada.day, guardada.month, ano)
                if inicio <= quando <= fim:
                    itens.append(_item_data(d, quando.isoformat()))
        elif inicio <= guardada <= fim:
            itens.append(_item_data(d, guardada.isoformat()))

    itens.sort(key=lambda x: x["date"])
    return itens


def _item_aniversario(pessoa: dict, quando: datetime.date) -> dict:
    """Montar o CalendarItem de um aniversário.

    Args:
        pessoa: Linha de ``people`` (id, name, birth_year, birthday_remind_days).
        quando: A data da comemoração.

    Returns:
        O item, com a idade no título quando há ano de nascimento e o lembrete em minutos.
    """
    idade = f" ({quando.year - pessoa['birth_year']} anos)" if pessoa.get("birth_year") else ""
    item = {
        "cal": "komi", "date": quando.isoformat(), "start": None, "end": None, "all_day": True,
        "title": f"🎂 aniversário — {pessoa['name']}{idade}",
        "kind": "birthday",
        "ref_id": pessoa["id"],            # ID da pessoa (o aniversário é campo dela)
        "deep_link": f"/people#pessoa/{pessoa['id']}",
        "color": None,                     # usa a cor verde padrão da fonte
        "loc": pessoa["name"],
    }
    minutos = reminder_minutes(pessoa.get("birthday_remind_days"))
    if minutos is not None:
        item["reminders"] = [minutos]
    return item


def _item_data(linha: dict, date_str: str) -> dict:
    """Montar o CalendarItem de uma data importante (``person_dates``).

    Args:
        linha: Linha com id, label, name, person_id e remind_days_before.
        date_str: Data da ocorrência (YYYY-MM-DD, já calculada).

    Returns:
        O item de dia inteiro, com o lembrete em minutos quando houver.
    """
    item = {
        "cal": "komi", "date": date_str, "start": None, "end": None, "all_day": True,
        "title": f"📅 {linha['label']} — {linha['name']}",
        "kind": "person-date",
        "ref_id": linha["id"],             # ID da person_date (não da pessoa)
        "deep_link": f"/people#pessoa/{linha['person_id']}",
        "color": None,
        "loc": linha["name"],
    }
    minutos = reminder_minutes(linha.get("remind_days_before"))
    if minutos is not None:
        item["reminders"] = [minutos]
    return item
