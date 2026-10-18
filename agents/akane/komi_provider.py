"""Provedor da Akane para a Memória da Komi (spec 077): sessões de filme com a pessoa.

Os acompanhantes de uma sessão (``entity_type='movie_diary_entry'``, spec 063) passam a
aparecer no perfil da pessoa como "filmes que vimos juntos".

Usage:
    >>> from agents.akane.komi_provider import LINK_TYPES
    >>> LINK_TYPES[0]["entity_type"]
    'movie_diary_entry'
"""

from __future__ import annotations

from agents.db import run_select


def _resolve(ids: list[str]) -> list[dict]:
    """Buscar as sessões do diário de filmes vinculadas à pessoa.

    Args:
        ids: IDs das sessões (``diary_entries.id``, texto) gravados em ``person_links``.

    Returns:
        Itens da Memória, com o link para a página do filme.
    """
    linhas = run_select(
        """
        SELECT d.id, d.movie_id, d.movie_title, d.watched_date::text AS dia, d.rating
        FROM diary_entries d WHERE d.id = ANY(%(ids)s)
        """,
        {"ids": [str(i) for i in ids]},
    )
    return [
        {
            "entity_id": r["id"],
            "title": r["movie_title"] or "Filme",
            "snippet": f"★ {r['rating']}" if r["rating"] is not None else None,
            "date": r["dia"],
            "deep_link": f"/movies#filme/{r['movie_id']}",
            "context": "personal",
        }
        for r in linhas
    ]


def _summary(person_id: str) -> dict:
    """Montar o bloco ``filmes`` do resumo da pessoa (até 10 sessões, mais recentes primeiro).

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"filmes": [{id, movie_id, title, watched_date, rating, deep_link}, ...]}``.
    """
    sessoes = run_select(
        """
        SELECT d.id, d.movie_id, d.movie_title AS title, d.watched_date::text AS watched_date, d.rating
        FROM person_links pl JOIN diary_entries d ON d.id = pl.entity_id
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'movie_diary_entry'
        ORDER BY d.watched_date DESC LIMIT 10
        """,
        {"pid": person_id},
    )
    return {"filmes": [{**s, "rating": float(s["rating"]) if s["rating"] is not None else None,
                        "deep_link": f"/movies#filme/{s['movie_id']}"} for s in sessoes]}


def _last_activity(person_ids: list[str]) -> list[dict]:
    """Última sessão de filme vista com cada pessoa.

    Args:
        person_ids: IDs das pessoas.

    Returns:
        ``[{person_id, date, text}]`` — uma linha por pessoa que foi acompanhante.
    """
    return run_select(
        """
        SELECT DISTINCT ON (pl.person_id) pl.person_id, d.watched_date::text AS date, d.movie_title AS text
        FROM person_links pl JOIN diary_entries d ON d.id = pl.entity_id
        WHERE pl.entity_type = 'movie_diary_entry' AND pl.person_id = ANY(%(ids)s)
        ORDER BY pl.person_id, d.watched_date DESC
        """,
        {"ids": person_ids},
    )


LINK_TYPES = [
    {
        "entity_type": "movie_diary_entry",
        "agent": "akane",
        "label": "Filmes",
        "icon": "movie",
        "resolve": _resolve,
        "summary_key": "filmes",
        "summary": _summary,
        "last_activity": _last_activity,
        "activity_kind": "filme",
    }
]
