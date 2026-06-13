"""Fachada de tools da Kaguya para o agente (Telegram) + fluxos cross-agent.

Este módulo é a **fachada fina** que o agente ADK registra: re-exporta a camada de
lógica (``tools_tasks`` / ``tools_projects``) e implementa os dois fluxos cross-agent
com a Nami. Após a migração para o sistema próprio, nada aqui depende de API externa de tarefas.

Tools cross-agent:
    complete_payment_task    — completa a tarefa **e** lança a despesa (Nami) numa
                               única transação (tudo-ou-nada, FR-014).
    create_expense_reminder  — cria a tarefa de lembrete de pagamento no Postgres.

As demais tools (criar/listar/completar tarefas, listas) são as próprias funções da
camada de lógica, expostas com nomes amigáveis ao agente. Paridade total com o webapp:
as mesmas funções servem o router REST `/api/tasks/*`.
"""

from typing import Union

from agents.db import get_conn

# ── Re-exporta a camada de lógica (o agente registra estes nomes) ──
from agents.kaguya.tools_tasks import (  # noqa: F401
    list_tasks, list_tasks_today, search_tasks, create_task, update_task,
    complete_task, reopen_task, delete_task, restore_task, clear_recurrence,
)
from agents.kaguya.tools_projects import (  # noqa: F401
    get_sidebar, create_project, update_project, delete_project,
    resolve_project_id_by_name,
)
# Tags (etiquetas) — fatia 013. Operações incrementais (add/remove) + listar por tag.
from agents.kaguya.tools_tags import (  # noqa: F401
    add_task_tag, remove_task_tag, list_tasks_by_tag,
)
# Smart-lists (filtros salvos) — fatia 013 / P2. O agente cria/edita/exclui passando a DSL
# de regras e consulta uma smart-list salva pelo NOME (paridade com o webapp — FR-012).
from agents.kaguya.tools_filters import (  # noqa: F401
    list_filters, create_filter, update_filter, delete_filter,
    list_tasks_by_filter_name, list_today_overdue,
)
# Calendário — fatia 013 / P3. Consulta por intervalo de datas ("o que tenho essa semana"),
# o equivalente Telegram da view de calendário do webapp (FR-017).
from agents.kaguya.tools_calendar import list_tasks_in_range  # noqa: F401
# Hábitos — fatia 014 / Fase 4. CRUD + check-in + histórico; a força é calculada na leitura
# pelo motor puro. O agente cria hábito, faz check-in e consulta a força (paridade com o webapp).
from agents.kaguya.tools_habits import (  # noqa: F401
    list_habits, create_habit, update_habit, archive_habit,
    remove_check_in, get_habit, get_habit_history, resolve_habit_id_by_name,
)


# ─────────────────────────────────────────────────────────────────────────────
# Wrappers amigáveis ao agente (nomes do contrato kaguya-tools.md)
# ─────────────────────────────────────────────────────────────────────────────
def list_projects() -> dict:
    """Lista as listas (e grupos), com contagem de tarefas abertas, para a Kaguya.

    Returns:
        ``{"groups": [...], "projects": [...]}`` — use para resolver o nome de uma
        lista que o usuário citou antes de criar/listar tarefas nela.
    """
    return get_sidebar()


def list_tasks_by_project(project: Union[int, str], include_completed: bool = False) -> Union[list, dict]:
    """Lista as tarefas de uma lista, aceitando o id **ou** o nome da lista.

    Args:
        project: Id (número) ou nome da lista (resolvido por prefixo, sem caixa).
        include_completed: Se True, inclui também as concluídas.

    Returns:
        Lista de tarefas (com subtarefas aninhadas), ou ``{"status": "error", ...}``
        se o nome não casar nenhuma lista.
    """
    if isinstance(project, int):
        pid = project
    elif str(project).strip().isdigit():
        pid = int(str(project).strip())
    else:
        pid = resolve_project_id_by_name(str(project))
    if pid is None:
        return {"status": "error", "message": f"Lista '{project}' não encontrada."}
    return list_tasks(pid, include_completed)


def set_task_recurrence(
    task_id: int,
    freq: str,
    interval: int = 1,
    weekday: str = "",
    monthday: int = 0,
    mode: str = "fixed",
) -> dict:
    """Define a recorrência de uma tarefa a partir de uma intenção simples (sem RRULE crua).

    A Kaguya descreve a recorrência em linguagem natural; esta tool traduz para a regra
    técnica. A tarefa **precisa ter data de vencimento** (a âncora da série).

    Args:
        task_id: Id da tarefa (tarefa-pai).
        freq: ``DAILY`` | ``WEEKLY`` | ``MONTHLY`` | ``YEARLY``.
        interval: A cada quantos períodos (ex.: ``freq=DAILY, interval=3`` = a cada 3 dias).
        weekday: Para ``WEEKLY``, o dia em código (``MO`` seg, ``TU`` ter, ``WE`` qua,
            ``TH`` qui, ``FR`` sex, ``SA`` sáb, ``SU`` dom). Vazio = qualquer.
        monthday: Para ``MONTHLY``, o dia do mês (1–31). 0 = sem dia fixo.
        mode: ``fixed`` (data-fixa, padrão) ou ``after_completion`` (conta da conclusão real,
            ex.: "a cada 3 dias depois que eu fizer").

    Returns:
        ``{"status": "ok", "recurrence_text": "todo dia 5"}`` ou erro em português.
    """
    # Imports locais: a regra de montagem vive no motor; a persistência na camada de lógica.
    from agents.kaguya.recurrence import build_rrule, describe_rrule
    from agents.kaguya.tools_tasks import set_recurrence

    try:
        # Converte 0/"" para None (os opcionais que o build_rrule entende como "não usar").
        rrule = build_rrule(freq, interval=interval, weekday=weekday or None, monthday=monthday or None)
    except ValueError as e:
        return {"status": "error", "message": str(e)}

    result = set_recurrence(task_id, rrule, mode)
    if result.get("status") == "ok":
        # Devolve a descrição para a Kaguya ecoar ("Recorrência: todo dia 5").
        result["recurrence_text"] = describe_rrule(rrule)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Hábitos — wrappers amigáveis ao agente (fatia 014)
# ─────────────────────────────────────────────────────────────────────────────
def check_in_habit(habit: Union[int, str], value: float = 0) -> dict:
    """Registra o check-in de hoje de um hábito, aceitando o id **ou** o nome do hábito.

    É o que a Kaguya usa quando o usuário diz "fiz minha meditação de hoje". Resolve o hábito
    por nome (prefixo, ignorando caixa) quando não vier um id, e ecoa o score recalculado
    (consistência + tendência).

    Args:
        habit: Id (número) ou nome do hábito (ex.: "meditar").
        value: Valor medido (hábito mensurável, ex.: 25 páginas). 0 = sem valor (sim/não).

    Returns:
        ``{"status": "ok", "consistency": <0–100>, "trend": ..., ...}`` ou
        ``{"status": "error", ...}`` se o nome não casar nenhum hábito.
    """
    # Import local da função de mutação (o re-export do topo expõe os nomes ao agente; aqui
    # chamamos diretamente para não depender da ordem dos re-exports).
    from agents.kaguya.tools_habits import check_in

    # Resolve id ou nome → id (mesma lógica de list_tasks_by_project).
    if isinstance(habit, int):
        hid = habit
    elif str(habit).strip().isdigit():
        hid = int(str(habit).strip())
    else:
        hid = resolve_habit_id_by_name(str(habit))
    if hid is None:
        return {"status": "error", "message": f"Hábito '{habit}' não encontrado."}

    # value <= 0 significa "sem valor medido" (hábito sim/não): manda None para o banco.
    return check_in(hid, value=value if value and value > 0 else None)


def habit_status(habit: str = "") -> Union[list, dict]:
    """Consulta o score (consistência/tendência/recente) de um hábito ou de todos.

    Args:
        habit: Nome do hábito a consultar. Vazio = devolve todos os hábitos ativos.

    Returns:
        O dicionário de um hábito (com ``consistency``/``trend``/``recent_done``/
        ``recent_total``/``done_today``) quando um nome é informado, ou a lista de todos quando
        vazio; ``{"status": "error", ...}`` se o nome não casar.
    """
    nome = (habit or "").strip()
    if not nome:
        return list_habits()        # todos os hábitos ativos (listagem)
    hid = resolve_habit_id_by_name(nome)
    if hid is None:
        return {"status": "error", "message": f"Hábito '{habit}' não encontrado."}
    return get_habit(hid)


# ─────────────────────────────────────────────────────────────────────────────
# Meu Dia — wrappers amigáveis ao agente (fatia 016)
# ─────────────────────────────────────────────────────────────────────────────

def plan_my_day() -> dict:
    """Lista o plano do dia hoje com o resumo de capacity (relato textual p/ o Telegram).

    Returns:
        ``{date, plano, pendencias_ontem, sugestoes, capacity}`` — a mesma estrutura
        do endpoint ``GET /api/tasks/my-day``.
    """
    from agents.kaguya.tools_tasks import list_my_day
    return list_my_day()


def my_day_status() -> str:
    """Retorna um resumo textual do plano + capacity de hoje (pt-BR).

    Returns:
        String formatada para o Telegram, ex.:
        "Plano de hoje: 5 tarefas · ~3h estimadas · folga de 1h"
    """
    from agents.kaguya.tools_tasks import list_my_day
    r = list_my_day()
    cap = r["capacity"]
    plano = r["plano"]
    pendencias = r["pendencias_ontem"]

    def fmtmin(m: int) -> str:
        h, mins = divmod(abs(m), 60)
        if h == 0: return f"{mins}min"
        return f"{h}h" if mins == 0 else f"{h}h {mins}min"

    partes = [f"Plano de hoje: {len(plano)} tarefa(s)"]
    if cap["estimado_min"]:
        partes.append(f"~{fmtmin(cap['estimado_min'])} estimados")
    if cap["calendar_ok"] and cap["agenda_min"]:
        partes.append(f"{fmtmin(cap['agenda_min'])} de agenda")
    if cap["excedeu"]:
        partes.append(f"⚠ +{fmtmin(abs(cap['folga_min']))} acima do disponível")
    elif cap["folga_min"] > 0:
        partes.append(f"folga de {fmtmin(cap['folga_min'])}")
    if pendencias:
        partes.append(f"{len(pendencias)} pendência(s) de ontem")
    return " · ".join(partes)


def add_to_my_day_by_name(task: Union[int, str], date: str = "") -> dict:
    """Adiciona uma tarefa ao Meu Dia, aceitando id ou nome.

    Args:
        task: Id (número) ou nome/prefixo da tarefa.
        date: Data "YYYY-MM-DD". Vazio = hoje.

    Returns:
        Dicionário de status.
    """
    from agents.kaguya.tools_tasks import add_to_my_day
    from agents.kaguya.tools_projects import resolve_project_id_by_name

    tid = _resolve_task_id(task)
    if tid is None:
        return {"status": "error", "message": f"Tarefa '{task}' não encontrada."}
    return add_to_my_day(tid, date or None)


def remove_from_my_day_by_name(task: Union[int, str]) -> dict:
    """Remove uma tarefa do Meu Dia, aceitando id ou nome.

    Args:
        task: Id (número) ou nome/prefixo da tarefa.

    Returns:
        Dicionário de status.
    """
    from agents.kaguya.tools_tasks import remove_from_my_day

    tid = _resolve_task_id(task)
    if tid is None:
        return {"status": "error", "message": f"Tarefa '{task}' não encontrada."}
    return remove_from_my_day(tid)


def set_estimate_by_name(task: Union[int, str], minutes: int) -> dict:
    """Grava a estimativa de duração de uma tarefa, aceitando id ou nome.

    Args:
        task: Id (número) ou nome/prefixo da tarefa.
        minutes: Estimativa em minutos (deve ser positivo).

    Returns:
        Dicionário de status.
    """
    from agents.kaguya.tools_tasks import set_estimate

    tid = _resolve_task_id(task)
    if tid is None:
        return {"status": "error", "message": f"Tarefa '{task}' não encontrada."}
    return set_estimate(tid, minutes)


def _resolve_task_id(task: Union[int, str]) -> Union[int, None]:
    """Resolve tarefa por id ou por busca de nome (prefixo, sem caixa).

    Usado pelos wrappers de Meu Dia para aceitar id OU nome como as outras tools.

    Args:
        task: Id numérico ou nome/prefixo.

    Returns:
        Id da tarefa ou None se não encontrar.
    """
    from agents.kaguya.tools_tasks import search_tasks

    if isinstance(task, int):
        return task
    if str(task).strip().isdigit():
        return int(str(task).strip())
    # Busca pelo nome (ILIKE) e pega o primeiro resultado.
    results = search_tasks(str(task).strip())
    if results:
        return results[0]["id"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Eisenhower — relato textual por quadrante (fatia 017)
# ─────────────────────────────────────────────────────────────────────────────

def eisenhower_status() -> str:
    """Relata as tarefas abertas organizadas nos 4 quadrantes da matriz de Eisenhower.

    A mesma classificação do webapp (urgente = vence em ≤2 dias; importante = prioridade ≥ 2).
    A grade visual fica no webapp; no Telegram este relato textual garante a paridade.

    Returns:
        String formatada com cada quadrante e suas tarefas, em pt-BR.
    """
    from datetime import date as _date
    from agents.kaguya.tools_tasks import list_eisenhower_tasks

    hoje = _date.today()
    tarefas = list_eisenhower_tasks()

    def _urgente(t: dict) -> bool:
        if not t.get("due_date"):
            return False
        # Calcula dias restantes (negativo = vencida → também urgente)
        delta = (_date.fromisoformat(t["due_date"]) - hoje).days
        return delta <= 2

    def _importante(t: dict) -> bool:
        return (t.get("priority") or 0) >= 2

    # Quadrantes com nome e filtro.
    quads = [
        ("🔴 Faça agora (urgente + importante)",    lambda t: _urgente(t) and _importante(t)),
        ("🟡 Agende (importante, não urgente)",      lambda t: not _urgente(t) and _importante(t)),
        ("🔵 Resolva rápido (urgente, não importante)", lambda t: _urgente(t) and not _importante(t)),
        ("⚪ Depois (nem urgente, nem importante)",  lambda t: not _urgente(t) and not _importante(t)),
    ]

    linhas = []
    for nome, filtro in quads:
        items = [t for t in tarefas if filtro(t)]
        if not items:
            continue
        linhas.append(f"<b>{nome}</b>")
        for t in items[:10]:  # limita a 10 por quadrante para não estourar o chat
            venc = f" · 📅 {t['due_date']}" if t.get("due_date") else ""
            lista = f" · 📁 {t.get('project_name', '')}" if t.get("project_name") else ""
            linhas.append(f"  📋 {t['title']}{venc}{lista}")
        if len(items) > 10:
            linhas.append(f"  … +{len(items) - 10} mais")
        linhas.append("")  # linha em branco entre quadrantes

    if not linhas:
        return "Nenhuma tarefa aberta no momento."

    total = len(tarefas)
    cabecalho = f"Matriz de Eisenhower — {total} tarefa(s) aberta(s)\n"
    return cabecalho + "\n".join(linhas).rstrip()


# ─────────────────────────────────────────────────────────────────────────────
# Cross-agent: pagamento atômico (Kaguya + Nami)
# ─────────────────────────────────────────────────────────────────────────────
def complete_payment_task(
    task_id: int,
    amount: float,
    category: str,
    account: str,
    transaction_name: str = "",
) -> dict:
    """Completa uma tarefa de pagamento **e** lança a despesa, tudo-ou-nada.

    Fluxo principal de integração Kaguya↔Nami. Diferente da versão antiga (API externa +
    BigQuery, que podia ficar "partial"), agora as duas escritas ocorrem na **mesma
    transação PostgreSQL**: ou ambas persistem, ou nenhuma. A Kaguya deve confirmar
    valor, categoria e conta com o usuário ANTES de chamar — sem defaults financeiros.

    Args:
        task_id: Id da tarefa de pagamento (no banco próprio).
        amount: Valor pago em reais.
        category: Categoria da despesa (ex.: "Moradia").
        account: Conta/meio de pagamento (ex.: "Nubank").
        transaction_name: Nome da despesa; se vazio, usa o título da tarefa.

    Returns:
        ``{"status": "ok", ...}`` quando ambas as etapas persistem, ou
        ``{"status": "error", "message": ...}`` quando nada foi persistido.
    """
    # Import local evita acoplar a inicialização da Kaguya às dependências da Nami.
    from agents.nami.tools import create_transaction_on_cursor
    from agents.kaguya.tools_tasks import _complete_task_on_cursor

    try:
        with get_conn() as conn:                # commit único ao sair sem exceção
            with conn.cursor() as cur:
                # 1) Completa a tarefa (cascateando subtarefas de um pagamento).
                comp = _complete_task_on_cursor(cur, task_id, cascade=True)
                if comp.get("status") != "ok":
                    conn.rollback()
                    return {"status": "error", "message": comp.get("message", "Não foi possível completar a tarefa.")}

                # 2) Resolve o nome da despesa (título da tarefa, se não informado).
                name = transaction_name
                if not name:
                    cur.execute("SELECT title FROM tasks WHERE id = %s", (task_id,))
                    row = cur.fetchone()
                    name = row[0] if row else "Pagamento"

                # 3) Lança a despesa no MESMO cursor (Nami é dona do SQL dela).
                tx = create_transaction_on_cursor(
                    cur, name=name, valor=amount, tipo="Despesa",
                    categoria=category, conta=account, source="kaguya",
                )
                if tx.get("status") != "ok":
                    conn.rollback()  # despesa inválida → desfaz inclusive a conclusão
                    return {"status": "error", "message": tx.get("message", "Não foi possível lançar a despesa.")}

                # Ambas ok → o get_conn comita as duas escritas juntas ao sair.
                return {
                    "status": "ok",
                    "tx_id": tx.get("id"),
                    "message": f"Tarefa concluída e despesa de R${amount:.2f} lançada em {category}.",
                }
    except Exception as e:
        # Qualquer erro de banco aborta tudo (get_conn já fez rollback).
        return {"status": "error", "message": str(e)}


def create_expense_reminder(
    title: str,
    due_date: str,
    project_name: str = "Finanças",
    amount: float = 0.0,
    description: str = "",
) -> dict:
    """Cria uma tarefa de lembrete de pagamento futuro **no banco próprio**.

    Apenas cria a tarefa (prioridade alta) — o lançamento da despesa só acontece quando
    o usuário realmente pagar (via ``complete_payment_task``).

    Args:
        title: Título do lembrete (ex.: "Pagar aluguel de junho").
        due_date: Data de vencimento AAAA-MM-DD.
        project_name: Lista onde criar (padrão "Finanças"; cai no Inbox se não existir).
        amount: Valor esperado — incluído nas notas para referência (opcional).
        description: Notas adicionais (opcional).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou erro.
    """
    # Inclui o valor esperado nas notas para facilitar o pagamento depois.
    notes = description
    if amount and amount > 0:
        notes = f"Valor esperado: R${amount:.2f}. {description}".strip()

    r = create_task(
        title=title,
        project_name=project_name,          # resolvido por prefixo; sem match → Inbox
        priority=3,                         # lembrete de pagamento nasce com prioridade alta
        due_date=due_date or None,
        description=notes or None,
    )
    if r.get("status") != "ok":
        return r
    return {
        "status": "ok",
        "id": r["id"],
        "message": f"Lembrete criado: '{title}'" + (f" em {project_name}" if project_name else ""),
    }
