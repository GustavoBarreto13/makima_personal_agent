"""Idempotência das escritas offline (webapp/backend/idempotency.py) e bullet por data."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from webapp.backend import idempotency as idem
from webapp.backend.deps import require_user
from webapp.backend.main import app

TOKEN = {"Authorization": "Bearer x", "Idempotency-Key": "chave-1"}


class Banco:
    """Simula a tabela idempotency_keys no nível das funções begin/finish/release."""

    def __init__(self):
        self.linhas: dict[str, dict] = {}

    def begin(self, key, route):
        if key not in self.linhas:
            self.linhas[key] = {"status": None, "response": None}
            return ("run",)
        linha = self.linhas[key]
        if linha["status"] is not None:
            return ("replay", linha["status"], linha["response"])
        return ("busy",)

    def finish(self, key, status, body):
        self.linhas[key].update(status=status, response=body)

    def release(self, key):
        if self.linhas.get(key, {}).get("status") is None:
            self.linhas.pop(key, None)


@pytest.fixture
def banco(monkeypatch):
    b = Banco()
    monkeypatch.setattr(idem, "begin", b.begin)
    monkeypatch.setattr(idem, "finish", b.finish)
    monkeypatch.setattr(idem, "release", b.release)
    return b


@pytest.fixture
def client():
    app.dependency_overrides[require_user] = lambda: {"email": "a@b.c"}
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_so_posts_das_rotas_de_escrita_participam():
    assert idem.is_eligible("POST", "/api/tasks")
    assert idem.is_eligible("POST", "/api/tasks/12/complete")
    assert idem.is_eligible("POST", "/api/tasks/habits/3/checkin")
    assert idem.is_eligible("POST", "/api/finances/transactions")
    assert idem.is_eligible("POST", "/api/journal/bullets")
    assert not idem.is_eligible("GET", "/api/tasks")
    assert not idem.is_eligible("POST", "/api/tasks/12/reopen")
    assert not idem.is_eligible("POST", "/api/books")


def test_reenvio_com_a_mesma_chave_nao_grava_duas_vezes(client, banco):
    with patch("webapp.backend.routers.tasks.create_task", return_value={"status": "ok", "id": 5}) as criar:
        r1 = client.post("/api/tasks", json={"title": "Dentista"}, headers=TOKEN)
        r2 = client.post("/api/tasks", json={"title": "Dentista"}, headers=TOKEN)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json() == r2.json() == {"status": "ok", "id": 5}
    assert criar.call_count == 1
    assert r2.headers.get("Idempotent-Replay") == "true"


def test_chaves_diferentes_gravam_separado(client, banco):
    with patch("webapp.backend.routers.tasks.create_task", return_value={"status": "ok", "id": 5}) as criar:
        client.post("/api/tasks", json={"title": "A"}, headers={**TOKEN, "Idempotency-Key": "k1"})
        client.post("/api/tasks", json={"title": "A"}, headers={**TOKEN, "Idempotency-Key": "k2"})
    assert criar.call_count == 2


def test_sem_cabecalho_nada_muda(client, banco):
    with patch("webapp.backend.routers.tasks.create_task", return_value={"status": "ok", "id": 5}) as criar:
        client.post("/api/tasks", json={"title": "A"}, headers={"Authorization": "Bearer x"})
        client.post("/api/tasks", json={"title": "A"}, headers={"Authorization": "Bearer x"})
    assert criar.call_count == 2 and banco.linhas == {}


def test_erro_solta_a_chave_para_o_reenvio_tentar_de_novo(client, banco):
    with patch("webapp.backend.routers.tasks.create_task", return_value={"status": "error", "message": "ruim"}):
        r = client.post("/api/tasks", json={"title": "A"}, headers=TOKEN)
    assert r.status_code == 400
    assert "chave-1" not in banco.linhas


def test_requisicao_em_andamento_devolve_503(client, banco):
    banco.linhas["chave-1"] = {"status": None, "response": None}
    r = client.post("/api/tasks", json={"title": "A"}, headers=TOKEN)
    assert r.status_code == 503


def test_sem_credencial_nunca_devolve_resposta_guardada(banco):
    banco.linhas["chave-1"] = {"status": 201, "response": '{"segredo": true}'}
    r = TestClient(app).post("/api/tasks", json={"title": "A"}, headers={"Idempotency-Key": "chave-1"})
    assert r.status_code == 401


def test_bullet_por_data_acrescenta_no_fim(client, banco):
    with patch("webapp.backend.routers.journal.append_bullet", return_value={"status": "ok", "bullet": {"id": 1}}) as ap:
        r = client.post("/api/journal/bullets", json={"date": "2026-11-06", "content": "oi"})
    assert r.status_code == 200
    ap.assert_called_once()
    assert ap.call_args.kwargs["date"] == "2026-11-06"


def test_bullet_sem_pagina_nem_data_e_422(client, banco):
    r = client.post("/api/journal/bullets", json={"content": "oi"})
    assert r.status_code == 422


def test_tabela_ausente_nao_derruba_a_escrita(client, monkeypatch):
    def quebra(*a, **k):
        raise RuntimeError('relation "idempotency_keys" does not exist')

    monkeypatch.setattr(idem, "begin", quebra)
    with patch("webapp.backend.routers.tasks.create_task", return_value={"status": "ok", "id": 5}) as criar:
        r = client.post("/api/tasks", json={"title": "A"}, headers=TOKEN)
    assert r.status_code == 201
    assert criar.call_count == 1
