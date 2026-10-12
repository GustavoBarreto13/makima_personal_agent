"""Insights da Violet no contrato ``StatsPayload`` do Design System (spec 076).

Só o webapp consome (``GET /api/journal/stats?year=&month=``). Métricas mínimas do domínio
(``conformance.json → statsRequired.violet``): dias, palavras, força, horários no fuso local,
emoções × intensidade, pessoas/tags mais citadas e taxa de destaque.

Regras (webapp/docs/DESIGN_SYSTEM.md):
    - datas no fuso de São Paulo; "hoje" vem de ``_today_sp`` (nunca do relógio do servidor);
    - "dia escrito" = dia com palavra em bullet ou sonho (``strength.written_dates``);
    - palavras contadas sem a sintaxe dos tokens (``markup.word_count``);
    - métricas "do período" filtram pelo período (nada de total histórico num tile anual).

Usage:
    from agents.journal.tools_stats import get_stats_payload
"""

from __future__ import annotations

from calendar import monthrange
from collections import Counter, defaultdict
from datetime import date, timedelta

from agents.db import run_select
from agents.journal import markup, strength

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]
DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
_AGENT_LABEL = {"kaguya": "Kaguya", "akane": "Akane", "frieren": "Frieren", "marin": "Marin", "mai": "Mai", "yato": "Yato"}


def period_bounds(year: int, month: int | None, today: date) -> tuple[date, date, date, date]:
    """Período pedido e o mesmo trecho do ano anterior (mesma regra da Frieren/Akane)."""
    def last(y: int, m: int) -> date:
        return date(y, m, monthrange(y, m)[1])
    if month:
        return date(year, month, 1), last(year, month), date(year - 1, month, 1), last(year - 1, month)
    if year == today.year:
        prev_end = date(year - 1, today.month, min(today.day, monthrange(year - 1, today.month)[1]))
        return date(year, 1, 1), today, date(year - 1, 1, 1), prev_end
    return date(year, 1, 1), date(year, 12, 31), date(year - 1, 1, 1), date(year - 1, 12, 31)


def _words_by_day(a: date, b: date) -> dict[date, int]:
    rows = run_select(
        """
        SELECT p.date, b.content, NULL AS dream FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
        WHERE p.type_id = 1 AND p.date BETWEEN %(a)s AND %(b)s AND btrim(b.content) <> ''
        UNION ALL
        SELECT p.date, NULL, p.dream FROM journal_pages p
        WHERE p.type_id = 1 AND p.date BETWEEN %(a)s AND %(b)s AND NULLIF(btrim(p.dream), '') IS NOT NULL
        """,
        {"a": a, "b": b},
    )
    out: dict[date, int] = defaultdict(int)
    for r in rows:
        out[r["date"]] += markup.word_count(r["content"] or r["dream"] or "")
    return {d: w for d, w in out.items() if w > 0}


def _kpis_for(a: date, b: date) -> dict:
    words = _words_by_day(a, b)
    hl = run_select(
        """SELECT COUNT(DISTINCT p.date) AS n FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s AND b.kind = 'highlight' AND btrim(b.content) <> ''""",
        {"a": a, "b": b},
    )[0]["n"]
    emo = run_select(
        """SELECT COUNT(*) AS n, AVG(l.intensity) AS avg FROM journal_emotion_logs l JOIN journal_pages p ON p.id = l.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s""",
        {"a": a, "b": b},
    )[0]
    letters = run_select(
        """SELECT COUNT(*) AS n FROM journal_letters l JOIN journal_pages p ON p.id = l.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s""",
        {"a": a, "b": b},
    )[0]["n"]
    days = len(words)
    total = sum(words.values())
    return {
        "days": days, "words": total, "per_day": round(total / days) if days else 0,
        "highlight_rate": round(int(hl) / days * 100) if days else 0,
        "emotion_logs": int(emo["n"] or 0), "emotion_avg": round(float(emo["avg"]), 1) if emo["avg"] is not None else 0,
        "letters": int(letters or 0), "_words": words,
    }


def get_stats_payload(year: int, month: int | None = None, weekly_target: float = strength.DEFAULT_WEEKLY_TARGET) -> dict:
    """Insights da Violet no contrato StatsPayload (+ ``strength`` e ``emotions`` para os blocos próprios)."""
    from agents.journal.tools import _today_sp  # noqa: PLC0415

    today = _today_sp()
    a, b, pa, pb = period_bounds(year, month, today)
    cur, prev = _kpis_for(a, b), _kpis_for(pa, pb)
    has_prev = prev["days"] > 0

    # Força no fim do período (para o ano corrente, hoje) — o mesmo motor dos hábitos.
    st = strength.get_writing_strength(weekly_target, today=min(b, today))
    st_prev = strength.summarize(
        strength.written_dates(pb - timedelta(days=61), pb), max(1.0, min(float(weekly_target), 7.0)), pb, days=1,
    )

    def kpi(key, label, value, prev_value=None, unit=None, decimals=None, absolute=False):
        k = {"key": key, "label": label, "value": value, "prev": prev_value if has_prev else None}
        if unit:
            k["unit"] = unit
        if decimals is not None:
            k["decimals"] = decimals
        if absolute:
            k["absoluteDelta"] = True
        return k

    kpis = [
        kpi("strength", "Força da escrita", st["consistency"], st_prev["consistency"], unit="%", absolute=True),
        kpi("days", "Dias escritos", cur["days"], prev["days"]),
        kpi("words", "Palavras", cur["words"], prev["words"]),
        kpi("per_day", "Palavras por dia escrito", cur["per_day"], prev["per_day"]),
        kpi("highlight_rate", "Dias com destaque", cur["highlight_rate"], prev["highlight_rate"], unit="%", absolute=True),
        kpi("emotion_avg", "Intensidade emocional média", cur["emotion_avg"], prev["emotion_avg"], decimals=1, absolute=True),
        kpi("emotion_logs", "Registros emocionais", cur["emotion_logs"], prev["emotion_logs"]),
        kpi("letters", "Cartas", cur["letters"], prev["letters"]),
    ]

    words = cur["_words"]
    daily = [{"date": d.isoformat(), "value": w} for d, w in sorted(words.items())]
    monthly_acc: dict[int, int] = defaultdict(int)
    for d, w in words.items():
        monthly_acc[d.month] += w
    monthly = [{"month": m, "value": monthly_acc.get(m, 0)} for m in range(1, 13)]

    params = {"a": a, "b": b}
    hours = run_select(
        """SELECT FLOOR(EXTRACT(HOUR FROM b.created_at AT TIME ZONE 'America/Sao_Paulo') / 2)::int AS h, COUNT(*) AS n
           FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s AND btrim(b.content) <> '' GROUP BY 1""",
        params,
    )
    hmap = {int(r["h"]): int(r["n"]) for r in hours}
    distribution = [{"bucket": f"{h * 2}h", "count": hmap.get(h, 0)} for h in range(12)]

    people = run_select(
        """SELECT MODE() WITHIN GROUP (ORDER BY m.value) AS label, COUNT(DISTINCT b.id) AS n
           FROM journal_mentions m JOIN journal_bullets b ON b.id = m.bullet_id JOIN journal_pages p ON p.id = b.page_id
           WHERE m.kind = 'person' AND p.date BETWEEN %(a)s AND %(b)s
           GROUP BY COALESCE(m.person_id, lower(m.value)) ORDER BY n DESC LIMIT 10""",
        params,
    )
    tags = run_select(
        """SELECT m.value AS label, COUNT(DISTINCT b.id) AS n
           FROM journal_mentions m JOIN journal_bullets b ON b.id = m.bullet_id JOIN journal_pages p ON p.id = b.page_id
           WHERE m.kind = 'tag' AND p.date BETWEEN %(a)s AND %(b)s GROUP BY m.value ORDER BY n DESC LIMIT 10""",
        params,
    )
    refs = run_select(
        """SELECT r.agent, MODE() WITHIN GROUP (ORDER BY r.label) AS label, COUNT(*) AS n
           FROM journal_refs r JOIN journal_bullets b ON b.id = r.bullet_id JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s GROUP BY r.agent, r.entity_type, r.entity_id ORDER BY n DESC LIMIT 10""",
        params,
    )
    emotions = run_select(
        """SELECT e.name AS label, COUNT(*) AS n, ROUND(AVG(l.intensity)::numeric, 1) AS avg,
                  ROUND(AVG(l.intensity - l.reappraised_intensity)::numeric, 1) AS relief
           FROM journal_emotion_logs l JOIN journal_emotions e ON e.id = l.emotion_id JOIN journal_pages p ON p.id = l.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s GROUP BY e.name ORDER BY n DESC""",
        params,
    )
    emo_month = run_select(
        """SELECT EXTRACT(MONTH FROM p.date)::int AS m, ROUND(AVG(l.intensity)::numeric, 1) AS avg, COUNT(*) AS n
           FROM journal_emotion_logs l JOIN journal_pages p ON p.id = l.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s GROUP BY 1""",
        params,
    )
    rankings = {
        "people": {"title": "Pessoas mais citadas", "items": [{"label": "@" + r["label"], "count": int(r["n"])} for r in people]},
        "tags": {"title": "Tags", "items": [{"label": "#" + r["label"], "count": int(r["n"])} for r in tags]},
        "emotions": {"title": "Emoções registradas", "items": [{"label": r["label"], "count": int(r["n"])} for r in emotions]},
        "refs": {"title": "O que entrou no diário",
                 "items": [{"label": f"{r['label']} · {_AGENT_LABEL.get(r['agent'], r['agent'])}", "count": int(r["n"])} for r in refs]},
    }

    records = []
    if words:
        top_day, top_w = max(words.items(), key=lambda kv: kv[1])
        records.append({"label": "Dia mais escrito", "value": f"{top_w} palavras", "detail": f"{top_day:%d/%m/%Y}"})
        best_m = max(monthly, key=lambda m: m["value"])
        if best_m["value"]:
            records.append({"label": "Mês mais escrito", "value": MESES[best_m["month"] - 1], "detail": f"{best_m['value']} palavras"})
        wd = Counter(d.weekday() for d in words)
        records.append({"label": "Dia da semana em que você mais escreve", "value": DIAS[wd.most_common(1)[0][0]]})
    if st["best"]:
        records.append({"label": "Força mais alta (90 dias)", "value": f"{st['best']}%"})
    if emotions:
        strongest = max(emotions, key=lambda r: float(r["avg"] or 0))
        records.append({"label": "Emoção mais intensa", "value": strongest["label"], "detail": f"média {strongest['avg']}"})

    moments_rows = run_select(
        """SELECT b.id, b.content, b.kind, p.date FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s AND btrim(b.content) <> '' AND (b.favorite OR b.kind = 'highlight')
           ORDER BY b.favorite DESC, p.date DESC LIMIT 12""",
        params,
    )
    moments = [{"id": r["id"], "title": markup.plain_text(r["content"])[:140], "subtitle": f"{r['date']:%d/%m/%Y}", "date": r["date"].isoformat()}
               for r in moments_rows]

    label = f"{MESES[month - 1]} de {year}" if month else str(year)
    prev_label = f"{MESES[month - 1]} de {year - 1}" if month else str(year - 1)
    return {
        "period": {"year": year, "month": month, "label": label},
        "previous": {"label": prev_label} if has_prev else None,
        "kpis": kpis, "daily": daily, "monthly": monthly, "monthlyUnit": "palavras",
        "distribution": distribution, "rankings": rankings, "records": records, "moments": moments,
        # Blocos próprios da Violet (fora do contrato base, lidos pela tela de Insights):
        "strength": {k: st[k] for k in ("consistency", "trend", "recent_done", "recent_total", "weekly_target", "best", "series")},
        "emotions": {
            "by_emotion": [{"name": r["label"], "count": int(r["n"]), "avg_intensity": float(r["avg"] or 0),
                            "avg_relief": float(r["relief"]) if r["relief"] is not None else None} for r in emotions],
            "by_month": [{"month": int(r["m"]), "avg": float(r["avg"]), "count": int(r["n"])} for r in emo_month],
        },
    }
