"""Digest matinal da Kaguya (tarefas + agenda) — job diário agendado, via WhatsApp.

Junta tarefas vencidas/hoje, Próximas Ações e Rápidas do GTD, agenda do dia, hábitos
pendentes, capacidade do dia, entradas recentes do diário e contexto do RAG da Kurisu;
gera uma sugestão de plano via Gemini e envia pro WhatsApp (via Hermes — mesmo caminho
do digest da Lucy, `scheduler/notify_channels.py`). A resposta do usuário é interpretada
pelo próprio Hermes (que já tem tool-calling contra a Kaguya via `makima-mcp`), chamando
`get_pending_kaguya_digest`/`apply_kaguya_digest_selection` — este script não espera
resposta nenhuma, só envia e persiste o histórico.

Falha estrutural (montagem do contexto / Gemini / envio / DB) aborta com
`sys.exit(1)` — o wrapper do scheduler (`scheduler/jobs.py::run_kaguya_digest`)
converte isso em `RuntimeError`.

Usage:
    python -m scripts.send_kaguya_digest
"""

import logging
import sys

from agents.kaguya.digest import (
    SuggestionError,
    build_digest_context,
    build_whatsapp_digest,
    generate_suggestion,
    persist_digest,
)
from scheduler.notify_channels import send_notification

log = logging.getLogger("kaguya-digest")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")


def main() -> int:
    """Executa o digest diário. Returns 0 em sucesso, 1 em falha estrutural."""
    try:
        context = build_digest_context()
    except Exception as exc:  # noqa: BLE001 — falha estrutural (banco/Calendar/diário/RAG)
        log.error("Falha ao montar o contexto do digest: %s", exc)
        return 1

    try:
        suggestion = generate_suggestion(context)
    except SuggestionError as exc:
        log.error("Falha estrutural ao gerar a sugestão do dia: %s", exc)
        return 1

    digest_text = build_whatsapp_digest(context, suggestion)

    if not send_notification(digest_text):
        log.error("Falha ao enviar o digest: nenhum canal recebeu")
        return 1

    try:
        persist_digest(context["today"], suggestion["items"])
    except Exception as exc:  # noqa: BLE001 — falha estrutural (DB)
        log.error("Falha ao persistir o digest em kaguya_digests: %s", exc)
        return 1

    print(f"[kaguya-digest] {len(suggestion['items'])} itens sugeridos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
