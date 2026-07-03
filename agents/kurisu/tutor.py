"""Tutor de Idiomas na Violet — Kurisu analisa a escrita em inglês do diário (spec 031).

Persona da Kurisu aplicada a um domínio novo: em vez de responder sobre a base de
conhecimento (``agents/kurisu/tools.py``), aqui ela analisa um bullet do diário via uma
chamada **one-shot** ao Gemini (`google-genai`, não ADK — o webapp nunca instancia ADK,
ver ``webapp/CLAUDE.md``) e devolve correção gramatical, reescrita natural, erros por
conceito, resumo no tom dela e uma nota 0–100.

As tabelas ``journal_tutor_*`` são criadas sob demanda por :func:`_ensure_tutor_tables`
(idempotente, mesmo padrão de ``agents/journal/tools.py``). O acesso ao Postgres usa
psycopg2 síncrono direto — mesmo padrão dos outros agentes; não há reuso do pool/conexão
do journal (agentes não importam uns aos outros, só o router do webapp compõe os dois).

Por que aqui e não em ``agents/journal/``: o tutor É a Kurisu (persona + gancho futuro
com a memória unificada dela — spec 028). O acoplamento cross-domain (FK para
``journal_bullets``) é aceito e documentado (ver Constitution Check do `plan.md` da 031);
``agents/journal/`` continua sem depender da Kurisu — quem compõe os dois é o router
(`webapp/backend/routers/journal.py`).

Usage:
    from agents.kurisu import tutor
    resultado = tutor.analisar_escrita(bullet_id=42, language="en")
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

import psycopg2
import psycopg2.extras

from webapp.backend.config import DATABASE_URL as _DATABASE_URL
from agents.kurisu import tutor_mastery as _mastery

logger = logging.getLogger("kurisu.tutor")


# ─── Conexão ───────────────────────────────────────────────────────────────────

def _get_conn():
    """Abrir uma nova conexão ao PostgreSQL usando DATABASE_URL (mesmo padrão do journal)."""
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg2.connect(_DATABASE_URL)


# ─── Vocabulário canônico de conceitos gramaticais (inglês) ────────────────────
# Lista curada (~25 conceitos comuns a aprendizes brasileiros de inglês) + o rótulo
# em PT-BR. Injetada no prompt do Gemini para manter os slugs estáveis entre análises
# — sem isso, "verb to be" numa análise e "to-be verb" na próxima quebrariam o
# acúmulo por conceito (a EMA de tutor_mastery.py trataria como conceitos distintos).
# Qualquer slug fora desta lista é normalizado para "outros" (ver _normalize_slug).
CONCEPTS_EN: list[dict] = [
    {"slug": "verb-to-be", "label": "Verbo \"to be\""},
    {"slug": "subject-verb-agreement", "label": "Concordância verbal"},
    {"slug": "articles", "label": "Artigos (a/an/the)"},
    {"slug": "plurals", "label": "Plural de substantivos"},
    {"slug": "past-simple", "label": "Passado simples"},
    {"slug": "present-perfect", "label": "Presente perfeito"},
    {"slug": "present-continuous", "label": "Presente contínuo"},
    {"slug": "future-forms", "label": "Formas de futuro"},
    {"slug": "modal-verbs", "label": "Verbos modais"},
    {"slug": "prepositions", "label": "Preposições"},
    {"slug": "word-order", "label": "Ordem das palavras"},
    {"slug": "question-formation", "label": "Formação de perguntas"},
    {"slug": "negation", "label": "Negação"},
    {"slug": "pronouns", "label": "Pronomes"},
    {"slug": "possessives", "label": "Possessivos"},
    {"slug": "comparatives-superlatives", "label": "Comparativo e superlativo"},
    {"slug": "gerund-infinitive", "label": "Gerúndio vs. infinitivo"},
    {"slug": "phrasal-verbs", "label": "Phrasal verbs"},
    {"slug": "conditionals", "label": "Condicionais"},
    {"slug": "passive-voice", "label": "Voz passiva"},
    {"slug": "countable-uncountable", "label": "Contáveis vs. incontáveis"},
    {"slug": "false-friends", "label": "Falsos cognatos"},
    {"slug": "word-choice", "label": "Escolha de palavras / vocabulário"},
    {"slug": "spelling", "label": "Ortografia"},
    {"slug": "punctuation", "label": "Pontuação"},
    {"slug": "tense-consistency", "label": "Consistência de tempo verbal"},
    {"slug": "conjunctions", "label": "Conjunções"},
]

_OUTROS_SLUG = "outros"
_OUTROS_LABEL = "Outros"

_CONCEPT_LABELS: dict[str, str] = {c["slug"]: c["label"] for c in CONCEPTS_EN}
_CONCEPT_LABELS[_OUTROS_SLUG] = _OUTROS_LABEL
_VALID_SLUGS: set[str] = set(_CONCEPT_LABELS.keys())


def _normalize_slug(slug: Optional[str]) -> str:
    """Normalizar um slug de conceito vindo do Gemini para o vocabulário canônico.

    Qualquer slug que não esteja em :data:`CONCEPTS_EN` (incluindo ``None``/vazio)
    vira ``"outros"`` — o bucket de fallback (FR-014).
    """
    if slug and slug in _VALID_SLUGS:
        return slug
    return _OUTROS_SLUG


def _label_for(slug: str) -> str:
    """Rótulo PT-BR de um slug já normalizado."""
    return _CONCEPT_LABELS.get(slug, _OUTROS_LABEL)


# ─── Criação de tabelas ─────────────────────────────────────────────────────────

def _ensure_tutor_tables() -> None:
    """Criar as 4 tabelas do Tutor de Idiomas se ainda não existirem (idempotente).

    Chamada automaticamente na importação deste módulo — mesmo padrão de
    ``agents/journal/tools.py::_ensure_tables``. Ver ``data-model.md`` da spec 031
    para o desenho completo de cada tabela.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Uma linha por análise pedida — pertence a um bullet.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_tutor_analyses (
                    id              SERIAL PRIMARY KEY,
                    bullet_id       INT NOT NULL REFERENCES journal_bullets(id) ON DELETE CASCADE,
                    language        TEXT NOT NULL,
                    original_text   TEXT NOT NULL,
                    corrected_text  TEXT NOT NULL,
                    natural_rewrite TEXT,
                    errors_json     JSONB NOT NULL DEFAULT '[]',
                    summary         TEXT NOT NULL,
                    score           INT NOT NULL,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tutor_analyses_bullet
                ON journal_tutor_analyses (bullet_id)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tutor_analyses_lang_created
                ON journal_tutor_analyses (language, created_at DESC)
            """)

            # Fonte da verdade do progresso — 1 linha por (análise × conceito).
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_tutor_events (
                    id           SERIAL PRIMARY KEY,
                    analysis_id  INT NOT NULL REFERENCES journal_tutor_analyses(id) ON DELETE CASCADE,
                    language     TEXT NOT NULL,
                    concept_slug TEXT NOT NULL,
                    concept_label TEXT NOT NULL,
                    correct      BOOLEAN NOT NULL,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tutor_events_series
                ON journal_tutor_events (language, concept_slug, created_at)
            """)

            # Cache materializado por conceito — recomputável a partir dos events.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_tutor_skills (
                    id            SERIAL PRIMARY KEY,
                    language      TEXT NOT NULL,
                    concept_slug  TEXT NOT NULL,
                    concept_label TEXT NOT NULL,
                    mastery       REAL NOT NULL DEFAULT 0,
                    prev_mastery  REAL NOT NULL DEFAULT 0,
                    trend         TEXT NOT NULL DEFAULT 'flat',
                    samples       INT NOT NULL DEFAULT 0,
                    correct       INT NOT NULL DEFAULT 0,
                    last_seen     TIMESTAMPTZ,
                    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (language, concept_slug)
                )
            """)

            # Guia de estudo — no máximo um ativo por idioma (índice único parcial).
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_tutor_guides (
                    id               SERIAL PRIMARY KEY,
                    language         TEXT NOT NULL,
                    description      TEXT NOT NULL,
                    target_concepts  JSONB NOT NULL DEFAULT '[]',
                    active           BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_guides_active
                ON journal_tutor_guides (language) WHERE active
            """)

        conn.commit()
    finally:
        conn.close()


# ─── Chamada ao Gemini (one-shot, google-genai) ────────────────────────────────

class _TutorAnalysisError(Exception):
    """Erro ao obter/interpretar a análise do Gemini — nunca deixa dado parcial gravado."""


# response_schema no formato aceito pelo google-genai (subset de OpenAPI/JSON Schema).
_TUTOR_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "corrected_text": {"type": "STRING"},
        "natural_rewrite": {"type": "STRING"},
        "errors": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "concept_slug": {"type": "STRING"},
                    "wrong": {"type": "STRING"},
                    "right": {"type": "STRING"},
                    "explanation": {"type": "STRING"},
                    "severity": {"type": "STRING", "enum": ["low", "medium", "high"]},
                },
                "required": ["concept_slug", "wrong", "right", "explanation", "severity"],
            },
        },
        "concepts_used_correctly": {"type": "ARRAY", "items": {"type": "STRING"}},
        "summary": {"type": "STRING"},
        "score": {"type": "INTEGER"},
    },
    "required": ["corrected_text", "natural_rewrite", "errors", "concepts_used_correctly", "summary", "score"],
}


def _build_prompt(text: str, language: str, guide: Optional[dict] = None) -> str:
    """Montar o prompt enviado ao Gemini — persona Kurisu + vocabulário canônico + guia opcional.

    Args:
        text: Conteúdo do bullet a analisar.
        language: Código do idioma-alvo (ex.: "en").
        guide: Guia de estudo ativo (``{"description", "target_concepts"}``) ou ``None``.
    """
    concept_lines = "\n".join(f"- {c['slug']}: {c['label']}" for c in CONCEPTS_EN)

    guia_bloco = ""
    if guide and guide.get("description"):
        alvos = ", ".join(guide.get("target_concepts") or []) or "nenhum específico"
        guia_bloco = f"""
O usuário está seguindo um guia de estudo ativo:
- Foco: {guide['description']}
- Conceitos-alvo: {alvos}
Dê ênfase extra a esses conceitos na análise (mesmo que não apareçam no texto, comente
brevemente no resumo o quanto ele já domina esses alvos, se fizer sentido)."""

    return f"""Você é Kurisu Makise atuando como tutora de {language} para um brasileiro
aprendendo a escrever. Analise o texto abaixo (idioma-alvo: {language}) e devolva:

1. corrected_text: o texto com CORREÇÃO GRAMATICAL MÍNIMA — preserve ao máximo o estilo e
   as palavras do autor, só corrija o que estiver gramaticalmente errado.
2. natural_rewrite: como um FALANTE NATIVO escreveria a mesma ideia — pode reformular
   livremente para soar mais natural/idiomático (não precisa preservar a estrutura original).
3. errors: lista de erros encontrados, cada um com concept_slug (escolha o mais específico
   da lista canônica abaixo; se nenhum se encaixar bem, use "outros"), wrong (o trecho errado),
   right (a correção), explanation (explicação do conceito em PORTUGUÊS, clara e didática) e
   severity (low/medium/high).
4. concepts_used_correctly: slugs (da lista canônica) que o autor usou CORRETAMENTE no texto
   (reconhecimento positivo — importante para medir evolução, não só erros).
5. summary: um resumo curto (2-4 frases) do que foi ensinado nesta análise, em PORTUGUÊS, na
   sua voz característica (direta, rigorosa, levemente sarcástica, mas dedicada ao crescimento
   do usuário).
6. score: nota de 0 a 100 para a qualidade gramatical do texto.

Vocabulário canônico de conceitos (use SOMENTE estes slugs, ou "outros"):
{concept_lines}
{guia_bloco}

TEXTO A ANALISAR:
\"\"\"{text}\"\"\"

Responda SOMENTE no JSON estruturado pedido — nada de texto fora do JSON."""


def _call_gemini(prompt: str) -> dict:
    """Chamar o Gemini one-shot e devolver o JSON já validado contra o schema.

    Raises:
        _TutorAnalysisError: falha de rede/API ou resposta que não valida como JSON.
    """
    try:
        from google import genai  # import lazy — evita custo de import em quem não usa o tutor

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise _TutorAnalysisError("GEMINI_API_KEY não configurada")

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": _TUTOR_SCHEMA,
            },
        )
        return json.loads(resp.text)
    except _TutorAnalysisError:
        raise
    except Exception as exc:  # rede, quota, JSON malformado, etc.
        logger.warning("Falha na chamada ao Gemini (tutor): %s", exc)
        raise _TutorAnalysisError(
            "Não consegui falar com a IA agora. Tente novamente em instantes."
        ) from exc


# ─── Guia de estudo ─────────────────────────────────────────────────────────────

def get_active_guide(language: str) -> Optional[dict]:
    """Devolver o guia de estudo ativo do idioma, ou ``None`` se não houver.

    Returns:
        ``{"id", "language", "description", "target_concepts", "created_at", "updated_at"}``
        ou ``None``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, language, description, target_concepts, created_at, updated_at
                FROM journal_tutor_guides
                WHERE language = %s AND active
            """, (language,))
            row = cur.fetchone()
        if not row:
            return None
        guide = dict(row)
        guide["created_at"] = guide["created_at"].isoformat()
        guide["updated_at"] = guide["updated_at"].isoformat()
        return guide
    finally:
        conn.close()


def set_active_guide(language: str, description: str, target_concepts: Optional[list[str]] = None) -> dict:
    """Criar/substituir o guia de estudo ativo do idioma (US4, FR-015).

    Desativa o guia anterior (se houver) e ativa o novo na mesma transação — o índice
    único parcial (`uq_tutor_guides_active`) garante no máximo um ativo por idioma.
    Editar/remover o guia só afeta análises futuras (FR-018) — análises já salvas não
    são retroativamente alteradas.

    Args:
        language: Idioma do guia (ex.: "en").
        description: Descrição livre do foco (livro/método/tópico).
        target_concepts: Slugs-alvo da lista canônica (opcional).

    Returns:
        ``{"status": "ok", "guide": {...}}`` ou ``{"status": "error", "message": ...}``.
    """
    clean_description = (description or "").strip()
    if not clean_description:
        return {"status": "error", "message": "descrição do guia não pode ser vazia"}

    targets = target_concepts or []
    invalid = [slug for slug in targets if slug not in _VALID_SLUGS or slug == _OUTROS_SLUG]
    if invalid:
        return {"status": "error", "message": f"conceitos-alvo inválidos: {', '.join(invalid)}"}

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                UPDATE journal_tutor_guides SET active = FALSE
                WHERE language = %s AND active
            """, (language,))
            cur.execute("""
                INSERT INTO journal_tutor_guides (language, description, target_concepts, active)
                VALUES (%s, %s, %s, TRUE)
                RETURNING id, language, description, target_concepts, created_at, updated_at
            """, (language, clean_description, json.dumps(targets)))
            row = cur.fetchone()
        conn.commit()
        guide = dict(row)
        guide["created_at"] = guide["created_at"].isoformat()
        guide["updated_at"] = guide["updated_at"].isoformat()
        return {"status": "ok", "guide": guide}
    finally:
        conn.close()


def deactivate_guide(language: str) -> dict:
    """Remover (desativar) o guia de estudo ativo do idioma, se houver.

    Não afeta análises já salvas (FR-018) — só análises futuras deixam de receber ênfase.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE journal_tutor_guides SET active = FALSE, updated_at = NOW()
                WHERE language = %s AND active
            """, (language,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ─── Análise (US1) ───────────────────────────────────────────────────────────────

def analisar_escrita(bullet_id: int, language: str = "en") -> dict:
    """Analisar a escrita de um bullet via Gemini e persistir o resultado (US1).

    Transacional: falha em qualquer etapa (bullet inexistente, texto vazio, falha do
    Gemini) devolve ``status: error`` sem gravar nada (FR-010) — a transação só é aberta
    depois que a resposta do Gemini já foi validada.

    Args:
        bullet_id: ID do bullet (``journal_bullets``) a analisar.
        language: Idioma-alvo da análise (default "en").

    Returns:
        ``{"status": "ok", "analysis": {...}, "skills_touched": [slugs]}`` ou
        ``{"status": "error", "message": ...}``.
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT content FROM journal_bullets WHERE id = %s", (bullet_id,))
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": "bullet não encontrado"}

            content = (row["content"] or "").strip()
            if not content:
                return {"status": "error", "message": "bullet vazio — nada para analisar"}

            guide = None
            cur.execute("""
                SELECT description, target_concepts FROM journal_tutor_guides
                WHERE language = %s AND active
            """, (language,))
            guide_row = cur.fetchone()
            if guide_row:
                guide = dict(guide_row)

        # Chamada ao Gemini FORA da transação de escrita — se falhar, nada foi aberto ainda.
        prompt = _build_prompt(content, language, guide)
        try:
            data = _call_gemini(prompt)
        except _TutorAnalysisError as exc:
            return {"status": "error", "message": str(exc)}

        errors_raw = data.get("errors") or []
        concepts_ok_raw = data.get("concepts_used_correctly") or []

        # Normaliza slugs contra o vocabulário canônico e deriva os rótulos PT-BR
        # server-side (não confiamos em rótulos que o modelo eventualmente inventasse).
        errors = []
        for e in errors_raw:
            slug = _normalize_slug(e.get("concept_slug"))
            errors.append({
                "concept_slug": slug,
                "concept_label": _label_for(slug),
                "wrong": e.get("wrong", ""),
                "right": e.get("right", ""),
                "explanation": e.get("explanation", ""),
                "severity": e.get("severity", "medium"),
            })
        concepts_ok = [_normalize_slug(s) for s in concepts_ok_raw]

        score = int(data.get("score", 0))
        score = max(0, min(100, score))

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO journal_tutor_analyses
                    (bullet_id, language, original_text, corrected_text, natural_rewrite,
                     errors_json, summary, score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, bullet_id, language, original_text, corrected_text,
                          natural_rewrite, errors_json, summary, score, created_at
            """, (
                bullet_id, language, content,
                data.get("corrected_text", content),
                data.get("natural_rewrite", data.get("corrected_text", content)),
                json.dumps(errors), data.get("summary", ""), score,
            ))
            analysis_row = dict(cur.fetchone())
            analysis_id = analysis_row["id"]

            # 1 evento por conceito tocado (erro → correct=False; usado certo → correct=True).
            touched_slugs: list[str] = []
            for e in errors:
                cur.execute("""
                    INSERT INTO journal_tutor_events
                        (analysis_id, language, concept_slug, concept_label, correct)
                    VALUES (%s, %s, %s, %s, FALSE)
                """, (analysis_id, language, e["concept_slug"], e["concept_label"]))
                touched_slugs.append(e["concept_slug"])
            for slug in concepts_ok:
                cur.execute("""
                    INSERT INTO journal_tutor_events
                        (analysis_id, language, concept_slug, concept_label, correct)
                    VALUES (%s, %s, %s, %s, TRUE)
                """, (analysis_id, language, slug, _label_for(slug)))
                touched_slugs.append(slug)

            # Recomputa a skill (cache materializado) de cada conceito tocado, a partir
            # do histórico completo de events daquele (language, concept_slug).
            for slug in set(touched_slugs):
                cur.execute("""
                    SELECT correct FROM journal_tutor_events
                    WHERE language = %s AND concept_slug = %s
                    ORDER BY created_at ASC
                """, (language, slug))
                signals = [r["correct"] for r in cur.fetchall()]
                resumo = _mastery.summarize(signals)

                cur.execute("""
                    SELECT mastery FROM journal_tutor_skills
                    WHERE language = %s AND concept_slug = %s
                """, (language, slug))
                prev_row = cur.fetchone()
                prev_mastery = prev_row["mastery"] if prev_row else 0.0

                cur.execute("""
                    INSERT INTO journal_tutor_skills
                        (language, concept_slug, concept_label, mastery, prev_mastery,
                         trend, samples, correct, last_seen, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (language, concept_slug) DO UPDATE SET
                        mastery = EXCLUDED.mastery,
                        prev_mastery = %s,
                        trend = EXCLUDED.trend,
                        samples = EXCLUDED.samples,
                        correct = EXCLUDED.correct,
                        last_seen = NOW(),
                        updated_at = NOW()
                """, (
                    language, slug, _label_for(slug), resumo["mastery"], prev_mastery,
                    resumo["trend"] or "flat", resumo["samples"], resumo["correct"],
                    prev_mastery,
                ))

        conn.commit()

        analysis = dict(analysis_row)
        analysis["created_at"] = analysis["created_at"].isoformat()
        analysis["errors"] = errors
        analysis["concepts_used_correctly"] = concepts_ok
        del analysis["errors_json"]

        return {"status": "ok", "analysis": analysis, "skills_touched": sorted(set(touched_slugs))}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─── Leituras (US2, US3) ─────────────────────────────────────────────────────────

def _serialize_analysis(row: dict) -> dict:
    """Converter uma linha de `journal_tutor_analyses` em dict pronto para JSON."""
    analysis = dict(row)
    if analysis.get("created_at"):
        analysis["created_at"] = analysis["created_at"].isoformat()
    errors = analysis.pop("errors_json", [])
    analysis["errors"] = errors if isinstance(errors, list) else json.loads(errors)
    return analysis


def get_bullet_analysis(bullet_id: int) -> Optional[dict]:
    """Devolver a análise mais recente de um bullet (serve o toggle — US2)."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, bullet_id, language, original_text, corrected_text,
                       natural_rewrite, errors_json, summary, score, created_at
                FROM journal_tutor_analyses
                WHERE bullet_id = %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (bullet_id,))
            row = cur.fetchone()
        return _serialize_analysis(row) if row else None
    finally:
        conn.close()


def get_bullets_tutor_meta(bullet_ids: list[int]) -> dict:
    """Metadado leve de análise por bullet — usado para compor o payload de `GET /page` (US2).

    Uma query agregada (``DISTINCT ON``) evita N+1 ao montar o campo `tutor` de cada bullet.

    Args:
        bullet_ids: IDs de bullets a consultar.

    Returns:
        ``{bullet_id: {"analysis_id", "has_correction", "error_count"}}`` — bullets sem
        análise simplesmente não aparecem no dict (o chamador trata como ``None``).
    """
    if not bullet_ids:
        return {}
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT ON (bullet_id) bullet_id, id AS analysis_id, errors_json
                FROM journal_tutor_analyses
                WHERE bullet_id = ANY(%s)
                ORDER BY bullet_id, created_at DESC
            """, (bullet_ids,))
            rows = cur.fetchall()
        result = {}
        for r in rows:
            errors = r["errors_json"] if isinstance(r["errors_json"], list) else json.loads(r["errors_json"])
            result[r["bullet_id"]] = {
                "analysis_id": r["analysis_id"],
                "has_correction": True,
                "error_count": len(errors),
            }
        return result
    finally:
        conn.close()


def list_skills(language: str) -> list[dict]:
    """Listar as skills (maestria por conceito) de um idioma, ordenadas por maestria ASC.

    Ordem crescente de maestria: os conceitos que mais precisam de atenção aparecem
    primeiro na tela de progresso (US3).
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT concept_slug, concept_label, mastery, trend, samples, correct, last_seen
                FROM journal_tutor_skills
                WHERE language = %s
                ORDER BY mastery ASC
            """, (language,))
            rows = cur.fetchall()
        skills = []
        for r in rows:
            s = dict(r)
            s["mastery_pct"] = round(s.pop("mastery") * 100)
            s["enough_data"] = s["samples"] >= 3
            # Tendência só é exibida com dados suficientes (selo "poucos dados" — FR-008).
            if not s["enough_data"]:
                s["trend"] = None
            if s.get("last_seen"):
                s["last_seen"] = s["last_seen"].isoformat()
            skills.append(s)
        return skills
    finally:
        conn.close()


def list_analyses(language: str, limit: int = 20) -> list[dict]:
    """Listar as análises recentes de um idioma (histórico — US3)."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, bullet_id, score, summary, errors_json, created_at
                FROM journal_tutor_analyses
                WHERE language = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (language, limit))
            rows = cur.fetchall()
        result = []
        for r in rows:
            errors = r["errors_json"] if isinstance(r["errors_json"], list) else json.loads(r["errors_json"])
            result.append({
                "id": r["id"],
                "bullet_id": r["bullet_id"],
                "score": r["score"],
                "error_count": len(errors),
                "summary": r["summary"],
                "created_at": r["created_at"].isoformat(),
            })
        return result
    finally:
        conn.close()


def list_concepts() -> list[dict]:
    """Lista canônica de conceitos — popula o seletor de conceitos-alvo do guia (US4)."""
    return [dict(c) for c in CONCEPTS_EN]


def get_progress(language: str) -> dict:
    """Compor o payload completo da tela de progresso (US3 + US4).

    Junta skills + nível CEFR estimado + sugestão de próximo foco + guia ativo — tudo
    derivado na leitura, sem nenhuma chamada extra ao Gemini (R4/R5 do research.md).
    """
    skills = list_skills(language)
    guide = get_active_guide(language)
    guide_targets = guide.get("target_concepts") if guide else None

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT score FROM journal_tutor_analyses
                WHERE language = %s
                ORDER BY created_at DESC
                LIMIT 20
            """, (language,))
            recent_scores = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    level = _mastery.estimate_cefr(recent_scores)
    next_focus = _mastery.pick_next_focus(skills, guide_targets)

    target_set = set(guide_targets or [])
    for s in skills:
        s["is_target"] = s["concept_slug"] in target_set

    return {
        "language": language,
        "level": level,
        "next_focus": next_focus,
        "active_guide": guide,
        "skills": skills,
    }


# ─── Inicialização automática ───────────────────────────────────────────────────

# Ao importar o módulo, tenta criar as tabelas — mesmo padrão de
# agents/journal/tools.py. Se o banco não estiver disponível ainda, só avisa;
# a criação será tentada de novo na primeira chamada real a uma função deste módulo.
try:
    _ensure_tutor_tables()
except Exception as exc:  # noqa: BLE001
    logger.warning("tutor: não foi possível criar as tabelas ao importar o módulo: %s", exc)
