"""Spec 075/077 — a Kaguya filtra pessoas por espaço delegando ao contrato da Komi (sem banco)."""

import pytest

from agents.kaguya import people_space as PS


def test_sem_espaco_ou_espaco_desconhecido_nao_filtra_nem_consulta(monkeypatch):
    import agents.komi.integration as I
    monkeypatch.setattr(I, "people_for_space", lambda *_: pytest.fail("não deveria consultar a Komi"))
    for espaco in (None, "tudo", "all", "lua", ""):
        assert PS.person_ids_for_space(espaco) is None


def test_trabalho_e_pessoal_delegam_para_a_komi(monkeypatch):
    import agents.komi.integration as I
    chamadas = []

    def fake(espaco):
        chamadas.append(espaco)
        return ["a", "b"]

    monkeypatch.setattr(I, "people_for_space", fake)
    assert PS.person_ids_for_space("work") == ["a", "b"]
    assert PS.person_ids_for_space("personal") == ["a", "b"]
    assert chamadas == ["work", "personal"]


def test_komi_fora_do_ar_nao_esconde_ninguem(monkeypatch):
    import agents.komi.integration as I

    def boom(*_):
        raise RuntimeError("sem banco")

    monkeypatch.setattr(I, "people_for_space", boom)
    assert PS.person_ids_for_space("work") is None          # None = "todas as pessoas"


def test_komi_supports_space_reflete_o_schema(monkeypatch):
    import agents.komi.schema as S
    monkeypatch.setattr(S, "ensure_schema", lambda *a, **k: True)
    assert PS.komi_supports_space() is True
    monkeypatch.setattr(S, "ensure_schema", lambda *a, **k: False)
    assert PS.komi_supports_space() is False

    def boom(*a, **k):
        raise RuntimeError("x")

    monkeypatch.setattr(S, "ensure_schema", boom)
    assert PS.komi_supports_space() is False


def test_reset_cache_continua_existindo_por_compatibilidade():
    PS.reset_cache()
