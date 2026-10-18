"""Armazenamento do resumo de IA da Memória de uma pessoa — Komi, spec 077.

A Komi é dona da tabela ``person_memory_summaries`` (um resumo por pessoa e por espaço:
``all``, ``personal`` ou ``work``); quem GERA o resumo é a Kurisu (``agents/kurisu/person_summary.py``).
Guardamos junto a "impressão digital" da Memória usada, então a tela sabe dizer "desatualizado"
sem regerar sozinha e gastar IA à toa.

Usage:
    >>> from agents.komi.summaries import ITENS_PARA_IA
    >>> ITENS_PARA_IA
    80
"""

from __future__ import annotations

import json

from agents.komi import integration
from agents.komi.tools import get_conn, run_select

# Quantos itens (os mais recentes) da Memória entram no resumo e na impressão digital. Os dois
# precisam usar o MESMO número, senão "desatualizado" seria calculado sobre outro conjunto.
ITENS_PARA_IA = 80

CONTEXTOS = ("all", "personal", "work")


def memory_for_ai(person_id: str, context: str = "all") -> dict:
    """Ler a Memória que alimenta o resumo: os itens mais recentes do espaço pedido.

    Args:
        person_id: ID da pessoa.
        context: ``all`` | ``personal`` | ``work``.

    Returns:
        O retorno de ``integration.get_person_memory`` (``status`` e ``items``).
    """
    if context not in CONTEXTOS:
        return {"status": "error", "message": "Espaço inválido. Use 'all', 'personal' ou 'work'."}
    return integration.get_person_memory(person_id, context=None if context == "all" else context, limit=ITENS_PARA_IA)


def get_cached_summary(person_id: str, context: str = "all", check_stale: bool = True) -> dict | None:
    """Ler o resumo guardado de uma pessoa.

    Args:
        person_id: ID da pessoa.
        context: ``all`` | ``personal`` | ``work``.
        check_stale: Se ``True``, compara com a Memória de agora para dizer se está desatualizado
            (consulta os provedores dos agentes); se ``False``, ``stale`` vem ``None``.

    Returns:
        ``{"summary": {...}, "generated_at": ISO, "stale": bool|None, "source_hash": str}`` ou ``None``
        se não há resumo.
    """
    linhas = run_select(
        "SELECT summary, source_hash, generated_at FROM person_memory_summaries WHERE person_id = %(p)s AND context = %(c)s",
        {"p": person_id, "c": context},
    )
    if not linhas:
        return None
    r = linhas[0]
    resumo = r["summary"] if isinstance(r["summary"], dict) else json.loads(r["summary"])
    velho = None
    if check_stale:
        memoria = memory_for_ai(person_id, context)
        velho = memoria.get("status") == "ok" and integration.memory_fingerprint(memoria["items"]) != r["source_hash"]
    return {"summary": resumo, "generated_at": r["generated_at"].isoformat(), "stale": velho, "source_hash": r["source_hash"]}


def save_summary(person_id: str, context: str, summary: dict, source_hash: str) -> None:
    """Guardar (ou substituir) o resumo de uma pessoa num espaço.

    Args:
        person_id: ID da pessoa.
        context: ``all`` | ``personal`` | ``work``.
        summary: O resumo (JSON com ``resumo``, ``pontos``, ``pendencias``...).
        source_hash: Impressão digital da Memória usada.

    Raises:
        ValueError: Se ``context`` for inválido.
    """
    if context not in CONTEXTOS:
        raise ValueError("Espaço inválido.")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO person_memory_summaries (person_id, context, summary, source_hash, generated_at)
            VALUES (%s, %s, %s::jsonb, %s, NOW())
            ON CONFLICT (person_id, context)
            DO UPDATE SET summary = EXCLUDED.summary, source_hash = EXCLUDED.source_hash, generated_at = NOW()
            """,
            (person_id, context, json.dumps(summary, ensure_ascii=False), source_hash),
        )


def clear_summaries(person_id: str) -> None:
    """Apagar os resumos guardados de uma pessoa (ex.: depois de mesclar).

    Args:
        person_id: ID da pessoa.
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM person_memory_summaries WHERE person_id = %s", (person_id,))
