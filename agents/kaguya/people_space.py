"""Pessoas por espaço (specs 075 e 077) — fachada do contrato de integração da Komi.

A Kaguya separa **Trabalho × Pessoal** em todas as telas. Desde a spec 077 a Komi guarda o
espaço de cada pessoa em ``people.context`` (``personal`` | ``work`` | ``both``; "ambos"
aparece nos dois espaços) e é DONA da regra: a consulta mora em
``agents.komi.integration.people_for_space``. Este módulo só mantém a API que a Kaguya já
importava (``person_ids_for_space`` & cia.), sem repetir SQL de outro agente.

Usage:
    >>> from agents.kaguya.people_space import person_ids_for_space
    >>> person_ids_for_space(None) is None        # sem espaço = sem filtro
    True
"""

from __future__ import annotations

from typing import Optional


def komi_supports_space() -> bool:
    """Dizer se a Komi está disponível com o conceito de espaço.

    Desde a spec 077 o ``ensure_schema`` da Komi cria ``people.context`` sozinho, então a
    pergunta virou "o banco da Komi existe?".

    Returns:
        ``True`` se o schema da Komi está aplicado; ``False`` se não deu para aplicá-lo
        (ex.: banco sem a Komi) — nesse caso nada é filtrado.
    """
    try:
        from agents.komi.schema import ensure_schema  # noqa: PLC0415 — Komi é opcional para a Kaguya
        return ensure_schema()
    except Exception:  # noqa: BLE001 — sem banco/sem Komi: trata como "não suporta"
        return False


def person_ids_for_space(space: Optional[str]) -> Optional[list[str]]:
    """IDs de pessoas visíveis no espaço pedido.

    Args:
        space: ``work`` | ``personal`` | ``None``.

    Returns:
        Lista de IDs (inclui as marcadas ``both``) — ou ``None`` quando não há o que filtrar
        (espaço não informado/desconhecido, ou a Komi indisponível), significando "todas as pessoas".
    """
    if space not in ("work", "personal"):
        return None
    try:
        from agents.komi.integration import people_for_space  # noqa: PLC0415
        return people_for_space(space)
    except Exception:  # noqa: BLE001 — Komi fora do ar: melhor mostrar todas do que nenhuma
        return None


def reset_cache() -> None:
    """Compatibilidade: antes esquecia o cache da checagem de coluna; hoje não há cache."""
