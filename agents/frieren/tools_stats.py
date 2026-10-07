"""Estatísticas e tela Início da Frieren no contrato do Design System (spec 073).

Dois consumidores, ambos só do webapp (`/api/books/*`):
  - `get_stats_payload(year, month)` → `StatsPayload` da tela Estatísticas: KPIs com delta contra o
    mesmo trecho do ano anterior, páginas por dia e por mês, distribuição de notas, rankings,
    recordes e "momentos" (livros terminados no período).
  - `get_books_home()` → todos os blocos da tela Início numa chamada só (vitrine de favoritos,
    lendo agora, terminados recentes, ritmo da semana, sequência, histograma de notas).

Regras de correção (webapp/docs/DESIGN_SYSTEM.md):
  - livros apagados (soft delete) ficam fora de TODA conta — inclusive as páginas dos seus logs;
  - "sequência" é de dias de CALENDÁRIO seguidos com leitura, não "quantidade de dias com registro";
  - "páginas por dia" divide pelos dias corridos do período, não só pelos dias em que houve leitura;
  - abandonado nunca conta como lido; o abandono tem data própria (`books.date_abandoned`);
  - distribuição de notas de 0.5 a 5.0 sem perder nenhum degrau;
  - datas locais: `reading_logs.date`, `date_started`, `date_finished` e `date_abandoned` já são DATE
    no fuso de São Paulo; "hoje" vem de `_today()` (America/Sao_Paulo), nunca do relógio do servidor.

O agente do Telegram continua usando `get_reading_stats` (formato antigo, em `tools.py`).

Usage:
    from agents.frieren.tools_stats import get_stats_payload, get_books_home
"""

from calendar import monthrange
from datetime import date, timedelta

from agents.db import run_select
from agents.frieren.tools import _today

# Nomes dos meses para os rótulos de período ("Março de 2026").
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]

# Idiomas mais comuns em nome legível. A Google Books devolve códigos curtos ("pt", "en") ou
# com região ("pt-BR"); usamos só as duas primeiras letras. Os demais caem no código em maiúsculas.
_IDIOMAS = {
    "pt": "Português", "en": "Inglês", "es": "Espanhol", "fr": "Francês", "it": "Italiano",
    "de": "Alemão", "ja": "Japonês", "ko": "Coreano", "zh": "Chinês", "ru": "Russo",
    "nl": "Holandês", "pl": "Polonês", "sv": "Sueco", "la": "Latim", "el": "Grego",
}


def _lang_label(code: str) -> str:
    """Traduzir um código de idioma ("pt-BR", "en") para um nome legível.

    Example:
        >>> _lang_label("pt-BR")
        'Português'
        >>> _lang_label("eo")
        'EO'
    """
    short = code.strip().lower()[:2]
    return _IDIOMAS.get(short, short.upper())


def period_bounds(year: int, month: int | None, today: date) -> tuple[date, date, date, date]:
    """Calcular o período pedido e o mesmo trecho do ano anterior.

    Mês: o mês inteiro. Ano corrente sem mês: de 1º/jan até hoje (o anterior vai até o mesmo
    dia/mês, para a comparação ser justa). Ano passado: o ano todo. Se hoje é 29/fev e o ano
    anterior não é bissexto, o corte vira 28/fev.

    Args:
        year: Ano do período.
        month: Mês 1-12, ou None para o ano.
        today: Hoje no fuso local.

    Returns:
        (início, fim, início_anterior, fim_anterior).

    Example:
        >>> period_bounds(2026, None, date(2026, 3, 10))[1]
        datetime.date(2026, 3, 10)
    """
    def _last(y: int, m: int) -> date:
        # monthrange devolve (dia da semana do dia 1, quantidade de dias do mês)
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
    """Calcular a maior sequência e a sequência atual de dias SEGUIDOS com leitura.

    A atual vale até ontem: hoje sem leitura ainda não quebra a sequência (mesma regra de
    `computeStreaks` no front, `src/design/core/stats.ts`).

    Args:
        dates: Datas ISO (YYYY-MM-DD) com leitura; repetidas são ignoradas.
        today: Hoje no fuso local.

    Returns:
        {"best": int, "current": int}

    Example:
        >>> compute_streaks(["2026-01-01", "2026-01-02", "2026-01-05"], date(2026, 1, 6))
        {'best': 2, 'current': 1}
    """
    days = sorted({date.fromisoformat(d) for d in dates})
    best = run = 0
    prev: date | None = None
    for d in days:
        # Só continua a sequência se o dia anterior com leitura foi exatamente ontem em relação a d.
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


def _fmt_dmy(iso: str) -> str:
    """Formatar 'YYYY-MM-DD' como 'DD/MM/YYYY' sem passar por Date/fuso.

    Example:
        >>> _fmt_dmy("2026-03-07")
        '07/03/2026'
    """
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}"


def _plural(n: int, one: str, many: str) -> str:
    """Escolher singular ou plural pela quantidade.

    Example:
        >>> _plural(1, "dia", "dias")
        '1 dia'
    """
    return f"{n} {one if n == 1 else many}"


def build_stats_payload(
    *,
    year: int,
    month: int | None,
    today: date,
    totals: dict,
    prev_totals: dict,
    daily: list[dict],
    ratings: list[float],
    rankings: dict[str, list[dict]],
    longest: dict | None,
    fastest: dict | None,
    moments: list[dict],
    first_year: int | None = None,
) -> dict:
    """Montar o StatsPayload a partir de números já consultados — função pura, sem banco.

    Args:
        year: Ano do período.
        month: Mês do período (None = ano).
        today: Hoje no fuso local.
        totals / prev_totals: {started, finished, abandoned, pages, sessions, days_reading,
            days_per_book (float|None), longest_pages, avg_rating (float|None)} do período e do
            mesmo trecho do ano anterior.
        daily: [{date (ISO), value}] de páginas lidas no ANO inteiro (só dias com leitura).
        ratings: Notas dos livros terminados no período (uma por livro).
        rankings: {genres, authors, languages} → [{label, count}] já ordenados (livros distintos).
        longest: {title, pages} do livro terminado mais longo, ou None.
        fastest: {title, days} da leitura mais rápida terminada no período, ou None.
        moments: [{id, title, author, cover_url, rating}] de livros terminados no período.
        first_year: Ano da primeira leitura registrada (limite do seletor de ano).

    Returns:
        Dicionário no contrato `StatsPayload` (`src/design/core/stats.ts`) + `first_year`.
    """
    # Sem nenhum histórico no período anterior, o delta não significa nada: escondemos o "prev".
    has_prev = (prev_totals["sessions"] + prev_totals["finished"] + prev_totals["started"]) > 0

    label = f"{MESES[month - 1]} de {year}" if month else str(year)
    prev_label = f"{MESES[month - 1]} de {year - 1}" if month else str(year - 1)

    start, end, prev_start, prev_end = period_bounds(year, month, today)
    # Dias corridos de cada período (o "+1" inclui o primeiro e o último dia).
    span = (end - start).days + 1
    prev_span = (prev_end - prev_start).days + 1

    def _kpi(key: str, label_: str, value, prev, **extra) -> dict:
        return {"key": key, "label": label_, "value": value, "prev": prev if has_prev else None, **extra}

    def _num(v) -> float:
        # Médias vêm None quando não há dado (ex.: nenhum livro terminado); viram 0 no KPI.
        return round(float(v), 1) if v is not None else 0.0

    kpis = [
        _kpi("books_finished", "Livros lidos", totals["finished"], prev_totals["finished"], decimals=0),
        _kpi("books_started", "Livros começados", totals["started"], prev_totals["started"], decimals=0),
        _kpi("books_abandoned", "Abandonados", totals["abandoned"], prev_totals["abandoned"], decimals=0),
        _kpi("pages", "Páginas", totals["pages"], prev_totals["pages"], decimals=0),
        _kpi("pages_per_day", "Páginas por dia", round(totals["pages"] / span, 1),
             round(prev_totals["pages"] / prev_span, 1), decimals=1),
        _kpi("days_reading", "Dias lendo", totals["days_reading"], prev_totals["days_reading"], decimals=0),
        _kpi("days_per_book", "Dias por livro", _num(totals["days_per_book"]),
             _num(prev_totals["days_per_book"]), decimals=0, absoluteDelta=True),
        _kpi("longest_book", "Livro mais longo", totals["longest_pages"], prev_totals["longest_pages"],
             unit=" pág.", decimals=0),
        _kpi("avg_rating", "Nota média", round(float(totals["avg_rating"] or 0), 2),
             round(float(prev_totals["avg_rating"] or 0), 2), unit="/5", decimals=1, absoluteDelta=True),
    ]

    # Páginas por mês, a partir do diário do ano inteiro.
    monthly_counts = [0] * 12
    for d in daily:
        monthly_counts[int(d["date"][5:7]) - 1] += int(d["value"])
    monthly = [{"month": m + 1, "value": monthly_counts[m]} for m in range(12)]

    # Notas de 5 a 0.5 (10 degraus). Arredonda ao meio ponto mais próximo para notas antigas
    # gravadas fora do passo (ex.: 4.3 → 4.5) e limita ao intervalo válido.
    buckets = {v / 2: 0 for v in range(10, 0, -1)}
    for r in ratings:
        key = max(0.5, min(5.0, round(float(r) * 2) / 2))
        buckets[key] += 1
    distribution = [{"bucket": str(k), "count": c} for k, c in buckets.items()]

    # `daily` cobre o ano inteiro; os recordes olham só o período (o ano corrente termina hoje).
    start_iso, end_iso = start.isoformat(), end.isoformat()
    in_period = [d for d in daily if start_iso <= d["date"] <= end_iso]

    records: list[dict] = []
    if in_period:
        top_day = max(in_period, key=lambda d: (d["value"], d["date"]))
        records.append({"label": "Dia recorde", "value": _plural(int(top_day["value"]), "página", "páginas"),
                        "detail": _fmt_dmy(top_day["date"])})
        streaks = compute_streaks([d["date"] for d in in_period], today)
        if streaks["best"] > 1:
            records.append({"label": "Maior sequência", "value": _plural(streaks["best"], "dia", "dias")})
        # Sequência atual só faz sentido quando o período termina hoje.
        if streaks["current"] > 1 and end_iso == today.isoformat():
            records.append({"label": "Sequência atual", "value": _plural(streaks["current"], "dia", "dias")})
    if longest:
        records.append({"label": "Livro mais longo", "value": _plural(int(longest["pages"]), "página", "páginas"),
                        "detail": longest["title"]})
    # Com um livro só, "a mais rápida" é ele mesmo — não diz nada; precisa de comparação.
    if fastest and totals["finished"] > 1:
        records.append({"label": "Leitura mais rápida", "value": _plural(int(fastest["days"]), "dia", "dias"),
                        "detail": fastest["title"]})

    titles = {"genres": "Gêneros", "authors": "Autores", "languages": "Idiomas"}
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
        "monthlyUnit": "páginas",
        "distribution": distribution,
        "rankings": ranking_out,
        "records": records,
        # Extensão do domínio (o StatsPage ignora; a tela da Frieren usa para limitar o seletor de ano).
        "first_year": min(first_year or year, year),
        "moments": [
            {"id": m["id"], "title": m["title"], "subtitle": m.get("author") or None,
             "image": m.get("cover_url") or None,
             "rating": float(m["rating"]) if m.get("rating") is not None else None}
            for m in moments
        ],
    }


# ─── consultas ────────────────────────────────────────────────────────────────

# Sessões de leitura do período, sempre ligadas a um livro que não foi apagado.
_FROM_LOGS = """
    FROM reading_logs rl
    JOIN books b ON b.id = rl.book_id
    WHERE b.deleted = FALSE AND rl.date BETWEEN %(start)s AND %(end)s
"""

# "Terminado no período": tem data de término dentro dele e não está abandonado.
_FINISHED = """
    b.deleted = FALSE AND b.status <> 'abandonado'
    AND b.date_finished BETWEEN %(start)s AND %(end)s
"""

# Livros "lidos no período" para os rankings: tiveram sessão OU foram terminados nele. Assim um
# livro terminado sem nenhum log (registrado só no fim) também entra no gênero/autor/idioma.
_TOUCHED = f"""
    WITH touched AS (
        SELECT DISTINCT b.id {_FROM_LOGS}
        UNION
        SELECT b.id FROM books b WHERE {_FINISHED}
    )
"""


def _period_totals(start: date, end: date) -> dict:
    """Consultar os números de um período (livros, páginas, dias).

    Args:
        start: Primeiro dia do período.
        end: Último dia do período.

    Returns:
        Dicionário com as chaves esperadas por `build_stats_payload` em `totals`.
    """
    params = {"start": start, "end": end}
    logs = run_select(
        f"""
        SELECT COALESCE(SUM(rl.pages_read), 0) AS pages,
               COUNT(*) AS sessions,
               COUNT(DISTINCT rl.date) FILTER (WHERE COALESCE(rl.pages_read, 0) > 0) AS days_reading
        {_FROM_LOGS}
        """,
        params,
    )[0]
    books = run_select(
        f"""
        SELECT
            (SELECT COUNT(*) FROM books b
              WHERE b.deleted = FALSE AND b.date_started BETWEEN %(start)s AND %(end)s) AS started,
            (SELECT COUNT(*) FROM books b WHERE {_FINISHED}) AS finished,
            (SELECT COUNT(*) FROM books b
              WHERE b.deleted = FALSE AND b.status = 'abandonado'
                AND b.date_abandoned BETWEEN %(start)s AND %(end)s) AS abandoned,
            -- dias do início ao fim, contando os dois (começou e terminou no mesmo dia = 1)
            (SELECT AVG(b.date_finished - b.date_started + 1) FROM books b
              WHERE {_FINISHED} AND b.date_started IS NOT NULL
                AND b.date_started <= b.date_finished) AS days_per_book,
            (SELECT COALESCE(MAX(b.total_pages), 0) FROM books b WHERE {_FINISHED}) AS longest_pages,
            (SELECT AVG(b.rating) FROM books b WHERE {_FINISHED} AND b.rating IS NOT NULL) AS avg_rating
        """,
        params,
    )[0]
    return {
        "started": int(books["started"]), "finished": int(books["finished"]),
        "abandoned": int(books["abandoned"]),
        "pages": int(logs["pages"]), "sessions": int(logs["sessions"]),
        "days_reading": int(logs["days_reading"]),
        "days_per_book": float(books["days_per_book"]) if books["days_per_book"] is not None else None,
        "longest_pages": int(books["longest_pages"]),
        "avg_rating": float(books["avg_rating"]) if books["avg_rating"] is not None else None,
    }


def _rank_split(column: str, start: date, end: date, limit: int = 8) -> list[dict]:
    """Ranking de uma coluna de texto separada por vírgulas ("Fantasia, Aventura"), por livro.

    Args:
        column: `genre` ou `author` (constante interna — nunca vem do usuário).
        start: Primeiro dia do período.
        end: Último dia do período.
        limit: Quantos itens devolver.

    Returns:
        [{label, count}] do mais frequente ao menos frequente.
    """
    return run_select(
        f"""
        {_TOUCHED}
        SELECT TRIM(x) AS label, COUNT(DISTINCT b.id) AS count
          FROM books b
          JOIN touched t ON t.id = b.id
          CROSS JOIN LATERAL regexp_split_to_table(COALESCE(b.{column}, ''), ',') AS x
         WHERE TRIM(x) <> ''
         GROUP BY TRIM(x) ORDER BY count DESC, label LIMIT %(limit)s
        """,
        {"start": start, "end": end, "limit": limit},
    )


def _rankings(start: date, end: date) -> dict[str, list[dict]]:
    """Montar os três rankings (gêneros, autores, idiomas) do período."""
    languages = run_select(
        f"""
        {_TOUCHED}
        SELECT b.language AS code, COUNT(*) AS count
          FROM books b JOIN touched t ON t.id = b.id
         WHERE b.language IS NOT NULL AND b.language <> ''
         GROUP BY b.language
        """,
        {"start": start, "end": end},
    )
    # "pt" e "pt-BR" viram o mesmo idioma: soma depois de traduzir o rótulo.
    merged: dict[str, int] = {}
    for r in languages:
        label = _lang_label(r["code"])
        merged[label] = merged.get(label, 0) + int(r["count"])
    lang_items = sorted(({"label": k, "count": v} for k, v in merged.items()),
                        key=lambda i: (-i["count"], i["label"]))[:8]
    return {
        "genres": _rank_split("genre", start, end),
        "authors": _rank_split("author", start, end),
        "languages": lang_items,
    }


def _daily_pages(start: date, end: date) -> list[dict]:
    """Páginas lidas por dia (só dias com leitura), de livros não apagados.

    Returns:
        [{date: 'YYYY-MM-DD', value: int}] em ordem de data.
    """
    return [
        {"date": r["day"], "value": int(r["pages"])}
        for r in run_select(
            f"""
            SELECT rl.date::text AS day, SUM(rl.pages_read) AS pages
            {_FROM_LOGS}
            GROUP BY rl.date HAVING SUM(rl.pages_read) > 0 ORDER BY rl.date
            """,
            {"start": start, "end": end},
        )
    ]


def get_stats_payload(year: int = 0, month: int | None = None) -> dict:
    """Obter as estatísticas de leitura de um ano (ou de um mês dele) no contrato `StatsPayload`.

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
        params = {"start": start, "end": end}

        ratings = [
            float(r["rating"])
            for r in run_select(f"SELECT b.rating FROM books b WHERE {_FINISHED} AND b.rating IS NOT NULL",
                                params)
        ]
        longest = run_select(
            f"""
            SELECT b.title, b.total_pages AS pages FROM books b
             WHERE {_FINISHED} AND b.total_pages IS NOT NULL
             ORDER BY b.total_pages DESC, b.title LIMIT 1
            """,
            params,
        )
        fastest = run_select(
            f"""
            SELECT b.title, (b.date_finished - b.date_started + 1) AS days FROM books b
             WHERE {_FINISHED} AND b.date_started IS NOT NULL AND b.date_started <= b.date_finished
             ORDER BY days, b.title LIMIT 1
            """,
            params,
        )
        # Momentos: livros terminados no período — os com coração primeiro, depois pela nota.
        moments = run_select(
            f"""
            SELECT b.id, b.title, b.author, b.cover_url, b.rating FROM books b
             WHERE {_FINISHED}
             ORDER BY b.liked DESC, b.rating DESC NULLS LAST, b.date_finished DESC LIMIT 12
            """,
            params,
        )
        # Primeiro ano com qualquer registro (sessão ou término), para o seletor de ano.
        first = run_select(
            """
            SELECT MIN(y)::int AS y FROM (
                SELECT EXTRACT(YEAR FROM rl.date) AS y
                  FROM reading_logs rl JOIN books b ON b.id = rl.book_id WHERE b.deleted = FALSE
                UNION ALL
                SELECT EXTRACT(YEAR FROM b.date_finished) FROM books b
                 WHERE b.deleted = FALSE AND b.date_finished IS NOT NULL
            ) t
            """
        )[0]["y"]

        payload = build_stats_payload(
            year=year, month=month, today=today,
            totals=_period_totals(start, end), prev_totals=_period_totals(prev_start, prev_end),
            daily=_daily_pages(date(year, 1, 1), date(year, 12, 31)),
            ratings=ratings, rankings=_rankings(start, end),
            longest=longest[0] if longest else None,
            fastest=fastest[0] if fastest else None,
            moments=moments, first_year=int(first) if first else None,
        )
        return {"status": "ok", **payload}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── tela Início ──────────────────────────────────────────────────────────────

def build_home_rhythm(daily: list[dict], today: date) -> dict:
    """Calcular o ritmo da Início a partir das páginas por dia — função pura, sem banco.

    Args:
        daily: [{date, value}] de páginas por dia (só dias com leitura), de pelo menos 21 dias.
        today: Hoje no fuso local.

    Returns:
        {pages_7d, pages_7d_prev, spark: [{date, value}] dos últimos 21 dias com zeros
        preenchidos, streak: {best, current}}.

    Example:
        >>> build_home_rhythm([{"date": "2026-01-10", "value": 30}], date(2026, 1, 10))["pages_7d"]
        30
    """
    by_day = {d["date"]: int(d["value"]) for d in daily}

    def _sum(first: date, last: date) -> int:
        total, cursor = 0, first
        while cursor <= last:
            total += by_day.get(cursor.isoformat(), 0)
            cursor += timedelta(days=1)
        return total

    # Janelas de dias CORRIDOS (corrige o legado, que pegava "as últimas 7 entradas").
    pages_7d = _sum(today - timedelta(days=6), today)
    pages_7d_prev = _sum(today - timedelta(days=13), today - timedelta(days=7))
    spark = [
        {"date": (today - timedelta(days=i)).isoformat(),
         "value": by_day.get((today - timedelta(days=i)).isoformat(), 0)}
        for i in range(20, -1, -1)
    ]
    return {"pages_7d": pages_7d, "pages_7d_prev": pages_7d_prev, "spark": spark,
            "streak": compute_streaks(list(by_day.keys()), today)}


def get_books_home() -> dict:
    """Obter todos os blocos da tela Início numa chamada só (sem N+1, vazio-seguro).

    Returns:
        {"status": "ok", favorites, reading, recent_finished, rating_histogram, pages_7d,
        pages_7d_prev, spark, streak, finished_year, last_session, counts} ou
        {"status": "error", "message": ...}.
    """
    today = _today()
    try:
        favorites = run_select(
            """
            SELECT b.id, b.title, b.author, b.cover_url, f.position
              FROM book_favorites f JOIN books b ON b.id = f.book_id
             WHERE b.deleted = FALSE
             ORDER BY f.position
            """
        )
        # Lendo agora, com a página atual (maior page_end) e o último dia lido.
        reading = run_select(
            """
            SELECT b.id, b.title, b.author, b.cover_url, b.total_pages, b.date_started,
                   COALESCE(MAX(rl.page_end), 0) AS current_page, MAX(rl.date) AS last_read
              FROM books b LEFT JOIN reading_logs rl ON rl.book_id = b.id
             WHERE b.deleted = FALSE AND b.status = 'lendo'
             GROUP BY b.id
             ORDER BY MAX(rl.date) DESC NULLS LAST, b.updated_at DESC
            """
        )
        recent_finished = run_select(
            """
            SELECT b.id, b.title, b.author, b.cover_url, b.rating, b.liked, b.date_finished,
                   (b.notes IS NOT NULL AND b.notes <> '') AS has_review
              FROM books b
             WHERE b.deleted = FALSE AND b.status = 'lido' AND b.date_finished IS NOT NULL
             ORDER BY b.date_finished DESC, b.updated_at DESC LIMIT 4
            """
        )
        # Histograma do ano: nota de cada livro terminado no ano (um voto por livro).
        hist = {str(v / 2): 0 for v in range(1, 11)}
        for row in run_select(
            """
            SELECT b.rating FROM books b
             WHERE b.deleted = FALSE AND b.status = 'lido' AND b.rating IS NOT NULL
               AND EXTRACT(YEAR FROM b.date_finished) = %(year)s
            """,
            {"year": today.year},
        ):
            key = str(max(0.5, min(5.0, round(float(row["rating"]) * 2) / 2)))
            hist[key] += 1

        # Sequência atual precisa de todo o histórico (pode atravessar a virada do ano).
        all_days = run_select(
            """
            SELECT rl.date::text AS day, SUM(rl.pages_read) AS pages
              FROM reading_logs rl JOIN books b ON b.id = rl.book_id
             WHERE b.deleted = FALSE
             GROUP BY rl.date HAVING SUM(rl.pages_read) > 0
            """
        )
        rhythm = build_home_rhythm([{"date": r["day"], "value": int(r["pages"])} for r in all_days], today)

        finished_year = run_select(
            """
            SELECT COUNT(*) AS n FROM books b
             WHERE b.deleted = FALSE AND b.status <> 'abandonado'
               AND EXTRACT(YEAR FROM b.date_finished) = %(year)s
            """,
            {"year": today.year},
        )[0]["n"]

        last = run_select(
            """
            SELECT rl.book_id, b.title, rl.date, rl.page_end, rl.pages_read
              FROM reading_logs rl JOIN books b ON b.id = rl.book_id
             WHERE b.deleted = FALSE
             ORDER BY rl.date DESC, rl.created_at DESC LIMIT 1
            """
        )
        counts = {r["status"]: int(r["n"]) for r in run_select(
            "SELECT status, COUNT(*) AS n FROM books WHERE deleted = FALSE GROUP BY status"
        )}

        def _iso(rows: list[dict]) -> list[dict]:
            # Datas viram texto ISO para o JSON (o FastAPI não serializa `date` dentro de dict cru).
            return [{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows]

        return {
            "status": "ok",
            "favorites": _iso(favorites),
            "reading": _iso(reading),
            "recent_finished": _iso(recent_finished),
            "rating_histogram": hist,
            "finished_year": int(finished_year),
            "last_session": _iso(last)[0] if last else None,
            "counts": counts,
            **rhythm,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
