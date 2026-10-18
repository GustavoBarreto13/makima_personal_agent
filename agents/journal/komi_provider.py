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

import re

from agents.db import get_conn, run_select
from agents.komi.integration import plain_text, replace_mention_id


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


def _last_activity(person_ids: list[str]) -> list[dict]:
    """Último dia do diário que cita cada pessoa.

    Args:
        person_ids: IDs das pessoas.

    Returns:
        ``[{person_id, date, text}]`` — uma linha por pessoa citada.
    """
    linhas = run_select(
        """
        SELECT DISTINCT ON (pl.person_id) pl.person_id, jp.date::text AS date, b.content AS text
        FROM person_links pl
        JOIN journal_bullets b ON b.id = pl.entity_id::int
        JOIN journal_pages jp ON jp.id = b.page_id
        WHERE pl.entity_type = 'journal_bullet' AND pl.person_id = ANY(%(ids)s)
        ORDER BY pl.person_id, jp.date DESC
        """,
        {"ids": person_ids},
    )
    return [{**r, "text": plain_text(r["text"])} for r in linhas]


def _on_unlink_bullet(person_id: str, bullet_id: str) -> bool:
    """Tirar a menção da pessoa do TEXTO do bullet (``@[Bia](komi:id)`` → ``Bia``).

    Sem isso o vínculo voltaria na próxima edição, porque a Violet recalcula as pessoas do bullet a
    partir dos tokens do texto. Regrava pelo ``upsert_bullet`` (que refaz menções e vínculos).

    Args:
        person_id: A pessoa a desvincular.
        bullet_id: ID do bullet.

    Returns:
        ``True`` se o texto mudou; ``False`` se a pessoa estava vinculada só por seleção explícita
        (sem menção no texto) — nesse caso o vínculo em ``person_links`` é o único a remover.
    """
    if not str(bullet_id).isdigit():
        return False
    linhas = run_select("SELECT page_id, position, content, kind FROM journal_bullets WHERE id = %(id)s", {"id": int(bullet_id)})
    if not linhas:
        return False
    b = linhas[0]
    novo = re.sub(r"@\[([^\]\n]{1,80})\]\(komi:%s\)" % re.escape(person_id), r"\1", b["content"] or "")
    if novo == b["content"]:
        return False
    from agents.journal.tools import upsert_bullet  # noqa: PLC0415 — evita ciclo no import
    return upsert_bullet(b["page_id"], b["position"], novo, kind=b["kind"]).get("status") == "ok"


def _on_merge(drop_id: str, keep_id: str, keep_name: str) -> int:
    """Reapontar as menções da pessoa mesclada nos bullets, nas cartas e no índice de menções.

    Args:
        drop_id: ID da pessoa absorvida.
        keep_id: ID da pessoa que fica.
        keep_name: Nome que passa a aparecer nos tokens.

    Returns:
        Quantos textos (bullets + cartas) foram reescritos.
    """
    padrao = f"%(komi:{drop_id})%"
    mudou = 0
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, content FROM journal_bullets WHERE content LIKE %s", (padrao,))
        for bid, texto in cur.fetchall():
            cur.execute("UPDATE journal_bullets SET content = %s WHERE id = %s", (replace_mention_id(texto, drop_id, keep_id, keep_name), bid))
            mudou += 1
        cur.execute("SELECT id, body FROM journal_letters WHERE body LIKE %s", (padrao,))
        for lid, texto in cur.fetchall():
            cur.execute("UPDATE journal_letters SET body = %s WHERE id = %s", (replace_mention_id(texto, drop_id, keep_id, keep_name), lid))
            mudou += 1
        cur.execute("UPDATE journal_mentions SET person_id = %s WHERE person_id = %s", (keep_id, drop_id))
    return mudou


LINK_TYPES = [
    {
        "entity_type": "journal_bullet", "agent": "violet", "label": "Diário", "icon": "journal",
        "resolve": _resolve_bullets, "summary_key": "diario", "summary": _summary_diary,
        "last_activity": _last_activity, "activity_kind": "diário",
        "on_unlink": _on_unlink_bullet, "on_merge": _on_merge,
    },
    {
        "entity_type": "journal_letter", "agent": "violet", "label": "Cartas", "icon": "mail",
        "resolve": _resolve_letters, "summary_key": "cartas", "summary": _summary_letters,
    },
]
