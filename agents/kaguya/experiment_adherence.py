"""Motor puro da **aderência de um experimento** — Tiny Experiments (spec 029).

Este módulo é o equivalente, no domínio dos experimentos, do que ``habit_strength.py`` é
para os hábitos: **lógica pura, sem banco de dados**. Só faz aritmética sobre as datas de
check-in já carregadas em memória. Por ser puro e determinístico, é testável isoladamente
(gate ``tests/agents/test_kaguya_experiment_adherence.py``).

Diferença de modelo em relação ao hábito: um experimento é **curto e com prazo** (≈1–4
semanas). Para esse horizonte, a **razão simples** ``cumpridos / esperados`` é transparente
("3 de 4 dias = 75%") e satisfaz o princípio "falha = dado": uma falha isolada só reduz a
proporção, **nunca zera** enquanto houver cumprimentos (o oposto da ofensiva). Não há EMA nem
ponderação de recência — o horizonte é curto demais para valer a complexidade (research D1).

Definições (research D1/D2/D4):
    - **Período**: na cadência ``daily`` é o próprio dia; na ``weekly`` é a **segunda-feira**
      da semana de calendário (segunda→domingo). A normalização ancora tudo na segunda.
    - **períodos esperados**: nº de períodos entre ``start_date`` e ``min(hoje, end_date)``,
      **menos** os períodos em que o experimento esteve pausado (FR-017).
    - **períodos cumpridos**: nº de check-ins com ``done = True``.
    - **aderência**: ``round(100 * cumpridos / max(esperados, 1))``, capada em 100.

Tudo é **calculado na leitura** — nada aqui é persistido (a fonte da verdade é só o banco).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, Mapping, Optional

# Cadências válidas (espelha o CHECK do schema).
_DAILY = "daily"
_WEEKLY = "weekly"


def monday_of(d: date) -> date:
    """Retorna a **segunda-feira** da semana de calendário que contém ``d``.

    A semana é ancorada na segunda (segunda→domingo), o vocabulário do usuário ("essa
    semana"). ``weekday()`` devolve 0=segunda … 6=domingo, então basta recuar ``weekday()``
    dias para chegar à segunda.

    Args:
        d: Uma data qualquer.

    Returns:
        A data da segunda-feira daquela semana.

    Example:
        >>> monday_of(date(2026, 6, 30))   # 30/06/2026 é uma terça
        datetime.date(2026, 6, 29)
        >>> monday_of(date(2026, 6, 29))   # a própria segunda
        datetime.date(2026, 6, 29)
    """
    return d - timedelta(days=d.weekday())


def period_date_for(d: date, cadence: str) -> date:
    """Normaliza uma data para o **início do período** conforme a cadência.

    - ``daily``: o próprio dia (cada dia é um período).
    - ``weekly``: a segunda-feira da semana de ``d`` (cada semana de calendário é um período).

    Args:
        d: A data a normalizar (ex.: o dia em que o usuário fez o check-in).
        cadence: ``"daily"`` ou ``"weekly"``.

    Returns:
        A data canônica do período (o próprio dia, ou a segunda da semana).
    """
    return monday_of(d) if cadence == _WEEKLY else d


def count_periods(start: date, end_inclusive: date, cadence: str) -> int:
    """Conta quantos períodos decorreram entre ``start`` e ``end_inclusive`` (inclusive).

    - ``daily``: nº de dias no intervalo fechado ``[start, end]``.
    - ``weekly``: nº de semanas de calendário distintas tocadas pelo intervalo (contadas
      pelas segundas-feiras: da segunda da semana de ``start`` até a de ``end``).

    Se ``end_inclusive`` for anterior a ``start`` (o experimento ainda não começou), devolve 0.

    Args:
        start: Primeiro dia do intervalo.
        end_inclusive: Último dia do intervalo (já capado em ``min(hoje, end_date)`` pelo chamador).
        cadence: ``"daily"`` ou ``"weekly"``.

    Returns:
        Número de períodos decorridos (≥ 0).

    Example:
        >>> count_periods(date(2026, 6, 1), date(2026, 6, 4), "daily")  # 1,2,3,4
        4
        >>> count_periods(date(2026, 6, 1), date(2026, 6, 14), "weekly")  # 2 semanas
        2
    """
    if end_inclusive < start:
        return 0
    if cadence == _WEEKLY:
        # Distância em semanas entre as segundas-feiras das duas pontas, +1 (inclusivo).
        return ((monday_of(end_inclusive) - monday_of(start)).days // 7) + 1
    # Diária: dias no intervalo fechado (por isso o +1).
    return (end_inclusive - start).days + 1


def adherence_pct(periods_done: int, periods_expected: int) -> int:
    """Calcula a aderência em % (razão simples), capada em 100 e nunca dividindo por zero.

    Usa ``max(periods_expected, 1)`` no denominador para o primeiro dia (0 esperados) não
    estourar; nesse caso a aderência é 0% até o primeiro período decorrer.

    Args:
        periods_done: Períodos cumpridos (check-ins com ``done=True``).
        periods_expected: Períodos esperados decorridos (já descontadas as pausas).

    Returns:
        Inteiro em ``[0, 100]``.

    Example:
        >>> adherence_pct(3, 4)
        75
        >>> adherence_pct(6, 7)
        86
        >>> adherence_pct(0, 0)   # nada cumprido e nada esperado → 0 (não estoura)
        0
    """
    if periods_done <= 0:
        return 0
    return min(100, round(100 * periods_done / max(periods_expected, 1)))


def summary(
    *,
    start_date: date,
    end_date: date,
    cadence: str = _DAILY,
    status: str = "active",
    paused_at: Optional[date] = None,
    paused_period_days: int = 0,
    logs: Iterable[Mapping] = (),
    today: Optional[date] = None,
) -> dict:
    """Resume os campos DERIVADOS de um experimento a partir dos seus check-ins.

    Junta a contagem de períodos (:func:`count_periods`), o desconto das pausas (research D4)
    e a razão simples (:func:`adherence_pct`). Tudo calculado na leitura; nada persistido.

    Desconto de pausa (D4/FR-017): ``paused_period_days`` acumula os dias já pausados (fechados
    no resume). Se o experimento está **pausado agora**, o intervalo aberto ``[paused_at, hoje]``
    também é descontado on-the-fly. Os dias pausados viram períodos: ``daily`` = dias;
    ``weekly`` = ``round(dias / 7)``.

    Args:
        start_date: Início do experimento.
        end_date: Fim do experimento.
        cadence: ``"daily"`` ou ``"weekly"``.
        status: ``"active"`` | ``"paused"`` | ``"completed"``.
        paused_at: Data em que entrou na pausa atual (``None`` quando ativo/concluído).
        paused_period_days: Acumulador de dias já pausados (fechados).
        logs: Iterável de check-ins ``{"period_date": date, "done": bool}``.
        today: Data de referência (padrão: hoje, fuso do sistema).

    Returns:
        Dicionário com ``periods_done``, ``periods_expected``, ``adherence_pct``,
        ``logged_current``, ``days_remaining`` e ``is_overdue``.
    """
    ref = today or date.today()

    # Fim efetivo: nunca contamos períodos além de hoje nem além do fim (capa em min(hoje,end)).
    effective_end = min(ref, end_date)
    elapsed = count_periods(start_date, effective_end, cadence)

    # ── Desconto das pausas ──────────────────────────────────────────────────────
    paused_days = paused_period_days
    if status == "paused" and paused_at is not None:
        # Intervalo de pausa ainda aberto: conta de paused_at até o fim efetivo (mesma
        # aritmética do resume, que faz paused_period_days += (hoje - paused_at)).
        paused_days += max(0, (effective_end - paused_at).days)
    # Converte dias pausados em períodos conforme a cadência.
    paused_periods = round(paused_days / 7) if cadence == _WEEKLY else paused_days

    periods_expected = max(0, elapsed - paused_periods)

    # Períodos cumpridos: check-ins com done verdadeiro.
    periods_done = sum(1 for l in logs if l.get("done"))

    # Período corrente (hoje, ou a segunda desta semana) e se já tem check-in registrado.
    current_period = period_date_for(ref, cadence)
    logged_current = any(
        period_date_for(l["period_date"], cadence) == current_period for l in logs
    )

    return {
        "periods_done": periods_done,
        "periods_expected": periods_expected,
        "adherence_pct": adherence_pct(periods_done, periods_expected),
        "logged_current": logged_current,
        # days_remaining pode ser negativo (atrasado); is_overdue só quando ativo e passou do fim.
        "days_remaining": (end_date - ref).days,
        "is_overdue": status == "active" and ref > end_date,
    }
