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
    CommandHandler,
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
from agents.frieren.tools import get_book_by_id, update_book_by_id, delete_book  # noqa: E402
from agents.nami.tools_accounts import create_account, list_accounts  # noqa: E402
from agents.nami.tools_credit_cards import register_credit_card  # noqa: E402

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

# Domínios válidos — usados para classificação, validação no /limpar e rótulos no /tokens
_DOMAINS = ("financas", "livros", "tarefas", "knowledge", "filmes", "animes", "series", "geral")

# Acumula tokens consumidos por session_id neste processo (reseta ao reiniciar o container).
# Chave: session_id completo (ex.: "987654321_financas"); Valor: total de tokens acumulados
_session_tokens: dict[str, int] = {}

# Threshold de aviso: quando uma sessão ultrapassa esse número de tokens, o usuário é avisado
TOKEN_WARN_THRESHOLD = 80_000


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

    # Linha 3: ação destrutiva separada para evitar clique acidental
    linha3 = [InlineKeyboardButton("🗑️ Apagar livro", callback_data=f"fm_delete:{book_id}")]

    return texto, InlineKeyboardMarkup([linha1, linha2, linha3])


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

    # ── fm_delete:<id> — pede confirmação antes de apagar o livro ───────────
    if data_str.startswith("fm_delete:"):
        book_id = data_str[len("fm_delete:"):]
        book = get_book_by_id(book_id)
        titulo = book["title"] if book else book_id
        teclado = InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Confirmar", callback_data=f"fm_delete_confirm:{book_id}"),
            InlineKeyboardButton("⬅️ Cancelar", callback_data=f"fm_back:{book_id}"),
        ]])
        await query.edit_message_text(
            f"⚠️ Tem certeza que quer apagar <b>{titulo}</b>?\n"
            "Essa ação remove o livro e todo o histórico de leitura. Não pode ser desfeita.",
            parse_mode="HTML",
            reply_markup=teclado,
        )
        return

    # ── fm_delete_confirm:<id> — executa o soft delete e remove o teclado ───
    if data_str.startswith("fm_delete_confirm:"):
        book_id = data_str[len("fm_delete_confirm:"):]
        resultado = delete_book(book_id)
        await query.edit_message_text(resultado, parse_mode="HTML", reply_markup=None)
        return

    # ── fm_cancel — remove o teclado e encerra o menu ────────────────────────
    if data_str == "fm_cancel":
        await query.edit_message_reply_markup(reply_markup=None)
        return

    # ── Wizard /criar-conta (prefixo nc_) ─────────────────────────────────────

    if data_str.startswith("nc_tipo:"):
        # Usuário escolheu o tipo da conta — avança para o passo de instituição
        tipo = data_str.split(":", 1)[1]
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_conta":
            await query.answer("Wizard expirou. Use /criar_conta novamente.")
            return
        pending["data"]["type"] = tipo
        pending["step"] = "instituicao"
        teclado = InlineKeyboardMarkup([[InlineKeyboardButton("⏭ Pular", callback_data="nc_skip_inst")]])
        await query.edit_message_text(
            f"🏦 <b>Nova Conta</b> — tipo: <b>{tipo}</b>\n\nQual a instituição?\n<i>Exemplo: Nubank, Itaú</i>",
            parse_mode="HTML", reply_markup=teclado,
        )
        return

    if data_str == "nc_skip_inst":
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_conta":
            return
        pending["data"]["institution"] = ""
        pending["step"] = "data_inicio"
        teclado = InlineKeyboardMarkup([[InlineKeyboardButton("📅 Hoje", callback_data="nc_hoje")]])
        await query.edit_message_text(
            "🏦 <b>Nova Conta</b>\n\nData de início do rastreamento?\n<i>Formato: YYYY-MM-DD</i>",
            parse_mode="HTML", reply_markup=teclado,
        )
        return

    if data_str == "nc_hoje":
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_conta":
            return
        pending["data"]["data_inicio"] = date.today().isoformat()
        pending["step"] = "balance"
        teclado = InlineKeyboardMarkup([[InlineKeyboardButton("⏭ R$0,00", callback_data="nc_skip_bal")]])
        await query.edit_message_text(
            "🏦 <b>Nova Conta</b>\n\nSaldo inicial em reais?\n<i>Exemplo: 1500 ou 1500.50</i>",
            parse_mode="HTML", reply_markup=teclado,
        )
        return

    if data_str == "nc_skip_bal":
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_conta":
            return
        await _finalizar_criar_conta(chat_id, pending, query=query)
        return

    if data_str == "nc_cancel":
        _pending_action.pop(chat_id, None)
        await query.edit_message_text("❌ Cancelado.", parse_mode="HTML")
        return

    # ── Wizard /criar-cartao (prefixo ncc_) ───────────────────────────────────

    if data_str.startswith("ncc_acc:"):
        # Formato: ncc_acc:<account_id> — usuário escolheu a conta para vincular ao cartão
        acc_id = data_str[len("ncc_acc:"):]
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_cartao":
            await query.answer("Wizard expirou. Use /criar_cartao novamente.")
            return
        # Recupera o nome da conta a partir do dict guardado no início do wizard
        acc_name = pending.get("contas", {}).get(acc_id, acc_id)
        pending["data"]["account_id"] = acc_id
        pending["data"]["account_name"] = acc_name
        pending["step"] = "nome"
        await query.edit_message_text(
            f"💳 <b>Conta:</b> {acc_name}\n\nQual o nome do cartão?\n<i>Exemplo: Nubank, Itaú Platinum</i>",
            parse_mode="HTML",
        )
        return

    if data_str.startswith("ncc_day:"):
        # Formato: ncc_day:<n> — usado tanto para dia de fechamento quanto de vencimento
        day = int(data_str.split(":")[1])
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_cartao":
            return
        if pending["step"] == "fechamento":
            pending["data"]["closing_day"] = day
            pending["step"] = "vencimento"
            await query.edit_message_text(
                f"💳 Fechamento: dia <b>{day}</b>\n\nDia de <b>vencimento</b>? (1–31)",
                parse_mode="HTML", reply_markup=_day_buttons("ncc_day"),
            )
        elif pending["step"] == "vencimento":
            pending["data"]["due_day"] = day
            pending["step"] = "divida"
            teclado = InlineKeyboardMarkup([[InlineKeyboardButton("⏭ Nenhuma (R$0,00)", callback_data="ncc_skip_debt")]])
            await query.edit_message_text(
                f"💳 Vencimento: dia <b>{day}</b>\n\nDívida atual em reais?\n<i>Ou clique em Nenhuma</i>",
                parse_mode="HTML", reply_markup=teclado,
            )
        return

    if data_str == "ncc_skip_debt":
        pending = _pending_action.get(chat_id, {})
        if pending.get("action") != "criar_cartao":
            return
        pending["data"]["current_debt"] = 0.0
        await _finalizar_criar_cartao(chat_id, pending, query=query)
        return

    if data_str == "ncc_cancel":
        _pending_action.pop(chat_id, None)
        await query.edit_message_text("❌ Cancelado.", parse_mode="HTML")
        return


def _book_to_menu_data(book: dict) -> dict:
    """
    Converte um dict de livro retornado pelo PostgreSQL no formato
    esperado por _build_book_menu, incluindo a página atual via logs.
    """
    from agents.db import run_select

    # Busca a última página registrada via PostgreSQL (pode não existir se nunca houve log)
    rows = run_select(
        "SELECT page_end FROM reading_logs WHERE book_id = %(book_id)s ORDER BY date DESC, created_at DESC LIMIT 1",
        {"book_id": book["id"]},
    )
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


def _day_buttons(prefix: str) -> InlineKeyboardMarkup:
    """Gera teclado inline com dias comuns de fechamento/vencimento de fatura."""
    dias = [1, 3, 5, 6, 10, 13, 15, 20, 25, 30]
    linhas = [
        [InlineKeyboardButton(str(d), callback_data=f"{prefix}:{d}") for d in dias[:5]],
        [InlineKeyboardButton(str(d), callback_data=f"{prefix}:{d}") for d in dias[5:]],
    ]
    return InlineKeyboardMarkup(linhas)


async def _finalizar_criar_conta(chat_id: str, pending: dict, query=None, update=None) -> None:
    """Executa create_account com os dados coletados e envia confirmação ao usuário."""
    d = pending["data"]
    _pending_action.pop(chat_id, None)
    result = create_account(
        name=d["name"],
        type=d["type"],
        data_inicio=d.get("data_inicio", ""),
        institution=d.get("institution", ""),
        balance_inicial=float(d.get("balance_inicial", 0.0)),
    )
    if result["status"] == "ok":
        bal = float(d.get("balance_inicial", 0))
        inst = d.get("institution") or "—"
        msg = (
            f"✅ <b>Conta criada!</b>\n\n"
            f"📛 <b>{result['name']}</b>\n"
            f"🏷 Tipo: {d['type']} · 🏦 {inst}\n"
            f"💰 Saldo inicial: R${bal:.2f}"
        )
    else:
        msg = f"❌ Erro ao criar conta: {result['message']}"
    if query:
        await query.edit_message_text(msg, parse_mode="HTML")
    elif update:
        await update.message.reply_text(msg, parse_mode="HTML")


async def _finalizar_criar_cartao(chat_id: str, pending: dict, query=None, update=None) -> None:
    """Executa register_credit_card com os dados coletados e envia confirmação ao usuário."""
    d = pending["data"]
    _pending_action.pop(chat_id, None)
    # Taxa: se o usuário digitou 15 (para 15%), converte para 0.15; se já é decimal, usa diretamente
    taxa_raw = float(d["taxa"])
    taxa_decimal = taxa_raw / 100 if taxa_raw > 1 else taxa_raw
    taxa_pct = taxa_raw if taxa_raw > 1 else taxa_raw * 100
    result = register_credit_card(
        name=d["name"],
        account_name=d["account_name"],
        limite=float(d["limite"]),
        taxa_juros_mensal=taxa_decimal,
        closing_day=int(d["closing_day"]),
        due_day=int(d["due_day"]),
        current_debt=float(d.get("current_debt", 0.0)),
    )
    if result["status"] == "ok":
        msg = (
            f"✅ <b>Cartão cadastrado!</b>\n\n"
            f"💳 <b>{d['name']}</b> — {d['account_name']}\n"
            f"💰 Limite: R${float(d['limite']):.2f} · 📈 Taxa: {taxa_pct:.1f}%/mês\n"
            f"📅 Fechamento: dia {d['closing_day']} · Vencimento: dia {d['due_day']}"
        )
        if float(d.get("current_debt", 0)) > 0:
            msg += f"\n💸 Dívida inicial: R${float(d['current_debt']):.2f}"
    else:
        msg = f"❌ Erro ao cadastrar cartão: {result['message']}"
    if query:
        await query.edit_message_text(msg, parse_mode="HTML")
    elif update:
        await update.message.reply_text(msg, parse_mode="HTML")


def _classify_domain(text: str) -> str:
    """
    Classifica uma mensagem de texto em um domínio para escolher a sessão correta.
    Usa palavras-chave simples — sem custo de LLM e sem latência adicional.
    Retorna um dos valores de _DOMAINS.
    """
    t = text.lower()
    # Finanças: palavras relacionadas a dinheiro, despesas, receitas e contas
    if any(w in t for w in ["gastei", "recebi", "salário", "despesa", "receita",
                             "r$", "pagamento", "conta", "saldo", "extrato", "subscri"]):
        return "financas"
    # Livros: palavras relacionadas a leitura e catálogo de livros
    if any(w in t for w in ["livro", "página", "leitura", "ler",
                             "isbn", "autor", "frieren"]):
        return "livros"
    # Tarefas e agenda: sistema próprio de tarefas, Google Calendar, lembretes e eventos
    if any(w in t for w in ["tarefa", "task", "agenda", "evento",
                             "reunião", "lembrete", "kanban", "subtarefa", "calendário", "prazo"]):
        return "tarefas"
    # Knowledge base: notas do Obsidian e estudos via Kurisu
    if any(w in t for w in ["nota", "vault", "obsidian", "anotação", "estudo", "kurisu"]):
        return "knowledge"
    # Séries de TV: catálogo via Mai — episódios de série, temporadas, schedule de lançamentos
    if any(w in t for w in ["série", "series", "seriado", "netflix", "hbo", "amazon prime",
                              "temporada de", "episode", "mai sakurajima", "mai"]):
        return "series"
    # Animes: catálogo de animes via Marin — episódios, watchlist, MAL sync, schedule
    if any(w in t for w in ["anime", "animes", "episódio", "episodio", "temporada",
                              "mal", "anilist", "jikan", "marin", "simulcast",
                              "opening", "ending", "fansub", "op", "ed",
                              "assistindo", "watchei", "watched"]):
        return "animes"
    # Filmes: cinemateca pessoal via Akane — logar sessões, watchlist, diário de filmes
    if any(w in t for w in ["filme", "assistir", "assisti", "cinema", "diretor",
                              "letterboxd", "watchlist", "tmdb", "akane", "animação",
                              "vi ontem", "revi", "rewatch", "sessão de cinema"]):
        return "filmes"
    # Fallback: domínio genérico para mensagens que não se encaixam nas categorias acima
    return "geral"


async def ensure_session(chat_id: str, session_id: str) -> None:
    """
    Garante que existe uma sessão ADK para este session_id (cria na primeira vez).
    O set _sessions evita chamadas repetidas ao banco durante o mesmo processo.
    Após reinício do container o set está vazio, então verificamos no banco antes
    de tentar criar — evita erro caso a sessão já exista no PostgreSQL.
    """
    if session_id not in _sessions:
        # Verifica se a sessão já existe no banco (caso de restart do container)
        existing = await runner.session_service.get_session(
            app_name=APP_NAME,
            user_id=chat_id,
            session_id=session_id,
        )
        if existing is None:
            # Sessão nova: cria no banco pela primeira vez
            await runner.session_service.create_session(
                app_name=APP_NAME,
                user_id=chat_id,
                session_id=session_id,
            )
        # Marca como conhecida neste processo para evitar consultas futuras ao banco
        _sessions.add(session_id)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler chamado a cada mensagem de texto recebida no Telegram."""
    chat_id = str(update.message.chat_id)
    text = update.message.text

    logger.info(f"[{chat_id}] {text}")

    # ── Intercepta ações pendentes (nota de livro ou wizards de conta/cartão) ──
    # Antes de passar para o agente, verifica se há uma ação pendente para este chat.
    # Para "note" (passo único): faz pop imediatamente.
    # Para wizards multi-passo: mantém o estado até o passo final.
    if chat_id in _pending_action:
        pending = _pending_action[chat_id]
        action = pending.get("action", "")

        # ── Nota de livro (passo único) ───────────────────────────────────────
        if action == "note":
            _pending_action.pop(chat_id)
            update_book_by_id(pending["book_id"], notes=text)
            await update.message.reply_text("📝 Nota salva.")
            return

        # ── Wizard /criar-conta ───────────────────────────────────────────────
        if action == "criar_conta":
            step = pending["step"]

            if step == "nome":
                pending["data"]["name"] = text
                pending["step"] = "tipo"
                botoes = [
                    [InlineKeyboardButton("🏦 Corrente",    callback_data="nc_tipo:corrente"),
                     InlineKeyboardButton("💰 Poupança",    callback_data="nc_tipo:poupanca")],
                    [InlineKeyboardButton("💵 Dinheiro",    callback_data="nc_tipo:dinheiro"),
                     InlineKeyboardButton("📈 Investimento", callback_data="nc_tipo:investimento")],
                    [InlineKeyboardButton("❌ Cancelar",    callback_data="nc_cancel")],
                ]
                await update.message.reply_text(
                    f"🏦 <b>{text}</b> — Qual o tipo?",
                    parse_mode="HTML", reply_markup=InlineKeyboardMarkup(botoes),
                )
                return

            if step == "instituicao":
                pending["data"]["institution"] = text
                pending["step"] = "data_inicio"
                teclado = InlineKeyboardMarkup([[InlineKeyboardButton("📅 Hoje", callback_data="nc_hoje")]])
                await update.message.reply_text(
                    "🏦 <b>Nova Conta</b>\n\nData de início? <i>(YYYY-MM-DD)</i>",
                    parse_mode="HTML", reply_markup=teclado,
                )
                return

            if step == "data_inicio":
                pending["data"]["data_inicio"] = text
                pending["step"] = "balance"
                teclado = InlineKeyboardMarkup([[InlineKeyboardButton("⏭ R$0,00", callback_data="nc_skip_bal")]])
                await update.message.reply_text(
                    "🏦 <b>Nova Conta</b>\n\nSaldo inicial? <i>(ex: 1500)</i>",
                    parse_mode="HTML", reply_markup=teclado,
                )
                return

            if step == "balance":
                try:
                    pending["data"]["balance_inicial"] = float(text.replace(",", "."))
                except ValueError:
                    await update.message.reply_text("❌ Valor inválido. Digite um número (ex: 1500 ou 1500.50).")
                    return
                await _finalizar_criar_conta(chat_id, pending, update=update)
                return

            return  # passo desconhecido — não passa para o agente

        # ── Wizard /criar-cartao ──────────────────────────────────────────────
        if action == "criar_cartao":
            step = pending["step"]

            if step == "nome":
                pending["data"]["name"] = text
                pending["step"] = "limite"
                await update.message.reply_text(
                    f"💳 <b>{text}</b>\n\nQual o limite do cartão? <i>(ex: 5000)</i>",
                    parse_mode="HTML",
                )
                return

            if step == "limite":
                try:
                    pending["data"]["limite"] = float(text.replace(",", "."))
                except ValueError:
                    await update.message.reply_text("❌ Valor inválido. Digite um número (ex: 5000).")
                    return
                pending["step"] = "taxa"
                await update.message.reply_text(
                    "💳 <b>Taxa de juros mensal?</b>\n<i>Ex: 15 para 15% ou 0.15 para 15%</i>",
                    parse_mode="HTML",
                )
                return

            if step == "taxa":
                try:
                    pending["data"]["taxa"] = float(text.replace(",", ".").replace("%", ""))
                except ValueError:
                    await update.message.reply_text("❌ Valor inválido. Ex: 15 para 15%.")
                    return
                pending["step"] = "fechamento"
                await update.message.reply_text(
                    "💳 <b>Dia de fechamento da fatura?</b> (1–31)",
                    parse_mode="HTML", reply_markup=_day_buttons("ncc_day"),
                )
                return

            if step == "fechamento":
                try:
                    day = int(text)
                    assert 1 <= day <= 31
                except (ValueError, AssertionError):
                    await update.message.reply_text("❌ Dia inválido (1–31).")
                    return
                pending["data"]["closing_day"] = day
                pending["step"] = "vencimento"
                await update.message.reply_text(
                    f"💳 Fechamento: dia <b>{day}</b>\n\nDia de <b>vencimento</b>? (1–31)",
                    parse_mode="HTML", reply_markup=_day_buttons("ncc_day"),
                )
                return

            if step == "vencimento":
                try:
                    day = int(text)
                    assert 1 <= day <= 31
                except (ValueError, AssertionError):
                    await update.message.reply_text("❌ Dia inválido (1–31).")
                    return
                pending["data"]["due_day"] = day
                pending["step"] = "divida"
                teclado = InlineKeyboardMarkup([[InlineKeyboardButton("⏭ Nenhuma (R$0,00)", callback_data="ncc_skip_debt")]])
                await update.message.reply_text(
                    f"💳 Vencimento: dia <b>{day}</b>\n\nDívida atual? <i>(ex: 500)</i>",
                    parse_mode="HTML", reply_markup=teclado,
                )
                return

            if step == "divida":
                try:
                    pending["data"]["current_debt"] = float(text.replace(",", "."))
                except ValueError:
                    await update.message.reply_text("❌ Valor inválido. Ex: 500 ou 0.")
                    return
                await _finalizar_criar_cartao(chat_id, pending, update=update)
                return

            return  # passo desconhecido — não passa para o agente

    # Classifica o domínio da mensagem para usar a sessão isolada correta.
    # Isso evita que histórico de finanças contamine contexto de livros, etc.
    domain     = _classify_domain(text)
    session_id = f"{chat_id}_{domain}"

    logger.info(f"[{chat_id}] domínio={domain} session_id={session_id}")

    await ensure_session(chat_id, session_id)

    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    # Coleta texto de TODOS os eventos por autor.
    # Com sub_agents, o texto do sub-agente pode vir em eventos não-finais —
    # o evento final (is_final=True) é apenas o sinal de "done" e pode ter content=None.
    # Por isso mantemos um fallback por autor para não perder a resposta.
    final_parts: list[str] = []
    all_agent_texts: dict[str, list[str]] = {}  # autor → lista de textos coletados
    last_final_author: str | None = None

    # Retry loop: se a sessão foi deletada externamente (ex.: /limpar ou limpeza manual),
    # o ADK lança SessionNotFoundError. Recriamos a sessão e tentamos uma segunda vez.
    for attempt in range(2):
        try:
            async for event in runner.run_async(
                user_id=chat_id,
                session_id=session_id,
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

                # Acumula contagem de tokens do evento (usage_metadata só vem em alguns eventos)
                usage = getattr(event, "usage_metadata", None)
                if usage:
                    total_tokens = getattr(usage, "total_token_count", 0) or 0
                    _session_tokens[session_id] = _session_tokens.get(session_id, 0) + total_tokens

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
                logger.warning(f"[session] {session_id} não encontrada, recriando e tentando novamente...")
                _sessions.discard(session_id)
                await ensure_session(chat_id, session_id)
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

    # Avisa o usuário quando o contexto do domínio está ficando grande demais.
    # O aviso aparece logo antes da resposta do agente para ser visível.
    if _session_tokens.get(session_id, 0) > TOKEN_WARN_THRESHOLD:
        await update.message.reply_text(
            f"⚠️ O contexto de <b>{domain}</b> está grande "
            f"({_session_tokens[session_id]:,} tokens). "
            f"Use /limpar {domain} para resetar.",
            parse_mode="HTML",
        )

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

                    # Google Books às vezes retorna URLs com http:// — o Telegram rejeita;
                    # convertemos para https:// para evitar falha no send_photo.
                    if cover_url and cover_url.startswith("http://"):
                        cover_url = "https://" + cover_url[len("http://"):]

                    if cover_url:
                        try:
                            # Tenta enviar a capa como foto com o menu na legenda
                            await update.message.reply_photo(
                                photo=cover_url,
                                caption=msg_text,
                                reply_markup=keyboard,
                                parse_mode="HTML",
                            )
                        except Exception:
                            # Se o Telegram rejeitar a URL (imagem inválida, inacessível, etc.),
                            # exibe o menu como texto puro — melhor do que não mostrar nada.
                            await update.message.reply_text(msg_text, reply_markup=keyboard, parse_mode="HTML")
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


async def handle_tokens(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Comando /tokens — exibe o total de tokens acumulados por domínio neste processo.
    O contador reseta ao reiniciar o container.
    """
    chat_id = str(update.message.chat_id)
    linhas  = ["📊 <b>Tokens acumulados nesta sessão:</b>"]
    total_geral = 0
    for domain in _DOMAINS:
        sid    = f"{chat_id}_{domain}"
        tokens = _session_tokens.get(sid, 0)
        if tokens:
            linhas.append(f"• {domain}: <b>{tokens:,}</b>")
            total_geral += tokens
    if total_geral == 0:
        linhas.append("Nenhum token registrado ainda.")
    else:
        linhas.append(f"\nTotal: <b>{total_geral:,}</b>")
    linhas.append("\n<i>Contador reseta ao reiniciar o container.</i>")
    await update.message.reply_text("\n".join(linhas), parse_mode="HTML")


async def handle_limpar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Comando /limpar [dominio] — deleta a sessão ADK do domínio especificado (ou todos).
    Exemplos:
      /limpar           → limpa todos os domínios
      /limpar financas  → limpa apenas a sessão de finanças
      /limpar livros    → limpa apenas a sessão de livros
    """
    chat_id = str(update.message.chat_id)
    args    = context.args  # lista de palavras digitadas após o comando
    alvo    = args[0].lower() if args else None

    # Decide quais domínios serão limpos
    if alvo and alvo in _DOMAINS:
        dominios = [alvo]
    elif alvo:
        # Domínio informado não é válido — informa as opções disponíveis
        await update.message.reply_text(
            f"Domínio <b>{alvo}</b> inválido. Opções: {', '.join(_DOMAINS)}.",
            parse_mode="HTML",
        )
        return
    else:
        # Sem argumento → limpa todos os domínios do usuário
        dominios = list(_DOMAINS)

    limpos = []
    for domain in dominios:
        sid = f"{chat_id}_{domain}"
        # Deleta a sessão do banco se ela existe (em memória ou com tokens acumulados)
        if sid in _sessions or _session_tokens.get(sid, 0) > 0:
            await runner.session_service.delete_session(
                app_name=APP_NAME, user_id=chat_id, session_id=sid)
            _sessions.discard(sid)
            _session_tokens.pop(sid, None)
            limpos.append(domain)

    if limpos:
        await update.message.reply_text(
            f"🗑️ Contexto limpo: <b>{', '.join(limpos)}</b>.",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text("Nenhuma sessão ativa para limpar.", parse_mode="HTML")


async def handle_criar_conta(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Inicia o wizard de criação de conta financeira (5 passos)."""
    chat_id = str(update.message.chat_id)
    # Limpa qualquer wizard anterior pendente para este usuário
    _pending_action[chat_id] = {"action": "criar_conta", "step": "nome", "data": {}}
    await update.message.reply_text(
        "🏦 <b>Nova Conta</b>\n\nQual é o nome da conta?\n<i>Exemplo: Itau, Cartao Nu, NuConta</i>",
        parse_mode="HTML",
    )


async def handle_criar_cartao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Inicia o wizard de cadastro de cartão de crédito (7 passos)."""
    chat_id = str(update.message.chat_id)
    # Busca todas as contas ativas — cartões vinculam a contas correntes/poupança
    result = list_accounts(status="ativo")
    contas = result.get("accounts", [])
    if not contas:
        await update.message.reply_text(
            "❌ Nenhuma conta bancária cadastrada.\n\n"
            "Cartões de crédito precisam de uma conta corrente ou poupança para vincular.\n\n"
            "Crie primeiro com /criar_conta (tipo: Corrente ou Poupança).",
            parse_mode="HTML",
        )
        return
    # Guarda mapa id→name para recuperar o nome quando o botão for clicado
    _pending_action[chat_id] = {
        "action": "criar_cartao",
        "step": "conta",
        "data": {},
        "contas": {c["id"]: c["name"] for c in contas},
    }
    # Cada conta vira um botão — callback_data: ncc_acc:<uuid> (44 bytes, dentro do limite de 64)
    botoes = [[InlineKeyboardButton(f"💳 {c['name']}", callback_data=f"ncc_acc:{c['id']}")] for c in contas]
    botoes.append([InlineKeyboardButton("❌ Cancelar", callback_data="ncc_cancel")])
    await update.message.reply_text(
        "💳 <b>Novo Cartão</b>\n\nQual conta vincular?",
        parse_mode="HTML", reply_markup=InlineKeyboardMarkup(botoes),
    )


def main() -> None:
    """Inicializar e executar o bot Telegram em modo polling."""
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    # Comandos primeiro — devem ter prioridade sobre o handler de texto genérico
    app.add_handler(CommandHandler("tokens", handle_tokens))
    app.add_handler(CommandHandler("limpar", handle_limpar))
    app.add_handler(CommandHandler("criar_conta", handle_criar_conta))
    app.add_handler(CommandHandler("criar_cartao", handle_criar_cartao))
    # CallbackQueryHandler ANTES do MessageHandler para que cliques em botões
    # não sejam engolidos pelo handler de texto
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Makima online.")
    app.run_polling()


if __name__ == "__main__":
    main()
