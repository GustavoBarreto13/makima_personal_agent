"""Pessoas por espaço (spec 075) — contrato pronto para quando a Komi distinguir pessoas de trabalho.

Hoje a Komi não tem o conceito. Esta ponte devolve ``None`` ("sem filtro") enquanto a coluna
``people.context`` não existir e passa a filtrar sozinha assim que ela for criada — sem mudança na
Kaguya. A checagem do catálogo roda uma vez por processo e o resultado fica em cache.

Contrato esperado da Komi (pendência registrada em ``agents/komi/CLAUDE.md``): ``people.context`` com
``'personal' | 'work' | 'both'``; ``'both'`` aparece nos dois espaços.
"""

from __future__ import annotations

from typing import Optional

from agents.db import run_select

_has_context_column: Optional[bool] = None


def komi_supports_space() -> bool:
    """Diz se a Komi já tem ``people.context`` (consulta o catálogo uma vez e guarda o resultado)."""
    global _has_context_column
    if _has_context_column is None:
        try:
            rows = run_select(
                "SELECT 1 FROM information_schema.columns WHERE table_name = 'people' AND column_name = 'context'"
            )
            _has_context_column = bool(rows)
        except Exception:  # noqa: BLE001 — sem banco/sem tabela: trata como "ainda não suporta"
            _has_context_column = False
    return _has_context_column


def person_ids_for_space(space: Optional[str]) -> Optional[list[str]]:
    """Ids de pessoas visíveis no espaço pedido.

    Args:
        space: ``work`` | ``personal`` | ``None``.

    Returns:
        Lista de ids (inclui as marcadas ``both``) — ou ``None`` quando não há o que filtrar
        (espaço não informado ou a Komi ainda não distingue), significando "todas as pessoas".
    """
    if space not in ("work", "personal") or not komi_supports_space():
        return None
    rows = run_select(
        "SELECT id FROM people WHERE context IN (%(space)s, 'both')", {"space": space}
    )
    return [r["id"] for r in rows]


def reset_cache() -> None:
    """Esquece o resultado em cache (para testes e para quando a Komi migrar com o app no ar)."""
    global _has_context_column
    _has_context_column = None
