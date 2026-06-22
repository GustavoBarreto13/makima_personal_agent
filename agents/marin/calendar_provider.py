"""Provedor de calendário para o agente Marin (Animes).

Fornece quatro tipos de eventos de anime no formato CalendarItem esperado
pelo calendar_hub:
  1. Episódios futuros/recentes (aired) dos animes na lista.
  2. Sessões de episódios assistidos (watch_logs).
  3. Datas em que o usuário começou a assistir um anime (date_started).
  4. Datas em que o usuário terminou de assistir um anime (date_finished).

Usage:
    >>> from agents.marin.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    '📺 Dungeon Meshi — ep 24'
"""

from __future__ import annotations

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "marin",
    "account": "makima",
    "kind": "base",
    "name": "Marin · Animes",
    "color": "oklch(0.72 0.16 350)",  # rosa vibrante — tom gyaru da Marin
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário de animes no intervalo de datas.

    Coleta quatro tipos de eventos de anime:
    1. Episódios com data de exibição (aired) na janela.
    2. Sessões de episódios assistidos (watch_logs.watched_date).
    3. Animes cuja data de início cai na janela (anime.date_started).
    4. Animes cuja data de conclusão cai na janela (anime.date_finished).

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de dicionários CalendarItem com campos: cal, date, all_day,
        title, kind, ref_id, deep_link, color, start, end, loc.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")
        [{"cal": "marin", "date": "2026-06-07", "all_day": True, "kind": "anime-episode", ...}]
    """
    items: list[dict] = []

    # ── 1. Episódios futuros/recentes ─────────────────────────────────────────
    # Datas de exibição de episódios na janela — ajuda a acompanhar o simulcast
    items.extend(_upcoming_episode_events(start, end))

    # ── 2. Histórico assistido ────────────────────────────────────────────────
    # Sessões de episódios que o usuário registrou no diário de animes
    items.extend(_watch_history_events(start, end))

    # ── 3. Início de anime ────────────────────────────────────────────────────
    # Datas em que o usuário começou a assistir um anime pela primeira vez
    items.extend(_started_events(start, end))

    # ── 4. Conclusão de anime ─────────────────────────────────────────────────
    # Datas em que o usuário terminou de assistir um anime
    items.extend(_finished_events(start, end))

    return items


def _upcoming_episode_events(start: str, end: str) -> list[dict]:
    """Episódios com data de exibição (aired) dentro do intervalo.

    Faz JOIN com a tabela anime para filtrar soft-deletes e trazer o título.
    Inclui qualquer episódio na janela, independente do status do anime —
    útil para acompanhar tanto animes 'assistindo' quanto 'quero_assistir'.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='anime-episode'.
    """
    sql = """
    SELECT
        e.id,
        e.number,
        e.title    AS ep_title,   -- título do episódio (frequentemente NULL no Jikan)
        e.aired,
        a.title    AS anime_title,
        a.id       AS anime_id
    FROM episodes e
    JOIN anime a ON a.id = e.anime_id AND a.deleted = FALSE
    WHERE e.aired BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY e.aired, a.title, e.number
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título compacto para o grid — "📺 Título — ep N"
        title = f"📺 {row['anime_title']} — ep {row['number']}"

        # Coloca o título do episódio em loc se existir (detalhe opcional)
        loc = row.get("ep_title") or None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = (
            row["aired"].isoformat()
            if hasattr(row["aired"], "isoformat")
            else str(row["aired"])
        )

        items.append({
            "cal": "marin",
            "date": date_str,
            "start": None,   # all-day — não há horário exato de exibição
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "anime-episode",
            "ref_id": row["id"],
            "deep_link": "/animes",   # rota do shell Marin no frontend
            "color": None,            # usa a cor rosa padrão da fonte
            "loc": loc,
        })

    return items


def _watch_history_events(start: str, end: str) -> list[dict]:
    """Sessões de episódios assistidos (watch_logs) na janela de datas.

    O campo anime_title já é desnormalizado em watch_logs — não precisa de JOIN.
    Traz ep_start e ep_end quando presentes para mostrar o intervalo de eps.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='anime-watch'.
    """
    sql = """
    SELECT
        wl.id,
        wl.anime_id,
        wl.anime_title,
        wl.watched_date,
        wl.ep_start,
        wl.ep_end,
        wl.episodes_count
    FROM watch_logs wl
    JOIN anime a ON a.id = wl.anime_id AND a.deleted = FALSE
    WHERE wl.watched_date BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY wl.watched_date, wl.created_at
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título compacto para o grid — "▶️ Título do Anime"
        title = f"▶️ {row['anime_title']}"

        # Detalhe: "ep 1–3" quando há intervalo; "1 ep" quando há só contagem
        ep_start = row.get("ep_start")
        ep_end = row.get("ep_end")
        count = row.get("episodes_count")
        if ep_start and ep_end:
            loc = f"ep {ep_start}–{ep_end}"
        elif ep_start:
            loc = f"ep {ep_start}"
        elif count:
            loc = f"{count} ep"
        else:
            loc = None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = (
            row["watched_date"].isoformat()
            if hasattr(row["watched_date"], "isoformat")
            else str(row["watched_date"])
        )

        items.append({
            "cal": "marin",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "anime-watch",
            "ref_id": row["id"],
            "deep_link": "/animes",
            "color": None,
            "loc": loc,
        })

    return items


def _started_events(start: str, end: str) -> list[dict]:
    """Animes cuja data de início (date_started) cai na janela.

    date_started é inferido automaticamente pelo log_watch — é a data da
    primeira sessão registrada para o anime.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='anime-started'.
    """
    sql = """
    SELECT id, title, date_started
    FROM anime
    WHERE deleted = FALSE
      AND date_started BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY date_started, title
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título comemorativo de início
        title = f"🎬 Comecei {row['title']}"

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = (
            row["date_started"].isoformat()
            if hasattr(row["date_started"], "isoformat")
            else str(row["date_started"])
        )

        items.append({
            "cal": "marin",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "anime-started",
            "ref_id": row["id"],
            "deep_link": "/animes",
            "color": None,
            "loc": None,
        })

    return items


def _finished_events(start: str, end: str) -> list[dict]:
    """Animes cuja data de conclusão (date_finished) cai na janela.

    date_finished é inferido automaticamente quando episodes_watched >= episodes_total.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='anime-finished'.
    """
    sql = """
    SELECT id, title, date_finished, score
    FROM anime
    WHERE deleted = FALSE
      AND date_finished BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY date_finished, title
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título comemorativo de conclusão
        title = f"🏁 Terminei {row['title']}"

        # Mostra a nota do usuário em loc se existir (ex.: "★ 8.5")
        score = row.get("score")
        loc = f"★ {score:.1f}" if score else None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = (
            row["date_finished"].isoformat()
            if hasattr(row["date_finished"], "isoformat")
            else str(row["date_finished"])
        )

        items.append({
            "cal": "marin",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "anime-finished",
            "ref_id": row["id"],
            "deep_link": "/animes",
            "color": None,
            "loc": loc,
        })

    return items
