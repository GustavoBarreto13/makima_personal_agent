"""Testes de integração dos vínculos cross-agent da Komi (spec 014 / FR-009).

Cenários cobertos:
    SC-003  Rollback de transação não persiste vínculos (atomicidade)
    SC-004  Múltiplas pessoas vinculadas ao mesmo item
    SC-005  Idempotência de link (ON CONFLICT DO NOTHING)
    SC-006  create_person_on_cursor — criação transacional sem commit próprio
    SC-007  Vínculo com entity_type inválido é rejeitado pelo CHECK do banco

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_komi_links.py -v

Sem DATABASE_URL o módulo inteiro é pulado.
"""

import os
import uuid

import psycopg2
import pytest

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes cross-agent da Komi pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.komi import tools as K  # noqa: E402

_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "komi", "schema_pg.sql",
)

_KOMI_TABLES = "person_links person_dates person_aliases people"


@pytest.fixture(autouse=True)
def reset_komi_schema():
    """Recria as tabelas Komi antes de cada teste."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_KOMI_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
    yield


def _make_person(name: str = "Teste Pessoa") -> str:
    """Cria uma pessoa e retorna seu ID."""
    r = K.create_person(name=name)
    assert r["status"] == "ok"
    return r["person"]["id"]


# ─────────────────────────────────────────────────────────────────────────────
# SC-003 — Rollback não persiste vínculos (atomicidade)
# ─────────────────────────────────────────────────────────────────────────────

def test_rollback_does_not_persist_links():
    """Se a transação é revertida, o vínculo em person_links não existe."""
    pid = _make_person("Alice Rollback")
    fake_tx_id = str(uuid.uuid4())

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            K.link_person_on_cursor(cur, pid, "transaction", fake_tx_id)
            # Força rollback sem commitar
        conn.rollback()
    finally:
        conn.close()

    rows = run_select(
        "SELECT COUNT(*) AS c FROM person_links WHERE person_id = %s AND entity_id = %s",
        (pid, fake_tx_id),
    )
    assert rows[0]["c"] == 0, "Vínculo não deveria existir após rollback"


# ─────────────────────────────────────────────────────────────────────────────
# SC-004 — Múltiplas pessoas no mesmo item
# ─────────────────────────────────────────────────────────────────────────────

def test_multiple_persons_linked_to_same_item():
    """Dois person_ids diferentes podem ser vinculados ao mesmo entity_id."""
    pid1 = _make_person("Pessoa A")
    pid2 = _make_person("Pessoa B")
    entity_id = str(uuid.uuid4())

    with get_conn() as conn:
        with conn.cursor() as cur:
            K.link_person_on_cursor(cur, pid1, "transaction", entity_id)
            K.link_person_on_cursor(cur, pid2, "transaction", entity_id)

    rows = run_select(
        "SELECT person_id FROM person_links WHERE entity_type = 'transaction' AND entity_id = %s",
        (entity_id,),
    )
    person_ids_found = {r["person_id"] for r in rows}
    assert pid1 in person_ids_found
    assert pid2 in person_ids_found


def test_same_person_multiple_entity_types():
    """A mesma pessoa pode ser vinculada a tipos diferentes de entidade."""
    pid = _make_person("Multi-vínculo")
    tx_id = str(uuid.uuid4())
    task_id = 99
    book_id = str(uuid.uuid4())

    with get_conn() as conn:
        with conn.cursor() as cur:
            K.link_person_on_cursor(cur, pid, "transaction", tx_id)
            K.link_person_on_cursor(cur, pid, "task", task_id)
            K.link_person_on_cursor(cur, pid, "book", book_id)

    rows = run_select(
        "SELECT entity_type FROM person_links WHERE person_id = %s ORDER BY entity_type",
        (pid,),
    )
    types_found = {r["entity_type"] for r in rows}
    assert types_found == {"transaction", "task", "book"}


# ─────────────────────────────────────────────────────────────────────────────
# SC-005 — Idempotência (ON CONFLICT DO NOTHING)
# ─────────────────────────────────────────────────────────────────────────────

def test_link_idempotent_across_transactions():
    """Chamar link_person_on_cursor duas vezes para os mesmos dados não cria duplicata."""
    pid = _make_person("Idem Potente")
    entity_id = str(uuid.uuid4())

    for _ in range(3):
        with get_conn() as conn:
            with conn.cursor() as cur:
                K.link_person_on_cursor(cur, pid, "transaction", entity_id)

    rows = run_select(
        "SELECT COUNT(*) AS c FROM person_links WHERE person_id = %s AND entity_id = %s",
        (pid, entity_id),
    )
    assert rows[0]["c"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# SC-006 — create_person_on_cursor (criação transacional)
# ─────────────────────────────────────────────────────────────────────────────

def test_create_person_on_cursor_no_auto_commit():
    """create_person_on_cursor insere a pessoa sem commit; rollback apaga tudo."""
    name = "Transacional Puro"

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            result = K.create_person_on_cursor(cur, name=name)
        assert result["status"] == "ok"
        pid = result["person"]["id"]
        conn.rollback()
    finally:
        conn.close()

    # Pessoa não deve existir após rollback
    result2 = K.get_person(pid)
    assert result2["status"] == "error"


def test_create_person_on_cursor_then_commit():
    """create_person_on_cursor seguido de commit persiste a pessoa."""
    name = "Transacional Commitado"
    saved_pid = None

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            result = K.create_person_on_cursor(cur, name=name)
        assert result["status"] == "ok"
        saved_pid = result["person"]["id"]
        conn.commit()
    finally:
        conn.close()

    # Pessoa deve existir após commit
    result2 = K.get_person(saved_pid)
    assert result2["status"] == "ok"
    assert result2["person"]["name"] == name


# ─────────────────────────────────────────────────────────────────────────────
# SC-007 — entity_type inválido é rejeitado
# ─────────────────────────────────────────────────────────────────────────────

def test_link_invalid_entity_type_raises():
    """link_person_on_cursor com entity_type não reconhecido falha no CHECK do banco."""
    pid = _make_person("Tipo Inválido")

    with pytest.raises(Exception):
        with get_conn() as conn:
            with conn.cursor() as cur:
                # "invoice" não está no CHECK (entity_type IN (...))
                K.link_person_on_cursor(cur, pid, "invoice", "any-id")
