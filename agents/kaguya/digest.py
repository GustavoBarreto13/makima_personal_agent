"""Digest matinal da Kaguya (tarefas + agenda) — job diário agendado, via WhatsApp.

Contém:
- `build_digest_context()` — junta tarefas vencidas/hoje, Próximas Ações e Rápidas do
  GTD, agenda do dia (Google Calendar), hábitos pendentes, capacidade do dia, entradas
  recentes do diário (Violet) e trechos do RAG da Kurisu. Função pura de composição
  (chama outras camadas de lógica, não tem regra própria).
- `generate_suggestion()` — chamada Gemini one-shot que sintetiza um plano sugerido pro
  dia a partir do contexto, no mesmo padrão de `agents/lucy/tools.py::classify_emails`.
- `build_whatsapp_digest()` — monta o texto (HTML no padrão Telegram do resto do
  projeto — `scheduler/notify_channels.py` converte pro markdown do WhatsApp).
- `persist_digest()` / `_ensure_tables()` — histórico em `kaguya_digests`.
- `get_pending_kaguya_digest()` / `apply_kaguya_digest_selection()` — expostas via MCP
  (`toolset.py`) para o Hermes chamar quando uma resposta de WhatsApp parecer uma reação
  à sugestão do dia. A interpretação do texto livre é feita pelo Hermes (já é um LLM com
  tool-calling); estas tools só guardam/aplicam a decisão já tomada.

Usage:
    from agents.kaguya.digest import build_digest_context, generate_suggestion
    from agents.kaguya.digest import build_whatsapp_digest, persist_digest
    from agents.kaguya.digest import get_pending_kaguya_digest, apply_kaguya_digest_selection
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from psycopg2.extras import Json

from agents.db import get_conn, run_dml, run_select

logger = logging.getLogger("kaguya.digest")

_TZ = ZoneInfo("America/Sao_Paulo")

_MAX_RETRIES = 3
_RETRY_BACKOFF = 15.0

# Janela em que um digest "pending" ainda é considerado esperando resposta — mais
# velho que isso e a próxima leitura marca `expired` sozinha (não fica pendente pra sempre).
_PENDING_WINDOW_HOURS = 20


class SuggestionError(Exception):
    """Falha estrutural ao gerar a sugestão do dia (após esgotar as tentativas)."""


# ─── Criação de tabelas ─────────────────────────────────────────────────────────

def _ensure_tables() -> None:
    """Cria a tabela `kaguya_digests` se ainda não existir (idempotente).

    Chamada automaticamente na importação deste módulo — mesmo padrão de
    `agents/lucy/tools.py::_ensure_tables` / `agents/journal/tools.py`.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS kaguya_digests (
                    id                 SERIAL      PRIMARY KEY,
                    digest_date        DATE        NOT NULL,
                    sent_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
                    suggested_items    JSONB       NOT NULL,
                    status             TEXT        NOT NULL DEFAULT 'pending',
                    resolved_at        TIMESTAMPTZ,
                    resolution_summary TEXT
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_kaguya_digests_status_sent
                ON kaguya_digests (status, sent_at DESC)
            """)


# ─── Contexto (composição de dados, sem regra própria) ──────────────────────────

def _today_sp() -> date:
    return datetime.now(_TZ).date()


def _parse_minutes(value: str | None) -> int | None:
    """Converte um horário ISO (com data+hora) do gcal em minutos desde a meia-noite.

    Eventos de dia inteiro (só "YYYY-MM-DD", sem "T") voltam `None` — não entram na
    conta de capacidade por horário (mesma convenção de `compute_capacity`).
    """
    if not value or "T" not in value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    return dt.hour * 60 + dt.minute


def _slim_tasks(tasks: list[dict]) -> list[dict]:
    """Reduz uma lista de tarefas serializadas aos campos que o Gemini precisa ver."""
    return [
        {
            "id": t["id"],
            "title": t.get("title"),
            "due_date": t.get("due_date"),
            "due_time": t.get("due_time"),
            "priority": t.get("priority"),
            "duration_min": t.get("duration_min"),
            "project_name": t.get("project_name"),
        }
        for t in tasks
    ]


def _recent_journal_notes(today: date, days: int = 3) -> list[dict]:
    """Últimos dias com conteúdo no diário (Violet) — heurística simples de humor/cansaço.

    Usa `list_heatmap` primeiro pra saber QUAIS dias têm conteúdo, e só então chama
    `get_or_create_page` — evita criar páginas vazias pra dias sem entrada (a função se
    chama "get_OR_CREATE" e criaria uma página em branco se chamada direto).
    """
    from agents.journal.tools import get_or_create_page, list_emotion_logs, list_heatmap

    years = {today.year, (today - timedelta(days=days)).year}
    heatmap: dict[str, int] = {}
    for year in years:
        try:
            heatmap.update(list_heatmap(year))
        except Exception as exc:  # noqa: BLE001 — melhor esforço, não derruba o digest
            logger.warning("Falha ao ler o heatmap do diário (%s): %s", year, exc)

    notes = []
    for i in range(1, days + 1):
        d = today - timedelta(days=i)
        d_str = d.isoformat()
        if not heatmap.get(d_str):
            continue  # sem conteúdo nesse dia — não cria página vazia
        try:
            result = get_or_create_page(d_str)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao ler o diário de %s: %s", d_str, exc)
            continue
        page = result.get("page")
        bullets = result.get("bullets") or []
        if not page or not bullets:
            continue
        text = " ".join(b.get("content", "") for b in bullets if b.get("content"))
        emotions: list[str] = []
        try:
            logs = list_emotion_logs(page["id"])
            emotions = [f"{log['emotion_name']} ({log['intensity']})" for log in logs]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao ler as emoções de %s: %s", d_str, exc)
        notes.append({"date": d_str, "text": text[:500], "emotions": emotions})
    return notes


def _query_kurisu_context(weekday: int, candidate_tasks: list[dict]) -> list[dict]:
    """Consulta o RAG da Kurisu por contexto histórico (rotina/preferências) do dia."""
    from agents.kurisu.tools import buscar_na_base

    weekday_names = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
    temas = ", ".join(t["title"] for t in candidate_tasks[:8] if t.get("title"))
    query = f"rotina e preferências de produtividade às {weekday_names[weekday]}s; temas de hoje: {temas}"
    try:
        result = buscar_na_base(query)
    except Exception as exc:  # noqa: BLE001 — melhor esforço, não derruba o digest
        logger.warning("Falha ao consultar o RAG da Kurisu: %s", exc)
        return []
    if result.get("status") != "ok":
        return []
    return result.get("trechos", [])[:5]


def build_digest_context(today: date | None = None) -> dict:
    """Junta tudo que o digest precisa: tarefas, agenda, hábitos, capacidade, diário, RAG.

    Função pura de composição — cada peça vem de uma camada de lógica já existente
    (nenhuma regra de negócio nova aqui, só a junção).

    Args:
        today: Data de referência (padrão: hoje, fuso America/Sao_Paulo).

    Returns:
        Dict com `today`, `weekday`, `is_weekend`, `overdue`, `today_tasks`,
        `next_actions`, `quick`, `waiting`, `events`, `habits_pending`, `capacity`,
        `journal_notes`, `rag_excerpts`. Quando o modo férias (spec 065) está ligado,
        tarefas/eventos com contexto Trabalho já saem excluídos daqui — o digest nunca
        os vê.
    """
    today = today or _today_sp()
    weekday = today.weekday()  # 0=segunda ... 6=domingo
    is_weekend = weekday >= 5

    from agents.kaguya import gcal
    from agents.kaguya.capacity import compute_capacity
    from agents.kaguya.tools_filters import list_tasks_by_builtin
    from agents.kaguya.tools_habits import list_habits
    from agents.kaguya.tools_tasks import get_myday_prefs, list_tasks_today

    hide_work = get_myday_prefs()["hide_work"]

    tasks_today = list_tasks_today()  # {"overdue": [...], "today": [...]}
    next_actions = list_tasks_by_builtin("next-actions")
    quick = list_tasks_by_builtin("quick")
    waiting = list_tasks_by_builtin("waiting")

    if hide_work:
        def _personal_only(items: list[dict]) -> list[dict]:
            return [t for t in items if t.get("context", "personal") != "work"]

        tasks_today = {
            "overdue": _personal_only(tasks_today["overdue"]),
            "today": _personal_only(tasks_today["today"]),
        }
        next_actions = _personal_only(next_actions)
        quick = _personal_only(quick)
        waiting = _personal_only(waiting)

    try:
        events = gcal.list_events(today.isoformat(), today.isoformat())
        calendar_ok = True
    except Exception as exc:  # noqa: BLE001 — melhor esforço, capacity trata calendar_ok=False
        logger.warning("Falha ao buscar a agenda do Google Calendar: %s", exc)
        events = []
        calendar_ok = False

    if hide_work and events:
        try:
            from agents.kaguya.calendar_prefs import get_calendar_prefs
            prefs = {p["calendar_id"]: p for p in get_calendar_prefs()}
            events = [
                e for e in events
                if (prefs.get(f"gcal:{e.get('calendar_id', '')}", {}).get("context") or "personal") != "work"
            ]
        except Exception as exc:  # noqa: BLE001 — melhor esforço, nunca derruba o digest
            logger.warning("Falha ao filtrar eventos de trabalho do digest: %s", exc)

    habits = list_habits()
    habits_pending = [h for h in habits if not h.get("done_today")]

    # Janela de capacidade — heurística v1 sem calendário de feriados/expediente real:
    # dia útil = tempo livre real depois do expediente (19h-23h); fim de semana = dia
    # inteiro (9h-22h). O usuário decide diariamente se aceita a sugestão de qualquer forma.
    janela = (9 * 60, 22 * 60) if is_weekend else (19 * 60, 23 * 60)

    candidate_tasks = tasks_today["overdue"] + tasks_today["today"] + next_actions
    seen_ids: set[int] = set()
    estimativas = []
    for t in candidate_tasks:
        if t["id"] in seen_ids:
            continue
        seen_ids.add(t["id"])
        estimativas.append(t.get("duration_min"))

    eventos_tuplas = []
    for e in events:
        ini = _parse_minutes(e.get("start"))
        fim = _parse_minutes(e.get("end"))
        if ini is not None and fim is not None:
            eventos_tuplas.append((ini, fim))

    capacity = compute_capacity(estimativas, eventos_tuplas, janela=janela, calendar_ok=calendar_ok)

    journal_notes = _recent_journal_notes(today)
    rag_excerpts = _query_kurisu_context(weekday, candidate_tasks)

    return {
        "today": today.isoformat(),
        "weekday": weekday,
        "is_weekend": is_weekend,
        "overdue": tasks_today["overdue"],
        "today_tasks": tasks_today["today"],
        "next_actions": next_actions,
        "quick": quick,
        "waiting": waiting,
        "events": events,
        "habits_pending": habits_pending,
        "capacity": capacity,
        "journal_notes": journal_notes,
        "rag_excerpts": rag_excerpts,
    }


# ─── Sugestão (Gemini one-shot) ─────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "Você é a Kaguya — aristocrática, organizada, levemente condescendente, mas eficaz. "
    "Analise o dia do usuário (tarefas, agenda, hábitos, capacidade, diário recente e "
    "contexto histórico) e monte uma sugestão REALISTA de plano para hoje, respeitando a "
    "capacidade (tempo livre estimado). Priorize nesta ordem: 1) tarefas vencidas, "
    "2) tarefas de hoje com horário marcado, 3) Próximas Ações do GTD, 4) tarefas rápidas "
    "se sobrar pouco tempo ou energia. Use as entradas recentes do diário (se houver) para "
    "calibrar quanto sugerir — num dia que pareceu cansativo, sugira menos e mais leve. "
    "Sugira no máximo 6 itens. Cada item DEVE referenciar um id REAL de uma das listas "
    "fornecidas (tarefa ou hábito) — nunca invente um id. 'narrative' é um parágrafo curto "
    "(2-3 frases) no seu tom característico, explicando o raciocínio da sugestão."
)

_SUGGESTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "narrative": {"type": "STRING"},
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "type": {"type": "STRING", "enum": ["task", "habit"]},
                    "id": {"type": "INTEGER"},
                    "label": {"type": "STRING"},
                    "reason": {"type": "STRING"},
                },
                "required": ["type", "id", "label", "reason"],
            },
        },
    },
    "required": ["narrative", "items"],
}


def generate_suggestion(context: dict) -> dict:
    """Gera a sugestão do dia via Gemini one-shot, no padrão de `classify_emails`.

    Args:
        context: O dict devolvido por `build_digest_context()`.

    Returns:
        `{"narrative": str, "items": [{n, type, id, label, reason}, ...],
        "usage": {"model": str, "prompt_tokens": int, "candidates_tokens": int}}` — `n` é
        a numeração 1-based que o usuário usa pra responder ("só a 1 e 3").

    Raises:
        SuggestionError: se a chamada ao Gemini falhar após todas as tentativas.
    """
    payload = {
        "hoje": context["today"],
        "dia_da_semana": context["weekday"],
        "fim_de_semana": context["is_weekend"],
        "vencidas": _slim_tasks(context["overdue"]),
        "hoje_tarefas": _slim_tasks(context["today_tasks"]),
        "proximas_acoes": _slim_tasks(context["next_actions"]),
        "rapidas": _slim_tasks(context["quick"]),
        "habitos_pendentes": [
            {"id": h["id"], "name": h.get("name")} for h in context["habits_pending"]
        ],
        "capacidade": context["capacity"],
        "agenda": [
            {"summary": e.get("summary"), "start": e.get("start"), "end": e.get("end")}
            for e in context["events"]
        ],
        "diario_recente": context["journal_notes"],
        "contexto_historico": [t.get("texto", "") for t in context["rag_excerpts"]],
    }
    prompt = (
        "Monte a sugestão do dia com base neste contexto:\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2, default=str)}"
    )

    from google import genai  # import lazy — evita custo de import em quem não roda o digest

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SuggestionError("GEMINI_API_KEY não configurada")

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
                    "response_schema": _SUGGESTION_SCHEMA,
                },
            )
            parsed = json.loads(resp.text)
            raw_items = parsed.get("items", []) or []
            valid_items = [
                item for item in raw_items
                if item.get("type") in ("task", "habit")
                and isinstance(item.get("id"), int)
                and item.get("label")
            ]
            numbered = [{"n": i + 1, **item} for i, item in enumerate(valid_items)]

            usage = getattr(resp, "usage_metadata", None)
            prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
            candidates_tokens = getattr(usage, "candidates_token_count", 0) or 0

            return {
                "narrative": parsed.get("narrative", ""),
                "items": numbered,
                "usage": {
                    "model": model,
                    "prompt_tokens": prompt_tokens,
                    "candidates_tokens": candidates_tokens,
                },
            }
        except Exception as exc:  # noqa: BLE001 — rede, quota, JSON malformado
            last_exc = exc
            logger.warning("generate_suggestion tentativa %d/%d falhou: %s", attempt, _MAX_RETRIES, exc)
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_BACKOFF * (2 ** (attempt - 1)))

    raise SuggestionError(f"Falha ao gerar a sugestão após {_MAX_RETRIES} tentativas: {last_exc}")


# ─── Digest (montagem da mensagem WhatsApp) ─────────────────────────────────────

def _fmt_event_time(e: dict) -> str:
    start = e.get("start") or ""
    if "T" in start:
        try:
            return datetime.fromisoformat(start).strftime("%H:%M")
        except ValueError:
            return start
    return "dia inteiro"


def build_whatsapp_digest(context: dict, suggestion: dict) -> str:
    """Monta o texto do digest (HTML no padrão Telegram — convertido pro WhatsApp no envio).

    Args:
        context: O dict de `build_digest_context()`.
        suggestion: O dict de `generate_suggestion()`.

    Returns:
        Texto pronto para `scheduler.notify_channels.send_notification()`.
    """
    lines: list[str] = []
    lines.append("📋 <b>KAGUYA — Bom dia</b>")
    lines.append("━━━━━━━━━━━━━━━━━━")

    if context["overdue"]:
        lines.append("⚠️ <b>Vencidas</b>")
        for t in context["overdue"]:
            lines.append(f"  • {t.get('title')} ({t.get('project_name')})")
        lines.append("")

    if context["today_tasks"]:
        lines.append("📅 <b>Hoje</b>")
        for t in context["today_tasks"]:
            hora = f" às {t['due_time']}" if t.get("due_time") else ""
            lines.append(f"  • {t.get('title')}{hora} ({t.get('project_name')})")
        lines.append("")

    if context["events"]:
        lines.append("🗓️ <b>Agenda</b>")
        for e in context["events"]:
            lines.append(f"  • {e.get('summary')} — {_fmt_event_time(e)}")
        lines.append("")

    if context["next_actions"]:
        lines.append(f"🎯 <b>Próximas Ações</b> ({len(context['next_actions'])})")
        for t in context["next_actions"][:8]:
            lines.append(f"  • {t.get('title')}")
        lines.append("")

    if context["quick"]:
        lines.append(f"⚡ <b>Rápidas</b> ({len(context['quick'])})")
        for t in context["quick"][:8]:
            lines.append(f"  • {t.get('title')}")
        lines.append("")

    if context["habits_pending"]:
        lines.append("🔁 <b>Hábitos pendentes</b>")
        for h in context["habits_pending"]:
            lines.append(f"  • {h.get('name')}")
        lines.append("")

    cap = context["capacity"]
    estouro = " — plano estourado" if cap["excedeu"] else ""
    lines.append(f"⏳ Capacidade: {cap['estimado_min']}min estimados de {cap['livre_min']}min livres{estouro}")
    lines.append("")

    lines.append("💡 <b>Sugestão de hoje</b>")
    narrative = suggestion.get("narrative")
    if narrative:
        lines.append(f"<i>\"{narrative}\"</i>")
        lines.append("")
    items = suggestion.get("items", [])
    if items:
        for item in items:
            lines.append(f"{item['n']}. {item['label']} — {item.get('reason', '')}")
        lines.append("")
        lines.append('Responda aceitando, recusando ou ajustando (ex.: "sim", "só a 1 e 3", "não hoje").')
    else:
        lines.append("<i>Sem sugestões pra hoje — parece que está tudo sob controle.</i>")

    lines.append("━━━━━━━━━━━━━━━━━━")

    usage = suggestion.get("usage") or {}
    in_tokens = usage.get("prompt_tokens", 0)
    out_tokens = usage.get("candidates_tokens", 0)
    cost = (in_tokens / 1_000_000) * 0.10 + (out_tokens / 1_000_000) * 0.40

    lines.append(f"🤖 Modelo: {usage.get('model', '?')}")
    lines.append(f"🧠 Tokens: {in_tokens:,} in | {out_tokens:,} out")
    lines.append(f"💸 Custo: ~${cost:.5f}")

    hora_atual = datetime.now(_TZ).strftime("%H:%M")
    lines.append(f"🕗 {hora_atual}")

    return "\n".join(lines)


# ─── Persistência (histórico + estado pendente) ─────────────────────────────────

def persist_digest(digest_date: str, suggested_items: list[dict]) -> int:
    """Grava o digest enviado em `kaguya_digests` (status inicial `pending`).

    Args:
        digest_date: Data do digest, `"YYYY-MM-DD"`.
        suggested_items: A lista `items` devolvida por `generate_suggestion()`.

    Returns:
        O `id` do registro criado.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO kaguya_digests (digest_date, suggested_items) "
                "VALUES (%s, %s) RETURNING id",
                (digest_date, Json(suggested_items)),
            )
            return cur.fetchone()[0]


# ─── Tools expostas via MCP (chamadas pelo Hermes) ──────────────────────────────

def get_pending_kaguya_digest() -> dict | None:
    """Devolve o digest pendente mais recente, pro Hermes interpretar uma resposta.

    Expira sozinho (`status='expired'`) qualquer digest pendente mais velho que
    `_PENDING_WINDOW_HOURS` — não fica esperando resposta pra sempre.

    Returns:
        `{"id", "digest_date", "sent_at", "items": [{n, type, id, label, reason}, ...]}`
        ou `None` se não houver nenhum pendente dentro da janela.
    """
    rows = run_select(
        "SELECT id, digest_date, sent_at, suggested_items FROM kaguya_digests "
        "WHERE status = 'pending' ORDER BY sent_at DESC LIMIT 1"
    )
    if not rows:
        return None

    row = rows[0]
    sent_at = row["sent_at"]
    if (datetime.now(_TZ) - sent_at.astimezone(_TZ)) > timedelta(hours=_PENDING_WINDOW_HOURS):
        run_dml("UPDATE kaguya_digests SET status = 'expired' WHERE id = %(id)s", {"id": row["id"]})
        return None

    return {
        "id": row["id"],
        "digest_date": row["digest_date"].isoformat(),
        "sent_at": sent_at.isoformat(),
        "items": row["suggested_items"],
    }


def apply_kaguya_digest_selection(accepted_ns: list[int]) -> str:
    """Aplica a seleção do usuário sobre o digest pendente.

    O Hermes já decidiu, a partir da resposta em texto livre do usuário, quais números
    da lista numerada foram aceitos — esta tool só mapeia número → tarefa e aplica
    (`add_to_my_day`). Itens do tipo `habit` são informativos (sem ação gravável) e são
    ignorados aqui.

    Args:
        accepted_ns: Números aceitos pelo usuário (vazio = nenhuma sugestão aceita).

    Returns:
        Texto de confirmação pronto para o Hermes repassar ao usuário.
    """
    from agents.kaguya.tools_tasks import add_to_my_day

    pending = get_pending_kaguya_digest()
    if pending is None:
        return "Não achei nenhuma sugestão pendente pra aplicar."

    items_by_n = {item["n"]: item for item in pending["items"]}
    accepted_items = [items_by_n[n] for n in accepted_ns if n in items_by_n]

    applied: list[str] = []
    for item in accepted_items:
        if item.get("type") != "task":
            continue  # hábitos são informativos — sem ação gravável
        result = add_to_my_day(item["id"])
        if result.get("status") == "ok":
            applied.append(item["label"])

    if applied:
        summary = f"{len(applied)} item(ns) adicionados ao Meu Dia: {', '.join(applied)}."
    else:
        summary = "Nenhuma sugestão aceita."

    run_dml(
        "UPDATE kaguya_digests SET status = 'resolved', resolved_at = now(), "
        "resolution_summary = %(summary)s WHERE id = %(id)s",
        {"summary": summary, "id": pending["id"]},
    )
    return summary


# ─── Inicialização automática ───────────────────────────────────────────────────

# Ao importar o módulo, tenta criar a tabela. Se o banco não estiver disponível
# ainda (ordem de inicialização dos containers, DATABASE_URL ausente em CI), apenas
# registra um aviso — a criação será tentada de novo na primeira chamada real.
try:
    _ensure_tables()
except Exception as exc:  # noqa: BLE001
    logging.getLogger(__name__).warning(
        "kaguya: não foi possível criar a tabela kaguya_digests ao importar o módulo: %s", exc
    )
