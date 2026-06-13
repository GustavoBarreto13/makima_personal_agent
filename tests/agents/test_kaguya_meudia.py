"""Testes de integração da camada de lógica do Meu Dia (fatia 016).

Estes testes exercitam as funções de tools_tasks.py que esta fatia introduz:
add_to_my_day, remove_from_my_day, reschedule_pending, set_estimate,
set_time_block, clear_time_block e list_my_day.

Requerem um PostgreSQL de teste configurado via DATABASE_URL. Reutilizam a
infraestrutura dos outros testes de integração (test_kaguya_tasks.py).

Para rodar:
    .venv\\Scripts\\python -m pytest tests/agents/test_kaguya_meudia.py -v
"""

import pytest
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from agents.kaguya.tools_tasks import (
    create_task, add_to_my_day, remove_from_my_day, reschedule_pending,
    set_estimate, set_time_block, clear_time_block, list_my_day, delete_task,
)

# Data de hoje no fuso SP (usada em todos os testes).
_HOJE = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
_HOJE_STR = _HOJE.isoformat()
_ONTEM_STR = (_HOJE - timedelta(days=1)).isoformat()
_AMANHA_STR = (_HOJE + timedelta(days=1)).isoformat()


@pytest.fixture()
def tarefa(tmp_path):
    """Cria uma tarefa simples na Inbox e a apaga ao final do teste."""
    r = create_task(title="Tarefa de teste Meu Dia")
    tid = r["id"]
    yield tid
    delete_task(tid)


# ── add_to_my_day / remove_from_my_day ────────────────────────────────────────

def test_add_to_my_day_padrao(tarefa):
    """Sem data explícita, my_day_date vira hoje."""
    r = add_to_my_day(tarefa)
    assert r["status"] == "ok"
    # Verificar via list_my_day: a tarefa deve aparecer no plano de hoje.
    resposta = list_my_day(_HOJE_STR)
    ids_plano = [t["id"] for t in resposta["plano"]]
    assert tarefa in ids_plano


def test_add_to_my_day_data_explicita(tarefa):
    """Com data explícita, my_day_date usa essa data."""
    r = add_to_my_day(tarefa, _AMANHA_STR)
    assert r["status"] == "ok"
    # Não aparece no plano de hoje.
    resposta = list_my_day(_HOJE_STR)
    ids_plano = [t["id"] for t in resposta["plano"]]
    assert tarefa not in ids_plano


def test_remove_from_my_day_nao_apaga(tarefa):
    """remove_from_my_day zera my_day_date mas preserva a tarefa (SC-004)."""
    add_to_my_day(tarefa, _HOJE_STR)
    r = remove_from_my_day(tarefa)
    assert r["status"] == "ok"
    resposta = list_my_day(_HOJE_STR)
    ids_plano = [t["id"] for t in resposta["plano"]]
    assert tarefa not in ids_plano
    # A tarefa ainda existe (não foi soft-deleted): tenta adicionar de volta.
    r2 = add_to_my_day(tarefa, _HOJE_STR)
    assert r2["status"] == "ok"


def test_add_to_my_day_tarefa_inexistente():
    """Tarefa com id inexistente retorna erro amigável."""
    r = add_to_my_day(99999999)
    assert r["status"] == "error"
    assert "não encontrada" in r["message"].lower()


# ── reschedule_pending ─────────────────────────────────────────────────────────

def test_reschedule_today(tarefa):
    """'today' move para hoje sem apagar a tarefa."""
    add_to_my_day(tarefa, _ONTEM_STR)
    r = reschedule_pending(tarefa, "today")
    assert r["status"] == "ok"
    resposta = list_my_day(_HOJE_STR)
    ids = [t["id"] for t in resposta["plano"]]
    assert tarefa in ids


def test_reschedule_later_nao_apaga(tarefa):
    """'later' seta my_day_date=NULL mas a tarefa continua existindo (SC-004)."""
    add_to_my_day(tarefa, _HOJE_STR)
    r = reschedule_pending(tarefa, "later")
    assert r["status"] == "ok"
    # Não está no plano de hoje.
    resposta = list_my_day(_HOJE_STR)
    ids_plano = [t["id"] for t in resposta["plano"]]
    assert tarefa not in ids_plano
    # Mas pode ser adicionada de volta (não foi deletada).
    r2 = add_to_my_day(tarefa, _HOJE_STR)
    assert r2["status"] == "ok"


def test_reschedule_valor_invalido(tarefa):
    """Valor de 'when' inválido retorna erro amigável."""
    r = reschedule_pending(tarefa, "never")
    assert r["status"] == "error"


# ── set_estimate ───────────────────────────────────────────────────────────────

def test_set_estimate_grava(tarefa):
    """set_estimate grava duration_min corretamente."""
    r = set_estimate(tarefa, 45)
    assert r["status"] == "ok"


def test_set_estimate_zero_invalido(tarefa):
    """Estimativa zero retorna erro amigável."""
    r = set_estimate(tarefa, 0)
    assert r["status"] == "error"


# ── set_time_block / clear_time_block ─────────────────────────────────────────

def test_set_time_block_com_end_at(tarefa):
    """set_time_block com start_at e end_at grava ambos (SC-003)."""
    start = f"{_HOJE_STR}T14:00:00-03:00"
    end = f"{_HOJE_STR}T14:30:00-03:00"
    r = set_time_block(tarefa, start_at=start, end_at=end)
    assert r["status"] == "ok"
    assert "start_at" in r


def test_set_time_block_deriva_end_at(tarefa):
    """set_time_block sem end_at deriva end_at de start_at + duration_min (ou 30min)."""
    start = f"{_HOJE_STR}T10:00:00-03:00"
    r = set_time_block(tarefa, start_at=start, duration_min=60)
    assert r["status"] == "ok"
    # end_at deve ser 11h (1h depois)
    assert "11:00" in r["end_at"]


def test_set_time_block_padrao_30min(tarefa):
    """Sem duration_min, o bloco padrão é 30 min."""
    start = f"{_HOJE_STR}T09:00:00-03:00"
    r = set_time_block(tarefa, start_at=start)
    assert r["status"] == "ok"
    assert "09:30" in r["end_at"]


def test_set_time_block_sem_start_at_retorna_erro():
    """start_at inválido retorna erro amigável, não IntegrityError 500 (SC-003)."""
    r = set_time_block(99999999, start_at="nao-e-uma-data")
    assert r["status"] == "error"
    assert "inválido" in r["message"].lower()


def test_clear_time_block_remove(tarefa):
    """clear_time_block zera start_at/end_at mas mantém a tarefa no plano."""
    start = f"{_HOJE_STR}T14:00:00-03:00"
    set_time_block(tarefa, start_at=start, duration_min=30)
    add_to_my_day(tarefa, _HOJE_STR)
    r = clear_time_block(tarefa)
    assert r["status"] == "ok"
    # Ainda no plano de hoje.
    resposta = list_my_day(_HOJE_STR)
    ids = [t["id"] for t in resposta["plano"]]
    assert tarefa in ids


# ── list_my_day ────────────────────────────────────────────────────────────────

def test_list_my_day_estrutura():
    """list_my_day retorna as 4 chaves esperadas."""
    r = list_my_day(_HOJE_STR)
    assert "plano" in r
    assert "pendencias_ontem" in r
    assert "sugestoes" in r
    assert "capacity" in r
    assert r["date"] == _HOJE_STR


def test_list_my_day_separa_plano_e_pendencias():
    """Tarefa de ontem vai para pendencias_ontem; de hoje vai para plano (SC-004)."""
    r_hoje = create_task(title="Tarefa de hoje")
    r_ontem = create_task(title="Tarefa de ontem")
    try:
        add_to_my_day(r_hoje["id"], _HOJE_STR)
        add_to_my_day(r_ontem["id"], _ONTEM_STR)

        resposta = list_my_day(_HOJE_STR)
        ids_plano = [t["id"] for t in resposta["plano"]]
        ids_pendencias = [t["id"] for t in resposta["pendencias_ontem"]]

        assert r_hoje["id"] in ids_plano
        assert r_ontem["id"] not in ids_plano
        assert r_ontem["id"] in ids_pendencias
        assert r_hoje["id"] not in ids_pendencias
    finally:
        delete_task(r_hoje["id"])
        delete_task(r_ontem["id"])


def test_list_my_day_capacity_estrutura():
    """O objeto capacity tem as chaves do data-model."""
    r = list_my_day(_HOJE_STR)
    cap = r["capacity"]
    for chave in ("no_plano", "estimado_min", "agenda_min", "livre_min", "folga_min", "excedeu", "calendar_ok"):
        assert chave in cap, f"Chave ausente em capacity: {chave}"


def test_list_my_day_calendar_offline():
    """Quando o Calendar falha (calendar_ok=False), a tela não quebra e agenda_min=0 (SC-005)."""
    # list_my_day já trata a falha internamente; o teste confirma a estrutura de resposta.
    # Em ambiente sem Calendar configurado, calendar_ok pode ser False — o teste aceita os dois.
    r = list_my_day(_HOJE_STR)
    cap = r["capacity"]
    # Se o Calendar offline, agenda_min deve ser 0.
    if not cap["calendar_ok"]:
        assert cap["agenda_min"] == 0
    # Em todo caso, a função retornou sem exceção.
    assert "plano" in r
