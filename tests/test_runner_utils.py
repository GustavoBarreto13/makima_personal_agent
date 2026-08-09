"""Testes de coordinator/runner_utils.py — lógica de consumo de eventos do ADK.

Extraída de coordinator/main.py na spec 064 (Etapa E2) para ser reaproveitada pela
ponte legada MCP (mcp_servers/makima/legacy.py). Os testes usam um Runner falso (sem
ADK real, sem rede) para validar o comportamento observável: acumulação de texto por
autor, fallback para eventos não-finais, contagem de tokens e retry em
SessionNotFoundError.

Roda as coroutines com asyncio.run() em vez de pytest-asyncio — o repo não usa esse
plugin em nenhum outro teste; evita adicionar uma dependência de teste nova só para isto.
"""

import asyncio

import pytest

from google.adk.errors.session_not_found_error import SessionNotFoundError

from coordinator.runner_utils import ensure_session, run_and_collect_text


class _FakePart:
    def __init__(self, text=None, function_call=None, function_response=None):
        self.text = text
        self.function_call = function_call
        self.function_response = function_response


class _FakeContent:
    def __init__(self, parts):
        self.parts = parts


class _FakeUsage:
    def __init__(self, total_token_count):
        self.total_token_count = total_token_count


class _FakeEvent:
    def __init__(self, author, parts=None, final=False, usage=None):
        self.author = author
        self.content = _FakeContent(parts) if parts else None
        self._final = final
        self.usage_metadata = usage

    def is_final_response(self):
        return self._final


class _FakeSessionService:
    def __init__(self, existing_session=None):
        self._existing_session = existing_session
        self.created = []

    async def get_session(self, app_name, user_id, session_id):
        return self._existing_session

    async def create_session(self, app_name, user_id, session_id):
        self.created.append((app_name, user_id, session_id))


class _FakeRunner:
    """Runner falso — 'events_by_call' é consumida uma lista por chamada de run_async."""

    def __init__(self, events_by_call, session_service=None):
        self._events_by_call = list(events_by_call)
        self.session_service = session_service or _FakeSessionService()

    async def run_async(self, user_id, session_id, new_message):
        call = self._events_by_call.pop(0)
        if isinstance(call, Exception):
            raise call
        for event in call:
            yield event


def test_ensure_session_creates_when_missing():
    async def _run():
        runner = _FakeRunner(events_by_call=[[]], session_service=_FakeSessionService(existing_session=None))
        known = set()
        await ensure_session(runner, "app", "chat1", "chat1_financas", known)
        return runner, known

    runner, known = asyncio.run(_run())

    assert "chat1_financas" in known
    assert runner.session_service.created == [("app", "chat1", "chat1_financas")]


def test_ensure_session_skips_create_when_already_known():
    async def _run():
        runner = _FakeRunner(events_by_call=[[]])
        known = {"chat1_financas"}
        await ensure_session(runner, "app", "chat1", "chat1_financas", known)
        return runner

    runner = asyncio.run(_run())

    # Já estava em known_sessions — get_session/create_session nunca deveriam ser chamados
    assert runner.session_service.created == []


def test_run_and_collect_text_uses_final_event_text():
    events = [
        _FakeEvent(author="nami_agent", parts=[_FakePart(text="Nami: gasto registrado")], final=True),
    ]
    runner = _FakeRunner(events_by_call=[events])

    text, tokens = asyncio.run(
        run_and_collect_text(runner, "app", "chat1", "chat1_financas", "gastei 30", set())
    )

    assert text == "Nami: gasto registrado"
    assert tokens == 0


def test_run_and_collect_text_falls_back_to_non_final_events():
    # Padrão de sub_agents: o evento final não tem content, mas um evento anterior do
    # mesmo autor trouxe o texto de verdade.
    events = [
        _FakeEvent(author="kaguya_agent", parts=[_FakePart(text="Kaguya: tarefa criada")], final=False),
        _FakeEvent(author="kaguya_agent", parts=[], final=True),
    ]
    runner = _FakeRunner(events_by_call=[events])

    text, _tokens = asyncio.run(
        run_and_collect_text(runner, "app", "chat1", "chat1_tarefas", "cria tarefa", set())
    )

    assert text == "Kaguya: tarefa criada"


def test_run_and_collect_text_accumulates_tokens():
    events = [
        _FakeEvent(author="nami_agent", parts=[_FakePart(text="parte 1")], usage=_FakeUsage(100)),
        _FakeEvent(author="nami_agent", parts=[_FakePart(text="parte 2")], final=True, usage=_FakeUsage(50)),
    ]
    runner = _FakeRunner(events_by_call=[events])

    _text, tokens = asyncio.run(
        run_and_collect_text(runner, "app", "chat1", "chat1_financas", "oi", set())
    )

    assert tokens == 150


def test_run_and_collect_text_retries_once_on_session_not_found():
    events_ok = [_FakeEvent(author="nami_agent", parts=[_FakePart(text="ok na 2a tentativa")], final=True)]
    runner = _FakeRunner(events_by_call=[SessionNotFoundError("sumiu"), events_ok])
    known = {"chat1_financas"}  # já "conhecida" — força re-checagem via get_session no retry

    text, _tokens = asyncio.run(
        run_and_collect_text(runner, "app", "chat1", "chat1_financas", "oi", known)
    )

    assert text == "ok na 2a tentativa"
    assert "chat1_financas" in known


def test_run_and_collect_text_raises_after_second_failure():
    runner = _FakeRunner(events_by_call=[SessionNotFoundError("sumiu"), SessionNotFoundError("sumiu de novo")])
    known = {"chat1_financas"}

    with pytest.raises(SessionNotFoundError):
        asyncio.run(run_and_collect_text(runner, "app", "chat1", "chat1_financas", "oi", known))
