#!/usr/bin/env python3
"""
Makima Coordinator - loop do bot Telegram

Recebe mensagens do Telegram e as encaminha para o agente Makima (ADK),
mantendo uma sessão de memória por chat_id.

API alvo: google-adk 1.x
- InMemoryRunner cria internamente os serviços (sessão/artefatos/memória) em memória;
  acessamos o serviço de sessão por runner.session_service.
- session_service.create_session é assíncrono (precisa de await).
- runner.run_async recebe new_message: types.Content e devolve um async generator
  de eventos; o texto final está no evento marcado por is_final_response().
"""

import os
import logging

from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

from google.adk.runners import InMemoryRunner
from google.genai import types

from coordinator.agent import makima

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]

# Nome lógico da app ADK. Precisa ser o mesmo no runner e ao criar sessões.
APP_NAME = "makima"

# O InMemoryRunner monta os serviços em memória; ele NÃO recebe session_service.
runner = InMemoryRunner(agent=makima, app_name=APP_NAME)

# chat_ids que já têm sessão criada (evita recriar a cada mensagem).
_sessions: set[str] = set()


async def ensure_session(chat_id: str) -> None:
    """Garante que existe uma sessão ADK para este chat_id (cria na primeira vez)."""
    if chat_id not in _sessions:
        # user_id e session_id usam o próprio chat_id: uma sessão por conversa.
        await runner.session_service.create_session(
            app_name=APP_NAME,
            user_id=chat_id,
            session_id=chat_id,
        )
        _sessions.add(chat_id)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler chamado a cada mensagem de texto recebida no Telegram."""
    chat_id = str(update.message.chat_id)
    text = update.message.text

    logger.info(f"[{chat_id}] {text}")

    await ensure_session(chat_id)

    # A mensagem do usuário precisa ser empacotada como types.Content.
    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    # run_async devolve um stream de eventos; guardamos o texto da resposta final.
    final_text = ""
    async for event in runner.run_async(
        user_id=chat_id,
        session_id=chat_id,
        new_message=new_message,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final_text = "".join(p.text or "" for p in event.content.parts)

    await update.message.reply_text(final_text or "(sem resposta)")


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Makima online.")
    app.run_polling()


if __name__ == "__main__":
    main()
