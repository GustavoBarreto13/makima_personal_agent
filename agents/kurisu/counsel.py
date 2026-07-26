"""Conselho do Dia na Violet — Kurisu cruza o diário com a base de conhecimento (spec 061).

Um botão na tela Escrever pede, sob demanda, uma leitura do dia (bullets, registros
emocionais, cartas), da janela dos 7 dias anteriores, do estado de tarefas/hábitos da
Kaguya e dos até 3 conselhos anteriores — e devolve 3 blocos fixos (espelho do dia,
ferramentas e curadoria da base, ações sugeridas) na voz da Violet, ancorados na base de
conhecimento pessoal do usuário (RAG da Kurisu) e, só como complemento quando a base não
cobre, numa busca na web. O bloco "Da sua base" é o centro do produto: cada item traz o
porquê da técnica, como aplicá-la, um exemplo concreto ligado ao dia real da pessoa e um
lembrete de por que vale a pena não esquecer dela.

Mesmo padrão arquitetural do Tutor de Idiomas (spec 031, ``agents/kurisu/tutor.py``): a
lógica mora aqui porque a Kurisu é a dona do domínio RAG (Constitution, Princípio I) — a
Violet contribui só a persona (no prompt) e a UI. Chamada **one-shot** ao Gemini
(``google-genai``, não ADK — o webapp nunca instancia ADK). A tabela ``journal_counsel`` é
criada sob demanda por :func:`_ensure_counsel_tables` (idempotente, mesmo padrão de
``agents/journal/tools.py``). Acesso ao Postgres via psycopg2 síncrono direto.

Honestidade (FR-009/FR-012): a origem de cada item do toolkit ("base" ou "web") é decidida
**no servidor**, por checagem de URI contra os trechos realmente recuperados — nunca
confiamos na auto-declaração do modelo. Quando a base não retorna nenhum trecho relevante,
uma frase honesta é prefixada ao espelho do dia deterministicamente, independente do que o
modelo tenha escrito.

Usage:
    from agents.kurisu import counsel
    resultado = counsel.gerar_conselho(date="2026-07-26")
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

import psycopg2
import psycopg2.extras

from webapp.backend.config import DATABASE_URL as _DATABASE_URL
from agents.journal.tools import get_or_create_page

logger = logging.getLogger("kurisu.counsel")


# ─── Configuração ───────────────────────────────────────────────────────────────

# Nome do modelo Gemini usado nas 3 chamadas (temas, síntese, busca web) — configurável
# via env var para permitir trocar sem redeploy de código.
_MODEL_NAME = os.environ.get("VIOLET_COUNSEL_MODEL", "gemini-2.5-flash")

# Liga/desliga a busca web complementar (User Story 3) sem tocar no resto do pipeline.
_WEB_ENABLED = os.environ.get("VIOLET_COUNSEL_WEB_ENABLED", "true").strip().lower() != "false"

# Teto de consultas à base por conselho (research.md R3 — orçamento de latência p/ SC-007).
_MAX_RAG_QUERIES = 4

# Abaixo deste número de trechos vindos SÓ da wiki, complementa com a busca combinada
# (wiki + memória operacional) — a wiki nunca é descartada, só complementada quando
# insuficiente (achado de produção: a memória operacional, por ter sempre doc_date
# recente, expulsava a wiki do corte final se as duas competessem em pé de igualdade).
_MIN_TRECHOS_WIKI = 2

# Teto de consultas na etapa de complemento (menor que _MAX_RAG_QUERIES para conter o
# orçamento de latência total no caso em que a wiki não cobre nada).
_MAX_FALLBACK_QUERIES = 2


# ─── Conexão ────────────────────────────────────────────────────────────────────

def _get_conn():
    """Abrir uma nova conexão ao PostgreSQL usando DATABASE_URL (mesmo padrão do journal/tutor)."""
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg2.connect(_DATABASE_URL)


# ─── Criação de tabela ──────────────────────────────────────────────────────────

def _ensure_counsel_tables() -> None:
    """Criar a tabela `journal_counsel` se ainda não existir (idempotente).

    Chamada automaticamente na importação deste módulo — mesmo padrão de
    `agents/kurisu/tutor.py::_ensure_tutor_tables`. Ver `data-model.md` da spec 061.
    """
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
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_counsel_created
                ON journal_counsel (created_at DESC)
            """)
            # O bloco "Pergunta para refletir" foi removido do produto (o "Da sua base"
            # ficou mais completo/descritivo em troca) — dropar a coluna em bancos que já
            # tinham a tabela criada antes dessa mudança (idempotente, mesmo padrão de
            # migração usado para outras colunas neste repo).
            cur.execute("ALTER TABLE journal_counsel DROP COLUMN IF EXISTS question")
        conn.commit()
    finally:
        conn.close()


# ─── Erros ──────────────────────────────────────────────────────────────────────

class _CounselError(Exception):
    """Erro ao gerar o conselho — nunca deixa dado parcial gravado (FR-015)."""


# ─── Coleta de sinais (leitura pura, sem IA) ────────────────────────────────────

def _coletar_dia(page_id: int, date: str) -> dict:
    """Ler bullets, registros emocionais, cartas e sonho de um dia (US1, FR-003).

    Args:
        page_id: ID da página (journal_pages) do dia.
        date: Data do dia, no formato YYYY-MM-DD (só para carregar no dict de retorno).

    Returns:
        ``{"date", "dream", "bullets": [...], "emotion_logs": [...], "letters": [...]}``
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT dream FROM journal_pages WHERE id = %s", (page_id,))
            page_row = cur.fetchone()
            dream = page_row["dream"] if page_row else None

            cur.execute("""
                SELECT kind, content, favorite FROM journal_bullets
                WHERE page_id = %s ORDER BY position ASC
            """, (page_id,))
            bullets = [dict(r) for r in cur.fetchall()]

            cur.execute("""
                SELECT e.name AS emotion, l.intensity, l.situation,
                       l.automatic_thought, l.adaptive_response, l.reappraised_intensity
                FROM journal_emotion_logs l
                JOIN journal_emotions e ON e.id = l.emotion_id
                WHERE l.page_id = %s
                ORDER BY l.created_at ASC
            """, (page_id,))
            emotion_logs = [dict(r) for r in cur.fetchall()]

            cur.execute("""
                SELECT recipient, body, status FROM journal_letters
                WHERE page_id = %s ORDER BY created_at ASC
            """, (page_id,))
            letters = [dict(r) for r in cur.fetchall()]

        return {"date": date, "dream": dream, "bullets": bullets,
                "emotion_logs": emotion_logs, "letters": letters}
    finally:
        conn.close()


def _dia_esta_vazio(dia: dict) -> bool:
    """Verificar se não há nada para analisar no dia (guarda contra dia vazio — US1)."""
    return not (dia.get("bullets") or dia.get("emotion_logs") or dia.get("letters") or dia.get("dream"))


def _janela_7_dias(date: str) -> list:
    """Resumir bullets/emoções dos 7 dias anteriores à data (FR-004).

    Uma linha por dia com pelo menos um registro; dias sem nada não aparecem.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT p.date::text AS date,
                       string_agg(DISTINCT b.content, ' | ') AS bullets_resumo,
                       string_agg(DISTINCT e.name, ', ') AS emotions_resumo
                FROM journal_pages p
                LEFT JOIN journal_bullets b ON b.page_id = p.id
                LEFT JOIN journal_emotion_logs l ON l.page_id = p.id
                LEFT JOIN journal_emotions e ON e.id = l.emotion_id
                WHERE p.date >= (%s::date - INTERVAL '7 days') AND p.date < %s::date
                GROUP BY p.date
                HAVING string_agg(DISTINCT b.content, ' | ') IS NOT NULL
                    OR string_agg(DISTINCT e.name, ', ') IS NOT NULL
                ORDER BY p.date ASC
            """, (date, date))
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _conselhos_anteriores(date: str, limit: int = 3) -> list:
    """Ler os `limit` conselhos mais recentes antes da data, resumidos (FR-005, research R6)."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.mirror, c.actions_json
                FROM journal_counsel c
                JOIN journal_pages p ON p.id = c.page_id
                WHERE p.date < %s
                ORDER BY c.created_at DESC
                LIMIT %s
            """, (date, limit))
            rows = cur.fetchall()
        resultado = []
        for r in rows:
            actions = r["actions_json"] if isinstance(r["actions_json"], list) else json.loads(r["actions_json"])
            resultado.append({
                "mirror": r["mirror"],
                "actions": [a.get("texto", "") for a in actions],
            })
        return resultado
    finally:
        conn.close()


def _kaguya_do_dia() -> dict:
    """Ler tarefas de hoje/atrasadas e hábitos ativos da Kaguya (FR-006, research R4).

    Import lazy + best-effort: falha aqui nunca derruba a geração do conselho (Kaguya
    continua sem saber que o conselho existe — Self-Contained Agents).
    """
    try:
        from agents.kaguya.tools_tasks import list_tasks_today
        from agents.kaguya.tools_habits import list_habits

        hoje = list_tasks_today()
        tasks_today = (hoje.get("today") or []) + (hoje.get("overdue") or [])
        habits = list_habits()
        return {"tasks_today": tasks_today, "habits": habits}
    except Exception as exc:  # noqa: BLE001 — leitura auxiliar, nunca crítica
        logger.warning("counsel: não foi possível ler o estado da Kaguya: %s", exc)
        return {"tasks_today": [], "habits": []}


def _resumir_dia_para_prompt(dia: dict) -> str:
    """Montar o texto compacto do dia analisado, para os prompts do Gemini."""
    partes = []
    if dia.get("dream"):
        partes.append(f"Sonho: {dia['dream']}")
    for b in dia.get("bullets", []):
        partes.append(f"[{b['kind']}] {b['content']}")
    for e in dia.get("emotion_logs", []):
        linha = f"Emoção: {e['emotion']} (intensidade {e['intensity']}/10)"
        if e.get("situation"):
            linha += f" — situação: {e['situation']}"
        if e.get("automatic_thought"):
            linha += f" — pensamento automático: {e['automatic_thought']}"
        if e.get("adaptive_response"):
            linha += f" — resposta adaptativa: {e['adaptive_response']}"
        partes.append(linha)
    for letter in dia.get("letters", []):
        partes.append(f"Carta para {letter['recipient']}: {letter['body']}")
    return "\n".join(partes) if partes else "(sem conteúdo)"


# ─── Chamadas ao Gemini (one-shot, google-genai) ────────────────────────────────

_TEMAS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "queries": {"type": "ARRAY", "items": {"type": "STRING"}},
        "carga_emocional": {"type": "STRING"},
    },
    "required": ["queries", "carga_emocional"],
}

_SINTESE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "mirror": {"type": "STRING"},
        "toolkit": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "titulo": {"type": "STRING"},
                    # Por que essa ferramenta/técnica importa em geral — o princípio por
                    # trás dela, não apenas uma definição de dicionário.
                    "porque": {"type": "STRING"},
                    # Passo a passo prático de como aplicar.
                    "como": {"type": "STRING"},
                    # Exemplo CONCRETO ligado ao que a pessoa escreveu HOJE — mostra
                    # exatamente onde a ferramenta se encaixa na situação atual dela, não
                    # um exemplo genérico de manual.
                    "exemplo_hoje": {"type": "STRING"},
                    # Lembrete curto de por que isso importa / por que é fácil esquecer
                    # disso justamente nos dias em que mais se precisa dele (o motivo de a
                    # feature existir — resurfaçar curadoria esquecida).
                    "lembrete": {"type": "STRING"},
                    # Índice (1-based) do trecho em "TRECHOS DA BASE" de onde a sugestão
                    # vem, ou 0 se não vier de nenhum trecho listado. Um inteiro pequeno é
                    # muito mais confiável para o modelo acertar do que copiar uma uri
                    # inteira (research.md — causa raiz do "só aparece fonte externa").
                    "trecho_index": {"type": "INTEGER"},
                    # Só usado quando trecho_index=0: nome curto de onde veio a sugestão
                    # externa (ex.: "busca na web"). Ignorado quando trecho_index>0.
                    "fonte_web": {"type": "STRING"},
                },
                "required": [
                    "titulo", "porque", "como", "exemplo_hoje", "lembrete",
                    "trecho_index", "fonte_web",
                ],
            },
        },
        "actions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "texto": {"type": "STRING"},
                    "motivo": {"type": "STRING"},
                },
                "required": ["texto", "motivo"],
            },
        },
    },
    "required": ["mirror", "toolkit", "actions"],
}


def _call_gemini_json(prompt: str, schema: dict) -> dict:
    """Chamar o Gemini one-shot e devolver o JSON validado contra `schema`.

    Raises:
        _CounselError: falha de rede/API ou resposta que não valida como JSON.
    """
    try:
        from google import genai  # import lazy — evita custo de import em quem não usa a Violet

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise _CounselError("GEMINI_API_KEY não configurada")

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=_MODEL_NAME,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": schema,
            },
        )
        return json.loads(resp.text)
    except _CounselError:
        raise
    except Exception as exc:  # rede, quota, JSON malformado, etc.
        logger.warning("Falha na chamada ao Gemini (counsel): %s", exc)
        raise _CounselError(
            "Não consegui falar com a IA agora. Tente novamente em instantes."
        ) from exc


def _call_gemini_web(prompt: str) -> Optional[str]:
    """Chamar o Gemini com busca web habilitada, SEM `response_schema` (research.md R2 —
    `google_search` e `response_schema` são mutuamente exclusivos na mesma chamada).

    Best-effort: qualquer falha devolve None (a busca web é sempre um complemento —
    nunca impede o conselho de ser gerado).
    """
    try:
        from google import genai

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return None

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=_MODEL_NAME,
            contents=prompt,
            config={"tools": [{"google_search": {}}]},
        )
        return resp.text
    except Exception as exc:  # noqa: BLE001 — busca web é complementar, nunca crítica
        logger.warning("counsel: falha na busca web complementar: %s", exc)
        return None


def _extrair_temas(dia: dict) -> dict:
    """Extrair de 2 a 4 consultas de busca + a carga emocional do dia (etapa A)."""
    texto_dia = _resumir_dia_para_prompt(dia)
    prompt = f"""Leia o resumo de um dia de diário pessoal abaixo e extraia:
1. queries: de 2 a 4 buscas curtas (em português, focadas em CONCEITOS/temas — não frases
   literais do diário) que ajudariam a encontrar, numa base de conhecimento pessoal
   (modelos mentais, técnicas de psicologia, produtividade, autoconhecimento), material
   relevante para os problemas ou sentimentos apontados.
2. carga_emocional: uma palavra ou frase curta descrevendo o tom emocional geral do dia
   (ex.: "tristeza", "ansiedade leve", "neutro", "entusiasmo").

DIA:
\"\"\"{texto_dia}\"\"\"

Responda SOMENTE no JSON estruturado pedido."""
    return _call_gemini_json(prompt, _TEMAS_SCHEMA)


def _selecionar_queries(temas: dict) -> list:
    """Aplicar o teto de `_MAX_RAG_QUERIES` às queries extraídas (research.md R3) — puro."""
    return (temas.get("queries") or [])[:_MAX_RAG_QUERIES]


def _merge_dedup_trechos(varias_listas: list) -> list:
    """Mesclar várias listas de trechos preservando a 1ª ocorrência de cada `uri` — puro,
    sem rede/banco (testável isoladamente em `tests/agents/test_kurisu_counsel.py`).
    """
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
    """Chamar `fn(query)` (uma função no formato de `buscar_na_wiki`/`buscar_na_base`)
    para cada query, coletando as listas de trechos com status "ok". Uma falha isolada
    não derruba as outras consultas.
    """
    listas = []
    for q in queries:
        try:
            resultado = fn(q)
        except Exception as exc:  # noqa: BLE001
            logger.warning("counsel: falha ao consultar '%s' via %s: %s", q, fn.__name__, exc)
            continue
        if resultado.get("status") == "ok":
            listas.append(resultado.get("trechos") or [])
    return listas


def _consultar_rag(temas: dict) -> list:
    """Consultar a base priorizando a wiki curada, complementando com a memória
    operacional só quando a wiki não for suficiente (etapa B).

    A wiki é a curadoria que a feature existe para resurfaçar — a memória operacional
    (bullets/tarefas antigos) nunca deve expulsá-la do resultado, então ela é buscada
    primeiro e isoladamente (`buscar_na_wiki`, sem a competição de recência que
    `buscar_na_base` aplicaria). Só entra a busca combinada se a wiki sozinha render
    menos de `_MIN_TRECHOS_WIKI` trechos.
    """
    from agents.kurisu.tools import buscar_na_wiki, buscar_na_base

    queries = _selecionar_queries(temas)

    trechos_wiki = _merge_dedup_trechos(_consultar_varios(buscar_na_wiki, queries))
    if len(trechos_wiki) >= _MIN_TRECHOS_WIKI:
        return trechos_wiki

    trechos_combinados = _merge_dedup_trechos(
        _consultar_varios(buscar_na_base, queries[:_MAX_FALLBACK_QUERIES])
    )
    return _merge_dedup_trechos([trechos_wiki, trechos_combinados])


def _precisa_busca_web(rag_trechos: list) -> bool:
    """Gate da busca web complementar (research.md R3): menos de 2 trechos relevantes."""
    return len(rag_trechos) < 2


def _buscar_web(temas: dict) -> Optional[str]:
    """Buscar informação complementar na web quando a base não cobre (etapa C, US3)."""
    if not _WEB_ENABLED:
        return None
    queries = ", ".join((temas.get("queries") or [])[:2])
    if not queries:
        return None
    prompt = f"""Busque informação confiável e prática (técnicas reconhecidas, modelos
mentais, abordagens conhecidas) sobre: {queries}. Responda em português, de forma objetiva
e resumida (até 6 frases), citando a fonte quando possível."""
    return _call_gemini_web(prompt)


def _sintetizar(
    dia: dict,
    janela_7d: list,
    conselhos_anteriores: list,
    kaguya: dict,
    rag_trechos: list,
    web_texto: Optional[str],
) -> dict:
    """Produzir os 4 blocos do conselho na voz da Violet (etapa D)."""
    texto_dia = _resumir_dia_para_prompt(dia)

    bloco_janela = "\n".join(
        f"- {d['date']}: {d.get('bullets_resumo') or '(sem bullets)'}"
        + (f" | emoções: {d['emotions_resumo']}" if d.get("emotions_resumo") else "")
        for d in janela_7d
    ) or "(sem registros nos últimos 7 dias)"

    bloco_anteriores = "\n".join(
        f"- {c['mirror']} (sugeriu: {', '.join(c['actions']) or 'nada'})"
        for c in conselhos_anteriores
    ) or "(nenhum conselho anterior)"

    bloco_kaguya = ""
    tarefas = (kaguya or {}).get("tasks_today") or []
    habitos = (kaguya or {}).get("habits") or []
    if tarefas:
        bloco_kaguya += "Tarefas de hoje/atrasadas: " + "; ".join(
            t.get("title", "") for t in tarefas[:8]
        ) + "\n"
    if habitos:
        parados = [h["name"] for h in habitos if not h.get("done_today") and h.get("trend") == "down"]
        if parados:
            bloco_kaguya += "Hábitos em queda e não feitos hoje: " + ", ".join(parados)
    bloco_kaguya = bloco_kaguya or "(nada relevante)"

    bloco_rag = "\n".join(
        f"[{i + 1}] fonte={t.get('fonte')} uri={t.get('uri')}\n{t.get('texto')}"
        for i, t in enumerate(rag_trechos)
    ) or "(nenhum trecho relevante encontrado na base de conhecimento pessoal)"

    bloco_web = (
        f"\nInformação complementar da web (NÃO é da base pessoal do usuário):\n{web_texto}"
        if web_texto else ""
    )

    prompt = f"""Você é Violet, a companheira de escrita do diário pessoal do usuário. Tom
caloroso, gentil, sincero e direto — sem frieza nem clichês genéricos; valida o que a
pessoa sente antes de sugerir algo.

Leia o dia de hoje, o contexto dos últimos 7 dias, os conselhos anteriores (para dar
continuidade — não repita como se fosse inédito) e os trechos recuperados da base de
conhecimento pessoal do usuário (curadoria que ELE MESMO já fez — vídeos, textos, técnicas
que salvou). Gere um conselho com 3 blocos:

1. mirror: um resumo curto e empático (3 a 5 frases) do que você leu no dia — temas, humor,
   o que pesou.
2. toolkit: de 2 a 4 sugestões de ferramentas/técnicas/materiais — este é o bloco central
   do conselho ("Da sua base: ferramentas e curadoria"), então capriche na profundidade e
   na conexão com o dia real da pessoa, não em generalidades de manual. Para cada item:
   - titulo: nome curto da ferramenta/técnica/material.
   - porque: por que ela importa DE VERDADE — o princípio por trás, não uma definição de
     dicionário. Ajude a pessoa a entender o mecanismo, não só o nome.
   - como: passo a passo prático e concreto de como aplicar — algo que dá para fazer hoje
     mesmo, não uma ideia abstrata.
   - exemplo_hoje: um exemplo CONCRETO ligado ao que a pessoa escreveu especificamente
     hoje — mostre exatamente onde e como essa ferramenta se encaixaria na situação real
     dela (ex.: "você mencionou X às 22h — é exatamente o tipo de situação em que Y
     funciona, porque..."). Nunca um exemplo genérico desconectado do dia.
   - lembrete: uma frase que reforce por que vale a pena lembrar disso agora — em especial
     se for algo que a pessoa já estudou/salvou antes mas é fácil esquecer justamente nos
     dias em que mais precisaria dele. Esse é o propósito central da feature: resurfaçar
     curadoria esquecida no momento certo.
   - trecho_index: o NÚMERO (o "[N]") do trecho da lista "TRECHOS DA BASE" abaixo de onde
     a sugestão realmente vem — só se ela vier genuinamente de lá. Se a sugestão não vier
     de nenhum trecho listado (ex.: veio da informação complementar da web, ou é algo que
     você sabe mas não está nos trechos), use trecho_index = 0 e preencha fonte_web com um
     nome curto da origem (ex.: "busca na web"). NUNCA use um trecho_index só porque parece
     relacionado — só se a sugestão vier mesmo do conteúdo daquele trecho específico.
3. actions: de 1 a 3 próximos passos concretos e pequenos.

DIA DE HOJE:
\"\"\"{texto_dia}\"\"\"

ÚLTIMOS 7 DIAS (resumo):
{bloco_janela}

CONSELHOS ANTERIORES (para continuidade — não repita como novidade):
{bloco_anteriores}

CONTEXTO DE TAREFAS/HÁBITOS:
{bloco_kaguya}

TRECHOS DA BASE DE CONHECIMENTO PESSOAL:
{bloco_rag}
{bloco_web}

Responda SOMENTE no JSON estruturado pedido."""

    return _call_gemini_json(prompt, _SINTESE_SCHEMA)


def _normalize_toolkit(raw_items: list, rag_trechos: list) -> list:
    """Decidir `origem`/`fonte`/`uri` de cada item do toolkit no SERVIDOR, por índice.

    Nunca confia em texto livre que o modelo devolvesse para fonte/uri (mesmo espírito de
    `_normalize_slug` no Tutor de Idiomas) — só um inteiro pequeno (`trecho_index`), que é
    muito mais fácil do modelo acertar do que copiar uma uri inteira. `fonte`/`uri` do item
    "base" vêm sempre dos nossos próprios `rag_trechos`, nunca do texto do modelo.

    Args:
        raw_items: Itens do toolkit como o Gemini devolveu (`{titulo, porque, como,
            exemplo_hoje, lembrete, trecho_index, fonte_web}`).
        rag_trechos: A lista de trechos realmente recuperada (mesma ordem/numeração
            `[1..N]` usada no prompt de `_sintetizar`).

    Returns:
        Lista de `{titulo, porque, como, exemplo_hoje, lembrete, fonte, uri, origem}`
        prontos para persistir.
    """
    normalizado = []
    for item in raw_items:
        idx = item.get("trecho_index")
        trecho = None
        if isinstance(idx, int) and 1 <= idx <= len(rag_trechos):
            trecho = rag_trechos[idx - 1]

        base_item = {
            "titulo": item.get("titulo", ""),
            "porque": item.get("porque", ""),
            "como": item.get("como", ""),
            "exemplo_hoje": item.get("exemplo_hoje", ""),
            "lembrete": item.get("lembrete", ""),
        }

        if trecho:
            normalizado.append({
                **base_item,
                "fonte": trecho.get("fonte", ""),
                "uri": trecho.get("uri", ""),
                "origem": "base",
            })
        else:
            normalizado.append({
                **base_item,
                "fonte": item.get("fonte_web", "") or "busca na web",
                "uri": "",
                "origem": "web",
            })
    return normalizado


# ─── Serialização ────────────────────────────────────────────────────────────────

def _serialize_counsel_row(row: dict, date: str) -> dict:
    """Converter uma linha de `journal_counsel` (+ a data do dia) na forma `Counsel` da API."""
    toolkit = row["toolkit_json"] if isinstance(row["toolkit_json"], list) else json.loads(row["toolkit_json"])
    actions = row["actions_json"] if isinstance(row["actions_json"], list) else json.loads(row["actions_json"])
    return {
        "page_id": row["page_id"],
        "date": date,
        "mirror": row["mirror"],
        "toolkit": toolkit,
        "actions": actions,
        "used_web": row["used_web"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


# ─── Geração (US1) ───────────────────────────────────────────────────────────────

def gerar_conselho(date: str, type_id: int = 1) -> dict:
    """Gerar (ou regenerar) o conselho do dia — o pipeline completo (US1/US2/US3).

    Transacional: toda a coleta e as chamadas de IA acontecem **antes** de abrir a
    transação de escrita — falha em qualquer etapa devolve `status: error` sem gravar
    nada (FR-015, mesmo padrão de `agents/kurisu/tutor.py::analisar_escrita`).

    Args:
        date: Data do dia a analisar, formato YYYY-MM-DD.
        type_id: ID do tipo de diário (default 1 = personal).

    Returns:
        `{"status": "ok", "counsel": {...}}` ou `{"status": "error", "message": ...}`.
    """
    page_result = get_or_create_page(date=date, type_id=type_id)
    if page_result.get("error"):
        return {"status": "error", "message": page_result["error"]}
    page_id = page_result["page"]["id"]

    dia = _coletar_dia(page_id, date)
    if _dia_esta_vazio(dia):
        return {"status": "error", "message": "Ainda não há nada escrito neste dia para analisar."}

    janela_7d = _janela_7_dias(date)
    conselhos_anteriores = _conselhos_anteriores(date, limit=3)
    kaguya = _kaguya_do_dia()

    try:
        temas = _extrair_temas(dia)
    except _CounselError as exc:
        return {"status": "error", "message": str(exc)}

    rag_trechos = _consultar_rag(temas)

    web_texto = None
    if _precisa_busca_web(rag_trechos):
        web_texto = _buscar_web(temas)  # best-effort — None em qualquer falha

    try:
        sintese = _sintetizar(dia, janela_7d, conselhos_anteriores, kaguya, rag_trechos, web_texto)
    except _CounselError as exc:
        return {"status": "error", "message": str(exc)}

    toolkit = _normalize_toolkit(sintese.get("toolkit") or [], rag_trechos)
    used_web = any(item["origem"] == "web" for item in toolkit)

    # Honestidade determinística (FR-009): quando a base não retornou NADA, a frase
    # entra sempre, independente do que o modelo tenha escrito no mirror.
    mirror = sintese.get("mirror", "")
    if not rag_trechos:
        prefixo = "Não encontrei nada equivalente na sua base de conhecimento para o que você escreveu hoje."
        mirror = f"{prefixo} {mirror}".strip()

    signals = {
        "bullets": len(dia["bullets"]),
        "emotion_logs": len(dia["emotion_logs"]),
        "letters": len(dia["letters"]),
        "janela_7d_dias": len(janela_7d),
        "conselhos_anteriores": len(conselhos_anteriores),
        "kaguya_tasks_hoje": len(kaguya.get("tasks_today", [])),
        "kaguya_habitos": len(kaguya.get("habits", [])),
        "rag_trechos": len(rag_trechos),
        "used_web": used_web,
    }

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Preserva vínculos de tarefa já feitos (task_id) ao regenerar — casa a ação
            # nova com a antiga pelo texto (data-model.md, "cuidado ao regenerar").
            cur.execute("SELECT actions_json FROM journal_counsel WHERE page_id = %s", (page_id,))
            prev_row = cur.fetchone()
            prev_task_ids = {}
            if prev_row and prev_row["actions_json"]:
                prev_list = (
                    prev_row["actions_json"] if isinstance(prev_row["actions_json"], list)
                    else json.loads(prev_row["actions_json"])
                )
                prev_task_ids = {a["texto"]: a.get("task_id") for a in prev_list if a.get("task_id")}

            actions = [
                {
                    "texto": a.get("texto", ""),
                    "motivo": a.get("motivo", ""),
                    "task_id": prev_task_ids.get(a.get("texto", "")),
                }
                for a in (sintese.get("actions") or [])
            ]

            cur.execute("""
                INSERT INTO journal_counsel
                    (page_id, mirror, toolkit_json, actions_json, signals_json,
                     used_web, model)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (page_id) DO UPDATE SET
                    mirror = EXCLUDED.mirror,
                    toolkit_json = EXCLUDED.toolkit_json,
                    actions_json = EXCLUDED.actions_json,
                    signals_json = EXCLUDED.signals_json,
                    used_web = EXCLUDED.used_web,
                    model = EXCLUDED.model,
                    updated_at = NOW()
                RETURNING id, page_id, mirror, toolkit_json, actions_json,
                          used_web, model, created_at, updated_at
            """, (
                page_id, mirror, json.dumps(toolkit), json.dumps(actions),
                json.dumps(signals), used_web, _MODEL_NAME,
            ))
            row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {"status": "ok", "counsel": _serialize_counsel_row(row, date)}


# ─── Leituras (US1/US2) ──────────────────────────────────────────────────────────

def get_conselho(date: str, type_id: int = 1) -> Optional[dict]:
    """Devolver o conselho já gerado de uma data, ou `None` se não existir.

    Leitura pura — NÃO cria a página (diferente de `get_or_create_page`); se a página
    ainda não existe, não pode haver conselho, então devolve `None` direto.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.id, c.page_id, c.mirror, c.toolkit_json, c.actions_json,
                       c.used_web, c.model, c.created_at, c.updated_at
                FROM journal_counsel c
                JOIN journal_pages p ON p.id = c.page_id
                WHERE p.type_id = %s AND p.date = %s
            """, (type_id, date))
            row = cur.fetchone()
        return _serialize_counsel_row(row, date) if row else None
    finally:
        conn.close()


def list_conselhos(limit: int = 20) -> list:
    """Listar os conselhos mais recentes (qualquer data) — histórico + insumo de continuidade."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.page_id, p.date::text AS date, c.mirror, c.used_web, c.created_at
                FROM journal_counsel c
                JOIN journal_pages p ON p.id = c.page_id
                ORDER BY c.created_at DESC
                LIMIT %s
            """, (limit,))
            rows = cur.fetchall()
        resultado = []
        for r in rows:
            item = dict(r)
            item["created_at"] = item["created_at"].isoformat() if item["created_at"] else None
            resultado.append(item)
        return resultado
    finally:
        conn.close()


def marcar_acao_como_tarefa(page_id: int, action_index: int, task_id: int) -> dict:
    """Gravar `task_id` na ação sugerida `action_index` de um conselho (US2, FR-014).

    Returns:
        `{"status": "ok", "counsel": {...}}` ou `{"status": "error", "message": ...}`
        (sem conselho para o `page_id`, ou índice fora do intervalo — o router traduz
        para HTTP 404).
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT c.id, c.actions_json, p.date::text AS date
                FROM journal_counsel c
                JOIN journal_pages p ON p.id = c.page_id
                WHERE c.page_id = %s
            """, (page_id,))
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "conselho não encontrado para esse dia"}

            actions = row["actions_json"] if isinstance(row["actions_json"], list) else json.loads(row["actions_json"])
            if action_index < 0 or action_index >= len(actions):
                return {"status": "error", "message": "ação fora do intervalo"}

            actions[action_index]["task_id"] = task_id
            cur.execute("""
                UPDATE journal_counsel SET actions_json = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING id, page_id, mirror, toolkit_json, actions_json,
                          used_web, model, created_at, updated_at
            """, (json.dumps(actions), row["id"]))
            updated = cur.fetchone()
            date_str = row["date"]
        conn.commit()
        return {"status": "ok", "counsel": _serialize_counsel_row(updated, date_str)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─── Inicialização automática ───────────────────────────────────────────────────

# Ao importar o módulo, tenta criar a tabela — mesmo padrão de agents/kurisu/tutor.py e
# agents/journal/tools.py. Se o banco não estiver disponível ainda, só avisa; a criação
# será tentada de novo na primeira chamada real a uma função deste módulo.
try:
    _ensure_counsel_tables()
except Exception as exc:  # noqa: BLE001
    logger.warning("counsel: não foi possível criar a tabela ao importar o módulo: %s", exc)
