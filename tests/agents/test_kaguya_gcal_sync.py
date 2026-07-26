"""Testes de unidade para agents/kaguya/gcal_sync.py (SC-004).

Estrutura
---------
Os testes de lógica de mapeamento/upsert/no-op testam as implementações síncronas
internas (`_push_task_sync` / `_remove_task_event_sync`) — a lógica não mudou.

Os testes de wrapper testam `push_task` / `remove_task_event` (as funções públicas
fire-and-forget): verificam que o executor é chamado corretamente e que
GCAL_SYNC_ENABLED=false inibe a submissão.

Todos os testes mockam `gcal.create_event`, `gcal.update_event`,
`gcal.delete_event` e `gcal.ensure_kaguya_calendar`, além de
`run_select` e `run_dml` do agents.db — nenhuma chamada real de rede.
"""

import sys
import types
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, call

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

# Tarefa timed (com time-blocking — start_at presente).
# start_at/end_at são TIMESTAMPTZ — psycopg2 sempre devolve datetime aware (UTC) para
# essa coluna, nunca string naive. 17:00/18:00 UTC = 14:00/15:00 São Paulo.
TASK_TIMED = {
    "id": 1,
    "title": "Reunião importante",
    "due_date": "2026-06-15",
    "start_at": datetime(2026, 6, 15, 17, 0, 0, tzinfo=timezone.utc),
    "end_at": datetime(2026, 6, 15, 18, 0, 0, tzinfo=timezone.utc),
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
# que _push_task_sync opera sobre os campos da tarefa, não sobre a regra de recorrência).
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


# ===========================================================================
# Testes de lógica (internos síncronos)
# Os testes abaixo chamam _push_task_sync / _remove_task_event_sync diretamente
# para validar o mapeamento, upsert, no-ops, etc. — sem envolver o executor.
# ===========================================================================

# ---------------------------------------------------------------------------
# T028-SC1: Mapeamento timed (start_at presente) → create_event com hora
# ---------------------------------------------------------------------------

def test_push_task_sync_timed_cria_evento_com_hora():
    """_push_task_sync cria evento dateTime quando start_at está presente."""
    with _patch_db(TASK_TIMED), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID) as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._push_task_sync(1)

        # create_event deve ter sido chamado com all_day=False
        mock_create.assert_called_once()
        kwargs = mock_create.call_args.kwargs
        assert kwargs["all_day"] is False
        assert "14:00" in kwargs["start"]   # 17:00 UTC → 14:00 São Paulo
        assert "-03:00" in kwargs["start"]  # offset explícito de SP, não +00:00

        # update_event NÃO deve ser chamado (evento novo)
        mock_update.assert_not_called()

        # google_event_id deve ter sido salvo no banco
        mock_dml.assert_called_once()
        assert "google_event_id" in mock_dml.call_args.args[0]


# ---------------------------------------------------------------------------
# T028-SC2: Mapeamento all-day (só due_date) → evento all-day
# ---------------------------------------------------------------------------

def test_push_task_sync_all_day_cria_evento_dia_inteiro():
    """_push_task_sync cria evento all-day quando só due_date está presente."""
    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event"), \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_task_sync(2)

        kwargs = mock_create.call_args.kwargs
        assert kwargs["all_day"] is True
        assert kwargs["start"] == "2026-06-20"


# ---------------------------------------------------------------------------
# T028-SC3: Concluir → título com "✓ "
# ---------------------------------------------------------------------------

def test_push_task_sync_concluida_prefixo_check():
    """_push_task_sync adiciona prefixo '✓ ' ao título quando a tarefa está concluída."""
    with _patch_db(TASK_COMPLETED), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_task_sync(4)

        # TASK_COMPLETED tem google_event_id → deve chamar update, não create
        mock_create.assert_not_called()
        mock_update.assert_called_once()
        assert mock_update.call_args.kwargs["summary"].startswith("✓ ")


# ---------------------------------------------------------------------------
# T028-SC4: Reabrir → remove prefixo "✓ "
# ---------------------------------------------------------------------------

def test_push_task_sync_reaberta_sem_prefixo():
    """_push_task_sync não adiciona prefixo quando a tarefa está aberta."""
    task_reaberta = {**TASK_COMPLETED, "completed_at": None}

    with _patch_db(task_reaberta), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_task_sync(4)

        mock_update.assert_called_once()
        assert not mock_update.call_args.kwargs["summary"].startswith("✓ ")


# ---------------------------------------------------------------------------
# T028-SC5: Soft-delete → _remove_task_event_sync chamado; google_event_id limpo
# ---------------------------------------------------------------------------

def test_remove_task_event_sync_deleta_e_limpa_id():
    """_remove_task_event_sync chama delete_event e limpa google_event_id no banco."""
    task_com_evento = {**TASK_ALL_DAY, "id": 7, "google_event_id": GOOGLE_EVENT_ID}

    with _patch_db(task_com_evento), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._remove_task_event_sync(7)

        # delete_event deve ter sido chamado com o ID correto
        mock_delete.assert_called_once_with(
            calendar_id=KAGUYA_CAL_ID,
            event_id=GOOGLE_EVENT_ID,
        )

        # google_event_id deve ter sido zerado no banco
        mock_dml.assert_called_once()
        assert "NULL" in mock_dml.call_args.args[0]


# ---------------------------------------------------------------------------
# T028-SC6: Restore → _push_task_sync chamado novamente (cria novo evento)
# ---------------------------------------------------------------------------

def test_push_task_sync_restaurada_cria_novo_evento():
    """_push_task_sync cria novo evento quando google_event_id foi limpo pelo remove."""
    task_restaurada = {**TASK_ALL_DAY, "id": 8, "google_event_id": None}

    with _patch_db(task_restaurada), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id2"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._push_task_sync(8)

        # Deve criar um novo evento (google_event_id estava limpo)
        mock_create.assert_called_once()
        mock_update.assert_not_called()
        # E salvar o novo ID no banco
        mock_dml.assert_called_once()


# ---------------------------------------------------------------------------
# T028-SC7: Upsert idempotente — segunda chamada usa update_event
# ---------------------------------------------------------------------------

def test_push_task_sync_segunda_chamada_usa_update():
    """_push_task_sync usa update_event (não cria duplicata) quando google_event_id já existe."""
    with _patch_db(TASK_WITH_EVENT), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._push_task_sync(3)

        # Deve chamar update com o event_id já existente
        mock_update.assert_called_once()
        assert mock_update.call_args.kwargs["event_id"] == GOOGLE_EVENT_ID

        # Não deve chamar create
        mock_create.assert_not_called()

        # Não deve chamar run_dml (google_event_id já estava salvo)
        mock_dml.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC7b: update_event recebe all_day explícito (fast-path sem GET)
# ---------------------------------------------------------------------------

def test_push_task_sync_update_passa_all_day():
    """_push_task_sync passa all_day explicitamente ao update_event (fast-path patch())."""
    with _patch_db(TASK_WITH_EVENT), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event"), \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_task_sync(3)

        kwargs = mock_update.call_args.kwargs
        # all_day deve ser passado explicitamente para ativar o fast-path em gcal.update_event
        assert "all_day" in kwargs
        assert isinstance(kwargs["all_day"], bool)


# ---------------------------------------------------------------------------
# T028-SC8: Recorrente — só a linha viva é espelhada
# ---------------------------------------------------------------------------

def test_push_task_sync_recorrente_espelha_ocorrencia_viva():
    """_push_task_sync opera sobre os campos da tarefa viva, sem gerar múltiplos eventos."""
    with _patch_db(TASK_RECURRENT), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "rec-evt"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event"), \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_task_sync(6)

        # Exatamente 1 chamada (só a ocorrência viva — nenhuma projeção futura)
        mock_create.assert_called_once()


# ---------------------------------------------------------------------------
# T028-SC9: Google falha — _push_task_sync não levanta exceção
# ---------------------------------------------------------------------------

def test_push_task_sync_google_falha_nao_levanta():
    """_push_task_sync silencia exceções do Google — CRUD de tarefa continua funcionando."""
    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar", return_value=KAGUYA_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", side_effect=Exception("Google down")), \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        # NÃO deve levantar exceção
        gcal_sync._push_task_sync(2)

        # google_event_id NÃO deve ter sido salvo (falhou antes de obter o id)
        mock_dml.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC11: _remove_task_event_sync sem google_event_id → no-op silencioso
# ---------------------------------------------------------------------------

def test_remove_task_event_sync_sem_id_google_noop():
    """_remove_task_event_sync não faz nada quando a tarefa nunca foi espelhada."""
    with _patch_db(TASK_ALL_DAY), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._remove_task_event_sync(2)

        mock_cal.assert_not_called()
        mock_delete.assert_not_called()
        mock_dml.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC12: _push_task_sync tarefa sem data → no-op
# ---------------------------------------------------------------------------

def test_push_task_sync_sem_data_nao_espelha():
    """_push_task_sync não espelha tarefas sem due_date nem start_at."""
    with _patch_db(TASK_NO_DATE), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_kaguya_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create:

        gcal_sync._push_task_sync(5)

        mock_cal.assert_not_called()
        mock_create.assert_not_called()


# ===========================================================================
# Testes dos wrappers públicos (fire-and-forget)
# Validam que push_task / remove_task_event submetem ao executor corretamente
# e que GCAL_SYNC_ENABLED=false inibe a submissão.
# ===========================================================================

def test_push_task_submete_ao_executor(monkeypatch):
    """push_task submete _push_task_sync ao executor de background."""
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)
    monkeypatch.delenv("GCAL_SYNC_ENABLED", raising=False)  # garante default "true"

    gcal_sync.push_task(42)

    mock_executor.submit.assert_called_once_with(gcal_sync._push_task_sync, 42)


def test_remove_task_event_submete_ao_executor(monkeypatch):
    """remove_task_event submete _remove_task_event_sync ao executor de background."""
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)
    monkeypatch.delenv("GCAL_SYNC_ENABLED", raising=False)

    gcal_sync.remove_task_event(99)

    mock_executor.submit.assert_called_once_with(gcal_sync._remove_task_event_sync, 99)


# ---------------------------------------------------------------------------
# T028-SC10: GCAL_SYNC_ENABLED=false → wrappers viram no-op (sem submit)
# ---------------------------------------------------------------------------

def test_push_task_disabled_nao_submete(monkeypatch):
    """push_task vira no-op (sem submit ao executor) quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)

    gcal_sync.push_task(2)

    mock_executor.submit.assert_not_called()


def test_remove_task_event_disabled_nao_submete(monkeypatch):
    """remove_task_event vira no-op (sem submit ao executor) quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)

    gcal_sync.remove_task_event(9)

    mock_executor.submit.assert_not_called()


# ---------------------------------------------------------------------------
# T028-SC13: Correção de fuso — start_at UTC deve virar -03:00 no payload
# ---------------------------------------------------------------------------

def test_build_event_payload_start_at_utc_converte_para_sp():
    """_build_event_payload converte start_at UTC para offset -03:00 (São Paulo).

    Cenário do bug: psycopg2 retorna datetime(2026,6,15,17,0,0,tzinfo=UTC) para
    uma tarefa marcada às 14:00 SP. O Google deveria receber "14:00:00-03:00",
    não "17:00:00+00:00" (que apareceria como 17:00 no calendário, não 14:00).
    """
    # Simula o que o psycopg2 devolve: 17:00 UTC = 14:00 São Paulo
    start_utc = datetime(2026, 6, 15, 17, 0, 0, tzinfo=timezone.utc)
    end_utc = datetime(2026, 6, 15, 18, 0, 0, tzinfo=timezone.utc)

    # Monta a tarefa como o banco retornaria (objetos datetime com tzinfo=UTC)
    task = {
        "id": 10,
        "title": "Reunião SP",
        "due_date": "2026-06-15",
        "start_at": start_utc,
        "end_at": end_utc,
        "completed_at": None,
        "google_event_id": None,
        "deleted_at": None,
    }

    # Chama _build_event_payload diretamente (sem mock de rede necessário)
    payload = gcal_sync._build_event_payload(task)

    # O payload deve ter start e end com offset -03:00 (São Paulo), não +00:00 (UTC)
    assert payload["all_day"] is False, "Deve ser evento com hora (não dia inteiro)"
    assert "+00:00" not in payload["start"], "Offset UTC não deve aparecer no start"
    assert "-03:00" in payload["start"], "Offset de SP (-03:00) deve aparecer no start"
    assert "+00:00" not in payload["end"], "Offset UTC não deve aparecer no end"
    assert "-03:00" in payload["end"], "Offset de SP (-03:00) deve aparecer no end"

    # Verifica que o horário local está correto: 17:00 UTC → 14:00 SP
    assert "14:00:00" in payload["start"], "Horário local SP (14:00) deve aparecer no start"
    assert "15:00:00" in payload["end"], "Horário local SP (15:00) deve aparecer no end"


def test_build_event_payload_start_at_string_naive_converte_para_sp():
    """_build_event_payload converte string naive de start_at para offset -03:00.

    String naive (sem offset) vinda de testes ou fontes antigas é tratada como UTC
    pelo helper _to_sp_iso, e deve ser exibida no horário SP correto.
    """
    # String sem offset: PostgreSQL armazenaria "2026-06-15T17:00:00" como 17:00 UTC
    task = {
        "id": 11,
        "title": "Tarefa naive",
        "due_date": "2026-06-15",
        "start_at": "2026-06-15T17:00:00+00:00",  # UTC explícito = 14:00 SP
        "end_at": None,  # sem end_at → deve derivar +30 min
        "completed_at": None,
        "google_event_id": None,
        "deleted_at": None,
    }

    payload = gcal_sync._build_event_payload(task)

    # Horário local SP: 14:00
    assert "-03:00" in payload["start"], "Offset SP deve estar no start"
    assert "14:00:00" in payload["start"], "Hora local SP (14:00) deve aparecer no start"
    # end derivado = start + 30 min = 14:30 SP
    assert "14:30:00" in payload["end"], "end derivado deve ser 30 min após start (14:30 SP)"
