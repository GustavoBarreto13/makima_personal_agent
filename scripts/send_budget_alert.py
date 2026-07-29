"""Alerta diário de orçamento (spec 048, US3).

Verifica os envelopes do mês corrente (`get_budget_status`, já existente) e avisa no
Telegram as categorias com ≥90% do limite consumido ou estouradas — distinguindo os dois
estados. Silencioso quando tudo está dentro do limite (FR-004) — não é falha, é sucesso
sem envio.

Falha estrutural (DB/Telegram) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_budget_alert`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_budget_alert
"""

import logging
import os
import sys

import requests

from agents.nami.tools import _today_date
from agents.nami.tools_budgets import get_budget_status

log = logging.getLogger("budget-alert")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

_TELEGRAM_TIMEOUT = 30
_ALERT_THRESHOLD_PCT = 90.0


def _send_telegram(html: str) -> None:
    """Envia o alerta ao Telegram via POST direto (parse_mode=HTML).

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
        json={"chat_id": chat_id, "text": html, "parse_mode": "HTML"},
        timeout=_TELEGRAM_TIMEOUT,
    )
    resp.raise_for_status()


def _build_message(envelopes: list[dict]) -> str:
    """Monta a mensagem agrupada com as categorias em alerta (FR-007)."""
    lines = ["💸 <b>Nami:</b> alerta de orçamento!", ""]
    for e in envelopes:
        estado = "ESTOUROU" if e["estourado"] else "quase lá"
        lines.append(
            f"{'🔴' if e['estourado'] else '🟡'} <b>{e['categoria']}</b> — {estado} "
            f"(R${e['gasto']:.2f} de R${e['limite']:.2f}, {e['pct_usado']:.0f}%)"
        )
    return "\n".join(lines)


def main() -> int:
    """Executa o job. Returns 0 em sucesso (com ou sem envio), 1 em falha estrutural."""
    month = _today_date().strftime("%Y-%m")

    try:
        result = get_budget_status(month)
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao calcular status do orçamento: %s", exc)
        return 1

    if result.get("status") != "ok":
        log.error("get_budget_status retornou erro: %s", result.get("message"))
        return 1

    envelopes_em_alerta = [e for e in result["envelopes"] if e["pct_usado"] >= _ALERT_THRESHOLD_PCT]

    if not envelopes_em_alerta:
        print(f"[budget-alert] {month}: todas as categorias dentro do limite — nada a enviar")
        return 0

    try:
        _send_telegram(_build_message(envelopes_em_alerta))
    except Exception as exc:  # noqa: BLE001 — falha estrutural (Telegram)
        log.error("Falha ao enviar alerta ao Telegram: %s", exc)
        return 1

    print(f"[budget-alert] {month}: {len(envelopes_em_alerta)} categoria(s) em alerta — enviado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
