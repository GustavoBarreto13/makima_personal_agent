"""Análise dos registros emocionais — camada 1, determinística (spec 076).

"O que está acontecendo" com os registros, sem IA e sem custo: achados com evidência
(os IDs dos registros que os sustentam), sempre visíveis na aba Registro emocional e
usados como contexto pelo Conselho, pela Revisão semanal e pela leitura da Violet (camada 2).

Dois níveis, como o resto do projeto:
    - ``analyze(...)``: PURO — recebe os registros e o contexto de cada dia, devolve os achados;
    - ``get_emotion_patterns(since, until)``: busca no banco e chama ``analyze``.

Regra de honestidade: só vira achado o que tem amostra mínima (``MIN_N``) e diferença
relevante (``MIN_DELTA`` pontos de intensidade). Sem dados → lista vazia, nunca invenção.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import mean, median
from zoneinfo import ZoneInfo

_TZ = ZoneInfo("America/Sao_Paulo")
MIN_N = 2          # mínimo de registros para um gatilho/padrão virar achado
MIN_DELTA = 1.0    # diferença mínima de intensidade média (0–10) para ser relevante
WEEKDAYS = ("segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo")
DISTORTIONS = {
    "catastrofizacao": "Catastrofização",
    "leitura_mental": "Leitura mental",
    "tudo_ou_nada": "Tudo-ou-nada",
    "personalizacao": "Personalização",
    "deveria": "Declarações do tipo \"deveria\"",
    "generalizacao": "Generalização excessiva",
    "filtro_mental": "Filtro mental",
    "desqualificar_positivo": "Desqualificar o positivo",
    "raciocinio_emocional": "Raciocínio emocional",
    "rotulacao": "Rotulação",
    "previsao_futuro": "Adivinhação do futuro",
    "minimizacao": "Magnificação/minimização",
}


def _hour_bucket(h: int) -> str:
    if 5 <= h < 12:
        return "manhã"
    if 12 <= h < 18:
        return "tarde"
    if 18 <= h < 24:
        return "noite"
    return "madrugada"


def _local_hour(created_at) -> int | None:
    if not created_at:
        return None
    dt = datetime.fromisoformat(created_at) if isinstance(created_at, str) else created_at
    if dt.tzinfo is None:
        return dt.hour
    return dt.astimezone(_TZ).hour


def _d(x) -> date:
    return x if isinstance(x, date) else date.fromisoformat(str(x)[:10])


def _avg(xs) -> float:
    xs = [x for x in xs if x is not None]
    return round(mean(xs), 1) if xs else 0.0


def _relief(log: dict) -> float | None:
    if log.get("reappraised_intensity") is None:
        return None
    return float(log["intensity"]) - float(log["reappraised_intensity"])


def summarize(logs: list[dict], until: date, days: int = 30) -> dict:
    """Números do topo da aba: total, média, alívio, emoções, série diária e horários."""
    by_day: dict[date, list[int]] = defaultdict(list)
    for log in logs:
        by_day[_d(log["date"])].append(int(log["intensity"]))
    start = until - timedelta(days=days - 1)
    series = []
    for i in range(days):
        d = start + timedelta(days=i)
        vals = by_day.get(d, [])
        series.append({"date": d.isoformat(), "value": _avg(vals) if vals else None, "count": len(vals)})
    emotions = Counter(log["emotion_name"] for log in logs)
    by_emotion = [
        {"name": name, "count": n, "avg_intensity": _avg(int(l["intensity"]) for l in logs if l["emotion_name"] == name)}
        for name, n in emotions.most_common()
    ]
    hours = Counter(_hour_bucket(h) for h in (_local_hour(l.get("created_at")) for l in logs) if h is not None)
    reliefs = [r for r in (_relief(l) for l in logs) if r is not None]
    return {
        "total": len(logs),
        "avg_intensity": _avg(int(l["intensity"]) for l in logs),
        "avg_relief": _avg(reliefs) if reliefs else None,
        "reappraised": len(reliefs),
        "top_emotion": by_emotion[0]["name"] if by_emotion else None,
        "by_emotion": by_emotion,
        "series": series,
        "by_hour": [{"bucket": b, "count": hours.get(b, 0)} for b in ("manhã", "tarde", "noite", "madrugada")],
    }


def analyze(
    logs: list[dict],
    day_context: dict[date, dict] | None = None,
    previous_logs: list[dict] | None = None,
) -> list[dict]:
    """Achados determinísticos sobre os registros do período.

    Args:
        logs: Registros do período (``id, date, created_at, emotion_name, intensity,
            reappraised_intensity, adaptive_response, automatic_thought, distortions``).
        day_context: Por dia: ``{"people": {nome}, "tags": {tag}, "refs": {rótulo},
            "words": int, "habits_done": int, "focus_min": int}``.
        previous_logs: Registros do período anterior, do mesmo tamanho (para "Mudanças").

    Returns:
        ``[{"id", "kind", "title", "detail", "severity": "alta"|"media"|"baixa", "evidence": [ids],
        "metric"?}]`` — os mais relevantes primeiro.
    """
    if not logs:
        return []
    ctx = day_context or {}
    overall = mean(int(l["intensity"]) for l in logs)
    findings: list[dict] = []

    # ── 1. Gatilhos recorrentes: pessoas, tags e referências presentes nos dias dos registros ──
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for log in logs:
        c = ctx.get(_d(log["date"]), {})
        for kind, label in ([("pessoa", p) for p in c.get("people", ())]
                            + [("tag", t) for t in c.get("tags", ())]
                            + [("referência", r) for r in c.get("refs", ())]):
            groups[(kind, label)].append(log)
    triggers = []
    for (kind, label), ls in groups.items():
        if len(ls) < MIN_N or len(ls) == len(logs):
            continue
        avg = mean(int(l["intensity"]) for l in ls)
        if avg - overall >= MIN_DELTA:
            triggers.append((avg - overall, kind, label, ls, avg))
    for delta, kind, label, ls, avg in sorted(triggers, key=lambda t: -t[0])[:4]:
        prefix = "@" if kind == "pessoa" else "#" if kind == "tag" else ""
        findings.append({
            "id": f"trigger:{kind}:{label}", "kind": "trigger",
            "title": f"Quando {prefix}{label} aparece, a carga sobe",
            "detail": (f"Nos dias com {prefix}{label}, a intensidade média é {avg:.1f}, contra {overall:.1f} "
                       f"no geral ({len(ls)} registros)."),
            "severity": "alta" if delta >= 2 else "media", "evidence": [l["id"] for l in ls],
            "metric": {"avg": round(avg, 1), "overall": round(overall, 1), "n": len(ls)},
        })

    # ── 2. Quando acontece: dia da semana e faixa do dia ──
    for name, keyf in (
        ("weekday", lambda l: WEEKDAYS[_d(l["date"]).weekday()]),
        ("hour", lambda l: _hour_bucket(h) if (h := _local_hour(l.get("created_at"))) is not None else None),
    ):
        buckets: dict[str, list[dict]] = defaultdict(list)
        for log in logs:
            k = keyf(log)
            if k:
                buckets[k].append(log)
        best = None
        for k, ls in buckets.items():
            if len(ls) < MIN_N or len(buckets) < 2:
                continue
            avg = mean(int(l["intensity"]) for l in ls)
            share = len(ls) / len(logs)
            score = (avg - overall) + (share - 1 / max(len(buckets), 1)) * 4
            if (avg - overall >= MIN_DELTA or share >= 0.45) and (best is None or score > best[0]):
                best = (score, k, ls, avg, share)
        if best:
            _, k, ls, avg, share = best
            when = f"às {k}s" if name == "weekday" and not k.endswith("o") else (f"aos {k}s" if name == "weekday" else f"de {k}")
            findings.append({
                "id": f"when:{name}:{k}", "kind": "when",
                "title": f"A carga se concentra {when}",
                "detail": f"{len(ls)} de {len(logs)} registros ({share:.0%}), intensidade média {avg:.1f}.",
                "severity": "media", "evidence": [l["id"] for l in ls],
                "metric": {"bucket": k, "share": round(share, 2), "avg": round(avg, 1)},
            })

    # ── 3. Tendência por emoção: últimos 14 dias vs. antes ──
    last = max(_d(l["date"]) for l in logs)
    cut = last - timedelta(days=13)
    for emotion in {l["emotion_name"] for l in logs}:
        ls = [l for l in logs if l["emotion_name"] == emotion]
        recent = [int(l["intensity"]) for l in ls if _d(l["date"]) >= cut]
        older = [int(l["intensity"]) for l in ls if _d(l["date"]) < cut]
        if len(recent) >= MIN_N and len(older) >= MIN_N:
            delta = mean(recent) - mean(older)
            freq_up = len(recent) > len(older)
            if abs(delta) >= MIN_DELTA:
                up = delta > 0
                findings.append({
                    "id": f"trend:{emotion}", "kind": "trend",
                    "title": f"{emotion.capitalize()} {'está subindo' if up else 'está cedendo'}",
                    "detail": (f"Intensidade média de {mean(older):.1f} para {mean(recent):.1f} nas últimas duas "
                               f"semanas{' — e aparecendo mais vezes' if freq_up and up else ''}."),
                    "severity": "alta" if up and delta >= 2 else "media" if up else "baixa",
                    "evidence": [l["id"] for l in ls if _d(l["date"]) >= cut],
                    "metric": {"before": round(mean(older), 1), "after": round(mean(recent), 1)},
                })

    # ── 4. Eficácia da reavaliação e o custo de não fazê-la ──
    with_resp = [l for l in logs if (l.get("adaptive_response") or "").strip() and l.get("reappraised_intensity") is not None]
    without = [l for l in logs if not (l.get("adaptive_response") or "").strip()]
    if with_resp:
        relief = mean(_relief(l) for l in with_resp)
        by_emo = defaultdict(list)
        for l in with_resp:
            by_emo[l["emotion_name"]].append(_relief(l))
        weakest = min(((e, mean(v)) for e, v in by_emo.items() if len(v) >= MIN_N), key=lambda t: t[1], default=None)
        detail = f"Quando você responde ao pensamento, a intensidade cai em média {relief:.1f} pontos ({len(with_resp)} registros)."
        if weakest and weakest[1] < relief - 0.5:
            detail += f" Funciona menos com {weakest[0]} (alívio de {weakest[1]:.1f})."
        findings.append({
            "id": "reappraisal:effect", "kind": "reappraisal", "title": "A reavaliação funciona" if relief >= 1.5 else "A reavaliação está rendendo pouco",
            "detail": detail, "severity": "baixa" if relief >= 1.5 else "media",
            "evidence": [l["id"] for l in with_resp], "metric": {"avg_relief": round(relief, 1)},
        })
    heavy_without = [l for l in without if int(l["intensity"]) >= 7]
    if len(heavy_without) >= MIN_N:
        findings.append({
            "id": "reappraisal:missing", "kind": "reappraisal",
            "title": "Registros pesados ficam sem resposta",
            "detail": (f"{len(heavy_without)} registros com intensidade 7+ não têm resposta adaptativa — "
                       "é exatamente onde ela mais rende."),
            "severity": "alta", "evidence": [l["id"] for l in heavy_without],
        })

    # ── 5. Distorções mais frequentes ──
    dist = Counter(d for l in logs for d in (l.get("distortions") or []))
    if dist:
        (top, n), *_ = dist.most_common(1)
        if n >= MIN_N:
            findings.append({
                "id": f"distortion:{top}", "kind": "distortion",
                "title": f"Padrão de pensamento mais comum: {DISTORTIONS.get(top, top)}",
                "detail": f"Aparece em {n} dos {len(logs)} registros.",
                "severity": "media", "evidence": [l["id"] for l in logs if top in (l.get("distortions") or [])],
                "metric": {"counts": dict(dist.most_common(5))},
            })

    # ── 6. Ligação com o resto da vida: escrita, hábitos e foco no mesmo dia ──
    for key, label_hi, label_lo in (
        ("habits_done", "dias com hábitos feitos", "dias sem"),
        ("focus_min", "dias com foco", "dias sem foco"),
        ("words", "dias em que você escreveu", "dias sem escrita"),
    ):
        vals = [(ctx.get(_d(l["date"]), {}).get(key) or 0, int(l["intensity"]), l) for l in logs]
        hi = [v for v in vals if v[0] > 0]
        lo = [v for v in vals if v[0] == 0]
        if len(hi) >= MIN_N and len(lo) >= MIN_N:
            a, b = mean(v[1] for v in hi), mean(v[1] for v in lo)
            if abs(a - b) >= MIN_DELTA:
                better = a < b
                findings.append({
                    "id": f"life:{key}", "kind": "life",
                    "title": f"Nos {label_hi}, a intensidade é {'menor' if better else 'maior'}",
                    "detail": f"{a:.1f} nos {label_hi} contra {b:.1f} nos {label_lo}.",
                    "severity": "media" if better else "alta",
                    "evidence": [v[2]["id"] for v in (hi if not better else lo)],
                    "metric": {"with": round(a, 1), "without": round(b, 1)},
                })

    # ── 7. Mudanças contra o período anterior ──
    if previous_logs:
        now_c = Counter(l["emotion_name"] for l in logs)
        prev_c = Counter(l["emotion_name"] for l in previous_logs)
        appeared = [e for e in now_c if e not in prev_c and now_c[e] >= MIN_N]
        gone = [e for e in prev_c if e not in now_c and prev_c[e] >= MIN_N]
        prev_avg = mean(int(l["intensity"]) for l in previous_logs)
        delta = overall - prev_avg
        parts = []
        if abs(delta) >= 0.5:
            parts.append(f"intensidade média {'subiu' if delta > 0 else 'caiu'} de {prev_avg:.1f} para {overall:.1f}")
        if appeared:
            parts.append("surgiram: " + ", ".join(appeared))
        if gone:
            parts.append("sumiram: " + ", ".join(gone))
        if parts:
            findings.append({
                "id": "change:period", "kind": "change", "title": "Comparado ao período anterior",
                "detail": "; ".join(parts).capitalize() + ".",
                "severity": "alta" if delta >= MIN_DELTA else "baixa", "evidence": [],
                "metric": {"before": round(prev_avg, 1), "after": round(overall, 1)},
            })

    rank = {"alta": 0, "media": 1, "baixa": 2}
    return sorted(findings, key=lambda f: rank[f["severity"]])


# ─── Banco ───────────────────────────────────────────────────────────────────

def _day_context(since: date, until: date) -> dict[date, dict]:
    from agents.db import run_select  # noqa: PLC0415

    ctx: dict[date, dict] = defaultdict(lambda: {"people": set(), "tags": set(), "refs": set(), "words": 0,
                                                 "habits_done": 0, "focus_min": 0})
    params = {"a": since, "b": until}
    for r in run_select(
        """SELECT p.date, m.kind, m.value FROM journal_mentions m
           JOIN journal_bullets b ON b.id = m.bullet_id JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s""", params):
        ctx[r["date"]]["people" if r["kind"] == "person" else "tags"].add(r["value"])
    for r in run_select(
        """SELECT p.date, r.label FROM journal_refs r
           JOIN journal_bullets b ON b.id = r.bullet_id JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s""", params):
        ctx[r["date"]]["refs"].add(r["label"])
    for r in run_select(
        """SELECT p.date, b.content FROM journal_bullets b JOIN journal_pages p ON p.id = b.page_id
           WHERE p.date BETWEEN %(a)s AND %(b)s AND btrim(b.content) <> ''""", params):
        from agents.journal.markup import word_count  # noqa: PLC0415
        ctx[r["date"]]["words"] += word_count(r["content"])
    # Kaguya (best-effort): hábitos feitos e minutos de foco no dia.
    try:
        for r in run_select(
            "SELECT date, COUNT(DISTINCT habit_id) AS n FROM habit_checkins WHERE date BETWEEN %(a)s AND %(b)s GROUP BY date",
            params):
            ctx[r["date"]]["habits_done"] = int(r["n"])
    except Exception:  # noqa: BLE001
        pass
    try:
        for r in run_select(
            """SELECT (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS date,
                      COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0) AS m
               FROM focus_sessions
               WHERE outcome = 'completed' AND ended_at IS NOT NULL
                 AND (started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s
               GROUP BY 1""", params):
            ctx[r["date"]]["focus_min"] = int(r["m"] or 0)
    except Exception:  # noqa: BLE001
        pass
    return dict(ctx)


def get_emotion_patterns(since: str | None = None, until: str | None = None) -> dict:
    """Camada 1 da análise para um período (padrão: últimos 30 dias até hoje).

    Returns:
        ``{"status": "ok", "since", "until", "summary": {...}, "findings": [...]}``.
    """
    from agents.journal.tools import _today_sp, list_all_emotion_logs  # noqa: PLC0415

    b = date.fromisoformat(until) if until else _today_sp()
    a = date.fromisoformat(since) if since else b - timedelta(days=29)
    span = (b - a).days + 1
    logs = list_all_emotion_logs(since=a.isoformat(), until=b.isoformat(), limit=1000)
    prev = list_all_emotion_logs(since=(a - timedelta(days=span)).isoformat(),
                                 until=(a - timedelta(days=1)).isoformat(), limit=1000)
    ctx = _day_context(a, b) if logs else {}
    return {
        "status": "ok", "since": a.isoformat(), "until": b.isoformat(),
        "summary": summarize(logs, b, days=min(span, 90)),
        "findings": analyze(logs, ctx, prev),
    }
