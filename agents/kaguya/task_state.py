"""Estado de fluxo das tarefas da Kaguya — o que cada status/coluna SIGNIFICA (motor puro).

Motivo: colunas do Kanban são texto livre (Backlog, Blocked, To Do, Doing, Homolog, Done) e o
GTD tem estados (aguardando/delegada, algum dia). Para uma IA ou um alarme, "Homolog" não é uma
pendência do usuário (está esperando validação), assim como uma tarefa delegada ou "algum dia".
Este módulo é a FONTE ÚNICA dessa regra — digest, Conselho do Dia, revisão semanal e alarmes
chamam daqui em vez de reinventar.

Usage:
    from agents.kaguya.task_state import infer_column_kind, chargeable_sql, flow_state

Sem acesso a banco: só texto e dicionários (fácil de testar).
"""

import unicodedata
from typing import Optional

# Tipos válidos de coluna (espelham o CHECK de task_columns.kind no schema).
COLUMN_KINDS = ("backlog", "blocked", "todo", "doing", "review", "done")

# Tipos de coluna cujas tarefas NÃO são pendência do usuário agora.
NON_CHARGEABLE_KINDS = ("backlog", "blocked", "review")
# Status GTD que também não cobram: delegada (aguardando) e algum dia.
NON_CHARGEABLE_GTD = ("waiting", "someday")

# Sinônimos (já normalizados: minúsculo, sem acento) → tipo da coluna.
_SYNONYMS: dict[str, tuple[str, ...]] = {
    "backlog": ("backlog", "ideia", "ideias", "icebox", "inbox"),
    "blocked": ("blocked", "bloqueado", "bloqueada", "bloqueadas", "bloqueados", "impedido", "impedidos"),
    "todo": ("to do", "todo", "a fazer", "pendente", "pendentes"),
    "doing": ("doing", "fazendo", "em andamento", "wip", "in progress"),
    "review": ("homolog", "homologacao", "em homologacao", "review", "revisao", "em revisao",
               "qa", "validacao", "em validacao", "teste", "testes"),
    "done": ("done", "concluido", "concluidos", "concluida", "concluidas", "feito", "feitos"),
}

# Rótulos em português para os prompts de IA (o que a tarefa está "esperando").
_LABELS = {
    "backlog": "em backlog (ainda não comprometida)",
    "blocked": "bloqueada",
    "review": "em homologação (aguardando validação)",
    "waiting": "delegada (aguardando terceiros)",
    "someday": "algum dia (incubada)",
    "todo": "a fazer",
    "doing": "em andamento",
    "done": "concluída",
    "open": "aberta",
}


def _norm(text: str) -> str:
    """Normaliza para comparar nomes: minúsculo, sem acento e sem espaços sobrando."""
    sem_acento = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def infer_column_kind(name: str, is_done: bool = False) -> Optional[str]:
    """Inferir o tipo semântico de uma coluna a partir do nome.

    Args:
        name: Nome da coluna do Kanban.
        is_done: True quando a coluna é a de concluídas (``is_done_column``).

    Returns:
        Um item de ``COLUMN_KINDS`` ou ``None`` se o nome não for reconhecido
        (nesse caso a coluna é tratada como cobrável, como era antes).

    Example:
        >>> infer_column_kind("Homolog")
        'review'
        >>> infer_column_kind("  Ideia ")
        'backlog'
        >>> infer_column_kind("To Do")
        'todo'
        >>> infer_column_kind("Qualquer coisa") is None
        True
        >>> infer_column_kind("Pronto", is_done=True)
        'done'
    """
    if is_done:
        return "done"
    chave = _norm(name)
    for kind, nomes in _SYNONYMS.items():
        if chave in nomes:
            return kind
    return None


def chargeable_sql(t: str = "t", c: str = "c") -> str:
    """Gerar o trecho SQL que deixa só tarefas "cobráveis" (pendência real do usuário).

    Exige que a query tenha ``LEFT JOIN task_columns {c} ON {c}.id = {t}.column_id``.
    Tarefa sem coluna/sem tipo/sem status GTD continua cobrável (comportamento antigo).

    Args:
        t: Alias da tabela ``tasks`` na query.
        c: Alias da tabela ``task_columns`` na query.

    Returns:
        Fragmento SQL booleano, já entre parênteses.

    Example:
        >>> "NOT IN ('backlog', 'blocked', 'review')" in chargeable_sql()
        True
    """
    kinds = ", ".join(f"'{k}'" for k in NON_CHARGEABLE_KINDS)
    gtd = ", ".join(f"'{g}'" for g in NON_CHARGEABLE_GTD)
    return (
        f"(({c}.kind IS NULL OR {c}.kind NOT IN ({kinds})) "
        f"AND ({t}.gtd_status IS NULL OR {t}.gtd_status NOT IN ({gtd})))"
    )


def flow_state(task: dict) -> str:
    """Resumir o estado de fluxo de uma tarefa (coluna do Kanban + status GTD).

    O tipo da coluna vence o GTD quando a coluna é não-cobrável; senão vale o GTD.

    Args:
        task: Dict com ``column_kind`` e/ou ``gtd_status`` (chaves ausentes valem ``None``).

    Returns:
        Um de ``backlog/blocked/review/waiting/someday/todo/doing/open``.

    Example:
        >>> flow_state({"column_kind": "review", "gtd_status": None})
        'review'
        >>> flow_state({"column_kind": "doing", "gtd_status": "waiting"})
        'waiting'
        >>> flow_state({})
        'open'
    """
    kind = task.get("column_kind")
    gtd = task.get("gtd_status")
    if kind in NON_CHARGEABLE_KINDS:
        return kind
    if gtd in NON_CHARGEABLE_GTD:
        return gtd
    if kind in ("todo", "doing"):
        return kind
    return "open"


def is_chargeable(task: dict) -> bool:
    """Dizer se a tarefa conta como pendência do usuário (versão Python de ``chargeable_sql``).

    Example:
        >>> is_chargeable({"column_kind": "review"})
        False
        >>> is_chargeable({"gtd_status": "someday"})
        False
        >>> is_chargeable({"column_kind": "doing"})
        True
    """
    return task.get("column_kind") not in NON_CHARGEABLE_KINDS and task.get("gtd_status") not in NON_CHARGEABLE_GTD


def flow_label(task: dict) -> str:
    """Rótulo em português do estado de fluxo, para os prompts de IA.

    Example:
        >>> flow_label({"column_kind": "review"})
        'em homologação (aguardando validação)'
    """
    return _LABELS[flow_state(task)]
