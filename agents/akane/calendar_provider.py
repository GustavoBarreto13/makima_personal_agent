"""Provedor de calendário para o agente Akane (Filmes).

Até a spec 069 a fonte "akane" do `calendar_hub` era um stub (`lambda: []`) —
filmes nunca apareceram na tela de Calendário. Este módulo dá a ela um provider
real, no mesmo molde de `agents/mai/calendar_provider.py` (que por sua vez é o
porte do da Marin).

Dois tipos de evento, ambos all-day:
  1. Sessões do diário (`diary_entries.watched_date`) — "assisti X neste dia".
  2. Filmes marcados como vistos sem nenhuma sessão datada
     (`movies.last_watched_date`, tipicamente importados do `watched.csv` do
     Letterboxd) — fallback para não perder esses dias.

Usage:
    >>> from agents.akane.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    '▶️ Perfect Blue'
"""

from __future__ import annotations

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "akane",
    "account": "makima",
    "kind": "base",
    "name": "Akane · Filmes",
    "color": "oklch(0.68 0.18 15)",  # vermelho-rosado — cinema
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário de filmes no intervalo de datas.

    Args:
        start: Data inicial YYYY-MM-DD (inclusivo).
        end: Data final YYYY-MM-DD (inclusivo).

    Returns:
        Lista de CalendarItem (cal, date, all_day, title, kind, ref_id,
        deep_link, color, start, end, loc).
    """
    items: list[dict] = []
    items.extend(_watch_history_events(start, end))
    items.extend(_watched_without_session_events(start, end))
    return items


def _iso(value) -> str:
    """DATE do psycopg2 → string ISO (defensivo se vier como str)."""
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _watch_history_events(start: str, end: str) -> list[dict]:
    """Sessões do diário (`diary_entries`) na janela — kind='movie-watch'."""
    sql = """
    SELECT d.id,
           d.movie_id,
           COALESCE(d.movie_title, m.title) AS title,
           d.watched_date,
           d.rating,
           d.rewatch
    FROM diary_entries d
    JOIN movies m ON m.id = d.movie_id AND m.deleted = FALSE
    WHERE d.watched_date BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY d.watched_date, d.created_at
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Detalhe: nota da sessão e/ou marca de rewatch
        bits = []
        if row.get("rating"):
            bits.append(f"★ {row['rating']:.1f}")
        if row.get("rewatch"):
            bits.append("rewatch")
        loc = " · ".join(bits) or None

        items.append({
            "cal": "akane",
            "date": _iso(row["watched_date"]),
            "start": None,
            "end": None,
            "all_day": True,
            "title": f"▶️ {row['title']}",
            "kind": "movie-watch",
            "ref_id": row["id"],
            "deep_link": "/movies",
            "color": None,
            "loc": loc,
        })

    return items


def _watched_without_session_events(start: str, end: str) -> list[dict]:
    """Filmes vistos sem sessão datada (`movies.last_watched_date`) — kind='movie-watched'.

    Cobre importações do `watched.csv` do Letterboxd (spec 050), que entram só com
    `status='watched'` e sem linha em `diary_entries`. Filtra fora os filmes que
    já têm qualquer sessão no diário — esses já aparecem via `_watch_history_events`.
    """
    sql = """
    SELECT m.id, m.title, m.last_watched_date, m.rating
    FROM movies m
    WHERE m.deleted = FALSE
      AND m.status = 'watched'
      AND m.last_watched_date BETWEEN %(start)s::date AND %(end)s::date
      AND NOT EXISTS (SELECT 1 FROM diary_entries d WHERE d.movie_id = m.id)
    ORDER BY m.last_watched_date, m.title
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        loc = f"★ {row['rating']:.1f}" if row.get("rating") else None
        items.append({
            "cal": "akane",
            "date": _iso(row["last_watched_date"]),
            "start": None,
            "end": None,
            "all_day": True,
            "title": f"✓ {row['title']}",
            "kind": "movie-watched",
            "ref_id": row["id"],
            "deep_link": "/movies",
            "color": None,
            "loc": loc,
        })

    return items
