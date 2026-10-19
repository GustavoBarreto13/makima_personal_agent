"""Conselho do Dia na Violet — a Kurisu cruza o diário com a base de conhecimento (specs 061 → 076).

Spec 076 reescreveu o conselho. Antes: 2–4 cards de "ferramentas", cada um preso a UM trecho —
na prática, três notas usadas de exemplo. Agora é um **conselho de verdade**: um texto longo e
denso, na voz franca da Violet, que

    1. lê o dia (bullets, sonho, emoções, cartas) e a semana;
    2. compara com os conselhos dos últimos 7 dias (digest + desfecho das ações) para não repetir
       e para avaliar a evolução — e cobra os compromissos da última Revisão semanal;
    3. cruza com os valores declarados, as metas e hábitos da Kaguya e os padrões emocionais;
    4. sintetiza os ensinamentos de VÁRIAS notas da base (RAG amplo), citando ``[N]``.

Pipeline (todo antes de abrir a transação de escrita — falha não grava nada):
    temas (6–8 consultas) → RAG amplo (notas recém-citadas no fim da fila) → web só se a base
    vier quase vazia → mapa de ideias (JSON: princípios × trechos + digest do dia) →
    conselho (Markdown, ~800–1.200 palavras, + ações) → citações validadas no servidor.

Honestidade: a fonte de cada ``[N]`` é decidida aqui (``violet_ai.normalizar_citacoes``), nunca
pelo modelo; sem nenhum trecho, uma frase honesta abre o texto.

Usage:
    from agents.kurisu import counsel
    counsel.gerar_conselho(date="2026-10-12")
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date as _date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

from webapp.backend.config import DATABASE_URL as _DATABASE_URL
from agents.journal.tools import get_page
from agents.kurisu import violet_ai as AI
from agents.kurisu import violet_context as CTX
from agents.kurisu.models import VIOLET_MODEL

logger = logging.getLogger("kurisu.counsel")

_MODEL_NAME = VIOLET_MODEL

# Consultas à base por conselho (o mapa de ideias precisa de material para cruzar).
_MAX_RAG_QUERIES = 8
# Dias de conselhos anteriores lidos para continuidade (com folga quando há dias sem conselho).
_HISTORY_DAYS = int(os.environ.get("VIOLET_COUNSEL_HISTORY_DAYS", "7"))


# ─── Conexão e tabela ───────────────────────────────────────────────────────────

def _get_conn():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg2.connect(_DATABASE_URL)


def _ensure_counsel_tables() -> None:
    """Criar/atualizar ``journal_counsel`` (idempotente)."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_counsel (
                    id            SERIAL PRIMARY KEY,
                    page_id       INT NOT NULL UNIQUE REFERENCES journal_pages(id) ON DELETE CASCADE,
                    mirror        TEXT NOT NULL,
                    toolkit_json  JSONB NOT NULL DEFAULT '[]',
                    actions_json  JSONB NOT NULL DEFAULT '[]',
                    signals_json  JSONB NOT NULL DEFAULT '{}',
                    used_web      BOOLEAN NOT NULL DEFAULT FALSE,
                    model         TEXT,
                    tokens_in     INT,
                    tokens_out    INT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_counsel_created ON journal_counsel (created_at DESC)")
            cur.execute("ALTER TABLE journal_counsel DROP COLUMN IF EXISTS question")
            # Spec 076 — o conselho em texto, as fontes citadas e o resumo estruturado do dia.
            cur.execute("ALTER TABLE journal_counsel ADD COLUMN IF NOT EXISTS essay_md TEXT")
            cur.execute("ALTER TABLE journal_counsel ADD COLUMN IF NOT EXISTS sources_json JSONB NOT NULL DEFAULT '[]'")
            cur.execute("ALTER TABLE journal_counsel ADD COLUMN IF NOT EXISTS digest_json JSONB NOT NULL DEFAULT '{}'")
            # Conversa sobre o conselho (counsel_chat.py): 1 fio por conselho = por dia.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_counsel_messages (
                    id            SERIAL PRIMARY KEY,
                    counsel_id    INT NOT NULL REFERENCES journal_counsel(id) ON DELETE CASCADE,
                    role          TEXT NOT NULL CHECK (role IN ('user', 'violet', 'marker')),
                    content_md    TEXT NOT NULL,
                    sources_json  JSONB NOT NULL DEFAULT '[]',
                    model         TEXT,
                    tokens_in     INT,
                    tokens_out    INT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_counsel_msgs ON journal_counsel_messages (counsel_id, id)")
        conn.commit()
    finally:
        conn.close()


class _CounselError(Exception):
    """Erro ao gerar o conselho — nunca deixa dado parcial gravado."""


# ─── Peças puras (cobertas por tests/agents/test_kurisu_counsel.py) ─────────────

def _dia_esta_vazio(dia: dict) -> bool:
    return CTX.dia_vazio(dia)


def _selecionar_queries(temas: dict) -> list:
    return (temas.get("queries") or [])[:_MAX_RAG_QUERIES]


def _merge_dedup_trechos(varias_listas: list) -> list:
    """Mesclar listas preservando a 1ª ocorrência de cada ``uri`` (trechos sem uri ficam todos)."""
    vistos: set = set()
    trechos: list = []
    for lista in varias_listas:
        for t in lista:
            uri = t.get("uri")
            if uri and uri in vistos:
                continue
            if uri:
                vistos.add(uri)
            trechos.append(t)
    return trechos


def _consultar_varios(fn, queries: list) -> list:
    return AI.consultar(fn, queries)


def _precisa_busca_web(rag_trechos: list) -> bool:
    return len(rag_trechos) < 2


def _normalize_toolkit(raw_items: list, rag_trechos: list) -> list:
    """Formato antigo (spec 061) — mantido para ler conselhos gerados antes da 076."""
    normalizado = []
    for item in raw_items:
        idx = item.get("trecho_index")
        trecho = rag_trechos[idx - 1] if isinstance(idx, int) and 1 <= idx <= len(rag_trechos) else None
        base_item = {k: item.get(k, "") for k in ("titulo", "porque", "como", "exemplo_hoje", "lembrete")}
        if trecho:
            normalizado.append({**base_item, "fonte": trecho.get("fonte", ""), "uri": trecho.get("uri", ""), "origem": "base"})
        else:
            normalizado.append({**base_item, "fonte": item.get("fonte_web", "") or "busca na web", "uri": "", "origem": "web"})
    return normalizado


_novo_usage_acc = AI.novo_usage
_acumular_usage = AI.acumular_usage


def _json(v, default):
    if v is None:
        return default
    return v if isinstance(v, (list, dict)) else json.loads(v)


def serialize_message(row: dict) -> dict:
    """Linha de ``journal_counsel_messages`` → forma ``CounselMessage`` da API."""
    return {
        "id": row["id"],
        "role": row["role"],
        "content_md": row["content_md"],
        "sources": _json(row.get("sources_json"), []),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def list_messages(cur, counsel_id: int) -> list:
    """A conversa de um conselho, em ordem (``cur`` com ``RealDictCursor``)."""
    cur.execute("""
        SELECT id, role, content_md, sources_json, created_at FROM journal_counsel_messages
        WHERE counsel_id = %s ORDER BY id
    """, (counsel_id,))
    return [serialize_message(r) for r in cur.fetchall()]


def _serialize_counsel_row(row: dict, date: str, messages: Optional[list] = None) -> dict:
    """Linha de ``journal_counsel`` → forma ``Counsel`` da API (formatos novo e antigo)."""
    return {
        "page_id": row["page_id"],
        "date": date,
        "mirror": row["mirror"],
        "essay_md": row.get("essay_md"),
        "sources": _json(row.get("sources_json"), []),
        "digest": _json(row.get("digest_json"), {}),
        "toolkit": _json(row.get("toolkit_json"), []),
        "actions": _json(row.get("actions_json"), []),
        "used_web": row["used_web"],
        "tokens_in": row.get("tokens_in"),
        "tokens_out": row.get("tokens_out"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "messages": messages or [],
    }


# ─── Prompts ─────────────────────────────────────────────────────────────────────

_TEMAS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "queries": {"type": "ARRAY", "items": {"type": "STRING"}},
        "carga_emocional": {"type": "STRING"},
    },
    "required": ["queries", "carga_emocional"],
}

_MAPA_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "espelho": {"type": "STRING"},
        "humor": {"type": "STRING"},
        "observacoes": {"type": "ARRAY", "items": {"type": "STRING"}},
        "evolucao": {"type": "ARRAY", "items": {"type": "STRING"}},
        "cobrancas": {"type": "ARRAY", "items": {"type": "STRING"}},
        "principios": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "titulo": {"type": "STRING"},
                    "ideia": {"type": "STRING"},
                    "trechos": {"type": "ARRAY", "items": {"type": "INTEGER"}},
                    "relacao": {"type": "STRING"},
                    "retomado": {"type": "BOOLEAN"},
                },
                "required": ["titulo", "ideia", "trechos", "relacao", "retomado"],
            },
        },
    },
    "required": ["espelho", "humor", "observacoes", "evolucao", "cobrancas", "principios"],
}

_CONSELHO_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "essay_md": {"type": "STRING"},
        "actions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"texto": {"type": "STRING"}, "motivo": {"type": "STRING"}},
                "required": ["texto", "motivo"],
            },
        },
    },
    "required": ["essay_md", "actions"],
}


def _extrair_temas(texto_dia: str, contexto: str, usage: dict) -> dict:
    prompt = f"""Leia o dia de diário e o contexto abaixo e devolva:
1. queries: de 6 a 8 buscas curtas (em português, sobre CONCEITOS — nunca frases literais do diário)
   para uma base de conhecimento pessoal (psicologia, TCC, hábitos, produtividade, filosofia,
   relacionamentos, autoconhecimento). Cubra ângulos diferentes: o problema central do dia, as
   emoções, os padrões que se repetem na semana, os hábitos/metas em risco, "o que fazer na prática"
   e "como reenquadrar".
2. carga_emocional: o tom emocional do dia em poucas palavras.

DIA:
\"\"\"{texto_dia}\"\"\"

CONTEXTO:
{contexto}

Responda SOMENTE no JSON pedido."""
    return AI.gemini_json(prompt, _TEMAS_SCHEMA, usage)


def _contexto(date: str, dia: dict) -> dict:
    ref = _date.fromisoformat(date)
    semana = [d for d in CTX.dias(ref - timedelta(days=7), ref - timedelta(days=1))]
    historico = CTX.conselhos(ref - timedelta(days=_HISTORY_DAYS * 2), ref - timedelta(days=1))[-_HISTORY_DAYS:]
    return {
        "semana": semana,
        "historico": historico,
        "kaguya": CTX.kaguya(),
        "sinais": CTX.sinais(ref),
        "valores": CTX.valores(),
        "emocional": CTX.padroes_emocionais(ref - timedelta(days=13), ref),
        "revisao": CTX.compromissos_da_ultima_revisao(ref),
    }


def _bloco_contexto(ctx: dict) -> str:
    semana = "\n".join(f"- {d['date']}: {CTX.resumir_dia(d, 200)[:600]}" for d in ctx["semana"]) or "(sem registros)"
    return f"""ÚLTIMOS 7 DIAS (diário):
{semana}

CONSELHOS DOS ÚLTIMOS {_HISTORY_DAYS} DIAS (digest + desfecho das ações):
{CTX.bloco_conselhos(ctx['historico'])}

COMPROMISSOS DA ÚLTIMA REVISÃO SEMANAL:
{ctx['revisao']}

VALORES DECLARADOS (Avaliação dos Valores):
{ctx['valores']}

KAGUYA (tarefas, hábitos, metas):
{CTX.bloco_kaguya(ctx['kaguya'])}

SINAIS OBJETIVOS (esta semana vs. anterior):
{CTX.bloco_sinais(ctx['sinais'])}

PADRÕES EMOCIONAIS (últimas 2 semanas, calculados):
{ctx['emocional']}"""


def _mapear(texto_dia: str, contexto: str, trechos: list, web: Optional[str], usage: dict) -> dict:
    prompt = f"""{AI.TOM_VIOLET}

Antes de escrever o conselho, organize o pensamento. Leia o dia, o contexto e os trechos da base
de conhecimento PESSOAL do usuário (curadoria que ele mesmo fez) e devolva:

- espelho: 2 a 3 frases sobre o que pesou e o que importou hoje.
- humor: uma palavra ou expressão curta.
- observacoes: 2 a 5 observações factuais sobre o dia (o que aconteceu, o que ele fez/deixou de fazer).
- evolucao: compare com os conselhos anteriores — o que melhorou, o que se repete, quais ações foram
  seguidas (veja o desfecho) e quais foram ignoradas. Só afirme o que os dados mostram.
- cobrancas: o que ele está fazendo contra as próprias metas/valores/compromissos (vazio se nada).
- principios: 3 a 6 princípios/ensinamentos da base que se aplicam AO DIA. Cada um deve juntar
  ideias de VÁRIOS trechos sempre que possível (liste os números em `trechos`) e dizer, em
  `relacao`, como eles se conectam ou se tensionam. NÃO repita princípios já usados nos conselhos
  dos últimos dias, a menos que esteja retomando de propósito para cobrar (marque `retomado`).
  Só use números de trechos que de fato sustentam a ideia.

DIA DE HOJE:
\"\"\"{texto_dia}\"\"\"

{contexto}

TRECHOS DA BASE (numerados):
{AI.bloco_trechos(trechos)}
{f"{chr(10)}Informação complementar da web (NÃO é da base pessoal):{chr(10)}{web}" if web else ""}

Responda SOMENTE no JSON pedido."""
    return AI.gemini_json(prompt, _MAPA_SCHEMA, usage)


def _escrever(texto_dia: str, contexto: str, mapa: dict, trechos: list, usage: dict) -> dict:
    principios = "\n".join(
        f"- {p['titulo']}: {p['ideia']} (trechos {', '.join(str(n) for n in p.get('trechos') or [])}; {p.get('relacao', '')})"
        + (" [retomado para cobrar]" if p.get("retomado") else "")
        for p in mapa.get("principios") or []
    )
    prompt = f"""{AI.TOM_VIOLET}

Escreva o CONSELHO DO DIA em Markdown, com 800 a 1.200 palavras — longo, mas denso: cada parágrafo
tem que analisar ou ensinar algo; nada de enchimento. Estrutura (use estes títulos ##):

## O que eu li no seu dia
(curto: o espelho, sem repetir o diário)
## O que está acontecendo
(a análise: padrões com a semana, hábitos e metas, emoções; aqui entram as cobranças, sem rodeios)
## Como você evoluiu
(compare com os conselhos anteriores e a última revisão semanal: o que melhorou, o que se repete,
o que foi seguido e o que foi ignorado — e por que isso pode estar acontecendo)
## O que a sua base ensina sobre isso
(o centro do texto: desenvolva os princípios do mapa, conectando VÁRIAS notas entre si e com o dia
real; cite inline com [N] usando os números dos trechos — só cite trechos que sustentam a frase)
## Como aplicar amanhã
(concreto, ligado ao dia; passos pequenos)

Depois, em `actions`, de 1 a 3 próximos passos concretos (podem virar tarefa) com o motivo.

DIA DE HOJE:
\"\"\"{texto_dia}\"\"\"

{contexto}

MAPA DE IDEIAS (o seu rascunho):
Espelho: {mapa.get('espelho', '')}
Observações: {'; '.join(mapa.get('observacoes') or [])}
Evolução: {'; '.join(mapa.get('evolucao') or [])}
Cobranças: {'; '.join(mapa.get('cobrancas') or []) or '(nenhuma)'}
Princípios:
{principios or '(nenhum)'}

TRECHOS DA BASE (numerados, para as citações):
{AI.bloco_trechos(trechos, max_chars=900)}

Responda SOMENTE no JSON pedido."""
    return AI.gemini_json(prompt, _CONSELHO_SCHEMA, usage)


# ─── Geração ─────────────────────────────────────────────────────────────────────

def gerar_conselho(date: str, type_id: int = 1) -> dict:
    """Gerar (ou regenerar) o conselho do dia.

    Returns:
        ``{"status": "ok", "counsel": {...}}`` ou ``{"status": "error", "message"}``.
    """
    page = get_page(date=date, type_id=type_id).get("page") or {}
    if not page.get("id"):
        return {"status": "error", "message": "Ainda não há nada escrito neste dia para analisar."}
    page_id = page["id"]

    dias = CTX.dias(_date.fromisoformat(date), _date.fromisoformat(date))
    dia = dias[0] if dias else {}
    if _dia_esta_vazio(dia):
        return {"status": "error", "message": "Ainda não há nada escrito neste dia para analisar."}

    usage = AI.novo_usage()
    texto_dia = CTX.resumir_dia(dia)
    ctx = _contexto(date, dia)
    contexto = _bloco_contexto(ctx)

    try:
        temas = _extrair_temas(texto_dia, contexto, usage)
        citadas = {u for c in ctx["historico"] for u in (c.get("fontes") or []) if u}
        trechos = AI.recuperar_amplo(_selecionar_queries(temas), citadas)
        web = None
        if _precisa_busca_web(trechos):
            web = AI.gemini_web(
                f"Busque informação confiável e prática (técnicas reconhecidas, modelos mentais) sobre: "
                f"{', '.join((temas.get('queries') or [])[:3])}. Responda em português, objetivo, até 8 frases, citando fontes.",
                usage,
            )
        mapa = _mapear(texto_dia, contexto, trechos, web, usage)
        escrito = _escrever(texto_dia, contexto, mapa, trechos, usage)
    except AI.VioletAIError as exc:
        return {"status": "error", "message": str(exc)}

    essay, sources = AI.normalizar_citacoes(escrito.get("essay_md") or "", trechos)
    if not trechos:
        essay = "_Não encontrei nada equivalente na sua base de conhecimento para o que você escreveu hoje._\n\n" + essay
    mirror = (mapa.get("espelho") or "").strip() or essay[:300]
    digest = {
        "humor": mapa.get("humor"),
        "observacoes": mapa.get("observacoes") or [],
        "principios": [p["titulo"] for p in mapa.get("principios") or []],
        "cobrancas": mapa.get("cobrancas") or [],
        "evolucao": mapa.get("evolucao") or [],
        "fontes_citadas": [s["uri"] or s["fonte"] for s in sources],
        "recomendacoes": [a.get("texto", "") for a in escrito.get("actions") or []],
    }
    signals = {
        "bullets": len(dia.get("bullets", [])), "emotion_logs": len(dia.get("emotion_logs", [])),
        "letters": len(dia.get("letters", [])), "dias_semana": len(ctx["semana"]),
        "conselhos_anteriores": len(ctx["historico"]), "rag_trechos": len(trechos),
        "fontes_citadas": len(sources), "used_web": bool(web),
    }

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Regerar preserva as tarefas já criadas (casa a ação pelo texto).
            cur.execute("SELECT actions_json FROM journal_counsel WHERE page_id = %s", (page_id,))
            prev = cur.fetchone()
            prev_task = {a["texto"]: a.get("task_id") for a in _json(prev["actions_json"], []) if a.get("task_id")} if prev else {}
            actions = [{"texto": a.get("texto", ""), "motivo": a.get("motivo", ""), "task_id": prev_task.get(a.get("texto", ""))}
                       for a in escrito.get("actions") or []]
            cur.execute("""
                INSERT INTO journal_counsel
                    (page_id, mirror, toolkit_json, actions_json, signals_json, used_web, model,
                     tokens_in, tokens_out, essay_md, sources_json, digest_json)
                VALUES (%s, %s, '[]', %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (page_id) DO UPDATE SET
                    mirror = EXCLUDED.mirror, toolkit_json = '[]', actions_json = EXCLUDED.actions_json,
                    signals_json = EXCLUDED.signals_json, used_web = EXCLUDED.used_web, model = EXCLUDED.model,
                    tokens_in = EXCLUDED.tokens_in, tokens_out = EXCLUDED.tokens_out,
                    essay_md = EXCLUDED.essay_md, sources_json = EXCLUDED.sources_json,
                    digest_json = EXCLUDED.digest_json, updated_at = NOW()
                RETURNING *
            """, (page_id, mirror, json.dumps(actions), json.dumps(signals), bool(web), _MODEL_NAME,
                  usage["in"], usage["out"], essay, json.dumps(sources), json.dumps(digest)))
            row = cur.fetchone()
            # Regerar mantém a conversa: uma divisória marca que o texto mudou.
            if prev:
                cur.execute("""
                    INSERT INTO journal_counsel_messages (counsel_id, role, content_md)
                    SELECT %s, 'marker', 'Conselho regerado'
                    WHERE EXISTS (SELECT 1 FROM journal_counsel_messages WHERE counsel_id = %s)
                """, (row["id"], row["id"]))
            messages = list_messages(cur, row["id"])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"status": "ok", "counsel": _serialize_counsel_row(row, date, messages)}


# ─── Leituras ────────────────────────────────────────────────────────────────────

def get_conselho(date: str, type_id: int = 1) -> Optional[dict]:
    """Conselho já gerado de uma data, ou ``None`` (leitura pura)."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.* FROM journal_counsel c JOIN journal_pages p ON p.id = c.page_id
                WHERE p.type_id = %s AND p.date = %s
            """, (type_id, date))
            row = cur.fetchone()
            if not row:
                return None
            return _serialize_counsel_row(row, date, list_messages(cur, row["id"]))
    finally:
        conn.close()


def list_conselhos(limit: int = 20) -> list:
    """Conselhos mais recentes — trajetória (humor e princípios por dia)."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.page_id, p.date::text AS date, c.mirror, c.used_web, c.created_at, c.digest_json
                FROM journal_counsel c JOIN journal_pages p ON p.id = c.page_id
                ORDER BY p.date DESC LIMIT %s
            """, (limit,))
            rows = cur.fetchall()
        out = []
        for r in rows:
            item = dict(r)
            digest = _json(item.pop("digest_json", None), {}) or {}
            item["humor"] = digest.get("humor")
            item["principios"] = digest.get("principios") or []
            item["created_at"] = item["created_at"].isoformat() if item["created_at"] else None
            out.append(item)
        return out
    finally:
        conn.close()


def marcar_acao_como_tarefa(page_id: int, action_index: int, task_id: int) -> dict:
    """Gravar ``task_id`` na ação ``action_index`` de um conselho."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.id, c.actions_json, p.date::text AS date FROM journal_counsel c
                JOIN journal_pages p ON p.id = c.page_id WHERE c.page_id = %s
            """, (page_id,))
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "conselho não encontrado para esse dia"}
            actions = _json(row["actions_json"], [])
            if action_index < 0 or action_index >= len(actions):
                return {"status": "error", "message": "ação fora do intervalo"}
            actions[action_index]["task_id"] = task_id
            cur.execute("""
                UPDATE journal_counsel SET actions_json = %s, updated_at = NOW() WHERE id = %s RETURNING *
            """, (json.dumps(actions), row["id"]))
            updated = cur.fetchone()
            date_str = row["date"]
            messages = list_messages(cur, row["id"])
        conn.commit()
        return {"status": "ok", "counsel": _serialize_counsel_row(updated, date_str, messages)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


try:
    _ensure_counsel_tables()
except Exception as exc:  # noqa: BLE001
    logger.warning("counsel: não foi possível criar a tabela ao importar o módulo: %s", exc)
