"""Testes do login do app Android (webapp/backend/mobile_auth.py + rotas /auth/mobile*).

Sem banco e sem rede: o Google e as funções `_db_*` são simulados com um "banco" em memória.

Execute com:
    pytest tests/test_auth_mobile.py -v
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from webapp.backend import mobile_auth
from webapp.backend.deps import require_user
from webapp.backend.main import app

EMAIL = "dono@example.com"
CLAIMS_OK = {"email": EMAIL, "email_verified": True, "name": "Dono"}


class FakeDb:
    """Banco em memória que imita as 5 funções `_db_*` de mobile_auth."""

    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def insert(self, device_id, email, name, refresh_hash):
        self.rows[device_id] = {
            "id": device_id, "email": email, "name": name, "refresh_hash": refresh_hash,
            "created_at": datetime.now(timezone.utc), "last_used_at": datetime.now(timezone.utc),
            "revoked_at": None,
        }

    def get(self, device_id):
        row = self.rows.get(device_id)
        return dict(row) if row else None

    def update_refresh(self, device_id, refresh_hash):
        self.rows[device_id]["refresh_hash"] = refresh_hash
        self.rows[device_id]["last_used_at"] = datetime.now(timezone.utc)

    def revoke(self, device_id):
        if self.rows[device_id]["revoked_at"] is None:
            self.rows[device_id]["revoked_at"] = datetime.now(timezone.utc)

    def list(self, email):
        return [
            {k: r[k] for k in ("id", "name", "created_at", "last_used_at")}
            for r in self.rows.values() if r["email"] == email and r["revoked_at"] is None
        ]


@pytest.fixture
def db():
    """Instala o banco falso, liga o login mobile e limpa o cache de "aparelho ativo"."""
    fake = FakeDb()
    mobile_auth._active_cache.clear()
    with patch.object(mobile_auth, "_db_insert_device", fake.insert), \
         patch.object(mobile_auth, "_db_get_device", fake.get), \
         patch.object(mobile_auth, "_db_update_refresh", fake.update_refresh), \
         patch.object(mobile_auth, "_db_revoke", fake.revoke), \
         patch.object(mobile_auth, "_db_list_devices", fake.list), \
         patch("webapp.backend.routers.auth.ALLOWED_EMAIL", EMAIL), \
         patch("webapp.backend.deps.ALLOWED_EMAIL", EMAIL):
        yield fake
    mobile_auth._active_cache.clear()


@pytest.fixture
def client():
    # Outros módulos de teste fixam um usuário falso em `require_user` ao serem importados
    # (e isso vale para o processo todo). Aqui queremos a autenticação de verdade, então
    # tiramos o override durante o teste e devolvemos depois.
    guardado = app.dependency_overrides.pop(require_user, None)
    yield TestClient(app)
    if guardado is not None:
        app.dependency_overrides[require_user] = guardado


def login(client, claims=CLAIMS_OK):
    """Faz o login mobile com o Google simulado e devolve a resposta."""
    with patch.object(mobile_auth, "verify_google_id_token", return_value=claims):
        return client.post("/auth/mobile", json={"id_token": "x", "device_name": "Pixel"})


# ─── POST /auth/mobile ────────────────────────────────────────────────────────

def test_login_ok_devolve_tokens(db, client):
    r = login(client)
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["token_type"] == "Bearer" and corpo["user"]["email"] == EMAIL
    # o refresh guardado no banco é só o hash, nunca o token em si
    assert db.rows[corpo["device_id"]]["refresh_hash"] != corpo["refresh_token"]


def test_login_token_google_invalido_da_401(db, client):
    erro = mobile_auth.MobileAuthError(401, "Token do Google inválido ou expirado.")
    with patch.object(mobile_auth, "verify_google_id_token", side_effect=erro):
        assert client.post("/auth/mobile", json={"id_token": "x"}).status_code == 401


def test_login_email_errado_da_403(db, client):
    assert login(client, {**CLAIMS_OK, "email": "intruso@example.com"}).status_code == 403


def test_login_email_nao_verificado_da_401(db, client):
    assert login(client, {**CLAIMS_OK, "email_verified": False}).status_code == 401


def test_login_desligado_sem_client_ids_da_503(db, client):
    # sem GOOGLE_MOBILE_CLIENT_IDS a função real do Google responde 503
    with patch.object(mobile_auth, "GOOGLE_MOBILE_CLIENT_IDS", []):
        assert client.post("/auth/mobile", json={"id_token": "x"}).status_code == 503


# ─── bearer em rotas protegidas ───────────────────────────────────────────────

def test_bearer_valido_acessa_rota_protegida(db, client):
    token = login(client).json()["access_token"]
    r = client.get("/api/devices", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["devices"][0]["current"] is True


def test_sem_credencial_da_401(db, client):
    assert client.get("/api/devices").status_code == 401


def test_bearer_adulterado_da_401(db, client):
    token = login(client).json()["access_token"]
    assert client.get("/api/devices", headers={"Authorization": f"Bearer {token}x"}).status_code == 401


def test_cookie_do_site_nao_vale_como_bearer(db, client):
    # o cookie usa outro salt: colar o valor dele como bearer precisa falhar
    from webapp.backend.deps import _serializer
    cookie = _serializer.dumps({"email": EMAIL, "name": "Dono"})
    assert client.get("/api/devices", headers={"Authorization": f"Bearer {cookie}"}).status_code == 401


def test_cookie_continua_funcionando(db, client):
    from webapp.backend.deps import _serializer
    cookie = _serializer.dumps({"email": EMAIL, "name": "Dono"})
    client.cookies.set("makima_session", cookie)
    assert client.get("/api/devices").status_code == 200


def test_auth_me_aceita_bearer(db, client):
    token = login(client).json()["access_token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["email"] == EMAIL


# ─── refresh rotativo e revogação ─────────────────────────────────────────────

def test_refresh_troca_o_token_e_o_antigo_para_de_valer(db, client):
    antigo = login(client).json()["refresh_token"]

    r = client.post("/auth/mobile/refresh", json={"refresh_token": antigo})
    assert r.status_code == 200
    assert r.json()["refresh_token"] != antigo

    # reapresentar o antigo = suspeita de roubo → 401 e aparelho revogado
    r2 = client.post("/auth/mobile/refresh", json={"refresh_token": antigo})
    assert r2.status_code == 401
    novo = r.json()["refresh_token"]
    assert client.post("/auth/mobile/refresh", json={"refresh_token": novo}).status_code == 401


def test_refresh_inexistente_ou_malformado_da_401(db, client):
    assert client.post("/auth/mobile/refresh", json={"refresh_token": "lixo"}).status_code == 401
    assert client.post("/auth/mobile/refresh", json={"refresh_token": "abc.def"}).status_code == 401


def test_refresh_expirado_por_inatividade_da_401(db, client):
    corpo = login(client).json()
    db.rows[corpo["device_id"]]["last_used_at"] = datetime.now(timezone.utc) - timedelta(days=91)
    assert client.post("/auth/mobile/refresh", json={"refresh_token": corpo["refresh_token"]}).status_code == 401


def test_logout_revoga_o_acesso(db, client):
    corpo = login(client).json()
    assert client.post("/auth/mobile/logout", json={"refresh_token": corpo["refresh_token"]}).status_code == 200

    mobile_auth._active_cache.clear()  # evita esperar o TTL do cache no teste
    r = client.get("/api/devices", headers={"Authorization": f"Bearer {corpo['access_token']}"})
    assert r.status_code == 401


def test_logout_com_token_lixo_nao_quebra(db, client):
    assert client.post("/auth/mobile/logout", json={"refresh_token": "lixo"}).json() == {"status": "ok"}


def test_desconectar_outro_aparelho(db, client):
    a = login(client).json()
    b = login(client).json()
    h = {"Authorization": f"Bearer {a['access_token']}"}

    assert client.delete(f"/api/devices/{b['device_id']}", headers=h).status_code == 200
    assert client.delete("/api/devices/nao-existe", headers=h).status_code == 404
    assert client.post("/auth/mobile/refresh", json={"refresh_token": b["refresh_token"]}).status_code == 401
