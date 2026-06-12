"""Motor puro do **score de hábito** — modelo "caixa d'água" (fatia 014).

Este módulo é o equivalente, no domínio de hábitos, do que ``recurrence.py`` é para a
recorrência: **lógica pura, sem banco de dados**. Só faz aritmética sobre as datas de
check-in já carregadas em memória. Por ser puro e determinístico, é testável isoladamente.

Trocamos a "ofensiva" (*streak*) por um **score contínuo que perdoa deslizes**. A ofensiva é
binária e sem memória: um dia perdido zera tudo, o que dispara o efeito "já que" ("já que
quebrei, fodas-se") e o desamparo aprendido. Mas as conexões neurais construídas em semanas
de treino não somem por causa de uma falta — a base sedimentada continua lá. O algoritmo
reflete isso.

A analogia é uma **caixa d'água com um furinho no fundo**:
    - nível de hoje cedo = score de ontem;
    - cumprir o hábito = jogar um balde de água dentro;
    - falhar = não jogar nada;
    - o furo = a caixa vaza um pouco todo dia (a parte ``1 - peso``).
Falhar um dia não esvazia a caixa: o nível baixa um tiquinho e volta a subir quando você
retoma — o oposto da ofensiva.

A fórmula central é uma **Média Móvel Exponencial (EMA)**:

    score_hoje = peso * (fez_hoje ? 1 : 0) + (1 - peso) * score_ontem

Com ``peso = 0.1``, o dia de hoje vale 10% da nota e o histórico acumulado vale 90% — errar
um dia derruba pouquíssimo (o "sinal de segurança" que evita o pânico do tudo-ou-nada).

Para hábitos **não-diários** (ex.: 3x/semana), a régua se ajusta à meta: os dias de folga não
são falha. O nível "cru" da caixa estabiliza em torno de ``esperado = min(meta/7, 1)`` e o
score final reescala dividindo por ``esperado`` — então cumprir 3 de 3 dá 100, igual a 7 de 7
num hábito diário.

O resumo final tem **três dimensões** (em vez de um número só):
    - **consistência** (0–100): o nível da caixa, a saúde geral no hábito;
    - **tendência** (subindo/caindo/estável): compara uma média rápida com uma lenta;
    - **recente** (ex.: 5/6 nas últimas 2 semanas): o dado cru, prova que o esforço existiu.

Decisão de projeto: tudo é **calculado na leitura** a partir das datas de check-in — nada é
persistido (a fonte da verdade é só a tabela ``habit_checkins``).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, Optional

# ── Constantes do modelo (calibradas; ver docstring do módulo) ──
# Peso do dia de hoje na EMA principal: 0.1 = histórico pesa 90% (estável, perdoa muito).
_DEFAULT_WEIGHT = 0.1
# Pesos das duas EMAs usadas só para a TENDÊNCIA: rápida reage logo, lenta reage devagar.
_FAST_WEIGHT = 0.25
_SLOW_WEIGHT = 0.07
# Janela retroativa (em dias) considerada no cálculo das EMAs.
_DEFAULT_WINDOW = 60
# Limiar de tendência: variação menor que isso (em módulo) é considerada "estável".
_TREND_EPS = 0.05


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


def expected_level(weekly_target: float) -> float:
    """Calcula o nível "esperado" da caixa d'água para uma meta semanal.

    É a fração de dias em que o hábito deveria ser cumprido (entre 0 e 1). Num hábito diário
    (7x/semana) é 1.0; num 3x/semana é ~0.43. Esse valor é a régua que reescala o score: o
    nível cru da caixa estabiliza em torno dele, e dividir por ele devolve o score a 0–1.

    Args:
        weekly_target: Quantas vezes por semana o hábito deveria ocorrer (ex.: 3, 5, 7).

    Returns:
        O nível esperado, limitado a no máximo 1.0 (não dá para esperar mais que "todo dia").

    Example:
        >>> round(expected_level(3), 2)
        0.43
        >>> expected_level(7)
        1.0
    """
    # min(.., 1.0): mesmo metas absurdas (>7x/semana) não passam de "todo dia".
    if weekly_target <= 0:
        return 1.0
    return min(weekly_target / 7.0, 1.0)


def summary(
    done_dates: Iterable[date],
    weekly_target: float,
    *,
    weight: float = _DEFAULT_WEIGHT,
    today: Optional[date] = None,
    window: int = _DEFAULT_WINDOW,
) -> dict:
    """Resume um hábito como caixa d'água (não como ofensiva), em três dimensões.

    Um dia perdido baixa o nível um pouco em vez de zerar tudo, refletindo como o hábito se
    sedimenta no cérebro. A régua se ajusta à meta semanal, então hábitos não-diários não são
    punidos pelos dias de folga.

    Args:
        done_dates: Coleção das datas em que o hábito foi **cumprido** (já filtradas pela meta
            via :func:`met_target` no caso de hábito mensurável).
        weekly_target: Quantas vezes por semana o hábito deveria ocorrer (ex.: 5 em "5x/semana").
        weight: Quanto o dia de hoje pesa na nota (0.1 = histórico pesa 90%). Menor = mais
            estável e perdoa mais; maior = reage mais rápido às mudanças recentes.
        today: Data de referência (default: hoje, fuso do sistema).
        window: Dias retroativos considerados no cálculo das EMAs.

    Returns:
        Dicionário com:
            - ``consistency`` (int 0–100): o nível da caixa reescalado pela meta — a nota.
            - ``trend`` (``"up"`` | ``"down"`` | ``"flat"``): média rápida vs. lenta.
            - ``recent_done`` (int): cumprimentos nos últimos 14 dias (o dado cru).
            - ``recent_total`` (int): quantos a meta esperava em 2 semanas (``weekly_target*2``).
            - ``ema`` (float 0–1): o nível cru da caixa (para depuração/UI fina).

    Example:
        >>> summary(set(), 7)['consistency']   # sem nenhum check-in → consistência zero
        0
        >>> summary(set(), 7)['trend']
        'flat'
    """
    ref = today or date.today()
    # Conjunto para teste de pertinência O(1) ao varrer a janela dia a dia.
    feitas = set(done_dates)
    esperado = expected_level(weekly_target)

    # Três EMAs varridas em paralelo, do dia mais ANTIGO da janela até hoje (ordem cronológica
    # para a média se construir corretamente):
    #   - ema: a caixa d'água principal (peso configurável) → vira a consistência.
    #   - recente / antigo: médias rápida e lenta, usadas só para medir a TENDÊNCIA.
    ema = recente = antigo = 0.0
    for i in range(window, -1, -1):
        dia = ref - timedelta(days=i)
        fez = 1.0 if dia in feitas else 0.0
        ema = weight * fez + (1.0 - weight) * ema
        recente = _FAST_WEIGHT * fez + (1.0 - _FAST_WEIGHT) * recente
        antigo = _SLOW_WEIGHT * fez + (1.0 - _SLOW_WEIGHT) * antigo

    # Tendência: a diferença entre a média rápida e a lenta, reescalada pela meta. Se a rápida
    # está acima da lenta, o hábito vem subindo (e vice-versa).
    tend = (recente - antigo) / esperado if esperado else 0.0
    if tend > _TREND_EPS:
        trend = "up"
    elif tend < -_TREND_EPS:
        trend = "down"
    else:
        trend = "flat"

    # Recente: contagem crua dos cumprimentos nos últimos 14 dias (prova de que o esforço
    # existiu — tira do "modo vitimismo"). O total esperado em 2 semanas é weekly_target*2.
    recent_done = sum(1 for d in feitas if 0 <= (ref - d).days < 14)
    recent_total = max(1, round(weekly_target * 2))

    # Consistência: o nível da caixa reescalado pela meta, limitado a 100. Cumprir exatamente a
    # meta (ex.: 3 de 3 num hábito 3x/semana) chega a ~100, igual a 7 de 7 num diário.
    consistency = round(min(ema / esperado, 1.0) * 100) if esperado else 0

    return {
        "consistency": consistency,
        "trend": trend,
        "recent_done": recent_done,
        "recent_total": recent_total,
        "ema": round(ema, 4),
    }
