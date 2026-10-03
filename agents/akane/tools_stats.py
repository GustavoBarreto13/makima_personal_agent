"""Estatísticas e Rewind de filmes da Akane no contrato `StatsPayload` do Design System (spec 072).

Alimenta a tela "Estatísticas" (que une o antigo Stats e o Rewind): KPIs com delta contra o mesmo
período do ano anterior, sessões por dia e por mês, distribuição de notas, rankings e recordes.
Respeita as regras de correção do padrão (webapp/docs/DESIGN_SYSTEM.md):
  - itens apagados (soft delete) fora da conta;
  - ranking de gênero/diretor/década/país/idioma conta FILMES distintos, nunca sessões
    (um rewatch não infla o ranking);
  - distribuição de notas por filme distinto (a nota da sessão mais recente do período);
  - datas locais (`watched_date` já é DATE local; `watchlist_added_at` é convertido para
    America/Sao_Paulo antes de virar dia);
  - ano em andamento compara com o MESMO trecho do ano anterior, não com o ano fechado.

Usage:
    from agents.akane.tools_stats import get_stats_payload
"""

from calendar import monthrange
from datetime import date, timedelta

from agents.akane.tools import _today
from agents.db import run_select

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]

# Idiomas mais comuns em nome legível; os demais caem no código em maiúsculas.
_IDIOMAS = {
    "en": "Inglês", "pt": "Português", "es": "Espanhol", "fr": "Francês", "it": "Italiano",
    "de": "Alemão", "ja": "Japonês", "ko": "Coreano", "zh": "Chinês", "cn": "Cantonês",
    "hi": "Hindi", "ru": "Russo", "sv": "Sueco", "da": "Dinamarquês", "no": "Norueguês",
    "fi": "Finlandês", "nl": "Holandês", "pl": "Polonês", "tr": "Turco", "fa": "Persa",
    "ar": "Árabe", "th": "Tailandês", "he": "Hebraico", "el": "Grego", "cs": "Tcheco",
    "hu": "Húngaro", "ro": "Romeno", "uk": "Ucraniano", "id": "Indonésio", "ta": "Tâmil",
}

# Países mais comuns; os demais caem no código ISO.
_PAISES = {
    "US": "Estados Unidos", "BR": "Brasil", "GB": "Reino Unido", "FR": "França", "DE": "Alemanha",
    "IT": "Itália", "ES": "Espanha", "JP": "Japão", "KR": "Coreia do Sul", "CN": "China",
    "HK": "Hong Kong", "TW": "Taiwan", "IN": "Índia", "CA": "Canadá", "AU": "Austrália",
    "MX": "México", "AR": "Argentina", "SE": "Suécia", "DK": "Dinamarca", "NO": "Noruega",
    "FI": "Finlândia", "NL": "Holanda", "BE": "Bélgica", "PL": "Polônia", "RU": "Rússia",
    "IR": "Irã", "TR": "Turquia", "NZ": "Nova Zelândia", "IE": "Irlanda", "AT": "Áustria",
    "CH": "Suíça", "PT": "Portugal", "CZ": "Tchéquia", "HU": "Hungria", "TH": "Tailândia",
    "ZA": "África do Sul", "SU": "União Soviética", "XC": "Tchecoslováquia",
}


def _lang_label(code: str) -> str:
    return _IDIOMAS.get(code.lower(), code.upper())


def _country_label(code: str) -> str:
    return _PAISES.get(code.upper(), code.upper())


def period_bounds(year: int, month: int | None, today: date) -> tuple[date, date, date, date]:
    """(início, fim, início_anterior, fim_anterior) do período e do mesmo trecho do ano anterior.

    Mês: o mês inteiro. Ano corrente sem mês: de 1º/jan até hoje (o anterior vai até o mesmo
    dia/mês); ano passado: o ano todo. Se hoje é 29/fev e o ano anterior não é bissexto, o corte
    vira 28/fev.
    """
    def _last(y: int, m: int) -> date:
        return date(y, m, monthrange(y, m)[1])

    if month:
        return date(year, month, 1), _last(year, month), date(year - 1, month, 1), _last(year - 1, month)

    if year == today.year:
        end = today
        prev_end = date(year - 1, today.month, min(today.day, monthrange(year - 1, today.month)[1]))
    else:
        end, prev_end = date(year, 12, 31), date(year - 1, 12, 31)
    return date(year, 1, 1), end, date(year - 1, 1, 1), prev_end


def compute_streaks(dates: list[str], today: date) -> dict:
    """Maior sequência e sequência atual de dias corridos com sessão.

    A atual vale até ontem: hoje sem sessão ainda não a quebra (mesma regra de `computeStreaks`
    no front, `core/stats.ts`).

    Args:
        dates: Datas ISO (YYYY-MM-DD) com sessão; repetidas são ignoradas.
        today: Hoje no fuso local.

    Returns:
        {"best": int, "current": int}
    """
    days = sorted({date.fromisoformat(d) for d in dates})
    best = run = 0
    prev: date | None = None
    for d in days:
        run = run + 1 if prev is not None and (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    present = set(days)
    cursor = today if today in present else today - timedelta(days=1)
    current = 0
    while cursor in present:
        current += 1
        cursor -= timedelta(days=1)
    return {"best": best, "current": current}


def _share(part: int, whole: int) -> float:
    """Percentual 0-100 com uma casa; 0 quando não há base."""
    return round(part / whole * 100, 1) if whole > 0 else 0.0


def _fmt_dm(iso: str) -> str:
    return f"{iso[8:]}/{iso[5:7]}"


def build_stats_payload(
    *,
    year: int,
    month: int | None,
    today: date,
    totals: dict,
    prev_totals: dict,
    watchlist: dict,
    prev_watchlist: dict,
    daily: list[dict],
    ratings: list[float],
    rankings: dict[str, list[dict]],
    most_rewatched: dict | None,
    liked: list[dict],
) -> dict:
    """Monta o StatsPayload a partir de números já consultados — função pura, sem banco.

    Args:
        totals / prev_totals: {films, sessions, rewatches, minutes, avg_rating, cinema, located}
            do período e do mesmo trecho do ano anterior.
        watchlist / prev_watchlist: {added, watched} — filmes que entraram no "Quero ver" no
            período e filmes (que já passaram por lá) vistos pela 1ª vez no período.
        daily: [{date (ISO), value}] de sessões do ANO inteiro (só dias com sessão).
        ratings: notas por filme distinto no período (a mais recente de cada um).
        rankings: {genres, directors, decades, countries, languages, companions} →
            [{label, count}] já ordenados, contando filmes distintos (companhia conta sessões).
        most_rewatched: {title, sessions} do filme mais revisto no período, ou None.
        liked: [{id, title, year, poster_url, rating}] de filmes com coração vistos no período.
    """
    has_prev = (prev_totals["sessions"] + prev_watchlist["added"]) > 0   # sem histórico → sem delta

    label = f"{MESES[month - 1]} de {year}" if month else str(year)
    prev_label = f"{MESES[month - 1]} de {year - 1}" if month else str(year - 1)

    def _kpi(key: str, label_: str, value, prev, **extra) -> dict:
        return {"key": key, "label": label_, "value": value, "prev": prev if has_prev else None, **extra}

    avg = totals["avg_rating"] or 0.0
    prev_avg = prev_totals["avg_rating"] or 0.0
    kpis = [
        _kpi("films", "Filmes", totals["films"], prev_totals["films"], decimals=0),
        _kpi("sessions", "Sessões", totals["sessions"], prev_totals["sessions"], decimals=0),
        _kpi("hours", "Horas", round(totals["minutes"] / 60, 1), round(prev_totals["minutes"] / 60, 1),
             unit="h", decimals=0),
        _kpi("rewatches", "Revistos", totals["rewatches"], prev_totals["rewatches"], decimals=0),
        _kpi("avg_rating", "Nota média", round(float(avg), 2), round(float(prev_avg), 2),
             unit="/5", decimals=1, absoluteDelta=True),
        _kpi("cinema_share", "No cinema", _share(totals["cinema"], totals["located"]),
             _share(prev_totals["cinema"], prev_totals["located"]), unit="%", decimals=0, absoluteDelta=True),
        _kpi("watchlist_added", "Entraram no Quero ver", watchlist["added"], prev_watchlist["added"], decimals=0),
        _kpi("watchlist_watched", "Vistos do Quero ver", watchlist["watched"], prev_watchlist["watched"],
             decimals=0),
    ]

    monthly_counts = [0] * 12
    for d in daily:
        monthly_counts[int(d["date"][5:7]) - 1] += int(d["value"])
    monthly = [{"month": m + 1, "value": monthly_counts[m]} for m in range(12)]

    # Notas de 5 a 0.5, sem perder nenhum degrau (o StatsPage lê `bucket` como número).
    buckets = {v / 2: 0 for v in range(10, 0, -1)}
    for r in ratings:
        key = max(0.5, min(5.0, round(float(r) * 2) / 2))
        buckets[key] += 1
    distribution = [{"bucket": str(k), "count": c} for k, c in buckets.items()]

    # `daily` cobre o ano inteiro; recordes olham só o período (o ano corrente termina hoje)
    p_start, p_end, _, _ = period_bounds(year, month, today)
    start_iso, end_iso = p_start.isoformat(), p_end.isoformat()
    in_period = [d for d in daily if start_iso <= d["date"] <= end_iso]

    records: list[dict] = []
    if in_period:
        top_day = max(in_period, key=lambda d: (d["value"], d["date"]))
        if top_day["value"] > 1:
            records.append({"label": "Maior maratona", "value": f"{top_day['value']} filmes",
                            "detail": f"{_fmt_dm(top_day['date'])}/{top_day['date'][:4]}"})
        streaks = compute_streaks([d["date"] for d in in_period], today)
        if streaks["best"] > 1:
            records.append({"label": "Maior sequência", "value": f"{streaks['best']} dias"})
        if streaks["current"] > 1 and end_iso == today.isoformat():
            records.append({"label": "Sequência atual", "value": f"{streaks['current']} dias"})
    if most_rewatched:
        records.append({"label": "Mais revisto", "value": f"{most_rewatched['sessions']}×",
                        "detail": most_rewatched["title"]})

    titles = {
        "genres": "Gêneros", "directors": "Diretores", "decades": "Décadas",
        "countries": "Países", "languages": "Idiomas", "companions": "Com quem assisti",
    }
    ranking_out = {
        key: {"title": titles[key], "items": [{"label": i["label"], "count": int(i["count"])} for i in items]}
        for key, items in rankings.items() if items
    }

    return {
        "period": {"year": year, "month": month, "label": label},
        "previous": {"label": prev_label} if has_prev else None,
        "kpis": kpis,
        "daily": daily,
        "monthly": monthly,
        "monthlyUnit": "sessões",
        "distribution": distribution,
        "rankings": ranking_out,
        "records": records,
        "moments": [
            {"id": m["id"], "title": m["title"], "subtitle": str(m["year"]) if m.get("year") else None,
             "image": m.get("poster_url"), "rating": float(m["rating"]) if m.get("rating") is not None else None}
            for m in liked
        ],
    }


# ─── consultas ────────────────────────────────────────────────────────────────

_FROM_SESSIONS = """
    FROM diary_entries d
    JOIN movies m ON m.id = d.movie_id
    LEFT JOIN movie_watch_locations l ON l.id = d.watch_location_id
    WHERE m.deleted = FALSE AND d.watched_date BETWEEN %(start)s AND %(end)s
"""


def _period_totals(start: date, end: date) -> dict:
    row = run_select(
        f"""
        SELECT COUNT(DISTINCT d.movie_id) AS films,
               COUNT(*) AS sessions,
               COUNT(*) FILTER (WHERE d.rewatch) AS rewatches,
               COALESCE(SUM(m.runtime), 0) AS minutes,
               AVG(d.rating) AS avg_rating,
               COUNT(*) FILTER (WHERE l.kind = 'cinema') AS cinema,
               COUNT(*) FILTER (WHERE l.kind IS NOT NULL) AS located
        {_FROM_SESSIONS}
        """,
        {"start": start, "end": end},
    )[0]
    return {
        "films": int(row["films"]), "sessions": int(row["sessions"]), "rewatches": int(row["rewatches"]),
        "minutes": int(row["minutes"]),
        "avg_rating": float(row["avg_rating"]) if row["avg_rating"] is not None else None,
        "cinema": int(row["cinema"]), "located": int(row["located"]),
    }


def _period_watchlist(start: date, end: date) -> dict:
    added = run_select(
        """
        SELECT COUNT(*) AS n FROM movies
         WHERE deleted = FALSE AND watchlist_added_at IS NOT NULL
           AND (watchlist_added_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(start)s AND %(end)s
        """,
        {"start": start, "end": end},
    )[0]["n"]
    watched = run_select(
        """
        SELECT COUNT(*) AS n FROM (
            SELECT d.movie_id, MIN(d.watched_date) AS first_seen
              FROM diary_entries d JOIN movies m ON m.id = d.movie_id
             WHERE m.deleted = FALSE AND m.watchlist_added_at IS NOT NULL
             GROUP BY d.movie_id
        ) f WHERE f.first_seen BETWEEN %(start)s AND %(end)s
        """,
        {"start": start, "end": end},
    )[0]["n"]
    return {"added": int(added), "watched": int(watched)}


def _rank_unnest(column: str, start: date, end: date, limit: int = 8) -> list[dict]:
    """Ranking de uma coluna TEXT[] de `movies`, contando filmes distintos (`column` é constante interna)."""
    return run_select(
        f"""
        SELECT x AS label, COUNT(DISTINCT movie_id) AS count
          FROM (SELECT UNNEST(m.{column}) AS x, d.movie_id {_FROM_SESSIONS}) t
         WHERE x IS NOT NULL AND x <> ''
         GROUP BY x ORDER BY count DESC, x LIMIT %(limit)s
        """,
        {"start": start, "end": end, "limit": limit},
    )


def _rankings(start: date, end: date) -> dict[str, list[dict]]:
    params = {"start": start, "end": end}
    decades = run_select(
        f"""
        SELECT (FLOOR(m.year / 10) * 10)::int AS decade, COUNT(DISTINCT d.movie_id) AS count
        {_FROM_SESSIONS} AND m.year IS NOT NULL
        GROUP BY decade ORDER BY count DESC, decade DESC LIMIT 8
        """,
        params,
    )
    languages = run_select(
        f"""
        SELECT m.original_language AS code, COUNT(DISTINCT d.movie_id) AS count
        {_FROM_SESSIONS} AND m.original_language IS NOT NULL AND m.original_language <> ''
        GROUP BY m.original_language ORDER BY count DESC, code LIMIT 8
        """,
        params,
    )
    # Acompanhantes são pessoas da Komi vinculadas à SESSÃO; aqui cada sessão conta uma vez.
    companions = run_select(
        f"""
        SELECT p.name AS label, COUNT(DISTINCT d.id) AS count
          FROM diary_entries d
          JOIN movies m ON m.id = d.movie_id
          JOIN person_links pl ON pl.entity_type = 'movie_diary_entry' AND pl.entity_id = d.id
          JOIN people p ON p.id = pl.person_id
         WHERE m.deleted = FALSE AND p.deleted = FALSE
           AND d.watched_date BETWEEN %(start)s AND %(end)s
         GROUP BY p.id, p.name ORDER BY count DESC, p.name LIMIT 8
        """,
        params,
    )
    return {
        "genres": _rank_unnest("genres", start, end),
        "directors": _rank_unnest("director", start, end),
        "decades": [{"label": f"{r['decade']}s", "count": r["count"]} for r in decades],
        "countries": [{"label": _country_label(r["label"]), "count": r["count"]}
                      for r in _rank_unnest("countries", start, end)],
        "languages": [{"label": _lang_label(r["code"]), "count": r["count"]} for r in languages],
        "companions": companions,
    }


def get_stats_payload(year: int = 0, month: int | None = None) -> dict:
    """Estatísticas de filmes de um ano (ou de um mês dele) no contrato `StatsPayload`.

    Args:
        year: Ano (0 = ano corrente em America/Sao_Paulo).
        month: Mês 1-12 para fechar o foco num mês; None = ano inteiro.

    Returns:
        {"status": "ok", **StatsPayload} ou {"status": "error", "message": ...}.
    """
    today = _today()
    year = year or today.year
    if month is not None and not 1 <= month <= 12:
        return {"status": "error", "message": "month deve estar entre 1 e 12"}

    try:
        start, end, prev_start, prev_end = period_bounds(year, month, today)

        daily = [
            {"date": r["day"], "value": int(r["sessions"])}
            for r in run_select(
                """
                SELECT d.watched_date::text AS day, COUNT(*) AS sessions
                  FROM diary_entries d JOIN movies m ON m.id = d.movie_id
                 WHERE m.deleted = FALSE AND d.watched_date BETWEEN %(start)s AND %(end)s
                 GROUP BY d.watched_date ORDER BY d.watched_date
                """,
                {"start": date(year, 1, 1), "end": date(year, 12, 31)},
            )
        ]
        ratings = [
            float(r["rating"])
            for r in run_select(
                """
                SELECT rating FROM (
                    SELECT DISTINCT ON (d.movie_id) d.rating
                      FROM diary_entries d JOIN movies m ON m.id = d.movie_id
                     WHERE m.deleted = FALSE AND d.rating IS NOT NULL
                       AND d.watched_date BETWEEN %(start)s AND %(end)s
                     ORDER BY d.movie_id, d.watched_date DESC, d.created_at DESC
                ) r
                """,
                {"start": start, "end": end},
            )
        ]
        rewatched = run_select(
            f"""
            SELECT m.title AS title, COUNT(*) AS sessions
            {_FROM_SESSIONS}
            GROUP BY m.id, m.title HAVING COUNT(*) > 1
            ORDER BY sessions DESC, m.title LIMIT 1
            """,
            {"start": start, "end": end},
        )
        liked = run_select(
            """
            SELECT id, title, year, poster_url, rating FROM (
                SELECT DISTINCT ON (m.id) m.id, m.title, m.year, m.poster_url, m.rating,
                       d.watched_date AS seen
                  FROM diary_entries d JOIN movies m ON m.id = d.movie_id
                 WHERE m.deleted = FALSE AND m.liked = TRUE
                   AND d.watched_date BETWEEN %(start)s AND %(end)s
                 ORDER BY m.id, d.watched_date DESC
            ) l ORDER BY seen DESC, title LIMIT 12
            """,
            {"start": start, "end": end},
        )

        payload = build_stats_payload(
            year=year, month=month, today=today,
            totals=_period_totals(start, end), prev_totals=_period_totals(prev_start, prev_end),
            watchlist=_period_watchlist(start, end), prev_watchlist=_period_watchlist(prev_start, prev_end),
            daily=daily, ratings=ratings, rankings=_rankings(start, end),
            most_rewatched=({"title": rewatched[0]["title"], "sessions": int(rewatched[0]["sessions"])}
                            if rewatched else None),
            liked=liked,
        )
        return {"status": "ok", **payload}
    except Exception as e:
        return {"status": "error", "message": str(e)}
