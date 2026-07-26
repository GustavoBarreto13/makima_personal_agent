"""Camada de lógica — views fixas de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox).

Quinta peça da camada de lógica (junto de ``tools_tasks.py``, ``tools_projects.py``,
``tools_tags.py`` e ``tools_filters.py``). Diferente das smart-lists salvas
(``task_filters``), estas 5 views são **fixas do código** — não editáveis pelo usuário,
sem linha em banco (research.md R7 / data-model.md § "Views fixas").

Reusa 100% o motor de tradução da DSL (``_run_filter_rules``/``_build_where_from_rules``)
de ``tools_filters.py`` — nenhuma query nova é escrita à mão.
"""

from agents.kaguya.tools_filters import _run_filter_rules, list_today_overdue
from agents.kaguya.tools_tasks import _get_inbox_id
from agents.db import get_conn

# Ordem de exibição no bloco fixo da sidebar (FR-006).
VIEW_KEYS = ("all", "today", "tomorrow", "next7", "inbox")


def _inbox_id() -> int:
    """Resolve o id do Inbox usando um cursor descartável (mesma função de tools_tasks)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            return _get_inbox_id(cur)


def list_view_all() -> list:
    """Todas as tarefas abertas, independentemente de lista ou data (FR-006/US2 cenário 1).

    Returns:
        Lista de tarefas serializadas (a base "abertas" da DSL, sem nenhuma condição extra).
        **Listagem**.
    """
    return _run_filter_rules({"combinator": "and", "conditions": []})["tasks"]


def list_view_today() -> list:
    """Tarefas de hoje + vencidas (a mesma regra da smart-list built-in "Hoje + Vencidas").

    Reexposta aqui (não duplicada) para a view fixa "Hoje" do bloco de mercado (FR-007).

    Returns:
        Lista de tarefas serializadas. **Listagem**.
    """
    return list_today_overdue()


def list_view_tomorrow() -> list:
    """Tarefas que vencem amanhã (e só amanhã — não inclui hoje nem vencidas).

    Returns:
        Lista de tarefas serializadas. **Listagem**.
    """
    rules = {"combinator": "and", "conditions": [
        {"field": "due_date", "op": "eq", "value": "tomorrow"},
    ]}
    return _run_filter_rules(rules)["tasks"]


def list_view_next7() -> list:
    """Tarefas que vencem nos próximos 7 dias corridos, **incluindo hoje** (research.md R7).

    Returns:
        Lista de tarefas serializadas. **Listagem**.
    """
    rules = {"combinator": "and", "conditions": [
        {"field": "due_date", "op": "within", "value": "7d"},
    ]}
    return _run_filter_rules(rules)["tasks"]


def list_view_inbox() -> list:
    """Tarefas-pai abertas do Inbox (a mesma lista que aparece na sidebar).

    Returns:
        Lista de tarefas serializadas. **Listagem**.
    """
    rules = {"combinator": "and", "conditions": [
        {"field": "project_id", "op": "in", "value": [_inbox_id()]},
    ]}
    return _run_filter_rules(rules)["tasks"]


_VIEW_FUNCS = {
    "all": list_view_all,
    "today": list_view_today,
    "tomorrow": list_view_tomorrow,
    "next7": list_view_next7,
    "inbox": list_view_inbox,
}


def get_view_counts() -> dict:
    """Conta os itens de cada view fixa, para os badges da sidebar (FR-006).

    Calculado na leitura (sem cache) — o volume de tarefas de um usuário único torna isso
    barato o suficiente para não justificar uma query de COUNT separada por view.

    Returns:
        ``{"all": N, "today": N, "tomorrow": N, "next7": N, "inbox": N}``. **Listagem**.
    """
    return {key: len(fn()) for key, fn in _VIEW_FUNCS.items()}
