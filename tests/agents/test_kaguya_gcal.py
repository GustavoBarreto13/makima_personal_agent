"""Testes para agents/kaguya/gcal.py — cache de list_events (spec 067).

Achado ao implementar os alertas de hábito no Google Calendar: a tela de
Calendário do webapp e o Meu Dia/digest pedem `exclude` DIFERENTES para o
MESMO intervalo de datas (a tela mostra "Kaguya — Hábitos", o Meu Dia/digest
escondem). A chave do cache de 60s de `list_events()` não incluía `exclude` —
duas chamadas para o mesmo intervalo colidiam na mesma entrada, e uma das duas
recebia o resultado filtrado errado (stale, do outro exclude). Este arquivo
cobre só esse contrato de cache — o resto de `gcal.py` (auth, fan-out) não tem
lógica de negócio própria para testar sem uma conta Google real.
"""

import sys
import types
from unittest.mock import patch, MagicMock


# Stub das bibliotecas Google ausentes no ambiente de testes — mesmo padrão de
# test_kaguya_gcal_sync.py / test_kaguya_gcal_events_for_day.py.
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

import agents.kaguya.gcal as gcal  # noqa: E402


_CAL_AGENDA = {
    "id": "cal-agenda", "name": "Gustavo", "role": "owner",
    "is_main": True, "is_kaguya": False, "bg_color": None, "writable": True,
}
_CAL_HABITOS = {
    "id": "cal-habitos", "name": "Kaguya — Hábitos", "role": "owner",
    "is_main": False, "is_kaguya": False, "bg_color": None, "writable": True,
}


def _fake_fetch(cal, time_min, time_max):
    """Substitui _fetch_cal_events: devolve um evento cujo summary é o nome do calendário."""
    return [{"summary": cal["name"], "calendar_id": cal["id"], "calendar_name": cal["name"]}]


def _reset_cache():
    gcal._events_cache.clear()


def test_cache_key_inclui_exclude_dois_excludes_nao_colidem():
    """Dois excludes diferentes para o MESMO intervalo devolvem resultados diferentes,
    não o mesmo valor cacheado pela primeira chamada (a regressão que este teste evita)."""
    _reset_cache()
    with patch.object(gcal, "list_calendars", return_value=[_CAL_AGENDA, _CAL_HABITOS]), \
         patch.object(gcal, "_fetch_cal_events", side_effect=_fake_fetch):
        # 1ª chamada: exclude PADRÃO (sem esconder hábitos) — como a tela de Calendário.
        sem_esconder = gcal.list_events(
            "2026-06-25", "2026-06-25", exclude=("Kaguya — Tarefas", "TickTick")
        )
        # 2ª chamada: MESMO intervalo, exclude explícito escondendo hábitos — como o Meu Dia.
        escondendo = gcal.list_events(
            "2026-06-25", "2026-06-25",
            exclude=("Kaguya — Tarefas", "Kaguya — Hábitos", "TickTick"),
        )

    nomes_sem_esconder = {e["summary"] for e in sem_esconder}
    nomes_escondendo = {e["summary"] for e in escondendo}
    assert "Kaguya — Hábitos" in nomes_sem_esconder
    assert "Kaguya — Hábitos" not in nomes_escondendo


def test_mesmo_exclude_usa_cache_sem_reconsultar():
    """Duas chamadas com o MESMO (intervalo, exclude) reusam o cache — só 1 fan-out real."""
    _reset_cache()
    with patch.object(gcal, "list_calendars", return_value=[_CAL_AGENDA]) as mock_cals, \
         patch.object(gcal, "_fetch_cal_events", side_effect=_fake_fetch) as mock_fetch:
        gcal.list_events("2026-06-25", "2026-06-25", exclude=("Kaguya — Tarefas", "TickTick"))
        gcal.list_events("2026-06-25", "2026-06-25", exclude=("Kaguya — Tarefas", "TickTick"))

    # list_calendars/fetch só rodam na 1ª chamada — a 2ª veio do cache.
    assert mock_cals.call_count == 1
    assert mock_fetch.call_count == 1


def test_exclude_padrao_nao_esconde_habitos():
    """O exclude PADRÃO de list_events() não inclui 'Kaguya — Hábitos' (spec 067) —
    é a tela de Calendário do webapp que depende disso para mostrar os alertas."""
    _reset_cache()
    with patch.object(gcal, "list_calendars", return_value=[_CAL_AGENDA, _CAL_HABITOS]), \
         patch.object(gcal, "_fetch_cal_events", side_effect=_fake_fetch):
        eventos = gcal.list_events("2026-06-25", "2026-06-25")   # sem exclude explícito

    nomes = {e["summary"] for e in eventos}
    assert "Kaguya — Hábitos" in nomes
