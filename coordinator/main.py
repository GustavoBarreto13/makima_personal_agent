#!/usr/bin/env python3
"""
Makima Coordinator - loop do bot Telegram

Recebe mensagens do Telegram e as encaminha para o agente Makima (ADK),
mantendo uma sessão de memória por chat_id.
"""

import logging
import os

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes

from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
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

# Conecta ao PostgreSQL externo (gerenciado pelo Dokploy) para persistir sessões entre reinícios
# O Dokploy gera a URL com prefixo "postgresql://", mas o ADK exige "postgresql+asyncpg://"
# para usar o driver async correto. Corrigimos automaticamente aqui.
DATABASE_URL = os.environ["DATABASE_URL"].replace(
    "postgresql://", "postgresql+asyncpg://", 1
)
# DatabaseSessionService cria as tabelas automaticamente na primeira execução
session_service = DatabaseSessionService(db_url=DATABASE_URL)

# Makima e runner são criados de forma síncrona — ADK gerencia MCP internamente
makima = create_makima()
runner = Runner(agent=makima, app_name=APP_NAME, session_service=session_service)

_sessions: set[str] = set()


async def ensure_session(chat_id: str) -> None:
    """Garante que existe uma sessão ADK para este chat_id (cria na primeira vez).

    O set _sessions evita chamadas repetidas ao banco durante o mesmo processo.
    Após reinício do container o set está vazio, então verificamos no banco antes
    de tentar criar — evita erro caso a sessão já exista no PostgreSQL.
    """
    if chat_id not in _sessions:
        # Verifica se a sessão já existe no banco (caso de restart do container)
        existing = await runner.session_service.get_session(
            app_name=APP_NAME,
            user_id=chat_id,
            session_id=chat_id,
        )
        if existing is None:
            # Sessão nova: cria no banco pela primeira vez
            await runner.session_service.create_session(
                app_name=APP_NAME,
                user_id=chat_id,
                session_id=chat_id,
            )
        # Marca como conhecida neste processo para evitar consultas futuras ao banco
        _sessions.add(chat_id)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler chamado a cada mensagem de texto recebida no Telegram."""
    chat_id = str(update.message.chat_id)
    text = update.message.text

    logger.info(f"[{chat_id}] {text}")

    await ensure_session(chat_id)

    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    # Coleta texto de TODOS os eventos por autor.
    # Com sub_agents, o texto do sub-agente pode vir em eventos não-finais —
    # o evento final (is_final=True) é apenas o sinal de "done" e pode ter content=None.
    # Por isso mantemos um fallback por autor para não perder a resposta.
    final_parts: list[str] = []
    all_agent_texts: dict[str, list[str]] = {}  # autor → lista de textos coletados
    last_final_author: str | None = None

    async for event in runner.run_async(
        user_id=chat_id,
        session_id=chat_id,
        new_message=new_message,
    ):
        is_final = event.is_final_response()
        author = getattr(event, "author", "?")
        parts = event.content.parts if event.content and event.content.parts else []

        # Log detalhado de cada parte para facilitar diagnóstico
        if not parts:
            logger.info(f"[event] author={author} is_final={is_final} no_content")
        for part in parts:
            if getattr(part, "text", None):
                logger.info(f"[event] author={author} is_final={is_final} text={part.text[:120]!r}")
            elif getattr(part, "function_call", None):
                fc = part.function_call
                logger.info(f"[event] author={author} is_final={is_final} func_call={fc.name}")
            elif getattr(part, "function_response", None):
                fr = part.function_response
                logger.info(f"[tool] {fr.name} → {str(fr.response)[:300]}")

        # Acumula texto de qualquer evento (não só final) — fallback para sub_agents
        for part in parts:
            if getattr(part, "text", None) and part.text.strip():
                all_agent_texts.setdefault(author, []).append(part.text)

        if is_final:
            last_final_author = author
            # Tenta extrair texto direto do evento final
            text_resp = "".join(p.text or "" for p in parts if getattr(p, "text", None))
            if text_resp.strip():
                final_parts.append(text_resp)

    # Fallback: se o evento final veio vazio (padrão de sub_agents), usa o texto
    # coletado nos eventos não-finais do mesmo autor
    if not final_parts and last_final_author and last_final_author in all_agent_texts:
        logger.info(f"[fallback] usando texto de eventos não-finais de {last_final_author!r}")
        combined = "".join(all_agent_texts[last_final_author])
        if combined.strip():
            final_parts.append(combined)

    if final_parts:
        for part in final_parts:
            await update.message.reply_text(part, parse_mode="HTML")
    else:
        await update.message.reply_text("(sem resposta)", parse_mode="HTML")


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Makima online.")
    app.run_polling()


if __name__ == "__main__":
    main()
