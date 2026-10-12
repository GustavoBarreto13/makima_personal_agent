"""Contexto que a Violet lê antes de aconselhar (spec 076) — leitura pura, sem IA.

Compartilhado pelo Conselho do Dia e pela Revisão semanal:
    - ``dias(since, until)``: o que foi escrito (bullets sem a sintaxe dos tokens, sonho,
      emoções, cartas) dia a dia;
    - ``conselhos(since, until)``: os conselhos do período com o resumo estruturado (digest) e
      o desfecho de cada ação (virou tarefa? foi concluída?);
    - ``kaguya()``: tarefas de hoje/atrasadas, hábitos (força e tendência) e metas ativas;
    - ``sinais(ref)``: números da semana contra a anterior (força, dias escritos, emoção, foco);
    - ``valores()``: o bloco da Avaliação dos Valores.

Tudo best-effort: um pedaço que falha vira vazio, nunca derruba a geração.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta

from agents.db import run_select
from agents.journal import markup

logger = logging.getLogger("kurisu.violet_context")


def _safe(fn, default):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001
        logger.warning("violet_context: %s", exc)
        return default


# ─── Diário ────────────────────────────────────────────────────────────────────

def dias(since: date, until: date) -> list[dict]:
    """Dias com conteúdo entre ``since`` e ``until`` (inclusive), em ordem cronológica."""
    params = {"a": since, "b": until}
    pages = run_select(
        "SELECT id, date, NULLIF(btrim(dream), '') AS dream FROM journal_pages WHERE type_id = 1 AND date BETWEEN %(a)s AND %(b)s ORDER BY date",
        params,
    )
    if not pages:
        return []
    ids = [p["id"] for p in pages]
    bullets = run_select(
        "SELECT page_id, kind, content, favorite FROM journal_bullets WHERE page_id = ANY(%(ids)s) AND btrim(content) <> '' ORDER BY position",
        {"ids": ids},
    )
    emotions = run_select(
        """SELECT l.page_id, e.name AS emotion, l.intensity, l.situation, l.automatic_thought,
                  l.adaptive_response, l.reappraised_intensity, l.distortions
           FROM journal_emotion_logs l JOIN journal_emotions e ON e.id = l.emotion_id
           WHERE l.page_id = ANY(%(ids)s) ORDER BY l.created_at""",
        {"ids": ids},
    )
    letters = run_select(
        "SELECT page_id, recipient, title, body, status FROM journal_letters WHERE page_id = ANY(%(ids)s) ORDER BY created_at",
        {"ids": ids},
    )
    out = []
    for p in pages:
        d = {
            "page_id": p["id"], "date": p["date"].isoformat(), "dream": p["dream"],
            "bullets": [{"kind": b["kind"], "content": markup.plain_text(b["content"]), "favorite": b["favorite"]}
                        for b in bullets if b["page_id"] == p["id"]],
            "emotion_logs": [dict(e) for e in emotions if e["page_id"] == p["id"]],
            "letters": [dict(l) for l in letters if l["page_id"] == p["id"]],
        }
        if d["bullets"] or d["dream"] or d["emotion_logs"] or d["letters"]:
            out.append(d)
    return out


def dia_vazio(dia: dict) -> bool:
    return not (dia.get("bullets") or dia.get("emotion_logs") or dia.get("letters") or dia.get("dream"))


def resumir_dia(dia: dict, max_letter: int = 600) -> str:
    """Texto compacto de um dia para os prompts."""
    partes = []
    if dia.get("dream"):
        partes.append(f"Sonho: {dia['dream']}")
    for b in dia.get("bullets", []):
        marca = " ★" if b.get("favorite") else ""
        partes.append(f"[{b['kind']}{marca}] {b['content']}")
    for e in dia.get("emotion_logs", []):
        linha = f"Emoção: {e['emotion']} ({e['intensity']}/10)"
        if e.get("situation"):
            linha += f" — situação: {e['situation']}"
        if e.get("automatic_thought"):
            linha += f" — pensamento: {e['automatic_thought']}"
        if e.get("adaptive_response"):
            linha += f" — resposta: {e['adaptive_response']}"
        if e.get("reappraised_intensity") is not None:
            linha += f" — depois: {e['reappraised_intensity']}/10"
        partes.append(linha)
    for l in dia.get("letters", []):
        partes.append(f"Carta para {l['recipient']}: {(l.get('body') or '')[:max_letter]}")
    return "\n".join(partes) if partes else "(sem conteúdo)"


# ─── Conselhos anteriores (com digest e desfecho) ─────────────────────────────

def _json(v, default):
    if v is None:
        return default
    return v if isinstance(v, (list, dict)) else json.loads(v)


def desfecho_tarefas(task_ids: list[int]) -> dict[int, str]:
    """Status atual das tarefas que nasceram de ações sugeridas."""
    if not task_ids:
        return {}
    return _safe(lambda: {r["id"]: r["st"] for r in run_select(
        """SELECT id, CASE WHEN completed_at IS NOT NULL THEN 'concluída'
                          WHEN deleted_at IS NOT NULL THEN 'apagada'
                          WHEN due_date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'atrasada'
                          ELSE 'pendente' END AS st
           FROM tasks WHERE id = ANY(%(ids)s)""", {"ids": task_ids})}, {})


def conselhos(since: date, until: date) -> list[dict]:
    """Conselhos do período (cronológico), com digest e desfecho das ações."""
    def run():
        rows = run_select(
            """SELECT p.date, c.mirror, c.actions_json,
                      CASE WHEN to_jsonb(c) ? 'digest_json' THEN to_jsonb(c)->'digest_json' END AS digest_json,
                      CASE WHEN to_jsonb(c) ? 'sources_json' THEN to_jsonb(c)->'sources_json' END AS sources_json
               FROM journal_counsel c JOIN journal_pages p ON p.id = c.page_id
               WHERE p.date BETWEEN %(a)s AND %(b)s ORDER BY p.date""",
            {"a": since, "b": until},
        )
        ids = [a["task_id"] for r in rows for a in _json(r["actions_json"], []) if a.get("task_id")]
        st = desfecho_tarefas(ids)
        out = []
        for r in rows:
            actions = _json(r["actions_json"], [])
            out.append({
                "date": r["date"].isoformat(), "mirror": r["mirror"],
                "digest": _json(r["digest_json"], {}) or {},
                "fontes": [s.get("uri") or s.get("fonte") for s in _json(r["sources_json"], []) or []],
                "actions": [{"texto": a.get("texto", ""),
                             "desfecho": st.get(a["task_id"], "tarefa sumiu") if a.get("task_id") else "não virou tarefa"}
                            for a in actions],
            })
        return out
    return _safe(run, [])


def bloco_conselhos(items: list[dict]) -> str:
    if not items:
        return "(nenhum conselho nos últimos dias)"
    linhas = []
    for c in items:
        d = c["digest"]
        linhas.append(f"### {c['date']}")
        if d.get("humor"):
            linhas.append(f"Humor: {d['humor']}")
        if d.get("observacoes"):
            linhas.append("Observações: " + "; ".join(d["observacoes"]))
        elif c.get("mirror"):
            linhas.append(f"Espelho: {c['mirror'][:400]}")
        if d.get("principios"):
            linhas.append("Princípios usados: " + "; ".join(d["principios"]))
        if d.get("cobrancas"):
            linhas.append("Cobranças feitas: " + "; ".join(d["cobrancas"]))
        if c["actions"]:
            linhas.append("Ações sugeridas: " + "; ".join(f"{a['texto']} ({a['desfecho']})" for a in c["actions"]))
    return "\n".join(linhas)


# ─── Kaguya ────────────────────────────────────────────────────────────────────

def kaguya() -> dict:
    """Tarefas de hoje/atrasadas, hábitos e metas ativas (leitura, best-effort)."""
    def tasks():
        from agents.kaguya.tools_tasks import list_tasks_today  # noqa: PLC0415
        hoje = list_tasks_today()
        return {"hoje": hoje.get("today") or [], "atrasadas": hoje.get("overdue") or []}

    def habits():
        from agents.kaguya.tools_habits import list_habits  # noqa: PLC0415
        return list_habits()

    def goals():
        from agents.kaguya.tools_goals import list_goals  # noqa: PLC0415
        return list_goals()

    return {"tasks": _safe(tasks, {"hoje": [], "atrasadas": []}), "habits": _safe(habits, []), "goals": _safe(goals, [])}


def bloco_kaguya(k: dict) -> str:
    linhas = []
    t = k.get("tasks") or {}
    if t.get("atrasadas"):
        linhas.append(f"Tarefas atrasadas ({len(t['atrasadas'])}): " + "; ".join(x.get("title", "") for x in t["atrasadas"][:8]))
    if t.get("hoje"):
        linhas.append(f"Tarefas de hoje ({len(t['hoje'])}): " + "; ".join(x.get("title", "") for x in t["hoje"][:8]))
    hs = k.get("habits") or []
    if hs:
        linhas.append("Hábitos (força 0–100, tendência, feito hoje?): " + "; ".join(
            f"{h.get('name')} {h.get('consistency')}% {h.get('trend')}{' ✓' if h.get('done_today') else ''}" for h in hs[:12]))
    gs = k.get("goals") or []
    if gs:
        linhas.append("Metas ativas: " + "; ".join(
            f"{g.get('title')} ({g.get('progress_pct')}%, {g.get('days_remaining')} dias restantes"
            + (", ATRASADA" if g.get("is_overdue") else "") + ")"
            + (f" — por quê: {g['why'][:120]}" if g.get("why") else "") for g in gs[:6]))
    return "\n".join(linhas) or "(nada relevante na Kaguya)"


# ─── Sinais objetivos ──────────────────────────────────────────────────────────

def sinais(ref: date) -> dict:
    """Números da semana que termina em ``ref`` contra a semana anterior."""
    from agents.journal import strength as S  # noqa: PLC0415

    a, b = ref - timedelta(days=6), ref
    pa, pb = ref - timedelta(days=13), ref - timedelta(days=7)

    def forca():
        feitas = S.written_dates(ref - timedelta(days=80), ref)
        agora = S.summarize(feitas, S.DEFAULT_WEEKLY_TARGET, ref, days=1)
        antes = S.summarize(feitas, S.DEFAULT_WEEKLY_TARGET, pb, days=1)
        return {"agora": agora["consistency"], "semana_passada": antes["consistency"], "tendencia": agora["trend"],
                "dias_escritos": sum(1 for d in feitas if a <= d <= b),
                "dias_escritos_antes": sum(1 for d in feitas if pa <= d <= pb)}

    def emocao(x, y):
        r = run_select(
            """SELECT ROUND(AVG(l.intensity)::numeric, 1) AS avg, COUNT(*) AS n FROM journal_emotion_logs l
               JOIN journal_pages p ON p.id = l.page_id WHERE p.date BETWEEN %(a)s AND %(b)s""", {"a": x, "b": y})[0]
        return {"media": float(r["avg"]) if r["avg"] is not None else None, "registros": int(r["n"])}

    def foco(x, y):
        r = run_select(
            """SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0) AS m FROM focus_sessions
               WHERE outcome = 'completed' AND (started_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s""",
            {"a": x, "b": y})[0]
        return int(r["m"] or 0)

    return {
        "forca": _safe(forca, {}),
        "emocao": {"semana": _safe(lambda: emocao(a, b), {}), "anterior": _safe(lambda: emocao(pa, pb), {})},
        "foco_min": {"semana": _safe(lambda: foco(a, b), None), "anterior": _safe(lambda: foco(pa, pb), None)},
    }


def bloco_sinais(s: dict) -> str:
    f = s.get("forca") or {}
    e = s.get("emocao") or {}
    fo = s.get("foco_min") or {}
    linhas = []
    if f:
        linhas.append(f"Força da escrita: {f.get('agora')}% (há uma semana: {f.get('semana_passada')}%, tendência {f.get('tendencia')}); "
                      f"dias escritos na semana: {f.get('dias_escritos')} (anterior: {f.get('dias_escritos_antes')})")
    if e:
        linhas.append(f"Intensidade emocional média: {e.get('semana', {}).get('media')} em {e.get('semana', {}).get('registros')} registros "
                      f"(anterior: {e.get('anterior', {}).get('media')} em {e.get('anterior', {}).get('registros')})")
    if fo.get("semana") is not None:
        linhas.append(f"Minutos de foco concluídos: {fo['semana']} (anterior: {fo.get('anterior')})")
    return "\n".join(linhas) or "(sem sinais)"


def valores() -> str:
    from agents.journal.values import values_context_for_counsel  # noqa: PLC0415
    return _safe(values_context_for_counsel, "") or "(a pessoa ainda não fez a Avaliação dos Valores)"


def padroes_emocionais(since: date, until: date) -> str:
    """Achados da camada 1 da análise emocional, em texto."""
    def run():
        from agents.journal.emotion_patterns import get_emotion_patterns  # noqa: PLC0415
        r = get_emotion_patterns(since.isoformat(), until.isoformat())
        return "\n".join(f"- {f['title']}: {f['detail']}" for f in r.get("findings", [])[:8])
    return _safe(run, "") or "(sem padrões emocionais relevantes no período)"


def compromissos_da_ultima_revisao(ref: date) -> str:
    """Compromissos que a última Revisão semanal exigiu (o conselho diário cobra o andamento)."""
    def run():
        rows = run_select(
            """SELECT week_start, actions_json FROM journal_weekly_reviews
               WHERE week_start <= %(r)s ORDER BY week_start DESC LIMIT 1""", {"r": ref})
        if not rows:
            return ""
        acts = _json(rows[0]["actions_json"], [])
        st = desfecho_tarefas([a["task_id"] for a in acts if a.get("task_id")])
        return "\n".join(
            f"- {a.get('texto')} ({st.get(a['task_id'], 'tarefa sumiu') if a.get('task_id') else 'não virou tarefa'})"
            for a in acts)
    return _safe(run, "") or "(nenhuma revisão semanal ainda)"
