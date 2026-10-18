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


# ─────────────────────────────────────────────────────────────────────────────
# Banco temporário com os schemas de TODOS os agentes que a Komi integra
# ─────────────────────────────────────────────────────────────────────────────
import contextlib
import os
from pathlib import Path

# A Komi vem ANTES da Kaguya: o schema da Kaguya referencia person_dates (ponte do sync antigo).
SCHEMAS_COMPLETOS = [
    "agents/komi/schema_pg.sql", "agents/nami/schema_pg.sql", "agents/frieren/schema_pg.sql",
    "agents/kaguya/schema_tasks_pg.sql", "agents/akane/schema_pg.sql",
]


@contextlib.contextmanager
def banco_completo(nome: str = "komi_prov_pytest"):
    """Criar um banco temporário com as tabelas reais de Komi, Nami, Frieren, Kaguya, Akane e Violet.

    Aponta ``DATABASE_URL`` (e o DSN fixo da Violet, lido só no import) para o banco novo durante
    o ``with`` e restaura tudo no fim, apagando o banco.

    Args:
        nome: Nome do banco temporário.

    Yields:
        O DSN do banco temporário.
    """
    import psycopg2

    raiz = Path(__file__).resolve().parents[2]
    original = os.environ["DATABASE_URL"]
    admin = psycopg2.connect(original)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {nome}")
        cur.execute(f"CREATE DATABASE {nome}")
    novo = original.rsplit("/", 1)[0] + "/" + nome
    os.environ["DATABASE_URL"] = novo
    violet = None
    dsn_violet = None
    try:
        conn = psycopg2.connect(novo)
        conn.autocommit = True
        with conn.cursor() as cur:
            for arq in SCHEMAS_COMPLETOS:
                cur.execute((raiz / arq).read_text(encoding="utf-8"))
        conn.close()
        from agents.journal import tools as violet
        dsn_violet = violet._DATABASE_URL          # a Violet lê o DSN uma só vez, no import
        violet._DATABASE_URL = novo
        violet._ensure_tables()
        from agents.komi import integration
        schema.reset_for_tests()
        integration.reset_providers()
        yield novo
    finally:
        if violet is not None:
            violet._DATABASE_URL = dsn_violet
        os.environ["DATABASE_URL"] = original
        with admin.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {nome}")
        admin.close()
