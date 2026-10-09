"""Spec 075 fase 2 — o bloco DDL do schema que o script de migração aplica.

Puro (sem banco): garante que os marcadores existem, que o bloco cobre tudo o que o script
verifica como "pendente" e que o SQL é sintaticamente válido (quando ``pglast`` está instalado).
"""

import pytest

from scripts import migrate_kaguya_ds as M


def test_ddl_block_covers_every_checked_column_and_table():
    ddl = M._ddl_block()
    for table, column in M._NEW_COLUMNS:
        assert f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column}" in ddl, (table, column)
    for table in M._NEW_TABLES:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in ddl, table


def test_ddl_block_is_idempotent_by_construction():
    ddl = M._ddl_block()
    assert "DROP " not in ddl.upper().replace("-- ", "")
    assert "IF NOT EXISTS" in ddl and "ON CONFLICT (id) DO NOTHING" in ddl


def test_ddl_block_parses():
    pglast = pytest.importorskip("pglast")
    assert len(pglast.parse_sql(M._ddl_block())) > 10
