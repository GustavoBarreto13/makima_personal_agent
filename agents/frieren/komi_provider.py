"""Provedor da Frieren para a Memória da Komi (spec 077): livros vinculados a uma pessoa.

Segue o contrato de ``agents.komi.integration``. Ex.: um livro presenteado por, ou
emprestado a, alguém.

Usage:
    >>> from agents.frieren.komi_provider import LINK_TYPES
    >>> LINK_TYPES[0]["entity_type"]
    'book'
"""

from __future__ import annotations

from agents.db import run_select


def _resolve(ids: list[str]) -> list[dict]:
    """Buscar os livros (não apagados) vinculados à pessoa.

    Args:
        ids: IDs dos livros (texto) gravados em ``person_links``.

    Returns:
        Itens da Memória. A data é a de término, senão a de início, senão a de cadastro.
    """
    linhas = run_select(
        """
        SELECT bk.id, bk.title, bk.author, bk.status,
               COALESCE(bk.date_finished, bk.date_started, bk.created_at::date)::text AS dia
        FROM books bk WHERE bk.id = ANY(%(ids)s) AND bk.deleted = FALSE
        """,
        {"ids": [str(i) for i in ids]},
    )
    return [
        {
            "entity_id": r["id"],
            "title": r["title"],
            "snippet": " · ".join(x for x in (r["author"], r["status"]) if x),
            "date": r["dia"],
            "deep_link": f"/books#livro/{r['id']}",
            "context": "personal",
        }
        for r in linhas
    ]


def _summary(person_id: str) -> dict:
    """Montar o bloco ``livros`` do resumo da pessoa.

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"livros": [{id, title, author, status, rating}, ...]}`` em ordem alfabética.
    """
    livros = run_select(
        """
        SELECT bk.id, bk.title, bk.author, bk.status, bk.rating
        FROM person_links pl
        JOIN books bk ON bk.id = pl.entity_id AND bk.deleted = FALSE
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'book'
        ORDER BY bk.title
        """,
        {"pid": person_id},
    )
    return {"livros": livros}


LINK_TYPES = [
    {
        "entity_type": "book",
        "agent": "frieren",
        "label": "Livros",
        "icon": "book",
        "resolve": _resolve,
        "summary_key": "livros",
        "summary": _summary,
    }
]
