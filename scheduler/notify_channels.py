"""Notificação genérica multi-canal via os webhooks --deliver-only do Hermes.

Diferente de `notify.py` (alerta de falha de job, fixo em Telegram direto pela API —
FR-011, precisa continuar de pé mesmo se o Hermes cair), este módulo é o caminho para
avisos VOLTADOS AO USUÁRIO (lembretes, digests, relatórios) que devem poder chegar em
qualquer canal que o Hermes já tenha configurado — FR-012, spec 064 User Story 5.

Cada canal tem uma rota dedicada no Hermes (`hermes webhook subscribe notify-<canal>
--prompt "{message}" --deliver <canal> --deliver-only`, ver hermes/CLAUDE.md), alcançável
só dentro da dokploy-network — mesmo isolamento do makima-mcp. `--deliver-only` pula o
LLM: a rota só repassa `message` ao canal, custo zero e determinístico.

Autenticação: HMAC genérico V2 do Hermes (`X-Webhook-Signature-V2` = HMAC-SHA256 de
"<timestamp>.<body>", com `X-Webhook-Timestamp` — janela de replay de 300s; confirmado
lendo gateway/platforms/webhook.py dentro do container em produção). O segredo é o mesmo
`WEBHOOK_SECRET` global configurado no Hermes (Environment do Dokploy da app hermes).

Variáveis de ambiente usadas:
    HERMES_WEBHOOK_BASE_URL — ex. "http://makima-hermes:8644" (rede interna dokploy-network).
    WEBHOOK_SECRET           — mesmo segredo cadastrado no Hermes (Environment do Dokploy).
    NOTIFY_DEFAULT_CHANNELS  — canais usados quando `channels` não é passado, separados por
                               vírgula (ex. "whatsapp" ou "whatsapp,telegram,discord").
                               Hoje só "whatsapp" está ativo por decisão do usuário — ligar
                               os outros é só mudar esta env var, sem deploy de código novo.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import time

import requests

log = logging.getLogger("scheduler.notify_channels")

_TIMEOUT = 15
_KNOWN_CHANNELS = ("whatsapp", "telegram", "discord")


def _webhook_url(channel: str) -> str | None:
    base = os.environ.get("HERMES_WEBHOOK_BASE_URL")
    if not base:
        return None
    return f"{base.rstrip('/')}/webhooks/notify-{channel}"


def _sign(body: bytes) -> tuple[str, str] | None:
    """Assina o corpo no esquema Generic V2 do Hermes. Retorna (timestamp, assinatura-hex)."""
    secret = os.environ.get("WEBHOOK_SECRET")
    if not secret:
        return None
    timestamp = str(int(time.time()))
    signed_content = timestamp.encode() + b"." + body
    signature = hmac.new(secret.encode(), signed_content, hashlib.sha256).hexdigest()
    return timestamp, signature


def _to_whatsapp_text(html: str) -> str:
    """Converte marcação HTML simples (padrão Telegram do resto do projeto) para o
    markdown que o WhatsApp entende (`*negrito*`, `_itálico_`, `` `código` ``), e remove
    qualquer outra tag. Suficiente para as mensagens já existentes dos jobs — não é um
    parser HTML genérico.
    """
    text = html
    for tag, wrapper in (("b", "*"), ("strong", "*"), ("i", "_"), ("em", "_"), ("code", "`")):
        text = text.replace(f"<{tag}>", wrapper).replace(f"</{tag}>", wrapper)
    text = text.replace("<pre>", "```").replace("</pre>", "```")
    text = re.sub(r"<[^>]+>", "", text)
    return text


def send_notification(message: str, channels: list[str] | None = None) -> bool:
    """Manda `message` (HTML no padrão Telegram já usado pelos jobs) para os canais
    pedidos, via as rotas de notificação do Hermes.

    Melhor esforço POR CANAL: a falha de um canal não impede os outros nem levanta
    exceção — mesmo espírito de `notify.send_telegram_alert`. Mas, diferente dele,
    devolve um bool (pelo menos um canal recebeu com sucesso?) em vez de engolir tudo:
    se NENHUM canal saiu, quem chama deve poder tratar isso como falha do job (mesma
    observabilidade que o antigo `_send_telegram()` dava via exceção) — uma notificação
    de usuário que nunca chega em canal nenhum não deve sumir em silêncio.

    Args:
        message: Texto em HTML simples (`<b>`, `<i>`, `<code>`) — mesmo formato que os
            scripts de `scripts/send_*.py` já montam para o Telegram.
        channels: Canais a notificar (`"whatsapp"`, `"telegram"`, `"discord"`). Se
            omitido, usa `NOTIFY_DEFAULT_CHANNELS` (hoje só `"whatsapp"`).

    Returns:
        `True` se pelo menos um canal recebeu a notificação com sucesso.
    """
    if channels is None:
        channels = [
            c.strip()
            for c in os.environ.get("NOTIFY_DEFAULT_CHANNELS", "whatsapp").split(",")
            if c.strip()
        ]

    sent_any = False

    for channel in channels:
        if channel not in _KNOWN_CHANNELS:
            log.warning("Canal de notificação desconhecido: %r — ignorado.", channel)
            continue

        url = _webhook_url(channel)
        if not url:
            log.warning(
                "HERMES_WEBHOOK_BASE_URL não configurado — notificação NÃO enviada (%s).",
                channel,
            )
            continue

        # Telegram entende a marcação HTML original (parse_mode=HTML aplicado no lado do
        # Hermes/canal); os demais canais recebem a conversão para markdown leve.
        text = message if channel == "telegram" else _to_whatsapp_text(message)
        body = json.dumps({"message": text}).encode()

        signed = _sign(body)
        if not signed:
            log.warning("WEBHOOK_SECRET não configurado — notificação NÃO enviada (%s).", channel)
            continue
        timestamp, signature = signed

        headers = {
            "Content-Type": "application/json",
            "X-Webhook-Timestamp": timestamp,
            "X-Webhook-Signature-V2": signature,
        }

        try:
            resp = requests.post(url, data=body, headers=headers, timeout=_TIMEOUT)
            resp.raise_for_status()
            log.info("Notificação enviada via %s.", channel)
            sent_any = True
        except requests.RequestException as exc:
            log.warning("Falha ao enviar notificação via %s: %s", channel, exc)

    return sent_any
