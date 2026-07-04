"""Envio de alertas de falha no Telegram.

Quando um job agendado falha, mandamos uma mensagem no Telegram para o usuário
tomar conhecimento na hora — resolvendo o problema da "falha silenciosa" do
padrão antigo. Falamos direto com a API do Telegram (um simples POST HTTP), sem
importar o coordinator inteiro, para manter o scheduler leve e independente.

Variáveis de ambiente usadas:
    TELEGRAM_BOT_TOKEN     — token do bot (o mesmo do coordinator; já existe).
    TELEGRAM_ALERT_CHAT_ID — id do chat que deve receber os alertas (NOVA var).
"""

import logging
import os

import requests  # cliente HTTP — já é dependência do projeto

# Logger deste módulo — mensagens vão para o log padrão do scheduler.
log = logging.getLogger("scheduler.notify")

# Tempo máximo (segundos) esperando a API do Telegram responder. Curto de
# propósito: o alerta é "melhor esforço" e não deve travar o scheduler.
_TIMEOUT = 10


def send_telegram_alert(job_name: str, error_text: str) -> None:
    """Envia um alerta de falha de job para o Telegram (melhor esforço).

    Nunca levanta exceção: se o envio falhar (rede fora, token errado, etc.),
    apenas registra um warning no log. O objetivo é avisar, não derrubar o
    scheduler por causa de um alerta que não saiu.

    Args:
        job_name: Nome do job que falhou (ex.: "backup_postgres").
        error_text: Texto do erro (traceback) para incluir na mensagem.
    """
    # Lê as credenciais do ambiente. Se faltar alguma, não dá para alertar.
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_ALERT_CHAT_ID")
    if not token or not chat_id:
        log.warning(
            "Alerta de falha NÃO enviado: TELEGRAM_BOT_TOKEN ou "
            "TELEGRAM_ALERT_CHAT_ID não configurados."
        )
        return

    # Monta a mensagem. Cortamos o erro em 3000 caracteres porque o Telegram
    # limita a mensagem em ~4096 e o resto é o cabeçalho.
    trecho_erro = error_text.strip()[:3000]
    mensagem = (
        f"🚨 *Job agendado falhou*\n\n"
        f"*Job:* `{job_name}`\n\n"
        f"```\n{trecho_erro}\n```"
    )

    # Endpoint oficial da Bot API para enviar mensagens.
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    try:
        # parse_mode=Markdown permite o negrito e o bloco de código na mensagem.
        resposta = requests.post(
            url,
            json={
                "chat_id": chat_id,
                "text": mensagem,
                "parse_mode": "Markdown",
            },
            timeout=_TIMEOUT,
        )
        resposta.raise_for_status()
        log.info(f"Alerta de falha do job '{job_name}' enviado no Telegram.")
    except requests.RequestException as exc:
        # Falha ao alertar não pode derrubar o scheduler — só registra e segue.
        log.warning(f"Falha ao enviar alerta no Telegram: {exc}")
