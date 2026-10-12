"""Revisão semanal do diário (Violet) — job de domingo à noite, via Hermes (spec 076).

Gera a revisão da semana que termina hoje (domingo) com a Kurisu/Gemini, grava em
``journal_weekly_reviews`` e manda a versão condensada (veredito + compromissos + link) pelos
canais do Hermes (``scheduler/notify_channels.py``). Idempotente por semana: se a revisão já
foi enviada, não envia de novo (use ``--force`` para regerar e reenviar).

Falha estrutural (Gemini, banco, nenhum canal recebeu) sai com código 1 — o wrapper do
scheduler (``scheduler/jobs.py::run_violet_weekly_review``) transforma em alerta.

Usage:
    python -m scripts.send_violet_weekly_review              # a semana a revisar hoje
    python -m scripts.send_violet_weekly_review --week 2026-10-05 --dry-run
    python -m scripts.send_violet_weekly_review --force
"""

import argparse
import logging
import os
import sys

log = logging.getLogger("violet-weekly-review")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")


def _public_url() -> str | None:
    """URL pública do webapp: ``WEBAPP_PUBLIC_URL`` ou derivada do callback do OAuth."""
    base = os.environ.get("WEBAPP_PUBLIC_URL", "").strip()
    if not base:
        cb = os.environ.get("OAUTH_REDIRECT_URL", "").strip()
        base = cb.split("/auth/")[0] if "/auth/" in cb else ""
    return base.rstrip("/") or None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--week", help="Qualquer data (YYYY-MM-DD) da semana a revisar")
    parser.add_argument("--dry-run", action="store_true", help="Gera e imprime, não envia")
    parser.add_argument("--force", action="store_true", help="Regera e reenvia mesmo se já enviada")
    args = parser.parse_args(argv)

    from agents.journal.tools import _today_sp
    from agents.kurisu import weekly_review as W

    week = args.week or W.last_closed_week(_today_sp())[0].isoformat()
    existing = W.get_revisao_semanal(week)
    if existing and existing.get("sent_at") and not args.force:
        log.info("Revisão da semana %s já enviada em %s — nada a fazer.", existing["week_start"], existing["sent_at"])
        return 0

    if existing and not args.force:
        review = existing
    else:
        result = W.gerar_revisao_semanal(week)
        if result.get("status") != "ok":
            log.error("Falha ao gerar a revisão: %s", result.get("message"))
            return 1
        review = result["review"]

    base = _public_url()
    link = f"{base}/journal#refletir/semana/{review['week_start']}" if base else None
    message = W.resumo_chat(review, link)

    if args.dry_run:
        print(message)
        print("\n" + "─" * 60 + "\n")
        print(review["essay_md"])
        return 0

    from scheduler.notify_channels import send_notification
    if not send_notification(message):
        log.error("Falha ao enviar a revisão: nenhum canal recebeu")
        return 1
    W.marcar_enviada(review["week_start"])
    log.info("Revisão da semana %s enviada.", review["week_start"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
