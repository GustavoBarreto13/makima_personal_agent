"""Provedor de calendário para o agente Violet (Diário pessoal / Journal).

Fornece entradas de diário — páginas com pelo menos um bullet — no formato
CalendarItem esperado pelo calendar_hub.

Usage:
    >>> from agents.journal.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    'Diário — 5 anotações'
"""

from __future__ import annotations

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "violet",
    "account": "makima",
    "kind": "base",
    "name": "Violet · Diário",
    "color": "oklch(0.58 0.16 300)",  # roxo-magenta — associado a reflexão e escrita
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário do diário pessoal no intervalo de datas.

    Cada página de diário com ao menos um bullet vira um evento all-day.
    Dias sem nenhuma anotação são omitidos para não poluir o calendário.

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de dicionários CalendarItem com campos: cal, date, all_day,
        title, kind, ref_id, deep_link, color, start, end, loc.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")
        [{"cal": "violet", "date": "2026-06-01", "all_day": True, "kind": "journal-entry", ...}]
    """
    # Busca páginas de diário com ao menos um bullet no período.
    # Agrupa por página para contar quantas anotações foram feitas naquele dia.
    # LEFT JOIN garante que páginas sem bullets apareçam (com count=0) — filtramos com HAVING.
    sql = """
    SELECT
        jp.id        AS page_id,
        jp.date      AS page_date,
        jp.type_id,
        COUNT(jb.id) AS bullet_count
    FROM journal_pages jp
    LEFT JOIN journal_bullets jb ON jb.page_id = jp.id
    WHERE jp.date BETWEEN %(start)s::date AND %(end)s::date
    GROUP BY jp.id, jp.date, jp.type_id
    HAVING COUNT(jb.id) > 0
    ORDER BY jp.date
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        count = row["bullet_count"]

        # Escolhe o texto de "anotação(ões)" corretamente para pt-BR
        # (1 anotação vs 2+ anotações — sem biblioteca de pluralização)
        noun = "anotação" if count == 1 else "anotações"
        title = f"Diário — {count} {noun}"

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = row["page_date"].isoformat() if hasattr(row["page_date"], "isoformat") else str(row["page_date"])

        items.append({
            "cal": "violet",
            "date": date_str,
            "start": None,  # entradas de diário ocupam o dia inteiro
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "journal-entry",
            # ref_id é o page_id para que o frontend possa navegar para a página
            "ref_id": str(row["page_id"]),
            # Deep link para a tela de escrita do diário com a data pré-selecionada
            "deep_link": f"/journal?date={date_str}",
            "color": None,  # usa a cor padrão da fonte (roxo violet)
            "loc": None,
        })

    return items
