#!/usr/bin/env python3
"""
Makima Coordinator - loop do bot Telegram

Recebe mensagens do Telegram e as encaminha para o agente Makima (ADK),
mantendo uma sessão de memória por chat_id.
"""

import json as _json
import logging
import os
from datetime import date

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.adk.errors.session_not_found_error import SessionNotFoundError
from google.genai import types

# Carrega o .env antes de qualquer outra importação que leia env vars
load_dotenv()

# O ADK lê GOOGLE_API_KEY; nosso .env usa GEMINI_API_KEY — fazemos a ponte aqui
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from coordinator.agent import create_makima  # noqa: E402 — import após load_dotenv
from agents.frieren.tools import get_book_by_id, update_book_by_id  # noqa: E402

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

# Armazena ação pendente aguardando input de texto do usuário (ex.: digitar uma nota).
# Chave: chat_id (str); Valor: dict com {action, book_id, title}
_pending_action: dict[str, dict] = {}


# Mapeamento de status para rótulo legível exibido no menu
_STATUS_LABEL = {
    "quero_ler":  "📚 Quero ler",
    "lendo":      "📖 Lendo",
    "lido":       "✅ Lido",
    "pausado":    "⏸️ Pausado",
    "abandonado": "❌ Abandonado",
}


def _build_book_menu(data: dict) -> tuple[str, InlineKeyboardMarkup]:
    """
    Constrói o texto resumo e o teclado inline para o menu de gerenciamento de livro.

    Recebe o dict com type='book_menu' retornado por get_book_menu_data e retorna
    uma tupla (texto_html, InlineKeyboardMarkup) pronta para reply_text.
    """
    # ── Monta o texto de resumo do livro ──────────────────────────────────────
    book_id    = data["book_id"]
    titulo     = data["title"]
    autor      = data.get("author") or "autor desconhecido"
    status_raw = data.get("status", "")
    status_txt = _STATUS_LABEL.get(status_raw, status_raw)
    rating     = data.get("rating")
    cur_page   = data.get("current_page") or 0
    total      = data.get("total_pages")

    # Linha de progresso: mostra porcentagem se soubermos o total de páginas
    if total and cur_page:
        percent  = round((cur_page / total) * 100, 1)
        progresso = f"Progresso: <b>{percent}%</b> (p.{cur_page}/{total})"
    elif cur_page:
        progresso = f"Página atual: <b>{cur_page}</b>"
    else:
        progresso = "Nenhum progresso registrado"

    # Linha de avaliação: exibe estrelas se já foi avaliado
    rating_txt = f"⭐ <b>{rating}/5</b>" if rating is not None else "Sem avaliação"

    texto = (
        f"📖 <b>{titulo}</b>\n"
        f"<i>{autor}</i>\n\n"
        f"{status_txt} · {rating_txt}\n"
        f"{progresso}"
    )

    # ── Monta os botões inline ────────────────────────────────────────────────
    # callback_data tem limite de 64 bytes no Telegram.
    # Formato dos prefixos: fm_<ação>:<book_id> (UUID = 36 chars)
    # Os prefixos mais longos usados: "fm_finish:" (10) + UUID(36) = 46 bytes — OK.

    # Linha 1: ações principais
    linha1 = [
        InlineKeyboardButton("⭐ Avaliar",    callback_data=f"fm_rate:{book_id}"),
        InlineKeyboardButton("🔄 Status",     callback_data=f"fm_status:{book_id}"),
        InlineKeyboardButton("📝 Nota",       callback_data=f"fm_note:{book_id}"),
    ]

    # Linha 2: ação contextual + fechar
    linha2 = []
    if status_raw != "lido":
        # Só exibe "Marcar como lido" se o livro ainda não está concluído
        linha2.append(InlineKeyboardButton("✅ Marcar como lido", callback_data=f"fm_finish:{book_id}"))
    linha2.append(InlineKeyboardButton("❌ Fechar", callback_data="fm_cancel"))

    return texto, InlineKeyboardMarkup([linha1, linha2])


async def _edit_menu_message(query, texto: str, keyboard: InlineKeyboardMarkup) -> None:
    """
    Edita a mensagem de menu — usa edit_message_caption para mensagens com foto
    e edit_message_text para mensagens de texto puro.
    O Telegram não permite converter entre os dois tipos na edição.
    """
    if query.message.photo:
        # Mensagem original era uma foto: edita apenas a legenda e o teclado
        await query.edit_message_caption(caption=texto, reply_markup=keyboard, parse_mode="HTML")
    else:
        # Mensagem original era texto: edita o texto e o teclado normalmente
        await query.edit_message_text(texto, reply_markup=keyboard, parse_mode="HTML")


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handler para todos os cliques nos botões inline do menu de livros (fm_*).
    Cada prefixo de callback_data corresponde a uma ação diferente.
    """
    query    = update.callback_query
    chat_id  = str(query.message.chat_id)
    data_str = query.data or ""

    # Responde ao Telegram imediatamente para remover o "spinner" no botão
    await query.answer()

    # ── fm_rate:<id> — exibe teclado de estrelas (1 a 5) ─────────────────────
    if data_str.startswith("fm_rate:"):
        book_id = data_str[len("fm_rate:"):]
        # Cada botão de estrela carrega o ID e a nota escolhida
        botoes = [
            InlineKeyboardButton(f"{'⭐' * i}", callback_data=f"fm_r:{book_id}:{i}")
            for i in range(1, 6)
        ]
        # Botão de voltar ao menu principal
        voltar = InlineKeyboardButton("⬅️ Voltar", callback_data=f"fm_back:{book_id}")
        await query.edit_message_reply_markup(
            reply_markup=InlineKeyboardMarkup([botoes, [voltar]])
        )
        return

    # ── fm_r:<id>:<nota> — salva avaliação e volta ao menu ───────────────────
    if data_str.startswith("fm_r:"):
        # Formato: fm_r:<uuid>:<nota>
        partes   = data_str.split(":")
        book_id  = partes[1]
        nota     = float(partes[2])
        update_book_by_id(book_id, rating=nota)
        # Recarrega os dados atualizados e reconstrói o menu
        book = get_book_by_id(book_id)
        if book:
            menu_data = _book_to_menu_data(book)
            texto, keyboard = _build_book_menu(menu_data)
            await _edit_menu_message(query, texto, keyboard)
        return

    # ── fm_status:<id> — exibe teclado de escolha de status ──────────────────
    if data_str.startswith("fm_status:"):
        book_id = data_str[len("fm_status:"):]
        # Um botão por status válido
        botoes = [
            InlineKeyboardButton(label, callback_data=f"fm_s:{book_id}:{slug}")
            for slug, label in _STATUS_LABEL.items()
        ]
        # Distribui em linhas de 2 para não ficar apertado
        linhas = [botoes[i:i+2] for i in range(0, len(botoes), 2)]
        linhas.append([InlineKeyboardButton("⬅️ Voltar", callback_data=f"fm_back:{book_id}")])
        await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(linhas))
        return

    # ── fm_s:<id>:<status> — salva status e volta ao menu ────────────────────
    if data_str.startswith("fm_s:"):
        # Formato: fm_s:<uuid>:<status>  (status pode ter underscores, sem dois-pontos)
        _, book_id, novo_status = data_str.split(":", 2)
        # Se marcando como lido, registra a data de conclusão
        kwargs: dict = {"status": novo_status}
        if novo_status == "lido":
            kwargs["date_finished"] = str(date.today())
        update_book_by_id(book_id, **kwargs)
        book = get_book_by_id(book_id)
        if book:
            menu_data = _book_to_menu_data(book)
            texto, keyboard = _build_book_menu(menu_data)
            await _edit_menu_message(query, texto, keyboard)
        return

    # ── fm_note:<id> — remove teclado e pede nota em texto livre ─────────────
    if data_str.startswith("fm_note:"):
        book_id = data_str[len("fm_note:"):]
        # Guarda estado: próxima mensagem de texto deste chat_id será a nota
        _pending_action[chat_id] = {"action": "note", "book_id": book_id}
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("📝 Digite a nota que deseja salvar para este livro:")
        return

    # ── fm_finish:<id> — marca livro como lido com data de hoje ──────────────
    if data_str.startswith("fm_finish:"):
        book_id = data_str[len("fm_finish:"):]
        update_book_by_id(book_id, status="lido", date_finished=str(date.today()))
        book = get_book_by_id(book_id)
        if book:
            menu_data = _book_to_menu_data(book)
            texto, keyboard = _build_book_menu(menu_data)
            await _edit_menu_message(query, texto, keyboard)
        return

    # ── fm_back:<id> — recarrega e exibe o menu principal do livro ───────────
    if data_str.startswith("fm_back:"):
        book_id = data_str[len("fm_back:"):]
        book = get_book_by_id(book_id)
        if book:
            menu_data = _book_to_menu_data(book)
            texto, keyboard = _build_book_menu(menu_data)
            await _edit_menu_message(query, texto, keyboard)
        return

    # ── fm_cancel — remove o teclado e encerra o menu ────────────────────────
    if data_str == "fm_cancel":
        await query.edit_message_reply_markup(reply_markup=None)
        return


def _book_to_menu_data(book: dict) -> dict:
    """
    Converte um dict de livro retornado pelo BigQuery no formato
    esperado por _build_book_menu, incluindo a página atual via logs.
    """
    from agents.frieren.tools import _run_select, _table
    from google.cloud import bigquery as _bq

    # Busca a última página registrada (pode não existir se nunca houve log)
    sql = f"""
        SELECT page_end
        FROM `{_table('reading_logs')}`
        WHERE book_id = @book_id
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    rows = _run_select(sql, [_bq.ScalarQueryParameter("book_id", "STRING", book["id"])])
    current_page = int(rows[0]["page_end"]) if rows else 0

    return {
        "type":          "book_menu",
        "book_id":       book["id"],
        "title":         book["title"],
        "author":        book.get("author") or "",
        "status":        book["status"],
        "rating":        book.get("rating"),
        "current_page":  current_page,
        "total_pages":   book.get("total_pages"),
        "date_started":  str(book["date_started"]) if book.get("date_started") else None,
        "date_finished": str(book["date_finished"]) if book.get("date_finished") else None,
        "cover_url":     book.get("cover_url"),
    }


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

    # ── Intercepta ações pendentes (ex.: nota de livro aguardando input) ──────
    # Antes de passar para o agente, verifica se há uma ação pendente para este chat.
    # Isso ocorre quando o usuário clicou em "📝 Nota" e agora está digitando a nota.
    if chat_id in _pending_action:
        pending = _pending_action.pop(chat_id)
        if pending["action"] == "note":
            # Salva a nota digitada diretamente no BigQuery, sem passar pelo agente
            update_book_by_id(pending["book_id"], notes=text)
            await update.message.reply_text("📝 Nota salva.")
            return

    await ensure_session(chat_id)

    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    # Coleta texto de TODOS os eventos por autor.
    # Com sub_agents, o texto do sub-agente pode vir em eventos não-finais —
    # o evento final (is_final=True) é apenas o sinal de "done" e pode ter content=None.
    # Por isso mantemos um fallback por autor para não perder a resposta.
    final_parts: list[str] = []
    all_agent_texts: dict[str, list[str]] = {}  # autor → lista de textos coletados
    last_final_author: str | None = None

    # Retry loop: se a sessão foi deletada externamente (ex.: limpeza manual do banco),
    # o ADK lança SessionNotFoundError. Recriamos a sessão e tentamos uma segunda vez.
    for attempt in range(2):
        try:
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

            break  # loop do runner concluído sem erro — sai do retry

        except SessionNotFoundError:
            if attempt == 0:
                # Sessão foi deletada externamente — limpa o cache e recria para retry
                logger.warning(f"[session] {chat_id} não encontrada, recriando e tentando novamente...")
                _sessions.discard(chat_id)
                await ensure_session(chat_id)
            else:
                # Segunda falha consecutiva — desiste e avisa o usuário
                logger.error(f"[session] {chat_id} falhou após recriação")
                await update.message.reply_text("❌ Erro ao iniciar sessão. Tente novamente.", parse_mode="HTML")
                return

    # Fallback: se o evento final veio vazio (padrão de sub_agents), usa o texto
    # coletado nos eventos não-finais do mesmo autor
    if not final_parts and last_final_author and last_final_author in all_agent_texts:
        logger.info(f"[fallback] usando texto de eventos não-finais de {last_final_author!r}")
        combined = "".join(all_agent_texts[last_final_author])
        if combined.strip():
            final_parts.append(combined)

    if final_parts:
        # ── Detecta JSON de menu interativo antes de enviar como texto ────────
        # O frieren_agent retorna um JSON com type='book_menu' quando o usuário
        # quer gerenciar um livro. Nesse caso, montamos os botões inline em vez
        # de exibir o JSON cru.
        response_text = "".join(final_parts)
        # O agente pode prefixar o JSON com "Frieren: " — buscamos o primeiro '{' para isolar o JSON
        json_start = response_text.find("{")
        if json_start != -1:
            try:
                menu_data = _json.loads(response_text[json_start:])
                if isinstance(menu_data, dict) and menu_data.get("type") == "book_menu":
                    # JSON de menu identificado — monta e envia com botões inline
                    msg_text, keyboard = _build_book_menu(menu_data)
                    cover_url = menu_data.get("cover_url")
                    if cover_url:
                        # Envia a capa do livro como foto com o menu na legenda
                        await update.message.reply_photo(
                            photo=cover_url,
                            caption=msg_text,
                            reply_markup=keyboard,
                            parse_mode="HTML",
                        )
                    else:
                        # Sem capa — envia como mensagem de texto normal
                        await update.message.reply_text(msg_text, reply_markup=keyboard, parse_mode="HTML")
                    return
            except (ValueError, TypeError):
                # Não é JSON válido — segue para o envio de texto normal
                pass

        # Envio normal: divide em partes caso o agente tenha gerado múltiplos blocos
        for part in final_parts:
            await update.message.reply_text(part, parse_mode="HTML")
    else:
        await update.message.reply_text("(sem resposta)", parse_mode="HTML")


def main() -> None:
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    # CallbackQueryHandler ANTES do MessageHandler para que cliques em botões
    # não sejam engolidos pelo handler de texto
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Makima online.")
    app.run_polling()


if __name__ == "__main__":
    main()
