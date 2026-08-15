"""Lembrete PONTUAL de tarefas com vencimento (Kaguya) — spec 064 US5/FR-012.

Kaguya não tinha nenhuma notificação de tarefas. A primeira versão deste job mandava um
resumo de tudo que estava vencido/de hoje a cada 4h — não era pontual (uma tarefa marcada
para "daqui 10 minutos" só aparecia na próxima rodada, até 4h depois). Esta versão roda a
cada 5min e avisa cada tarefa **uma vez**, assim que o vencimento chega — reaproveitando
`list_tasks_due_for_reminder()`/`mark_due_reminder_sent()` (trava por
`tasks.due_reminder_sent_at`, mesmo padrão de `subscriptions.last_notice_date` da Nami).

Silencioso quando não há nada que acabou de vencer — não é falha, é sucesso sem envio.

Falha estrutural (DB/envio) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_kaguya_due_reminders`) converte isso em `RuntimeError`. Uma tarefa
só é marcada como notificada (`mark_due_reminder_sent`) DEPOIS do envio ter sucesso — se o
envio falhar, ela continua elegível e tenta de novo no próximo ciclo de 5min.

Usage:
    python -m scripts.send_kaguya_due_reminders
"""

import logging
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from agents.kaguya.tools_tasks import list_tasks_due_for_reminder, mark_due_reminder_sent
from scheduler.notify_channels import send_notification

_SP_TZ = ZoneInfo("America/Sao_Paulo")

log = logging.getLogger("kaguya-due-reminders")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")


def _format_task(task: dict, today_iso: str) -> str:
    atrasada = task["due_date"] < today_iso
    tag = "⚠️ Atrasada" if atrasada else "📅 Vence agora"
    hora = f" às {task['due_time']}" if task.get("due_time") else ""
    return f"{tag}: <b>{task['title']}</b> — {task['project_name']}{hora}"


def _build_message(tasks: list[dict]) -> str:
    today_iso = datetime.now(_SP_TZ).date().isoformat()
    lines = ["📋 <b>Kaguya:</b>", ""]
    lines.extend(_format_task(t, today_iso) for t in tasks)
    return "\n".join(lines)


def main() -> int:
    """Executa o job. Returns 0 em sucesso (com ou sem envio), 1 em falha estrutural."""
    try:
        tasks = list_tasks_due_for_reminder()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao listar tarefas com vencimento: %s", exc)
        return 1

    if not tasks:
        print("[kaguya-due-reminders] nada venceu desde a última rodada — nada a enviar")
        return 0

    if not send_notification(_build_message(tasks)):
        log.error("Falha ao enviar lembrete: nenhum canal recebeu — tenta de novo no próximo ciclo")
        return 1

    try:
        mark_due_reminder_sent([t["id"] for t in tasks])
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Enviado, mas falha ao marcar como notificado (vai repetir no próximo ciclo): %s", exc)
        return 1

    print(f"[kaguya-due-reminders] {len(tasks)} tarefa(s) notificada(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
