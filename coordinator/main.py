import os
import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes
from google.adk.runners import InMemoryRunner
from google.adk.sessions import InMemorySessionService
from coordinator.agent import makima

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]

session_service = InMemorySessionService()
runner = InMemoryRunner(agent=makima, session_service=session_service)

# session id por chat_id do Telegram
_sessions: dict[str, str] = {}


def get_or_create_session(chat_id: str) -> str:
    if chat_id not in _sessions:
        session = runner.session_service.create_session(
            app_name="makima",
            user_id=chat_id,
        )
        _sessions[chat_id] = session.id
    return _sessions[chat_id]


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.message.chat_id)
    text = update.message.text

    logger.info(f"[{chat_id}] {text}")

    session_id = get_or_create_session(chat_id)
    response = await runner.run_async(
        user_id=chat_id,
        session_id=session_id,
        message=text,
    )

    await update.message.reply_text(response.text)


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Makima online.")
    app.run_polling()


if __name__ == "__main__":
    main()
