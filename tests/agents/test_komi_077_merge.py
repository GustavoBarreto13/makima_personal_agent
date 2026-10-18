"""Spec 077 · Fase 4b — mesclar pessoas, desvincular e vincular item, com as tabelas REAIS dos agentes.

Prova que a mescla leva tudo (vínculos de vários agentes, interações, anotações, datas, relações,
grupos), reescreve os tokens ``@[Nome](komi:id)`` em textos da Violet e o "aguardando" da Kaguya, e que
desvincular um bullet também tira a menção do texto.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_merge.py -v
"""

import os

import pytest

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytest.fixture(scope="module")
def banco():
    from tests.agents.komi_testing import banco_completo
    with banco_completo("komi_merge_pytest") as dsn:
        yield dsn


def _sql(sql, params=None, um=False, todas=False):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        if um:
            return cur.fetchone()
        if todas:
            return cur.fetchall()


def test_mesclar_leva_tudo_reescreve_tokens_e_registra_o_rastro(banco):
    from agents.journal import tools as J
    from agents.komi import integration as I, tools as K, tools_interactions as TI, tools_merge as M
    from agents.komi import tools_notes as TN, tools_relations as R

    keep = K.create_person("Ana Lima")["id"]
    drop = K.create_person("Ana", nickname="Aninha", context="work", phone="81 99999-1234", city="Recife",
                           birth_day=15, birth_month=5, birth_year=1990)["id"]
    outro = K.create_person("Bruno")["id"]
    K.add_alias(drop, "Anita")

    # ── dados de vários agentes ──
    _sql("INSERT INTO transactions (id, name, valor, tipo, categoria, conta, data) VALUES ('tx1','Almoço',50,'Despesa','Alimentação','Nubank','2026-10-01')")
    inbox = _sql("SELECT id FROM task_projects WHERE is_inbox LIMIT 1", um=True)[0]
    t_comum = _sql("INSERT INTO tasks (project_id, title) VALUES (%s,'Enviar convite') RETURNING id", (inbox,), um=True)[0]
    t_espera = _sql("INSERT INTO tasks (project_id, title, waiting_person_id, description) VALUES (%s,'Aguardar resposta',%s,%s) RETURNING id",
                    (inbox, drop, f"combinar com @[Ana](komi:{drop}) e @[Bruno](komi:{outro})"), um=True)[0]
    pagina = J.ensure_page("2026-10-05")["page"]["id"]
    bullet = J.upsert_bullet(pagina, 0, f"jantar com @[Ana](komi:{drop})")["bullet"]["id"]
    carta = J.create_letter(pagina, "Ana", f"Querida @[Ana](komi:{drop}), obrigado", person_ids=[drop])["letter"]["id"]
    with __import__("agents.db", fromlist=["get_conn"]).get_conn() as conn, conn.cursor() as cur:
        I.link_people(cur, "transaction", "tx1", [drop])
        I.link_people(cur, "task", t_comum, [drop, keep])                       # as duas: não duplica
    TI.log_interaction(drop, kind="ligacao", happened_at="2026-10-01")
    TI.log_interaction(drop, kind="encontro", happened_at="2026-10-02")
    TN.add_person_note(keep, "gosta de chá")
    TN.add_person_note(drop, "Gosta de chá")                                     # igual → não duplica
    TN.add_person_note(drop, "alérgica a amendoim")
    K.add_important_date(keep, "casamento", "2018-06-20")
    K.add_important_date(drop, "casamento", "2018-06-20")                        # igual → descartada
    K.add_important_date(drop, "formatura", "2012-12-01")                        # única → passa
    R.relate_people(drop, outro, "amigo")
    R.relate_people(drop, keep, "colega")                                        # vira "Ana Lima é colega de Ana Lima" → descartada
    g1, g2 = R.create_group("Turma")["id"], R.create_group("Vizinhos")["id"]
    R.add_to_group(g1, keep); R.add_to_group(g1, drop); R.add_to_group(g2, drop)
    _sql("INSERT INTO person_memory_summaries (person_id, context, summary, source_hash) VALUES (%s,'all','{}'::jsonb,'x')", (drop,))

    # ── prévia: conta o que vai mudar, sem mudar nada ──
    previa = M.preview_merge(keep, drop)
    assert previa["status"] == "ok"
    assert previa["moves"]["links"] == {"transaction": 1, "task": 1, "journal_bullet": 1, "journal_letter": 1}
    assert (previa["moves"]["interactions"], previa["moves"]["notes"], previa["moves"]["dates"], previa["moves"]["relations"], previa["moves"]["groups"]) == (2, 2, 2, 2, 2)
    assert previa["context"] == "both" and previa["birthday"] is True
    assert previa["fill"] == {"phone": "81 99999-1234", "city": "Recife"}
    assert set(previa["aliases"]) == {"Ana", "Anita"}                          # Aninha será adotado como Apelido
    assert K.get_person(drop)["status"] == "ok"                                 # nada mudou ainda

    # ── mescla ──
    r = M.merge_people(keep, drop)
    assert r["status"] == "ok" and r["warnings"] == []
    assert r["moved"]["agents"] == {"violet": 2, "kaguya": 1}                   # bullet+carta; 1 tarefa (aguardando + descrição)
    assert K.get_person(drop)["status"] == "error"                              # saiu de cena
    assert _sql("SELECT deleted, merged_into FROM people WHERE id=%s", (drop,), um=True) == (True, keep)
    assert "mesclada" in K.restore_person(drop)["message"]                       # e não volta

    perfil = K.get_person(keep)["perfil"]
    assert (perfil["phone"], perfil["city"], perfil["nickname"], perfil["context"]) == ("81 99999-1234", "Recife", "Aninha", "both")
    assert (perfil["birth_day"], perfil["birth_month"], perfil["birth_year"]) == (15, 5, 1990)
    assert {a["alias"] for a in K.get_person(keep)["aliases"]} == {"Ana", "Anita"}
    for nome in ("Ana", "aninha", "Anita", "Ana Lima"):
        assert [p["id"] for p in K.find_people_exact(nome)] == [keep], nome     # qualquer forma resolve a pessoa que ficou

    # vínculos, interações, notas, datas, relações e grupos
    assert _sql("SELECT entity_type FROM person_links WHERE person_id=%s ORDER BY 1", (keep,), todas=True) == \
        [("journal_bullet",), ("journal_letter",), ("task",), ("transaction",)]
    assert _sql("SELECT count(*) FROM person_links WHERE person_id=%s", (drop,), um=True)[0] == 0
    assert _sql("SELECT count(*) FROM person_interactions WHERE person_id=%s", (keep,), um=True)[0] == 2
    assert sorted(x[0] for x in _sql("SELECT text FROM person_notes WHERE person_id=%s AND deleted=FALSE", (keep,), todas=True)) == ["alérgica a amendoim", "gosta de chá"]
    assert sorted(x[0] for x in _sql("SELECT label FROM person_dates WHERE person_id=%s", (keep,), todas=True)) == ["casamento", "formatura"]
    assert [(x["other_name"], x["kind"]) for x in R.list_relations(keep)["relations"]] == [("Bruno", "amigo")]
    assert _sql("SELECT count(*) FROM person_group_members WHERE person_id=%s", (keep,), um=True)[0] == 2
    assert _sql("SELECT count(*) FROM person_memory_summaries", um=True)[0] == 0

    # tokens e "aguardando" apontam para quem ficou
    assert _sql("SELECT content FROM journal_bullets WHERE id=%s", (bullet,), um=True)[0] == f"jantar com @[Ana Lima](komi:{keep})"
    assert _sql("SELECT body FROM journal_letters WHERE id=%s", (carta,), um=True)[0] == f"Querida @[Ana Lima](komi:{keep}), obrigado"
    assert _sql("SELECT person_id FROM journal_mentions WHERE bullet_id=%s AND kind='person'", (bullet,), um=True)[0] == keep
    assert _sql("SELECT waiting_person_id, description FROM tasks WHERE id=%s", (t_espera,), um=True) == \
        (keep, f"combinar com @[Ana Lima](komi:{keep}) e @[Bruno](komi:{outro})")

    # erros
    assert M.merge_people(keep, drop)["status"] == "error"                       # a absorvida já saiu
    assert M.merge_people(keep, keep)["status"] == "error"
    assert M.merge_people(keep, "nao-existe")["status"] == "error"
    assert M.preview_merge(keep, drop)["status"] == "error"


def test_mesclar_pessoas_com_apelido_igual_ao_nome_da_outra_nao_colide(banco):
    """O apelido da absorvida pode ser exatamente o nome da que fica (cadastros cruzados)."""
    from agents.komi import tools as K, tools_merge as M
    keep = K.create_person("Rafa Souza")["id"]
    drop = K.create_person("Rafael", nickname="Rafa Souza2")["id"]
    assert M.merge_people(keep, drop)["status"] == "ok"
    assert [p["id"] for p in K.find_people_exact("Rafael")] == [keep]


def test_desvincular_bullet_tira_a_mencao_do_texto_e_nao_volta_a_editar(banco):
    from agents.journal import tools as J
    from agents.komi import integration as I, tools as K
    bia = K.create_person("Bia Unlink")["id"]
    pagina = J.ensure_page("2026-10-06")["page"]["id"]
    b = J.upsert_bullet(pagina, 0, f"café com @[Bia Unlink](komi:{bia}) e planos")["bullet"]["id"]
    assert _sql("SELECT count(*) FROM person_links WHERE person_id=%s AND entity_type='journal_bullet'", (bia,), um=True)[0] == 1

    r = I.unlink_item(bia, "journal_bullet", b)
    assert r == {"status": "ok", "removed": 1, "undoable": False}               # mexe no texto: confirmar, não desfazer
    assert _sql("SELECT content FROM journal_bullets WHERE id=%s", (b,), um=True)[0] == "café com Bia Unlink e planos"
    assert _sql("SELECT count(*) FROM person_links WHERE person_id=%s", (bia,), um=True)[0] == 0
    assert _sql("SELECT count(*) FROM journal_mentions WHERE bullet_id=%s AND kind='person'", (b,), um=True)[0] == 0
    J.upsert_bullet(pagina, 0, "café com Bia Unlink e planos, de novo")          # editar depois NÃO recria o vínculo
    assert _sql("SELECT count(*) FROM person_links WHERE person_id=%s", (bia,), um=True)[0] == 0
    assert I.unlink_item(bia, "journal_bullet", b)["status"] == "error"           # já não existe


def test_desvincular_e_revincular_transacao_e_validacoes(banco):
    from agents.komi import integration as I, tools as K
    ana = K.create_person("Ana Link")["id"]
    _sql("INSERT INTO transactions (id, name, valor, tipo, categoria, conta, data) VALUES ('txl','Jantar',80,'Despesa','Lazer','Nubank','2026-10-01')")
    with __import__("agents.db", fromlist=["get_conn"]).get_conn() as conn, conn.cursor() as cur:
        I.link_people(cur, "transaction", "txl", [ana])
    assert I.unlink_item(ana, "transaction", "txl") == {"status": "ok", "removed": 1, "undoable": True}
    assert I.unlink_item(ana, "transaction", "txl")["status"] == "error"
    assert I.link_item(ana, "transaction", "txl")["status"] == "ok"               # o Desfazer
    assert _sql("SELECT count(*) FROM person_links WHERE person_id=%s AND entity_id='txl'", (ana,), um=True)[0] == 1
    assert "não encontrado" in I.link_item(ana, "transaction", "fantasma")["message"].lower()
    assert I.link_item(ana, "task_waiting", "1")["status"] == "error"             # tipo sem resolve não se vincula à mão
    assert I.link_item(ana, "Tipo Ruim", "1")["status"] == "error"
    assert I.link_item("nao-existe", "transaction", "txl")["status"] == "error"
    assert I.unlink_item(ana, "Tipo Ruim", "1")["status"] == "error"


def test_desvincular_aguardando_libera_a_tarefa(banco):
    from agents.komi import integration as I, tools as K
    ana = K.create_person("Ana Espera")["id"]
    inbox = _sql("SELECT id FROM task_projects WHERE is_inbox LIMIT 1", um=True)[0]
    t = _sql("INSERT INTO tasks (project_id, title, waiting_person_id, follow_up_date) VALUES (%s,'Cobrar',%s,'2026-10-20') RETURNING id", (inbox, ana), um=True)[0]
    assert I.unlink_item(ana, "task_waiting", t) == {"status": "ok", "removed": 1, "undoable": False}
    assert _sql("SELECT waiting_person_id, follow_up_date FROM tasks WHERE id=%s", (t,), um=True) == (None, None)
    assert I.unlink_item(ana, "task_waiting", t)["status"] == "error"             # já estava livre
