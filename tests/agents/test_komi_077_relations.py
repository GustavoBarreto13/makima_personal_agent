"""Spec 077 · Fase 4b — relações entre pessoas, grupos, duplicatas e restaurar pessoa.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_relations.py -v
"""

import os

import pytest

from agents.komi import duplicates as D
from agents.komi.tools_relations import canonical_relation


# ── puros ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("a,b,kind,inv,esperado", [
    ("p2", "p1", "irmao", "irmao", ("p1", "p2", "irmao")),          # simétrica: ordena o par
    ("p1", "p2", "irmao", "irmao", ("p1", "p2", "irmao")),
    ("p1", "p2", "filho", "pai_mae", ("p1", "p2", "filho")),          # já é a forma canônica
    ("p1", "p2", "pai_mae", "filho", ("p2", "p1", "filho")),          # "p1 é pai de p2" == "p2 é filho de p1"
    ("p3", "p4", "chefe", "subordinado", ("p3", "p4", "chefe")),
])
def test_forma_canonica_da_relacao(a, b, kind, inv, esperado):
    assert canonical_relation(a, b, kind, inv) == esperado


def test_a_relacao_e_o_seu_inverso_viram_a_mesma_linha():
    um = canonical_relation("pai", "filha", "pai_mae", "filho")
    outro = canonical_relation("filha", "pai", "filho", "pai_mae")
    assert um == outro


def _p(i, nome, **extra):
    return {"id": i, "name": nome, **extra}


def test_duplicatas_por_contato_nome_contido_e_erro_de_digitacao():
    pares = D.candidate_pairs([
        _p("1", "Ana", phone="+55 (81) 99999-1234"), _p("2", "Ana Lima", phone="81 999991234"),     # telefone igual (ignora país/máscara)
        _p("3", "Beatriz"), _p("4", "Beatris"),                                                       # erro de digitação
        _p("5", "Carlos", instagram="@Carlão"), _p("6", "Caio Souza", instagram="carlão"),            # Instagram igual (caixa/@)
        _p("7", "Duda", nickname="Maria"), _p("8", "Maria Eduarda"),                                  # apelido = início do nome de outra
        _p("9", "Eva"), _p("10", "Mariana"),                                                          # "Mari" ≠ palavra inteira: nada
    ])
    por_par = {(p["a"]["id"], p["b"]["id"]): p for p in pares}
    assert por_par[("1", "2")]["reasons"][0] == "mesmo telefone" and por_par[("1", "2")]["score"] == 1.0
    assert "nomes parecidos" in por_par[("3", "4")]["reasons"]
    assert "mesmo Instagram" in por_par[("5", "6")]["reasons"]
    assert "um nome contém o outro" in por_par[("7", "8")]["reasons"]
    assert not any("9" in (p["a"]["id"], p["b"]["id"]) or "10" in (p["a"]["id"], p["b"]["id"]) for p in pares)
    assert pares[0]["score"] >= pares[-1]["score"]                                                   # mais provável primeiro


def test_duplicatas_nao_confunde_palavra_dentro_de_outra_nem_nomes_curtos_diferentes():
    assert D.candidate_pairs([_p("1", "Ana"), _p("2", "Mariana")]) == []                              # "ana" dentro de "mariana"
    assert D.candidate_pairs([_p("1", "Rui"), _p("2", "Rua")]) == []                                  # curtos demais para "parecidos"
    assert D.candidate_pairs([_p("1", "Ana")]) == [] and D.candidate_pairs([]) == []
    assert D.candidate_pairs([_p("1", "Ana", phone="123"), _p("2", "Bia", phone="123")]) == []        # telefone curto não conta


# ── com banco ────────────────────────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytest.fixture
def banco():
    from agents.komi import integration as I
    from tests.agents.komi_testing import reset_komi_schema
    reset_komi_schema()
    I.reset_providers()
    I._cache_descobertos = {}
    yield
    I.reset_providers()
    reset_komi_schema()


def _pessoa(nome, **extra):
    from agents.komi import tools as K
    r = K.create_person(nome, **extra)
    assert r["status"] == "ok", r
    return r["id"]


@pytestmark_db
def test_relacoes_vistas_de_cada_lado_e_sem_duplicar(banco):
    from agents import komi
    from agents.komi import tools_relations as R
    mae, filho, irma = _pessoa("Ana"), _pessoa("Pedro"), _pessoa("Bia")
    assert R.relate_people(mae, filho, "pai_mae")["created"] is True        # Ana é mãe do Pedro
    assert R.relate_people(filho, mae, "filho")["created"] is False         # o mesmo fato, dito do outro lado
    assert R.relate_people(irma, mae, "irmao")["status"] == "ok"
    assert R.relate_people(mae, irma, "irmao")["created"] is False          # simétrica
    de_ana = {(r["other_name"], r["kind"], r["label"]) for r in R.list_relations(mae)["relations"]}
    assert de_ana == {("Pedro", "filho", "Filho/filha"), ("Bia", "irmao", "Irmão/irmã")}
    de_pedro = [(r["other_name"], r["kind"]) for r in R.list_relations(filho)["relations"]]
    assert de_pedro == [("Ana", "pai_mae")]                                  # para o Pedro, Ana é a mãe
    assert R.relate_people(mae, mae, "irmao")["status"] == "error"
    assert R.relate_people(mae, filho, "inventado")["status"] == "error"
    assert R.relate_people(mae, "nao-existe", "irmao")["status"] == "error"
    assert [k["slug"] for k in R.list_relation_kinds()["kinds"]][:3] == ["irmao", "pai_mae", "filho"]
    assert komi and R.unrelate_people(filho, mae, "filho")["removed"] == 1   # remove pelo lado que quiser
    assert R.unrelate_people(filho, mae, "filho")["status"] == "error"
    assert R.unrelate_people(irma, mae)["removed"] == 1                      # sem tipo: todas do par
    assert R.list_relations(mae)["relations"] == []


@pytestmark_db
def test_relacao_some_da_lista_se_a_outra_pessoa_for_excluida(banco):
    from agents.komi import tools as K, tools_relations as R
    a, b = _pessoa("Ana"), _pessoa("Bia")
    R.relate_people(a, b, "amigo")
    K.delete_person(b)
    assert R.list_relations(a)["relations"] == []


@pytestmark_db
def test_grupos_criar_renomear_membros_e_contagem_so_de_vivas(banco):
    from agents.komi import tools as K, tools_relations as R
    a, b = _pessoa("Ana"), _pessoa("Bia")
    g = R.create_group("Turma da Faculdade")["id"]
    assert R.create_group("turma da faculdade")["status"] == "error" and R.create_group("  ")["status"] == "error"
    assert R.add_to_group(g, a)["status"] == "ok" and R.add_to_group(g, a)["status"] == "ok"        # idempotente
    R.add_to_group(g, b)
    assert R.add_to_group(g, "nao-existe")["status"] == "error" and R.add_to_group(999, a)["status"] == "error"
    assert R.list_groups()["groups"] == [{"id": g, "name": "Turma da Faculdade", "member_count": 2}]
    K.delete_person(b)
    assert R.list_groups()["groups"][0]["member_count"] == 1                                         # excluída não conta
    assert R.rename_group(g, "Amigos da UFPE")["status"] == "ok"
    outro = R.create_group("Vizinhos")["id"]
    assert R.rename_group(outro, "amigos da ufpe")["status"] == "error" and R.rename_group(999, "x")["status"] == "error"
    assert [x["name"] for x in R.list_person_groups(a)["groups"]] == ["Amigos da UFPE"]
    assert R.remove_from_group(g, a)["status"] == "ok" and R.remove_from_group(g, a)["status"] == "error"
    assert R.delete_group(g)["status"] == "ok" and R.delete_group(g)["status"] == "error"


@pytestmark_db
def test_restaurar_pessoa_excluida_e_recusas(banco):
    from agents.komi import tools as K
    ana = _pessoa("Ana", nickname="Aninha")
    assert K.restore_person(ana)["status"] == "error"                       # não está excluída
    K.delete_person(ana)
    outra = _pessoa("Aninha")                                                 # alguém ocupa o apelido dela na lixeira
    r = K.restore_person(ana)
    assert r["status"] == "error" and "Aninha" in r["message"]
    K.delete_person(outra)
    assert K.restore_person(ana)["status"] == "ok" and K.get_person(ana)["status"] == "ok"
    assert K.restore_person("nao-existe")["status"] == "error"


@pytestmark_db
def test_find_duplicates_usa_apelido_aliases_e_ignora_excluidas(banco):
    from agents.komi import tools as K, tools_merge as M
    a = _pessoa("Ana", phone="81 99999-0000")
    b = _pessoa("Ana Lima", phone="+55 81 99999-0000")
    c = _pessoa("Fulano")
    K.add_alias(c, "Betinha")
    d = _pessoa("Betina Souza")
    pares = M.find_duplicates()["pairs"]
    assert {frozenset((p["a"]["id"], p["b"]["id"])) for p in pares} >= {frozenset((a, b))}
    K.delete_person(b)
    assert all(b not in (p["a"]["id"], p["b"]["id"]) for p in M.find_duplicates()["pairs"])
    assert c and d
