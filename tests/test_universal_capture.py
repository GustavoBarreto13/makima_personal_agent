"""Captura universal da home: parser puro + endpoints parse/commit/undo (tools mockadas, sem banco).

Execute com:
    pytest tests/test_universal_capture.py -v
"""

from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient

from webapp.backend.deps import require_user
from webapp.backend.main import app
from webapp.backend.universal_capture import parse_line

app.dependency_overrides[require_user] = lambda: {"email": "test@example.com", "name": "Test"}
client = TestClient(app, raise_server_exceptions=True)

HOJE = date(2026, 11, 15)  # domingo


def test_gasto_com_categoria_e_data():
    r = parse_line("gastei 32 no ifood ontem", HOJE)
    assert r["kind"] == "expense" and r["agent"] == "nami" and r["confidence"] == "high"
    assert r["fields"] == {"name": "Ifood", "valor": 32.0, "tipo": "Despesa", "categoria": "Comer Fora", "data": "2026-11-14"}


def test_valor_brasileiro():
    assert parse_line("paguei R$ 1.234,50 de aluguel", HOJE)["fields"]["valor"] == 1234.5
    assert parse_line("comprei 32,5 reais de pizza", HOJE)["fields"]["valor"] == 32.5


def test_receita():
    r = parse_line("recebi 500 de freela hoje", HOJE)
    assert r["kind"] == "income" and r["fields"]["tipo"] == "Receita" and r["fields"]["data"] == "2026-11-15"


def test_gasto_sem_descricao_vira_gasto_e_inbox():
    r = parse_line("gastei 20", HOJE)
    assert r["fields"]["name"] == "Gasto" and r["fields"]["categoria"] == "Inbox"


def test_tarefa_com_data_e_confianca():
    r = parse_line("ligar pro contador amanhã", HOJE)
    assert r["kind"] == "task" and r["fields"]["due_date"] == "2026-11-16" and r["confidence"] == "high"
    assert r["fields"]["title"] == "Ligar pro contador"


def test_frase_solta_vira_tarefa_com_confianca_baixa():
    r = parse_line("lembrar da reunião", HOJE)
    assert r["kind"] == "task"
    assert parse_line("blablabla qualquer coisa", HOJE)["confidence"] == "low"


def test_dia_do_mes_e_depois_de_amanha():
    assert parse_line("pagar luz dia 20", HOJE)["fields"]["due_date"] == "2026-11-20"
    assert parse_line("pagar luz dia 10", HOJE)["fields"]["due_date"] == "2026-12-10"
    assert parse_line("fazer X depois de amanhã", HOJE)["fields"]["due_date"] == "2026-11-17"


def test_mencoes_saem_do_titulo():
    r = parse_line("comprar presente @Bia", HOJE)
    assert r["mentions"] == ["Bia"] and "@" not in r["title"]


def test_vazio():
    assert parse_line("   ", HOJE)["kind"] == "empty"


# ─── endpoints ────────────────────────────────────────────────────────────────

R = "webapp.backend.routers.hub"


def test_parse_endpoint_nao_grava_e_resolve_pessoa():
    ok = {"status": "ok", "match": "one", "person": {"id": "p1", "name": "Beatriz"}, "people": []}
    with patch("agents.komi.integration.resolve_person", return_value=ok):
        r = client.post("/api/hub/capture/parse", json={"text": "comprar presente @Bia"})
    assert r.status_code == 200
    body = r.json()
    assert body["people"] == [{"id": "p1", "name": "Beatriz", "mention": "Bia"}] and body["warnings"] == []


def test_parse_pessoa_ambigua_vira_aviso_sem_vinculo():
    amb = {"status": "ok", "match": "many", "person": None, "people": [{}, {}]}
    with patch("agents.komi.integration.resolve_person", return_value=amb):
        body = client.post("/api/hub/capture/parse", json={"text": "café @Ana"}).json()
    assert body["people"] == [] and "Mais de uma pessoa" in body["warnings"][0]


def test_commit_gasto_chama_nami_e_devolve_undo():
    with patch("agents.nami.tools.create_transaction", return_value={"status": "ok", "id": "tx1", "message": "Transação criada"}) as m:
        r = client.post("/api/hub/capture/commit", json={
            "kind": "expense", "person_ids": ["p1"],
            "fields": {"name": "Ifood", "valor": 32, "categoria": "Comer Fora", "data": "2026-11-15"}})
    assert r.status_code == 201 and r.json()["undo"] == {"kind": "expense", "id": "tx1"}
    assert m.call_args.kwargs["tipo"] == "Despesa" and m.call_args.kwargs["person_ids"] == ["p1"]


def test_commit_valor_invalido_400():
    r = client.post("/api/hub/capture/commit", json={"kind": "expense", "fields": {"valor": 0}})
    assert r.status_code == 400


def test_commit_tarefa_sem_titulo_400_e_ok_com_titulo():
    assert client.post("/api/hub/capture/commit", json={"kind": "task", "fields": {"title": " "}}).status_code == 400
    with patch("agents.kaguya.tools_tasks.create_task", return_value={"status": "ok", "id": 7}):
        r = client.post("/api/hub/capture/commit", json={"kind": "task", "fields": {"title": "Ligar", "due_date": "2026-11-16"}})
    assert r.status_code == 201 and r.json()["undo"] == {"kind": "task", "id": "7"}


def test_undo_chama_a_tool_certa():
    with patch("agents.nami.tools.delete_transaction", return_value={"status": "ok"}) as d1:
        assert client.post("/api/hub/capture/undo", json={"kind": "expense", "id": "tx1"}).status_code == 200
    d1.assert_called_once_with("tx1")
    with patch("agents.kaguya.tools_tasks.delete_task", return_value={"status": "ok"}) as d2:
        assert client.post("/api/hub/capture/undo", json={"kind": "task", "id": "7"}).status_code == 200
    d2.assert_called_once_with(7)
