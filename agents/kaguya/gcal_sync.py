"""Espelho de saída best-effort: sincroniza tarefas Kaguya → Google Calendar.

Propósito
---------
Toda mutação de tarefa com data (create/update/complete/reopen/delete/restore/
set_time_block/clear_time_block) chama `push_task` ou `remove_task_event` após
o commit PostgreSQL, **fora da transação** (não segurar o lock durante HTTP).

As funções **nunca levantam exceção** — falhas do Google (rede, credenciais) são
silenciadas para que o CRUD de tarefas continue funcionando normalmente.

O espelho é controlado pela variável GCAL_SYNC_ENABLED (padrão: "true").
Se GCAL_SYNC_ENABLED=false, todas as chamadas viram no-op.

Usage:
    >>> from agents.kaguya import gcal_sync
    >>> gcal_sync.push_task(task_id=42)
    >>> gcal_sync.remove_task_event(task_id=42)
"""

import os
from datetime import timedelta

# Importa o cliente Google Calendar compartilhado
from agents.kaguya import gcal
# Importa o helper PostgreSQL compartilhado (run_select, run_dml)
from agents.db import run_select, run_dml


# ---------------------------------------------------------------------------
# Gate de feature — desabilita tudo sem afetar o CRUD de tarefas
# ---------------------------------------------------------------------------

def _enabled() -> bool:
    """Retorna True se o espelho Google está ativo.

    Lê GCAL_SYNC_ENABLED em cada chamada para permitir toggle em runtime
    (ex.: em testes, setar a variável depois de importar o módulo).

    Returns:
        True se o espelho deve operar; False se está desabilitado.
    """
    # "false" (qualquer caixa) desativa; qualquer outro valor mantém ativo
    return os.environ.get("GCAL_SYNC_ENABLED", "true").lower() != "false"


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _load_task(task_id: int) -> dict | None:
    """Carrega os campos necessários da tarefa para montar o evento.

    Args:
        task_id: ID da tarefa no banco.

    Returns:
        Dict com campos da tarefa ou None se não encontrada / soft-deletada.
    """
    rows = run_select(
        """
        SELECT id, title, due_date, start_at, end_at, completed_at,
               google_event_id, deleted_at
        FROM tasks
        WHERE id = %(task_id)s
        """,
        {"task_id": task_id},
    )
    return rows[0] if rows else None


def _build_event_payload(task: dict) -> dict:
    """Monta o payload do evento Google a partir dos campos da tarefa.

    Decisão timed vs all-day (data-model §5):
    - `start_at` preenchido → evento com hora (dateTime)
    - só `due_date` → evento de dia inteiro (all_day=True)

    Tarefa concluída recebe prefixo "✓ " no título para distinção visual
    no Google Calendar (sem remover o evento, que serve como histórico).

    Args:
        task: Dict com campos da tarefa (carregado por `_load_task`).

    Returns:
        Dict com os campos aceitos por `gcal.create_event` / `gcal.update_event`:
        summary, start, end, all_day, description.
    """
    # Prefixo "✓ " quando a tarefa está concluída
    title = task["title"] or "(sem título)"
    if task.get("completed_at"):
        summary = f"✓ {title}"
    else:
        summary = title

    # Determina o tipo de evento: com hora ou dia inteiro
    if task.get("start_at"):
        # Tarefa com time-blocking: usar o bloco de tempo como horário do evento
        start_str = task["start_at"]
        # Se start_at for um datetime object, converte para ISO string
        if hasattr(start_str, "isoformat"):
            start_str = start_str.isoformat()

        # Usa end_at se disponível; senão deriva 30 min após start_at
        if task.get("end_at"):
            end_str = task["end_at"]
            if hasattr(end_str, "isoformat"):
                end_str = end_str.isoformat()
        else:
            # Deriva end_at = start_at + 30 min
            from datetime import datetime
            try:
                start_dt = datetime.fromisoformat(start_str)
                end_str = (start_dt + timedelta(minutes=30)).isoformat()
            except ValueError:
                # Fallback: repete o start_at (evento de duração zero — raro)
                end_str = start_str

        return {
            "summary": summary,
            "start": start_str,
            "end": end_str,
            "all_day": False,
        }

    elif task.get("due_date"):
        # Tarefa só com data: evento de dia inteiro
        # due_date pode ser um date object (psycopg2 retorna date) ou string
        due = task["due_date"]
        if hasattr(due, "isoformat"):
            due = due.isoformat()   # "YYYY-MM-DD"

        return {
            "summary": summary,
            "start": due,
            "end": due,   # Google exige end ≥ start; para all-day repete o dia
            "all_day": True,
        }

    else:
        # Tarefa sem data — não deve ser espelhada
        return {}


# ---------------------------------------------------------------------------
# Funções públicas
# ---------------------------------------------------------------------------

def push_task(task_id: int) -> None:
    """Cria ou atualiza o evento espelho desta tarefa no Google Calendar.

    Fluxo:
    1. Checa GCAL_SYNC_ENABLED — no-op se desabilitado.
    2. Carrega a tarefa do banco.
    3. Se a tarefa não tem data (due_date nem start_at), não espelha.
    4. Se `google_event_id` já existe → atualiza o evento existente (upsert idempotente).
    5. Se não existe → cria um novo evento no calendário "Kaguya — Tarefas" e salva
       o ID retornado em `tasks.google_event_id`.

    Nunca levanta exceção — qualquer falha (rede, credenciais, quota) é silenciada.

    Args:
        task_id: ID da tarefa a espelhar.
    """
    # Guard: feature flag desabilitada
    if not _enabled():
        return

    try:
        # Carrega os dados necessários do banco
        task = _load_task(task_id)
        if task is None:
            return   # Tarefa não encontrada (pode ter sido deletada permanentemente)

        # Monta o payload do evento
        payload = _build_event_payload(task)
        if not payload:
            return   # Tarefa sem data — não espelha

        # Garante que o calendário "Kaguya — Tarefas" existe (idempotente)
        kaguya_cal_id = gcal.ensure_kaguya_calendar()

        existing_event_id = task.get("google_event_id")

        if existing_event_id:
            # Evento já existe no Google — atualiza os campos que mudaram
            gcal.update_event(
                calendar_id=kaguya_cal_id,
                event_id=existing_event_id,
                summary=payload["summary"],
                start=payload["start"],
                end=payload["end"],
                all_day=payload["all_day"],
            )
        else:
            # Evento ainda não existe — cria e salva o ID retornado
            result = gcal.create_event(
                calendar_id=kaguya_cal_id,
                summary=payload["summary"],
                start=payload["start"],
                end=payload["end"],
                all_day=payload["all_day"],
            )
            new_event_id = result.get("id")
            if new_event_id:
                # Persiste o ID do evento no banco para upserts futuros
                run_dml(
                    "UPDATE tasks SET google_event_id = %(eid)s WHERE id = %(tid)s",
                    {"eid": new_event_id, "tid": task_id},
                )

    except Exception:
        # Falha best-effort: qualquer exceção é silenciada.
        # O CRUD de tarefas não pode ser bloqueado por indisponibilidade do Google.
        pass


def remove_task_event(task_id: int) -> None:
    """Remove o evento espelho desta tarefa do Google Calendar e limpa o ID no banco.

    Chamado em soft-delete de tarefa. Se a tarefa não tem `google_event_id`,
    a função retorna silenciosamente sem fazer nada.

    Nunca levanta exceção — qualquer falha Google é silenciada.

    Args:
        task_id: ID da tarefa cujo evento deve ser removido.
    """
    # Guard: feature flag desabilitada
    if not _enabled():
        return

    try:
        # Carrega o google_event_id da tarefa
        task = _load_task(task_id)
        if task is None:
            return

        event_id = task.get("google_event_id")
        if not event_id:
            return   # Sem evento espelho — nada a remover

        # Garante o ID do calendário "Kaguya — Tarefas"
        kaguya_cal_id = gcal.ensure_kaguya_calendar()

        # Remove o evento do Google Calendar
        gcal.delete_event(calendar_id=kaguya_cal_id, event_id=event_id)

        # Limpa o ID no banco para evitar tentativas de update/delete futuros
        run_dml(
            "UPDATE tasks SET google_event_id = NULL WHERE id = %(tid)s",
            {"tid": task_id},
        )

    except Exception:
        # Falha best-effort: silenciada para não bloquear o delete de tarefa.
        pass
