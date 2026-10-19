"""Conversa sobre o Conselho do Dia — responder a Violet e ela responder de volta.

O conselho (``counsel.py``) é o ponto de partida; aqui o usuário responde e a Violet continua a
conversa com o mesmo tom (``violet_ai.TOM_VIOLET``), o mesmo contexto do conselho (dia, semana,
conselhos anteriores, Kaguya, valores, padrões emocionais) e citações honestas da base.

Pipeline de cada resposta (todo antes de abrir a transação — falha não grava nada, nem a
mensagem do usuário; o front devolve o texto ao campo):
    conselho do dia + conversa → 1–3 buscas curtas (JSON) → RAG enxuto (até 10 trechos, notas já
    citadas na conversa no fim da fila) → resposta (Markdown curto) → citações validadas no servidor
    → INSERT da mensagem do usuário + da resposta numa transação.

A conversa vive em ``journal_counsel_messages`` (criada em ``counsel._ensure_counsel_tables``),
ligada ao conselho — um fio por dia. Regerar o conselho mantém o fio e insere um ``marker``.

Usage:
    from agents.kurisu import counsel_chat
    counsel_chat.responder_conselho(date="2026-10-18", message="Mas eu não tive tempo…")
"""

from __future__ import annotations

import json
import logging
from datetime import date as _date

import psycopg2.extras

from agents.kurisu import counsel as C
from agents.kurisu import violet_ai as AI
from agents.kurisu import violet_context as CTX
from agents.kurisu.models import VIOLET_MODEL

logger = logging.getLogger("kurisu.counsel_chat")

MAX_MESSAGE_CHARS = 4000
_MAX_HISTORY = 20
_MAX_QUERIES = 3
_MAX_TRECHOS_REPLY = 10
_MAX_ESSAY_CHARS = 6000


# ─── Peças puras (cobertas por tests/agents/test_kurisu_counsel_chat.py) ────────

def validar_mensagem(texto: str | None) -> str | None:
    """Mensagem de erro para o usuário, ou ``None`` se a mensagem é válida."""
    t = (texto or "").strip()
    if not t:
        return "Escreva algo para responder à Violet."
    if len(t) > MAX_MESSAGE_CHARS:
        return f"A mensagem passou de {MAX_MESSAGE_CHARS} caracteres — divida em duas."
    return None


def bloco_historico(mensagens: list, limite: int = _MAX_HISTORY) -> str:
    """As últimas ``limite`` mensagens da conversa, em texto para o prompt."""
    if not mensagens:
        return "(ainda não há conversa — esta é a primeira resposta dele ao conselho)"
    linhas = []
    for m in mensagens[-limite:]:
        if m["role"] == "marker":
            linhas.append("[o conselho foi regerado aqui — o texto acima do fio mudou]")
        elif m["role"] == "user":
            linhas.append(f"ELE: {m['content_md']}")
        else:
            linhas.append(f"VIOLET: {m['content_md']}")
    return "\n\n".join(linhas)


def bloco_conselho(counsel: dict) -> str:
    """O conselho original (texto novo ou cards do formato antigo), truncado para o prompt."""
    if counsel.get("essay_md"):
        texto = counsel["essay_md"]
    else:
        texto = counsel.get("mirror") or ""
        for t in counsel.get("toolkit") or []:
            texto += f"\n- {t.get('titulo', '')}: {t.get('porque', '')} Como: {t.get('como', '')}"
    if len(texto) > _MAX_ESSAY_CHARS:
        texto = texto[:_MAX_ESSAY_CHARS] + "…"
    acoes = "; ".join(a.get("texto", "") for a in counsel.get("actions") or []) or "(nenhuma)"
    fontes = "; ".join(s.get("titulo") or s.get("fonte") or "" for s in counsel.get("sources") or []) or "(nenhuma)"
    return f"{texto}\n\nAções sugeridas: {acoes}\nNotas citadas no conselho: {fontes}"


def fontes_da_conversa(counsel: dict, mensagens: list) -> set:
    """Notas já citadas (no conselho e nas respostas) — vão para o fim da fila do RAG."""
    citadas = {s.get("uri") or s.get("fonte") for s in counsel.get("sources") or []}
    for m in mensagens:
        citadas |= {s.get("uri") or s.get("fonte") for s in m.get("sources") or []}
    return {c for c in citadas if c}


def montar_prompt_resposta(texto_dia: str, contexto: str, conselho: str, historico: str, mensagem: str,
                           trechos: list) -> str:
    regra_base = (
        "Se nenhum trecho abaixo sustenta o que você vai dizer, diga explicitamente que não encontrou isso na "
        "base dele antes de usar conhecimento geral — e não cite nada."
        if not trechos else
        "Cite inline com [N] usando os números dos trechos — só cite trechos que sustentam a frase. Conhecimento "
        "geral não leva citação e não pode ser apresentado como se viesse da base."
    )
    return f"""{AI.TOM_VIOLET}

Você escreveu o CONSELHO DO DIA abaixo e agora ele está RESPONDENDO a você numa conversa.
Regras desta conversa:
- Responda ao que ele acabou de dizer — concorde, discorde, pergunte ou aprofunde. Não repita o conselho.
- Se ele der desculpa para algo que vai contra as metas/valores/compromissos dele, não aceite: nomeie e exija.
  Se ele trouxer um fato novo que muda a leitura, reconheça e ajuste.
- 80 a 300 palavras, em Markdown simples (parágrafos curtos, listas só se ajudarem). Sem os títulos ## do conselho.
- Termine, quando fizer sentido, com UMA pergunta ou UMA exigência concreta.
- {regra_base}

DIA DE HOJE:
\"\"\"{texto_dia}\"\"\"

{contexto}

O CONSELHO QUE VOCÊ ESCREVEU:
\"\"\"{conselho}\"\"\"

CONVERSA ATÉ AGORA:
{historico}

A MENSAGEM DELE AGORA:
\"\"\"{mensagem}\"\"\"

TRECHOS DA BASE (numerados, para as citações):
{AI.bloco_trechos(trechos, max_chars=900)}

Responda SOMENTE no JSON pedido."""


# ─── Prompts ─────────────────────────────────────────────────────────────────────

_QUERIES_SCHEMA = {
    "type": "OBJECT",
    "properties": {"queries": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["queries"],
}

_RESPOSTA_SCHEMA = {
    "type": "OBJECT",
    "properties": {"reply_md": {"type": "STRING"}},
    "required": ["reply_md"],
}


def _extrair_queries(mensagem: str, conselho: str, usage: dict) -> list:
    prompt = f"""Ele respondeu a um conselho do diário. Devolva de 1 a {_MAX_QUERIES} buscas curtas (em português,
sobre CONCEITOS — nunca frases literais) para a base de conhecimento pessoal dele (psicologia, TCC, hábitos,
produtividade, filosofia, relacionamentos) que ajudem a responder ao que ele disse agora.

CONSELHO (resumo):
\"\"\"{conselho[:1500]}\"\"\"

A MENSAGEM DELE:
\"\"\"{mensagem}\"\"\"

Responda SOMENTE no JSON pedido."""
    r = AI.gemini_json(prompt, _QUERIES_SCHEMA, usage)
    return [q for q in (r.get("queries") or []) if isinstance(q, str) and q.strip()][:_MAX_QUERIES]


# ─── Resposta ─────────────────────────────────────────────────────────────────

def _carregar(date: str, type_id: int) -> tuple[dict | None, int | None]:
    """(conselho serializado com ``messages``, id da linha) — ou (None, None)."""
    conn = C._get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.* FROM journal_counsel c JOIN journal_pages p ON p.id = c.page_id
                WHERE p.type_id = %s AND p.date = %s
            """, (type_id, date))
            row = cur.fetchone()
            if not row:
                return None, None
            return C._serialize_counsel_row(row, date, C.list_messages(cur, row["id"])), row["id"]
    finally:
        conn.close()


def _gravar(counsel_id: int, mensagem: str, reply: str, sources: list, usage: dict) -> list:
    conn = C._get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO journal_counsel_messages (counsel_id, role, content_md)
                VALUES (%s, 'user', %s) RETURNING id, role, content_md, sources_json, created_at
            """, (counsel_id, mensagem))
            user_row = cur.fetchone()
            cur.execute("""
                INSERT INTO journal_counsel_messages (counsel_id, role, content_md, sources_json, model, tokens_in, tokens_out)
                VALUES (%s, 'violet', %s, %s, %s, %s, %s) RETURNING id, role, content_md, sources_json, created_at
            """, (counsel_id, reply, json.dumps(sources), VIOLET_MODEL, usage["in"], usage["out"]))
            violet_row = cur.fetchone()
        conn.commit()
        return [C.serialize_message(user_row), C.serialize_message(violet_row)]
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def responder_conselho(date: str, message: str, type_id: int = 1) -> dict:
    """Responder ao conselho do dia: grava a mensagem dele e a resposta da Violet.

    Returns:
        ``{"status": "ok", "messages": [mensagem_dele, resposta_da_violet]}`` ou
        ``{"status": "error", "message"}`` (nada gravado).
    """
    erro = validar_mensagem(message)
    if erro:
        return {"status": "error", "message": erro}
    mensagem = message.strip()

    counsel, counsel_id = _carregar(date, type_id)
    if not counsel:
        return {"status": "error", "message": "Ainda não há conselho neste dia para responder."}

    dias = CTX.dias(_date.fromisoformat(date), _date.fromisoformat(date))
    dia = dias[0] if dias else {}
    texto_dia = CTX.resumir_dia(dia) if dia else "(sem conteúdo)"
    contexto = C._bloco_contexto(C._contexto(date, dia))
    conselho = bloco_conselho(counsel)
    historico = bloco_historico(counsel["messages"])

    usage = AI.novo_usage()
    try:
        queries = _extrair_queries(mensagem, conselho, usage)
        trechos = AI.recuperar_amplo(queries, fontes_da_conversa(counsel, counsel["messages"]))[:_MAX_TRECHOS_REPLY] if queries else []
        prompt = montar_prompt_resposta(texto_dia, contexto, conselho, historico, mensagem, trechos)
        escrito = AI.gemini_json(prompt, _RESPOSTA_SCHEMA, usage)
    except AI.VioletAIError as exc:
        return {"status": "error", "message": str(exc)}

    reply, sources = AI.normalizar_citacoes(escrito.get("reply_md") or "", trechos)
    if not reply:
        return {"status": "error", "message": "A Violet não conseguiu responder agora. Tente novamente em instantes."}

    return {"status": "ok", "messages": _gravar(counsel_id, mensagem, reply, sources, usage)}
