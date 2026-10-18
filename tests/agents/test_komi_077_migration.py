"""Spec 077 · Fase 1 — migração dos dados antigos da Komi (scripts/migrate_komi_ds.py).

Simula um banco "antigo" (pessoas com categoria Trabalho, apelidos soltos e observações
em ``people.notes``) e confere: o dry-run não grava nada, o ``--apply`` converte, e rodar
de novo não repete nem desfaz escolhas posteriores do dono.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_migration.py -v
"""

import os

import pytest

from scripts.migrate_komi_ds import planejar_apelidos


# ── planejador puro: roda sem banco ──────────────────────────────────────────

def test_planejar_apelidos_ignora_apelido_igual_ao_nome():
    linhas = [
        {"person_id": "1", "name": "Bia", "alias_id": 1, "alias": "BIA"},
        {"person_id": "2", "name": "Beatriz", "alias_id": 2, "alias": "Bia"},
        {"person_id": "3", "name": "José", "alias_id": 3, "alias": "jose"},
    ]
    assert [i["person_id"] for i in planejar_apelidos(linhas)] == ["2"]


# ── com banco ────────────────────────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


def _banco():
    """Importa sob demanda (o módulo de banco exige DATABASE_URL só ao conectar)."""
    from agents.db import get_conn
    from tests.agents.komi_testing import reset_komi_schema
    return get_conn, reset_komi_schema


def _semear_banco_antigo(get_conn):
    """Cria pessoas como o modelo ANTIGO as deixava (direto em SQL, sem passar pelas tools)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO people (id, name, normalizado, category, notes) VALUES
              ('a', 'Ana Trabalho', 'ana trabalho', 'trabalho', NULL),
              ('b', 'Beatriz',      'beatriz',      'amigos',   NULL),
              ('c', 'Carlos',       'carlos',       'amigos',   NULL),
              ('d', 'Dani',         'dani',         'familia',  'gosta de café'),
              ('e', 'Eva Chefe',    'eva chefe',    'trabalho', 'reunião às 9h')
        """)
        cur.execute("""
            INSERT INTO person_aliases (person_id, alias, normalizado) VALUES
              ('b', 'Bia', 'bia'), ('b', 'Betinha', 'betinha'), ('c', 'CARLOS', 'carlos2')
        """)


@pytestmark_db
def test_dry_run_nao_grava_nada_e_apply_converte_e_e_idempotente(capsys):
    get_conn, reset = _banco()
    reset()
    _semear_banco_antigo(get_conn)
    from scripts import migrate_komi_ds as M

    # dry-run: planeja, mas não grava
    rel = M.main(apply=False)
    assert rel["context_from_category"]["planejadas"] == 2
    assert rel["nickname_from_alias"]["planejadas"] == 1          # só a Beatriz (o apelido da Carlos = nome → ignorado)
    assert rel["notes_to_person_notes"]["planejadas"] == 2
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM people WHERE context = 'work'")
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM person_notes")
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM komi_migrations")
        assert cur.fetchone()[0] == 0

    # apply: converte
    rel = M.main(apply=True)
    assert rel["context_from_category"]["aplicadas"] == 2
    assert rel["nickname_from_alias"]["aplicadas"] == 1
    assert rel["notes_to_person_notes"]["aplicadas"] == 2
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, context FROM people WHERE context = 'work' ORDER BY id")
        assert cur.fetchall() == [("a", "work"), ("e", "work")]
        cur.execute("SELECT nickname, nickname_norm FROM people WHERE id = 'b'")
        assert cur.fetchone() == ("Bia", "bia")
        cur.execute("SELECT alias FROM person_aliases WHERE person_id = 'b'")
        assert cur.fetchall() == [("Betinha",)]                   # o 1º virou Apelido; o outro segue como "outra forma"
        cur.execute("SELECT person_id, context, text FROM person_notes ORDER BY person_id")
        # a observação da Eva (que virou Trabalho na etapa 1) nasce no espaço trabalho
        assert cur.fetchall() == [("d", "personal", "gosta de café"), ("e", "work", "reunião às 9h")]
        cur.execute("SELECT notes FROM people WHERE id = 'd'")
        assert cur.fetchone()[0] == "gosta de café"               # coluna antiga preservada como backup

    # uma escolha posterior do dono NÃO é desfeita por uma segunda execução
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE people SET context = 'personal' WHERE id = 'a'")
    rel = M.main(apply=True)
    assert all(v["ja_feita"] for v in rel.values())
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT context FROM people WHERE id = 'a'")
        assert cur.fetchone()[0] == "personal"
        cur.execute("SELECT count(*) FROM person_notes")
        assert cur.fetchone()[0] == 2                              # sem notas duplicadas
