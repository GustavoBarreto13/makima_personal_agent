"""Lembrete de domingo à noite — revisão semanal do GTD (spec 035, US3).

Checa se alguma revisão foi concluída nos últimos 7 dias corridos (fuso America/Sao_Paulo);
se **não** houve nenhuma, envia um lembrete ao Telegram com um resumo curto (tamanho do
inbox + itens "aguardando" antigos). Se já houve revisão na semana, não envia nada — isso
NÃO é falha (FR-007, "somente se").

Falha estrutural (DB/Telegram) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_weekly_review_reminder`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_weekly_review_reminder
"""

import logging
import os
import sys

import requests

from agents.kaguya.tools_review import get_reminder_summary

log = logging.getLogger("weekly-review-reminder")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

_TELEGRAM_TIMEOUT = 30


def _send_telegram(text: str) -> None:
    """Envia o lembrete ao Telegram via POST direto (mesmo padrão de scheduler/notify.py).

    Raises:
        RuntimeError: se as credenciais estiverem ausentes ou o envio falhar.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_ALERT_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID não configurados")

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    resp = requests.post(
        url,
        json={"chat_id": chat_id, "text": text},
        timeout=_TELEGRAM_TIMEOUT,
    )
    resp.raise_for_status()


def _build_message(summary: dict) -> str:
    """Monta o texto do lembrete a partir do resumo (contracts/rest-api.md § Telegram)."""
    lines = [
        "🗓 Revisão semanal pendente",
        "",
        "Você não concluiu a revisão esta semana. Te espera:",
        f"• {summary['inbox_count']} item(ns) no inbox",
        f"• {summary['stale_waiting_count']} item(ns) aguardando há mais de uma semana",
        "",
        "Abra o painel e faça a revisão (leva menos de 15 min).",
    ]
    return "\n".join(lines)


def main() -> int:
    """Executa o job. Returns 0 em sucesso (enviou ou não precisava enviar), 1 em falha."""
    try:
        summary = get_reminder_summary()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao calcular o resumo do lembrete: %s", exc)
        return 1

    if not summary["should_send"]:
        print("[weekly-review-reminder] revisão concluída nos últimos 7 dias — nada a enviar")
        return 0

    try:
        _send_telegram(_build_message(summary))
    except Exception as exc:  # noqa: BLE001 — falha estrutural (Telegram)
        log.error("Falha ao enviar o lembrete ao Telegram: %s", exc)
        return 1

    print(
        f"[weekly-review-reminder] lembrete enviado — inbox={summary['inbox_count']}, "
        f"aguardando_antigos={summary['stale_waiting_count']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
