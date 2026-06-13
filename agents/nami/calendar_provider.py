"""Provedor de calendário para o agente Nami (Finanças).

Fornece eventos financeiros — assinaturas, vencimentos de cartão e transações —
no formato CalendarItem esperado pelo calendar_hub.

Usage:
    >>> from agents.nami.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    'Assinatura: Netflix (R$ 39,90)'
"""

from __future__ import annotations

import calendar as _cal  # módulo padrão do Python para cálculos de data
from datetime import date

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "nami",
    "account": "makima",
    "kind": "base",
    "name": "Nami · Finanças",
    "color": "oklch(0.70 0.17 52)",  # laranja dourado — associado a dinheiro
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário financeiros no intervalo de datas.

    Coleta três tipos de eventos:
    1. Assinaturas recorrentes com `next_billing` no período.
    2. Vencimentos de cartão de crédito (calculados por `due_day`) no período.
    3. Transações financeiras com data no período.

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de dicionários CalendarItem com campos: cal, date, all_day,
        title, kind, ref_id, deep_link, color, start, end, loc.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")
        [{"cal": "nami", "date": "2026-06-10", "all_day": True, ...}]
    """
    items: list[dict] = []

    # ── 1. Assinaturas ────────────────────────────────────────────────────────
    # Assinaturas ativas cuja próxima cobrança cai dentro do intervalo
    items.extend(_subscription_events(start, end))

    # ── 2. Vencimentos de cartão ──────────────────────────────────────────────
    # Calcula as datas de vencimento a partir do campo `due_day` (dia do mês)
    items.extend(_card_due_events(start, end))

    # ── 3. Transações ─────────────────────────────────────────────────────────
    # Despesas e receitas registradas no período, mostradas com hora de registro
    items.extend(_transaction_events(start, end))

    return items


def _subscription_events(start: str, end: str) -> list[dict]:
    """Assinaturas ativas com cobrança no intervalo como eventos all-day.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='subscription'.
    """
    # Filtra assinaturas ativas não deletadas cuja próxima cobrança está no período
    sql = """
    SELECT id, name, valor, ciclo, next_billing
    FROM subscriptions
    WHERE deleted = FALSE
      AND status = 'ativa'
      AND next_billing BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY next_billing
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Formata o valor em reais com vírgula como separador decimal (padrão pt-BR)
        valor_fmt = f"R$ {row['valor']:.2f}".replace(".", ",")
        items.append({
            "cal": "nami",
            # psycopg2 retorna DATE como objeto date — convertemos para string ISO
            "date": row["next_billing"].isoformat() if hasattr(row["next_billing"], "isoformat") else str(row["next_billing"]),
            "start": None,
            "end": None,
            "all_day": True,
            "title": f"Assinatura: {row['name']} ({valor_fmt})",
            "kind": "subscription",
            "ref_id": row["id"],
            "deep_link": "/nami",
            "color": None,  # usa a cor padrão da fonte (laranja nami)
            "loc": None,
        })

    return items


def _card_due_events(start: str, end: str) -> list[dict]:
    """Vencimentos de cartões de crédito no intervalo como eventos all-day.

    O campo `due_day` é um inteiro (1–31) representando o dia do mês.
    Para cada mês que se sobrepõe ao intervalo, gera um evento de vencimento.
    O dia é ajustado para o último dia do mês quando `due_day` excede os dias disponíveis
    (ex.: due_day=31 em fevereiro → dia 28 ou 29).

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='card-due'.
    """
    # Busca cartões ativos com dia de vencimento configurado
    sql = """
    SELECT id, name, due_day
    FROM credit_cards
    WHERE status = 'ativo'
      AND due_day IS NOT NULL
    ORDER BY name
    """
    cards = run_select(sql)
    if not cards:
        return []

    # Converte strings de data para objetos date do Python para comparação
    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)

    items = []
    for card in cards:
        due_day = int(card["due_day"])

        # Itera por cada mês que pode ter um vencimento no intervalo
        # Começa pelo mês da data inicial e avança mês a mês até ultrapassar o fim
        cur_year = start_date.year
        cur_month = start_date.month

        while True:
            # Limita o dia ao último dia do mês (para meses curtos como fevereiro)
            last_day = _cal.monthrange(cur_year, cur_month)[1]
            clamped_day = min(due_day, last_day)
            due_date = date(cur_year, cur_month, clamped_day)

            # Só emite o evento se a data de vencimento cair dentro do intervalo
            if start_date <= due_date <= end_date:
                items.append({
                    "cal": "nami",
                    "date": due_date.isoformat(),
                    "start": None,
                    "end": None,
                    "all_day": True,
                    "title": f"Vencimento: {card['name']}",
                    "kind": "card-due",
                    "ref_id": card["id"],
                    "deep_link": "/nami",
                    "color": None,
                    "loc": None,
                })

            # Avança um mês
            if cur_month == 12:
                cur_year += 1
                cur_month = 1
            else:
                cur_month += 1

            # Para quando o início do próximo mês já ultrapassou o fim do intervalo
            if date(cur_year, cur_month, 1) > end_date:
                break

    return items


def _transaction_events(start: str, end: str) -> list[dict]:
    """Transações financeiras no intervalo como eventos timed.

    Usa `created_at` (convertido para o horário de Brasília) como hora do evento,
    pois `data` é apenas um DATE sem componente de hora. Se `created_at` não
    estiver disponível, o evento aparece como all-day.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='expense' ou 'income'.
    """
    # Converte created_at para o fuso de Brasília para mostrar a hora local correta.
    # AT TIME ZONE retorna timestamp sem fuso (TIMESTAMP) — psycopg2 entrega como datetime naive.
    sql = """
    SELECT id, name, valor, tipo, data,
           (created_at AT TIME ZONE 'America/Sao_Paulo') AS created_local
    FROM transactions
    WHERE deleted = FALSE
      AND data BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY data, created_at
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Determina o tipo semântico — receita é positivo, o restante é despesa
        kind = "income" if row["tipo"] == "receita" else "expense"

        # Formata o valor em reais no padrão brasileiro
        valor_fmt = f"R$ {row['valor']:.2f}".replace(".", ",")
        title = f"{valor_fmt} — {row['name']}"

        # Usa o horário local de criação como start do evento (mostra a hora no grid)
        created_local = row.get("created_local")
        if created_local and hasattr(created_local, "strftime"):
            # Formato ISO 8601 sem microssegundos para limpeza visual no frontend
            start_iso = created_local.strftime("%Y-%m-%dT%H:%M:00")
            all_day = False
        else:
            # Fallback: evento sem horário definido
            start_iso = None
            all_day = True

        # `data` é um objeto date retornado pelo psycopg2
        data_str = row["data"].isoformat() if hasattr(row["data"], "isoformat") else str(row["data"])

        items.append({
            "cal": "nami",
            "date": data_str,
            "start": start_iso,
            "end": None,  # transações não têm duração — o grid mostra como ponto
            "all_day": all_day,
            "title": title,
            "kind": kind,
            "ref_id": row["id"],
            "deep_link": "/nami",
            "color": None,
            "loc": None,
        })

    return items
