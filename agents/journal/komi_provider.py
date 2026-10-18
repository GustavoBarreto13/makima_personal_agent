"""Provedor da Violet (diário) para a Memória da Komi (spec 077).

Dois tipos de backlink, seguindo o contrato de ``agents.komi.integration``:

- ``journal_bullet`` — trechos do diário que citam a pessoa (``@[Nome](komi:id)``).
- ``journal_letter`` — cartas escritas para/sobre a pessoa.

Tudo no diário é pessoal (``context = "personal"``).

Usage:
    >>> from agents.journal.komi_provider import LINK_TYPES
    >>> [t["entity_type"] for t in LINK_TYPES]
    ['journal_bullet', 'journal_letter']
"""

from __future__ import annotations

from agents.db import run_select
from agents.komi.integration import plain_text


def _ids_inteiros(ids: list[str]) -> list[int]:
    """Converter os IDs (texto) em inteiros, ignorando o que não for número.

    Args:
        ids: IDs vindos de ``person_links.entity_id``.

    Returns:
        Os IDs numéricos.
    """
    return [int(i) for i in ids if str(i).isdigit()]


def _resolve_bullets(ids: list[str]) -> list[dict]:
    """Buscar os trechos do diário que citam a pessoa.

    Args:
        ids: IDs dos bullets (``journal_bullets.id``) gravados em ``person_links``.

    Returns:
        Itens da Memória com o link para o dia do diário.
    """
    linhas = run_select(
        """
        SELECT b.id, b.content, jp.date::text AS dia
        FROM journal_bullets b JOIN journal_pages jp ON jp.id = b.page_id
        WHERE b.id = ANY(%(ids)s)
        """,
        {"ids": _ids_inteiros(ids)},
    )
    itens = []
    for r in linhas:
        texto = plain_text(r["content"]).strip()
        itens.append({
            "entity_id": r["id"], "title": (texto[:80] + "…") if len(texto) > 80 else (texto or "Diário"),
            "snippet": texto[:240] or None, "date": r["dia"], "deep_link": f"/journal#dia/{r['dia']}",
            "context": "personal",
        })
    return itens


def _resolve_letters(ids: list[str]) -> list[dict]:
    """Buscar as cartas vinculadas à pessoa.

    Args:
        ids: IDs das cartas (``journal_letters.id``) gravados em ``person_links``.

    Returns:
        Itens da Memória com o link para a carta.
    """
    linhas = run_select(
        """
        SELECT l.id, l.recipient, l.title, jp.date::text AS dia, LEFT(l.body, 240) AS trecho
        FROM journal_letters l JOIN journal_pages jp ON jp.id = l.page_id
        WHERE l.id = ANY(%(ids)s)
        """,
        {"ids": _ids_inteiros(ids)},
    )
    return [
        {
            "entity_id": r["id"], "title": r["title"] or f"Carta para {r['recipient'] or '—'}",
            "snippet": plain_text(r["trecho"]) or None, "date": r["dia"],
            "deep_link": f"/journal#carta/{r['id']}", "context": "personal",
        }
        for r in linhas
    ]


def _summary_diary(person_id: str) -> dict:
    """Montar o bloco ``diario`` do resumo (total de menções + 10 trechos recentes).

    Cada trecho traz o texto sem a sintaxe dos tokens, o ID do bullet e o link para o dia.

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"contagem": int, "trechos": [{id, bullet_id, content, texto, date, deep_link}, ...]}``.
    """
    bullets = run_select(
        """
        SELECT b.id, b.content, jp.date::text AS date
        FROM person_links pl
        JOIN journal_bullets b ON b.id = pl.entity_id::int
        JOIN journal_pages jp ON jp.id = b.page_id
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'journal_bullet'
        ORDER BY jp.date DESC, b.position LIMIT 10
        """,
        {"pid": person_id},
    )
    total = run_select(
        "SELECT COUNT(*) AS n FROM person_links WHERE person_id = %(pid)s AND entity_type = 'journal_bullet'",
        {"pid": person_id},
    )
    trechos = [
        {**r, "bullet_id": r["id"], "texto": plain_text(r["content"]), "deep_link": f"/journal#dia/{r['date']}"}
        for r in bullets
    ]
    return {"contagem": int(total[0]["n"]) if total else len(trechos), "trechos": trechos}


def _summary_letters(person_id: str) -> dict:
    """Montar o bloco ``cartas`` do resumo (até 10 cartas recentes).

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"cartas": [{id, recipient, title, status, font, date, trecho, deep_link}, ...]}``.
    """
    cartas = run_select(
        """
        SELECT l.id, l.recipient, l.title, l.status, l.font, jp.date::text AS date, LEFT(l.body, 240) AS trecho
        FROM person_links pl
        JOIN journal_letters l ON l.id = pl.entity_id::int
        JOIN journal_pages jp ON jp.id = l.page_id
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'journal_letter'
        ORDER BY jp.date DESC LIMIT 10
        """,
        {"pid": person_id},
    )
    return {"cartas": [{**r, "deep_link": f"/journal#carta/{r['id']}"} for r in cartas]}


LINK_TYPES = [
    {
        "entity_type": "journal_bullet", "agent": "violet", "label": "Diário", "icon": "journal",
        "resolve": _resolve_bullets, "summary_key": "diario", "summary": _summary_diary,
    },
    {
        "entity_type": "journal_letter", "agent": "violet", "label": "Cartas", "icon": "mail",
        "resolve": _resolve_letters, "summary_key": "cartas", "summary": _summary_letters,
    },
]
