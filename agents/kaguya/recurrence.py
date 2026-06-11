"""Motor puro de recorrência da Kaguya — aritmética da RFC 5545 (RRULE).

Este módulo **não toca no banco**: são funções puras (data entra, data sai). Isso é
proposital — toda a matemática de recorrência (o "maior risco do sistema", segundo a spec
master) fica isolada aqui e 100% coberta por testes rápidos e determinísticos. A integração
com o PostgreSQL (criar a próxima linha, mover a regra) vive em ``tools_tasks.py``.

Conceitos (ver ``specs/012-tasks-recurrence/research.md`` §3 — tabela-verdade dos 9 edge cases):

- **RRULE**: a regra de repetição no padrão iCalendar (ex.: ``FREQ=MONTHLY;BYMONTHDAY=5`` =
  "todo dia 5"). Usamos a biblioteca ``python-dateutil`` para expandir essa regra — ela
  implementa a RFC inteira, então não reinventamos a aritmética de calendário (meses com
  28–31 dias, dias da semana, etc.).
- **Âncora** (``anchor_date``): a data-base da série (o "DTSTART" do iCalendar). Em modo
  ``fixed`` ela é a referência fixa de cálculo; reagendar uma ocorrência pontualmente **não**
  muda a âncora.
- **Modos**:
    - ``fixed`` — a série é determinada pela RRULE + âncora (ex.: "todo dia 5" cai sempre no
      dia 5, não importa quando você concluiu).
    - ``after_completion`` — a próxima ocorrência conta a partir da **data de conclusão real**
      (ex.: "trocar o filtro a cada 3 dias, contando de quando eu trocar").

Tudo opera em **datas civis** (``datetime.date``); convertemos para ``datetime`` à meia-noite
só para usar a API do dateutil e voltamos para ``date``. Por isso o motor é imune a horário de
verão / fusos.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

# rrulestr converte a string "FREQ=...;..." num objeto de regra que sabe iterar as ocorrências.
from dateutil.rrule import rrulestr

# Modos de recorrência válidos (espelha o CHECK da coluna task_recurrences.mode).
MODE_FIXED = "fixed"
MODE_AFTER_COMPLETION = "after_completion"
_VALID_MODES = {MODE_FIXED, MODE_AFTER_COMPLETION}

# Mapa de dias da semana (código iCal → 0=segunda..6=domingo, como o Python usa em weekday()).
# Serve tanto para montar regras quanto para descrevê-las em português.
_WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
_WEEKDAY_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos — conversão date↔datetime e consultas à RRULE
# ─────────────────────────────────────────────────────────────────────────────
def _to_dt(d: date) -> datetime:
    """Converte uma ``date`` para ``datetime`` à meia-noite (a API do dateutil usa datetime).

    Args:
        d: A data civil.

    Returns:
        O mesmo dia às 00:00 (sem fuso — recorrência é em datas civis).
    """
    # datetime.combine cola a data com um horário; usamos meia-noite (time.min = 00:00:00).
    return datetime.combine(d, time.min)


def _rule(rrule: str, dtstart: date):
    """Constrói o objeto de regra do dateutil a partir da string RRULE e de uma âncora.

    Args:
        rrule: Regra no padrão RFC 5545 (ex.: ``FREQ=WEEKLY;BYDAY=MO``), sem ``DTSTART``.
        dtstart: A âncora (ponto de partida) da expansão.

    Returns:
        Um objeto iterável de ocorrências (``dateutil.rrule.rrule``).

    Raises:
        ValueError: Se a string RRULE for inválida (o dateutil levanta).
    """
    # forceset=False devolve um rrule simples; passamos a âncora como dtstart.
    return rrulestr(rrule, dtstart=_to_dt(dtstart))


def _after(rule, ref: date) -> Optional[date]:
    """Retorna a primeira ocorrência **estritamente após** ``ref``, ou None se a série acabou.

    Args:
        rule: Objeto de regra do dateutil.
        ref: Data de referência (a próxima tem de ser > ref).

    Returns:
        A próxima data, ou None quando a regra (com COUNT/UNTIL) já se esgotou.
    """
    # inc=False = "não inclua a própria ref" → queremos estritamente depois.
    nxt = rule.after(_to_dt(ref), inc=False)
    return nxt.date() if nxt is not None else None


def _on_or_before(rule, ref: date) -> Optional[date]:
    """Retorna a maior ocorrência da regra **≤ ref**, ou None se não houver nenhuma até ``ref``.

    Usada em modo ``fixed`` para recuperar a ocorrência **lógica** representada pela linha
    viva — mesmo que o usuário tenha reagendado o ``due_date`` da linha, a âncora manda.

    Args:
        rule: Objeto de regra do dateutil.
        ref: Data de referência (a ocorrência tem de ser ≤ ref).

    Returns:
        A ocorrência mais recente até ``ref`` inclusive, ou None.
    """
    # inc=True = "pode ser a própria ref" → maior ocorrência <= ref.
    prev = rule.before(_to_dt(ref), inc=True)
    return prev.date() if prev is not None else None


# ─────────────────────────────────────────────────────────────────────────────
# Função principal — a próxima ocorrência
# ─────────────────────────────────────────────────────────────────────────────
def next_occurrence(
    rrule: str,
    anchor_date: date,
    mode: str,
    *,
    current_due: Optional[date],
    completed_on: date,
) -> Optional[date]:
    """Calcula a próxima ocorrência de uma série recorrente ao concluir a ocorrência atual.

    Implementa exatamente a tabela-verdade de ``research.md`` §3. Em modo ``fixed`` a série é
    determinada pela RRULE+âncora e ocorrências puladas **não** se acumulam (gera no máximo
    uma); em modo ``after_completion`` a próxima conta a partir da conclusão real.

    Args:
        rrule: Regra RFC 5545 (ex.: ``FREQ=MONTHLY;BYMONTHDAY=5``).
        anchor_date: Âncora da série (DTSTART) — base do cálculo em modo ``fixed``.
        mode: ``fixed`` ou ``after_completion``.
        current_due: ``due_date`` da linha viva que está sendo concluída (pode ter sido
            reagendada pontualmente). Em modo ``fixed`` serve para recuperar a ocorrência
            lógica; ignorada em ``after_completion``.
        completed_on: Data da conclusão real (normalmente hoje).

    Returns:
        A data da próxima ocorrência, ou ``None`` quando a série se esgotou (RRULE com
        ``COUNT``/``UNTIL`` que terminou) — o chamador deve, nesse caso, desativar a regra.

    Raises:
        ValueError: Se ``mode`` for inválido ou a RRULE não puder ser interpretada.

    Example:
        >>> from datetime import date
        >>> # "todo dia 5", concluído atrasado no dia 20 → próxima é 5 do mês seguinte
        >>> next_occurrence("FREQ=MONTHLY;BYMONTHDAY=5", date(2026, 6, 5), "fixed",
        ...                  current_due=date(2026, 6, 5), completed_on=date(2026, 6, 20))
        datetime.date(2026, 7, 5)
    """
    # Validação do modo antes de qualquer cálculo (mensagem clara em vez de KeyError).
    if mode not in _VALID_MODES:
        raise ValueError(f"Modo de recorrência inválido: {mode!r} (use 'fixed' ou 'after_completion').")

    if mode == MODE_AFTER_COMPLETION:
        # Re-ancora a regra na data de conclusão e pega a primeira ocorrência depois dela.
        # Ex.: "a cada 3 dias" concluído em X → X+3 (a âncora original é irrelevante aqui).
        rule = _rule(rrule, dtstart=completed_on)
        return _after(rule, completed_on)

    # ── Modo fixed ──
    rule = _rule(rrule, dtstart=anchor_date)
    # O = ocorrência lógica atual: a maior ocorrência da série até o due_date da linha viva.
    # Se a linha não tem data (não deveria acontecer — recorrência exige due_date) ou a data é
    # anterior à âncora, caímos na própria âncora.
    logical = _on_or_before(rule, current_due) if current_due is not None else None
    if logical is None:
        logical = anchor_date
    # ref = a maior entre (ocorrência lógica, data de conclusão). Garante dois invariantes:
    #   - completar adiantado consome a ocorrência (ref = ocorrência lógica → próxima depois dela);
    #   - completar atrasado não acumula puladas (ref = conclusão → próxima depois de hoje).
    ref = max(logical, completed_on)
    return _after(rule, ref)


# ─────────────────────────────────────────────────────────────────────────────
# Construção de RRULE a partir de uma intenção simples (presets da UI e do agente)
# ─────────────────────────────────────────────────────────────────────────────
def build_rrule(
    freq: str,
    interval: int = 1,
    weekday: Optional[str] = None,
    monthday: Optional[int] = None,
) -> str:
    """Monta uma string RRULE a partir de uma intenção simples (sem o usuário ver RRULE crua).

    Cobre o subconjunto pragmático que a UI e a Kaguya usam (ver ``data-model.md``). Regras
    fora desse subconjunto podem ser escritas à mão — o motor ``next_occurrence`` aceita
    qualquer RRULE válida.

    Args:
        freq: ``DAILY`` | ``WEEKLY`` | ``MONTHLY`` | ``YEARLY``.
        interval: A cada quantos períodos repete (ex.: ``interval=3`` + ``DAILY`` = a cada 3 dias).
        weekday: Para ``WEEKLY``, o dia da semana em código iCal (``MO``..``SU``).
        monthday: Para ``MONTHLY``, o dia do mês (1–31).

    Returns:
        A string RRULE (ex.: ``FREQ=WEEKLY;BYDAY=MO``).

    Raises:
        ValueError: Se ``freq`` for inválido ou ``interval`` < 1.

    Example:
        >>> build_rrule("MONTHLY", monthday=5)
        'FREQ=MONTHLY;BYMONTHDAY=5'
        >>> build_rrule("DAILY", interval=3)
        'FREQ=DAILY;INTERVAL=3'
    """
    freq = freq.upper()
    if freq not in {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}:
        raise ValueError(f"Frequência inválida: {freq!r}.")
    if interval < 1:
        raise ValueError("interval deve ser >= 1.")

    # Começa sempre pela frequência; os demais campos são opcionais.
    parts = [f"FREQ={freq}"]
    # INTERVAL só aparece quando != 1 (deixa a regra mais limpa para "todo dia"/"todo mês").
    if interval != 1:
        parts.append(f"INTERVAL={interval}")
    # BYDAY: dia da semana fixo (só faz sentido em WEEKLY).
    if weekday is not None:
        wd = weekday.upper()
        if wd not in _WEEKDAY_CODES:
            raise ValueError(f"Dia da semana inválido: {weekday!r} (use MO..SU).")
        parts.append(f"BYDAY={wd}")
    # BYMONTHDAY: dia do mês fixo (só faz sentido em MONTHLY).
    if monthday is not None:
        if not 1 <= monthday <= 31:
            raise ValueError("monthday deve estar entre 1 e 31.")
        parts.append(f"BYMONTHDAY={monthday}")

    return ";".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# Descrição em português (o "eco" da Kaguya e o rótulo na UI)
# ─────────────────────────────────────────────────────────────────────────────
def _parse_rrule_parts(rrule: str) -> dict[str, str]:
    """Quebra uma string RRULE em um dicionário ``{CHAVE: valor}`` (ex.: ``{'FREQ': 'WEEKLY'}``).

    Args:
        rrule: A string RRULE (com ou sem o prefixo ``RRULE:``).

    Returns:
        Dicionário das partes em maiúsculas.
    """
    # Remove um eventual prefixo "RRULE:" e separa por ';'.
    body = rrule.split(":", 1)[-1] if rrule.upper().startswith("RRULE:") else rrule
    parts: dict[str, str] = {}
    for chunk in body.split(";"):
        if "=" in chunk:
            key, value = chunk.split("=", 1)
            parts[key.strip().upper()] = value.strip()
    return parts


def describe_rrule(rrule: str) -> str:
    """Descreve uma RRULE em português coloquial (para o eco da Kaguya e o rótulo da UI).

    Reconhece o subconjunto comum (diária/semanal/mensal/anual, com intervalo e dia fixo) e
    cai num rótulo genérico ("recorrente") para regras fora do padrão — nunca quebra.

    Args:
        rrule: A string RRULE.

    Returns:
        Texto curto em pt-BR (ex.: "todo dia 5", "toda segunda", "a cada 3 dias", "todo ano").

    Example:
        >>> describe_rrule("FREQ=WEEKLY;BYDAY=MO")
        'toda segunda'
        >>> describe_rrule("FREQ=DAILY;INTERVAL=3")
        'a cada 3 dias'
    """
    parts = _parse_rrule_parts(rrule)
    freq = parts.get("FREQ", "").upper()
    # INTERVAL ausente = 1 (uma vez por período).
    interval = int(parts.get("INTERVAL", "1"))

    if freq == "DAILY":
        # "todo dia" quando interval=1; "a cada N dias" caso contrário.
        return "todo dia" if interval == 1 else f"a cada {interval} dias"

    if freq == "WEEKLY":
        byday = parts.get("BYDAY")
        if byday and byday.upper() in _WEEKDAY_CODES:
            # Traduz o código do dia (MO→segunda) e respeita o intervalo.
            nome = _WEEKDAY_PT[_WEEKDAY_CODES.index(byday.upper())]
            if interval == 1:
                return f"toda {nome}"
            return f"a cada {interval} semanas na {nome}"
        return "toda semana" if interval == 1 else f"a cada {interval} semanas"

    if freq == "MONTHLY":
        monthday = parts.get("BYMONTHDAY")
        if monthday:
            # "todo dia 5" (interval=1) ou "a cada N meses no dia 5".
            if interval == 1:
                return f"todo dia {monthday}"
            return f"a cada {interval} meses no dia {monthday}"
        return "todo mês" if interval == 1 else f"a cada {interval} meses"

    if freq == "YEARLY":
        return "todo ano" if interval == 1 else f"a cada {interval} anos"

    # Frequência desconhecida ou regra exótica → rótulo seguro.
    return "recorrente"
