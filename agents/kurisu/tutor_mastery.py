"""Motor puro do **Tutor de Idiomas** — maestria por conceito, CEFR e próximo foco (spec 031).

Espelha o modelo "caixa d'água" de ``agents/kaguya/habit_strength.py``: uma Média Móvel
Exponencial (EMA) sobre uma série cronológica de sinais binários, sem qualquer acesso a banco —
lógica pura, testável isolada. A diferença de contexto muda os parâmetros, não o modelo:

- Hábito: 1 sinal por dia, mesmo sem check-in explícito (ausência conta). Peso baixo (0.1)
  porque o histórico deve pesar muito e a "caixa" vaza lentamente com o tempo.
- Conceito gramatical: 1 sinal por **análise em que o conceito apareceu** (não por dia — dias
  sem escrever não geram sinal nenhum). Peso mais alto (0.3) porque a escrita melhora mais
  rápido que um hábito e o volume de amostras tende a ser menor. **Sem decaimento por
  ausência** (decisão de clarificação da spec 031): a maestria só se move quando o conceito
  reaparece numa nova análise.

Sinal: ``True`` = o usuário usou o conceito corretamente naquela análise; ``False`` = errou.
A série é sempre cronológica (mais antigo → mais recente).

Além da maestria/tendência por conceito, este módulo também deriva (na leitura, sem chamada
extra ao Gemini):

- ``estimate_cefr``: nível estimado A1–C2 a partir da média das notas recentes.
- ``pick_next_focus``: sugestão determinística de próximo foco de estudo, priorizando os
  conceitos-alvo do guia de estudo ativo (se houver) e caindo para o de menor maestria geral.
"""

from __future__ import annotations

from typing import Optional, Sequence

# ── Constantes do modelo (calibradas; ver docstring do módulo) ──
# Peso do sinal mais recente na EMA principal de maestria: 0.3 = o histórico pesa 70%.
# Maior que o 0.1 dos hábitos porque escrita melhora mais rápido e há menos amostras.
_MASTERY_WEIGHT = 0.3
# Pesos das duas EMAs usadas só para a TENDÊNCIA: rápida reage logo, lenta reage devagar.
_FAST_WEIGHT = 0.5
_SLOW_WEIGHT = 0.2
# Variação menor que isso (em módulo) entre as duas EMAs é considerada "estável".
_TREND_EPS = 0.05
# Mínimo de sinais para a tendência deixar de ser "poucos dados" (None).
_MIN_SAMPLES_FOR_TREND = 3
# Mínimo de análises para o nível CEFR deixar de ser marcado como preliminar.
_MIN_ANALYSES_FOR_CEFR = 5

# Faixas de nota (0-100) → nível CEFR estimado. Ordenadas por limite superior crescente;
# a última faixa (None) captura o restante (>= último limite explícito).
_CEFR_BANDS: tuple[tuple[Optional[int], str], ...] = (
    (40, "A1"),
    (55, "A2"),
    (70, "B1"),
    (83, "B2"),
    (93, "C1"),
    (None, "C2"),
)


def mastery(signals: Sequence[bool], *, weight: float = _MASTERY_WEIGHT) -> float:
    """Calcular a maestria (0–1) de um conceito a partir da série cronológica de sinais.

    EMA simples: ``score = peso * sinal_mais_recente + (1 - peso) * score_anterior``, aplicada
    em ordem cronológica. Sem sinais, a maestria é 0 (conceito nunca visto).

    Args:
        signals: Sinais em ordem cronológica (mais antigo primeiro); ``True`` = acertou.
        weight: Peso do sinal mais recente (default 0.3 — ver docstring do módulo).

    Returns:
        Maestria entre 0.0 e 1.0.

    Example:
        >>> mastery([])
        0.0
        >>> round(mastery([True, True, True]), 2)
        0.66
    """
    ema = 0.0
    for signal in signals:
        valor = 1.0 if signal else 0.0
        ema = weight * valor + (1.0 - weight) * ema
    return ema


def trend(signals: Sequence[bool]) -> Optional[str]:
    """Calcular a tendência (``up``/``down``/``flat``) comparando uma EMA rápida com uma lenta.

    Com poucos sinais (< 3) a tendência não é confiável — devolve ``None`` (a UI mostra o
    selo "poucos dados" e oculta o glyph de tendência, por decisão de clarificação da spec 031).

    Args:
        signals: Sinais em ordem cronológica (mais antigo primeiro).

    Returns:
        ``"up"``, ``"down"``, ``"flat"`` ou ``None`` se houver menos de 3 sinais.

    Example:
        >>> trend([True, False])
        >>> trend([False, False, False, True, True, True])
        'up'
    """
    if len(signals) < _MIN_SAMPLES_FOR_TREND:
        return None

    fast = slow = 0.0
    for signal in signals:
        valor = 1.0 if signal else 0.0
        fast = _FAST_WEIGHT * valor + (1.0 - _FAST_WEIGHT) * fast
        slow = _SLOW_WEIGHT * valor + (1.0 - _SLOW_WEIGHT) * slow

    diff = fast - slow
    if diff > _TREND_EPS:
        return "up"
    if diff < -_TREND_EPS:
        return "down"
    return "flat"


def summarize(signals: Sequence[bool]) -> dict:
    """Resumir a série de sinais de um conceito nas dimensões que a UI consome.

    Args:
        signals: Sinais em ordem cronológica (mais antigo primeiro).

    Returns:
        Dict com ``mastery`` (0-1 float), ``mastery_pct`` (0-100 int), ``trend``
        (``up``/``down``/``flat``/``None``), ``samples`` (int) e ``correct`` (int).

    Example:
        >>> summarize([True, True, True])['samples']
        3
    """
    m = mastery(signals)
    return {
        "mastery": round(m, 4),
        "mastery_pct": round(m * 100),
        "trend": trend(signals),
        "samples": len(signals),
        "correct": sum(1 for s in signals if s),
    }


def estimate_cefr(recent_scores: Sequence[int]) -> dict:
    """Estimar o nível CEFR (A1–C2) a partir das notas recentes de análise (0–100).

    Deriva o nível da **média** das notas — mais estável do que pedir o CEFR ao Gemini a
    cada análise (que teria variância alta entre chamadas). Marca ``preliminary=True``
    enquanto houver poucas análises, sinalizando que a estimativa ainda não é confiável.

    Args:
        recent_scores: Notas (0-100) das análises recentes do idioma, em qualquer ordem.

    Returns:
        Dict ``{"level": str|None, "preliminary": bool}``. ``level`` é ``None`` só quando
        não há nenhuma análise ainda (nada para estimar).

    Example:
        >>> estimate_cefr([])
        {'level': None, 'preliminary': True}
        >>> estimate_cefr([60, 65, 70])['level']
        'B1'
    """
    if not recent_scores:
        return {"level": None, "preliminary": True}

    media = sum(recent_scores) / len(recent_scores)
    level = _CEFR_BANDS[-1][1]
    for limite, nome in _CEFR_BANDS:
        if limite is None or media < limite:
            level = nome
            break

    return {
        "level": level,
        "preliminary": len(recent_scores) < _MIN_ANALYSES_FOR_CEFR,
    }


def pick_next_focus(skills: Sequence[dict], guide_targets: Optional[Sequence[str]] = None) -> Optional[dict]:
    """Sugerir o próximo foco de estudo, de forma determinística (sem chamada ao Gemini).

    Prioriza os conceitos-alvo do guia de estudo ativo (se houver algum com dados —
    ``samples >= 1``), escolhendo o de menor maestria entre eles. Na ausência de guia, ou se
    nenhum alvo do guia tiver dados ainda, cai para o conceito de menor maestria entre os que
    já têm dados suficientes (``samples >= 3``, mesmo limiar de ``trend``).

    Args:
        skills: Lista de dicts com pelo menos ``concept_slug``, ``concept_label``,
            ``mastery_pct`` e ``samples`` (o formato de ``list_skills``).
        guide_targets: Slugs-alvo do guia de estudo ativo, ou ``None``/vazio se não houver.

    Returns:
        Dict ``{"concept_slug", "concept_label", "reason"}`` ou ``None`` se não houver dados
        suficientes para qualquer sugestão.

    Example:
        >>> pick_next_focus([]) is None
        True
    """
    if guide_targets:
        alvo_set = set(guide_targets)
        candidatos_guia = [s for s in skills if s.get("concept_slug") in alvo_set and s.get("samples", 0) >= 1]
        if candidatos_guia:
            escolhido = min(candidatos_guia, key=lambda s: s.get("mastery_pct", 0))
            return {
                "concept_slug": escolhido["concept_slug"],
                "concept_label": escolhido["concept_label"],
                "reason": "menor maestria entre os alvos do seu guia de estudo",
            }

    candidatos_gerais = [s for s in skills if s.get("samples", 0) >= _MIN_SAMPLES_FOR_TREND]
    if not candidatos_gerais:
        return None

    escolhido = min(candidatos_gerais, key=lambda s: s.get("mastery_pct", 0))
    return {
        "concept_slug": escolhido["concept_slug"],
        "concept_label": escolhido["concept_label"],
        "reason": "o conceito com menor maestria entre os que você já praticou",
    }
