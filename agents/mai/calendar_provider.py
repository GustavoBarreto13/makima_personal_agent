"""Provedor de calendário para o agente Mai (Séries de TV).

Fornece quatro tipos de eventos de séries no formato CalendarItem esperado
pelo calendar_hub:
  1. Episódios futuros/recentes (air_date) de séries que o usuário acompanha.
  2. Sessões de episódios assistidos (series_watch_logs.watched_date).
  3. Datas em que o usuário começou a assistir uma série (date_started).
  4. Datas em que o usuário terminou de assistir uma série (date_finished).

Usage:
    >>> from agents.mai.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    '📺 Silo — T2E5'
"""

from __future__ import annotations

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "mai",
    "account": "makima",
    "kind": "base",
    "name": "Mai · Séries",
    "color": "oklch(0.55 0.16 285)",  # roxo-azulado elegante — tom da Mai Sakurajima
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário de séries de TV no intervalo de datas.

    Coleta quatro tipos de eventos de série:
    1. Episódios com air_date na janela (cache em series_episodes).
    2. Sessões assistidas registradas em series_watch_logs.
    3. Séries cuja data de início (date_started) cai na janela.
    4. Séries cuja data de conclusão (date_finished) cai na janela.

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de dicionários CalendarItem com campos: cal, date, all_day,
        title, kind, ref_id, deep_link, color, start, end, loc.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")
        [{"cal": "mai", "date": "2026-06-10", "all_day": True, "kind": "series-episode", ...}]
    """
    items: list[dict] = []

    # ── 1. Episódios futuros/recentes ─────────────────────────────────────────
    # Datas de exibição de episódios — essencial para acompanhar séries em andamento
    items.extend(_upcoming_episode_events(start, end))

    # ── 2. Histórico assistido ────────────────────────────────────────────────
    # Sessões que o usuário registrou no diário de séries
    items.extend(_watch_history_events(start, end))

    # ── 3. Início de série ────────────────────────────────────────────────────
    # Datas em que o usuário começou a assistir uma série
    items.extend(_started_events(start, end))

    # ── 4. Conclusão de série ─────────────────────────────────────────────────
    # Datas em que o usuário concluiu uma série
    items.extend(_finished_events(start, end))

    return items


def _upcoming_episode_events(start: str, end: str) -> list[dict]:
    """Episódios com air_date dentro do intervalo (cache series_episodes).

    Faz JOIN com series para filtrar soft-deletes e obter o título da série.
    season_number e episode_number são desnormalizados em series_episodes —
    não é necessário JOIN extra com seasons.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='series-episode'.
    """
    sql = """
    SELECT
        se.id,
        se.series_id,
        se.season_number,
        se.episode_number,
        se.title      AS ep_title,   -- título do episódio (pode ser NULL)
        se.air_date,
        s.title       AS series_title
    FROM series_episodes se
    JOIN series s ON s.id = se.series_id AND s.deleted = FALSE
    WHERE se.air_date BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY se.air_date, s.title, se.season_number, se.episode_number
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título compacto para o grid — "📺 Título — T1E3"
        season = row["season_number"]
        episode = row["episode_number"]
        title = f"📺 {row['series_title']} — T{season}E{episode}"

        # Título do episódio vai para o campo loc (detalhe opcional)
        loc = row.get("ep_title") or None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = (
            row["air_date"].isoformat()
            if hasattr(row["air_date"], "isoformat")
            else str(row["air_date"])
        )

        items.append({
            "cal": "mai",
            "date": date_str,
            "start": None,   # all-day — não há horário exato de transmissão
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "series-episode",
            "ref_id": row["id"],
            "deep_link": "/series",   # rota do shell Mai no frontend
            "color": None,            # usa a cor roxo-azulado padrão da fonte
            "loc": loc,
        })

    return items


def _watch_history_events(start: str, end: str) -> list[dict]:
    """Sessões de episódios assistidos (series_watch_logs) na janela de datas.

    O campo series_title já é desnormalizado em series_watch_logs — não
    precisa de JOIN. Traz season_number, ep_start e ep_end quando presentes.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='series-watch'.
    """
    sql = """
    SELECT
        wl.id,
        wl.series_id,
        wl.series_title,
        wl.watched_date,
        wl.season_number,
        wl.ep_start,
        wl.ep_end,
        wl.episodes_count
    FROM series_watch_logs wl
    JOIN series s ON s.id = wl.series_id AND s.deleted = FALSE
    WHERE wl.watched_date BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY wl.watched_date, wl.created_at
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título compacto para o grid — "▶️ Título da Série"
        title = f"▶️ {row['series_title']}"

        # Detalhe: "T2 · ep 5–8" ou "T2" ou "ep 5–8" conforme disponível
        season = row.get("season_number")
        ep_start = row.get("ep_start")
        ep_end = row.get("ep_end")
        count = row.get("episodes_count")
        if season and ep_start and ep_end:
            loc = f"T{season} · ep {ep_start}–{ep_end}"
        elif season and ep_start:
            loc = f"T{season} · ep {ep_start}"
        elif season:
            loc = f"T{season}"
        elif ep_start and ep_end:
            loc = f"ep {ep_start}–{ep_end}"
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
            "cal": "mai",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "series-watch",
            "ref_id": row["id"],
            "deep_link": "/series",
            "color": None,
            "loc": loc,
        })

    return items


def _started_events(start: str, end: str) -> list[dict]:
    """Séries cuja data de início (date_started) cai na janela.

    date_started é inferido automaticamente no primeiro log_watch registrado
    para a série.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='series-started'.
    """
    sql = """
    SELECT id, title, date_started
    FROM series
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
            "cal": "mai",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "series-started",
            "ref_id": row["id"],
            "deep_link": "/series",
            "color": None,
            "loc": None,
        })

    return items


def _finished_events(start: str, end: str) -> list[dict]:
    """Séries cuja data de conclusão (date_finished) cai na janela.

    date_finished é inferido automaticamente quando episodes_watched >= episodes_count.

    Args:
        start: Data inicial YYYY-MM-DD.
        end: Data final YYYY-MM-DD.

    Returns:
        Lista de CalendarItem com kind='series-finished'.
    """
    sql = """
    SELECT id, title, date_finished, rating
    FROM series
    WHERE deleted = FALSE
      AND date_finished BETWEEN %(start)s::date AND %(end)s::date
    ORDER BY date_finished, title
    """
    rows = run_select(sql, {"start": start, "end": end})

    items = []
    for row in rows:
        # Título comemorativo de conclusão
        title = f"🏁 Terminei {row['title']}"

        # Mostra a nota do usuário em loc se existir (ex.: "★ 4.5")
        # Mai usa escala 0.5–5.0 (Letterboxd-style)
        rating = row.get("rating")
        loc = f"★ {rating:.1f}" if rating else None

        # psycopg2 retorna DATE como objeto date — converter para string ISO
        date_str = (
            row["date_finished"].isoformat()
            if hasattr(row["date_finished"], "isoformat")
            else str(row["date_finished"])
        )

        items.append({
            "cal": "mai",
            "date": date_str,
            "start": None,
            "end": None,
            "all_day": True,
            "title": title,
            "kind": "series-finished",
            "ref_id": row["id"],
            "deep_link": "/series",
            "color": None,
            "loc": loc,
        })

    return items
