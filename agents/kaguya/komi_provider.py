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

from agents.db import get_conn, run_select
from agents.komi.integration import replace_mention_id

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


def _last_activity(person_ids: list[str]) -> list[dict]:
    """Última tarefa CONCLUÍDA vinculada a cada pessoa (dia local de São Paulo).

    Args:
        person_ids: IDs das pessoas.

    Returns:
        ``[{person_id, date, text}]`` — uma linha por pessoa com tarefa concluída.
    """
    return run_select(
        """
        SELECT DISTINCT ON (pl.person_id) pl.person_id,
               (t.completed_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS date, t.title AS text
        FROM person_links pl JOIN tasks t ON t.id = pl.entity_id::int AND t.completed_at IS NOT NULL
        WHERE pl.entity_type = 'task' AND pl.person_id = ANY(%(ids)s)
        ORDER BY pl.person_id, t.completed_at DESC
        """,
        {"ids": person_ids},
    )


def _on_unlink_waiting(person_id: str, task_id: str) -> bool:
    """Parar de "aguardar" a pessoa numa tarefa (limpa ``waiting_person_id`` e a data de cobrança).

    Args:
        person_id: A pessoa que a tarefa aguardava.
        task_id: ID da tarefa.

    Returns:
        ``True`` se a tarefa aguardava mesmo essa pessoa e foi liberada.
    """
    if not str(task_id).isdigit():
        return False
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE tasks SET waiting_person_id = NULL, follow_up_date = NULL, updated_at = now() "
            "WHERE id = %s AND waiting_person_id = %s",
            (int(task_id), person_id),
        )
        return cur.rowcount > 0


def _on_merge(drop_id: str, keep_id: str, keep_name: str) -> int:
    """Reapontar para a pessoa que ficou: tarefas "aguardando" e menções nas descrições.

    Args:
        drop_id: ID da pessoa absorvida.
        keep_id: ID da pessoa que fica.
        keep_name: Nome que passa a aparecer nos tokens ``@[Nome](komi:id)``.

    Returns:
        Quantas tarefas foram atualizadas.
    """
    tarefas: set[int] = set()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE tasks SET waiting_person_id = %s WHERE waiting_person_id = %s RETURNING id", (keep_id, drop_id))
        tarefas.update(r[0] for r in cur.fetchall())
        cur.execute("SELECT id, description FROM tasks WHERE description LIKE %s", (f"%(komi:{drop_id})%",))
        for tid, texto in cur.fetchall():
            cur.execute("UPDATE tasks SET description = %s WHERE id = %s", (replace_mention_id(texto, drop_id, keep_id, keep_name), tid))
            tarefas.add(tid)
    return len(tarefas)


LINK_TYPES = [
    {
        "entity_type": "task", "agent": "kaguya", "label": "Tarefas", "icon": "task",
        "resolve": _resolve, "summary_key": "tarefas", "summary": _summary_tasks,
        "last_activity": _last_activity, "activity_kind": "tarefa",
    },
    {
        "entity_type": "task_waiting", "agent": "kaguya", "label": "Aguardando", "icon": "waiting",
        "by_person": _waiting, "summary_key": "aguardando", "summary": _summary_waiting,
        "on_unlink": _on_unlink_waiting, "on_merge": _on_merge,
    },
]
