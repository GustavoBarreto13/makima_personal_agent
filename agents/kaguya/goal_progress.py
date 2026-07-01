"""Motor puro do **progresso de uma meta** — Metas (spec 030).

Este módulo é o equivalente, no domínio das metas, do que ``experiment_adherence.py`` é para
os experimentos: **lógica pura, sem banco de dados**. Só faz aritmética sobre os valores já
carregados em memória (métrica atual/alvo e contagem de marcos). Por ser puro e determinístico,
é testável isoladamente (gate ``tests/agents/test_kaguya_goal_progress.py``).

O progresso de uma meta combina **duas dimensões independentes**, cada uma em ``[0,100]``:
    - **métrica**: ``min(100, round(100 * atual / alvo))`` quando há ``metric_target > 0`` — um
      valor acima do alvo **satura em 100** sem erro (superou a meta); ``None`` se não há métrica.
    - **marcos**: ``round(100 * concluídos / total)`` quando há ≥1 marco; ``None`` se não há.
    - **combinado** (``progress_pct``): média das dimensões **presentes**; ``None`` quando
      nenhuma existe (meta puramente direcional — o progresso só se resolve no desfecho).

Tudo é **calculado na leitura** — nada aqui é persistido (a fonte da verdade é ``metric_current``
e as linhas de ``goal_milestones``). Ver ``specs/030-tasks-metas/research.md`` (D2).
"""

from __future__ import annotations

from datetime import date
from typing import Optional

# Fuso do usuário para "hoje"/prazo é resolvido na camada de lógica (tools_goals._today);
# aqui o motor recebe ``today`` pronto para permanecer puro e testável.


def metric_pct(metric_target: Optional[float], metric_current: Optional[float]) -> Optional[int]:
    """Progresso da dimensão **métrica**, em ``[0,100]``, ou ``None`` se não há métrica.

    Satura em 100 quando o valor atual passa do alvo (superou a meta — FR-012/edge case), sem
    quebrar. Só há métrica quando ``metric_target`` é um número positivo.

    Args:
        metric_target: Métrica-alvo (ex.: 12 livros), ou ``None``/0 quando não há métrica.
        metric_current: Valor atual da métrica (ex.: 3).

    Returns:
        Inteiro ``[0,100]``, ou ``None`` se ``metric_target`` é ``None`` ou ≤ 0.

    Example:
        >>> metric_pct(12, 3)
        25
        >>> metric_pct(12, 15)   # superou o alvo → satura em 100
        100
        >>> metric_pct(None, 5)  # sem métrica
        >>> metric_pct(0, 5)     # alvo zero não é métrica válida
    """
    if metric_target is None or metric_target <= 0:
        return None
    atual = metric_current or 0
    return min(100, round(100 * atual / metric_target))


def milestones_pct(done: int, total: int) -> Optional[int]:
    """Progresso da dimensão **marcos**, em ``[0,100]``, ou ``None`` se não há marcos.

    Args:
        done: Nº de marcos concluídos.
        total: Nº total de marcos.

    Returns:
        Inteiro ``[0,100]``, ou ``None`` se ``total`` é 0.

    Example:
        >>> milestones_pct(1, 3)
        33
        >>> milestones_pct(0, 0)   # sem marcos
    """
    if total <= 0:
        return None
    return round(100 * done / total)


def progress(
    *,
    metric_target: Optional[float],
    metric_current: Optional[float],
    milestones_done: int,
    milestones_total: int,
) -> dict:
    """Resume o progresso combinado de uma meta a partir das duas dimensões.

    Combina métrica e marcos pela **média das dimensões presentes** (D2): ambas → média das duas;
    só uma → aquela; **nenhuma** → ``None`` (meta direcional/qualitativa).

    Args:
        metric_target: Métrica-alvo (ou ``None``/0 se não há).
        metric_current: Valor atual da métrica.
        milestones_done: Marcos concluídos.
        milestones_total: Total de marcos.

    Returns:
        Dicionário com ``metric_pct`` (int|None), ``milestones_pct`` (int|None) e
        ``progress_pct`` (int|None — a nota combinada).

    Example:
        >>> progress(metric_target=12, metric_current=3, milestones_done=1, milestones_total=3)['progress_pct']
        29
        >>> progress(metric_target=None, metric_current=0, milestones_done=0, milestones_total=0)['progress_pct']
    """
    m_pct = metric_pct(metric_target, metric_current)
    ms_pct = milestones_pct(milestones_done, milestones_total)

    # Média das dimensões que existem; None quando nenhuma existe (nada a medir ainda).
    presentes = [p for p in (m_pct, ms_pct) if p is not None]
    combined = round(sum(presentes) / len(presentes)) if presentes else None

    return {
        "metric_pct": m_pct,
        "milestones_pct": ms_pct,
        "progress_pct": combined,
    }


def deadline_status(deadline: date, status: str, today: date) -> dict:
    """Deriva ``days_remaining`` e ``is_overdue`` de uma meta em relação ao prazo (FR-016).

    Args:
        deadline: Data-limite da meta.
        status: ``"active"`` | ``"closed"``.
        today: Data de referência (hoje, em UTC-3 — resolvido pelo chamador).

    Returns:
        Dicionário com ``days_remaining`` (int; negativo = atrasado) e ``is_overdue``
        (``True`` só quando a meta está ativa e o prazo já passou).

    Example:
        >>> deadline_status(date(2026, 7, 10), "active", date(2026, 7, 1))
        {'days_remaining': 9, 'is_overdue': False}
        >>> deadline_status(date(2026, 6, 28), "active", date(2026, 7, 1))
        {'days_remaining': -3, 'is_overdue': True}
    """
    return {
        "days_remaining": (deadline - today).days,
        "is_overdue": status == "active" and today > deadline,
    }
