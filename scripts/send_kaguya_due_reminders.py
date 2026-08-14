"""Lembrete periódico de tarefas com vencimento (Kaguya) — spec 064 US5/FR-012.

Kaguya não tinha nenhuma notificação de tarefas — o usuário só via `due_date`/`due_time`
se abrisse o app ou perguntasse pela Telegram. Este job roda algumas vezes ao dia e avisa
nos canais configurados (`scheduler/notify_channels.py` — hoje só WhatsApp) as tarefas
vencidas e as de hoje, reaproveitando `list_tasks_today()` (já usado pelo `/hoje` do
Telegram e pelo Meu Dia) — nenhuma query nova.

Silencioso quando não há nada vencido nem para hoje — não é falha, é sucesso sem envio
(mesmo padrão de `send_weekly_review_reminder.py`/`send_budget_alert.py`).

Falha estrutural (DB/envio) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_kaguya_due_reminders`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_kaguya_due_reminders
"""

import logging
import sys

from agents.kaguya.tools_tasks import list_tasks_today
from scheduler.notify_channels import send_notification

log = logging.getLogger("kaguya-due-reminders")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")


def _format_task(task: dict) -> str:
    hora = f" às {task['due_time']}" if task.get("due_time") else ""
    return f"• <b>{task['title']}</b> — {task['project_name']}{hora}"


def _build_message(overdue: list[dict], today: list[dict]) -> str:
    """Monta a mensagem agrupada (mesmo espírito do FR-007 do budget_alert)."""
    lines = ["📋 <b>Kaguya:</b> tarefas com vencimento"]
    if overdue:
        lines.append("")
        lines.append("⚠️ <b>Atrasadas</b>")
        lines.extend(_format_task(t) for t in overdue)
    if today:
        lines.append("")
        lines.append("📅 <b>Hoje</b>")
        lines.extend(_format_task(t) for t in today)
    return "\n".join(lines)


def main() -> int:
    """Executa o job. Returns 0 em sucesso (com ou sem envio), 1 em falha estrutural."""
    try:
        result = list_tasks_today()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao listar tarefas de hoje/vencidas: %s", exc)
        return 1

    overdue, today = result["overdue"], result["today"]

    if not overdue and not today:
        print("[kaguya-due-reminders] nada vencido nem para hoje — nada a enviar")
        return 0

    if not send_notification(_build_message(overdue, today)):
        log.error("Falha ao enviar lembrete: nenhum canal recebeu a notificação")
        return 1

    print(f"[kaguya-due-reminders] atrasadas={len(overdue)}, hoje={len(today)} — enviado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
