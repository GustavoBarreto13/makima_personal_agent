"""Provedor de **fonte automática de hábito** da Frieren — Hábitos cross-agent (spec 036).

Publica o contrato exigido pelo registry ``agents.kaguya.habit_source_providers``: atividade
diária de leitura, usada para alimentar automaticamente um hábito mensurável (ex.: "ler 20
páginas por dia"). Consumido de fora via ``importlib`` — nunca importado dentro do próprio
`agents/frieren`.

Usage:
    >>> from agents.frieren.habit_provider import get_activity
    >>> get_activity("2026-07-01", "2026-07-31")
    {'2026-07-05': 25.0}
"""

from agents.db import run_select


def get_activity(start_date: str, end_date: str) -> dict[str, float]:
    """Soma as páginas lidas por dia num intervalo, agregando todos os livros.

    Cada linha de ``reading_logs`` é uma sessão (pode haver mais de uma no mesmo dia, ex.: 15 +
    10 páginas) — a soma por dia é o valor que o hábito mensurável compara com sua meta.

    Args:
        start_date: Início do intervalo, ``"AAAA-MM-DD"`` (inclusivo).
        end_date: Fim do intervalo, ``"AAAA-MM-DD"`` (inclusivo).

    Returns:
        Mapa esparso ``{"AAAA-MM-DD": total_paginas}`` — dias sem log de leitura ficam ausentes.
    """
    rows = run_select(
        """
        SELECT date, SUM(pages_read) AS total
        FROM reading_logs
        WHERE date BETWEEN %(start)s AND %(end)s AND pages_read IS NOT NULL
        GROUP BY date
        """,
        {"start": start_date, "end": end_date},
    )
    return {r["date"].isoformat(): float(r["total"]) for r in rows}
