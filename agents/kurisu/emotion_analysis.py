"""Registro emocional — camada 2: a leitura da Violet (spec 076).

A camada 1 (``agents/journal/emotion_patterns.py``) calcula os achados sem IA. Aqui a Violet
lê os achados + os registros do período + os valores + a base de conhecimento (TCC e regulação
emocional, via RAG amplo) e escreve, no mesmo tom franco do Conselho:

    - padrões de pensamento (distorções cognitivas, com exemplos dos próprios registros);
    - ciclos gatilho → pensamento → emoção → comportamento;
    - o que funcionou nas respostas adaptativas e o que é racionalização;
    - o confronto com os valores declarados;
    - 1 a 3 experimentos concretos (podem virar Tiny Experiment/tarefa na Kaguya).

Também classifica, por registro, as distorções do pensamento automático
(``classificar_distorcoes`` — best-effort, chamado em segundo plano ao salvar).

Cache: uma leitura por período (``journal_emotion_analyses``, chave since+until).
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

from webapp.backend.config import DATABASE_URL as _DATABASE_URL
from agents.journal.emotion_patterns import DISTORTIONS
from agents.kurisu import violet_ai as AI
from agents.kurisu import violet_context as CTX
from agents.kurisu.models import VIOLET_MODEL

logger = logging.getLogger("kurisu.emotion_analysis")


def _get_conn():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg2.connect(_DATABASE_URL)


def _ensure_tables() -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_emotion_analyses (
                    id            SERIAL PRIMARY KEY,
                    since         DATE NOT NULL,
                    until         DATE NOT NULL,
                    essay_md      TEXT NOT NULL,
                    experiments_json JSONB NOT NULL DEFAULT '[]',
                    sources_json  JSONB NOT NULL DEFAULT '[]',
                    findings_json JSONB NOT NULL DEFAULT '[]',
                    log_count     INT NOT NULL DEFAULT 0,
                    model         TEXT,
                    tokens_in     INT,
                    tokens_out    INT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (since, until)
                )
            """)
        conn.commit()
    finally:
        conn.close()


def _json(v, default):
    if v is None:
        return default
    return v if isinstance(v, (list, dict)) else json.loads(v)


def _serialize(row: dict) -> dict:
    return {
        "since": row["since"].isoformat(), "until": row["until"].isoformat(), "essay_md": row["essay_md"],
        "experiments": _json(row["experiments_json"], []), "sources": _json(row["sources_json"], []),
        "findings": _json(row["findings_json"], []), "log_count": row["log_count"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "tokens_in": row.get("tokens_in"), "tokens_out": row.get("tokens_out"),
    }


def _bounds(since: Optional[str], until: Optional[str]) -> tuple[date, date]:
    from agents.journal.tools import _today_sp  # noqa: PLC0415
    b = date.fromisoformat(until) if until else _today_sp()
    a = date.fromisoformat(since) if since else b - timedelta(days=29)
    return a, b


# ─── Distorções por registro ───────────────────────────────────────────────────

_DIST_SCHEMA = {"type": "OBJECT", "properties": {"distortions": {"type": "ARRAY", "items": {"type": "STRING"}}},
                "required": ["distortions"]}


def normalizar_distorcoes(labels: list[str]) -> list[str]:
    """Só rótulos conhecidos, sem repetição, no máximo 3 (o modelo não inventa categoria)."""
    out = []
    for l in labels or []:
        k = (l or "").strip().lower().replace("-", "_").replace(" ", "_")
        if k in DISTORTIONS and k not in out:
            out.append(k)
    return out[:3]


def classificar_distorcoes(log_id: int) -> dict:
    """Classificar o pensamento automático de um registro (best-effort, nunca levanta)."""
    from agents.journal.tools import get_emotion_log, set_emotion_distortions  # noqa: PLC0415
    try:
        log = get_emotion_log(log_id).get("log")
        thought = ((log or {}).get("automatic_thought") or "").strip()
        if not thought:
            return {"status": "ok", "distortions": []}
        catalogo = "\n".join(f"- {k}: {v}" for k, v in DISTORTIONS.items())
        r = AI.gemini_json(f"""Classifique o pensamento automático abaixo (registro de TCC) nas distorções
cognitivas presentes. Use SOMENTE as chaves do catálogo. Nenhuma, se não houver distorção clara.
No máximo 3.

Catálogo:
{catalogo}

Situação: {log.get('situation') or '(não informada)'}
Emoção: {log.get('emotion_name')} ({log.get('intensity')}/10)
Pensamento automático: "{thought}"

Responda SOMENTE no JSON pedido.""", _DIST_SCHEMA, temperature=0)
        labels = normalizar_distorcoes(r.get("distortions") or [])
        set_emotion_distortions(log_id, labels)
        return {"status": "ok", "distortions": labels}
    except Exception as exc:  # noqa: BLE001 — falha só deixa o registro sem rótulo
        logger.warning("emotion_analysis: classificação do registro %s falhou: %s", log_id, exc)
        return {"status": "error", "message": "não consegui classificar agora"}


# ─── Leitura do período ────────────────────────────────────────────────────────

_LEITURA_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "queries": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["queries"],
}

_ANALISE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "essay_md": {"type": "STRING"},
        "experiments": {
            "type": "ARRAY",
            "items": {"type": "OBJECT",
                      "properties": {"titulo": {"type": "STRING"}, "como": {"type": "STRING"}, "porque": {"type": "STRING"}},
                      "required": ["titulo", "como", "porque"]},
        },
    },
    "required": ["essay_md", "experiments"],
}


def analisar_emocoes(since: Optional[str] = None, until: Optional[str] = None) -> dict:
    """Gerar (ou regerar) a leitura da Violet sobre os registros emocionais do período.

    Returns:
        ``{"status": "ok", "analysis": {...}}`` ou ``{"status": "error", "message"}``.
    """
    from agents.journal.emotion_patterns import get_emotion_patterns  # noqa: PLC0415
    from agents.journal.tools import list_all_emotion_logs  # noqa: PLC0415

    a, b = _bounds(since, until)
    logs = list_all_emotion_logs(since=a.isoformat(), until=b.isoformat(), limit=300)
    if len(logs) < 2:
        return {"status": "error", "message": "Poucos registros neste período para uma leitura (mínimo 2)."}
    padroes = get_emotion_patterns(a.isoformat(), b.isoformat())
    achados = "\n".join(f"- {f['title']}: {f['detail']}" for f in padroes["findings"]) or "(nenhum achado forte)"
    registros = "\n".join(
        f"- [{l['date']}] {l['emotion_name']} {l['intensity']}/10"
        + (f" → {l['reappraised_intensity']}/10" if l.get("reappraised_intensity") is not None else "")
        + (f" | situação: {l['situation']}" if l.get("situation") else "")
        + (f" | pensamento: {l['automatic_thought']}" if l.get("automatic_thought") else "")
        + (f" | resposta: {l['adaptive_response']}" if l.get("adaptive_response") else "")
        + (f" | distorções: {', '.join(l['distortions'])}" if l.get("distortions") else "")
        for l in reversed(logs)
    )
    usage = AI.novo_usage()
    try:
        temas = AI.gemini_json(f"""Leia os registros emocionais (TCC) abaixo e devolva de 5 a 7 buscas curtas, em
português, para a base de conhecimento pessoal — sobre TCC, distorções cognitivas, regulação emocional e os
temas específicos que aparecem (ex.: ansiedade social, culpa, procrastinação).

ACHADOS:
{achados}

REGISTROS:
{registros[:8000]}

Responda SOMENTE no JSON pedido.""", _LEITURA_SCHEMA, usage)
        trechos = AI.recuperar_amplo(["terapia cognitivo-comportamental distorções cognitivas", *(temas.get("queries") or [])])
        escrito = AI.gemini_json(f"""{AI.TOM_VIOLET}

Escreva, em Markdown (600 a 1.000 palavras), a sua LEITURA dos registros emocionais de {a:%d/%m} a
{b:%d/%m/%Y}. Não repita os números — interprete. Use estes títulos ##:
## O que os registros mostram
## Seus padrões de pensamento
(distorções cognitivas com exemplos tirados dos próprios registros, entre aspas)
## Os ciclos
(gatilho → pensamento → emoção → comportamento; o que alimenta o quê)
## O que está funcionando — e o que é racionalização
(sobre as respostas adaptativas: quais reduziram a intensidade de verdade e quais só justificam)
## Contra os seus valores
(onde os padrões emocionais atrapalham o que a pessoa diz valorizar)
## O que a sua base ensina
(junte VÁRIAS notas; cite [N])

Em `experiments`, de 1 a 3 experimentos concretos de 1–2 semanas (título, como fazer, por quê).

ACHADOS CALCULADOS:
{achados}

REGISTROS:
{registros[:10000]}

VALORES DECLARADOS:
{CTX.valores()}

TRECHOS DA BASE (numerados):
{AI.bloco_trechos(trechos, max_chars=800)}

Responda SOMENTE no JSON pedido.""", _ANALISE_SCHEMA, usage)
    except AI.VioletAIError as exc:
        return {"status": "error", "message": str(exc)}

    essay, sources = AI.normalizar_citacoes(escrito.get("essay_md") or "", trechos)
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO journal_emotion_analyses
                    (since, until, essay_md, experiments_json, sources_json, findings_json, log_count, model, tokens_in, tokens_out)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (since, until) DO UPDATE SET
                    essay_md = EXCLUDED.essay_md, experiments_json = EXCLUDED.experiments_json,
                    sources_json = EXCLUDED.sources_json, findings_json = EXCLUDED.findings_json,
                    log_count = EXCLUDED.log_count, model = EXCLUDED.model, tokens_in = EXCLUDED.tokens_in,
                    tokens_out = EXCLUDED.tokens_out, created_at = NOW()
                RETURNING *
            """, (a, b, essay, json.dumps(escrito.get("experiments") or []), json.dumps(sources),
                  json.dumps(padroes["findings"]), len(logs), VIOLET_MODEL, usage["in"], usage["out"]))
            row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "analysis": _serialize(row)}


def get_analise_emocoes(since: Optional[str] = None, until: Optional[str] = None) -> Optional[dict]:
    """Leitura já gerada para exatamente esse período (ou a mais recente que termina em ``until``)."""
    a, b = _bounds(since, until)
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM journal_emotion_analyses
                WHERE until = %s ORDER BY (since = %s) DESC, created_at DESC LIMIT 1
            """, (b, a))
            row = cur.fetchone()
        return _serialize(row) if row else None
    finally:
        conn.close()


try:
    _ensure_tables()
except Exception as exc:  # noqa: BLE001
    logger.warning("emotion_analysis: não foi possível criar a tabela ao importar: %s", exc)
