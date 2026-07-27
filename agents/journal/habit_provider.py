"""Provedor de **fonte automática de hábito** da Violet (diário) — Hábitos cross-agent (spec 036).

Publica o contrato exigido pelo registry ``agents.kaguya.habit_source_providers``: dias com
escrita no diário, usados para alimentar automaticamente um hábito binário (ex.: "escrever no
diário"). Consumido de fora via ``importlib`` — nunca importado dentro do próprio
`agents/journal`.

Usage:
    >>> from agents.journal.habit_provider import get_activity
    >>> get_activity("2026-07-01", "2026-07-31")
    {'2026-07-05': 1.0}
"""

from agents.journal.tools import _get_conn


def get_activity(start_date: str, end_date: str) -> dict[str, float]:
    """Marca com ``1.0`` cada dia com ao menos um bullet de conteúdo não-vazio no diário.

    Um dia "conta" quando existe uma ``journal_pages`` (tipo padrão, ``type_id=1``) no
    intervalo com pelo menos um ``journal_bullets.content`` não-vazio — o dia local
    (America/Sao_Paulo) de escrita, já que ``journal_pages.date`` é gravada no fuso do usuário
    (mesma convenção usada em todo o diário).

    Args:
        start_date: Início do intervalo, ``"AAAA-MM-DD"`` (inclusivo).
        end_date: Fim do intervalo, ``"AAAA-MM-DD"`` (inclusivo).

    Returns:
        Mapa esparso ``{"AAAA-MM-DD": 1.0}`` — dias sem escrita ficam ausentes.
    """
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT p.date
                FROM journal_pages p
                JOIN journal_bullets b ON b.page_id = p.id
                WHERE p.type_id = 1
                  AND p.date BETWEEN %s AND %s
                  AND TRIM(b.content) <> ''
                """,
                (start_date, end_date),
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return {r[0].isoformat(): 1.0 for r in rows}
