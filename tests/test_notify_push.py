"""Testes do canal "push" (scheduler/notify_channels.py) e das rotas /api/devices/push.

Sem Firebase e sem banco: `_fcm_multicast` e `webapp.backend.push_store` são simulados.

Execute com:
    pytest tests/test_notify_push.py -v
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from scheduler import notify_channels as nc
from webapp.backend.deps import require_user
from webapp.backend.main import app

STORE = "webapp.backend.push_store"
TOKENS = [{"id": "a", "fcm_token": "tok-vivo"}, {"id": "b", "fcm_token": "tok-morto"}]


@pytest.fixture
def com_firebase(monkeypatch):
    """Simula um servidor com FIREBASE_CREDENTIALS_JSON configurada."""
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", "{}")


# ─── canal push no send_notification ─────────────────────────────────────────

def test_sem_credencial_pula_o_push(monkeypatch):
    monkeypatch.delenv("FIREBASE_CREDENTIALS_JSON", raising=False)
    with patch.object(nc, "_fcm_multicast", side_effect=AssertionError("não devia enviar")):
        assert nc.send_notification("oi", channels=["push"]) is False


def test_sem_aparelhos_nao_conta_como_enviado(com_firebase):
    with patch(f"{STORE}.list_push_tokens", return_value=[]), \
         patch.object(nc, "_fcm_multicast", side_effect=AssertionError("não devia enviar")):
        assert nc.send_notification("oi", channels=["push"]) is False


def test_envia_texto_limpo_com_canal_e_link(com_firebase):
    with patch(f"{STORE}.list_push_tokens", return_value=TOKENS), \
         patch(f"{STORE}.remove_tokens"), \
         patch.object(nc, "_fcm_multicast", return_value=(2, [])) as fcm:
        ok = nc.send_notification(
            "<b>3 tarefas</b> hoje", channels=["push"],
            title="Kaguya", link="makima://kaguya/hoje", agent="kaguya",
        )
    assert ok is True
    tokens, title, body, data, canal = fcm.call_args.args
    assert tokens == ["tok-vivo", "tok-morto"]
    assert (title, body, canal) == ("Kaguya", "3 tarefas hoje", "kaguya")  # sem <b>
    assert data == {"link": "makima://kaguya/hoje"}


def test_remove_tokens_que_o_fcm_recusou(com_firebase):
    with patch(f"{STORE}.list_push_tokens", return_value=TOKENS), \
         patch(f"{STORE}.remove_tokens") as remover, \
         patch.object(nc, "_fcm_multicast", return_value=(1, ["tok-morto"])):
        assert nc.send_notification("oi", channels=["push"]) is True
    remover.assert_called_once_with(["tok-morto"])


def test_falha_do_fcm_nao_levanta_nem_derruba_outros_canais(com_firebase, monkeypatch):
    monkeypatch.setenv("HERMES_WEBHOOK_BASE_URL", "http://hermes")
    monkeypatch.setenv("WEBHOOK_SECRET", "segredo")
    with patch(f"{STORE}.list_push_tokens", return_value=TOKENS), \
         patch.object(nc, "_fcm_multicast", side_effect=RuntimeError("fcm fora")), \
         patch.object(nc.requests, "post") as post:
        # WhatsApp responde ok; o push falha — o resultado geral é True e nada estoura
        assert nc.send_notification("oi", channels=["push", "whatsapp"]) is True
    post.assert_called_once()


def test_banco_fora_do_ar_nao_levanta(com_firebase):
    with patch(f"{STORE}.list_push_tokens", side_effect=RuntimeError("sem banco")):
        assert nc.send_notification("oi", channels=["push"]) is False


def test_chamadas_antigas_continuam_iguais(monkeypatch):
    # assinatura antiga (só mensagem + canais) segue valendo e push segue fora do padrão
    monkeypatch.delenv("NOTIFY_DEFAULT_CHANNELS", raising=False)
    monkeypatch.delenv("HERMES_WEBHOOK_BASE_URL", raising=False)
    assert nc.send_notification("oi") is False  # whatsapp sem URL configurada: pulado


# ─── rotas /api/devices/push ─────────────────────────────────────────────────

@pytest.fixture
def client():
    guardado = app.dependency_overrides.get(require_user)
    app.dependency_overrides[require_user] = lambda: {"email": "dono@example.com", "did": "dev1"}
    yield TestClient(app)
    if guardado is not None:
        app.dependency_overrides[require_user] = guardado
    else:
        app.dependency_overrides.pop(require_user, None)


TOKEN_FCM = "x" * 40


def test_registrar_push_vincula_ao_aparelho_logado(client):
    with patch(f"{STORE}.register_token", return_value="pid") as reg:
        r = client.post("/api/devices/push", json={"fcm_token": TOKEN_FCM, "device_name": "Pixel"})
    assert r.status_code == 201 and r.json() == {"status": "ok", "id": "pid"}
    reg.assert_called_once_with(TOKEN_FCM, "Pixel", "dev1")


def test_registrar_push_rejeita_token_curto(client):
    assert client.post("/api/devices/push", json={"fcm_token": "curto"}).status_code == 422


def test_remover_push(client):
    with patch(f"{STORE}.remove_push_device", return_value=True):
        assert client.delete("/api/devices/push/pid").status_code == 200
    with patch(f"{STORE}.remove_push_device", return_value=False):
        assert client.delete("/api/devices/push/nada").status_code == 404
