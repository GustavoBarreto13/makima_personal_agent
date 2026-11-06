"""Roteamento de canais de scheduler/notify_channels.py: textos longos vs. avisos curtos.

- avisos curtos (padrão): push;
- textos longos (`long=True`: digests, relatórios, revisões): Discord, em blocos de até 1900 caracteres.
"""

import json

import pytest

from scheduler import notify_channels as nc


@pytest.fixture
def hermes(monkeypatch):
    """Hermes configurado e `requests.post` simulado; devolve a lista de chamadas feitas."""
    monkeypatch.setenv("HERMES_WEBHOOK_BASE_URL", "http://hermes")
    monkeypatch.setenv("WEBHOOK_SECRET", "segredo")
    monkeypatch.delenv("NOTIFY_DEFAULT_CHANNELS", raising=False)
    monkeypatch.delenv("NOTIFY_LONG_CHANNELS", raising=False)
    chamadas: list[tuple[str, str]] = []

    class _Resp:
        def raise_for_status(self):
            return None

    def _post(url, data=None, headers=None, timeout=None):
        chamadas.append((url, json.loads(data)["message"]))
        return _Resp()

    monkeypatch.setattr(nc.requests, "post", _post)
    return chamadas


def test_texto_longo_vai_para_o_discord_por_padrao(hermes):
    assert nc.send_notification("<b>Digest</b>", long=True) is True
    assert [u for u, _ in hermes] == ["http://hermes/webhooks/notify-discord"]


def test_aviso_curto_vai_para_push_e_nao_para_o_discord(hermes, monkeypatch):
    chamado = []
    monkeypatch.setattr(nc, "_send_push", lambda *a, **k: chamado.append(a) or True)
    assert nc.send_notification("oi") is True
    assert len(chamado) == 1
    assert hermes == []  # nada saiu pelas rotas do Hermes


def test_variaveis_de_ambiente_mudam_o_roteamento(hermes, monkeypatch):
    monkeypatch.setenv("NOTIFY_LONG_CHANNELS", "telegram,discord")
    nc.send_notification("x", long=True)
    assert [u.rsplit("-", 1)[1] for u, _ in hermes] == ["telegram", "discord"]


def test_channels_explicito_vence_o_long(hermes):
    nc.send_notification("x", channels=["whatsapp"], long=True)
    assert [u for u, _ in hermes] == ["http://hermes/webhooks/notify-whatsapp"]


def test_discord_recebe_negrito_em_dois_asteriscos(hermes):
    nc.send_notification("<b>Bom dia</b> <i>Gustavo</i>", channels=["discord"])
    assert hermes[0][1] == "**Bom dia** *Gustavo*"


def test_digest_grande_sai_em_blocos_ordenados_dentro_do_limite_do_discord(hermes):
    linhas = [f"linha {i:03d} " + "x" * 80 for i in range(60)]
    assert nc.send_notification("\n".join(linhas), channels=["discord"]) is True
    assert len(hermes) > 1
    assert all(len(texto) <= 1900 for _, texto in hermes)
    assert "\n".join(t for _, t in hermes) == "\n".join(linhas)  # nada perdido nem fora de ordem


def test_falha_num_bloco_interrompe_os_seguintes(hermes, monkeypatch):
    enviados = []

    def _falha_no_segundo(url, data=None, headers=None, timeout=None):
        enviados.append(1)
        if len(enviados) == 2:
            raise nc.requests.ConnectionError("caiu")

        class _R:
            def raise_for_status(self):
                return None

        return _R()

    monkeypatch.setattr(nc.requests, "post", _falha_no_segundo)
    linhas = ["y" * 90 for _ in range(60)]
    assert nc.send_notification("\n".join(linhas), channels=["discord"]) is True  # o 1º bloco saiu
    assert len(enviados) == 2  # parou no que falhou, sem mandar o resto fora de ordem


def test_texto_sem_quebra_gigante_e_cortado_no_limite():
    blocos = nc._split_for_discord("z" * 4000)
    assert [len(b) for b in blocos] == [1900, 1900, 200]
