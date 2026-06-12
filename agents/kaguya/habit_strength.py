"""Motor puro de **força do hábito** — fórmula do Loop Habit Tracker (fatia 014).

Este módulo é o equivalente, no domínio de hábitos, do que ``recurrence.py`` é para a
recorrência: **lógica pura, sem banco de dados**. Ele só faz aritmética sobre os check-ins
já carregados em memória. Por ser puro e determinístico, é testável isoladamente — e é o
**gate** automatizado do critério SC-006 (a força de um hábito com boa aderência permanece
acima de zero depois de uma falha isolada, em vez de "zerar o streak").

A "força" (em inglês *score*) é uma **média móvel exponencial** (EMA — *exponential moving
average*, uma média que dá mais peso aos dias recentes e vai "esquecendo" o passado aos
poucos) do histórico de cumprimento do hábito:

    freq          = freq_num / freq_den            (ex.: 5/7 ≈ 0.714 → "5x por semana")
    multiplicador = 0.5 ** (sqrt(freq) / 13)       (quanto da força de ontem sobrevive hoje)
    forca_hoje    = forca_ontem * multiplicador + cumpriu_hoje * (1 - multiplicador)

Intuições importantes:
    - ``cumpriu_hoje`` vale 1 (cumpriu) ou 0 (não cumpriu) a cada dia.
    - O **multiplicador** fica perto de 1 (ex.: ~0.95): a força muda devagar. Por isso uma
      falha isolada só causa um arranhão — nunca zera (é o oposto de um streak).
    - Hábitos de **frequência menor** (ex.: 2x/semana) têm ``freq`` menor → multiplicador
      ainda mais perto de 1 → decaem mais devagar → perdoam mais faltas. Isso é proposital:
      cobrar um hábito 2x/semana todo dia seria injusto.
    - Cumprir todo dia leva a força a se aproximar de 1.0; parar de cumprir a leva a 0.0.

Decisão de projeto: a força é **calculada na leitura**, nunca persistida (a fonte da verdade
é só a tabela ``habit_checkins``). Assim não há risco de uma força "velha" guardada no banco
divergir do histórico real.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Mapping, Optional

# Constante da fórmula do Loop Habit Tracker. O 13 controla a "meia-vida" da memória da EMA:
# é o número mágico do app original, calibrado para dar um decaimento agradável (uma falha
# pesa, mas não destrói). Mantemos igual para reproduzir a sensação conhecida do Loop.
_HALF_LIFE_CONSTANT = 13.0


def daily_multiplier(freq_num: int, freq_den: int) -> float:
    """Calcula o multiplicador diário da EMA a partir da frequência alvo do hábito.

    O multiplicador é a fração da força de ontem que "sobrevive" para hoje. Quanto mais
    perto de 1, mais devagar a força muda (mais perdão a falhas). Hábitos menos frequentes
    têm multiplicador maior (decaem mais devagar).

    Args:
        freq_num: Numerador da frequência (quantas vezes). Ex.: 5 em "5x por semana".
        freq_den: Denominador da frequência (a cada quantos dias). Ex.: 7 em "5x por semana".

    Returns:
        O multiplicador diário, um número entre 0 e 1.

    Example:
        >>> round(daily_multiplier(1, 1), 3)   # hábito diário (freq = 1.0)
        0.948
        >>> round(daily_multiplier(5, 7), 3)   # 5x por semana (freq ≈ 0.714)
        0.956
    """
    # Protege contra denominador zero/negativo vindo de dados ruins: trata como diário.
    if freq_den <= 0:
        freq = 1.0
    else:
        # freq é a fração de dias em que o hábito deveria ser cumprido (entre 0 e 1).
        freq = freq_num / freq_den
    # math.sqrt(freq) cresce devagar; dividir por 13 e elevar 0.5 a isso dá um número perto
    # de 1. Ex.: freq=1 → 0.5^(1/13) ≈ 0.948.
    return math.pow(0.5, math.sqrt(freq) / _HALF_LIFE_CONSTANT)


def met_target(value: Optional[float], target_value: Optional[float]) -> bool:
    """Decide se um check-in conta como "cumprido", tratando hábito sim/não e mensurável.

    - Hábito **sim/não** (``target_value`` é ``None``): a simples existência do check-in já
      conta como cumprido — devolve ``True``.
    - Hábito **mensurável** (``target_value`` definido, ex.: "ler 20 páginas"): só conta se
      o valor medido alcançou a meta (``value >= target_value``).

    Args:
        value: Valor medido no check-in (ex.: 25 páginas), ou ``None`` num hábito sim/não.
        target_value: Meta numérica do hábito, ou ``None`` se for sim/não.

    Returns:
        ``True`` se o check-in conta como dia cumprido; ``False`` caso contrário.

    Example:
        >>> met_target(None, None)     # hábito sim/não: existir o check-in basta
        True
        >>> met_target(25, 20)         # leu 25, meta era 20 → cumpriu
        True
        >>> met_target(15, 20)         # leu 15, meta era 20 → não cumpriu
        False
    """
    # Sim/não: não há meta, então qualquer check-in registrado conta como cumprido.
    if target_value is None:
        return True
    # Mensurável: precisa ter valor e alcançar a meta.
    return value is not None and value >= target_value


def strength(
    done_by_date: Mapping[date, bool],
    freq_num: int,
    freq_den: int,
    *,
    until: Optional[date] = None,
) -> float:
    """Calcula a força atual do hábito iterando dia a dia do 1º check-in até hoje.

    Roda a média móvel exponencial (EMA) do primeiro dia com check-in registrado até ``until``
    (por padrão, o dia do último check-in — o "hoje" do histórico). Cada dia do intervalo
    contribui com 1 (se foi um dia cumprido) ou 0 (se não), mesmo os dias sem nenhum
    check-in — é justamente acumular os zeros dos dias parados que faz a força decair quando
    o hábito é abandonado.

    Args:
        done_by_date: Mapa ``data -> cumpriu`` já resolvido pelo chamador (o booleano já leva
            em conta a meta, via :func:`met_target`). Datas ausentes contam como não cumpridas.
        freq_num: Numerador da frequência alvo.
        freq_den: Denominador da frequência alvo.
        until: Último dia a considerar na conta (inclusive). Se ``None``, usa a maior data
            presente em ``done_by_date``.

    Returns:
        A força atual, um número entre 0.0 e 1.0. Devolve 0.0 se não houver nenhum check-in.

    Example:
        >>> from datetime import date
        >>> # 7 dias seguidos cumpridos num hábito diário → força alta (perto de 1).
        >>> dias = {date(2026, 6, 1) + timedelta(days=i): True for i in range(7)}
        >>> strength(dias, 1, 1) > 0.25
        True
    """
    # Sem nenhum check-in não há série para iterar — força é zero.
    if not done_by_date:
        return 0.0

    # A série começa no primeiro dia com check-in e termina em ``until`` (ou no último dia
    # com check-in, se ``until`` não foi informado).
    start = min(done_by_date.keys())
    end = until if until is not None else max(done_by_date.keys())
    if end < start:
        return 0.0

    multiplicador = daily_multiplier(freq_num, freq_den)
    # peso_novo é quanto o dia de hoje "puxa" a força na direção de cumpriu/não (0 ou 1).
    peso_novo = 1.0 - multiplicador

    forca = 0.0          # a EMA começa do zero (hábito sem história tem força nula)
    dia = start
    # Caminha um dia de cada vez. timedelta(days=1) é "mais um dia" no calendário.
    while dia <= end:
        # cumpriu vale 1.0 se o mapa marca o dia como cumprido, senão 0.0 (dia parado).
        cumpriu = 1.0 if done_by_date.get(dia, False) else 0.0
        # O coração da EMA: mistura a força de ontem (encolhida pelo multiplicador) com o
        # resultado de hoje (puxando para 1 se cumpriu, para 0 se não).
        forca = forca * multiplicador + cumpriu * peso_novo
        dia += timedelta(days=1)

    return forca


def adherence(
    done_by_date: Mapping[date, bool],
    freq_num: int,
    freq_den: int,
    *,
    window_days: int = 7,
    until: Optional[date] = None,
) -> float:
    """Calcula a **aderência** recente: cumpridos ÷ meta numa janela de dias.

    Diferente da :func:`strength` (memória longa e suave), a aderência é uma leitura simples
    e direta do passado recente — quantos dias o hábito foi cumprido na janela, dividido pela
    quantidade de vezes que a meta de frequência esperava nesse mesmo período. É o número que
    casa com a leitura "4 de 5 = 80%" do cenário de aceitação (AC1).

    Args:
        done_by_date: Mapa ``data -> cumpriu`` (mesmo formato de :func:`strength`).
        freq_num: Numerador da frequência alvo (quantas vezes por período).
        freq_den: Denominador da frequência alvo (a cada quantos dias).
        window_days: Tamanho da janela recente, em dias (padrão 7 = última semana).
        until: Último dia da janela (inclusive). Se ``None``, usa a maior data com check-in.

    Returns:
        A aderência como fração de 0.0 a 1.0 (limitada a 1.0 quando cumpre mais que a meta).
        Devolve 0.0 se não houver check-ins ou se a meta esperada na janela for zero.

    Example:
        >>> from datetime import date
        >>> # 4 cumpridos numa semana, hábito 5x/semana → 4/5 = 0.8 de aderência.
        >>> dias = {date(2026, 6, 1) + timedelta(days=i): True for i in range(4)}
        >>> round(adherence(dias, 5, 7, until=date(2026, 6, 7)), 2)
        0.8
    """
    if not done_by_date:
        return 0.0

    # Fim da janela: o dia informado ou o último com check-in.
    end = until if until is not None else max(done_by_date.keys())
    # Início da janela: window_days-1 dias antes do fim (a janela inclui as duas pontas).
    start = end - timedelta(days=window_days - 1)

    # Conta quantos dias dentro da janela foram cumpridos.
    cumpridos = sum(
        1 for dia, ok in done_by_date.items() if ok and start <= dia <= end
    )

    # Meta esperada na janela: a fração de frequência vezes o tamanho da janela.
    # Ex.: 5/7 por dia × 7 dias = 5 cumprimentos esperados na semana.
    if freq_den <= 0:
        esperado = float(window_days)
    else:
        esperado = (freq_num / freq_den) * window_days
    if esperado <= 0:
        return 0.0

    # Limita a 1.0: cumprir mais que a meta não passa de "100% aderente".
    return min(1.0, cumpridos / esperado)
