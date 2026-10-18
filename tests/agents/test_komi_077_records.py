"""Spec 077 · Fase 4 — interações, anotações (com sugestões da IA) e relacionamentos configuráveis.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_records.py -v
"""

import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")

from agents.komi import integration as I  # noqa: E402
from agents.komi import tools as K  # noqa: E402
from agents.komi import tools_categories as C  # noqa: E402
from agents.komi import tools_interactions as TI  # noqa: E402
from agents.komi import tools_notes as TN  # noqa: E402

SP = ZoneInfo("America/Sao_Paulo")


@pytest.fixture(autouse=True)
def banco():
    from tests.agents.komi_testing import reset_komi_schema
    reset_komi_schema()
    I.reset_providers()
    I._cache_descobertos = {}          # sem provedores reais: só o que o teste registrar
    yield
    I.reset_providers()
    reset_komi_schema()


def _pessoa(nome, **extra):
    r = K.create_person(nome, **extra)
    assert r["status"] == "ok", r
    return r["id"]


def _ontem():
    return (datetime.now(SP) - timedelta(days=1)).date().isoformat()


# ── interações ───────────────────────────────────────────────────────────────

def test_interacao_usa_o_espaco_da_pessoa_e_data_vira_meio_dia_em_sao_paulo():
    pessoal, trabalho, ambos = _pessoa("Ana"), _pessoa("Beto", context="work"), _pessoa("Caio", context="both")
    ids = {n: TI.log_interaction(p, kind="ligacao", happened_at="2026-10-05")["id"] for n, p in
           [("pessoal", pessoal), ("trabalho", trabalho), ("ambos", ambos)]}
    contextos = {i["person_id"]: i["context"] for p in (pessoal, trabalho, ambos) for i in TI.list_interactions(p)["interactions"]}
    assert contextos == {pessoal: "personal", trabalho: "work", ambos: "personal"}      # "ambos" assume pessoal
    primeira = TI.list_interactions(pessoal)["interactions"][0]
    assert primeira["happened_at"] == "2026-10-05T12:00:00-03:00" and primeira["date"] == "2026-10-05"
    assert TI.log_interaction(ambos, happened_at="2026-10-06", context="work")["status"] == "ok"
    assert [i["context"] for i in TI.list_interactions(ambos, context="work")["interactions"]] == ["work"]
    assert ids


def test_interacao_valida_tipo_pessoa_futuro_e_formato():
    pid = _pessoa("Ana")
    assert TI.log_interaction(pid, kind="telepatia")["status"] == "error"
    assert TI.log_interaction("nao-existe")["status"] == "error"
    assert "futuro" in TI.log_interaction(pid, happened_at=(datetime.now(SP) + timedelta(days=3)).date().isoformat())["message"]
    assert "inválida" in TI.log_interaction(pid, happened_at="amanhã cedo")["message"]
    assert TI.log_interaction(pid, context="lua")["status"] == "error"
    assert TI.log_interaction(pid, happened_at="2026-10-05T14:30")["status"] == "ok"            # sem fuso = São Paulo
    assert TI.list_interactions(pid)["interactions"][0]["happened_at"] == "2026-10-05T14:30:00-03:00"
    assert TI.list_interactions(pid, context="lua")["status"] == "error"


def test_interacao_atualiza_parcialmente_apaga_e_restaura():
    pid = _pessoa("Ana")
    iid = TI.log_interaction(pid, kind="mensagem", happened_at="2026-10-01", note="oi")["id"]
    assert TI.update_interaction(iid, kind="encontro", note="")["status"] == "ok"               # "" apaga a nota
    item = TI.list_interactions(pid)["interactions"][0]
    assert (item["kind"], item["note"], item["date"]) == ("encontro", None, "2026-10-01")
    assert TI.update_interaction(iid)["status"] == "error" and TI.update_interaction(iid, kind="x")["status"] == "error"
    assert TI.update_interaction(99999, kind="video")["status"] == "error"
    assert TI.delete_interaction(iid)["status"] == "ok" and TI.list_interactions(pid)["interactions"] == []
    assert TI.delete_interaction(iid)["status"] == "error"                                       # já apagada
    assert TI.restore_interaction(iid)["status"] == "ok" and len(TI.list_interactions(pid)["interactions"]) == 1
    assert TI.restore_interaction(iid)["status"] == "error"                                      # já está viva


def test_ultimo_contato_do_inicio_considera_interacoes_e_provedores():
    ana, bia = _pessoa("Ana"), _pessoa("Bia")
    TI.log_interaction(ana, kind="ligacao", happened_at="2026-10-02", note="combinar viagem")
    TI.log_interaction(ana, kind="mensagem", happened_at="2026-09-20")
    I.register_link_type({
        "entity_type": "task", "agent": "kaguya", "label": "Tarefas", "icon": "task", "activity_kind": "tarefa",
        "resolve": lambda ids: [],
        "last_activity": lambda ids: [{"person_id": ana, "date": "2026-10-01", "text": "t"},
                                      {"person_id": bia, "date": "2026-08-15", "text": "enviar relatório"}],
    })
    mapa = I.last_activity_map([ana, bia])
    assert mapa[ana] == {"date": "2026-10-02", "kind": "interação", "text": "combinar viagem"}   # a interação é mais nova
    assert mapa[bia] == {"date": "2026-08-15", "kind": "tarefa", "text": "enviar relatório"}
    visao = {p["id"]: p for p in K.get_people_overview()["people"]}
    assert visao[ana]["last_interaction"]["kind"] == "interação" and visao[bia]["last_interaction"]["kind"] == "tarefa"
    assert I.last_activity_map([]) == {}
    # um provedor quebrado não derruba o resto
    I.register_link_type({"entity_type": "book", "agent": "frieren", "label": "L", "icon": "book",
                          "resolve": lambda ids: [], "last_activity": lambda ids: 1 / 0})
    assert I.last_activity_map([ana])[ana]["kind"] == "interação"


# ── anotações ────────────────────────────────────────────────────────────────

def test_anotacao_espaco_padrao_duplicata_e_reativacao():
    ana, chefe = _pessoa("Ana"), _pessoa("Chefe", context="work")
    assert TN.add_person_note(chefe, "prefere reunião curta")["status"] == "ok"
    assert TN.list_person_notes(chefe)["notes"][0]["context"] == "work"
    n = TN.add_person_note(ana, "Gosta de Orquídeas", kind="gosta")
    assert n["status"] == "ok"
    assert "já tem" in TN.add_person_note(ana, "  gosta de orquideas ")["message"]               # sem caixa/acento
    assert TN.add_person_note(ana, "   ")["status"] == "error"
    assert TN.add_person_note(ana, "x", kind="segredo")["status"] == "error"
    assert TN.add_person_note("nao-existe", "x")["status"] == "error"
    assert TN.add_person_note(ana, "x", context="lua")["status"] == "error"
    # uma descartada volta a ser ativa se o dono a escrever de novo
    sug = TN.save_suggestions(ana, [{"kind": "presente", "text": "vinho tinto"}])
    assert sug == {"status": "ok", "created": 1, "skipped": 0}
    sid = [x for x in TN.list_person_notes(ana)["notes"] if x["status"] == "sugerida"][0]["id"]
    TN.dismiss_person_note(sid)
    assert TN.add_person_note(ana, "Vinho tinto", kind="presente")["id"] == sid
    assert {x["text"] for x in TN.list_person_notes(ana, status="ativa")["notes"]} == {"Gosta de Orquídeas", "vinho tinto"}


def test_sugestao_da_ia_nunca_vira_ativa_sozinha_e_e_aceita_editada_ou_descartada():
    pid = _pessoa("Ana")
    refs = [{"entity_type": "journal_bullet", "entity_id": "7", "title": "jantar", "deep_link": "/journal#dia/2026-10-01"}]
    r = TN.save_suggestions(pid, [
        {"kind": "presente", "text": "livro de poesia", "refs": refs},
        {"kind": "gosta", "text": "café sem açúcar"},
        {"kind": "tipo-invalido", "text": "mora em Recife"},                                      # cai em "nota"
        {"kind": "nota", "text": "  "},                                                           # vazio é pulado
    ])
    assert r == {"status": "ok", "created": 3, "skipped": 1}
    notas = TN.list_person_notes(pid)["notes"]
    assert [n["status"] for n in notas] == ["sugerida"] * 3 and all(n["source"] == "ia" for n in notas)
    poesia = next(n for n in notas if n["text"] == "livro de poesia")
    assert poesia["source_refs"] == refs and poesia["kind"] == "presente"

    assert TN.accept_person_note(poesia["id"], text="livro de poesia da Adélia", kind="presente")["status"] == "ok"
    assert TN.accept_person_note(poesia["id"])["status"] == "error"                               # já não é sugestão
    cafe = next(n for n in notas if n["text"] == "café sem açúcar")["id"]
    assert TN.dismiss_person_note(cafe)["status"] == "ok" and TN.dismiss_person_note(cafe)["status"] == "error"
    assert [n["text"] for n in TN.list_person_notes(pid, status="descartada")["notes"]] == ["café sem açúcar"]
    # a IA NÃO volta a sugerir o que está ativo, sugerido ou descartado
    again = TN.save_suggestions(pid, [{"kind": "gosta", "text": "Café sem açúcar"}, {"kind": "nota", "text": "livro de poesia da adélia"},
                                      {"kind": "nota", "text": "mora em Recife"}, {"kind": "nota", "text": "novidade"}])
    assert again == {"status": "ok", "created": 1, "skipped": 3}
    assert TN.save_suggestions("nao-existe", [{"text": "x"}])["status"] == "error"
    # ordem: ativas antes das sugeridas
    assert [n["status"] for n in TN.list_person_notes(pid)["notes"]] == ["ativa", "sugerida", "sugerida"]


def test_anotacao_edita_apaga_restaura_e_filtra_por_espaco():
    pid = _pessoa("Ana", context="both")
    a = TN.add_person_note(pid, "ideia", context="work")["id"]
    b = TN.add_person_note(pid, "outra", context="personal")["id"]
    assert TN.update_person_note(a, text="ideia nova", kind="presente", context="personal")["status"] == "ok"
    assert TN.update_person_note(a, text="  ")["status"] == "error" and TN.update_person_note(a)["status"] == "error"
    assert TN.update_person_note(a, kind="x")["status"] == "error" and TN.update_person_note(a, context="x")["status"] == "error"
    assert TN.update_person_note(999, text="y")["status"] == "error"
    assert {n["text"] for n in TN.list_person_notes(pid, context="personal")["notes"]} == {"ideia nova", "outra"}
    assert TN.list_person_notes(pid, context="work")["notes"] == []
    assert TN.list_person_notes(pid, status="xx")["status"] == "error"
    assert TN.delete_person_note(b)["status"] == "ok" and TN.delete_person_note(b)["status"] == "error"
    assert [n["text"] for n in TN.list_person_notes(pid)["notes"]] == ["ideia nova"]
    assert TN.restore_person_note(b)["status"] == "ok" and TN.restore_person_note(b)["status"] == "error"


# ── relacionamentos configuráveis ────────────────────────────────────────────

def test_categorias_semeadas_com_contagem_e_criacao_com_slug():
    _pessoa("Ana", category="amigos")
    _pessoa("Beto", category="amigos")
    cats = {c["slug"]: c for c in C.list_categories()["categories"]}
    assert list(cats) == ["familia", "amigos", "trabalho", "outros"] and cats["amigos"]["people_count"] == 2
    r = C.create_category("Colegas da Faculdade!", icon="school")
    assert r["slug"] == "colegas_da_faculdade"
    assert C.create_category("colegas da faculdade")["status"] == "error"                           # mesmo nome
    assert C.create_category("Colegas da Faculdade?", icon="school")["status"] == "error"           # mesmo nome ignorando pontuação
    assert C.create_category("FAMILIA")["status"] == "error"                                         # mesmo nome ignorando caixa/acento
    assert C.create_category("   ")["status"] == "error" and C.create_category("???")["status"] == "error"
    assert C.create_category("Vizinhos", icon="Ícone!")["status"] == "error"
    assert C.create_category("Vizinhos 2", slug="colegas_da_faculdade")["slug"] == "colegas_da_faculdade_2"   # slug ocupado → sufixo
    assert _pessoa("Duda", category="colegas_da_faculdade")


def test_categoria_renomeia_reordena_e_valida():
    assert C.update_category("amigos", label="Amizades", icon="heart")["status"] == "ok"
    assert C.update_category("amigos", label="Família")["status"] == "error"                        # nome de outra
    assert C.update_category("amigos", label="Amizades")["status"] == "ok"                          # o próprio nome
    assert C.update_category("amigos")["status"] == "error" and C.update_category("nada", label="x")["status"] == "error"
    assert C.update_category("amigos", icon="Inválido!")["status"] == "error" and C.update_category("amigos", label=" ")["status"] == "error"
    assert C.reorder_categories(["outros", "trabalho"])["status"] == "ok"
    assert [c["slug"] for c in C.list_categories()["categories"]] == ["outros", "trabalho", "familia", "amigos"]   # o resto mantém a ordem
    assert C.reorder_categories(["inexistente"])["status"] == "error"
    assert next(c for c in C.list_categories()["categories"] if c["slug"] == "amigos")["label"] == "Amizades"


def test_arquivar_move_pessoas_e_protege_o_ultimo_relacionamento_ativo():
    ana = _pessoa("Ana", category="trabalho")
    perguntar = C.archive_category("trabalho")
    assert perguntar["status"] == "error" and perguntar["needs_move_to"] and perguntar["people_count"] == 1
    assert C.archive_category("trabalho", move_to="trabalho")["status"] == "error"                   # destino = ele mesmo
    assert C.archive_category("trabalho", move_to="nada")["status"] == "error"
    ok = C.archive_category("trabalho", move_to="amigos")
    assert ok["status"] == "ok" and ok["moved"] == 1
    assert K.get_person(ana)["perfil"]["category"] == "amigos"
    assert "trabalho" not in [c["slug"] for c in C.list_categories()["categories"]]
    assert "trabalho" in [c["slug"] for c in C.list_categories(include_archived=True)["categories"]]
    assert K.update_person(ana, category="trabalho")["status"] == "error"                            # arquivado não recebe gente nova
    assert _pessoa("Beto", category="trabalho") and K.get_person(K.find_people("Beto")["matches"][0]["id"])["perfil"]["category"] == "outros"
    assert C.archive_category("trabalho")["status"] == "error"                                       # já arquivado
    assert C.archive_category("familia")["status"] == "ok"                                           # sem pessoas: arquiva direto
    assert C.unarchive_category("trabalho")["status"] == "ok" and C.unarchive_category("trabalho")["status"] == "error"
    C.archive_category("amigos", move_to="outros")
    C.archive_category("trabalho")
    assert "pelo menos um" in C.archive_category("outros")["message"]                                # nunca zera a lista
