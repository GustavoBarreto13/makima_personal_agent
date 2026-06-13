"""Testes de unidade para agents/kaguya/gcal_sync.py (SC-004).

Todos os testes mockam `gcal.create_event`, `gcal.update_event`,
`gcal.delete_event` e `gcal.ensure_kaguya_calendar`, além de
`run_select` e `run_dml` do agents.db — nenhuma chamada real de rede.
"""

import sys
import types
import pytest
from unittest.mock import patch, MagicMock

# Stub das bibliotecas Google ausentes no ambiente de testes (sem google-auth instalado).
# O stub precisa ser inserido em sys.modules ANTES de importar gcal_sync / gcal.
def _stub_google():
    """Cria stubs mínimos das bibliotecas Google no sys.modules."""
    # google namespace
    google = types.ModuleType("google")
    sys.modules.setdefault("google", google)

    # google.oauth2
    oauth2 = types.ModuleType("google.oauth2")
    google.oauth2 = oauth2
    sys.modules.setdefault("google.oauth2", oauth2)

    # google.oauth2.credentials — Credentials é só uma classe usada como type hint
    creds_mod = types.ModuleType("google.oauth2.credentials")
    creds_mod.Credentials = MagicMock()
    oauth2.credentials = creds_mod
    sys.modules.setdefault("google.oauth2.credentials", creds_mod)

    # google.auth.transport.requests — Request é usado para renovar token
    transport_mod = types.ModuleType("google.auth")
    sys.modules.setdefault("google.auth", transport_mod)
    transport_req = types.ModuleType("google.auth.transport")
    sys.modules.setdefault("google.auth.transport", transport_req)
    transport_requests = types.ModuleType("google.auth.transport.requests")
    transport_requests.Request = MagicMock()
    sys.modules.setdefault("google.auth.transport.requests", transport_requests)

    # googleapiclient.discovery — build é usado para criar o cliente
    apiclient = types.ModuleType("googleapiclient")
    sys.modules.setdefault("googleapiclient", apiclient)
    discovery = types.ModuleType("googleapiclient.discovery")
    discovery.build = MagicMock()
    apiclient.discovery = discovery
    sys.modules.setdefault("googleapiclient.discovery", discovery)


_stub_google()

# Agora é seguro importar o módulo sob teste
from agents.kaguya import gcal_sync


# ---------------------------------------------------------------------------
# Constantes compartilhadas nos testes
# ---------------------------------------------------------------------------

KAGUYA_CAL_ID = "kaguya-cal-999@group.calendar.google.com"
GOOGLE_EVENT_ID = "google-evt-abc123"

# Tarefa timed (com time-blocking — start_at presente)
TASK_TIMED = {
    "id": 1,
    "title": "Reunião importante",
    "due_date": "2026-06-15",
    "start_at": "2026-06-15T14:00:00",
    "end_at": "2026-06-15T15:00:00",
    "completed_at": None,
    "google_event_id": None,
    "deleted_at": None,
}

# Tarefa all-day (só due_date, sem start_at)
TASK_ALL_DAY = {
    "id": 2,
    "title": "Entrega do relatório",
    "due_date": "2026-06-20",
    "start_at": None,
    "end_at": None,
    "completed_at": None,
    "google_event_id": None,
    "deleted_at": None,
}

# Tarefa já espelhada (google_event_id preenchido)
TASK_WITH_EVENT = {
    **TASK_TIMED,
    "id": 3,
    "google_event_id": GOOGLE_EVENT_ID,
}

# Tarefa concluída
TASK_COMPLETED = {
    **TASK_ALL_DAY,
    "id": 4,
    "title": "Tarefa concluída",
    "completed_at": "2026-06-20T18:00:00",
    "google_event_id": GOOGLE_EVENT_ID,
}

# Tarefa sem data (não deve ser espelhada)
TASK_NO_DATE = {
    "id": 5,
    "title": "Ideia solta",
    "due_date": None,
    "start_at": None,
    "end_at": None,
    "completed_at": None,
    "google_event_id": None,
    "deleted_at": None,
}

# Tarefa recorrente: só a linha viva deve ser espelhada (mesma estrutura — testes verificam
# que push_task opera sobre os campos da tarefa, não sobre a regra de recorrência).
TASK_RECURRENT = {
    **TASK_ALL_DAY,
    "id": 6,
    "title": "Academia",
}


# ---------------------------------------------------------------------------
# Helpers de patch
# ---------------------------------------------------------------------------

def _patch_db(task: dict | None):
    """Retorna um contextmanager que mocka run_select para devolver `task`."""
    return patch(
        "agents.kaguya.gcal_sync.run_select",
        return_value=[task] if task is not None else [],
    )


def _patch_gcal(create_ret=None, update_ret=None, delete_ret=None):
    """Retorna patches para gcal.ensure_kaguya_calendar + create/update/delete."""
    if create_ret is None:
        create_ret = {"id": "new-evt-id", "summary": "", "link": ""}
    if update_ret is None:
        update_ret = {}
    if delete_ret is None:
        delete_ret = {"status": "deleted", "event_id": ""}
    return (
        patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID),
        patch("agents.kaguya.gcal_sync.gcal.create_event", return_value=create_ret),
        patch("agents.kaguya.gcal_sync.gcal.update_event", return_value=update_ret),
        patch("agents.kaguya.gcal_sync.gcal.delete_event", return_value=delete_ret),
    )


# ---------------------------------------------------------------------------
# T028-SC1: Mapeamento timed (start_at presente) → create_event com hora
# ---------------------------------------------------------------------------

def test_push_task_timed_cria_evento_com_hora():
    """push_task cria evento dateTime quando start_at está presente."""
    with _patch_db(TASK_TIMED), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID) as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync.push_task(1)

        # create_event deve ter sido chamado com all_day=False
        mock_create.assert_called_once()
        kwargs = mock_create.call_args.kwargs
        assert kwargs["all_day"] is False
        assert "14:00" in kwargs["start"]   # horário preservado

        # update_event NÃO deve ser chamado (evento novo)
        mock_update.assert_not_called()

        # google_event_id deve ter sido salvo no banco
        mock_dml.assert_called_once()
        assert "google_event_id" in mock_dml.call_args.args[0]


# ---------------------------------------------------------------------------
# T028-SC2: Mapeamento all-day (só due_date) → evento all-day
# ---------------------------------------------------------------------------

def test_push_task_all_day_cria_evento_dia_inteiro():
    """push_task cria evento all-day quando só due_date está presente."""
    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event"), \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync.push_task(2)

        kwargs = mock_create.call_args.kwargs
        assert kwargs["all_day"] is True
        assert kwargs["start"] == "2026-06-20"


# ---------------------------------------------------------------------------
# T028-SC3: Concluir → título com "✓ "
# ---------------------------------------------------------------------------

def test_push_task_concluida_prefixo_check():
    """push_task adiciona prefixo '✓ ' ao título quando a tarefa está concluída."""
    with _patch_db(TASK_COMPLETED), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync.push_task(4)

        # TASK_COMPLETED tem google_event_id → deve chamar update, não create
        mock_create.assert_not_called()
        mock_update.assert_called_once()
        assert mock_update.call_args.kwargs["summary"].startswith("✓ ")


# ---------------------------------------------------------------------------
# T028-SC4: Reabrir → remove prefixo "✓ "
# ---------------------------------------------------------------------------

def test_push_task_reaberta_sem_prefixo():
    """push_task não adiciona prefixo quando a tarefa está aberta."""
    task_reaberta = {**TASK_COMPLETED, "completed_at": None}

    with _patch_db(task_reaberta), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync.push_task(4)

        mock_update.assert_called_once()
        assert not mock_update.call_args.kwargs["summary"].startswith("✓ ")


# ---------------------------------------------------------------------------
# T028-SC5: Soft-delete → remove_task_event chamado; google_event_id limpo
# ---------------------------------------------------------------------------

def test_remove_task_event_deleta_e_limpa_id():
    """remove_task_event chama delete_event e limpa google_event_id no banco."""
    task_com_evento = {**TASK_ALL_DAY, "id": 7, "google_event_id": GOOGLE_EVENT_ID}

    with _patch_db(task_com_evento), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync.remove_task_event(7)

        # delete_event deve ter sido chamado com o ID correto
        mock_delete.assert_called_once_with(
            calendar_id=KAGUYA_CAL_ID,
            event_id=GOOGLE_EVENT_ID,
        )

        # google_event_id deve ter sido zerado no banco
        mock_dml.assert_called_once()
        assert "NULL" in mock_dml.call_args.args[0]


# ---------------------------------------------------------------------------
# T028-SC6: Restore → push_task chamado novamente (cria novo evento)
# ---------------------------------------------------------------------------

def test_push_task_restaurada_cria_novo_evento():
    """push_task cria novo evento quando google_event_id foi limpo pelo remove."""
    task_restaurada = {**TASK_ALL_DAY, "id": 8, "google_event_id": None}

    with _patch_db(task_restaurada), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id2"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync.push_task(8)

        # Deve criar um novo evento (google_event_id estava limpo)
        mock_create.assert_called_once()
        mock_update.assert_not_called()
        # E salvar o novo ID no banco
        mock_dml.assert_called_once()


# ---------------------------------------------------------------------------
# T028-SC7: Upsert idempotente — segunda chamada usa update_event
# ---------------------------------------------------------------------------

def test_push_task_segunda_chamada_usa_update():
    """push_task usa update_event (não cria duplicata) quando google_event_id já existe."""
    with _patch_db(TASK_WITH_EVENT), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync.push_task(3)

        # Deve chamar update com o event_id já existente
        mock_update.assert_called_once()
        assert mock_update.call_args.kwargs["event_id"] == GOOGLE_EVENT_ID

        # Não deve chamar create
        mock_create.assert_not_called()

        # Não deve chamar run_dml (google_event_id já estava salvo)
        mock_dml.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC8: Recorrente — só a linha viva é espelhada
# ---------------------------------------------------------------------------

def test_push_task_recorrente_espelha_ocorrencia_viva():
    """push_task opera sobre os campos da tarefa viva, sem gerar múltiplos eventos."""
    with _patch_db(TASK_RECURRENT), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "rec-evt"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event"), \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync.push_task(6)

        # Exatamente 1 chamada (só a ocorrência viva — nenhuma projeção futura)
        mock_create.assert_called_once()


# ---------------------------------------------------------------------------
# T028-SC9: Google falha — push_task não levanta exceção
# ---------------------------------------------------------------------------

def test_push_task_google_falha_nao_levanta():
    """push_task silencia exceções do Google — CRUD de tarefa continua funcionando."""
    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", side_effect=Exception("Google down")), \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        # NÃO deve levantar exceção
        gcal_sync.push_task(2)

        # google_event_id NÃO deve ter sido salvo (falhou antes de obter o id)
        mock_dml.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC10: GCAL_SYNC_ENABLED=false → nenhuma chamada Google
# ---------------------------------------------------------------------------

def test_push_task_disabled_nao_chama_google(monkeypatch):
    """push_task vira no-op quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")

    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create:

        gcal_sync.push_task(2)

        mock_cal.assert_not_called()
        mock_create.assert_not_called()


def test_remove_task_event_disabled_nao_chama_google(monkeypatch):
    """remove_task_event vira no-op quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")

    task_com_evento = {**TASK_ALL_DAY, "id": 9, "google_event_id": GOOGLE_EVENT_ID}

    with _patch_db(task_com_evento), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete:

        gcal_sync.remove_task_event(9)

        mock_cal.assert_not_called()
        mock_delete.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC11: remove_task_event sem google_event_id → no-op silencioso
# ---------------------------------------------------------------------------

def test_remove_task_event_sem_id_google_noop():
    """remove_task_event não faz nada quando a tarefa nunca foi espelhada."""
    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync.remove_task_event(2)

        mock_cal.assert_not_called()
        mock_delete.assert_not_called()
        mock_dml.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC12: push_task tarefa sem data → no-op
# ---------------------------------------------------------------------------

def test_push_task_sem_data_nao_espelha():
    """push_task não espelha tarefas sem due_date nem start_at."""
    with _patch_db(TASK_NO_DATE), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create:

        gcal_sync.push_task(5)

        mock_cal.assert_not_called()
        mock_create.assert_not_called()
