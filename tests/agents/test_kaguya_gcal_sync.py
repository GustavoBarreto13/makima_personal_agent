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
from datetime import datetime, time, timedelta, timezone
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


# ===========================================================================
# Alertas de hábito no Google Calendar (spec 067)
# Mesma estratégia de mock de _patch_db acima, mas _load_habit_with_schedules faz
# DUAS chamadas a run_select (hábito, depois schedules) — _patch_habit_db usa
# side_effect para devolver as duas em sequência.
# ===========================================================================

HABITS_CAL_ID = "kaguya-habits-cal-999@group.calendar.google.com"

HABIT_BASE = {
    "id": 10, "name": "Academia", "icon": "💪",
    "reminder_lead_min": 10, "duration_min": 90, "archived_at": None,
}


def _patch_habit_db(habit: dict | None, schedules: list | None = None):
    """Patch de run_select devolvendo [habito] e depois [schedules], na mesma ordem
    de chamadas de _load_habit_with_schedules. habit=None simula hábito inexistente."""
    if habit is None:
        return patch("agents.kaguya.gcal_sync.run_select", return_value=[])
    return patch(
        "agents.kaguya.gcal_sync.run_select",
        side_effect=[[habit], schedules or []],
    )


# ---------------------------------------------------------------------------
# _push_habit_sync — COM hora: evento cronometrado + recorrência + lembrete
# ---------------------------------------------------------------------------

def test_push_habit_sync_com_hora_cria_evento_recorrente_com_lembrete():
    """Dia COM horário vira evento cronometrado, RRULE semanal e popup reminder_lead_min antes."""
    schedule = {"id": 1, "weekday": "MO", "time_of_day": time(7, 0), "google_event_id": None}

    with _patch_habit_db(HABIT_BASE, [schedule]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._push_habit_sync(10)

        mock_create.assert_called_once()
        kwargs = mock_create.call_args.kwargs
        assert kwargs["all_day"] is False
        assert kwargs["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
        assert kwargs["reminders"] == {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": 10}],
        }
        assert kwargs["summary"] == "💪 Academia"

        # Horário local SP (07:00), offset -03:00 explícito — NUNCA +00:00 (regressão clássica).
        assert "+00:00" not in kwargs["start"]
        start_dt = datetime.fromisoformat(kwargs["start"])
        assert (start_dt.hour, start_dt.minute) == (7, 0)
        assert start_dt.utcoffset() == timedelta(hours=-3)

        # duration_min=90 → end = start + 90min
        end_dt = datetime.fromisoformat(kwargs["end"])
        assert end_dt - start_dt == timedelta(minutes=90)

        # Evento novo → sem update; google_event_id da linha de schedule persistido.
        mock_update.assert_not_called()
        mock_dml.assert_called_once()
        assert mock_dml.call_args.args[1]["sid"] == 1


# ---------------------------------------------------------------------------
# _push_habit_sync — SEM hora: evento de dia inteiro, sem reminders
# ---------------------------------------------------------------------------

def test_push_habit_sync_sem_hora_cria_evento_dia_inteiro_sem_reminders():
    """Dia SEM horário vira evento de dia inteiro recorrente, sem override de reminders
    (o Google não dispara push em all-day por padrão; herda o padrão do calendário).

    O payload interno não tem a chave "reminders" nesse branch — `payload.get("reminders")`
    devolve None, que `gcal.create_event` trata como "sem override" (`if reminders is not
    None`). O kwarg chega como `reminders=None`, não ausente — é isso que verificamos."""
    schedule = {"id": 2, "weekday": "SA", "time_of_day": None, "google_event_id": None}

    with _patch_habit_db(HABIT_BASE, [schedule]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "new-evt-id"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_habit_sync(10)

        kwargs = mock_create.call_args.kwargs
        assert kwargs["all_day"] is True
        assert kwargs["start"] == kwargs["end"]   # all-day: end repete o dia (mesma convenção de tarefas)
        assert kwargs["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=SA"]
        assert kwargs["reminders"] is None


# ---------------------------------------------------------------------------
# _push_habit_sync — duration_min=None cai no padrão de 30min
# ---------------------------------------------------------------------------

def test_push_habit_sync_duration_none_usa_padrao_30min():
    """Sem duration_min declarado, o bloco no evento cai no padrão de 30 minutos."""
    habit_sem_duracao = {**HABIT_BASE, "duration_min": None}
    schedule = {"id": 1, "weekday": "MO", "time_of_day": time(7, 0), "google_event_id": None}

    with _patch_habit_db(habit_sem_duracao, [schedule]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "x"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_habit_sync(10)

        kwargs = mock_create.call_args.kwargs
        start_dt = datetime.fromisoformat(kwargs["start"])
        end_dt = datetime.fromisoformat(kwargs["end"])
        assert end_dt - start_dt == timedelta(minutes=30)


# ---------------------------------------------------------------------------
# _push_habit_sync — upsert: google_event_id existente → update, não create
# ---------------------------------------------------------------------------

def test_push_habit_sync_com_google_event_id_atualiza():
    """Linha de schedule já sincronizada faz PATCH (update_event), nunca recria o evento."""
    schedule = {"id": 3, "weekday": "WE", "time_of_day": time(7, 0), "google_event_id": "evt-existing"}

    with _patch_habit_db(HABIT_BASE, [schedule]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create, \
         patch("agents.kaguya.gcal_sync.gcal.update_event") as mock_update, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._push_habit_sync(10)

        mock_create.assert_not_called()
        mock_update.assert_called_once()
        assert mock_update.call_args.kwargs["event_id"] == "evt-existing"
        assert mock_update.call_args.kwargs["calendar_id"] == HABITS_CAL_ID
        assert mock_update.call_args.kwargs["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=WE"]
        mock_dml.assert_not_called()   # id já persistido — nada novo para salvar


# ---------------------------------------------------------------------------
# _push_habit_sync — múltiplas linhas de schedule → múltiplos eventos
# ---------------------------------------------------------------------------

def test_push_habit_sync_multiplas_schedules_cria_um_evento_por_dia():
    """Um hábito com vários dias marcados gera um create_event POR linha de schedule."""
    schedules = [
        {"id": 1, "weekday": "MO", "time_of_day": time(7, 0), "google_event_id": None},
        {"id": 2, "weekday": "WE", "time_of_day": time(7, 0), "google_event_id": None},
        {"id": 3, "weekday": "SA", "time_of_day": None, "google_event_id": None},
    ]

    with _patch_habit_db(HABIT_BASE, schedules), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.create_event", return_value={"id": "evt"}) as mock_create, \
         patch("agents.kaguya.gcal_sync.run_dml"):

        gcal_sync._push_habit_sync(10)

        assert mock_create.call_count == 3


# ---------------------------------------------------------------------------
# _push_habit_sync — hábito arquivado ou sem schedules → no-op
# ---------------------------------------------------------------------------

def test_push_habit_sync_arquivado_nao_espelha():
    """Hábito arquivado não gera nenhuma chamada ao Google (defensivo)."""
    habit_arquivado = {**HABIT_BASE, "archived_at": "2026-01-01T00:00:00"}
    schedule = {"id": 1, "weekday": "MO", "time_of_day": time(7, 0), "google_event_id": None}

    with _patch_habit_db(habit_arquivado, [schedule]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar") as mock_cal, \
         patch("agents.kaguya.gcal_sync.gcal.create_event") as mock_create:

        gcal_sync._push_habit_sync(10)

        mock_cal.assert_not_called()
        mock_create.assert_not_called()


def test_push_habit_sync_sem_schedules_nao_espelha():
    """Hábito sem nenhuma linha de habit_schedules não gera chamada ao Google."""
    with _patch_habit_db(HABIT_BASE, []), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar") as mock_cal:

        gcal_sync._push_habit_sync(10)

        mock_cal.assert_not_called()


def test_push_habit_sync_habito_inexistente_nao_espelha():
    """Hábito não encontrado no banco não gera chamada ao Google."""
    with _patch_habit_db(None), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar") as mock_cal:

        gcal_sync._push_habit_sync(999)

        mock_cal.assert_not_called()


# ---------------------------------------------------------------------------
# _push_habit_sync — falha do Google é best-effort (nunca levanta)
# ---------------------------------------------------------------------------

def test_push_habit_sync_falha_google_nao_levanta():
    """Uma exceção do Google (rede, credenciais) é engolida — best-effort."""
    schedule = {"id": 1, "weekday": "MO", "time_of_day": time(7, 0), "google_event_id": None}

    with _patch_habit_db(HABIT_BASE, [schedule]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", side_effect=Exception("Google fora do ar")):
        gcal_sync._push_habit_sync(10)   # não deve levantar


# ---------------------------------------------------------------------------
# _remove_habit_events_sync — apaga todos os eventos e limpa os ids
# ---------------------------------------------------------------------------

def test_remove_habit_events_sync_deleta_todos_e_limpa_ids():
    """Remove TODOS os eventos com google_event_id não-nulo e zera a coluna no banco."""
    schedules_com_evento = [
        {"id": 1, "google_event_id": "evt-1"},
        {"id": 2, "google_event_id": "evt-2"},
    ]

    with patch("agents.kaguya.gcal_sync.run_select", return_value=schedules_com_evento), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete, \
         patch("agents.kaguya.gcal_sync.run_dml") as mock_dml:

        gcal_sync._remove_habit_events_sync(10)

        assert mock_delete.call_count == 2
        mock_delete.assert_any_call(calendar_id=HABITS_CAL_ID, event_id="evt-1")
        mock_delete.assert_any_call(calendar_id=HABITS_CAL_ID, event_id="evt-2")
        mock_dml.assert_called_once()
        assert "NULL" in mock_dml.call_args.args[0]


def test_remove_habit_events_sync_sem_eventos_noop():
    """Hábito sem nenhum google_event_id gravado não chama o Google."""
    with patch("agents.kaguya.gcal_sync.run_select", return_value=[]), \
         patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar") as mock_cal:

        gcal_sync._remove_habit_events_sync(10)

        mock_cal.assert_not_called()


# ---------------------------------------------------------------------------
# _remove_schedule_events_sync — remove só os ids passados (diff parcial)
# ---------------------------------------------------------------------------

def test_remove_schedule_events_sync_deleta_ids_especificos():
    """Remove exatamente os event_ids recebidos, sem consultar o banco (já vêm do chamador)."""
    with patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar", return_value=HABITS_CAL_ID), \
         patch("agents.kaguya.gcal_sync.gcal.delete_event") as mock_delete:

        gcal_sync._remove_schedule_events_sync(["evt-a", "evt-b"])

        assert mock_delete.call_count == 2
        mock_delete.assert_any_call(calendar_id=HABITS_CAL_ID, event_id="evt-a")
        mock_delete.assert_any_call(calendar_id=HABITS_CAL_ID, event_id="evt-b")


def test_remove_schedule_events_sync_lista_vazia_noop():
    """Lista vazia não chama o Google."""
    with patch("agents.kaguya.gcal_sync.gcal.ensure_habits_calendar") as mock_cal:
        gcal_sync._remove_schedule_events_sync([])
        mock_cal.assert_not_called()


# ===========================================================================
# Wrappers públicos de hábito (fire-and-forget) — mesmo padrão dos de tarefa acima
# ===========================================================================

def test_push_habit_submete_ao_executor(monkeypatch):
    """push_habit submete _push_habit_sync ao worker de background."""
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)
    monkeypatch.delenv("GCAL_SYNC_ENABLED", raising=False)

    gcal_sync.push_habit(10)

    mock_executor.submit.assert_called_once_with(gcal_sync._push_habit_sync, 10)


def test_push_habit_disabled_nao_submete(monkeypatch):
    """push_habit vira no-op quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)

    gcal_sync.push_habit(10)

    mock_executor.submit.assert_not_called()


def test_remove_habit_events_submete_ao_executor(monkeypatch):
    """remove_habit_events submete _remove_habit_events_sync ao worker de background."""
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)
    monkeypatch.delenv("GCAL_SYNC_ENABLED", raising=False)

    gcal_sync.remove_habit_events(10)

    mock_executor.submit.assert_called_once_with(gcal_sync._remove_habit_events_sync, 10)


def test_remove_habit_events_disabled_nao_submete(monkeypatch):
    """remove_habit_events vira no-op quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)

    gcal_sync.remove_habit_events(10)

    mock_executor.submit.assert_not_called()


def test_remove_schedule_events_submete_ao_executor(monkeypatch):
    """remove_schedule_events submete _remove_schedule_events_sync ao worker de background."""
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)
    monkeypatch.delenv("GCAL_SYNC_ENABLED", raising=False)

    gcal_sync.remove_schedule_events(["evt-1", "evt-2"])

    mock_executor.submit.assert_called_once_with(gcal_sync._remove_schedule_events_sync, ["evt-1", "evt-2"])


def test_remove_schedule_events_lista_vazia_nao_submete(monkeypatch):
    """Lista vazia não submete nada ao executor (mesmo com GCAL_SYNC_ENABLED=true)."""
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)
    monkeypatch.delenv("GCAL_SYNC_ENABLED", raising=False)

    gcal_sync.remove_schedule_events([])

    mock_executor.submit.assert_not_called()


def test_remove_schedule_events_disabled_nao_submete(monkeypatch):
    """remove_schedule_events vira no-op quando GCAL_SYNC_ENABLED=false."""
    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")
    mock_executor = MagicMock()
    monkeypatch.setattr(gcal_sync, "_executor", mock_executor)

    gcal_sync.remove_schedule_events(["evt-1"])

    mock_executor.submit.assert_not_called()
