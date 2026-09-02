"""Testes de unidade para agents/kaguya/gcal_mirror.py (spec 069).

Cobre:
- `event_id_for`: determinismo e sensibilidade a cada campo da chave.
- `_event_body`: all-day vs timed, descrição, reminders vazio.
- `reconcile_source`: diff insert/patch/delete + idempotência (2ª passada = no-op).

Tudo com o Google mockado — nenhuma chamada de rede.
"""

import sys
import types
from unittest.mock import MagicMock, patch

import pytest


# ── Stub das libs Google (ambiente de teste não tem google-auth/googleapiclient) ──
def _stub_google() -> None:
    google = types.ModuleType("google")
    sys.modules.setdefault("google", google)

    oauth2 = types.ModuleType("google.oauth2")
    google.oauth2 = oauth2
    sys.modules.setdefault("google.oauth2", oauth2)
    creds_mod = types.ModuleType("google.oauth2.credentials")
    creds_mod.Credentials = MagicMock()
    sys.modules.setdefault("google.oauth2.credentials", creds_mod)

    auth = types.ModuleType("google.auth")
    sys.modules.setdefault("google.auth", auth)
    transport = types.ModuleType("google.auth.transport")
    sys.modules.setdefault("google.auth.transport", transport)
    transport_requests = types.ModuleType("google.auth.transport.requests")
    transport_requests.Request = MagicMock()
    sys.modules.setdefault("google.auth.transport.requests", transport_requests)

    apiclient = types.ModuleType("googleapiclient")
    sys.modules.setdefault("googleapiclient", apiclient)
    discovery = types.ModuleType("googleapiclient.discovery")
    discovery.build = MagicMock()
    apiclient.discovery = discovery
    sys.modules.setdefault("googleapiclient.discovery", discovery)

    errors = types.ModuleType("googleapiclient.errors")

    class _HttpError(Exception):
        """Stub mínimo de googleapiclient.errors.HttpError (tem .resp.status)."""

        def __init__(self, status=500):
            super().__init__(f"HttpError {status}")
            self.resp = types.SimpleNamespace(status=status)

    errors.HttpError = _HttpError
    apiclient.errors = errors
    sys.modules.setdefault("googleapiclient.errors", errors)


_stub_google()

from agents.kaguya import gcal_mirror  # noqa: E402
from googleapiclient.errors import HttpError  # noqa: E402  (o stub acima)


# ─────────────────────────────────────────────────────────────────────────────
# event_id_for
# ─────────────────────────────────────────────────────────────────────────────

def _item(**over):
    base = {
        "cal": "mai",
        "kind": "series-watch",
        "ref_id": "abc-123",
        "date": "2026-09-02",
        "title": "▶️ Silo",
        "all_day": True,
    }
    base.update(over)
    return base


def test_event_id_is_deterministic_and_hex32():
    eid = gcal_mirror.event_id_for(_item())
    assert eid == gcal_mirror.event_id_for(_item())      # estável entre chamadas
    assert len(eid) == 32
    assert all(c in "0123456789abcdef" for c in eid)      # base32hex-safe


@pytest.mark.parametrize("field", ["cal", "kind", "ref_id", "date"])
def test_event_id_changes_with_each_key_field(field):
    assert gcal_mirror.event_id_for(_item()) != gcal_mirror.event_id_for(_item(**{field: "OUTRO"}))


def test_event_id_ignores_non_key_fields():
    # título/loc/deep_link não entram na chave — mudá-los não muda o id
    a = gcal_mirror.event_id_for(_item(title="X", loc="p.1", deep_link="/x"))
    b = gcal_mirror.event_id_for(_item(title="Y", loc="p.9", deep_link="/y"))
    assert a == b


# ─────────────────────────────────────────────────────────────────────────────
# _event_body
# ─────────────────────────────────────────────────────────────────────────────

def test_body_all_day_end_is_exclusive_next_day():
    body = gcal_mirror._event_body(_item(all_day=True, date="2026-09-02"))
    assert body["start"] == {"date": "2026-09-02"}
    assert body["end"] == {"date": "2026-09-03"}          # exclusivo → +1 dia
    assert body["reminders"] == {"useDefault": False, "overrides": []}
    assert body["transparency"] == "transparent"


def test_body_timed_without_end_gets_30min():
    it = _item(all_day=False, start="2026-09-02T14:00:00", end=None, kind="expense")
    body = gcal_mirror._event_body(it)
    assert body["start"]["dateTime"].startswith("2026-09-02T14:00:00")
    assert body["end"]["dateTime"].startswith("2026-09-02T14:30:00")


def test_body_description_has_loc_and_deep_link():
    body = gcal_mirror._event_body(_item(loc="T2 · ep 5–8", deep_link="/series"))
    assert "T2 · ep 5–8" in body["description"]
    assert "/series" in body["description"]


def test_body_no_description_when_no_loc_no_link():
    body = gcal_mirror._event_body(_item(loc=None, deep_link=None))
    assert "description" not in body


# ─────────────────────────────────────────────────────────────────────────────
# reconcile_source — diff
# ─────────────────────────────────────────────────────────────────────────────

class _FakeEvents:
    """Registra insert/patch/delete e simula o estado do calendário."""

    def __init__(self, existing):
        # existing: dict event_id -> {"summary","start","end"}
        self.state = dict(existing)
        self.inserted, self.patched, self.deleted = [], [], []
        self.insert_conflict_ids = set()

    def insert(self, calendarId, body):
        eid = body["id"]
        if eid in self.insert_conflict_ids:
            return _Exec(raises=HttpError(409))
        self.inserted.append(eid)
        self.state[eid] = body
        return _Exec()

    def patch(self, calendarId, eventId, body):
        self.patched.append(eventId)
        self.state.setdefault(eventId, {}).update(body)
        return _Exec()

    def delete(self, calendarId, eventId):
        self.deleted.append(eventId)
        self.state.pop(eventId, None)
        return _Exec()


class _Exec:
    def __init__(self, raises=None):
        self._raises = raises

    def execute(self):
        if self._raises:
            raise self._raises
        return {}


def _run_reconcile(items, existing_raw):
    """Roda reconcile_source("mai", ...) com provider e Google mockados."""
    fake_events = _FakeEvents({})
    svc = MagicMock()
    svc.events.return_value = fake_events

    with patch.dict(gcal_mirror.calendar_hub._PROVIDERS, {"mai": lambda s, e: items}), \
         patch.object(gcal_mirror.gcal, "ensure_mirror_calendar", return_value="cal-mai"), \
         patch.object(gcal_mirror.gcal, "list_raw_events", return_value=existing_raw), \
         patch.object(gcal_mirror.gcal, "_get_service", return_value=svc):
        result = gcal_mirror.reconcile_source("mai", "2026-01-01", "2026-12-31")
    return result, fake_events


def test_reconcile_inserts_missing():
    items = [_item(ref_id="a", date="2026-09-02"), _item(ref_id="b", date="2026-09-03")]
    result, fake = _run_reconcile(items, existing_raw=[])
    assert result["inserted"] == 2
    assert result["updated"] == 0
    assert result["deleted"] == 0
    assert len(fake.inserted) == 2


def test_reconcile_deletes_orphans():
    # nada desejado, mas o Google tem um evento nosso → deve apagar
    existing = [{"id": "deadbeef" * 4, "summary": "velho",
                 "start": {"date": "2026-09-02"}, "end": {"date": "2026-09-03"}}]
    result, fake = _run_reconcile([], existing_raw=existing)
    assert result["deleted"] == 1
    assert fake.deleted == ["deadbeef" * 4]


def test_reconcile_patches_when_summary_differs():
    it = _item(ref_id="a", date="2026-09-02", title="▶️ Novo Título")
    eid = gcal_mirror.event_id_for(it)
    existing = [{"id": eid, "summary": "▶️ Título Antigo",
                 "start": {"date": "2026-09-02"}, "end": {"date": "2026-09-03"}}]
    result, fake = _run_reconcile([it], existing_raw=existing)
    assert result["updated"] == 1
    assert result["inserted"] == 0
    assert result["deleted"] == 0
    assert fake.patched == [eid]


def test_reconcile_is_noop_when_in_sync():
    it = _item(ref_id="a", date="2026-09-02", title="▶️ Silo")
    eid = gcal_mirror.event_id_for(it)
    body = gcal_mirror._event_body(it)
    existing = [{"id": eid, "summary": body["summary"], "start": body["start"], "end": body["end"]}]
    result, fake = _run_reconcile([it], existing_raw=existing)
    assert (result["inserted"], result["updated"], result["deleted"]) == (0, 0, 0)
    assert not fake.inserted and not fake.patched and not fake.deleted


def test_reconcile_truncates_over_cap(monkeypatch):
    monkeypatch.setattr(gcal_mirror, "_MAX_EVENTS_PER_SOURCE", 3)
    items = [_item(ref_id=str(i), date=f"2026-09-{i:02d}") for i in range(1, 11)]
    result, fake = _run_reconcile(items, existing_raw=[])
    assert result["truncated"] is True
    assert result["inserted"] == 3


def test_reconcile_unknown_source_returns_error():
    assert gcal_mirror.reconcile_source("nope", "2026-01-01", "2026-12-31")["error"]


def test_reconcile_insert_409_falls_back_to_patch():
    it = _item(ref_id="a", date="2026-09-02")
    eid = gcal_mirror.event_id_for(it)
    fake_events = _FakeEvents({})
    fake_events.insert_conflict_ids = {eid}
    svc = MagicMock()
    svc.events.return_value = fake_events

    with patch.dict(gcal_mirror.calendar_hub._PROVIDERS, {"mai": lambda s, e: [it]}), \
         patch.object(gcal_mirror.gcal, "ensure_mirror_calendar", return_value="cal-mai"), \
         patch.object(gcal_mirror.gcal, "list_raw_events", return_value=[]), \
         patch.object(gcal_mirror.gcal, "_get_service", return_value=svc):
        result = gcal_mirror.reconcile_source("mai", "2026-01-01", "2026-12-31")

    assert result["inserted"] == 1          # 409 → patch de revival conta como inserido
    assert eid in fake_events.patched
