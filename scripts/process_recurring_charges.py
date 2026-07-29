"""Job diário de cobranças recorrentes (spec 048, US1+US2).

Um único loop sobre `subscriptions` ativas (assinaturas e contas fixas — spec 044):

- **D-3**: avisa no Telegram que a cobrança vem em 3 dias.
- **No vencimento (ou atrasada — recuperação de job perdido)**:
  - `kind='assinatura'` ou `auto_lancar=True` → lança a despesa automaticamente e rola
    o próximo ciclo, via `mark_subscription_paid` (atômico, já existente da spec 044).
  - Conta fixa com `auto_lancar=False` → só avisa "confirme o valor", não lança nada.

Idempotência (FR-002): o lançamento automático rola `next_billing` para a frente, então
uma reexecução no mesmo dia recalcula `dias_até_vencer` sobre a nova data e não relança.
Os avisos (que não mudam nenhum estado) usam a coluna `subscriptions.last_notice_date`
como trava — no máximo um aviso por dia por recorrência.

Mensagens do dia são agrupadas numa única notificação (FR-007).

Falha estrutural (DB/Telegram) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_recurring_charges`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.process_recurring_charges
"""

import logging
import os
import sys
from datetime import date

import requests

from agents.db import run_select, run_dml
from agents.nami.tools import _today_date, mark_subscription_paid

log = logging.getLogger("recurring-charges")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

_TELEGRAM_TIMEOUT = 30
_WARNING_DAYS = 3


def _send_telegram(html: str) -> None:
    """Envia a notificação ao Telegram via POST direto (parse_mode=HTML).

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


def _mark_notice_sent(sub_id: str, today: date) -> None:
    """Grava a trava de aviso diário para não duplicar em reexecuções (FR-002)."""
    run_dml(
        "UPDATE subscriptions SET last_notice_date = %(today)s WHERE id = %(id)s",
        {"today": today.isoformat(), "id": sub_id},
    )


def process() -> dict:
    """Processa todas as recorrências ativas. Returns um resumo com contadores e o HTML da mensagem.

    Levanta exceção em erro estrutural (DB) — quem chama decide o tratamento.
    """
    today = _today_date()

    rows = run_select(
        """
        SELECT id, name, valor, ciclo, next_billing::text AS next_billing,
               COALESCE(kind, 'assinatura') AS kind, COALESCE(auto_lancar, TRUE) AS auto_lancar,
               last_notice_date::text AS last_notice_date
          FROM subscriptions
         WHERE status = 'ativa' AND (deleted = FALSE OR deleted IS NULL)
        """,
    )

    launched: list[str] = []
    warned_d3: list[str] = []
    pending_confirmation: list[str] = []
    errors: list[str] = []

    for sub in rows:
        next_billing = date.fromisoformat(sub["next_billing"]) if sub["next_billing"] else None
        if next_billing is None:
            continue

        already_notified_today = sub["last_notice_date"] == today.isoformat()
        days_until = (next_billing - today).days

        if days_until <= 0:
            # No vencimento ou atrasada (job perdido) — lança com a DATA DEVIDA, não hoje.
            if sub["auto_lancar"]:
                result = mark_subscription_paid(
                    id=sub["id"], valor=float(sub["valor"]), data=next_billing.isoformat(),
                )
                if result.get("status") == "ok":
                    launched.append(f"💸 <b>{sub['name']}</b> — R${float(sub['valor']):.2f}")
                else:
                    errors.append(f"{sub['name']}: {result.get('message')}")
            elif not already_notified_today:
                pending_confirmation.append(f"⏳ <b>{sub['name']}</b> — confirme o valor real")
                _mark_notice_sent(sub["id"], today)
        elif days_until == _WARNING_DAYS and not already_notified_today:
            data_fmt = next_billing.strftime("%d/%m")
            warned_d3.append(f"📅 <b>{sub['name']}</b> — R${float(sub['valor']):.2f} em {data_fmt}")
            _mark_notice_sent(sub["id"], today)

    # Monta a mensagem agrupada (FR-007) — só envia se houver algo a dizer.
    blocks: list[str] = []
    if launched:
        blocks.append("✅ <b>Lançadas automaticamente</b>\n" + "\n".join(launched))
    if warned_d3:
        blocks.append("🔔 <b>Cobrando em 3 dias</b>\n" + "\n".join(warned_d3))
    if pending_confirmation:
        blocks.append("⚠️ <b>Vencem hoje — aguardando confirmação</b>\n" + "\n".join(pending_confirmation))
    if errors:
        blocks.append("❌ <b>Erros ao lançar</b>\n" + "\n".join(errors))

    html = "\n\n".join(blocks)
    return {
        "html": html,
        "launched": len(launched), "warned_d3": len(warned_d3),
        "pending_confirmation": len(pending_confirmation), "errors": len(errors),
    }


def main() -> int:
    """Executa o job. Returns 0 em sucesso (com ou sem envio), 1 em falha estrutural."""
    try:
        summary = process()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao processar cobranças recorrentes: %s", exc)
        return 1

    if not summary["html"]:
        print("[recurring-charges] nada a lançar ou avisar hoje")
        return 0

    try:
        _send_telegram(summary["html"])
    except Exception as exc:  # noqa: BLE001 — falha estrutural (Telegram)
        log.error("Falha ao enviar notificação ao Telegram: %s", exc)
        return 1

    print(
        f"[recurring-charges] lançadas={summary['launched']}, avisos_d3={summary['warned_d3']}, "
        f"pendentes_confirmacao={summary['pending_confirmation']}, erros={summary['errors']}"
    )
    if summary["errors"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
