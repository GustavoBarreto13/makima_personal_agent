"""Botões da notificação push: token assinado, rota /api/push/action e adiar tarefa."""

from datetime import date, datetime, time, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from agents.kaguya import tools_tasks
from agents.kaguya.tz import SP_TZ
from webapp.backend import push_actions as pa
from webapp.backend.main import app

ROTA = "webapp.backend.routers.push_actions"


@pytest.fixture
def client():
    return TestClient(app)


# ─── token ───────────────────────────────────────────────────────────────────

def test_token_vai_e_volta():
    assert pa.read_action_token(pa.sign_action_token(42)) == 42


def test_token_adulterado_ou_de_outro_contexto_e_recusado():
    with pytest.raises(pa.PushActionError) as exc:
        pa.read_action_token("lixo")
    assert exc.value.status == 401


def test_token_vencido_e_recusado(monkeypatch):
    token = pa.sign_action_token(1)
    monkeypatch.setattr(pa, "ACTION_MAX_AGE_SECONDS", -1)
    with pytest.raises(pa.PushActionError):
        pa.read_action_token(token)


# ─── rota ────────────────────────────────────────────────────────────────────

def _post(client, token, action):
    return client.post("/api/push/action", json={"token": token, "action": action})


def test_rota_nao_exige_sessao_mas_exige_token(client):
    assert _post(client, "lixo", "complete").status_code == 401


def test_acao_invalida(client):
    assert _post(client, pa.sign_action_token(1), "apagar").status_code == 400


def test_concluir_chama_complete_task(client):
    with patch(f"{ROTA}.run_select", return_value=[{"done": False}]), \
         patch(f"{ROTA}.tools_tasks.complete_task", return_value={"status": "ok", "message": "Tarefa concluída."}) as c:
        r = _post(client, pa.sign_action_token(7), "complete")
    assert r.status_code == 200
    c.assert_called_once_with(7, cascade=False)


def test_concluir_duas_vezes_nao_conclui_de_novo(client):
    with patch(f"{ROTA}.run_select", return_value=[{"done": True}]), \
         patch(f"{ROTA}.tools_tasks.complete_task", side_effect=AssertionError("não devia concluir")):
        r = _post(client, pa.sign_action_token(7), "complete")
    assert r.status_code == 200


def test_concluir_com_subtarefas_abertas_devolve_409(client):
    with patch(f"{ROTA}.run_select", return_value=[{"done": False}]), \
         patch(f"{ROTA}.tools_tasks.complete_task", return_value={"status": "error", "needs_cascade": True}):
        assert _post(client, pa.sign_action_token(7), "complete").status_code == 409


def test_tarefa_inexistente_devolve_404(client):
    with patch(f"{ROTA}.run_select", return_value=[]):
        assert _post(client, pa.sign_action_token(7), "complete").status_code == 404


def test_adiar_e_amanha_chamam_as_funcoes_certas(client):
    with patch(f"{ROTA}.tools_tasks.snooze_task", return_value={"status": "ok"}) as s, \
         patch(f"{ROTA}.tools_tasks.postpone_to_tomorrow", return_value={"status": "ok"}) as t:
        assert _post(client, pa.sign_action_token(7), "snooze_1h").status_code == 200
        assert _post(client, pa.sign_action_token(8), "tomorrow").status_code == 200
    s.assert_called_once_with(7, 60)
    t.assert_called_once_with(8)


# ─── cálculo do novo horário (puro) ──────────────────────────────────────────

AGORA = datetime(2026, 11, 6, 13, 50, tzinfo=SP_TZ)


def test_adiar_empurra_a_partir_do_horario_da_tarefa():
    novo = tools_tasks._new_start(date(2026, 11, 6), time(14, 0), None, AGORA, timedelta(hours=1), False)
    assert novo == datetime(2026, 11, 6, 15, 0, tzinfo=SP_TZ)


def test_adiar_tarefa_que_ja_passou_parte_de_agora():
    novo = tools_tasks._new_start(date(2026, 11, 6), time(9, 0), None, AGORA, timedelta(hours=1), False)
    assert novo == datetime(2026, 11, 6, 14, 50, tzinfo=SP_TZ)


def test_adiar_usa_o_bloco_de_tempo_quando_existe():
    bloco = datetime(2026, 11, 6, 16, 0, tzinfo=SP_TZ)
    novo = tools_tasks._new_start(date(2026, 11, 6), time(14, 0), bloco, AGORA, timedelta(hours=1), False)
    assert novo == datetime(2026, 11, 6, 17, 0, tzinfo=SP_TZ)


def test_amanha_mantem_o_horario_no_dia_seguinte_a_hoje():
    novo = tools_tasks._new_start(date(2026, 11, 1), time(14, 0), None, AGORA, None, True)
    assert novo == datetime(2026, 11, 7, 14, 0, tzinfo=SP_TZ)


def test_tarefa_sem_horario_nao_pode_ser_adiada():
    assert tools_tasks._new_start(date(2026, 11, 6), None, None, AGORA, timedelta(hours=1), False) is None
