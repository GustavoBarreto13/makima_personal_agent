"""Testes para _gcal_events_for_day (agents/kaguya/tools_tasks.py).

Cobre:
- Filtro por visibilidade (pref visible=False descarta o evento)
- Separação timed vs all-day
- Cálculo correto das tuplas de minutos para capacity
- Cor do usuário (calendar_prefs) sobrepõe None
- cal_ok=False quando gcal.list_events levanta
- cal_ok=False quando get_calendar_prefs levanta
- Evento com datetime inválido não quebra (tupla ignorada, evento ainda aparece)
"""

import sys
import types
import pytest
from unittest.mock import patch, MagicMock


# Stub das bibliotecas Google ausentes no ambiente de testes (sem google-auth instalado).
# Copiado do padrão de test_kaguya_gcal_sync.py — deve ser inserido ANTES de qualquer
# import de agents.kaguya.gcal ou agents.kaguya.tools_tasks.
def _stub_google():
    google = types.ModuleType("google")
    sys.modules.setdefault("google", google)

    oauth2 = types.ModuleType("google.oauth2")
    google.oauth2 = oauth2
    sys.modules.setdefault("google.oauth2", oauth2)

    creds_mod = types.ModuleType("google.oauth2.credentials")
    creds_mod.Credentials = MagicMock()
    oauth2.credentials = creds_mod
    sys.modules.setdefault("google.oauth2.credentials", creds_mod)

    transport_mod = types.ModuleType("google.auth")
    sys.modules.setdefault("google.auth", transport_mod)
    transport_req = types.ModuleType("google.auth.transport")
    sys.modules.setdefault("google.auth.transport", transport_req)
    transport_requests = types.ModuleType("google.auth.transport.requests")
    transport_requests.Request = MagicMock()
    sys.modules.setdefault("google.auth.transport.requests", transport_requests)

    apiclient = types.ModuleType("googleapiclient")
    sys.modules.setdefault("googleapiclient", apiclient)
    discovery = types.ModuleType("googleapiclient.discovery")
    discovery.build = MagicMock()
    apiclient.discovery = discovery
    sys.modules.setdefault("googleapiclient.discovery", discovery)


_stub_google()

# Agora é seguro importar os módulos sob teste
import agents.kaguya.gcal           # noqa: F401  (registra o módulo para patch())
import agents.kaguya.calendar_prefs  # noqa: F401


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_event(
    ev_id: str = "ev1",
    summary: str = "Reunião",
    start: str = "2026-06-25T09:00:00-03:00",
    end: str = "2026-06-25T10:00:00-03:00",
    calendar_id: str = "cal_primary",
    calendar_name: str = "Gustavo",
) -> dict:
    """Evento no formato devolvido por gcal.list_events (após _to_brt)."""
    return {
        "id": ev_id,
        "summary": summary,
        "start": start,
        "end": end,
        "calendar_id": calendar_id,
        "calendar_name": calendar_name,
        "description": "",
        "location": "",
        "attendees": [],
        "link": "",
    }


def _make_allday_event(
    ev_id: str = "ev_ad",
    summary: str = "Aniversário",
    start: str = "2026-06-25",
    end: str = "2026-06-26",
    calendar_id: str = "cal_primary",
    calendar_name: str = "Gustavo",
) -> dict:
    """Evento de dia inteiro (sem 'T' no start)."""
    return {
        "id": ev_id,
        "summary": summary,
        "start": start,
        "end": end,
        "calendar_id": calendar_id,
        "calendar_name": calendar_name,
        "description": "",
        "location": "",
        "attendees": [],
        "link": "",
    }


# ---------------------------------------------------------------------------
# Importação lazy do alvo (após mocks estarem no lugar)
# ---------------------------------------------------------------------------

def _import_target():
    from agents.kaguya.tools_tasks import _gcal_events_for_day
    return _gcal_events_for_day


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

class TestGcalEventsForDay:

    def test_evento_timed_retorna_serial_e_tupla(self, monkeypatch):
        """Evento timed → entra em serial E em tuplas."""
        ev = _make_event()
        monkeypatch.setattr(
            "agents.kaguya.tools_tasks._gcal_events_for_day.__wrapped__",
            None, raising=False,
        )
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]) as mock_gcal, \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert cal_ok is True
        assert len(serial) == 1
        assert serial[0]["id"] == "ev1"
        assert serial[0]["title"] == "Reunião"
        assert serial[0]["all_day"] is False
        assert serial[0]["start"] == "2026-06-25T09:00:00-03:00"
        assert serial[0]["color"] is None   # sem pref → None

        # 09:00 = 540 min, 10:00 = 600 min
        assert len(tuplas) == 1
        assert tuplas[0] == (540, 600)

    def test_evento_allday_nao_gera_tupla(self, monkeypatch):
        """Evento de dia inteiro → serial com all_day=True, tuplas vazia."""
        ev = _make_allday_event()
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert cal_ok is True
        assert len(serial) == 1
        assert serial[0]["all_day"] is True
        assert serial[0]["start"] is None
        assert serial[0]["end"] is None
        assert len(tuplas) == 0

    def test_evento_de_calendario_invisivel_descartado(self, monkeypatch):
        """Pref visible=False → evento não entra em serial nem tuplas."""
        ev = _make_event()
        prefs = [{"calendar_id": "gcal:cal_primary", "visible": False, "color": None}]
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=prefs):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert cal_ok is True
        assert serial == []
        assert tuplas == []

    def test_evento_de_calendario_visivel_aparece(self, monkeypatch):
        """Pref visible=True → evento aparece normalmente."""
        ev = _make_event()
        prefs = [{"calendar_id": "gcal:cal_primary", "visible": True, "color": "#FF0000"}]
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=prefs):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert len(serial) == 1
        assert serial[0]["color"] == "#FF0000"   # cor do usuário aplicada

    def test_sem_pref_assume_visivel(self, monkeypatch):
        """Calendário sem entrada em calendar_prefs → visível por padrão."""
        ev = _make_event()
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert len(serial) == 1   # sem pref → visible=True por padrão

    def test_gcal_levanta_retorna_vazio_e_cal_ok_false(self, monkeypatch):
        """gcal.list_events levanta → ([], [], False)."""
        with patch("agents.kaguya.gcal.list_events", side_effect=Exception("timeout")), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert serial == []
        assert tuplas == []
        assert cal_ok is False

    def test_get_calendar_prefs_levanta_retorna_vazio_e_cal_ok_false(self, monkeypatch):
        """get_calendar_prefs levanta → ([], [], False)."""
        ev = _make_event()
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", side_effect=Exception("db")):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert serial == []
        assert tuplas == []
        assert cal_ok is False

    def test_evento_com_datetime_invalido_nao_quebra(self, monkeypatch):
        """Evento com start mal-formado → serial inclui o evento, tuplas pula."""
        ev = _make_event(start="INVALID", end="ALSO_INVALID")
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        # Evento aparece no serial (all_day=False porque não tem 'T')
        assert len(serial) == 1
        # Mas a tupla de minutos é pulada (ValueError no fromisoformat)
        assert tuplas == []
        assert cal_ok is True

    def test_mistura_timed_e_allday(self, monkeypatch):
        """Timed e all-day juntos → separados corretamente."""
        ev_timed = _make_event()
        ev_allday = _make_allday_event()
        with patch("agents.kaguya.gcal.list_events", return_value=[ev_timed, ev_allday]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            serial, tuplas, cal_ok = fn("2026-06-25")

        assert cal_ok is True
        assert len(serial) == 2
        timed_items = [e for e in serial if not e["all_day"]]
        allday_items = [e for e in serial if e["all_day"]]
        assert len(timed_items) == 1
        assert len(allday_items) == 1
        assert len(tuplas) == 1   # só timed gera tupla

    def test_tuplas_minutos_corretos(self, monkeypatch):
        """Verifica minutos: 14:30 = 870, 15:45 = 945."""
        ev = _make_event(
            start="2026-06-25T14:30:00-03:00",
            end="2026-06-25T15:45:00-03:00",
        )
        with patch("agents.kaguya.gcal.list_events", return_value=[ev]), \
             patch("agents.kaguya.calendar_prefs.get_calendar_prefs", return_value=[]):
            fn = _import_target()
            _, tuplas, cal_ok = fn("2026-06-25")

        assert cal_ok is True
        assert len(tuplas) == 1
        assert tuplas[0] == (870, 945)   # 14*60+30=870, 15*60+45=945
