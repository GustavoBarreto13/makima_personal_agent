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
    list_tasks, list_tasks_today, search_tasks, list_trash, list_eisenhower_tasks,
    get_task,   # leitura pontual de uma tarefa pelo id (usado pelo editor de notas Markdown)
    create_task, update_task, complete_task, reopen_task,
    reorder_task, delete_task, restore_task,
    set_recurrence, clear_recurrence,
    move_task,  # re-parentear / DnD 3 zonas — fatia 025
    # Meu Dia — fatia 016
    add_to_my_day, remove_from_my_day, reschedule_pending,
    set_estimate, set_time_block, clear_time_block, list_my_day,
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
from agents.kaguya.tools_kanban_views import (
    list_views, create_view, update_view, delete_view, list_board_for_view,
)
from agents.kaguya.tools_calendar import list_tasks_in_range
# Calendar Hub — fatia 019 (US2): providers cross-agent + prefs de exibição
from agents.kaguya.calendar_hub import list_sources, aggregate
from agents.kaguya.calendar_prefs import get_calendar_prefs, set_calendar_pref
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
    person_ids: Optional[list[str]] = None       # responsáveis Komi (fatia 025)


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
    duration_min: Optional[int] = None           # estimativa de duração (Meu Dia — fatia 016)
    person_ids: Optional[list[str]] = None       # substitui responsáveis Komi (fatia 025)


class MoveTaskBody(BaseModel):
    """Body de re-parentear por drag-and-drop 3 zonas (fatia 025)."""
    new_parent_id: Optional[int] = None  # None = promover a tarefa-raiz
    after_id: Optional[int] = None      # vizinho que fica antes no destino
    before_id: Optional[int] = None     # vizinho que fica depois no destino


# ── Meu Dia — fatia 016 ───────────────────────────────────────────────────────

class AddToMyDayBody(BaseModel):
    """Body opcional de ``POST /{id}/my-day``. Sem body = usa hoje."""
    date: Optional[str] = None   # "YYYY-MM-DD"; ausente = hoje (fuso SP)


class RescheduleBody(BaseModel):
    """Body do atalho de pendências: 'today' | 'tomorrow' | 'later'."""
    when: str  # today | tomorrow | later


class TimeBlockBody(BaseModel):
    """Body de time-blocking (``POST /{id}/time-block``).

    ``end_at`` é derivado de ``start_at + (duration_min or 30min)`` quando ausente.
    """
    start_at: str            # ISO 8601, ex.: "2026-06-13T14:00:00-03:00"
    end_at: Optional[str] = None
    duration_min: Optional[int] = None


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


class CreateKanbanViewBody(BaseModel):
    """Body de criação de view de Kanban (spec 024).

    ``display`` = ``{adornos:{...}, slots:[m1,m2,m3]}``; ``filter`` = ``FilterRules``
    opcional (mesmo DSL das smart-lists) ou ``None``. Aceitamos ``dict`` cru porque são
    estruturas de dados — a camada de lógica valida o shape e parametriza o filtro.
    """
    name: str
    display: dict
    filter: Optional[dict] = None


class UpdateKanbanViewBody(BaseModel):
    """Body de edição de view de Kanban (PATCH parcial — só campos enviados).

    ``clear_filter=True`` remove o filtro (seta NULL); enviar ``filter`` o substitui.
    A view built-in "Completa" é imutável (a camada de lógica rejeita com 400).
    """
    name: Optional[str] = None
    display: Optional[dict] = None
    filter: Optional[dict] = None
    clear_filter: Optional[bool] = None
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


@router.get("/eisenhower")
def list_eisenhower_route(user: dict = Depends(require_user)) -> list[dict]:
    """Todas as tarefas-pai abertas para a view Eisenhower (classificação derivada no front)."""
    return list_eisenhower_tasks()  # listagem — sem _check_result


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
    """Cria uma tarefa (ou subtarefa).

    O webapp cria tarefas com título vazio (linha-placeholder para edição inline na árvore),
    por isso passamos allow_empty_title=True. O agente Telegram chama create_task() diretamente
    sem essa flag e continua recebendo erro amigável para títulos em branco.
    """
    return _check_result(create_task(allow_empty_title=True, **body.model_dump(exclude_unset=True)))


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


@router.post("/{task_id}/move")
def move_task_route(task_id: int, body: MoveTaskBody, user: dict = Depends(require_user)) -> dict:
    """Re-parentear uma tarefa por DnD 3 zonas (before/child/after) — fatia 025.

    ``new_parent_id=None`` promove a tarefa a tarefa-raiz independente.
    Anti-ciclo e cap de profundidade (12) são validados na tool.
    """
    return _check_result(
        move_task(task_id, body.new_parent_id, body.after_id, body.before_id)
    )


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
# Views de Kanban configuráveis — spec 024
# ─────────────────────────────────────────────────────────────────────────────
# ``/kanban-views`` é um caminho LITERAL: o conversor int de ``/{task_id}`` rejeita
# "kanban-views", então não há ambiguidade de rota (mesma garantia de /filters).
@router.get("/kanban-views")
def list_kanban_views_route(user: dict = Depends(require_user)) -> list[dict]:
    """Lista as views de Kanban (sempre inclui a built-in "Completa")."""
    return list_views()  # listagem — sem _check_result


@router.post("/kanban-views", status_code=201)
def create_kanban_view_route(body: CreateKanbanViewBody, user: dict = Depends(require_user)) -> dict:
    """Cria uma view customizada (valida display/slots e o filtro opcional)."""
    return _check_result(create_view(**body.model_dump(exclude_unset=True)))


@router.patch("/kanban-views/{view_id}")
def update_kanban_view_route(view_id: int, body: UpdateKanbanViewBody, user: dict = Depends(require_user)) -> dict:
    """Edita uma view; a built-in "Completa" é imutável (rejeitada com 400)."""
    return _check_result(update_view(view_id, **body.model_dump(exclude_unset=True)))


@router.delete("/kanban-views/{view_id}")
def delete_kanban_view_route(view_id: int, user: dict = Depends(require_user)) -> dict:
    """Exclui uma view customizada; a built-in "Completa" não pode ser excluída."""
    return _check_result(delete_view(view_id))


@router.get("/kanban-views/{view_id}/board")
def kanban_view_board_route(
    view_id: int,
    project_id: int = Query(..., description="Lista (board) a carregar"),
    user: dict = Depends(require_user),
) -> list[dict]:
    """Tarefas do board de uma lista com o filtro da view aplicado (US3). Listagem."""
    return list_board_for_view(view_id, project_id)


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
# Calendar Hub — fatia 019 (US2): providers cross-agent + prefs de exibição
# ─────────────────────────────────────────────────────────────────────────────

class CalendarPrefBody(BaseModel):
    """Body do PATCH de preferência de calendário (todos os campos opcionais)."""
    visible: Optional[bool] = None
    color: Optional[str] = None
    position: Optional[int] = None


@router.get("/calendar/sources")
def calendar_sources_route(user: dict = Depends(require_user)) -> list[dict]:
    """Lista todas as fontes de calendário registradas no hub, com prefs do usuário.

    Retorna kaguya, nami, frieren, violet, akane e (quando as credenciais OAuth do
    Google Calendar estão configuradas) a fonte "gcal" — Agenda pessoal. As prefs
    de cor e visibilidade de cada fonte são mescladas da tabela ``calendar_prefs``.

    A fonte "gcal" não está no hub para evitar duplicação com o aggregate (eventos
    do Google chegam via endpoint separado /calendar/events). O endpoint a injeta
    aqui para que ela apareça na sidebar e o frontend saiba que deve carregá-la.
    """
    # with_prefs=True mescla as prefs do banco (cor/visibilidade) sobre os metadados base
    sources = list_sources(with_prefs=True)

    # Injeta um item por calendário Google quando as credenciais OAuth estão configuradas.
    # Sem o refresh_token a integração não funciona — melhor não exibir nada.
    import os
    if os.environ.get("GOOGLE_CALENDAR_REFRESH_TOKEN"):
        # Carrega as prefs salvas para todos os calendários Google (chave: "gcal:<cal_id>")
        try:
            from agents.kaguya.calendar_prefs import get_calendar_prefs
            prefs_by_id = {p["calendar_id"]: p for p in get_calendar_prefs()}
        except Exception:
            prefs_by_id = {}

        # Busca os calendários reais da conta Google.
        # Se o Google estiver offline, silencia o erro e continua sem fontes gcal.
        try:
            from agents.kaguya import gcal as gcal_mod
            gcal_calendars = gcal_mod.list_calendars()
        except Exception:
            gcal_calendars = []

        # Calendários a pular: espelho de tarefas (já representado por "kaguya") e TickTick
        _SKIP_NAMES = {"TickTick"}

        for idx, c in enumerate(gcal_calendars):
            if c.get("is_kaguya"):
                continue
            if c.get("name") in _SKIP_NAMES:
                continue

            # Cada calendário Google vira uma fonte "gcal:<id>" — chave única
            source_id = f"gcal:{c['id']}"
            pref = prefs_by_id.get(source_id, {})
            sources.append({
                "id": source_id,
                # Conta separada na sidebar para distinguir da suíte Makima
                "account": "Google",
                "kind": "integration",
                "name": c["name"],
                # Prioridade: pref do usuário > cor nativa do Google > azul Google padrão
                "color": pref.get("color") or c.get("bg_color") or "#4285F4",
                "visible": pref.get("visible", True),
                "position": pref.get("position", 90 + idx),
                # Indica se o usuário tem permissão de escrita (owner/writer) neste calendário
                "writable": c.get("writable", False),
            })

    return sources


@router.get("/calendar/aggregate")
def calendar_aggregate_route(
    start: str = Query(..., description="Início da janela (AAAA-MM-DD)"),
    end: str = Query(..., description="Fim da janela (AAAA-MM-DD)"),
    sources: Optional[str] = Query(None, description="Source IDs separados por vírgula para filtrar"),
    user: dict = Depends(require_user),
) -> dict:
    """Agrega eventos de todos os provedores (ou dos filtrados) em um feed único.

    O parâmetro ``sources`` aceita uma lista separada por vírgula de source IDs
    (ex.: ``nami,frieren``). Quando omitido, usa todas as fontes visíveis.
    Provedores com erro vão para ``result["errors"]`` sem interromper os demais.
    """
    # Converte a string de query param em lista de IDs ou None (para "todas as fontes")
    sources_list = [s.strip() for s in sources.split(",")] if sources else None
    # aggregate retorna {"sources": [...], "items": [...], "errors": [...]}
    return aggregate(start, end, sources=sources_list)


@router.get("/calendar/prefs")
def calendar_prefs_route(user: dict = Depends(require_user)) -> list[dict]:
    """Retorna as preferências de exibição de todos os calendários salvas no banco."""
    return get_calendar_prefs()  # listagem — sem _check_result


@router.patch("/calendar/prefs/{calendar_id}")
def set_calendar_pref_route(
    calendar_id: str,
    body: CalendarPrefBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualiza as preferências de um calendário (upsert parcial).

    Apenas os campos não-None do body são atualizados — campos ausentes preservam
    o valor atual (ou usam o padrão ao inserir pela primeira vez).
    """
    return _check_result(
        set_calendar_pref(
            calendar_id,
            visible=body.visible,
            color=body.color,
            position=body.position,
        )
    )


# ─────────────────────────────────────────────────────────────────────────────
# Google Calendar CRUD — fatia 019, US4 (T031)
# ─────────────────────────────────────────────────────────────────────────────
# Importação lazy dentro de cada endpoint: as funções de gcal.py dependem de
# google-auth, que pode não estar instalado em todos os ambientes.
# Todos os endpoints exigem Depends(require_user) — sem exceção.

class GCalEventBody(BaseModel):
    """Body compartilhado para criação/atualização de evento Google Calendar."""
    summary: str
    start: str                        # ISO 8601 (com hora) ou YYYY-MM-DD (all-day)
    end: str
    all_day: bool = False
    description: Optional[str] = None
    location: Optional[str] = None


class GCalEventPatchBody(BaseModel):
    """Body de atualização parcial de evento Google Calendar (todos os campos opcionais)."""
    summary: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    all_day: Optional[bool] = None
    description: Optional[str] = None
    location: Optional[str] = None
    color: Optional[str] = None       # cor customizada por evento (exibida no overlay)
    calendar_id: Optional[str] = None # ID do calendário Google de origem (para editar o correto)


@router.get("/calendar/calendars")
def list_gcal_calendars_route(user: dict = Depends(require_user)) -> list[dict]:
    """Lista todos os calendários Google disponíveis na conta.

    Retorna ``is_main`` e ``is_kaguya`` para que a UI possa distinguir o principal
    e o espelho de tarefas do bot.
    """
    from agents.kaguya import gcal
    return gcal.list_calendars()


@router.get("/calendar/events")
def list_gcal_events_route(
    start: str = Query(..., description="Data de início YYYY-MM-DD"),
    end: str = Query(..., description="Data de fim YYYY-MM-DD (inclusive)"),
    user: dict = Depends(require_user),
) -> list[dict]:
    """Lista eventos de todos os calendários Google no intervalo.

    Exclui automaticamente "Kaguya — Tarefas" e "TickTick" para evitar
    duplicatas com as tarefas já renderizadas pelo sistema (anti-duplicação D6).
    Retorna lista vazia (não 500) em caso de falha de autenticação ou indisponibilidade
    do Google Calendar — o frontend já tem catch() que trata lista vazia graciosamente.
    """
    import logging
    from agents.kaguya import gcal
    try:
        return gcal.list_events(start, end)
    except Exception as exc:
        # Não propaga 500 para o frontend — GCal offline/auth inválido não deve
        # quebrar o calendário todo. O log preserva o rastreio para diagnóstico.
        logging.getLogger(__name__).error("gcal.list_events falhou: %s", exc, exc_info=True)
        return []


@router.get("/calendar/gcal-status")
def gcal_status_route(user: dict = Depends(require_user)) -> dict:
    """Verifica se o Google Calendar está autenticado e acessível.

    Retorna ``{"connected": True}`` quando o token OAuth é válido, ou
    ``{"connected": False, "reason": "<mensagem>"}`` quando não é — por exemplo,
    quando o refresh token foi revogado (``invalid_grant``) ou as variáveis
    GOOGLE_CALENDAR_* não estão configuradas.

    Usado pelo frontend para mostrar um aviso visível na fonte "Agenda pessoal"
    em vez de sumir silenciosamente quando a autenticação falha.
    """
    import os
    import logging

    # Se nem o refresh token está configurado, não há o que checar.
    if not os.environ.get("GOOGLE_CALENDAR_REFRESH_TOKEN"):
        return {"connected": False, "reason": "GOOGLE_CALENDAR_REFRESH_TOKEN não configurado"}

    from agents.kaguya import gcal
    try:
        # Tenta construir o serviço OAuth — isso renuncia o access token se necessário.
        # Se o refresh token estiver revogado, lança RefreshError aqui.
        gcal._get_service()
        return {"connected": True, "reason": None}
    except Exception as exc:
        # Loga com nível WARNING (não ERROR, pois o frontend vai mostrar o aviso para o usuário)
        logging.getLogger(__name__).warning("gcal_status: autenticação falhou — %s", exc)
        # Extrai a mensagem curta para exibir na UI (sem stacktrace completo)
        reason = str(exc)
        # O invalid_grant é a causa mais comum; torna a mensagem amigável
        if "invalid_grant" in reason:
            reason = "Token revogado ou expirado — rode scripts/authorize_calendar.py para gerar um novo"
        return {"connected": False, "reason": reason}


@router.post("/calendar/events", status_code=201)
def create_gcal_event_route(
    body: GCalEventBody,
    user: dict = Depends(require_user),
) -> dict:
    """Cria um evento no calendário principal (GOOGLE_CALENDAR_MAIN_CALENDAR_ID).

    Para criação no calendário "Kaguya — Tarefas" (espelho de tarefa), usar
    ``create_task`` com data — o gcal_sync espelha automaticamente.
    """
    import os
    from agents.kaguya import gcal
    cal_id = os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "primary")
    result = gcal.create_event(
        calendar_id=cal_id,
        summary=body.summary,
        start=body.start,
        end=body.end,
        all_day=body.all_day,
        description=body.description or "",
        location=body.location or "",
    )
    # Invalida o cache de eventos para que a nova criação apareça imediatamente
    # na próxima chamada a list_events() — sem esperar o TTL de 60s expirar.
    gcal.invalidate_events_cache()
    return result


@router.patch("/calendar/events/{event_id}")
def update_gcal_event_route(
    event_id: str,
    body: GCalEventPatchBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualiza campos de um evento Google Calendar existente.

    Apenas os campos não-None do body são alterados; os demais preservam o valor atual.
    O ``event_id`` aqui pode ser de qualquer calendário — usa o calendário principal
    para simplificar (a maioria dos eventos da "Agenda pessoal" está lá).
    """
    import os
    from agents.kaguya import gcal
    # Usa o calendário informado pelo frontend (para calendários secundários) ou o principal
    cal_id = body.calendar_id or os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "primary")
    patch = body.model_dump(exclude_none=True)
    # Remove campos que não são passados para gcal.update_event
    patch.pop("color", None)
    patch.pop("calendar_id", None)
    result = gcal.update_event(calendar_id=cal_id, event_id=event_id, **patch)
    # Invalida o cache de eventos para que a edição apareça imediatamente
    gcal.invalidate_events_cache()
    return result


@router.delete("/calendar/events/{event_id}")
def delete_gcal_event_route(
    event_id: str,
    calendar_id: Optional[str] = Query(None, description="ID do calendário Google de origem"),
    user: dict = Depends(require_user),
) -> dict:
    """Remove um evento Google Calendar (irreversível).

    Usa ``calendar_id`` quando informado (para calendários secundários) ou o principal
    configurado em GOOGLE_CALENDAR_MAIN_CALENDAR_ID.
    Para remover do espelho de tarefas, usar ``delete_task`` — o gcal_sync
    remove o evento automaticamente.
    """
    import os
    from agents.kaguya import gcal
    cal_id = calendar_id or os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "primary")
    result = _check_result(gcal.delete_event(calendar_id=cal_id, event_id=event_id))
    # Invalida o cache de eventos para que a exclusão apareça imediatamente
    gcal.invalidate_events_cache()
    return result


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


# ─────────────────────────────────────────────────────────────────────────────
# Meu Dia — fatia 016
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/my-day")
def my_day_route(
    date: Optional[str] = Query(None, description="Data YYYY-MM-DD (vazio = hoje)"),
    user: dict = Depends(require_user),
) -> dict:
    """Ritual do Meu Dia: plano, pendências de ontem, sugestões e capacity.

    Listagem — retorna dado direto (sem ``_check_result``).
    A capacity cruza estimativas das tarefas com eventos do Google Calendar.
    Se o Calendar não responder, devolve ``capacity.calendar_ok=False`` — nunca quebra.
    """
    return list_my_day(date)   # listagem: retorna direto, sem _check_result


@router.post("/{task_id}/my-day")
def add_to_my_day_route(
    task_id: int, body: AddToMyDayBody = AddToMyDayBody(), user: dict = Depends(require_user)
) -> dict:
    """Marca a tarefa no Meu Dia de uma data (body opcional; ausente = hoje)."""
    return _check_result(add_to_my_day(task_id, body.date))


@router.delete("/{task_id}/my-day")
def remove_from_my_day_route(task_id: int, user: dict = Depends(require_user)) -> dict:
    """Tira a tarefa do Meu Dia (``my_day_date = NULL``); não a apaga."""
    return _check_result(remove_from_my_day(task_id))


@router.post("/{task_id}/reschedule")
def reschedule_route(task_id: int, body: RescheduleBody, user: dict = Depends(require_user)) -> dict:
    """Atalho do ritual de pendências: move para hoje, amanhã ou tira do Meu Dia."""
    return _check_result(reschedule_pending(task_id, body.when))


@router.post("/{task_id}/time-block")
def set_time_block_route(task_id: int, body: TimeBlockBody, user: dict = Depends(require_user)) -> dict:
    """Grava o bloco de tempo (time-blocking). ``end_at`` é derivado se ausente."""
    return _check_result(set_time_block(task_id, body.start_at, body.end_at, body.duration_min))


@router.delete("/{task_id}/time-block")
def clear_time_block_route(task_id: int, user: dict = Depends(require_user)) -> dict:
    """Remove o bloco de tempo (``start_at = end_at = NULL``); mantém a tarefa no plano."""
    return _check_result(clear_time_block(task_id))


# IMPORTANTE: este GET /{task_id} deve ficar no FINAL do arquivo, depois de TODAS as
# rotas estáticas (my-day, kanban-views, tags, calendar, habits, etc.).
# Se estiver antes delas, o FastAPI captura "/my-day" como task_id="my-day",
# falha ao converter para int e devolve 422 para todas essas rotas.
@router.get("/{task_id}")
def get_task_route(task_id: int, user: dict = Depends(require_user)) -> dict:
    """Busca uma tarefa específica pelo id (com subtarefas, recorrência, tags e responsáveis).

    Usado pelo editor de notas Markdown do frontend para reabrir a tarefa
    mencionada num chip [[id|Título]]. Retorna status=error se não encontrada.
    """
    return _check_result(get_task(task_id))
