"""Router de viagens (Yato) — expõe as tools como endpoints REST.

Camada fina: cada endpoint chama diretamente a tool correspondente em
agents.yato.tools / agents.yato.tools_mobility. Lógica de negócio fica sempre
nas tools — não aqui (padrão de webapp/backend/routers/series.py).

IMPORTANTE: rotas com path fixo (/apps, /comfort, /dossiers/..., /trips sem id,
/itinerary/{item_id}, /checklist/{item_id}) convivem com /trips/{trip_id} sem
ambiguidade — nenhuma delas é um prefixo de outra com o mesmo número de
segmentos. Ainda assim, sub-rotas de /trips/{trip_id}/... são declaradas
próximas de /trips/{trip_id} para manter a leitura linear (padrão do contrato).

Usage:
    # Em main.py:
    from webapp.backend.routers import travel as travel_router
    app.include_router(travel_router.router, prefix="/api/travel", tags=["travel"])
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from webapp.backend.deps import require_user

from agents.yato.tools import (
    create_trip, list_trips, get_trip, update_trip, resolve_trip_orphans, delete_trip,
    add_itinerary_item, list_itinerary, update_itinerary_item, delete_itinerary_item,
    list_checklist, add_checklist_item, update_checklist_item, delete_checklist_item,
    regenerate_checklist_from_dossier,
    recommend_comfort_class,
    set_trip_budget, get_trip_budget, log_trip_expense, delete_trip_expense,
    get_trip_readiness, list_trip_expenses,
)
from agents.yato.tools_mobility import (
    get_or_create_mobility_dossier, record_mobility_check, get_mobility_strategy,
    suggest_mobility_apps,
)


# ─── Helper de resultado ────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Converte resposta de erro das tools em HTTP 400; deixa 'ok' (ou estados
    intermediários como 'orphans_pending') passar."""
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido."))
    return result


router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC
# ════════════════════════════════════════════════════════════════════════════

class CreateTripBody(BaseModel):
    title: Optional[str] = None
    city: str
    state_uf: str
    start_date: str
    end_date: str
    profile: str = "equilibrado"
    notes: Optional[str] = None


class UpdateTripBody(BaseModel):
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    profile: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ResolveOrphansBody(BaseModel):
    action: str  # "move" | "remove"
    item_ids: list[str]
    new_day_date: Optional[str] = None


class AddItineraryItemBody(BaseModel):
    day_date: str
    period: str
    start_time: Optional[str] = None
    title: str
    address: Optional[str] = None
    transport_mode: Optional[str] = None
    cost_estimate: Optional[float] = None
    notes: Optional[str] = None


class UpdateItineraryItemBody(BaseModel):
    day_date: Optional[str] = None
    period: Optional[str] = None
    start_time: Optional[str] = None
    title: Optional[str] = None
    address: Optional[str] = None
    transport_mode: Optional[str] = None
    cost_estimate: Optional[float] = None
    notes: Optional[str] = None
    position: Optional[int] = None


class UpsertCheckBody(BaseModel):
    verdict: str  # confirmado | ausente | inconclusivo
    source: str
    evidence: Optional[str] = None


class AddChecklistItemBody(BaseModel):
    label: str
    category: Optional[str] = None


class UpdateChecklistItemBody(BaseModel):
    done: Optional[bool] = None
    label: Optional[str] = None


class BudgetEstimateItem(BaseModel):
    category: str
    estimated: float


class SetBudgetBody(BaseModel):
    items: list[BudgetEstimateItem]


class LogExpenseBody(BaseModel):
    category: str
    amount: float
    description: str
    date: Optional[str] = None


# ════════════════════════════════════════════════════════════════════════════
# ROTAS FIXAS — apps, comfort, dossiês (nenhuma colide com /trips/{trip_id})
# ════════════════════════════════════════════════════════════════════════════

@router.get("/apps")
def get_apps_endpoint(
    uf: Optional[str] = Query(default=None, description="UF do destino"),
    city: Optional[str] = Query(default=None, description="Cidade do destino"),
    user: dict = Depends(require_user),
) -> dict:
    """Sugestões de apps de mobilidade por UF/cidade — nunca veredito (FR-014/FR-015)."""
    return _check_result(suggest_mobility_apps(state_uf=uf, city=city))


@router.get("/comfort")
def get_comfort_endpoint(
    hours: float = Query(..., description="Duração do trecho em horas"),
    night: bool = Query(default=False, description="Período noturno"),
    profile: str = Query(default="equilibrado"),
    has_ride_app: bool = Query(default=False, description="Dossiê já tem app de corrida confirmado"),
    user: dict = Depends(require_user),
) -> dict:
    """Recomendação de classe rodoviária ANTT — motor puro, sem persistência (FR-017)."""
    return _check_result(
        recommend_comfort_class(hours=hours, night=night, profile=profile, has_ride_app=has_ride_app)
    )


@router.get("/dossiers/{uf}/{city}")
def get_dossier_endpoint(
    uf: str,
    city: str,
    user: dict = Depends(require_user),
) -> dict:
    """Busca (ou cria) o dossiê de mobilidade da cidade — nunca pula pro veredito (FR-007)."""
    return _check_result(get_or_create_mobility_dossier(city=city, state_uf=uf))


@router.put("/dossiers/{uf}/{city}/checks/{check_key}")
def upsert_check_endpoint(
    uf: str,
    city: str,
    check_key: str,
    body: UpsertCheckBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registra o veredito de UM passo do protocolo (FR-009 — nunca em lote)."""
    return _check_result(
        record_mobility_check(
            city=city, state_uf=uf, check_key=check_key,
            verdict=body.verdict, source=body.source, evidence=body.evidence,
        )
    )


@router.get("/dossiers/{uf}/{city}/strategy")
def get_strategy_endpoint(
    uf: str,
    city: str,
    user: dict = Depends(require_user),
) -> dict:
    """Estratégia de mobilidade consolidada a partir dos 7 checks (FR-012)."""
    return _check_result(get_mobility_strategy(city=city, state_uf=uf))


# ════════════════════════════════════════════════════════════════════════════
# VIAGENS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/trips")
def list_trips_endpoint(
    status: Optional[str] = Query(default=None, description="Status, separados por vírgula"),
    sort: str = Query(default="recent", description="recent | upcoming | title"),
    limit: int = Query(default=100),
    user: dict = Depends(require_user),
) -> dict:
    """Lista viagens com filtro e ordenação."""
    return _check_result(list_trips(status=status, sort=sort, limit=limit))


@router.post("/trips", status_code=201)
def create_trip_endpoint(
    body: CreateTripBody,
    user: dict = Depends(require_user),
) -> dict:
    """Cria uma viagem — status inicial 'planejando' (FR-001)."""
    return _check_result(
        create_trip(
            city=body.city, state_uf=body.state_uf, start_date=body.start_date,
            end_date=body.end_date, profile=body.profile, title=body.title, notes=body.notes,
        )
    )


@router.get("/trips/{trip_id}")
def get_trip_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Detalhe de uma viagem."""
    return _check_result(get_trip(trip_id=trip_id))


@router.patch("/trips/{trip_id}")
def update_trip_endpoint(
    trip_id: str,
    body: UpdateTripBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualiza campos de uma viagem — pode devolver o estado 'orphans_pending' (FR-005)."""
    result = update_trip(
        trip_id=trip_id, title=body.title, start_date=body.start_date, end_date=body.end_date,
        profile=body.profile, status=body.status, notes=body.notes,
    )
    if result.get("status") == "orphans_pending":
        # Estado intermediário, não é erro — devolve 200 com o payload cru,
        # a UI decide o próximo passo (POST .../resolve-orphans).
        return result
    return _check_result(result)


@router.delete("/trips/{trip_id}")
def delete_trip_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remove uma viagem (soft delete) — roteiro/checklist/orçamento ficam preservados."""
    return _check_result(delete_trip(trip_id=trip_id))


@router.post("/trips/{trip_id}/resolve-orphans")
def resolve_orphans_endpoint(
    trip_id: str,
    body: ResolveOrphansBody,
    user: dict = Depends(require_user),
) -> dict:
    """Aplica a decisão do usuário sobre itens órfãos: mover ou remover (FR-005)."""
    return _check_result(
        resolve_trip_orphans(
            trip_id=trip_id, action=body.action, item_ids=body.item_ids,
            new_day_date=body.new_day_date,
        )
    )


# ── Roteiro (trip_items) ─────────────────────────────────────────────────────

@router.get("/trips/{trip_id}/itinerary")
def list_itinerary_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Roteiro agrupado por dia, ordenado manhã→tarde→noite→posição (FR-006)."""
    return _check_result(list_itinerary(trip_id=trip_id))


@router.post("/trips/{trip_id}/itinerary", status_code=201)
def add_itinerary_item_endpoint(
    trip_id: str,
    body: AddItineraryItemBody,
    user: dict = Depends(require_user),
) -> dict:
    """Adiciona um item de roteiro — recusa data fora do intervalo da viagem (FR-004)."""
    return _check_result(
        add_itinerary_item(
            trip_id=trip_id, day_date=body.day_date, period=body.period,
            start_time=body.start_time, title=body.title, address=body.address,
            transport_mode=body.transport_mode, cost_estimate=body.cost_estimate, notes=body.notes,
        )
    )


@router.patch("/itinerary/{item_id}")
def update_itinerary_item_endpoint(
    item_id: str,
    body: UpdateItineraryItemBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualiza campos de um item de roteiro."""
    return _check_result(
        update_itinerary_item(
            item_id=item_id, day_date=body.day_date, period=body.period,
            start_time=body.start_time, title=body.title, address=body.address,
            transport_mode=body.transport_mode, cost_estimate=body.cost_estimate,
            notes=body.notes, position=body.position,
        )
    )


@router.delete("/itinerary/{item_id}")
def delete_itinerary_item_endpoint(
    item_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remove um item de roteiro."""
    return _check_result(delete_itinerary_item(item_id=item_id))


# ── Checklist ─────────────────────────────────────────────────────────────

@router.get("/trips/{trip_id}/checklist")
def list_checklist_endpoint(
    trip_id: str,
    done: Optional[bool] = Query(default=None),
    user: dict = Depends(require_user),
) -> dict:
    """Checklist pré-viagem, opcionalmente filtrado por concluído."""
    return _check_result(list_checklist(trip_id=trip_id, done=done))


@router.post("/trips/{trip_id}/checklist", status_code=201)
def add_checklist_item_endpoint(
    trip_id: str,
    body: AddChecklistItemBody,
    user: dict = Depends(require_user),
) -> dict:
    """Adiciona item manual ao checklist (`origin='manual'`)."""
    return _check_result(add_checklist_item(trip_id=trip_id, label=body.label, category=body.category))


@router.patch("/checklist/{item_id}")
def update_checklist_item_endpoint(
    item_id: str,
    body: UpdateChecklistItemBody,
    user: dict = Depends(require_user),
) -> dict:
    """Marca/desmarca (e opcionalmente renomeia) um item do checklist."""
    return _check_result(
        update_checklist_item(item_id=item_id, done=body.done, label=body.label)
    )


@router.delete("/checklist/{item_id}")
def delete_checklist_item_endpoint(
    item_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remove um item do checklist."""
    return _check_result(delete_checklist_item(item_id=item_id))


@router.post("/trips/{trip_id}/checklist/regenerate")
def regenerate_checklist_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Gera itens a partir dos vereditos do dossiê da cidade (FR-016, SC-008)."""
    return _check_result(regenerate_checklist_from_dossier(trip_id=trip_id))


# ── Orçamento e gastos (cross-agent Nami) ────────────────────────────────────

@router.get("/trips/{trip_id}/budget")
def get_budget_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Estimado, realizado e saldo por categoria + total (FR-022)."""
    return _check_result(get_trip_budget(trip_id=trip_id))


@router.put("/trips/{trip_id}/budget")
def set_budget_endpoint(
    trip_id: str,
    body: SetBudgetBody,
    user: dict = Depends(require_user),
) -> dict:
    """Define/atualiza o estimado de uma ou mais categorias (upsert)."""
    return _check_result(
        set_trip_budget(trip_id=trip_id, items=[i.model_dump() for i in body.items])
    )


@router.get("/trips/{trip_id}/expenses")
def list_expenses_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Lista os gastos já lançados (com nami_transaction_ids)."""
    return _check_result(list_trip_expenses(trip_id=trip_id))


@router.post("/trips/{trip_id}/expenses", status_code=201)
def log_expense_endpoint(
    trip_id: str,
    body: LogExpenseBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registra um gasto realizado e lança na Nami, na mesma transação (FR-021, SC-006)."""
    return _check_result(
        log_trip_expense(
            trip_id=trip_id, category=body.category, amount=body.amount,
            description=body.description, date=body.date,
        )
    )


@router.delete("/trips/{trip_id}/expenses/{nami_transaction_id}")
def delete_expense_endpoint(
    trip_id: str,
    nami_transaction_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remove um gasto — reverte a transação na Nami e decrementa o realizado, atomicamente."""
    return _check_result(
        delete_trip_expense(trip_id=trip_id, nami_transaction_id=nami_transaction_id)
    )


@router.get("/trips/{trip_id}/readiness")
def get_readiness_endpoint(
    trip_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Atalho para a tela Início: progresso do checklist + dossiê + orçamento."""
    return _check_result(get_trip_readiness(trip_id=trip_id))
