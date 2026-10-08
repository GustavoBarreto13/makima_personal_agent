"""Estatísticas e Rewind de animes da Marin no contrato `StatsPayload` do Design System (spec 074).

Alimenta a tela "Estatísticas" (que une o antigo Stats e o Rewind): KPIs com delta contra o mesmo
período do ano anterior, episódios por dia e por mês, distribuição de notas, rankings e recordes.
Respeita as regras de correção do padrão (webapp/docs/DESIGN_SYSTEM.md):
  - animes apagados (soft delete) ficam fora da conta;
  - "episódios" são episódios reais (SUM de `episodes_count`), nunca o número de sessões;
  - "completos" e "dropados" são do PERÍODO (`date_finished` / `date_abandoned`), não do acervo todo;
  - rankings (estúdio, gênero, temporada, formato) contam animes DISTINTOS, nunca sessões;
  - a nota vem da escala do MAL (0–10) e é mostrada em estrelas (0–5), dividindo por 2;
  - datas já são locais (`watched_date` é DATE); o ano em andamento compara com o MESMO trecho
    do ano anterior, não com o ano fechado.

Usage:
    from agents.marin.tools_stats import get_stats_payload
"""

from calendar import monthrange
from datetime import date, timedelta

from agents.db import run_select
from agents.marin.tools import _AVG_EP_MINUTES, _today

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]

# Temporada do MAL/Jikan (em inglês, ou já em português nos dados antigos) → rótulo em português.
_ESTACOES = {
    "winter": "Inverno", "inverno": "Inverno",
    "spring": "Primavera", "primavera": "Primavera",
    "summer": "Verão", "verao": "Verão", "verão": "Verão",
    "fall": "Outono", "autumn": "Outono", "outono": "Outono",
}

# Formato (`media_type`) → rótulo legível.
_FORMATOS = {"tv": "TV", "movie": "Filme", "ova": "OVA", "special": "Especial", "ona": "ONA"}


def season_label(season: str | None) -> str | None:
    """Converte a temporada gravada (ex.: "winter 2024") em rótulo pt-BR ("Inverno 2024").

    Args:
        season: Texto salvo em `anime.season`, ou None.

    Returns:
        O rótulo, ou None quando não dá para entender a temporada (vazio ou sem ano).

    Example:
        >>> season_label("winter 2024")
        'Inverno 2024'
        >>> season_label("Verão 2019")
        'Verão 2019'
        >>> season_label(None) is None
        True
    """
    if not season:
        return None
    partes = season.strip().split()
    if len(partes) != 2 or not partes[1].isdigit():
        return None
    estacao = _ESTACOES.get(partes[0].lower())
    return f"{estacao} {partes[1]}" if estacao else None


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
    """Maior sequência e sequência atual de dias corridos com episódio visto.

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


def _fmt_dm(iso: str) -> str:
    return f"{iso[8:]}/{iso[5:7]}"


def build_stats_payload(
    *,
    year: int,
    month: int | None,
    today: date,
    totals: dict,
    prev_totals: dict,
    daily: list[dict],
    scores: list[float],
    rankings: dict[str, list[dict]],
    top_anime: dict | None,
    liked: list[dict],
    first_year: int | None = None,
) -> dict:
    """Monta o StatsPayload a partir de números já consultados — função pura, sem banco.

    Args:
        totals / prev_totals: {animes, sessions, episodes, completed, dropped, avg_score} do período
            e do mesmo trecho do ano anterior. `avg_score` está na escala do MAL (0–10).
        daily: [{date (ISO), value}] de EPISÓDIOS do ANO inteiro (só dias com sessão).
        scores: notas (escala MAL 0–10) dos animes distintos vistos no período.
        rankings: {studios, genres, seasons, formats} → [{label, count}] já ordenados,
            contando animes distintos.
        top_anime: {title, episodes} do anime com mais episódios vistos no período, ou None.
        liked: [{id, title, studio, season, poster_url, score}] de animes com coração vistos no período.
        first_year: Ano da primeira sessão registrada (limite do seletor de ano); None = o próprio ano.
    """
    # Sem nada no ano anterior não existe delta honesto para mostrar
    has_prev = (prev_totals["episodes"] + prev_totals["completed"] + prev_totals["dropped"]) > 0

    label = f"{MESES[month - 1]} de {year}" if month else str(year)
    prev_label = f"{MESES[month - 1]} de {year - 1}" if month else str(year - 1)

    def _kpi(key: str, label_: str, value, prev, **extra) -> dict:
        return {"key": key, "label": label_, "value": value, "prev": prev if has_prev else None, **extra}

    # Nota do MAL (0–10) vira estrelas (0–5) dividindo por 2
    avg = (totals["avg_score"] or 0.0) / 2
    prev_avg = (prev_totals["avg_score"] or 0.0) / 2
    horas = round(totals["episodes"] * _AVG_EP_MINUTES / 60, 1)
    prev_horas = round(prev_totals["episodes"] * _AVG_EP_MINUTES / 60, 1)
    kpis = [
        _kpi("episodes", "Episódios", totals["episodes"], prev_totals["episodes"], decimals=0),
        _kpi("animes", "Animes", totals["animes"], prev_totals["animes"], decimals=0),
        _kpi("hours", "Horas", horas, prev_horas, unit="h", decimals=0),
        _kpi("completed", "Completos", totals["completed"], prev_totals["completed"], decimals=0),
        _kpi("dropped", "Dropados", totals["dropped"], prev_totals["dropped"], decimals=0),
        _kpi("avg_rating", "Nota média", round(avg, 2), round(prev_avg, 2),
             unit="/5", decimals=1, absoluteDelta=True),
    ]

    monthly_counts = [0] * 12
    for d in daily:
        monthly_counts[int(d["date"][5:7]) - 1] += int(d["value"])
    monthly = [{"month": m + 1, "value": monthly_counts[m]} for m in range(12)]

    # Notas de 5 a 0.5, sem perder nenhum degrau (o StatsPage lê `bucket` como número).
    buckets = {v / 2: 0 for v in range(10, 0, -1)}
    for s in scores:
        key = max(0.5, min(5.0, round(float(s)) / 2))   # MAL 0–10 → meia estrela por ponto
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
            records.append({"label": "Maior maratona", "value": f"{top_day['value']} episódios",
                            "detail": f"{_fmt_dm(top_day['date'])}/{top_day['date'][:4]}"})
        streaks = compute_streaks([d["date"] for d in in_period], today)
        if streaks["best"] > 1:
            records.append({"label": "Maior sequência", "value": f"{streaks['best']} dias"})
        if streaks["current"] > 1 and end_iso == today.isoformat():
            records.append({"label": "Sequência atual", "value": f"{streaks['current']} dias"})
    if top_anime and top_anime["episodes"] > 0:
        records.append({"label": "Mais assistido", "value": f"{top_anime['episodes']} episódios",
                        "detail": top_anime["title"]})

    titles = {
        "studios": "Estúdios", "genres": "Gêneros", "seasons": "Temporada de lançamento",
        "formats": "Formato",
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
        "monthlyUnit": "episódios",
        "distribution": distribution,
        "rankings": ranking_out,
        "records": records,
        # extensão do domínio (o StatsPage ignora; a tela da Marin usa para limitar o seletor de ano)
        "first_year": min(first_year or year, year),
        "moments": [
            {"id": m["id"], "title": m["title"],
             "subtitle": " · ".join(p for p in (m.get("studio"), season_label(m.get("season"))) if p) or None,
             "image": m.get("poster_url"),
             "rating": round(float(m["score"]) / 2, 1) if m.get("score") is not None else None}
            for m in liked
        ],
    }


# ─── consultas ────────────────────────────────────────────────────────────────

# Sessões do período de animes que não foram apagados — base de quase tudo abaixo
_FROM_LOGS = """
    FROM watch_logs w
    JOIN anime a ON a.id = w.anime_id
    WHERE a.deleted = FALSE AND w.watched_date BETWEEN %(start)s AND %(end)s
"""


def _period_totals(start: date, end: date) -> dict:
    params = {"start": start, "end": end}
    row = run_select(
        f"""
        SELECT COUNT(DISTINCT w.anime_id) AS animes,
               COUNT(*) AS sessions,
               COALESCE(SUM(w.episodes_count), 0) AS episodes
        {_FROM_LOGS}
        """,
        params,
    )[0]
    # Nota média por anime distinto (a nota do anime, não a média das sessões)
    avg = run_select(
        f"""
        SELECT AVG(score) AS avg FROM (
            SELECT DISTINCT a.id, a.score {_FROM_LOGS} AND a.score IS NOT NULL
        ) s
        """,
        params,
    )[0]["avg"]
    completed = run_select(
        """
        SELECT COUNT(*) AS n FROM anime
         WHERE deleted = FALSE AND status = 'completo'
           AND date_finished BETWEEN %(start)s AND %(end)s
        """,
        params,
    )[0]["n"]
    dropped = run_select(
        """
        SELECT COUNT(*) AS n FROM anime
         WHERE deleted = FALSE AND status = 'abandonado'
           AND date_abandoned BETWEEN %(start)s AND %(end)s
        """,
        params,
    )[0]["n"]
    return {
        "animes": int(row["animes"]), "sessions": int(row["sessions"]), "episodes": int(row["episodes"]),
        "completed": int(completed), "dropped": int(dropped),
        "avg_score": float(avg) if avg is not None else None,
    }


def _rankings(start: date, end: date) -> dict[str, list[dict]]:
    """Rankings por anime DISTINTO visto no período (um anime com 20 sessões conta uma vez)."""
    params = {"start": start, "end": end}
    studios = run_select(
        f"""
        SELECT a.studio AS label, COUNT(DISTINCT a.id) AS count
        {_FROM_LOGS} AND a.studio IS NOT NULL AND a.studio <> ''
        GROUP BY a.studio ORDER BY count DESC, a.studio LIMIT 8
        """,
        params,
    )
    genres = run_select(
        f"""
        SELECT x AS label, COUNT(DISTINCT anime_id) AS count
          FROM (SELECT UNNEST(a.genres) AS x, a.id AS anime_id {_FROM_LOGS}) t
         WHERE x IS NOT NULL AND x <> ''
         GROUP BY x ORDER BY count DESC, x LIMIT 8
        """,
        params,
    )
    seasons_raw = run_select(
        f"""
        SELECT a.season AS season, COUNT(DISTINCT a.id) AS count
        {_FROM_LOGS} AND a.season IS NOT NULL AND a.season <> ''
        GROUP BY a.season
        """,
        params,
    )
    # A temporada vem como texto livre; normaliza, soma variantes iguais e ordena aqui
    seasons: dict[str, int] = {}
    for r in seasons_raw:
        lbl = season_label(r["season"])
        if lbl:
            seasons[lbl] = seasons.get(lbl, 0) + int(r["count"])
    seasons_out = [{"label": k, "count": v}
                   for k, v in sorted(seasons.items(), key=lambda kv: (-kv[1], kv[0]))[:8]]
    formats = run_select(
        f"""
        SELECT a.media_type AS code, COUNT(DISTINCT a.id) AS count
        {_FROM_LOGS} AND a.media_type IS NOT NULL
        GROUP BY a.media_type ORDER BY count DESC, code
        """,
        params,
    )
    return {
        "studios": studios,
        "genres": genres,
        "seasons": seasons_out,
        "formats": [{"label": _FORMATOS.get(r["code"], str(r["code"]).upper()), "count": r["count"]}
                    for r in formats],
    }


def get_stats_payload(year: int = 0, month: int | None = None) -> dict:
    """Estatísticas de animes de um ano (ou de um mês dele) no contrato `StatsPayload`.

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
            {"date": r["day"], "value": int(r["episodes"])}
            for r in run_select(
                """
                SELECT w.watched_date::text AS day, COALESCE(SUM(w.episodes_count), 0) AS episodes
                  FROM watch_logs w JOIN anime a ON a.id = w.anime_id
                 WHERE a.deleted = FALSE AND w.watched_date BETWEEN %(start)s AND %(end)s
                 GROUP BY w.watched_date ORDER BY w.watched_date
                """,
                {"start": date(year, 1, 1), "end": date(year, 12, 31)},
            )
        ]
        scores = [
            float(r["score"])
            for r in run_select(
                f"""
                SELECT DISTINCT a.id, a.score {_FROM_LOGS} AND a.score IS NOT NULL
                """,
                {"start": start, "end": end},
            )
        ]
        top = run_select(
            f"""
            SELECT a.title AS title, COALESCE(SUM(w.episodes_count), 0) AS episodes
            {_FROM_LOGS}
            GROUP BY a.id, a.title ORDER BY episodes DESC, a.title LIMIT 1
            """,
            {"start": start, "end": end},
        )
        liked = run_select(
            f"""
            SELECT DISTINCT ON (a.id) a.id, a.title, a.studio, a.season, a.poster_url, a.score,
                   w.watched_date AS seen
            {_FROM_LOGS} AND a.liked = TRUE
            ORDER BY a.id, w.watched_date DESC
            """,
            {"start": start, "end": end},
        )
        liked.sort(key=lambda m: (m["seen"], m["title"]), reverse=True)
        first = run_select(
            """
            SELECT MIN(EXTRACT(YEAR FROM w.watched_date))::int AS y
              FROM watch_logs w JOIN anime a ON a.id = w.anime_id
             WHERE a.deleted = FALSE
            """
        )[0]["y"]

        payload = build_stats_payload(
            year=year, month=month, today=today,
            totals=_period_totals(start, end), prev_totals=_period_totals(prev_start, prev_end),
            daily=daily, scores=scores, rankings=_rankings(start, end),
            top_anime=({"title": top[0]["title"], "episodes": int(top[0]["episodes"])} if top else None),
            liked=liked[:12], first_year=int(first) if first else None,
        )
        return {"status": "ok", **payload}
    except Exception as e:
        return {"status": "error", "message": str(e)}
