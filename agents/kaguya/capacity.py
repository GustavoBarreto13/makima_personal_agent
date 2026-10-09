"""Motor de capacity do Meu Dia — função pura, sem banco nem Calendar.

Calcula quantas horas o plano do dia ocupa, cruzando estimativas de tarefas com
eventos do Google Calendar, comparando com a janela útil (padrão 8h–22h = 840 min).
Resultado: os 3 stats do hero + a barra de progresso da CapacityBar.

Puro significa: recebe os dados prontos (listas de números), não acessa banco nem rede.
Isso facilita os testes e garante que o motor nunca quebre o Meu Dia por falha externa.

Usage:
    >>> compute_capacity([60, 30, None], [(480, 540), (660, 780)])
    {'no_plano': 3, 'estimado_min': 90, 'agenda_min': 180, 'livre_min': 660, 'folga_min': 570, 'excedeu': False, 'calendar_ok': True}
"""

from datetime import date, time
from typing import Mapping, Optional, Sequence


# Janela útil padrão (8h–22h) em minutos a partir de meia-noite.
# 8 * 60 = 480 e 22 * 60 = 1320 → 840 minutos.
_WINDOW_START = 480   # 8h em minutos
_WINDOW_END = 1320    # 22h em minutos
_FREE_WINDOW = _WINDOW_END - _WINDOW_START  # 840 min


# ─────────────────────────────────────────────────────────────────────────────
# Intervalos (minutos desde a meia-noite). Funções puras usadas pelos dois modelos.
# ─────────────────────────────────────────────────────────────────────────────
Interval = tuple[int, int]


def merge_intervals(intervals: Sequence[Interval]) -> list[Interval]:
    """Funde intervalos sobrepostos ou encostados, devolvendo-os ordenados e disjuntos.

    Args:
        intervals: Pares ``(inicio, fim)`` em minutos; pares com ``fim <= inicio`` são ignorados.

    Returns:
        Lista ordenada de intervalos sem sobreposição.

    Example:
        >>> merge_intervals([(540, 600), (570, 660), (900, 930)])
        [(540, 660), (900, 930)]
    """
    out: list[Interval] = []
    for ini, fim in sorted(i for i in intervals if i[1] > i[0]):
        if out and ini <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], fim))
        else:
            out.append((ini, fim))
    return out


def _clip(intervals: Sequence[Interval], lo: int, hi: int) -> list[Interval]:
    """Recorta intervalos a ``[lo, hi]``, descartando os que ficam fora."""
    return [(max(i, lo), min(f, hi)) for i, f in intervals if min(f, hi) > max(i, lo)]


def _total(intervals: Sequence[Interval]) -> int:
    """Soma a duração (em minutos) de intervalos já disjuntos."""
    return sum(f - i for i, f in intervals)


def _subtract(base: Sequence[Interval], cuts: Sequence[Interval]) -> list[Interval]:
    """Remove ``cuts`` de ``base`` (ambos disjuntos e ordenados), devolvendo o que sobra."""
    out: list[Interval] = []
    for b_ini, b_fim in base:
        cursor = b_ini
        for c_ini, c_fim in cuts:
            if c_fim <= cursor or c_ini >= b_fim:
                continue
            if c_ini > cursor:
                out.append((cursor, c_ini))
            cursor = max(cursor, c_fim)
        if cursor < b_fim:
            out.append((cursor, b_fim))
    return out


def compute_capacity(
    estimativas: list[Optional[int]],
    eventos: list[tuple[int, int]],
    janela: tuple[int, int] = (_WINDOW_START, _WINDOW_END),
    calendar_ok: bool = True,
) -> dict:
    """Calcula as métricas de capacity do dia a partir de dados já carregados.

    Recebe os dados prontos (sem acessar banco nem rede) e devolve os números
    que alimentam o hero e a CapacityBar do Meu Dia.

    Args:
        estimativas: Lista de ``duration_min`` de cada tarefa do plano de hoje.
            ``None`` ou valor ausente conta como 0 (não inventa duração).
        eventos: Lista de ``(inicio_min, fim_min)`` de cada evento do Google Calendar
            do dia (minutos desde meia-noite, ex.: 9h30 = 570, 11h = 660).
            Recortado à janela útil antes de somar.
        janela: Janela útil ``(inicio_min, fim_min)`` em minutos. Padrão 8h–22h.
        calendar_ok: ``False`` quando o Calendar não respondeu — zera ``agenda_min``
            e sinaliza a indisponibilidade no resultado (sem quebrar a tela).

    Returns:
        Dicionário com:
            ``no_plano`` (int): Quantidade de tarefas no plano.
            ``estimado_min`` (int): Total estimado de trabalho (sem eventos).
            ``agenda_min`` (int): Duração dos eventos dentro da janela útil.
            ``livre_min`` (int): Janela útil menos agenda (≥ 0).
            ``folga_min`` (int): Livre menos estimado (negativo = estouro).
            ``excedeu`` (bool): True quando o plano excede a janela livre.
            ``calendar_ok`` (bool): Se o Calendar foi lido com sucesso.

    Example:
        >>> compute_capacity([60, 30, None], [(480, 540), (660, 780)])
        {'no_plano': 3, 'estimado_min': 90, 'agenda_min': 180, 'livre_min': 660, 'folga_min': 570, 'excedeu': False, 'calendar_ok': True}
    """
    # Início e fim da janela útil em minutos (normalmente 480–1320 = 8h–22h).
    win_ini, win_fim = janela
    janela_total = win_fim - win_ini  # em minutos

    # Soma das estimativas das tarefas do plano (None → 0, não inventa duração).
    estimado_min = sum(e for e in estimativas if e is not None and e > 0)
    no_plano = len(estimativas)

    # Soma da duração dos eventos do Calendar, recortada à janela útil.
    # Evento fora da janela conta 0; evento parcialmente dentro é truncado.
    agenda_min = 0
    if calendar_ok:
        # Funde eventos sobrepostos ANTES de somar: duas reuniões simultâneas ocupam o horário
        # uma vez só (antes eram somadas duas vezes e inflavam a agenda).
        agenda_min = _total(_clip(merge_intervals(eventos), win_ini, win_fim))

    # Janela livre = tempo útil menos o que já está tomado pela agenda.
    # Nunca negativo: double-booked meetings não "criam" tempo extra.
    livre_min = max(0, janela_total - agenda_min)

    # Folga = janela livre menos o trabalho estimado.
    # Negativo significa que o plano excede o tempo disponível (estouro).
    folga_min = livre_min - estimado_min

    return {
        "no_plano": no_plano,
        "estimado_min": estimado_min,
        "agenda_min": agenda_min,
        "livre_min": livre_min,
        "folga_min": folga_min,
        "excedeu": folga_min < 0,
        "calendar_ok": calendar_ok,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agenda do usuário (spec 075) — expediente, almoço, acordar/dormir e DOIS tempos livres
# ─────────────────────────────────────────────────────────────────────────────
_DAY = 1440


def _minutes(t: Optional[time]) -> Optional[int]:
    """Converte ``datetime.time`` em minutos desde a meia-noite (``None`` passa direto)."""
    return None if t is None else t.hour * 60 + t.minute


def resolve_day_schedule(
    prefs: Mapping,
    day: date,
    override: Optional[Mapping] = None,
) -> dict:
    """Resolve a agenda de UM dia a partir das preferências e de uma eventual exceção.

    Trabalho acontece só nos ``work_days`` (ISO: 1=segunda … 7=domingo), a menos que haja uma
    exceção para o dia: ``works=True`` ("vou trabalhar neste sábado") ou ``works=False`` ("folga").
    O horário da exceção, quando informado, substitui o expediente padrão naquele dia.

    Args:
        prefs: Linha de ``kaguya_schedule_prefs`` (``work_days``, ``work_start``, ``work_end``,
            ``lunch_start``, ``lunch_end``, ``lunch_is_free``, ``wake_time``, ``sleep_time``).
        day: O dia a resolver.
        override: Linha de ``kaguya_schedule_overrides`` desse dia, se existir.

    Returns:
        ``{"works", "work": (ini, fim) | None, "lunch": (ini, fim) | None, "lunch_is_free",
        "awake": (ini, fim)}`` em minutos desde a meia-noite. ``awake`` pode passar de 1440 quando
        se dorme depois da meia-noite. ``lunch`` só vem quando cai dentro do expediente.
    """
    works = day.isoweekday() in set(prefs["work_days"])
    w_ini, w_fim = _minutes(prefs["work_start"]), _minutes(prefs["work_end"])
    if override is not None:
        works = bool(override["works"])
        if override.get("work_start") is not None:
            w_ini, w_fim = _minutes(override["work_start"]), _minutes(override["work_end"])

    work = (w_ini, w_fim) if works else None

    lunch = None
    l_ini, l_fim = _minutes(prefs.get("lunch_start")), _minutes(prefs.get("lunch_end"))
    if work and l_ini is not None and l_fim is not None:
        clipped = _clip([(l_ini, l_fim)], work[0], work[1])
        lunch = clipped[0] if clipped else None

    wake, sleep = _minutes(prefs["wake_time"]), _minutes(prefs["sleep_time"])
    if sleep <= wake:        # dorme depois da meia-noite
        sleep += _DAY
    return {
        "works": works,
        "work": work,
        "lunch": lunch,
        "lunch_is_free": bool(prefs.get("lunch_is_free")),
        "awake": (wake, sleep),
    }


def _bucket(available: list[Interval], busy: list[Interval], estimated: int) -> dict:
    """Monta as métricas de um balde de tempo (trabalho ou geral)."""
    free = _subtract(available, busy)
    window_min = _total(available)
    free_min = _total(free)
    return {
        "window_min": window_min,            # tempo disponível antes dos compromissos
        "busy_min": window_min - free_min,   # tomado por compromissos do calendário
        "livre_min": free_min,               # o que sobra para tarefas
        "estimado_min": estimated,
        "folga_min": free_min - estimated,   # negativo = estouro
        "excedeu": estimated > free_min,
    }


def compute_free_time(
    schedule: Mapping,
    eventos: Sequence[Interval],
    estimado_work_min: int = 0,
    estimado_personal_min: int = 0,
    a_partir_de: Optional[int] = None,
    calendar_ok: bool = True,
) -> dict:
    """Calcula os DOIS tempos livres do dia: o do trabalho e o geral.

    - **Livre do trabalho** = expediente − compromissos do calendário. O almoço entra no expediente
      só se ``lunch_is_free`` (o usuário o considera tempo utilizável); senão é descontado.
    - **Livre geral** = acordado (acordar→dormir) − expediente − compromissos. Em dia sem trabalho,
      é o dia acordado inteiro. O almoço nunca é contado duas vezes: pertence ao balde do trabalho.

    Compromissos (qualquer evento do calendário) descontam dos dois baldes onde caírem: uma consulta
    às 15h num dia útil rouba tempo do expediente; uma reunião às 19h rouba tempo da noite.

    Args:
        schedule: Resultado de :func:`resolve_day_schedule`.
        eventos: Compromissos do dia como ``(inicio_min, fim_min)``.
        estimado_work_min: Soma das estimativas do plano em listas de trabalho.
        estimado_personal_min: Soma das estimativas do plano em listas pessoais.
        a_partir_de: Se informado (minutos desde a meia-noite), só conta o tempo daí em diante —
            usado para "quanto ainda dá para fazer hoje".
        calendar_ok: ``False`` quando o Calendar não respondeu (ignora os compromissos).

    Returns:
        ``{"works", "work": <balde>, "general": <balde>, "total": <balde>, "calendar_ok"}``; cada
        balde traz ``window_min``, ``busy_min``, ``livre_min``, ``estimado_min``, ``folga_min`` e
        ``excedeu``. ``total`` soma os dois (o "Tudo" do seletor de espaço).
    """
    busy = merge_intervals(eventos) if calendar_ok else []

    work_avail: list[Interval] = []
    if schedule["work"]:
        w_ini, w_fim = schedule["work"]
        work_avail = [(w_ini, w_fim)]
        # Almoço descontado do expediente, salvo se o usuário o considera tempo livre.
        if schedule["lunch"] and not schedule["lunch_is_free"]:
            work_avail = _subtract(work_avail, [schedule["lunch"]])

    awake = [schedule["awake"]]
    general_avail = _subtract(awake, [schedule["work"]] if schedule["work"] else [])

    if a_partir_de is not None:
        work_avail = _clip(work_avail, a_partir_de, 10 * _DAY)
        general_avail = _clip(general_avail, a_partir_de, 10 * _DAY)

    work = _bucket(work_avail, busy, estimado_work_min)
    general = _bucket(general_avail, busy, estimado_personal_min)
    total = {
        k: work[k] + general[k] for k in ("window_min", "busy_min", "livre_min", "estimado_min", "folga_min")
    }
    total["excedeu"] = total["estimado_min"] > total["livre_min"]
    return {
        "works": schedule["works"],
        "work": work,
        "general": general,
        "total": total,
        "calendar_ok": calendar_ok,
    }
