"""Provedor da Kaguya para a Memória da Komi (spec 077): tarefas ligadas a uma pessoa.

Dois tipos de backlink, ambos seguindo o contrato de ``agents.komi.integration``:

- ``task`` — tarefas em que a pessoa foi vinculada (``person_links``).
- ``task_waiting`` — tarefas "aguardando" a pessoa (``tasks.waiting_person_id``). Esse
  vínculo NÃO está em ``person_links``, por isso usa ``by_person`` em vez de ``resolve``.

O ``context`` de cada item é o espaço da LISTA da tarefa (trabalho ou pessoal, spec 038):
é isso que separa a Memória de trabalho da pessoal para quem é "ambos".

Usage:
    >>> from agents.kaguya.komi_provider import LINK_TYPES
    >>> [t["entity_type"] for t in LINK_TYPES]
    ['task', 'task_waiting']
"""

from __future__ import annotations

from agents.db import run_select

# "Dia" de uma tarefa na Memória: vencimento, senão conclusão, senão criação — sempre no
# fuso America/Sao_Paulo (nunca a data UTC do servidor).
_DIA_SQL = """COALESCE(
    t.due_date,
    (t.completed_at AT TIME ZONE 'America/Sao_Paulo')::date,
    (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date
)::text"""


def _ids_inteiros(ids: list[str]) -> list[int]:
    """Converter os IDs (texto) em inteiros, ignorando o que não for número.

    Args:
        ids: IDs vindos de ``person_links.entity_id``.

    Returns:
        Os IDs numéricos.
    """
    return [int(i) for i in ids if str(i).isdigit()]


def _resolve(ids: list[str]) -> list[dict]:
    """Buscar as tarefas (não apagadas) vinculadas à pessoa.

    Args:
        ids: IDs das tarefas gravados em ``person_links``.

    Returns:
        Itens da Memória com o link para abrir a tarefa.
    """
    linhas = run_select(
        f"""
        SELECT t.id, t.title, t.due_date::text AS due, t.completed_at IS NOT NULL AS concluida,
               p.context, {_DIA_SQL} AS dia
        FROM tasks t JOIN task_projects p ON p.id = t.project_id
        WHERE t.id = ANY(%(ids)s) AND t.deleted_at IS NULL
        """,
        {"ids": _ids_inteiros(ids)},
    )
    itens = []
    for r in linhas:
        if r["concluida"]:
            situacao = "Concluída"
        elif r["due"]:
            situacao = f"Vence {r['due']}"
        else:
            situacao = "Em aberto"
        itens.append({
            "entity_id": r["id"], "title": r["title"], "snippet": situacao, "date": r["dia"],
            "deep_link": f"/tasks#tarefa/{r['id']}", "context": r["context"],
        })
    return itens


def _waiting(person_id: str) -> list[dict]:
    """Buscar as tarefas abertas que estão "aguardando" a pessoa.

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        Itens da Memória; a data é a de cobrança (``follow_up_date``), se houver.
    """
    linhas = run_select(
        f"""
        SELECT t.id, t.title, t.follow_up_date::text AS cobrar, p.context, {_DIA_SQL} AS dia
        FROM tasks t JOIN task_projects p ON p.id = t.project_id
        WHERE t.waiting_person_id = %(pid)s AND t.deleted_at IS NULL AND t.completed_at IS NULL
        ORDER BY t.follow_up_date NULLS LAST, t.created_at
        """,
        {"pid": person_id},
    )
    return [
        {
            "entity_id": r["id"], "title": r["title"],
            "snippet": f"Cobrar em {r['cobrar']}" if r["cobrar"] else "Aguardando retorno",
            "date": r["cobrar"] or r["dia"], "deep_link": f"/tasks#tarefa/{r['id']}",
            "context": r["context"],
        }
        for r in linhas
    ]


def _summary_tasks(person_id: str) -> dict:
    """Montar o bloco ``tarefas`` do resumo da pessoa (abertas + últimas concluídas).

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"abertas": [...], "concluidas": [...]}`` (até 5 concluídas).
    """
    abertas = run_select(
        """
        SELECT t.id, t.title, t.due_date::text, t.priority
        FROM person_links pl
        JOIN tasks t ON t.id = pl.entity_id::int AND t.deleted_at IS NULL AND t.completed_at IS NULL
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'task'
        ORDER BY t.due_date NULLS LAST, t.created_at
        """,
        {"pid": person_id},
    )
    concluidas = run_select(
        """
        SELECT t.id, t.title, t.completed_at::text
        FROM person_links pl
        JOIN tasks t ON t.id = pl.entity_id::int AND t.completed_at IS NOT NULL
        WHERE pl.person_id = %(pid)s AND pl.entity_type = 'task'
        ORDER BY t.completed_at DESC LIMIT 5
        """,
        {"pid": person_id},
    )
    return {"abertas": abertas, "concluidas": concluidas}


def _summary_waiting(person_id: str) -> dict:
    """Montar o bloco ``aguardando`` (tarefas que dependem desta pessoa).

    Args:
        person_id: ID da pessoa na Komi.

    Returns:
        ``{"itens": [{id, title, follow_up_date}, ...]}``.
    """
    itens = [
        {"id": i["entity_id"], "title": i["title"], "follow_up_date": i["date"], "deep_link": i["deep_link"]}
        for i in _waiting(person_id)
    ]
    return {"itens": itens}


LINK_TYPES = [
    {
        "entity_type": "task", "agent": "kaguya", "label": "Tarefas", "icon": "task",
        "resolve": _resolve, "summary_key": "tarefas", "summary": _summary_tasks,
    },
    {
        "entity_type": "task_waiting", "agent": "kaguya", "label": "Aguardando", "icon": "waiting",
        "by_person": _waiting, "summary_key": "aguardando", "summary": _summary_waiting,
    },
]
