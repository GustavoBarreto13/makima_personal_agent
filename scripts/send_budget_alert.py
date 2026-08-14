"""Alerta diário de orçamento (spec 048, US3).

Verifica os envelopes do mês corrente (`get_budget_status`, já existente) e avisa nos
canais configurados (`scheduler/notify_channels.py` — hoje só WhatsApp) as categorias com
≥90% do limite consumido ou estouradas — distinguindo os dois estados. Silencioso quando
tudo está dentro do limite (FR-004) — não é falha, é sucesso sem envio.

Falha estrutural (DB/envio) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_budget_alert`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_budget_alert
"""

import logging
import sys

from agents.nami.tools import _today_date
from agents.nami.tools_budgets import get_budget_status
from scheduler.notify_channels import send_notification

log = logging.getLogger("budget-alert")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

_ALERT_THRESHOLD_PCT = 90.0


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

    if not send_notification(_build_message(envelopes_em_alerta)):
        log.error("Falha ao enviar alerta: nenhum canal recebeu a notificação")
        return 1

    print(f"[budget-alert] {month}: {len(envelopes_em_alerta)} categoria(s) em alerta — enviado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
