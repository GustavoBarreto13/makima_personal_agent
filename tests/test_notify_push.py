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


# ─── visibilidade na tela de bloqueio ────────────────────────────────────────

def _visibilidade_enviada(monkeypatch, canal: str) -> str:
    """Roda `_fcm_multicast` com o Firebase simulado e devolve a `visibility` mandada ao Android."""
    import sys
    import types

    capturado = {}

    class _Msg:
        def __init__(self, **kw):
            capturado.update(kw)

    class _AndroidNotification:
        def __init__(self, **kw):
            capturado["android_notification"] = kw

    fake_messaging = types.SimpleNamespace(
        MulticastMessage=_Msg,
        Notification=lambda **kw: kw,
        AndroidConfig=lambda **kw: kw,
        AndroidNotification=_AndroidNotification,
        send_each_for_multicast=lambda msg, app=None: types.SimpleNamespace(responses=[types.SimpleNamespace(success=True, exception=None)], success_count=1),
        UnregisteredError=type("UnregisteredError", (Exception,), {}),
        SenderIdMismatchError=type("SenderIdMismatchError", (Exception,), {}),
    )
    fake_admin = types.SimpleNamespace(get_app=lambda: object(), initialize_app=lambda cred: object())
    fake_credentials = types.SimpleNamespace(Certificate=lambda info: info)
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", "{}")
    monkeypatch.setitem(sys.modules, "firebase_admin", fake_admin)
    monkeypatch.setitem(sys.modules, "firebase_admin.credentials", fake_credentials)
    monkeypatch.setitem(sys.modules, "firebase_admin.messaging", fake_messaging)
    fake_admin.credentials = fake_credentials
    fake_admin.messaging = fake_messaging

    nc._fcm_multicast(["tok-12345678901234567890"], "t", "b", {}, canal)
    return capturado["android_notification"]["visibility"]


def _mensagem_enviada(monkeypatch, **kw) -> dict:
    """Roda `_fcm_multicast` com o Firebase simulado e devolve o que foi montado para o FCM."""
    import sys
    import types

    capturado = {}

    class _Msg:
        def __init__(self, **k):
            capturado.update(k)

    fake_messaging = types.SimpleNamespace(
        MulticastMessage=_Msg,
        Notification=lambda **k: ("notification", k),
        AndroidConfig=lambda **k: k,
        AndroidNotification=lambda **k: ("android_notification", k),
        send_each_for_multicast=lambda msg, app=None: types.SimpleNamespace(responses=[], success_count=1),
        UnregisteredError=type("UnregisteredError", (Exception,), {}),
        SenderIdMismatchError=type("SenderIdMismatchError", (Exception,), {}),
    )
    fake_admin = types.SimpleNamespace(get_app=lambda: object(), initialize_app=lambda cred: object())
    fake_credentials = types.SimpleNamespace(Certificate=lambda info: info)
    monkeypatch.setenv("FIREBASE_CREDENTIALS_JSON", "{}")
    monkeypatch.setitem(sys.modules, "firebase_admin", fake_admin)
    monkeypatch.setitem(sys.modules, "firebase_admin.credentials", fake_credentials)
    monkeypatch.setitem(sys.modules, "firebase_admin.messaging", fake_messaging)
    fake_admin.credentials = fake_credentials
    fake_admin.messaging = fake_messaging

    nc._fcm_multicast(["tok-12345678901234567890"], "Título", "Texto", {"link": "makima://kaguya"}, "kaguya", **kw)
    return capturado


def test_push_so_de_dados_nao_manda_bloco_notification(monkeypatch):
    msg = _mensagem_enviada(monkeypatch, data_only=True)
    assert msg["notification"] is None
    assert msg["android"]["notification"] is None
    assert msg["android"]["priority"] == "high"
    # O app desenha a notificação: precisa receber título, texto e canal como dado.
    assert msg["data"] == {
        "link": "makima://kaguya", "title": "Título", "body": "Texto", "channel_id": "kaguya", "private": "0",
    }


def test_push_comum_continua_com_bloco_notification(monkeypatch):
    msg = _mensagem_enviada(monkeypatch)
    assert msg["notification"] == ("notification", {"title": "Título", "body": "Texto"})
    assert msg["data"] == {"link": "makima://kaguya"}


@pytest.mark.parametrize("canal", ["nami", "violet", "lucy"])
def test_canais_sensiveis_escondem_o_conteudo_na_tela_de_bloqueio(monkeypatch, canal):
    assert _visibilidade_enviada(monkeypatch, canal) == "private"


def test_canal_comum_mostra_o_conteudo(monkeypatch):
    assert _visibilidade_enviada(monkeypatch, "kaguya") == "public"
