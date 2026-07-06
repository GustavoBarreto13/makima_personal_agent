"""Tools da Lucy — classificação Gemini, digest, persistência e leitura ao vivo.

Contém:
- 3 tools read-only do `lucy_agent` (fetch_recent_emails, search_emails, get_email) —
  wrappers sobre `agents.lucy.gmail_imap`, nunca levantam exceção.
- `classify_emails()` — chamada one-shot ao Gemini (`google-genai`) para categorizar,
  priorizar e resumir uma lista de emails (contrato C do `contracts/interfaces.md`).
- `build_telegram_digest()` — monta a mensagem HTML enviada ao Telegram (layout do base).
- `persist_classified()` — upsert idempotente em `lucy_emails` (histórico, spec US3).
- `_ensure_tables()` — DDL da tabela `lucy_emails`, chamada na importação do módulo
  (padrão `agents/journal/tools.py`).

Usage:
    from agents.lucy.tools import fetch_recent_emails, search_emails, get_email
    from agents.lucy.tools import classify_emails, build_telegram_digest, persist_classified
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from agents.db import get_conn
from agents.lucy import gmail_imap

logger = logging.getLogger("lucy")

_TZ = ZoneInfo("America/Sao_Paulo")

# ─── Enum de categorias (fixo — copiado do base, SC-008) ───────────────────────

CATEGORY_EMOJIS = {
    "Art / Hobbies": "🎭",
    "Finance": "💵",
    "Knowledge": "🎓",
    "Shopping": "🛒",
    "Personal": "👤",
    "Health": "⚕️",
    "Security": "🔒",
    "Work": "💼",
    "Junk": "🗑️",
    "Other": "🗂️",
}

PRIORITY_COLORS = {"high": "🔴", "medium": "🟡", "low": "🟢"}

_VALID_CATEGORIES = set(CATEGORY_EMOJIS.keys())
_VALID_PRIORITIES = {"high", "medium", "low"}
_VALID_ACTIONS = {"arquivar", "responder", "ler", "agir", "ignorar"}


# ─── Criação de tabelas ─────────────────────────────────────────────────────────

def _ensure_tables() -> None:
    """Criar a tabela `lucy_emails` se ainda não existir (idempotente).

    Chamada automaticamente na importação deste módulo — mesmo padrão de
    `agents/journal/tools.py::_ensure_tables`.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS lucy_emails (
                    id             TEXT        PRIMARY KEY,
                    gmail_uid      TEXT        UNIQUE NOT NULL,
                    from_name      TEXT,
                    from_addr      TEXT,
                    subject        TEXT,
                    category       TEXT        NOT NULL,
                    priority       TEXT,
                    summary        TEXT,
                    action         TEXT,
                    received_date  DATE,
                    classified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_lucy_emails_cat_date
                ON lucy_emails (category, received_date DESC)
            """)


# ─── Tools read-only do lucy_agent (US2) ───────────────────────────────────────

def fetch_recent_emails(limit: int = 10, unread_only: bool = False) -> dict:
    """Listar emails recentes (ou apenas não lidos) da inbox, ao vivo.

    Args:
        limit: número máximo de emails retornados (default 10).
        unread_only: se True, filtra apenas não lidos (critério IMAP UNSEEN).

    Returns:
        {"status":"ok","emails":[{uid, from_name, from_addr, subject, date}...]}
        ou {"status":"error","message": str}.
    """
    try:
        criteria = "(UNSEEN)" if unread_only else "ALL"
        emails = gmail_imap.fetch_emails(criteria, limit=limit)
        return {
            "status": "ok",
            "emails": [
                {
                    "uid": e["imap_uid"],
                    "from_name": e["from_name"],
                    "from_addr": e["from_addr"],
                    "subject": e["subject"],
                    "date": e["date"],
                }
                for e in emails
            ],
        }
    except Exception as exc:  # noqa: BLE001 — nunca levanta, é tool do agente
        logger.warning("fetch_recent_emails falhou: %s", exc)
        return {"status": "error", "message": "não consegui acessar a caixa agora"}


def search_emails(query: str, limit: int = 10) -> dict:
    """Buscar emails por remetente, assunto ou palavra-chave, ao vivo.

    Args:
        query: texto livre de busca.
        limit: número máximo de resultados (default 10).

    Returns:
        {"status":"ok","emails":[{uid, from_name, from_addr, subject, date, snippet}...]}
        ou {"status":"error","message": str}.
    """
    try:
        safe_query = (query or "").replace('"', "")
        criteria = f'(OR (FROM "{safe_query}") (SUBJECT "{safe_query}"))'
        emails = gmail_imap.fetch_emails(criteria, limit=limit)
        return {
            "status": "ok",
            "emails": [
                {
                    "uid": e["imap_uid"],
                    "from_name": e["from_name"],
                    "from_addr": e["from_addr"],
                    "subject": e["subject"],
                    "date": e["date"],
                    "snippet": e["snippet"],
                }
                for e in emails
            ],
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("search_emails falhou: %s", exc)
        return {"status": "error", "message": "não consegui buscar na caixa agora"}


def get_email(uid: str) -> dict:
    """Buscar o conteúdo completo de um email pelo UID retornado nas listagens.

    Args:
        uid: IMAP UID como string.

    Returns:
        {"status":"ok","email":{from_name, from_addr, subject, date, body}}
        ou {"status":"error","message": str}.
    """
    try:
        full = gmail_imap.get_email_full(uid)
        if full is None:
            return {"status": "error", "message": "email não encontrado"}
        return {"status": "ok", "email": full}
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_email falhou: %s", exc)
        return {"status": "error", "message": "não consegui abrir esse email agora"}


# ─── Classificação (Gemini one-shot, contrato C) ───────────────────────────────

_SYSTEM_PROMPT = (
    "Você é Lucy — uma netrunner fria e eficiente de Night City. "
    "Você vasculha a rede toda manhã, filtra o ruído e entrega só o que importa — sem drama, sem enrolação.\n"
    "Para cada email da lista, categorize, priorize, resuma (1 frase máxima) e sugira uma ação.\n\n"
    "DIRETRIZES DE CATEGORIZAÇÃO:\n"
    "- Art / Hobbies: Arte, hobbies, esportes, interesses pessoais e lazer.\n"
    "- Finance: Faturas, boletos, bancos, Pix, comprovantes e investimentos.\n"
    "- Knowledge: Newsletters, artigos, cursos, aprendizado, blogs, newsletter no assunto ou no corpo.\n"
    "- Shopping: Rastreio de entregas, recibos de compras, ofertas, cupons e e-commerce.\n"
    "- Personal: E-mails diretos de pessoas (amigos, familiares), viagens, eventos sociais, voos e redes sociais.\n"
    "- Health: Exames, resultados, médicos, farmácia, bem-estar.\n"
    "- Security: Alertas de login, senhas, códigos de verificação, OTP e acessos novos.\n"
    "- Work: Trabalho, chefe, clientes, corporativo.\n"
    "- Junk: Lixo inútil, termos de uso irrelevantes, spam, promoções de lojas, cupons, marketing de vendas, "
    "LinkedIn, Instagram, notificações de redes sociais, eventos sociais. (Junk não será exibido no Telegram, "
    "então use sem dó para limpar o ruído).\n"
    "- Other: Tudo que não couber acima.\n\n"
    "Preserve sempre o 'uid' original."
)

_CLASSIFY_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "uid": {"type": "STRING"},
            "category": {"type": "STRING", "enum": sorted(_VALID_CATEGORIES)},
            "priority": {"type": "STRING", "enum": ["high", "medium", "low"]},
            "summary": {"type": "STRING"},
            "action": {"type": "STRING", "enum": ["arquivar", "responder", "ler", "agir", "ignorar"]},
        },
        "required": ["uid", "category", "priority", "summary", "action"],
    },
}

_MAX_RETRIES = 3
_RETRY_BACKOFF = 15.0


class ClassificationError(Exception):
    """Falha estrutural na classificação (após esgotar as tentativas)."""


def _normalize_classification(item: dict) -> dict:
    """Normalizar um item classificado para os valores válidos (fallback seguro)."""
    category = item.get("category")
    if category not in _VALID_CATEGORIES:
        category = "Other"
    priority = item.get("priority")
    if priority not in _VALID_PRIORITIES:
        priority = "low"
    action = item.get("action")
    if action not in _VALID_ACTIONS:
        action = "ler"
    return {
        "uid": str(item.get("uid", "")),
        "category": category,
        "priority": priority,
        "summary": item.get("summary") or "",
        "action": action,
    }


def classify_emails(emails: list[dict]) -> dict:
    """Classificar uma lista de emails via Gemini one-shot (contrato C).

    Args:
        emails: lista de dicts com ao menos `imap_uid`, `subject`, `from_name`/`from_addr`,
            `snippet` (o formato de saída de `gmail_imap.fetch_emails`).

    Returns:
        {"classified": [{uid, category, priority, summary, action}...],
         "usage": {"prompt_tokens": int, "candidates_tokens": int}}

    Raises:
        ClassificationError: se a chamada ao Gemini falhar após todas as tentativas.
    """
    if not emails:
        return {"classified": [], "usage": {"prompt_tokens": 0, "candidates_tokens": 0}}

    payload = [
        {
            "uid": e["imap_uid"],
            "subject": e.get("subject", ""),
            "from": e.get("from_name") or e.get("from_addr", ""),
            "snippet": e.get("snippet", ""),
        }
        for e in emails
    ]
    prompt = f"Categorize e resuma a seguinte lista de e-mails:\n\n{json.dumps(payload, ensure_ascii=False, indent=2)}"

    from google import genai  # import lazy — evita custo de import em quem não roda o digest

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ClassificationError("GEMINI_API_KEY não configurada")

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=api_key)

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=prompt,
                config={
                    "system_instruction": _SYSTEM_PROMPT,
                    "response_mime_type": "application/json",
                    "response_schema": _CLASSIFY_SCHEMA,
                },
            )
            parsed = json.loads(resp.text)
            classified = [_normalize_classification(item) for item in parsed]

            usage = getattr(resp, "usage_metadata", None)
            prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
            candidates_tokens = getattr(usage, "candidates_token_count", 0) or 0

            return {
                "classified": classified,
                "usage": {"prompt_tokens": prompt_tokens, "candidates_tokens": candidates_tokens},
            }
        except Exception as exc:  # noqa: BLE001 — rede, quota, JSON malformado
            last_exc = exc
            logger.warning("classify_emails tentativa %d/%d falhou: %s", attempt, _MAX_RETRIES, exc)
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_BACKOFF * (2 ** (attempt - 1)))

    raise ClassificationError(f"Falha ao classificar emails após {_MAX_RETRIES} tentativas: {last_exc}")


# ─── Digest (montagem da mensagem Telegram) ────────────────────────────────────

def build_telegram_digest(classified: list[dict], usage: dict) -> str:
    """Montar a mensagem HTML do digest diário (layout do base, FR-010/FR-011).

    Args:
        classified: cada item já mesclado com dados do email (from_name, subject etc.)
            e da classificação (category, priority, summary, action).
        usage: {"prompt_tokens": int, "candidates_tokens": int}.

    Returns:
        Texto HTML pronto para `parse_mode=HTML` do Telegram.
    """
    lines: list[str] = []
    lines.append("🕸️ <b>LUCY — Net Scan Matinal</b>")
    lines.append("━━━━━━━━━━━━━━━━━━")

    if not classified:
        lines.append("<i>\"A rede estava quieta ontem. Nada de novo na inbox.\"</i>")
        lines.append("")
        lines.append("━━━━━━━━━━━━━━━━━━")
        hora_atual = datetime.now(_TZ).strftime("%H:%M")
        lines.append(f"🕗 {hora_atual}")
        return "\n".join(lines)

    grouped: dict[str, list[dict]] = {}
    for item in classified:
        cat = item.get("category", "Other")
        if cat == "Junk":
            continue
        grouped.setdefault(cat, []).append(item)

    non_junk_count = sum(len(v) for v in grouped.values())
    overview = (
        f"{non_junk_count} sinal(is) relevante(s) na rede ontem. O resto foi ruído — já limpei."
        if non_junk_count
        else "Só ruído na rede ontem. Nada que mereça sua atenção."
    )
    lines.append(f"<i>\"{overview}\"</i>")
    lines.append("")

    knowledge_items = grouped.get("Knowledge", [])
    if knowledge_items:
        lines.append("🌐 <b>INTEL BRIEFING:</b>")
        lines.append(" ".join(item.get("summary", "") for item in knowledge_items if item.get("summary")))
        lines.append("")

    action_items = [
        item for item in classified
        if item.get("category") != "Junk"
        and (
            item.get("category") == "Security"
            or (item.get("priority") == "high" and item.get("action") in ("agir", "responder"))
        )
    ]
    if action_items:
        lines.append("🚨 <b>AÇÃO IMEDIATA:</b>")
        for item in action_items:
            lines.append(f"• {item.get('summary', '')}")
        lines.append("")

    for cat, items in grouped.items():
        emoji = CATEGORY_EMOJIS.get(cat, "🗂️")
        lines.append(f"{emoji} <b>{cat}</b> ({len(items)})")
        for item in items:
            color = PRIORITY_COLORS.get(item.get("priority", "low"), "🟢")
            summary = (item.get("summary") or "").replace("<", "&lt;").replace(">", "&gt;")
            lines.append(f"  {color} {summary}")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━")

    in_tokens = usage.get("prompt_tokens", 0)
    out_tokens = usage.get("candidates_tokens", 0)
    cost = (in_tokens / 1_000_000) * 0.10 + (out_tokens / 1_000_000) * 0.40

    lines.append(f"🧠 Tokens: {in_tokens:,} in | {out_tokens:,} out")
    lines.append(f"💸 Custo: ~${cost:.5f}")

    hora_atual = datetime.now(_TZ).strftime("%H:%M")
    lines.append(f"🕗 {hora_atual}")

    return "\n".join(lines)


# ─── Persistência (histórico — US3) ────────────────────────────────────────────

def persist_classified(records: list[dict]) -> None:
    """Upsert idempotente dos emails classificados em `lucy_emails` (FR-013).

    Args:
        records: lista de dicts com `gmail_uid`, `from_name`, `from_addr`, `subject`,
            `category`, `priority`, `summary`, `action`, `received_date` (YYYY-MM-DD ou date).
    """
    if not records:
        return

    with get_conn() as conn:
        with conn.cursor() as cur:
            for r in records:
                if not r.get("gmail_uid"):
                    # Sem X-GM-MSGID não há chave de idempotência — pula (best-effort).
                    continue
                cur.execute(
                    """
                    INSERT INTO lucy_emails (id, gmail_uid, from_name, from_addr, subject,
                                             category, priority, summary, action, received_date, classified_at)
                    VALUES (%(id)s, %(gmail_uid)s, %(from_name)s, %(from_addr)s, %(subject)s,
                            %(category)s, %(priority)s, %(summary)s, %(action)s, %(received_date)s, NOW())
                    ON CONFLICT (gmail_uid) DO UPDATE SET
                        from_name     = EXCLUDED.from_name,
                        from_addr     = EXCLUDED.from_addr,
                        subject       = EXCLUDED.subject,
                        category      = EXCLUDED.category,
                        priority      = EXCLUDED.priority,
                        summary       = EXCLUDED.summary,
                        action        = EXCLUDED.action,
                        received_date = EXCLUDED.received_date,
                        classified_at = NOW()
                    """,
                    {
                        "id": str(uuid.uuid4()),
                        "gmail_uid": r["gmail_uid"],
                        "from_name": r.get("from_name"),
                        "from_addr": r.get("from_addr"),
                        "subject": r.get("subject"),
                        "category": r.get("category", "Other"),
                        "priority": r.get("priority"),
                        "summary": r.get("summary"),
                        "action": r.get("action"),
                        "received_date": r.get("received_date"),
                    },
                )


def yesterday_local_date() -> str:
    """Data local (America/Sao_Paulo) de 'ontem', em formato YYYY-MM-DD."""
    return (datetime.now(_TZ) - timedelta(days=1)).strftime("%Y-%m-%d")


# ─── Inicialização automática ───────────────────────────────────────────────────

# Ao importar o módulo, tenta criar a tabela. Se o banco não estiver disponível
# ainda (ordem de inicialização dos containers, DATABASE_URL ausente em CI), apenas
# registra um aviso — a criação será tentada de novo na primeira chamada real.
try:
    _ensure_tables()
except Exception as exc:  # noqa: BLE001
    logging.getLogger(__name__).warning(
        "lucy: não foi possível criar a tabela lucy_emails ao importar o módulo: %s", exc
    )
