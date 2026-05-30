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

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

from google.adk.runners import InMemoryRunner
from google.genai import types

from coordinator.agent import makima

# Carrega o .env e prepara as env vars ANTES de lê-las / rodar o bot.
# - Localmente: load_dotenv() lê o arquivo .env na raiz do repo.
# - No container: o docker-compose injeta as vars via `env_file` (não há .env
#   dentro da imagem), e load_dotenv() simplesmente não acha arquivo — tudo bem.
load_dotenv()

# O ADK/google-genai autenticam o Gemini via GOOGLE_API_KEY. Seu .env usa o nome
# GEMINI_API_KEY (mesmo do batch), então fazemos a ponte sem duplicar a chave.
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
# Usamos a API do Google AI Studio (não Vertex) para o modelo gemini-2.0-flash.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

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
        is_final = event.is_final_response()
        author = getattr(event, "author", "?")
        has_text = bool(event.content and event.content.parts)
        logger.info(f"[event] author={author} is_final={is_final} has_text={has_text}")
        if has_text:
            snippet = "".join(p.text or "" for p in event.content.parts)[:120]
            logger.info(f"[event] text={snippet!r}")
        for part in (event.content.parts if event.content else []):
            if hasattr(part, "function_response") and part.function_response:
                fr = part.function_response
                logger.info(f"[tool] {fr.name} → {str(fr.response)[:300]}")
        if is_final and has_text:
            final_text = "".join(p.text or "" for p in event.content.parts)

    await update.message.reply_text(final_text or "(sem resposta)")


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Makima online.")
    app.run_polling()


if __name__ == "__main__":
    main()
