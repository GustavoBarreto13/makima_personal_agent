#!/usr/bin/env python3
"""
Makima Coordinator - loop do bot Telegram

Recebe mensagens do Telegram e as encaminha para o agente Makima (ADK),
mantendo uma sessão de memória por chat_id.

A inicialização é async porque a Kaguya precisa iniciar o servidor MCP do TickTick
via stdio antes de o bot começar a aceitar mensagens.
"""

import asyncio
import logging
import os
from contextlib import AsyncExitStack

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

from google.adk.runners import InMemoryRunner
from google.genai import types

# Carrega o .env antes de qualquer outra importação que leia env vars
load_dotenv()

# O ADK lê GOOGLE_API_KEY; nosso .env usa GEMINI_API_KEY — fazemos a ponte aqui
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from coordinator.agent import create_makima  # noqa: E402 — import após load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
APP_NAME = "makima"

# Essas variáveis são inicializadas no setup async antes do bot começar
runner: InMemoryRunner = None
_sessions: set[str] = set()


async def ensure_session(chat_id: str) -> None:
    """Garante que existe uma sessão ADK para este chat_id (cria na primeira vez)."""
    if chat_id not in _sessions:
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

    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    # Coleta todos os eventos finais — múltiplos agentes podem gerar respostas separadas
    final_parts: list[str] = []
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
            text_resp = "".join(p.text or "" for p in event.content.parts)
            if text_resp.strip():
                final_parts.append(text_resp)

    if final_parts:
        for part in final_parts:
            await update.message.reply_text(part, parse_mode="HTML")
    else:
        await update.message.reply_text("(sem resposta)", parse_mode="HTML")


async def main_async() -> None:
    """Setup async: inicializa agentes MCP, cria o runner e sobe o bot Telegram."""
    global runner

    # O exit_stack gerencia o ciclo de vida do servidor MCP da Kaguya.
    # Ele é fechado automaticamente quando o bloco 'async with' termina (shutdown do bot).
    async with AsyncExitStack() as exit_stack:
        # Inicializa Makima (e internamente a Kaguya com o servidor MCP)
        makima = await create_makima(exit_stack)
        runner = InMemoryRunner(agent=makima, app_name=APP_NAME)

        app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
        app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

        logger.info("Makima online.")

        # run_polling é bloqueante; quando o bot para (Ctrl+C ou sinal),
        # o bloco 'async with' fecha o exit_stack e encerra o servidor MCP filho
        await app.run_polling()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
