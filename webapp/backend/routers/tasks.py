"""Router de tarefas — expõe a camada de lógica da Kaguya como REST `/api/tasks/*`.

Cada endpoint envelopa **diretamente** uma função de `agents/kaguya/tools_tasks.py`
ou `tools_projects.py` — as mesmas funções que o agente Telegram usa (paridade de
canais, FR-002). Segue o padrão dos routers da Nami/Frieren/Journal:

    - Todas as rotas exigem ``Depends(require_user)`` (sem exceção).
    - Bodies de POST/PATCH são modelos Pydantic (nunca ``dict`` cru).
    - **Mutações** retornam ``{"status": ...}`` → ``_check_result`` converte erro em 400.
    - **Listagens** retornam o dado direto (sem ``status``) → NÃO passam por ``_check_result``.

Registrado em ``webapp/backend/main.py`` sob o prefixo ``/api/tasks``.
Contrato: ``specs/011-tasks-mvp/contracts/api-tasks.md``.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from webapp.backend.deps import require_user

# ─── Camada de lógica da Kaguya — importada diretamente (sem instanciar o agente) ──
from agents.kaguya.tools_projects import (
    get_sidebar,
    create_project, update_project, delete_project,
    create_group, update_group, delete_group,
    list_columns, create_column, update_column, delete_column,
)
from agents.kaguya.tools_tasks import (
    list_tasks, list_tasks_today, search_tasks, list_trash,
    create_task, update_task, complete_task, reopen_task,
    reorder_task, delete_task, restore_task,
    set_recurrence, clear_recurrence,
)
from agents.kaguya.tools_tags import (
    list_tags, create_tag, update_tag, delete_tag, list_tasks_by_tag,
)
# Smart-lists (filtros salvos) e calendário — fatia 013 (P2/P3).
from agents.kaguya.tools_filters import (
    list_filters, create_filter, update_filter, delete_filter,
    list_tasks_by_filter, list_today_overdue,
    list_builtin_filters, list_tasks_by_builtin,
)
from agents.kaguya.tools_calendar import list_tasks_in_range
# Hábitos — fatia 014 / Fase 4. CRUD + check-ins + histórico (força calculada na leitura).
from agents.kaguya.tools_habits import (
    list_habits, get_habit, create_habit, update_habit,
    archive_habit, check_in, remove_check_in, get_habit_history,
)

router = APIRouter()


def _check_result(result: dict) -> dict:
    """Converte ``{"status": "error"}`` de uma tool em HTTP 400; deixa "ok" passar.

    Usado **só** em mutações (as listagens não têm campo "status").

    Args:
        result: Dicionário retornado por uma função da camada de lógica.

    Returns:
        O próprio ``result`` quando ``status == "ok"``.

    Raises:
        HTTPException: 400 com a mensagem em português quando ``status == "error"``.
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido"))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Modelos de body (Pydantic)
# ─────────────────────────────────────────────────────────────────────────────
class CreateProjectBody(BaseModel):
    """Body de criação de lista."""
    name: str
    group_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class UpdateProjectBody(BaseModel):
    """Body de edição de lista (PATCH parcial — só campos enviados são aplicados)."""
    name: Optional[str] = None
    group_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    position: Optional[int] = None


class CreateGroupBody(BaseModel):
    """Body de criação de grupo."""
    name: str


class UpdateGroupBody(BaseModel):
    """Body de edição de grupo."""
    name: Optional[str] = None
    position: Optional[int] = None


class CreateColumnBody(BaseModel):
    """Body de criação de coluna de Kanban."""
    project_id: int
    name: str
    is_done_column: bool = False


class UpdateColumnBody(BaseModel):
    """Body de edição de coluna."""
    name: Optional[str] = None
    position: Optional[int] = None
    is_done_column: Optional[bool] = None


class RecurrenceBody(BaseModel):
    """Regra de recorrência: ``rrule`` (RFC 5545) + ``mode`` (fixed/after_completion)."""
    rrule: str
    mode: str = "fixed"


class CreateTaskBody(BaseModel):
    """Body de criação de tarefa (o webapp manda ``project_id``; sem ele → Inbox)."""
    title: str
    project_id: Optional[int] = None
    parent_id: Optional[int] = None
    priority: int = 0
    type: str = "task"
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    description: Optional[str] = None
    column_id: Optional[int] = None              # coluna do Kanban (criar direto numa coluna)
    recurrence: Optional[RecurrenceBody] = None  # nested → model_dump vira dict para a tool
    tags: Optional[list[str]] = None             # nomes das tags (criadas se não existirem)


class UpdateTaskBody(BaseModel):
    """Body de edição de tarefa (PATCH parcial)."""
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = None
    type: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    project_id: Optional[int] = None
    column_id: Optional[int] = None
    recurrence: Optional[RecurrenceBody] = None  # anexar/editar a regra
    clear_recurrence: bool = False               # remover a regra
    tags: Optional[list[str]] = None             # substitui o conjunto de tags (vazio = remover todas)


class CompleteTaskBody(BaseModel):
    """Body de conclusão (``cascade`` concluir subtarefas; ``end_series`` encerra a recorrência)."""
    cascade: bool = False
    end_series: bool = False


class SetRecurrenceBody(BaseModel):
    """Body do atalho de definição de recorrência."""
    rrule: str
    mode: str = "fixed"


class ReorderBody(BaseModel):
    """Body de reordenação manual (vizinhos que definem a nova posição)."""
    after_id: Optional[int] = None
    before_id: Optional[int] = None


class CreateTagBody(BaseModel):
    """Body de criação de tag (etiqueta)."""
    name: str
    color: Optional[str] = None


class UpdateTagBody(BaseModel):
    """Body de edição de tag (PATCH parcial)."""
    name: Optional[str] = None
    color: Optional[str] = None


class CreateFilterBody(BaseModel):
    """Body de criação de smart-list (filtro salvo).

    ``rules`` é o objeto da DSL ``{"combinator", "conditions": [...]}`` (≥1 condição);
    aceitamos ``dict`` cru AQUI porque é uma estrutura de dados (não entrada solta) — a
    camada de lógica valida o shape e **parametriza** todos os valores ao traduzir para SQL.
    """
    name: str
    rules: dict
    default_view: str = "list"
    icon: Optional[str] = None


class UpdateFilterBody(BaseModel):
    """Body de edição de smart-list (PATCH parcial — só campos enviados)."""
    name: Optional[str] = None
    rules: Optional[dict] = None
    default_view: Optional[str] = None
    icon: Optional[str] = None
    position: Optional[int] = None


class CreateHabitBody(BaseModel):
    """Body de criação de hábito.

    Frequência alvo = ``freq_num`` vezes a cada ``freq_den`` dias (ex.: 5/7 = "5x por semana").
    ``target_value``+``unit`` tornam o hábito mensurável (ex.: 20 "páginas"); sem eles é sim/não.
    """
    name: str
    freq_num: int = 1
    freq_den: int = 1
    target_value: Optional[float] = None
    unit: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class UpdateHabitBody(BaseModel):
    """Body de edição de hábito (PATCH parcial — só campos enviados são aplicados)."""
    name: Optional[str] = None
    freq_num: Optional[int] = None
    freq_den: Optional[int] = None
    target_value: Optional[float] = None
    unit: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    clear_target: bool = False   # True = remove a meta (volta a ser sim/não)


class CheckInBody(BaseModel):
    """Body de check-in de um hábito (``date`` opcional = hoje; ``value`` para mensurável)."""
    date: Optional[str] = None   # AAAA-MM-DD; None = hoje
    value: Optional[float] = None


# ─────────────────────────────────────────────────────────────────────────────
# Sidebar / listas / grupos / colunas
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/sidebar")
def get_sidebar_route(user: dict = Depends(require_user)) -> dict:
    """Payload único da sidebar (grupos + listas com contagem e flag de board)."""
    return get_sidebar()  # listagem — sem _check_result


@router.post("/projects", status_code=201)
def create_project_route(body: CreateProjectBody, user: dict = Depends(require_user)) -> dict:
    """Cria uma lista."""
    return _check_result(create_project(**body.model_dump(exclude_unset=True)))


@router.patch("/projects/{project_id}")
def update_project_route(project_id: int, body: UpdateProjectBody, user: dict = Depends(require_user)) -> dict:
    """Edita uma lista (renomear, mover de grupo, cor/ícone, reordenar)."""
    return _check_result(update_project(project_id, **body.model_dump(exclude_unset=True)))


@router.delete("/projects/{project_id}")
def delete_project_route(
    project_id: int,
    mode: str = Query(..., description="move_to_inbox | delete_tasks"),
    user: dict = Depends(require_user),
) -> dict:
    """Exclui uma lista; ``mode`` decide o destino das tarefas. Inbox → 400."""
    return _check_result(delete_project(project_id, mode))


@router.post("/groups", status_code=201)
def create_group_route(body: CreateGroupBody, user: dict = Depends(require_user)) -> dict:
    """Cria um grupo de listas."""
    return _check_result(create_group(**body.model_dump(exclude_unset=True)))


@router.patch("/groups/{group_id}")
def update_group_route(group_id: int, body: UpdateGroupBody, user: dict = Depends(require_user)) -> dict:
    """Renomeia/reordena um grupo."""
    return _check_result(update_group(group_id, **body.model_dump(exclude_unset=True)))


@router.delete("/groups/{group_id}")
def delete_group_route(group_id: int, user: dict = Depends(require_user)) -> dict:
    """Exclui um grupo (as listas dele ficam sem grupo)."""
    return _check_result(delete_group(group_id))


@router.get("/projects/{project_id}/columns")
def list_columns_route(project_id: int, user: dict = Depends(require_user)) -> list[dict]:
    """Lista as colunas do board de uma lista."""
    return list_columns(project_id)  # listagem


@router.post("/columns", status_code=201)
def create_column_route(body: CreateColumnBody, user: dict = Depends(require_user)) -> dict:
    """Cria uma coluna (a primeira ativa o Kanban)."""
    return _check_result(create_column(**body.model_dump(exclude_unset=True)))


@router.patch("/columns/{column_id}")
def update_column_route(column_id: int, body: UpdateColumnBody, user: dict = Depends(require_user)) -> dict:
    """Renomeia/reordena/marca done uma coluna."""
    return _check_result(update_column(column_id, **body.model_dump(exclude_unset=True)))


@router.delete("/columns/{column_id}")
def delete_column_route(column_id: int, user: dict = Depends(require_user)) -> dict:
    """Exclui uma coluna (as tarefas dela ficam sem coluna)."""
    return _check_result(delete_column(column_id))


# ─────────────────────────────────────────────────────────────────────────────
# Tarefas
# ─────────────────────────────────────────────────────────────────────────────
@router.get("")
def list_tasks_route(
    project_id: int = Query(..., description="Id da lista"),
    include_completed: bool = Query(False),
    user: dict = Depends(require_user),
) -> list[dict]:
    """Lista as tarefas de uma lista (com subtarefas aninhadas)."""
    return list_tasks(project_id, include_completed)  # listagem


@router.get("/today")
def list_tasks_today_route(user: dict = Depends(require_user)) -> dict:
    """Tarefas de hoje + vencidas (``{overdue, today}``)."""
    return list_tasks_today()  # listagem


@router.get("/search")
def search_tasks_route(q: str = Query(...), user: dict = Depends(require_user)) -> list[dict]:
    """Busca tarefas abertas por texto."""
    return search_tasks(q)  # listagem


@router.get("/trash")
def list_trash_route(
    project_id: Optional[int] = Query(None), user: dict = Depends(require_user)
) -> list[dict]:
    """Lista a lixeira (soft delete), opcionalmente por lista."""
    return list_trash(project_id)  # listagem


@router.post("", status_code=201)
def create_task_route(body: CreateTaskBody, user: dict = Depends(require_user)) -> dict:
    """Cria uma tarefa (ou subtarefa)."""
    return _check_result(create_task(**body.model_dump(exclude_unset=True)))


@router.patch("/{task_id}")
def update_task_route(task_id: int, body: UpdateTaskBody, user: dict = Depends(require_user)) -> dict:
    """Edita uma tarefa (mover de lista aplica a regra da coluna)."""
    return _check_result(update_task(task_id, **body.model_dump(exclude_unset=True)))


@router.post("/{task_id}/complete")
def complete_task_route(
    task_id: int, body: CompleteTaskBody, user: dict = Depends(require_user)
) -> dict:
    """Completa uma tarefa.

    Atenção: ``needs_cascade`` (subtarefas abertas) **não** é erro de validação — é um
    pedido de confirmação. Retornamos 200 com o sinal para o front perguntar e repetir
    com ``cascade=true``. Erro real (tarefa inexistente) vira 400 via ``_check_result``.
    """
    result = complete_task(task_id, body.cascade, body.end_series)
    if result.get("needs_cascade"):
        return result  # 200 — o front confirma e repete com cascade=true
    return _check_result(result)  # numa recorrente, inclui generated_task_id/next_due_date


@router.post("/{task_id}/reopen")
def reopen_task_route(task_id: int, user: dict = Depends(require_user)) -> dict:
    """Reabre uma tarefa concluída (bloqueado se o pai está concluído)."""
    return _check_result(reopen_task(task_id))


@router.post("/{task_id}/position")
def reorder_task_route(task_id: int, body: ReorderBody, user: dict = Depends(require_user)) -> dict:
    """Reordena uma tarefa entre dois vizinhos (posição esparsa)."""
    return _check_result(reorder_task(task_id, body.after_id, body.before_id))


@router.delete("/{task_id}")
def delete_task_route(
    task_id: int,
    scope: str = Query("this", description="this (só esta ocorrência) | series (a série inteira)"),
    user: dict = Depends(require_user),
) -> dict:
    """Soft delete de uma tarefa (vai para a lixeira).

    Numa recorrente, ``scope=this`` exclui só esta ocorrência e gera a próxima;
    ``scope=series`` exclui esta e desativa a regra (sem gerar).
    """
    return _check_result(delete_task(task_id, scope))


@router.post("/{task_id}/restore")
def restore_task_route(task_id: int, user: dict = Depends(require_user)) -> dict:
    """Restaura uma tarefa da lixeira."""
    return _check_result(restore_task(task_id))


# ─────────────────────────────────────────────────────────────────────────────
# Recorrência (atalhos explícitos; o mesmo efeito de PATCH com recurrence)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{task_id}/recurrence")
def set_recurrence_route(task_id: int, body: SetRecurrenceBody, user: dict = Depends(require_user)) -> dict:
    """Anexa/substitui a regra de recorrência de uma tarefa (exige ``due_date``)."""
    return _check_result(set_recurrence(task_id, body.rrule, body.mode))


@router.delete("/{task_id}/recurrence")
def clear_recurrence_route(task_id: int, user: dict = Depends(require_user)) -> dict:
    """Remove a regra de recorrência (a tarefa volta a ser simples)."""
    return _check_result(clear_recurrence(task_id))


# ─────────────────────────────────────────────────────────────────────────────
# Tags (etiquetas) — fatia 013
# ─────────────────────────────────────────────────────────────────────────────
# Atenção à ordem das rotas: ``/tags`` e ``/by-tag`` são caminhos LITERAIS e precisam ser
# casados antes de ``/{task_id}`` (que captura qualquer coisa). Como o FastAPI casa na ordem
# de registro e ``/{task_id}`` está acima, declaramos estas com prefixos próprios (``/tags``,
# ``/by-tag``) que não colidem com o padrão numérico de ``/{task_id}`` — o conversor de tipo
# de ``task_id`` (int) já rejeita "tags"/"by-tag", então não há ambiguidade.
@router.get("/tags")
def list_tags_route(user: dict = Depends(require_user)) -> list[dict]:
    """Lista todas as tags cadastradas (ordem alfabética)."""
    return list_tags()  # listagem — sem _check_result


@router.post("/tags", status_code=201)
def create_tag_route(body: CreateTagBody, user: dict = Depends(require_user)) -> dict:
    """Cria uma tag (erro 400 se já existir uma com o mesmo nome ignorando caixa)."""
    return _check_result(create_tag(**body.model_dump(exclude_unset=True)))


@router.patch("/tags/{tag_id}")
def update_tag_route(tag_id: int, body: UpdateTagBody, user: dict = Depends(require_user)) -> dict:
    """Renomeia/recolore uma tag."""
    return _check_result(update_tag(tag_id, **body.model_dump(exclude_unset=True)))


@router.delete("/tags/{tag_id}")
def delete_tag_route(tag_id: int, user: dict = Depends(require_user)) -> dict:
    """Exclui uma tag (os vínculos somem; as tarefas permanecem)."""
    return _check_result(delete_tag(tag_id))


@router.get("/by-tag")
def list_tasks_by_tag_route(
    name: str = Query(..., description="Nome da tag (com ou sem #)"),
    user: dict = Depends(require_user),
) -> list[dict]:
    """Lista as tarefas abertas que têm uma determinada tag."""
    return list_tasks_by_tag(name)  # listagem


# ─────────────────────────────────────────────────────────────────────────────
# Smart-lists (filtros salvos) — fatia 013 / P2
# ─────────────────────────────────────────────────────────────────────────────
# Como nas tags, ``/filters`` é um caminho LITERAL: o conversor int de ``/{task_id}``
# rejeita "filters", então não há ambiguidade de rota.
@router.get("/filters")
def list_filters_route(user: dict = Depends(require_user)) -> list[dict]:
    """Lista as smart-lists salvas (ordem da sidebar)."""
    return list_filters()  # listagem — sem _check_result


@router.get("/filters/today-overdue")
def today_overdue_route(user: dict = Depends(require_user)) -> list[dict]:
    """Smart-list built-in "Hoje + Vencidas" (não persistida)."""
    return list_today_overdue()  # listagem


@router.get("/filters/builtins")
def list_builtins_route(user: dict = Depends(require_user)) -> list[dict]:
    """Built-ins GTD adicionais (Próximas Ações, Aguardando, Algum dia, Rápidas, Alta energia)."""
    return list_builtin_filters()  # listagem — metadados {key, name, icon}


@router.get("/filters/builtin/{key}/tasks")
def builtin_tasks_route(key: str, user: dict = Depends(require_user)) -> list[dict]:
    """Abre um built-in GTD pela chave e devolve as tarefas que casam (lista plana)."""
    return list_tasks_by_builtin(key)  # listagem


@router.post("/filters", status_code=201)
def create_filter_route(body: CreateFilterBody, user: dict = Depends(require_user)) -> dict:
    """Cria uma smart-list (rejeita regra sem condição com 400)."""
    return _check_result(create_filter(**body.model_dump(exclude_unset=True)))


@router.patch("/filters/{filter_id}")
def update_filter_route(filter_id: int, body: UpdateFilterBody, user: dict = Depends(require_user)) -> dict:
    """Edita uma smart-list (nome, regras, ícone, view padrão, posição)."""
    return _check_result(update_filter(filter_id, **body.model_dump(exclude_unset=True)))


@router.delete("/filters/{filter_id}")
def delete_filter_route(filter_id: int, user: dict = Depends(require_user)) -> dict:
    """Exclui uma smart-list (nenhuma tarefa é afetada)."""
    return _check_result(delete_filter(filter_id))


@router.get("/filters/{filter_id}/tasks")
def filter_tasks_route(filter_id: int, user: dict = Depends(require_user)) -> dict:
    """Abre uma smart-list: ``{tasks, orphans}`` (referências órfãs sinalizadas, sem erro)."""
    return list_tasks_by_filter(filter_id)  # listagem


# ─────────────────────────────────────────────────────────────────────────────
# Calendário (consulta por intervalo) — fatia 013 / P3
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/calendar")
def calendar_route(
    start: str = Query(..., description="Início da janela (AAAA-MM-DD)"),
    end: str = Query(..., description="Fim da janela (AAAA-MM-DD)"),
    project_id: Optional[int] = Query(None, description="Restringe a uma lista"),
    user: dict = Depends(require_user),
) -> list[dict]:
    """Tarefas datadas + ocorrências virtuais das recorrentes na janela (sem materializar)."""
    return list_tasks_in_range(start, end, project_id)  # listagem


# ─────────────────────────────────────────────────────────────────────────────
# Hábitos — fatia 014 / Fase 4
# ─────────────────────────────────────────────────────────────────────────────
# Como nas tags, ``/habits`` é um caminho LITERAL: o conversor int de ``/{task_id}`` rejeita
# "habits", então não há ambiguidade de rota. As métricas (força/aderência) vêm calculadas na
# leitura pela camada de lógica — o router só envelopa as funções (paridade com o Telegram).
@router.get("/habits")
def list_habits_route(user: dict = Depends(require_user)) -> list[dict]:
    """Lista os hábitos ativos, com força, aderência e estado de hoje."""
    return list_habits()  # listagem — sem _check_result


@router.post("/habits", status_code=201)
def create_habit_route(body: CreateHabitBody, user: dict = Depends(require_user)) -> dict:
    """Cria um hábito (erro 400 se a frequência for inválida)."""
    return _check_result(create_habit(**body.model_dump(exclude_unset=True)))


@router.get("/habits/{habit_id}")
def get_habit_route(habit_id: int, user: dict = Depends(require_user)) -> dict:
    """Detalhe de um hábito (com força/aderência)."""
    result = get_habit(habit_id)
    # get_habit devolve {"status": "error"} quando não encontra → vira 400 via _check_result.
    return _check_result(result) if result.get("status") == "error" else result


@router.patch("/habits/{habit_id}")
def update_habit_route(habit_id: int, body: UpdateHabitBody, user: dict = Depends(require_user)) -> dict:
    """Edita um hábito (nome, frequência, meta, ícone, cor)."""
    return _check_result(update_habit(habit_id, **body.model_dump(exclude_unset=True)))


@router.delete("/habits/{habit_id}")
def archive_habit_route(habit_id: int, user: dict = Depends(require_user)) -> dict:
    """Arquiva um hábito (soft delete — o histórico é preservado)."""
    return _check_result(archive_habit(habit_id))


@router.get("/habits/{habit_id}/history")
def habit_history_route(
    habit_id: int,
    year: int = Query(..., description="Ano do histórico (ex.: 2026)"),
    user: dict = Depends(require_user),
) -> list[dict]:
    """Check-ins de um hábito num ano (esparso) para o heatmap anual."""
    return get_habit_history(habit_id, year)  # listagem


@router.post("/habits/{habit_id}/checkin")
def check_in_route(habit_id: int, body: CheckInBody, user: dict = Depends(require_user)) -> dict:
    """Registra/atualiza o check-in de um dia (um por dia; refazer atualiza o valor)."""
    return _check_result(check_in(habit_id, body.date, body.value))


@router.delete("/habits/{habit_id}/checkin")
def remove_check_in_route(
    habit_id: int,
    date: Optional[str] = Query(None, description="Dia do check-in (AAAA-MM-DD); vazio = hoje"),
    user: dict = Depends(require_user),
) -> dict:
    """Remove o check-in de um dia (desfaz o cumprimento)."""
    return _check_result(remove_check_in(habit_id, date))
