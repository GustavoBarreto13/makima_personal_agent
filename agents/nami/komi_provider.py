"""Provedor da Nami para a Memória da Komi (spec 077): transações vinculadas a uma pessoa.

Segue o contrato de ``agents.komi.integration``: a Komi descobre este arquivo sozinha e
passa a mostrar, no perfil da pessoa, as transações em que ela foi citada — sem conhecer
as tabelas da Nami.

Usage:
    >>> from agents.nami.komi_provider import LINK_TYPES
    >>> LINK_TYPES[0]["entity_type"]
    'transaction'
"""

from __future__ import annotations

from agents.db import run_select


def _brl(valor) -> str:
    """Formatar um valor em reais no padrão brasileiro.

    Args:
        valor: Número (``Decimal``, ``float`` ou ``int``).

    Returns:
        Texto como ``R$ 1.234,50``.

    Example:
        >>> _brl(1234.5)
        'R$ 1.234,50'
    """
    americano = f"{float(valor):,.2f}"  # 1,234.50
    return "R$ " + americano.replace(",", "§").replace(".", ",").replace("§", ".")


def _resolve(ids: list[str]) -> list[dict]:
    """Buscar as transações (não apagadas) vinculadas à pessoa.

    Args:
        ids: IDs das transações (texto) gravados em ``person_links``.

    Returns:
        Itens da Memória; transações apagadas simplesmente não aparecem.
    """
    linhas = run_select(
        """
        SELECT t.id, t.name, t.valor, t.tipo, t.categoria, t.data::text AS dia
        FROM transactions t WHERE t.id = ANY(%(ids)s) AND t.deleted = FALSE
        """,
        {"ids": [str(i) for i in ids]},
    )
    return [
        {
            "entity_id": r["id"],
            "title": r["name"],
            "snippet": f"{_brl(r['valor'])} · {r['categoria']} · {r['tipo']}",
            "date": r["dia"],
            "deep_link": "/nami",
            "context": "personal",
        }
        for r in linhas
    ]


def _summary(person_id: str) -> dict:
    """Montar o bloco ``financas`` do resumo da pessoa (saldo + últimas transações).

    Saldo = receitas − despesas das transações vinculadas: positivo = te devem.

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"saldo": float, "transacoes": [...]}`` (até 10 transações, mais recentes primeiro).
    """
    transacoes = run_select(
        """
        SELECT t.id, t.name, t.valor, t.tipo, t.categoria, t.data::text
        FROM person_links pl
        JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'transaction'
        ORDER BY t.data DESC LIMIT 10
        """,
        {"pid": person_id},
    )
    saldo = run_select(
        """
        SELECT COALESCE(SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor ELSE -t.valor END), 0) AS saldo
        FROM person_links pl
        JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'transaction'
        """,
        {"pid": person_id},
    )
    return {"saldo": float(saldo[0]["saldo"]) if saldo else 0.0, "transacoes": transacoes}


LINK_TYPES = [
    {
        "entity_type": "transaction",
        "agent": "nami",
        "label": "Finanças",
        "icon": "money",
        "resolve": _resolve,
        "summary_key": "financas",
        "summary": _summary,
    }
]
