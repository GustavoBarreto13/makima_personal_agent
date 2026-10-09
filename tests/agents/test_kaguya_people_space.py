"""Spec 075 — contrato de pessoas por espaço com a Komi (sem banco)."""

import pytest

from agents.kaguya import people_space as PS


@pytest.fixture(autouse=True)
def _limpa_cache():
    PS.reset_cache()
    yield
    PS.reset_cache()


def test_sem_coluna_na_komi_nao_filtra(monkeypatch):
    monkeypatch.setattr(PS, "run_select", lambda *a, **k: [])
    assert PS.komi_supports_space() is False
    assert PS.person_ids_for_space("work") is None


def test_com_coluna_filtra_pelo_espaco_e_inclui_both(monkeypatch):
    calls = []

    def fake(sql, params=None):
        calls.append(sql)
        if "information_schema" in sql:
            return [{"?column?": 1}]
        assert "context IN (%(space)s, 'both')" in sql and params == {"space": "work"}
        return [{"id": "a"}, {"id": "b"}]

    monkeypatch.setattr(PS, "run_select", fake)
    assert PS.person_ids_for_space("work") == ["a", "b"]
    PS.person_ids_for_space("work")
    assert sum("information_schema" in c for c in calls) == 1     # catálogo consultado uma vez só


def test_sem_espaco_nao_filtra_mesmo_com_coluna(monkeypatch):
    monkeypatch.setattr(PS, "run_select", lambda *a, **k: pytest.fail("não deveria consultar"))
    assert PS.person_ids_for_space(None) is None
    assert PS.person_ids_for_space("tudo") is None


def test_erro_de_banco_vira_nao_suportado(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("sem banco")
    monkeypatch.setattr(PS, "run_select", boom)
    assert PS.komi_supports_space() is False
