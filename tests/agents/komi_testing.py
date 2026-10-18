"""Apoio compartilhado dos testes de banco da Komi (spec 077).

Fica fora de ``conftest.py`` de propósito: só os testes da Komi precisam recriar o
schema, e os demais agentes não devem pagar esse custo.

Usage:
    from tests.agents.komi_testing import reset_komi_schema
"""

from agents.db import get_conn
from agents.komi import schema

# Todas as tabelas da Komi, dependentes primeiro. DROP ... CASCADE só descarta as
# chaves estrangeiras, então listamos tudo para o isolamento entre testes ser total.
KOMI_TABLES = (
    "person_group_members person_groups person_relations person_relation_kinds "
    "person_memory_summaries person_interactions person_notes person_categories "
    "komi_migrations person_links person_dates person_aliases people"
)


def reset_komi_schema() -> None:
    """Derrubar todas as tabelas da Komi e recriá-las a partir de ``schema_pg.sql``.

    Também zera a memória do ``ensure_schema`` (o processo "esquece" que já aplicou),
    senão ele acharia que as tabelas ainda existem.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {KOMI_TABLES.replace(' ', ', ')} CASCADE")
    schema.reset_for_tests()
    assert schema.ensure_schema(force=True), "não foi possível aplicar o schema da Komi no banco de teste"
