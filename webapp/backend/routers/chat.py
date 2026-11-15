"""Chat do app com o Hermes — `/api/chat/*`.

O backend fala com o Hermes **de servidor para servidor** (rede interna do Dokploy), usando a API
compatível com OpenAI que o gateway expõe (`POST {HERMES_API_URL}/v1/chat/completions`, `stream: true`).
O segredo (`HERMES_API_KEY`) fica só aqui; o navegador/app só enxerga `/api/chat/*` com a sessão normal.

A resposta chega ao cliente como SSE próprio (mais simples que o formato OpenAI):
    event: delta   data: {"text": "..."}            pedaço do texto
    event: action  data: {"agent","tool","label"}   um agente executou algo (vira cartão na tela)
    event: error   data: {"message": "..."}         falha (Hermes fora do ar, etc.)
    event: done    data: {"id": <id da mensagem salva>}

Sem `HERMES_API_URL` o chat fica desligado: `POST /stream` responde 503 e o histórico segue funcionando.
"""

import json
import logging
import re
from collections.abc import Iterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from webapp.backend import chat_store
from webapp.backend import config
from webapp.backend.deps import require_user

log = logging.getLogger("webapp.chat")
router = APIRouter()

# Domínios MCP do Hermes (o nome da ferramenta costuma vir como mcp_<dominio>_<tool>).
_AGENTS = {"nami", "kaguya", "kurisu", "frieren", "akane", "marin", "mai", "komi", "lucy", "journal", "yato", "calendar"}
_AGENT_ALIAS = {"journal": "violet", "calendar": "kaguya"}
# Só ferramentas que ESCREVEM viram cartão "o que foi feito"; leituras ficam de fora.
_WRITE_PREFIXES = (
    "create", "add", "log", "complete", "update", "delete", "set", "check", "start", "finish",
    "register", "mark", "link", "relate", "merge", "restore", "reopen", "process",
)


class ChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


def action_from_tool(name: str) -> dict | None:
    """Transforma o nome de uma ferramenta chamada pelo Hermes em um cartão de ação.

    Args:
        name: Ex.: ``mcp_nami_create_transaction``, ``nami__create_transaction`` ou ``create_task``.

    Returns:
        ``{"agent", "tool", "label"}`` para ferramentas de escrita; ``None`` para leituras ou nomes vazios.

    Example:
        >>> action_from_tool("mcp_nami_create_transaction")["agent"]
        'nami'
    """
    parts = [p for p in re.split(r"[_\-.:/]+", name.lower()) if p and p != "mcp"]
    if not parts:
        return None
    agent = next((p for p in parts if p in _AGENTS), None)
    tool_parts = [p for p in parts if p != agent]
    if not tool_parts or not tool_parts[0].startswith(_WRITE_PREFIXES):
        return None
    tool = "_".join(tool_parts)
    return {"agent": _AGENT_ALIAS.get(agent, agent) if agent else None, "tool": tool, "label": tool.replace("_", " ").capitalize()}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_hermes(email: str, history: list[dict]) -> Iterator[str]:
    """Chama o Hermes em streaming e devolve eventos SSE; grava a resposta no fim."""
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    headers = {"Content-Type": "application/json", "X-Hermes-Session-Id": f"app:{email}"}
    if config.HERMES_API_KEY:
        headers["Authorization"] = f"Bearer {config.HERMES_API_KEY}"
    text_parts: list[str] = []
    actions: list[dict] = []
    seen_tools: set[str] = set()
    failed = False
    try:
        with httpx.stream(
            "POST", f"{config.HERMES_API_URL}/v1/chat/completions", headers=headers,
            timeout=httpx.Timeout(10.0, read=120.0),
            json={"model": config.HERMES_API_MODEL, "messages": messages, "stream": True},
        ) as resp:
            if resp.status_code >= 400:
                raise RuntimeError(f"Hermes respondeu {resp.status_code}")
            event = ""
            for line in resp.iter_lines():
                if not line.strip():
                    event = ""  # linha em branco separa os eventos do SSE
                    continue
                if line.startswith("event:"):
                    event = line[6:].strip()
                    continue
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except ValueError:
                    continue
                if event == "hermes.tool.progress":
                    # O Hermes anuncia cada ferramenta num evento próprio: {tool, label, toolCallId, status}.
                    # Só o início ("running") vira cartão; o "completed" repete o mesmo toolCallId.
                    key = str(data.get("toolCallId") or data.get("tool") or "")
                    if data.get("status") == "running" and data.get("tool") and key not in seen_tools:
                        seen_tools.add(key)
                        act = action_from_tool(str(data["tool"]))
                        if act:
                            actions.append(act)
                            yield _sse("action", act)
                    continue
                try:
                    delta = data["choices"][0].get("delta", {})
                except (KeyError, IndexError, TypeError, AttributeError):
                    continue
                if delta.get("content"):
                    text_parts.append(delta["content"])
                    yield _sse("delta", {"text": delta["content"]})
                # Reserva: servidores OpenAI "puros" mandam as ferramentas em delta.tool_calls.
                for tc in delta.get("tool_calls") or []:
                    name = (tc.get("function") or {}).get("name")
                    if name and name not in seen_tools:
                        seen_tools.add(name)
                        act = action_from_tool(name)
                        if act:
                            actions.append(act)
                            yield _sse("action", act)
    except Exception as e:  # noqa: BLE001 — qualquer falha vira mensagem amigável, nunca stack trace
        failed = True
        log.warning("chat: falha ao falar com o Hermes: %s", e)
        yield _sse("error", {"message": "Não consegui falar com a Makima agora. Tente de novo em instantes."})
    reply = "".join(text_parts).strip()
    if reply and not failed:
        try:
            msg_id = chat_store.add_message(email, "assistant", reply, actions)
            yield _sse("done", {"id": msg_id})
        except Exception as e:  # noqa: BLE001
            log.warning("chat: não salvou a resposta: %s", e)
            yield _sse("done", {"id": None})
    elif not failed:
        yield _sse("error", {"message": "A Makima não respondeu desta vez. Tente de novo."})


@router.get("/status")
def chat_status(user: dict = Depends(require_user)) -> dict:
    """Diz se o chat está ligado (HERMES_API_URL configurada)."""
    return {"enabled": bool(config.HERMES_API_URL)}


@router.get("/history")
def chat_history(limit: int = 60, user: dict = Depends(require_user)) -> dict:
    """Histórico do chat do app (mais antigas primeiro)."""
    return {"messages": chat_store.list_messages(user["email"], limit)}


@router.delete("/history")
def chat_clear(user: dict = Depends(require_user)) -> dict:
    """Limpa o histórico do app (a memória do Hermes não é apagada)."""
    return {"status": "ok", "removed": chat_store.clear_messages(user["email"])}


@router.post("/stream")
def chat_stream(body: ChatBody, user: dict = Depends(require_user)) -> StreamingResponse:
    """Envia uma mensagem ao Hermes e devolve a resposta em SSE (ver o cabeçalho do módulo)."""
    if not config.HERMES_API_URL:
        raise HTTPException(status_code=503, detail="O chat com a Makima ainda não foi ligado neste servidor.")
    email = user["email"]
    chat_store.add_message(email, "user", body.message.strip())
    history = chat_store.list_messages(email, 30)
    return StreamingResponse(
        _stream_hermes(email, history), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
