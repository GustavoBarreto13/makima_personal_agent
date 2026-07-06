"""Digest matinal de emails (Lucy) — job diário agendado (spec 032, US1).

Busca os emails de ontem (America/Sao_Paulo, cap 50), classifica cada um via Gemini,
aplica a label da categoria no Gmail, arquiva os "Junk", envia o digest ao Telegram
(parse_mode=HTML) e persiste o histórico em `lucy_emails`.

Falha por item (label/archive) é logada e não interrompe o lote (FR-015). Falha
estrutural (IMAP/Gemini/Telegram/DB) aborta com `sys.exit(1)` — o wrapper do scheduler
(`scheduler/jobs.py::run_lucy_digest`) converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_lucy_digest
"""

import logging
import os
import sys

import requests

from agents.lucy import gmail_imap
from agents.lucy.tools import (
    ClassificationError,
    build_telegram_digest,
    classify_emails,
    persist_classified,
    yesterday_local_date,
)

log = logging.getLogger("lucy-digest")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

_TELEGRAM_TIMEOUT = 30


def _send_telegram(html: str) -> None:
    """Enviar o digest ao Telegram via POST direto (parse_mode=HTML).

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


def main() -> int:
    """Executa o digest diário. Returns 0 em sucesso, 1 em falha estrutural."""
    try:
        criteria = gmail_imap.yesterday_search_criteria()
        emails = gmail_imap.fetch_emails(criteria, limit=50)
    except Exception as exc:  # noqa: BLE001 — falha estrutural (conexão IMAP)
        log.error("Falha ao buscar emails via IMAP: %s", exc)
        return 1

    if not emails:
        log.info("Nenhum email de ontem encontrado.")
        digest_html = build_telegram_digest([], {"prompt_tokens": 0, "candidates_tokens": 0})
        try:
            _send_telegram(digest_html)
        except Exception as exc:  # noqa: BLE001
            log.error("Falha ao enviar digest (sem emails) ao Telegram: %s", exc)
            return 1
        print("[lucy-digest] 0 emails, nada a processar")
        return 0

    try:
        result = classify_emails(emails)
    except ClassificationError as exc:
        log.error("Falha estrutural na classificação: %s", exc)
        return 1

    classified_by_uid = {c["uid"]: c for c in result["classified"]}
    usage = result["usage"]

    # Mescla dados do email (from_name/subject etc.) com a classificação por uid.
    merged = []
    for e in emails:
        c = classified_by_uid.get(e["imap_uid"])
        if not c:
            continue
        merged.append({**e, **c})

    # Aplica label/archive por item — falha individual não derruba o lote (FR-015/R9).
    junk_count = 0
    try:
        mail = gmail_imap.open_connection()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (conexão IMAP)
        log.error("Falha ao reconectar no IMAP para labelar/arquivar: %s", exc)
        return 1

    try:
        for item in merged:
            uid = item["imap_uid"]
            category = item["category"]
            try:
                gmail_imap.apply_label(mail, uid, category)
                if category == "Junk":
                    gmail_imap.archive(mail, uid)
                    junk_count += 1
            except Exception as exc:  # noqa: BLE001 — falha por item, não derruba o lote
                log.warning("Falha ao labelar/arquivar uid=%s: %s", uid, exc)
    finally:
        mail.logout()

    digest_html = build_telegram_digest(
        [{"category": item["category"], "priority": item["priority"],
          "action": item["action"], "summary": item["summary"]} for item in merged],
        usage,
    )
    try:
        _send_telegram(digest_html)
    except Exception as exc:  # noqa: BLE001 — falha estrutural
        log.error("Falha ao enviar digest ao Telegram: %s", exc)
        return 1

    received_date = yesterday_local_date()
    records = [
        {
            "gmail_uid": item.get("gmail_msgid"),
            "from_name": item.get("from_name"),
            "from_addr": item.get("from_addr"),
            "subject": item.get("subject"),
            "category": item["category"],
            "priority": item["priority"],
            "summary": item["summary"],
            "action": item["action"],
            "received_date": received_date,
        }
        for item in merged
    ]
    try:
        persist_classified(records)
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao persistir histórico em lucy_emails: %s", exc)
        return 1

    print(f"[lucy-digest] {len(merged)} emails, {junk_count} junk arquivados")
    return 0


if __name__ == "__main__":
    sys.exit(main())
