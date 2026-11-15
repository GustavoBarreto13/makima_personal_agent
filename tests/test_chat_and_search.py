"""Chat do app com o Hermes (SSE, Hermes simulado) e busca global da home. Sem banco, sem rede.

Execute com:
    pytest tests/test_chat_and_search.py -v
"""

import contextlib
import json
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from webapp.backend.deps import require_user
from webapp.backend.main import app
from webapp.backend.routers import chat as chat_router

app.dependency_overrides[require_user] = lambda: {"email": "test@example.com", "name": "Test"}
client = TestClient(app, raise_server_exceptions=True)


# ─── nome da ferramenta → cartão ──────────────────────────────────────────────

def test_action_from_tool_escrita_vira_cartao():
    a = chat_router.action_from_tool("mcp_nami_create_transaction")
    assert a == {"agent": "nami", "tool": "create_transaction", "label": "Create transaction"}
    assert chat_router.action_from_tool("kaguya__complete_task")["agent"] == "kaguya"
    assert chat_router.action_from_tool("mcp_journal_upsert_bullet") is None  # "upsert" não é prefixo de escrita conhecido


def test_action_from_tool_leitura_nao_vira_cartao():
    assert chat_router.action_from_tool("mcp_nami_get_month_plan") is None
    assert chat_router.action_from_tool("list_tasks_today") is None
    assert chat_router.action_from_tool("") is None


def test_alias_de_dominio():
    assert chat_router.action_from_tool("mcp_journal_create_letter")["agent"] == "violet"


# ─── endpoints ────────────────────────────────────────────────────────────────

def test_stream_desligado_responde_503(monkeypatch):
    monkeypatch.setattr(chat_router.config, "HERMES_API_URL", "")
    assert client.post("/api/chat/stream", json={"message": "oi"}).status_code == 503
    assert client.get("/api/chat/status").json() == {"enabled": False}


def test_stream_valida_mensagem_vazia():
    assert client.post("/api/chat/stream", json={"message": ""}).status_code == 422


def _hermes_sse() -> bytes:
    chunks = [
        {"choices": [{"delta": {"content": "Feito. "}}]},
        {"choices": [{"delta": {"tool_calls": [{"function": {"name": "mcp_nami_create_transaction"}}]}}]},
        {"choices": [{"delta": {"tool_calls": [{"function": {"name": "mcp_nami_get_month_plan"}}]}}]},
        {"choices": [{"delta": {"content": "Lancei R$ 32."}}]},
    ]
    return ("".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n").encode()


def _events(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        ev, data = block.split("\n", 1)
        out.append((ev.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return out


def test_stream_ok_encaminha_texto_cartao_e_salva(monkeypatch):
    monkeypatch.setattr(chat_router.config, "HERMES_API_URL", "http://hermes.test")
    saved: list[tuple] = []
    seen: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"], seen["auth"], seen["session"] = str(req.url), req.headers.get("authorization"), req.headers.get("x-hermes-session-id")
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, content=_hermes_sse(), headers={"content-type": "text/event-stream"})

    real_stream = httpx.stream
    transport = httpx.MockTransport(handler)

    @contextlib.contextmanager
    def fake_stream(method, url, **kw):
        with httpx.Client(transport=transport) as c, c.stream(method, url, **kw) as resp:
            yield resp

    monkeypatch.setattr(chat_router.config, "HERMES_API_KEY", "segredo")
    with patch.object(chat_router.httpx, "stream", fake_stream), \
         patch.object(chat_router.chat_store, "add_message", side_effect=lambda *a, **k: saved.append(a) or len(saved)), \
         patch.object(chat_router.chat_store, "list_messages", return_value=[{"role": "user", "content": "lança 32 no ifood"}]):
        r = client.post("/api/chat/stream", json={"message": "lança 32 no ifood"})
    assert real_stream is not None
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    ev = _events(r.text)
    assert [e for e, _ in ev] == ["delta", "action", "delta", "done"]
    assert ev[1][1]["agent"] == "nami"
    assert seen["url"] == "http://hermes.test/v1/chat/completions" and seen["auth"] == "Bearer segredo"
    assert seen["session"] == "app:test@example.com" and seen["body"]["stream"] is True
    # gravou a pergunta e a resposta completa, com o cartão
    assert saved[0][1] == "user" and saved[1][1] == "assistant"
    assert saved[1][2] == "Feito. Lancei R$ 32." and saved[1][3][0]["tool"] == "create_transaction"


def test_stream_hermes_fora_do_ar_vira_evento_de_erro_sem_salvar_resposta(monkeypatch):
    monkeypatch.setattr(chat_router.config, "HERMES_API_URL", "http://hermes.test")
    saved: list[tuple] = []

    def boom(method, url, **kw):
        raise httpx.ConnectError("sem rota")

    with patch.object(chat_router.httpx, "stream", boom), \
         patch.object(chat_router.chat_store, "add_message", side_effect=lambda *a, **k: saved.append(a) or 1), \
         patch.object(chat_router.chat_store, "list_messages", return_value=[]):
        r = client.post("/api/chat/stream", json={"message": "oi"})
    assert r.status_code == 200
    ev = _events(r.text)
    assert ev == [("error", {"message": "Não consegui falar com a Makima agora. Tente de novo em instantes."})]
    assert [s[1] for s in saved] == ["user"]  # só a pergunta


def test_historico_e_limpar():
    with patch.object(chat_router.chat_store, "list_messages", return_value=[{"id": 1, "role": "user", "content": "oi", "actions": [], "created_at": "x"}]):
        assert client.get("/api/chat/history").json()["messages"][0]["content"] == "oi"
    with patch.object(chat_router.chat_store, "clear_messages", return_value=3):
        assert client.delete("/api/chat/history").json() == {"status": "ok", "removed": 3}


# ─── busca global ─────────────────────────────────────────────────────────────

R = "webapp.backend.routers.hub"


def test_busca_curta_nao_consulta_nada():
    with patch(f"{R}.run_select") as m:
        assert client.get("/api/hub/search?q=a").json()["results"] == []
    m.assert_not_called()


def test_busca_junta_fontes_e_isola_falha():
    def fake(sql, params=None):
        if "FROM people" in sql:
            return [{"id": "p1", "label": "Beatriz"}]
        if "FROM books" in sql:
            return [{"id": "b1", "label": "Duna"}]
        if "FROM tasks" in sql:
            raise RuntimeError("tabela fora do ar")
        return []

    with patch(f"{R}.run_select", side_effect=fake):
        body = client.get("/api/hub/search?q=du").json()
    labels = {r["label"]: r for r in body["results"]}
    assert labels["Beatriz"]["href"] == "/people#pessoa/p1" and labels["Duna"]["href"] == "/books#livro/b1"
    assert body["errors"] == ["Tarefas"]


def test_busca_escapa_curingas():
    with patch(f"{R}.run_select", return_value=[]) as m:
        client.get("/api/hub/search?q=50%25_x")
    assert m.call_args_list[0].args[1]["q"] == "%50\\%\\_x%"
