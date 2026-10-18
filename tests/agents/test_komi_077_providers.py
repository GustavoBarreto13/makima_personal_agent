"""Spec 077 · Fase 2 — provedores REAIS de backlinks (Nami, Kaguya, Violet, Frieren, Akane).

Cria um banco descartável com as tabelas de verdade de cada agente e confere que a
Memória da pessoa e o resumo (``get_person_summary``) saem certos — inclusive a separação
trabalho × pessoal pelo espaço da lista da tarefa e a sobrevivência a itens apagados.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_providers.py -v
"""

import os
from pathlib import Path

import pytest

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Komi pulados.", allow_module_level=True)

import psycopg2  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
# A Komi vem ANTES da Kaguya: o schema da Kaguya referencia person_dates (sync de aniversário).
SCHEMAS = ["agents/komi/schema_pg.sql", "agents/nami/schema_pg.sql", "agents/frieren/schema_pg.sql",
           "agents/kaguya/schema_tasks_pg.sql", "agents/akane/schema_pg.sql"]
NOME_BANCO = "komi_prov_pytest"


@pytest.fixture(scope="module")
def banco():
    """Banco temporário com os schemas de todos os agentes; restaura o DATABASE_URL no fim."""
    original = os.environ["DATABASE_URL"]
    admin = psycopg2.connect(original)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {NOME_BANCO}")
        cur.execute(f"CREATE DATABASE {NOME_BANCO}")
    novo = original.rsplit("/", 1)[0] + "/" + NOME_BANCO
    os.environ["DATABASE_URL"] = novo
    try:
        conn = psycopg2.connect(novo)
        conn.autocommit = True
        with conn.cursor() as cur:
            for arq in SCHEMAS:
                cur.execute((RAIZ / arq).read_text(encoding="utf-8"))
        conn.close()
        from agents.journal import tools as J
        # A Violet lê o DSN uma única vez, no import (constante de módulo): aponta para o banco
        # temporário só durante o teste e restaura depois.
        dsn_violet = J._DATABASE_URL
        J._DATABASE_URL = novo
        J._ensure_tables()
        from agents.komi import integration, schema
        schema.reset_for_tests()
        integration.reset_providers()
        yield novo
    finally:
        try:
            J._DATABASE_URL = dsn_violet
        except NameError:  # a fixture falhou antes de importar o módulo
            pass
        os.environ["DATABASE_URL"] = original
        with admin.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {NOME_BANCO}")
        admin.close()


def _sql(sql, params=None, um=False):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone() if um else None


def test_memoria_e_resumo_com_os_provedores_reais(banco):
    from agents.komi import integration as I, tools as K

    bia = K.create_person("Beatriz", nickname="Bia", context="both")["id"]

    # ── dados de cada agente ────────────────────────────────────────────────
    _sql("""INSERT INTO transactions (id, name, valor, tipo, categoria, conta, data) VALUES
            ('tx1','Jantar com a Bia',100,'Receita','Alimentação','Nubank','2026-10-01'),
            ('tx2','Cinema',30,'Despesa','Lazer','Nubank','2026-10-02'),
            ('tx3','Apagada',999,'Despesa','Lazer','Nubank','2026-10-03')""")
    _sql("UPDATE transactions SET deleted = TRUE WHERE id = 'tx3'")
    _sql("INSERT INTO task_projects (name, context) VALUES ('Escritório', 'work')")
    trabalho = _sql("SELECT id FROM task_projects WHERE name='Escritório'", um=True)[0]
    pessoal = _sql("SELECT id FROM task_projects WHERE is_inbox LIMIT 1", um=True)[0]
    t_trab = _sql("INSERT INTO tasks (project_id, title, due_date) VALUES (%s,'Enviar relatório','2026-10-06') RETURNING id", (trabalho,), um=True)[0]
    t_pess = _sql("INSERT INTO tasks (project_id, title, completed_at) VALUES (%s,'Comprar presente', NOW()) RETURNING id", (pessoal,), um=True)[0]
    t_wait = _sql("INSERT INTO tasks (project_id, title, waiting_person_id, follow_up_date) VALUES (%s,'Aguardar contrato',%s,'2026-10-08') RETURNING id", (trabalho, bia), um=True)[0]
    _sql("INSERT INTO books (id, title, author, status) VALUES ('bk1','Dom Casmurro','Machado','lido')")
    _sql("INSERT INTO movies (id, title, normalizado) VALUES ('mv1','Matrix','matrix')")
    _sql("INSERT INTO diary_entries (id, movie_id, movie_title, watched_date, rating) VALUES ('de1','mv1','Matrix','2026-10-04',4.5)")
    pagina = _sql("INSERT INTO journal_pages (date) VALUES ('2026-10-05') RETURNING id", um=True)[0]
    b_id = _sql("INSERT INTO journal_bullets (page_id, content, position) VALUES (%s,'jantar com @[Bia](komi:%s)',0) RETURNING id" % ("%s", bia), (pagina,), um=True)[0]
    l_id = _sql("INSERT INTO journal_letters (page_id, recipient, body) VALUES (%s,'Bia','Querida Bia, obrigado por tudo') RETURNING id", (pagina,), um=True)[0]

    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        for tipo, eid in [("transaction", "tx1"), ("transaction", "tx2"), ("transaction", "tx3"), ("task", t_trab),
                          ("task", t_pess), ("book", "bk1"), ("movie_diary_entry", "de1"),
                          ("journal_bullet", b_id), ("journal_letter", l_id)]:
            I.link_people(cur, tipo, eid, [bia])

    # ── Memória ─────────────────────────────────────────────────────────────
    mem = I.get_person_memory(bia)
    assert mem["status"] == "ok" and mem["unavailable"] == []
    por_titulo = {i["title"]: i for i in mem["items"]}
    assert "Apagada" not in por_titulo                                  # transação apagada some, sem erro
    assert por_titulo["Enviar relatório"]["context"] == "work"          # espaço vem da LISTA da tarefa
    assert por_titulo["Enviar relatório"]["deep_link"] == f"/tasks#tarefa/{t_trab}"
    assert por_titulo["Comprar presente"]["context"] == "personal" and por_titulo["Comprar presente"]["snippet"] == "Concluída"
    assert por_titulo["Aguardar contrato"]["agent"] == "kaguya" and por_titulo["Aguardar contrato"]["context"] == "work"
    assert por_titulo["Aguardar contrato"]["snippet"] == "Cobrar em 2026-10-08"
    assert por_titulo["Matrix"]["deep_link"] == "/movies#filme/mv1" and por_titulo["Matrix"]["snippet"] == "★ 4.5"
    assert por_titulo["Dom Casmurro"]["deep_link"] == "/books#livro/bk1"
    assert por_titulo["Jantar com a Bia"]["snippet"].startswith("R$ 100,00")
    assert por_titulo["jantar com @Bia"]["deep_link"] == "/journal#dia/2026-10-05"       # token virou texto legível
    assert por_titulo["Carta para Bia"]["deep_link"] == f"/journal#carta/{l_id}"
    assert mem["counts"] == {"nami": 2, "kaguya": 3, "frieren": 1, "akane": 1, "violet": 2}
    assert {i["title"] for i in I.get_person_memory(bia, context="work")["items"]} == {"Enviar relatório", "Aguardar contrato"}

    # ── Resumo (formato antigo preservado + blocos novos) ───────────────────
    r = K.get_person_summary(bia)
    assert r["financas"]["saldo"] == 70.0 and len(r["financas"]["transacoes"]) == 2
    assert [t["title"] for t in r["tarefas"]["abertas"]] == ["Enviar relatório"]
    assert [t["title"] for t in r["tarefas"]["concluidas"]] == ["Comprar presente"]
    assert r["diario"]["contagem"] == 1 and r["diario"]["trechos"][0]["texto"] == "jantar com @Bia"
    assert r["diario"]["trechos"][0]["bullet_id"] == b_id
    assert r["cartas"]["cartas"][0]["deep_link"] == f"/journal#carta/{l_id}"
    assert [l["title"] for l in r["livros"]["livros"]] == ["Dom Casmurro"]
    assert r["filmes"]["filmes"][0]["title"] == "Matrix" and r["filmes"]["filmes"][0]["rating"] == 4.5
    assert [i["title"] for i in r["aguardando"]["itens"]] == ["Aguardar contrato"]

    # tarefa apagada de verdade some da Memória e do resumo
    _sql("UPDATE tasks SET deleted_at = NOW() WHERE id = %s", (t_trab,))
    assert "Enviar relatório" not in {i["title"] for i in I.get_person_memory(bia)["items"]}
    assert K.get_person_summary(bia)["tarefas"]["abertas"] == []
