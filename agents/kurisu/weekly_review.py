"""Revisão semanal do diário — domingo à noite, pelo Hermes (spec 076).

Persona Violet, conhecimento da Kurisu (mesmo desenho do Conselho do Dia). Lê a semana inteira
(segunda a domingo, America/Sao_Paulo): o diário, os conselhos da semana com o desfecho das ações,
os sinais objetivos (força da escrita, emoção, foco), Kaguya (hábitos, metas, tarefas atrasadas),
os valores declarados, os padrões emocionais e a revisão da semana anterior — e escreve um
balanço franco: "tapa na cara" ou "guia para continuar", conforme a evidência.

Estrutura do texto (Markdown):
    Veredito · Onde você foi bem · Onde você piorou/se sabotou · Comparado com a semana passada ·
    Padrões · O que a sua base diz sobre isso ([N]) · Para esta semana (3–5 compromissos)

Uma linha por semana em ``journal_weekly_reviews`` (``week_start`` = segunda). O job
``violet_weekly_review`` do scheduler gera e envia (idempotente por semana).

Usage:
    from agents.kurisu.weekly_review import gerar_revisao_semanal
    gerar_revisao_semanal("2026-10-11")   # qualquer data da semana
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

from webapp.backend.config import DATABASE_URL as _DATABASE_URL
from agents.kurisu import violet_ai as AI
from agents.kurisu import violet_context as CTX
from agents.kurisu.models import VIOLET_MODEL

logger = logging.getLogger("kurisu.weekly_review")


def _get_conn():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg2.connect(_DATABASE_URL)


def _ensure_tables() -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_weekly_reviews (
                    id           SERIAL PRIMARY KEY,
                    week_start   DATE NOT NULL UNIQUE,
                    verdict      TEXT,
                    tone         TEXT,
                    essay_md     TEXT NOT NULL,
                    digest_json  JSONB NOT NULL DEFAULT '{}',
                    sources_json JSONB NOT NULL DEFAULT '[]',
                    actions_json JSONB NOT NULL DEFAULT '[]',
                    metrics_json JSONB NOT NULL DEFAULT '{}',
                    sent_at      TIMESTAMPTZ,
                    model        TEXT,
                    tokens_in    INT,
                    tokens_out   INT,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
        conn.commit()
    finally:
        conn.close()


# ─── Puros ─────────────────────────────────────────────────────────────────────

def week_bounds(any_day: date) -> tuple[date, date]:
    """Segunda e domingo da semana de ``any_day``."""
    start = any_day - timedelta(days=any_day.weekday())
    return start, start + timedelta(days=6)


def last_closed_week(today: date) -> tuple[date, date]:
    """A semana a revisar: a corrente se hoje é domingo (a revisão sai domingo à noite);
    senão, a última semana já fechada."""
    if today.weekday() == 6:
        return week_bounds(today)
    return week_bounds(today - timedelta(days=today.weekday() + 1))


def resumo_chat(review: dict, link: str | None) -> str:
    """Versão condensada para o chat, em HTML simples (padrão de ``scheduler/notify_channels``):
    veredito, o que foi bem/piorou em uma linha cada, compromissos e o link da versão completa."""
    from html import escape  # noqa: PLC0415

    ws = review["week_start"]
    linhas = [f"📓 <b>Revisão da semana</b> — {ws[8:10]}/{ws[5:7]}"]
    if review.get("verdict"):
        linhas += ["", f"<b>{escape(review['verdict'])}</b>"]
    digest = review.get("digest") or {}
    if digest.get("foi_bem"):
        linhas += ["", "✅ " + escape(digest["foi_bem"][0])]
    if digest.get("piorou"):
        linhas += ["⚠️ " + escape(digest["piorou"][0])]
    if review.get("actions"):
        linhas += ["", "<b>Para esta semana:</b>"] + [f"• {escape(a['texto'])}" for a in review["actions"]]
    if link:
        linhas += ["", f"Leia inteira: {link}"]
    return "\n".join(linhas)


def _json(v, default):
    if v is None:
        return default
    return v if isinstance(v, (list, dict)) else json.loads(v)


def _serialize(row: dict) -> dict:
    return {
        "id": row["id"], "week_start": row["week_start"].isoformat(),
        "week_end": (row["week_start"] + timedelta(days=6)).isoformat(),
        "verdict": row.get("verdict"), "tone": row.get("tone"), "essay_md": row["essay_md"],
        "digest": _json(row.get("digest_json"), {}), "sources": _json(row.get("sources_json"), []),
        "actions": _json(row.get("actions_json"), []), "metrics": _json(row.get("metrics_json"), {}),
        "sent_at": row["sent_at"].isoformat() if row.get("sent_at") else None,
        "tokens_in": row.get("tokens_in"), "tokens_out": row.get("tokens_out"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ─── IA ────────────────────────────────────────────────────────────────────────

_TEMAS_SCHEMA = {"type": "OBJECT", "properties": {"queries": {"type": "ARRAY", "items": {"type": "STRING"}}},
                 "required": ["queries"]}

_REVISAO_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "verdict": {"type": "STRING"},
        "tone": {"type": "STRING", "enum": ["tapa_na_cara", "guia"]},
        "essay_md": {"type": "STRING"},
        "foi_bem": {"type": "ARRAY", "items": {"type": "STRING"}},
        "piorou": {"type": "ARRAY", "items": {"type": "STRING"}},
        "padroes": {"type": "ARRAY", "items": {"type": "STRING"}},
        "actions": {
            "type": "ARRAY",
            "items": {"type": "OBJECT", "properties": {"texto": {"type": "STRING"}, "motivo": {"type": "STRING"}},
                      "required": ["texto", "motivo"]},
        },
    },
    "required": ["verdict", "tone", "essay_md", "foi_bem", "piorou", "padroes", "actions"],
}


def _contexto(a: date, b: date) -> tuple[str, dict]:
    dias = CTX.dias(a, b)
    conselhos = CTX.conselhos(a, b)
    sinais = CTX.sinais(b)
    anterior = get_revisao_semanal((a - timedelta(days=1)).isoformat())
    if anterior:
        prev_acts = CTX.desfecho_tarefas([x["task_id"] for x in anterior["actions"] if x.get("task_id")])
        bloco_anterior = (
            f"Veredito: {anterior.get('verdict')}\nCompromissos exigidos:\n" + "\n".join(
                f"- {x['texto']} ({prev_acts.get(x['task_id'], 'tarefa sumiu') if x.get('task_id') else 'não virou tarefa'})"
                for x in anterior["actions"])
            + f"\nNúmeros: {json.dumps(anterior.get('metrics') or {}, ensure_ascii=False)}"
        )
    else:
        bloco_anterior = "(primeira revisão — não há semana anterior para comparar)"
    diario = "\n\n".join(f"### {d['date']}\n{CTX.resumir_dia(d, 400)}" for d in dias) or "(nada escrito nesta semana)"
    texto = f"""SEMANA: {a:%d/%m} a {b:%d/%m/%Y}

DIÁRIO DA SEMANA:
{diario}

CONSELHOS DA SEMANA (digest + desfecho das ações):
{CTX.bloco_conselhos(conselhos)}

REVISÃO DA SEMANA ANTERIOR:
{bloco_anterior}

SINAIS OBJETIVOS (esta semana vs. anterior):
{CTX.bloco_sinais(sinais)}

KAGUYA (tarefas, hábitos, metas — estado atual):
{CTX.bloco_kaguya(CTX.kaguya())}

VALORES DECLARADOS:
{CTX.valores()}

PADRÕES EMOCIONAIS DA SEMANA (calculados):
{CTX.padroes_emocionais(a, b)}"""
    citadas = {u for c in conselhos for u in (c.get("fontes") or []) if u}
    return texto, {"dias": len(dias), "conselhos": len(conselhos), "sinais": sinais, "citadas": citadas}


def gerar_revisao_semanal(week: Optional[str] = None) -> dict:
    """Gerar (ou regerar) a revisão de uma semana (qualquer data dela; default: a última fechada).

    Returns:
        ``{"status": "ok", "review": {...}}`` ou ``{"status": "error", "message"}``.
    """
    from agents.journal.tools import _today_sp  # noqa: PLC0415

    a, b = week_bounds(date.fromisoformat(week)) if week else last_closed_week(_today_sp())
    usage = AI.novo_usage()
    contexto, meta = _contexto(a, b)
    if meta["dias"] == 0 and meta["conselhos"] == 0:
        # Semana sem escrita também merece revisão — mas sem inventar: ela fala do silêncio.
        logger.info("weekly_review: semana %s sem escrita", a)

    try:
        temas = AI.gemini_json(
            f"""Leia a semana abaixo e devolva de 6 a 8 buscas curtas (conceitos, em português) para uma base de
conhecimento pessoal — sobre os problemas, padrões e metas em jogo nesta semana.

{contexto[:12000]}

Responda SOMENTE no JSON pedido.""", _TEMAS_SCHEMA, usage)
        trechos = AI.recuperar_amplo(temas.get("queries") or [], meta["citadas"])
        escrito = AI.gemini_json(f"""{AI.TOM_VIOLET}

Escreva a REVISÃO DA SEMANA em Markdown (900 a 1.400 palavras). É lida domingo à noite para começar a
semana: se a semana foi ruim e a evidência mostra autossabotagem, é um tapa na cara (tone = "tapa_na_cara");
se foi boa, é um guia firme para continuar (tone = "guia"). Decida pela evidência, não pelo humor.

Use estes títulos ##:
## Veredito
(uma ou duas frases secas — também vão em `verdict`)
## Onde você foi bem
(com evidência: dias, números, atitudes)
## Onde você piorou
(o que foi contra as metas, os valores e os compromissos; nomeie, mostre a consequência)
## Comparado com a semana passada
(números + se cumpriu o que a revisão anterior exigiu)
## Padrões
(o que se repetiu no diário e nos conselhos; o que a semana revela)
## O que a sua base diz sobre isso
(junte VÁRIAS notas; cite com [N] os números dos trechos)
## Para esta semana
(3 a 5 compromissos concretos — os mesmos de `actions`)

Preencha também `foi_bem`, `piorou` e `padroes` (frases curtas) e `actions` (3 a 5, com motivo).

{contexto}

TRECHOS DA BASE (numerados):
{AI.bloco_trechos(trechos, max_chars=800)}

Responda SOMENTE no JSON pedido.""", _REVISAO_SCHEMA, usage)
    except AI.VioletAIError as exc:
        return {"status": "error", "message": str(exc)}

    essay, sources = AI.normalizar_citacoes(escrito.get("essay_md") or "", trechos)
    digest = {k: escrito.get(k) or [] for k in ("foi_bem", "piorou", "padroes")}
    digest["fontes_citadas"] = [s["uri"] or s["fonte"] for s in sources]
    s = meta["sinais"]
    metrics = {
        "forca": (s.get("forca") or {}).get("agora"), "forca_antes": (s.get("forca") or {}).get("semana_passada"),
        "dias_escritos": (s.get("forca") or {}).get("dias_escritos"),
        "emocao_media": ((s.get("emocao") or {}).get("semana") or {}).get("media"),
        "foco_min": (s.get("foco_min") or {}).get("semana"), "conselhos": meta["conselhos"],
    }

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT actions_json FROM journal_weekly_reviews WHERE week_start = %s", (a,))
            prev = cur.fetchone()
            prev_task = {x["texto"]: x.get("task_id") for x in _json(prev["actions_json"], []) if x.get("task_id")} if prev else {}
            actions = [{"texto": x.get("texto", ""), "motivo": x.get("motivo", ""), "task_id": prev_task.get(x.get("texto", ""))}
                       for x in escrito.get("actions") or []]
            cur.execute("""
                INSERT INTO journal_weekly_reviews
                    (week_start, verdict, tone, essay_md, digest_json, sources_json, actions_json, metrics_json,
                     model, tokens_in, tokens_out)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (week_start) DO UPDATE SET
                    verdict = EXCLUDED.verdict, tone = EXCLUDED.tone, essay_md = EXCLUDED.essay_md,
                    digest_json = EXCLUDED.digest_json, sources_json = EXCLUDED.sources_json,
                    actions_json = EXCLUDED.actions_json, metrics_json = EXCLUDED.metrics_json,
                    model = EXCLUDED.model, tokens_in = EXCLUDED.tokens_in, tokens_out = EXCLUDED.tokens_out,
                    updated_at = NOW()
                RETURNING *
            """, (a, escrito.get("verdict"), escrito.get("tone"), essay, json.dumps(digest), json.dumps(sources),
                  json.dumps(actions), json.dumps(metrics), VIOLET_MODEL, usage["in"], usage["out"]))
            row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "review": _serialize(row)}


# ─── Leituras ──────────────────────────────────────────────────────────────────

def get_revisao_semanal(week: Optional[str] = None) -> Optional[dict]:
    """Revisão da semana de ``week`` (qualquer data dela); sem ``week``, a mais recente."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if week:
                cur.execute("SELECT * FROM journal_weekly_reviews WHERE week_start = %s",
                            (week_bounds(date.fromisoformat(week))[0],))
            else:
                cur.execute("SELECT * FROM journal_weekly_reviews ORDER BY week_start DESC LIMIT 1")
            row = cur.fetchone()
        return _serialize(row) if row else None
    finally:
        conn.close()


def list_revisoes(limit: int = 12) -> list:
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""SELECT id, week_start, verdict, tone, metrics_json, sent_at, created_at
                           FROM journal_weekly_reviews ORDER BY week_start DESC LIMIT %s""", (limit,))
            rows = cur.fetchall()
        return [{"id": r["id"], "week_start": r["week_start"].isoformat(), "verdict": r["verdict"], "tone": r["tone"],
                 "metrics": _json(r["metrics_json"], {}), "sent": r["sent_at"] is not None} for r in rows]
    finally:
        conn.close()


def marcar_enviada(week_start: str) -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE journal_weekly_reviews SET sent_at = NOW() WHERE week_start = %s", (week_start,))
        conn.commit()
    finally:
        conn.close()


def marcar_acao_como_tarefa(week_start: str, action_index: int, task_id: int) -> dict:
    """Registrar que um compromisso da revisão virou tarefa na Kaguya."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, actions_json FROM journal_weekly_reviews WHERE week_start = %s", (week_start,))
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "revisão não encontrada"}
            acts = _json(row["actions_json"], [])
            if not (0 <= action_index < len(acts)):
                return {"status": "error", "message": "compromisso fora do intervalo"}
            acts[action_index]["task_id"] = task_id
            cur.execute("UPDATE journal_weekly_reviews SET actions_json = %s, updated_at = NOW() WHERE id = %s RETURNING *",
                        (json.dumps(acts), row["id"]))
            updated = cur.fetchone()
        conn.commit()
        return {"status": "ok", "review": _serialize(updated)}
    finally:
        conn.close()


try:
    _ensure_tables()
except Exception as exc:  # noqa: BLE001
    logger.warning("weekly_review: não foi possível criar a tabela ao importar: %s", exc)
