"""Relatório mensal do fechamento (spec 048, US4).

No dia 1º de manhã, fecha o mês anterior: gastos por categoria (top 5), comparação com o
mês anterior a esse, e o score de saúde financeira — tudo reaproveitando tools já
existentes (`get_spending_summary`, `get_financial_health_score`), formatado no estilo da
Nami (HTML). Executado manualmente em outro dia, reporta o último mês fechado (não o
corrente) — mesma lógica de "mês anterior a hoje" independe de quando o script roda.

Falha estrutural (DB/Telegram) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_monthly_report`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_monthly_report
"""

import logging
import os
import sys
from datetime import timedelta

import requests

from agents.nami.tools import _today_date, get_spending_summary
from agents.nami.tools_health import get_financial_health_score

log = logging.getLogger("monthly-report")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

_TELEGRAM_TIMEOUT = 30


def _send_telegram(html: str) -> None:
    """Envia o relatório ao Telegram via POST direto (parse_mode=HTML).

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


def _prev_month_str(year: int, month: int) -> str:
    """Retorna o mês anterior no formato YYYY-MM."""
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def _last_closed_month() -> str:
    """Retorna o último mês fechado (o mês anterior a hoje) no formato YYYY-MM."""
    today = _today_date()
    first_of_this_month = today.replace(day=1)
    last_day_prev_month = first_of_this_month - timedelta(days=1)
    return last_day_prev_month.strftime("%Y-%m")


def build_report() -> str:
    """Monta o HTML do relatório do último mês fechado. Levanta exceção em falha de DB."""
    month = _last_closed_month()
    year, m = int(month[:4]), int(month[5:])
    prev_month = _prev_month_str(year, m)

    summary = get_spending_summary(period=month, group_by="categoria")
    prev_summary = get_spending_summary(period=prev_month, group_by="categoria")
    health = get_financial_health_score(month)

    total = summary.get("total", 0.0) if summary.get("status") == "ok" else 0.0
    prev_total = prev_summary.get("total", 0.0) if prev_summary.get("status") == "ok" else 0.0

    variacao = total - prev_total
    variacao_pct = (variacao / prev_total * 100) if prev_total > 0 else None
    seta = "📈" if variacao > 0 else "📉" if variacao < 0 else "➡️"

    # Top 5 categorias do mês
    top_cats = sorted(
        summary.get("summary", {}).items(), key=lambda kv: kv[1], reverse=True,
    )[:5]

    lines = [
        f"📊 <b>Nami:</b> fechamento de {month}",
        "",
        f"<b>Total gasto: R${total:.2f}</b>",
    ]
    for cat, val in top_cats:
        lines.append(f"  {cat} · · · R${val:.2f}")

    lines.append("")
    if variacao_pct is not None:
        lines.append(f"{seta} vs. {prev_month}: R${prev_total:.2f} ({variacao_pct:+.1f}%)")
    else:
        lines.append(f"{seta} vs. {prev_month}: R${prev_total:.2f}")

    if health.get("status") == "ok":
        lines.append("")
        lines.append(f"💚 <b>Saúde financeira: {health['score']}/100</b>")
        lines.append(health.get("message", ""))

    return "\n".join(lines)


def main() -> int:
    """Executa o job. Returns 0 em sucesso, 1 em falha estrutural."""
    try:
        html = build_report()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao montar o relatório mensal: %s", exc)
        return 1

    try:
        _send_telegram(html)
    except Exception as exc:  # noqa: BLE001 — falha estrutural (Telegram)
        log.error("Falha ao enviar o relatório ao Telegram: %s", exc)
        return 1

    print(f"[monthly-report] relatório de {_last_closed_month()} enviado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
