"""Espelho Calendar Hub → Google Calendar (spec 069).

Propósito
---------
A tela de **Calendário** do webapp mostra, além das tarefas/hábitos da Kaguya, um
feed cross-agente vindo do `calendar_hub`: finanças da Nami, sessões de leitura da
Frieren, diário da Violet, filmes da Akane, animes da Marin, séries da Mai e datas
de pessoas da Komi. Nada disso existia no Google Calendar — só dentro do app.

Este módulo dá a cada fonte do hub um **calendário Google dedicado** (nomes em
`gcal.MIRRORED_SOURCES`), no mesmo molde de "Kaguya — Tarefas"/"Kaguya — Hábitos":
criado sob demanda, idempotente, best-effort, reconciliado por **diff** (nunca
apaga-e-recria).

Sem estado novo no banco
------------------------
Tarefa e hábito guardam o `google_event_id` numa coluna própria. Os itens do hub
são **derivados** (`agents/*/calendar_provider.py` faz SELECT e monta o
`CalendarItem` na hora) — não têm onde guardar um id. Em vez de `ALTER TABLE` em
~10 tabelas de 6 agentes, o id do evento no Google é **determinístico**:

    event_id = md5(f"{cal}|{kind}|{ref_id}|{date}")

A API do Google aceita um `id` escolhido pelo cliente no `events.insert`
(base32hex, `0-9a-v`, 5–1024 chars — um hex de MD5 satisfaz). Como cada fonte tem
calendário próprio, tudo que está dentro daquele calendário é nosso: a
reconciliação é um diff de conjuntos puro (`event_id_for` → payload desejado ×
`gcal.list_raw_events` → estado atual).

Dois gatilhos
-------------
1. `mark_dirty(source_id)` — chamado pelos agentes após cada mutação que produz
   item de calendário (lazy import + `try/except`, depois do commit — mesmo padrão
   de `gcal_sync.push_task`). Debounce de ~60s, janela estreita (−30d/+90d).
2. Job agendado `gcal_mirror` (`scheduler/`, de hora em hora) → `reconcile_all`
   sobre a janela cheia (±365d). Rede de segurança: pega o que o gatilho perdeu
   (evento apagado à mão no Google, mutação durante queda da API, item que
   entrou/saiu da janela pela passagem do tempo) e faz o backfill inicial.

Feature flag: `GCAL_SYNC_ENABLED` (a mesma de `gcal_sync`). `"false"` desativa
tudo — `mark_dirty` vira no-op; o job ainda pode ser forçado à mão.

Limitações herdadas de tarefas/hábitos: sync **one-way** (editar o evento no
Google não volta para o Postgres; a próxima reconciliação sobrescreve/apaga).
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from googleapiclient.errors import HttpError

from agents.kaguya import calendar_hub, gcal

_log = logging.getLogger("kaguya.gcal_mirror")

_SP_TZ = ZoneInfo("America/Sao_Paulo")

# source_id → nome do calendário Google. Fonte única: gcal.MIRRORED_SOURCES
# (fica lá porque gcal.list_events precisa dela para o exclude default e importar
# este módulo criaria um ciclo).
_MIRRORED: dict[str, str] = gcal.MIRRORED_SOURCES

# Teto de eventos por fonte numa única reconciliação. Protege contra o caso
# conhecido de `marin`/`mai` `_upcoming_episode_events` não filtrarem por status —
# trazem TODO episódio de TODO anime/série do catálogo, o que numa janela de
# ±365d pode ser milhares de eventos e estourar a quota de escrita do Google.
_MAX_EVENTS_PER_SOURCE = 500

# Debounce do gatilho de mutação: várias mutações em rajada = uma reconciliação
# ~60s depois da última.
_DIRTY_DEBOUNCE_SEC = 60.0

# Janela do gatilho de mutação — estreita, porque uma mutação quase sempre mexe
# numa data próxima. A janela cheia é responsabilidade do job agendado.
_DIRTY_WINDOW_BACK = 30
_DIRTY_WINDOW_FWD = 90

# Janela cheia do job agendado / backfill manual.
_FULL_WINDOW_BACK = 365
_FULL_WINDOW_FWD = 365

# Worker único, FIFO, daemon — serializa as escritas no Google e não segura o
# request que disparou o `mark_dirty` (mesmo padrão de `gcal_sync._executor`).
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gcal-mirror")

# Timers de debounce por fonte (um `threading.Timer` pendente por source_id).
_dirty_lock = threading.Lock()
_dirty_timers: dict[str, threading.Timer] = {}


def _enabled() -> bool:
    """True se o espelho está ativo. Lê `GCAL_SYNC_ENABLED` a cada chamada."""
    return os.environ.get("GCAL_SYNC_ENABLED", "true").lower() != "false"


# ---------------------------------------------------------------------------
# Id determinístico e payload
# ---------------------------------------------------------------------------

def event_id_for(item: dict) -> str:
    """Id do evento no Google, derivado dos campos estáveis do `CalendarItem`.

    Chave = ``cal | kind | ref_id | date``. Estável entre execuções e entre
    processos (nada de `hash()` nativo, que é salgado por processo — mesma
    correção que Akane/Marin já fizeram, spec 049/052). Dois itens com a mesma
    chave são o mesmo item (dedup grátis no dict `desired`).

    Returns:
        32 chars hexadecimais (`0-9a-f`) — subconjunto válido do base32hex que a
        API do Google exige para ids escolhidos pelo cliente.
    """
    raw = "|".join(str(item.get(k, "")) for k in ("cal", "kind", "ref_id", "date"))
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _description(item: dict) -> str:
    """Monta a descrição do evento: o detalhe (`loc`) + o caminho de volta ao app.

    `gcal_sync` nunca preencheu `description` — aqui é ganho novo: no celular, o
    evento espelhado carrega o `deep_link` do webapp para reencontrar o item.
    """
    parts: list[str] = []
    if item.get("loc"):
        parts.append(str(item["loc"]))
    if item.get("deep_link"):
        parts.append(f"↗ {item['deep_link']}")
    return "\n".join(parts)


def _event_body(item: dict) -> dict:
    """Traduz um `CalendarItem` no corpo de evento aceito pela Google Calendar API.

    - `all_day` (ou sem `start`) → evento de dia inteiro. `end.date` é
      **exclusivo** na API do Google, então usamos `date + 1` (diferente da
      convenção `end == start` de `gcal_sync`, que é legado tolerado; aqui é
      caminho novo, seguimos a forma correta).
    - `start` sem `end` (só a Nami produz isso — transação usa a hora de criação)
      → `end = start + 30min`, mesma escolha de `gcal_sync._build_event_payload`.

    `reminders` explicitamente vazio: a esmagadora maioria dos itens é histórico
    (filme assistido, bullet, sessão de leitura) — notificação em massa seria
    spam. Quem quiser aviso de vencimento liga a notificação padrão DO calendário
    "Nami — Finanças" na UI do Google. `transparency=transparent` para o espelho
    não marcar o usuário como ocupado.
    """
    summary = (item.get("title") or "(sem título)")[:1024]

    if item.get("all_day") or not item.get("start"):
        d = item["date"]
        start_field = {"date": d}
        end_field = {"date": (date.fromisoformat(d) + timedelta(days=1)).isoformat()}
    else:
        sdt = datetime.fromisoformat(item["start"])
        if sdt.tzinfo is None:
            sdt = sdt.replace(tzinfo=_SP_TZ)
        if item.get("end"):
            edt = datetime.fromisoformat(item["end"])
            if edt.tzinfo is None:
                edt = edt.replace(tzinfo=_SP_TZ)
        else:
            edt = sdt + timedelta(minutes=30)
        start_field = {"dateTime": sdt.isoformat(), "timeZone": "America/Sao_Paulo"}
        end_field = {"dateTime": edt.isoformat(), "timeZone": "America/Sao_Paulo"}

    body: dict = {
        "summary": summary,
        "start": start_field,
        "end": end_field,
        "reminders": {"useDefault": False, "overrides": []},
        "transparency": "transparent",
    }
    desc = _description(item)
    if desc:
        body["description"] = desc
    return body


def _norm_point(field: dict) -> str:
    """Normaliza um `start`/`end` (formato bruto do Google) para comparação estável."""
    if not field:
        return ""
    if "date" in field:
        return field["date"]
    dt = field.get("dateTime", "")
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00")).astimezone(_SP_TZ).isoformat()
    except ValueError:
        return dt


def _differs(current: dict, desired: dict) -> bool:
    """True se o evento atual no Google divergir do desejado em summary/start/end."""
    if (current.get("summary") or "") != desired["summary"]:
        return True
    if _norm_point(current.get("start") or {}) != _norm_point(desired["start"]):
        return True
    if _norm_point(current.get("end") or {}) != _norm_point(desired["end"]):
        return True
    return False


# ---------------------------------------------------------------------------
# Operações unitárias no Google (nunca levantam)
# ---------------------------------------------------------------------------

def _http_status(exc: Exception) -> int | None:
    """Extrai o status HTTP de um HttpError do googleapiclient, se houver."""
    resp = getattr(exc, "resp", None)
    status = getattr(resp, "status", None)
    try:
        return int(status) if status is not None else None
    except (TypeError, ValueError):
        return None


def _insert(svc, cal_id: str, event_id: str, body: dict) -> bool:
    """Cria o evento com id determinístico. 409 (id de evento apagado ainda não
    purgado pelo Google) cai num patch que revive o evento (`status=confirmed`)."""
    payload = dict(body)
    payload["id"] = event_id
    try:
        svc.events().insert(calendarId=cal_id, body=payload).execute()
        return True
    except HttpError as exc:
        if _http_status(exc) == 409:
            try:
                revive = dict(body)
                revive["status"] = "confirmed"
                svc.events().patch(calendarId=cal_id, eventId=event_id, body=revive).execute()
                return True
            except Exception:
                _log.warning("mirror: revive falhou eid=%s cal=%s", event_id, cal_id, exc_info=True)
                return False
        _log.warning("mirror: insert falhou eid=%s cal=%s", event_id, cal_id, exc_info=True)
        return False
    except Exception:
        _log.warning("mirror: insert falhou eid=%s cal=%s", event_id, cal_id, exc_info=True)
        return False


def _patch(svc, cal_id: str, event_id: str, body: dict) -> bool:
    """Atualiza só os campos que o diff compara (summary/start/end)."""
    try:
        svc.events().patch(
            calendarId=cal_id,
            eventId=event_id,
            body={"summary": body["summary"], "start": body["start"], "end": body["end"]},
        ).execute()
        return True
    except Exception:
        _log.warning("mirror: patch falhou eid=%s cal=%s", event_id, cal_id, exc_info=True)
        return False


def _delete(svc, cal_id: str, event_id: str) -> bool:
    """Remove um evento que sobrou. 404/410 (já não existe) é sucesso silencioso."""
    try:
        svc.events().delete(calendarId=cal_id, eventId=event_id).execute()
        return True
    except HttpError as exc:
        if _http_status(exc) in (404, 410):
            return True
        _log.warning("mirror: delete falhou eid=%s cal=%s", event_id, cal_id, exc_info=True)
        return False
    except Exception:
        _log.warning("mirror: delete falhou eid=%s cal=%s", event_id, cal_id, exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Reconciliação
# ---------------------------------------------------------------------------

def reconcile_source(source_id: str, start: str, end: str) -> dict:
    """Reconcilia UMA fonte do hub contra seu calendário-espelho no Google.

    Síncrono, best-effort — **nunca levanta**. Fluxo:
    1. Chama o mesmo provider que a tela de Calendário usa
       (`calendar_hub._PROVIDERS[source_id]`) — nenhuma query duplicada.
    2. `desired = {event_id_for(item): _event_body(item)}`.
    3. `actual = {ev["id"]: ev}` de `gcal.list_raw_events(cal_id, start, end)`.
    4. `insert` os que faltam · `patch` os que divergem · `delete` os que sobram.

    Args:
        source_id: Chave da fonte em `gcal.MIRRORED_SOURCES` (ex.: "nami").
        start, end: Janela YYYY-MM-DD (inclusive).

    Returns:
        Dict de resumo: `{source, inserted, updated, deleted, truncated}` em caso
        de sucesso, ou `{source, error}` se algo impediu a reconciliação.
    """
    if source_id not in _MIRRORED:
        return {"source": source_id, "error": "fonte desconhecida"}

    provider = calendar_hub._PROVIDERS.get(source_id)
    if provider is None:
        _log.warning("mirror: fonte '%s' sem provider registrado no hub", source_id)
        return {"source": source_id, "error": "sem provider"}

    try:
        items = provider(start, end) or []
    except Exception:
        _log.warning("mirror: provider da fonte '%s' falhou", source_id, exc_info=True)
        return {"source": source_id, "error": "provider"}

    desired: dict[str, dict] = {}
    for it in items:
        if not it.get("date"):
            continue
        desired[event_id_for(it)] = _event_body(it)

    truncated = False
    if len(desired) > _MAX_EVENTS_PER_SOURCE:
        _log.warning(
            "mirror: fonte '%s' quer %d eventos (> teto %d) — truncando. "
            "Se recorrente, filtrar por status no provider ou por `kind` aqui.",
            source_id, len(desired), _MAX_EVENTS_PER_SOURCE,
        )
        desired = dict(list(desired.items())[:_MAX_EVENTS_PER_SOURCE])
        truncated = True

    try:
        cal_id = gcal.ensure_mirror_calendar(source_id)
        actual = {ev["id"]: ev for ev in gcal.list_raw_events(cal_id, start, end)}
    except Exception:
        _log.warning("mirror: falha ao preparar/listar o calendário de '%s'", source_id, exc_info=True)
        return {"source": source_id, "error": "gcal"}

    svc = gcal._get_service()
    inserted = updated = deleted = 0

    for eid, body in desired.items():
        current = actual.get(eid)
        if current is None:
            if _insert(svc, cal_id, eid, body):
                inserted += 1
        elif _differs(current, body):
            if _patch(svc, cal_id, eid, body):
                updated += 1

    for eid in actual.keys() - desired.keys():
        if _delete(svc, cal_id, eid):
            deleted += 1

    _log.info(
        "mirror %s [%s..%s]: +%d ~%d -%d%s",
        source_id, start, end, inserted, updated, deleted,
        " (truncado)" if truncated else "",
    )
    return {
        "source": source_id,
        "inserted": inserted,
        "updated": updated,
        "deleted": deleted,
        "truncated": truncated,
    }


def reconcile_all(start: str, end: str) -> list[dict]:
    """Reconcilia todas as fontes espelhadas. Best-effort — uma falha não para as demais."""
    return [reconcile_source(sid, start, end) for sid in _MIRRORED]


def full_window(today: date | None = None) -> tuple[str, str]:
    """Janela cheia do job/backfill: (hoje−365, hoje+365) em America/Sao_Paulo."""
    today = today or datetime.now(_SP_TZ).date()
    return (
        (today - timedelta(days=_FULL_WINDOW_BACK)).isoformat(),
        (today + timedelta(days=_FULL_WINDOW_FWD)).isoformat(),
    )


# ---------------------------------------------------------------------------
# Gatilho de mutação (fire-and-forget, com debounce)
# ---------------------------------------------------------------------------

def _flush_dirty(source_id: str) -> None:
    """Callback do timer de debounce — submete a reconciliação da janela estreita."""
    with _dirty_lock:
        _dirty_timers.pop(source_id, None)
    today = datetime.now(_SP_TZ).date()
    start = (today - timedelta(days=_DIRTY_WINDOW_BACK)).isoformat()
    end = (today + timedelta(days=_DIRTY_WINDOW_FWD)).isoformat()
    _executor.submit(reconcile_source, source_id, start, end)


def mark_dirty(source_id: str) -> None:
    """Marca uma fonte como suja — reconcilia a janela estreita ~60s depois.

    API pública para os agentes. Chamada após cada mutação que produz item de
    calendário (lazy import + `try/except: pass`, **depois** do commit — mesmo
    padrão de `gcal_sync.push_task` em `tools_tasks.py`). Rajadas de mutação são
    absorvidas pelo debounce: o timer reinicia a cada chamada, então roda uma vez
    só, ~60s após a última.

    No-op silencioso se `GCAL_SYNC_ENABLED=false` ou `source_id` desconhecido.
    """
    if not _enabled() or source_id not in _MIRRORED:
        return
    with _dirty_lock:
        pending = _dirty_timers.get(source_id)
        if pending is not None:
            pending.cancel()
        timer = threading.Timer(_DIRTY_DEBOUNCE_SEC, _flush_dirty, args=(source_id,))
        timer.daemon = True
        _dirty_timers[source_id] = timer
        timer.start()
