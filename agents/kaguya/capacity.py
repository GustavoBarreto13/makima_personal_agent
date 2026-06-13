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

from typing import Optional


# Janela útil padrão (8h–22h) em minutos a partir de meia-noite.
# 8 * 60 = 480 e 22 * 60 = 1320 → 840 minutos.
_WINDOW_START = 480   # 8h em minutos
_WINDOW_END = 1320    # 22h em minutos
_FREE_WINDOW = _WINDOW_END - _WINDOW_START  # 840 min


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
        for inicio, fim in eventos:
            # Recorta o evento à janela: max do início e min do fim.
            efetivo_ini = max(inicio, win_ini)
            efetivo_fim = min(fim, win_fim)
            # Se o evento estiver inteiramente fora da janela, não conta.
            duracao = efetivo_fim - efetivo_ini
            if duracao > 0:
                agenda_min += duracao

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
