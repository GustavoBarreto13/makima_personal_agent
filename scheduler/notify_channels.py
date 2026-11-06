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
    FIREBASE_CREDENTIALS_JSON — JSON da conta de serviço do Firebase (conteúdo do arquivo, não o
                               caminho). Necessário só para o canal "push" (app Android). Sem ela,
                               o canal "push" é pulado com um aviso — nada quebra.

O canal "push" (app Android) NÃO passa pelo Hermes: fala direto com o Firebase Cloud Messaging
(FCM) e entrega nos aparelhos cadastrados em `push_devices`.
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
_KNOWN_CHANNELS = ("whatsapp", "telegram", "discord", "push")

# O FCM aceita no máximo ~4 KB por mensagem; cortamos o texto para sobrar folga.
_PUSH_MAX_CHARS = 1000

# Canais Android cujo conteúdo é escondido na tela de bloqueio (dados sensíveis).
_PRIVATE_CHANNELS = frozenset({"nami", "violet", "lucy"})


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


def _to_plain_text(html: str) -> str:
    """Remove as tags HTML simples do texto (push mostra texto puro, sem formatação).

    Example:
        >>> _to_plain_text("<b>Oi</b> <i>mundo</i>")
        'Oi mundo'
    """
    return re.sub(r"<[^>]+>", "", html).strip()


def _fcm_multicast(
    tokens: list[str], title: str, body: str, data: dict[str, str], channel_id: str
) -> tuple[int, list[str]]:
    """Envia a mesma notificação para vários aparelhos via Firebase Cloud Messaging.

    Args:
        tokens: Tokens FCM dos aparelhos (até 500 por chamada).
        title: Título da notificação.
        body: Texto da notificação.
        data: Dados extras (ex.: `link` do deep link). Valores precisam ser texto.
        channel_id: Canal de notificação do Android (um por agente: "kaguya", "nami"...).

    Returns:
        Tupla `(enviadas, tokens_mortos)`; "mortos" são tokens que o FCM disse não existirem mais.

    Raises:
        RuntimeError: Se `FIREBASE_CREDENTIALS_JSON` não estiver configurada.
    """
    raw = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    if not raw:
        raise RuntimeError("FIREBASE_CREDENTIALS_JSON não configurada")

    # Import tardio: quem nunca usa push não precisa ter o firebase-admin carregado.
    import firebase_admin
    from firebase_admin import credentials, messaging

    # initialize_app só pode rodar uma vez por processo; reaproveitamos o app se já existir.
    try:
        app = firebase_admin.get_app()
    except ValueError:
        app = firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))

    msg = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=data,
        android=messaging.AndroidConfig(
            priority="high",  # chega mesmo com o celular em modo de economia (Doze)
            # "private": na tela de bloqueio aparece só "conteúdo oculto" — Nami (valores), Violet (diário)
            # e Lucy (e-mails) não devem ficar legíveis para quem pegar o celular. Vale mesmo que o canal
            # ainda não exista no aparelho (dupla proteção com o canal criado pelo app).
            notification=messaging.AndroidNotification(
                channel_id=channel_id,
                visibility="private" if channel_id in _PRIVATE_CHANNELS else "public",
            ),
        ),
    )
    batch = messaging.send_each_for_multicast(msg, app=app)

    mortos: list[str] = []
    for token, resp in zip(tokens, batch.responses):
        # UnregisteredError = app desinstalado / token expirado; nunca mais vai funcionar.
        # SenderIdMismatchError = token de outro projeto Firebase; idem.
        if isinstance(resp.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
            mortos.append(token)
    return batch.success_count, mortos


def _send_push(message: str, title: str, link: str | None, agent: str | None) -> bool:
    """Entrega o aviso nos aparelhos Android cadastrados e limpa os tokens que morreram.

    Returns:
        `True` se pelo menos um aparelho recebeu.
    """
    if not os.environ.get("FIREBASE_CREDENTIALS_JSON"):
        log.warning("FIREBASE_CREDENTIALS_JSON não configurada — notificação NÃO enviada (push).")
        return False

    # Import tardio: o módulo depende do banco; só carrega quando o push realmente roda.
    from webapp.backend.push_store import list_push_tokens, remove_tokens

    try:
        aparelhos = list_push_tokens()
    except Exception as exc:  # banco fora do ar não pode derrubar os outros canais
        log.warning("Falha ao ler os aparelhos de push: %s", exc)
        return False
    if not aparelhos:
        log.info("Push: nenhum aparelho cadastrado.")
        return False

    data = {"link": link} if link else {}
    try:
        enviadas, mortos = _fcm_multicast(
            [a["fcm_token"] for a in aparelhos],
            title,
            _to_plain_text(message)[:_PUSH_MAX_CHARS],
            data,
            agent or "makima",
        )
    except Exception as exc:
        log.warning("Falha ao enviar notificação via push: %s", exc)
        return False

    if mortos:
        try:
            remove_tokens(mortos)
        except Exception as exc:
            log.warning("Falha ao limpar tokens de push mortos: %s", exc)
    log.info("Notificação enviada via push (%d aparelho(s)).", enviadas)
    return enviadas > 0


def send_notification(
    message: str,
    channels: list[str] | None = None,
    *,
    title: str = "Makima",
    link: str | None = None,
    agent: str | None = None,
) -> bool:
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
        channels: Canais a notificar (`"whatsapp"`, `"telegram"`, `"discord"`, `"push"`). Se
            omitido, usa `NOTIFY_DEFAULT_CHANNELS` (hoje só `"whatsapp"`).
        title: Título da notificação push (os outros canais ignoram).
        link: Deep link aberto ao tocar na notificação push (ex.: `"makima://kaguya/hoje"`).
        agent: Agente de origem; vira o canal de notificação do Android ("kaguya", "nami"...)
            para o usuário silenciar um agente sem silenciar os outros. Só vale no push.

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

        # Push (app Android) vai direto ao FCM — não usa as rotas do Hermes.
        if channel == "push":
            if _send_push(message, title, link, agent):
                sent_any = True
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
