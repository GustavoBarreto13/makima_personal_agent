"""Provedor de **vínculo de meta** da Frieren — Metas cross-agent (spec 036).

Publica o contrato exigido pelo registry ``agents.kaguya.goal_link_providers``: buscar livros
para vincular a uma meta e resolver o estado atual dos já vinculados. Este módulo NÃO é
importado por nada dentro de `agents/frieren` — ele é consumido de fora, via `importlib`, pelo
registry da Kaguya (Constitution I/III: cada agente é dono do próprio dado; a Kaguya nunca
consulta a tabela `books` diretamente).

Usage:
    >>> from agents.frieren.goal_provider import search_items, resolve_items
    >>> search_items("duna")
    [{'id': '...', 'label': 'Duna', 'sublabel': 'Frank Herbert', 'cover_url': '...'}]
    >>> resolve_items(["<id>"])
    [{'id': '...', 'label': 'Duna', 'sublabel': 'Frank Herbert', 'cover_url': '...',
      'done': False, 'deep_link': '/books/<id>'}]
"""

from agents.db import run_select


def search_items(query: str) -> list[dict]:
    """Busca livros vivos (não excluídos) por título ou autor para vincular a uma meta.

    Reusa a mesma estratégia ``ILIKE`` já usada na busca de livros da Frieren — sem exigir
    correspondência exata, apenas conter o termo (case-insensitive).

    Args:
        query: Termo de busca (título ou autor, parcial).

    Returns:
        Lista ``[{"id", "label", "sublabel", "cover_url"}, ...]``, até 10 resultados.
    """
    termo = (query or "").strip()
    if not termo:
        return []
    rows = run_select(
        """
        SELECT id, title, author, cover_url
        FROM books
        WHERE deleted = FALSE
          AND (title ILIKE %(q)s OR author ILIKE %(q)s)
        ORDER BY title
        LIMIT 10
        """,
        {"q": f"%{termo}%"},
    )
    return [
        {"id": r["id"], "label": r["title"], "sublabel": r.get("author"), "cover_url": r.get("cover_url")}
        for r in rows
    ]


def resolve_items(ids: list[str]) -> list[dict]:
    """Resolve o estado atual de livros já vinculados a uma meta.

    ``done: True`` quando ``status == "lido"`` — o sinal genérico que o motor de progresso
    automático da meta usa para contar (R6 do research.md). Livros excluídos ou ids inexistentes
    simplesmente não aparecem na resposta (FR-009 — quem chama trata a ausência, não como erro).

    Args:
        ids: Ids dos livros vinculados (``goal_external_links.entity_id``).

    Returns:
        Lista ``[{"id", "label", "sublabel", "cover_url", "done", "deep_link"}, ...]``.
    """
    if not ids:
        return []
    rows = run_select(
        """
        SELECT id, title, author, cover_url, status
        FROM books
        WHERE id = ANY(%(ids)s) AND deleted = FALSE
        """,
        {"ids": ids},
    )
    return [
        {
            "id": r["id"],
            "label": r["title"],
            "sublabel": r.get("author"),
            "cover_url": r.get("cover_url"),
            "done": r["status"] == "lido",
            "deep_link": f"/books/{r['id']}",
        }
        for r in rows
    ]
