"""Módulo de conexão PostgreSQL compartilhado entre os agentes.

Fornece helpers run_select() e run_dml() que substituem o padrão BigQuery
_run_select/_run_dml usado por Nami e Frieren.
"""

import os
from contextlib import contextmanager
from decimal import Decimal
from typing import Generator

import psycopg2
import psycopg2.extras


def _get_dsn() -> str:
    """Retorna a connection string PostgreSQL limpa (sem variantes asyncpg).

    O ADK adiciona '+asyncpg' na URL internamente. Aqui usamos psycopg2
    síncrono nas tools, então removemos o prefixo extra se existir.
    """
    url = os.environ["DATABASE_URL"]
    # Remove sufixo de driver async que o ADK pode ter adicionado
    for variant in ("+asyncpg", "+pg8000", "+aiopg"):
        url = url.replace(variant, "")
    return url


@contextmanager
def get_conn() -> Generator[psycopg2.extensions.connection, None, None]:
    """Abre uma conexão PostgreSQL com commit automático ao sair.

    Em caso de exceção, faz rollback e propaga o erro.

    Yields:
        Conexão psycopg2 pronta para uso.
    """
    conn = psycopg2.connect(_get_dsn())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _normalize_row(row: dict) -> dict:
    """Converte tipos PostgreSQL não-nativos para equivalentes Python simples.

    psycopg2 retorna colunas NUMERIC como decimal.Decimal. O código dos agentes
    faz aritmética com float, então a mistura causa TypeError. Convertemos aqui
    de forma centralizada para não precisar de float() espalhado por todo o código.
    """
    return {
        k: float(v) if isinstance(v, Decimal) else v
        for k, v in row.items()
    }


def run_select(sql: str, params: dict | None = None) -> list[dict]:
    """Executa uma query SELECT e retorna lista de dicionários.

    Args:
        sql: Query SQL com placeholders %(nome)s.
        params: Dicionário de parâmetros para substituir nos placeholders.

    Returns:
        Lista de dicionários, um por linha retornada. Campos NUMERIC vêm como float.
    """
    with get_conn() as conn:
        # RealDictCursor retorna cada linha como dict {coluna: valor}
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or {})
            return [_normalize_row(dict(row)) for row in cur.fetchall()]


def run_dml(sql: str, params: dict | None = None) -> int:
    """Executa uma operação INSERT, UPDATE ou DELETE.

    Args:
        sql: SQL com placeholders %(nome)s.
        params: Dicionário de parâmetros.

    Returns:
        Número de linhas afetadas (rowcount).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or {})
            # psycopg2 retorna o número de linhas afetadas pelo comando DML
            return cur.rowcount
