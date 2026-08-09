"""Lógica reaproveitável de execução do Runner ADK e coleta de texto dos eventos.

Extraída de ``coordinator/main.py::handle_message`` (spec 064, Etapa E2) para ser
compartilhada entre o bot Telegram e a ponte legada MCP
(``mcp_servers/makima/legacy.py``) — mesmo comportamento (fallback de texto de
sub_agents, retry único em ``SessionNotFoundError``), sem duplicar a lógica de consumo
de eventos do ADK em dois lugares.
"""

import logging

from google.adk.errors.session_not_found_error import SessionNotFoundError
from google.genai import types

logger = logging.getLogger(__name__)


async def ensure_session(
    runner,
    app_name: str,
    chat_id: str,
    session_id: str,
    known_sessions: set[str],
) -> None:
    """Garante que existe uma sessão ADK para este session_id (cria na primeira vez).

    ``known_sessions`` evita chamadas repetidas ao banco durante o mesmo processo. Após
    reinício do container o set está vazio, então verificamos no banco antes de tentar
    criar — evita erro caso a sessão já exista no PostgreSQL.
    """
    if session_id not in known_sessions:
        existing = await runner.session_service.get_session(
            app_name=app_name,
            user_id=chat_id,
            session_id=session_id,
        )
        if existing is None:
            await runner.session_service.create_session(
                app_name=app_name,
                user_id=chat_id,
                session_id=session_id,
            )
        known_sessions.add(session_id)


async def run_and_collect_text(
    runner,
    app_name: str,
    chat_id: str,
    session_id: str,
    text: str,
    known_sessions: set[str],
) -> tuple[str, int]:
    """Roda uma mensagem pelo Runner ADK e devolve ``(texto_final, tokens_usados)``.

    Acumula texto de TODOS os eventos por autor — com ``sub_agents``, o texto do
    sub-agente pode vir em eventos não-finais; o evento final (``is_final=True``) é só o
    sinal de "done" e pode ter ``content=None``. Por isso mantemos um fallback por autor
    para não perder a resposta. Um retry único cobre o caso da sessão ter sido apagada
    externamente (ex.: ``/limpar`` ou limpeza manual) entre o ``ensure_session`` e o
    ``run_async``.
    """
    await ensure_session(runner, app_name, chat_id, session_id, known_sessions)
    new_message = types.Content(role="user", parts=[types.Part(text=text)])

    final_parts: list[str] = []
    all_agent_texts: dict[str, list[str]] = {}
    last_final_author: str | None = None
    tokens_used = 0

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

                for part in parts:
                    if getattr(part, "text", None) and part.text.strip():
                        all_agent_texts.setdefault(author, []).append(part.text)

                usage = getattr(event, "usage_metadata", None)
                if usage:
                    tokens_used += getattr(usage, "total_token_count", 0) or 0

                if is_final:
                    last_final_author = author
                    text_resp = "".join(p.text or "" for p in parts if getattr(p, "text", None))
                    if text_resp.strip():
                        final_parts.append(text_resp)

            break  # loop do runner concluído sem erro — sai do retry

        except SessionNotFoundError:
            if attempt == 0:
                logger.warning(f"[session] {session_id} não encontrada, recriando e tentando novamente...")
                known_sessions.discard(session_id)
                await ensure_session(runner, app_name, chat_id, session_id, known_sessions)
            else:
                raise

    # Fallback: se o evento final veio vazio (padrão de sub_agents), usa o texto
    # coletado nos eventos não-finais do mesmo autor
    if not final_parts and last_final_author and last_final_author in all_agent_texts:
        logger.info(f"[fallback] usando texto de eventos não-finais de {last_final_author!r}")
        combined = "".join(all_agent_texts[last_final_author])
        if combined.strip():
            final_parts.append(combined)

    return "".join(final_parts), tokens_used
