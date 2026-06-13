"""Provedor de calendário para o agente Frieren (Livros).

Fornece eventos de leitura — sessões de leitura e livros concluídos —
no formato CalendarItem esperado pelo calendar_hub.

Usage:
    >>> from agents.frieren.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    '📖 Duna — 42 pág.'
"""

from __future__ import annotations

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "frieren",
    "account": "makima",
    "kind": "base",
    "name": "Frieren · Livros",
    "color": "oklch(0.72 0.10 184)",  # verde-azulado suave — associado a leitura
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário de leitura no intervalo de datas.

    Coleta dois tipos de eventos:
    1. Sessões de leitura registradas em `reading_logs`.
    2. Livros concluídos (`books.date_finished`) no período.

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de dicionários CalendarItem com campos: cal, date, all_day,
        title, kind, ref_id, deep_link, color, start, end, loc.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")
        [{"cal": "frieren", "date": "2026-06-05", "all_day": True, "kind": "reading-session", ...}]
    """
    items: list[dict] = []

    # ── 1. Sessões de leitura ─────────────────────────────────────────────────
    # Cada log de leitura vira um evento all-day mostrando progresso de páginas
    items.extend(_reading_session_events(start, end))

    # ── 2. Livros concluídos ──────────────────────────────────────────────────
    # Livros marcados como lidos no período mostram a data de conclusão
    items.extend(_finished_book_events(start, end))

    return items


def _reading_session_events(start: str, end: str) -> list[dict]:
    """Sessões de leitura no intervalo como eventos all-day.

    Cada linha em `reading_logs` representa uma sessão: quantas páginas foram
    lidas naquele dia. Pode haver múltiplas sessões no mesmo dia (livros diferentes
    ou múltiplas sessões do mesmo livro).

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='reading-session'.
    """
    # Seleciona todos os logs de leitura no período, trazendo o book_id para o deep_link
    sql = """
    SELECT rl.id, rl.book_id, rl.book_title, rl.date,
           rl.pages_read, rl.page_start, rl.page_end
    FROM reading_logs rl
    JOIN books b ON b.id = rl.book_id AND b.deleted = FALSE
    WHERE rl.date BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY rl.date, rl.created_at
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Formata o título de forma compacta para o grid de calendário
        pages = row.get("pages_read") or 0
        title = f"📖 {row['book_title']} — {pages} pág."

        # Informação de página para detalhes (ex.: "p. 80 → p. 122")
        page_start = row.get("page_start")
        page_end = row.get("page_end")
        detail = f"p. {page_start} → p. {page_end}" if page_start and page_end else None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = row["date"].isoformat() if hasattr(row["date"], "isoformat") else str(row["date"])

        items.append({
            "cal": "frieren",
            "date": date_str,
            "start": None,  # sessão ocupa o dia inteiro (sem horário específico)
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "reading-session",
            "ref_id": row["id"],
            # Deep link para a seção de livros — o book_id pode ser usado para navegar
            "deep_link": f"/books",
            "color": None,  # usa a cor padrão da fonte (verde-azulado frieren)
            "loc": detail,  # reutiliza o campo loc para mostrar detalhes de página
        })

    return items


def _finished_book_events(start: str, end: str) -> list[dict]:
    """Livros concluídos no intervalo como eventos all-day de celebração.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='book-finished'.
    """
    # Busca livros com status 'lido' e date_finished dentro do período
    sql = """
    SELECT id, title, author, rating, date_finished
    FROM books
    WHERE deleted = FALSE
      AND status = 'lido'
      AND date_finished BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY date_finished
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Formata o título com emoji de conclusão
        title = f"✓ {row['title']} concluído"

        # Adiciona a avaliação ao loc se existir (ex.: "★ 4.5")
        rating = row.get("rating")
        loc = f"★ {rating:.1f}" if rating else None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = row["date_finished"].isoformat() if hasattr(row["date_finished"], "isoformat") else str(row["date_finished"])

        items.append({
            "cal": "frieren",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "book-finished",
            "ref_id": row["id"],
            "deep_link": "/books",
            "color": None,
            "loc": loc,
        })

    return items
