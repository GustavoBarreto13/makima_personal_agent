"""Spec 077 · Fase 2 — contrato de integração da Komi (agents/komi/integration.py).

A primeira metade roda SEM banco (funções puras: menções e validação do tipo). A segunda
usa um PostgreSQL descartável e provedores FALSOS, para provar o contrato sem depender
das tabelas dos outros agentes (os provedores reais têm o próprio arquivo de teste).

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_integration.py -v
"""

import os

import pytest

from agents.komi import integration as I


# ── funções puras: não precisam de banco ─────────────────────────────────────

@pytest.mark.parametrize("tipo", ["task", "trip_item", "invoice", "a1"])
def test_entity_type_aberto_aceita_formato_valido(tipo):
    assert I.validate_entity_type(tipo) == tipo


@pytest.mark.parametrize("tipo", ["", "x", "Task", "trip item", "1abc", "a-b", None, 7, "a" * 60])
def test_entity_type_invalido_e_barrado(tipo):
    with pytest.raises(ValueError):
        I.validate_entity_type(tipo)


def test_menções_parse_render_e_texto_simples():
    texto = "almoço com @[Bia](komi:p1), @[Carlos Souza](komi:p2) e de novo @[Bia](komi:p1)"
    assert I.parse_mentions(texto) == [{"id": "p1", "name": "Bia"}, {"id": "p2", "name": "Carlos Souza"}]
    assert I.plain_text(texto) == "almoço com @Bia, @Carlos Souza e de novo @Bia"
    assert I.parse_mentions(None) == [] and I.plain_text(None) == ""
    # o token gerado é lido de volta pelo parser
    assert I.parse_mentions(I.render_mention("Ana [x]\n", "p9")) == [{"id": "p9", "name": "Ana x"}]


def test_substituir_id_so_mexe_no_alvo():
    texto = "com @[Bia](komi:a) e @[Carlos](komi:c)"
    assert I.replace_mention_id(texto, "a", "b", "Beatriz") == "com @[Beatriz](komi:b) e @[Carlos](komi:c)"
    assert I.replace_mention_id(texto, "a", "b") == "com @[Bia](komi:b) e @[Carlos](komi:c)"
    assert I.replace_mention_id(texto, "zzz", "b") == texto


def test_registro_valida_o_contrato():
    I.reset_providers()
    base = {"entity_type": "xx", "agent": "teste", "label": "Teste", "icon": "link", "resolve": lambda ids: []}
    I.register_link_type(base)                                   # válido
    for quebrado in (
        {**base, "agent": ""},                                    # sem agent
        {**base, "entity_type": "Inválido"},                      # formato
        {k: v for k, v in base.items() if k != "resolve"},        # sem resolve nem by_person
        {**base, "summary": lambda p: {}},                        # summary sem summary_key
    ):
        with pytest.raises(ValueError):
            I.register_link_type(quebrado)
    I.reset_providers()


def test_provedores_reais_sao_descobertos_sozinhos():
    """Qualquer agents/<x>/komi_provider.py com LINK_TYPES entra sem registro manual."""
    I.reset_providers()
    achados = I.providers()
    for tipo, agente in [("transaction", "nami"), ("task", "kaguya"), ("task_waiting", "kaguya"),
                         ("book", "frieren"), ("journal_bullet", "violet"), ("journal_letter", "violet"),
                         ("movie_diary_entry", "akane")]:
        assert achados[tipo]["agent"] == agente, tipo
    I.reset_providers()


# ── com banco (provedores falsos) ────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytest.fixture
def db():
    """Banco limpo + provedores zerados (nenhum provedor real, só os que o teste registrar)."""
    from agents.db import get_conn
    from tests.agents.komi_testing import reset_komi_schema
    reset_komi_schema()
    I.reset_providers()
    I._cache_descobertos = {}          # desliga a descoberta em disco: só provedores falsos
    yield get_conn
    I.reset_providers()
    reset_komi_schema()   # não deixa pessoas no banco compartilhado para os testes de outros agentes


def _pessoa(nome, **extra):
    from agents.komi import tools as K
    r = K.create_person(nome, **extra)
    assert r["status"] == "ok", r
    return r["id"]


def _links(get_conn, tipo, item):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT person_id FROM person_links WHERE entity_type=%s AND entity_id=%s ORDER BY person_id", (tipo, str(item)))
        return [r[0] for r in cur.fetchall()]


@pytestmark_db
def test_link_people_e_idempotente_ignora_inexistentes_e_aceita_tipo_novo(db):
    bia, carlos = _pessoa("Bia"), _pessoa("Carlos")
    excluida = _pessoa("Fantasma")
    from agents.komi import tools as K
    K.delete_person(excluida)
    with db() as conn, conn.cursor() as cur:
        ligadas = I.link_people(cur, "invoice", 7, [bia, bia, "nao-existe", excluida, carlos])
        assert ligadas == [bia, carlos]                              # só as vivas, na ordem pedida
        assert I.link_people(cur, "invoice", 7, [bia]) == [bia]      # de novo: não duplica
        with pytest.raises(ValueError):
            I.link_people(cur, "Tipo Ruim", 7, [bia])
    assert sorted(_links(db, "invoice", 7)) == sorted([bia, carlos])


@pytestmark_db
def test_sync_people_troca_o_conjunto_e_preserva_quem_continua(db):
    a, b, c = _pessoa("Ana"), _pessoa("Bruno"), _pessoa("Caio")
    with db() as conn, conn.cursor() as cur:
        assert I.sync_people(cur, "task", 1, [a, b]) == {"added": sorted([a, b]), "removed": []}
        cur.execute("SELECT id FROM person_links WHERE person_id=%s AND entity_type='task'", (a,))
        id_original = cur.fetchone()[0]
        r = I.sync_people(cur, "task", 1, [b, c, c])
        assert r == {"added": [c], "removed": [a]}
        cur.execute("SELECT id FROM person_links WHERE person_id=%s AND entity_type='task'", (b,))
        assert cur.fetchone() is not None                              # b continuou (não foi recriado)
        assert I.sync_people(cur, "task", 1, []) == {"added": [], "removed": sorted([b, c])}
        cur.execute("SELECT 1 FROM person_links WHERE id=%s", (id_original,))
        assert cur.fetchone() is None
    assert _links(db, "task", 1) == []


@pytestmark_db
def test_unlink_all_e_unlink_person(db):
    a, b = _pessoa("Ana"), _pessoa("Bruno")
    with db() as conn, conn.cursor() as cur:
        I.link_people(cur, "task", 5, [a, b])
        assert I.unlink_person(cur, a, "task", 5) == 1
        assert I.unlink_person(cur, a, "task", 5) == 0                 # já não existia
        assert I.unlink_all(cur, "task", 5) == 1
        assert I.unlink_all(cur, "task", 5) == 0


@pytestmark_db
def test_vinculo_some_junto_com_a_transacao_do_chamador(db):
    import psycopg2
    a = _pessoa("Ana")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            I.link_people(cur, "task", 99, [a])
        conn.rollback()
    finally:
        conn.close()
    assert _links(db, "task", 99) == []


@pytestmark_db
def test_resolve_person_regra_zero_um_varios_e_nome_exato_vence(db):
    bia = _pessoa("Beatriz", nickname="Bia")
    _pessoa("Ana")
    _pessoa("Ana Lima")
    assert I.resolve_person("Bia")["person"]["id"] == bia             # apelido
    assert I.resolve_person("beatriz")["match"] == "one"               # nome
    assert I.resolve_person("Zé")["match"] == "none"
    exato = I.resolve_person("Ana")                                    # "Ana" exata vence "Ana Lima" (prefixo)
    assert exato["match"] == "one" and exato["person"]["id"] != bia
    _pessoa("Anabela")
    assert I.resolve_person("Anab")["match"] == "one"
    assert I.resolve_person("An")["match"] == "many"                   # ambíguo → o agente pergunta


@pytestmark_db
def test_resolve_person_e_people_for_space_respeitam_o_espaco(db):
    w = _pessoa("Walter", context="work")
    b = _pessoa("Wanda", context="both")
    p = _pessoa("Wesley", context="personal")
    assert {x["id"] for x in I.resolve_person("w", space="work")["people"]} == {w, b}
    assert I.resolve_person("Wesley", space="work")["match"] == "none"
    assert set(I.people_for_space("work")) == {w, b}
    assert set(I.people_for_space("personal")) == {p, b}
    assert I.people_for_space(None) is None and I.people_for_space("tudo") is None
    assert I.people_for_space("lua") is None                           # desconhecido não esconde ninguém


def _fake(tipo="task", agente="kaguya", resolve=None, **extra):
    return {"entity_type": tipo, "agent": agente, "label": agente.capitalize(), "icon": "task",
            "resolve": resolve or (lambda ids: [{"entity_id": i, "title": f"item {i}", "date": "2026-10-0%s" % i} for i in ids]),
            **extra}


@pytestmark_db
def test_memoria_junta_agentes_ordena_e_normaliza(db):
    pid = _pessoa("Bia")
    I.register_link_type(_fake("task", "kaguya"))
    I.register_link_type(_fake("book", "frieren", resolve=lambda ids: [
        {"entity_id": i, "title": "Livro", "snippet": "x", "date": __import__("datetime").date(2026, 10, 9), "context": "?"} for i in ids]))
    with db() as conn, conn.cursor() as cur:
        I.link_people(cur, "task", 1, [pid]); I.link_people(cur, "task", 3, [pid]); I.link_people(cur, "book", "b1", [pid])
    mem = I.get_person_memory(pid)
    assert mem["status"] == "ok"
    assert [i["date"] for i in mem["items"]] == ["2026-10-09", "2026-10-03", "2026-10-01"]   # mais recente primeiro
    livro = mem["items"][0]
    assert (livro["agent"], livro["label"], livro["icon"], livro["entity_type"]) == ("frieren", "Frieren", "task", "book")
    assert livro["context"] == "personal"                              # contexto estranho cai em pessoal
    assert mem["counts"] == {"kaguya": 2, "frieren": 1}


@pytestmark_db
def test_memoria_isola_provedor_quebrado_e_mostra_vinculo_sem_provedor(db):
    pid = _pessoa("Bia")
    def quebra(ids):
        raise RuntimeError("tabela sumiu")
    I.register_link_type(_fake("task", "kaguya", resolve=quebra))
    with db() as conn, conn.cursor() as cur:
        I.link_people(cur, "task", 1, [pid])
        I.link_people(cur, "trip_item", "t9", [pid])                   # nenhum agente publicou provedor
    mem = I.get_person_memory(pid)
    assert mem["status"] == "ok" and mem["unavailable"] == ["kaguya"]
    assert [i["entity_type"] for i in mem["items"]] == ["trip_item"]   # o vínculo órfão NÃO some
    assert mem["items"][0]["agent"] is None and mem["items"][0]["title"].startswith("Trip item")


@pytestmark_db
def test_memoria_separa_trabalho_de_pessoal_e_inclui_by_person_e_interacoes(db):
    pid = _pessoa("Bia", context="both")
    I.register_link_type(_fake("task", "kaguya", resolve=lambda ids: [
        {"entity_id": "1", "title": "Relatório", "date": "2026-10-02", "context": "work"},
        {"entity_id": "2", "title": "Presente", "date": "2026-10-03", "context": "personal"}]))
    I.register_link_type({"entity_type": "task_waiting", "agent": "kaguya", "label": "Aguardando", "icon": "waiting",
                          "by_person": lambda p: [{"entity_id": "7", "title": "Aguardando Bia", "date": "2026-10-04", "context": "work"}]})
    with db() as conn, conn.cursor() as cur:
        I.link_people(cur, "task", 1, [pid])
        cur.execute("INSERT INTO person_interactions (person_id, kind, context, happened_at, note) "
                    "VALUES (%s, 'ligacao', 'work', '2026-10-05 12:00-03', 'alinhar prazo')", (pid,))
    tudo = I.get_person_memory(pid)
    assert [i["title"] for i in tudo["items"]] == ["Ligação", "Aguardando Bia", "Presente", "Relatório"]
    assert tudo["by_context"] == {"personal": 1, "work": 3}
    trabalho = I.get_person_memory(pid, context="work")
    assert {i["title"] for i in trabalho["items"]} == {"Ligação", "Aguardando Bia", "Relatório"}
    pessoal = I.get_person_memory(pid, context="personal")
    assert [i["title"] for i in pessoal["items"]] == ["Presente"]
    assert I.get_person_memory(pid, context="lua")["status"] == "error"
    assert I.get_person_memory("nao-existe")["status"] == "error"
    assert len(I.get_person_memory(pid, limit=2)["items"]) == 2


@pytestmark_db
def test_resumo_mantem_as_chaves_antigas_e_recebe_blocos_dos_provedores(db):
    from agents.komi import tools as K
    pid = _pessoa("Bia")
    I.register_link_type(_fake("task", "kaguya", summary_key="tarefas", summary=lambda p: {"abertas": [{"id": 1}], "concluidas": []}))
    def explode(p):
        raise RuntimeError("x")
    I.register_link_type(_fake("book", "frieren", summary_key="livros", summary=explode))
    I.register_link_type(_fake("movie_diary_entry", "akane", summary_key="filmes", summary=lambda p: {"filmes": [{"title": "Matrix"}]}))
    r = K.get_person_summary(pid)
    assert r["status"] == "ok" and r["perfil"]["name"] == "Bia"
    assert r["tarefas"] == {"abertas": [{"id": 1}], "concluidas": []}   # veio do provedor
    assert r["livros"] == {"livros": []}                                 # provedor falhou → padrão vazio
    assert r["financas"] == {"saldo": 0.0, "transacoes": []}             # ninguém publicou → padrão vazio
    assert r["diario"] == {"contagem": 0, "trechos": []} and r["cartas"] == {"cartas": []}
    assert r["filmes"] == {"filmes": [{"title": "Matrix"}]}              # bloco novo entra sozinho
    assert K.get_person_summary("nao-existe")["status"] == "error"


@pytestmark_db
def test_copy_links_leva_as_pessoas_para_o_item_novo_sem_duplicar(db):
    a, b = _pessoa("Ana"), _pessoa("Bruno")
    with db() as conn, conn.cursor() as cur:
        I.link_people(cur, "task", 1, [a, b])
        assert I.copy_links(cur, "task", 1, 2) == 2
        assert I.copy_links(cur, "task", 1, 2) == 0            # idempotente
        assert I.copy_links(cur, "task", 99, 3) == 0           # origem sem pessoas
        with pytest.raises(ValueError):
            I.copy_links(cur, "Tipo Ruim", 1, 2)
    assert sorted(_links(db, "task", 2)) == sorted([a, b])
    assert _links(db, "task", 1) == sorted([a, b])             # a origem não mudou


@pytestmark_db
def test_contrato_funciona_com_cursor_de_dicionario_como_o_da_violet(db):
    """Regressão: a Violet usa RealDictCursor; ler `linha[0]` dava KeyError e o vínculo sumia em silêncio."""
    import psycopg2
    import psycopg2.extras
    from agents.komi import tools as K

    a, b = _pessoa("Ana"), _pessoa("Bruno")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            assert I.link_people(cur, "journal_bullet", 1, [a]) == [a]
            assert I.sync_people(cur, "journal_bullet", 1, [b]) == {"added": [b], "removed": [a]}
            assert I.copy_links(cur, "journal_bullet", 1, 2) == 1
            assert I.unlink_person(cur, b, "journal_bullet", 2) == 1
            assert I.unlink_all(cur, "journal_bullet", 1) == 1
            # create_person_on_cursor também lê linhas do cursor do chamador (colisão, anotação inicial)
            ok = K.create_person_on_cursor(cur, "Carla", nickname="Cá", notes="gosta de chá")
            assert ok["status"] == "ok"
            dup = K.create_person_on_cursor(cur, "Outra", nickname="cá")
            assert dup["status"] == "error" and "Carla" in dup["message"]
        conn.commit()
    finally:
        conn.close()
    assert [r["text"] for r in K.run_select("SELECT text FROM person_notes")] == ["gosta de chá"]


def test_rows_valor_le_tupla_e_dicionario():
    from agents.komi.rows import valor
    assert valor(("x", 2), 1, "n") == 2
    assert valor({"s": "x", "n": 2}, 1, "n") == 2
