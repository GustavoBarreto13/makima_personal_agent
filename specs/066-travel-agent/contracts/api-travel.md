# Contrato REST — `/api/travel/*`

Router FastAPI **futuro** (`webapp/backend/routers/travel.py`), registrado em `main.py` com:
```python
app.include_router(travel_router.router, prefix="/api/travel", tags=["travel"])
```

Toda rota exige `user: dict = Depends(require_user)` (cookie de sessão). Lógica de domínio vive em
`agents/yato/tools.py` (+ `tools_mobility.py`, `comfort_matrix.py`) — o router é fachada fina, no
padrão de `webapp/backend/routers/series.py`. Erros retornam `{"detail": "..."}` via
`_check_result(result: dict)`, que mapeia `{"status": "error"}` → `HTTPException(400)`.

**Rotas fixas declaradas antes de rotas parametrizadas** para evitar captura pelo path dinâmico:
`/apps`, `/comfort` e `/dossiers/{uf}/{city}/...` não colidem com `/trips/{trip_id}`, mas dentro do
próprio roteador de `trips`, qualquer subcaminho literal (`/trips/upcoming`, se existir) precisaria
vir antes de `/trips/{trip_id}`.

Fonte normativa dos endpoints: `design_handoff_yato_viagens/README.md` (seção Endpoints) e
`design-guide.md` §9 — os nomes das classes Pydantic abaixo são o que fecha a lacuna entre os dois.

---

## Viagens

### `GET /api/travel/trips`

Lista viagens com filtro e ordenação.

**Query params**:
| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `status` | string | — | Filtro por status, aceita lista separada por vírgula (ex.: `confirmada,em_curso`). |
| `sort` | string | `recent` | `recent` \| `upcoming` \| `title`. |
| `limit` | int | 100 | Máximo de resultados. |

**Response 200**:
```jsonc
{
  "trips": [
    {
      "id": "uuid", "title": "Tiradentes de setembro", "city": "Tiradentes", "state_uf": "MG",
      "start_date": "2026-09-12", "end_date": "2026-09-15", "profile": "economia",
      "status": "planejando", "notes": null
    }
  ],
  "total": 1
}
```

### `POST /api/travel/trips`

Cria uma viagem. Status inicial `planejando`; dias derivados do intervalo (FR-001).

**Body**: `CreateTripBody`
```python
class CreateTripBody(BaseModel):
    title: Optional[str] = None
    city: str
    state_uf: str            # 2 letras
    start_date: str          # YYYY-MM-DD
    end_date: str             # YYYY-MM-DD, >= start_date, intervalo <= 60 dias (FR-002)
    profile: str = "equilibrado"  # economia | equilibrado | conforto
    notes: Optional[str] = None
```

**Response 201**: viagem criada (mesmo shape do item de `GET /trips`).

**Erros**: `400` se `end_date < start_date` ou intervalo > 60 dias (FR-002), mensagem cita o
intervalo válido.

### `GET /api/travel/trips/{trip_id}`

Detalhe da viagem.

### `PATCH /api/travel/trips/{trip_id}`

**Body**: `UpdateTripBody` (todos os campos opcionais, incluindo `status`).
```python
class UpdateTripBody(BaseModel):
    title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    profile: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
```

**Regra de órfãos** (FR-005): se `start_date`/`end_date` mudar e existirem `trip_items` fora do
novo intervalo, a resposta **não aplica a mudança de datas sozinha** — retorna:
```jsonc
{
  "status": "orphans_pending",
  "orphan_count": 3,
  "orphan_item_ids": ["uuid1", "uuid2", "uuid3"],
  "message": "3 itens ficaram fora do novo intervalo. Decida: mover ou remover (POST /trips/{id}/resolve-orphans)."
}
```
(HTTP 200 — não é erro, é um estado intermediário que a UI deve tratar; ver `POST .../resolve-orphans`.)

**Gatilho do snapshot** (FR-013a): se `status` for setado para `confirmada` pela primeira vez, o
handler insere uma linha em `trip_mobility_snapshots` na mesma transação, antes de commitar.

### `DELETE /api/travel/trips/{trip_id}`

Remove a viagem (soft delete — `deleted=TRUE`). Roteiro, checklist e orçamento associados NÃO são
apagados, ficam preservados para histórico (a viagem só some das listagens, `list_trips` filtra
`deleted = FALSE`). **Response 200**: `{"status": "ok", "trip_id": "..."}`.

### `POST /api/travel/trips/{trip_id}/resolve-orphans`

**Body**:
```python
class ResolveOrphansBody(BaseModel):
    action: str                  # "move" | "remove"
    item_ids: list[str]
    new_day_date: Optional[str] = None   # obrigatório se action == "move"
```

---

## Roteiro (`trip_items`)

### `GET /api/travel/trips/{trip_id}/itinerary`

**Response 200**: itens agrupados por dia, ordenados por período e posição (FR-006).
```jsonc
{
  "days": [
    {
      "day_date": "2026-09-13",
      "items": [
        {
          "id": "uuid", "period": "manha", "start_time": null,
          "title": "Igreja São Francisco de Assis", "address": null,
          "transport_mode": "a_pe", "cost_estimate": 0, "notes": null, "position": 0
        }
      ]
    }
  ]
}
```

### `POST /api/travel/trips/{trip_id}/itinerary`

**Body**: `AddItineraryItemBody`
```python
class AddItineraryItemBody(BaseModel):
    day_date: str            # deve estar em [trip.start_date, trip.end_date] (FR-004)
    period: str              # manha | tarde | noite
    start_time: Optional[str] = None
    title: str
    address: Optional[str] = None
    transport_mode: Optional[str] = None
    cost_estimate: Optional[float] = None
    notes: Optional[str] = None
```
**Response 201**. **Erros**: `400` se `day_date` fora do intervalo, mensagem informa o intervalo
válido (FR-004).

### `PATCH /api/travel/itinerary/{item_id}`

**Body**: `UpdateItineraryItemBody` (todos os campos de `AddItineraryItemBody`, opcionais, mais
`position: Optional[int]`).

### `DELETE /api/travel/itinerary/{item_id}`

**Response 200**: `{"status": "ok"}`.

---

## Dossiê de mobilidade

### `GET /api/travel/dossiers/{uf}/{city}`

Cria o dossiê se não existir (FR-007 — passo 1 apresentado imediatamente, sem pular pro veredito).

**Response 200**:
```jsonc
{
  "dossier": {
    "id": "uuid", "city": "Tiradentes", "state_uf": "MG", "city_size": "pequena",
    "pedestrian_scale": false, "summary": null, "last_checked_at": "2026-08-20T10:00:00-03:00",
    "stale": false
  },
  "checks": [
    {"check_key": "porte_cidade", "verdict": "confirmado", "source": "outro", "evidence": "cidade pequena, ~7 mil hab.", "checked_at": "..."},
    {"check_key": "uber", "verdict": "pendente", "source": null, "evidence": null, "checked_at": null},
    {"check_key": "99", "verdict": "pendente", "source": null, "evidence": null, "checked_at": null},
    {"check_key": "indrive", "verdict": "pendente", "source": null, "evidence": null, "checked_at": null},
    {"check_key": "transporte_publico", "verdict": "pendente", "source": null, "evidence": null, "checked_at": null},
    {"check_key": "hospedagem_transfer", "verdict": "pendente", "source": null, "evidence": null, "checked_at": null},
    {"check_key": "deslocamentos", "verdict": "pendente", "source": null, "evidence": null, "checked_at": null}
  ]
}
```
`stale: true` quando `last_checked_at` tem mais de 180 dias (FR-013).

### `PUT /api/travel/dossiers/{uf}/{city}/checks/{check_key}`

Registra o veredito de UM passo por vez (FR-009 — nunca em lote).

**Body**: `UpsertCheckBody`
```python
class UpsertCheckBody(BaseModel):
    verdict: str        # confirmado | ausente | inconclusivo (nunca setado como "pendente" pelo cliente)
    source: str
    evidence: Optional[str] = None
```

**Regra dura** (FR-010, FR-011): o backend não infere veredito — grava exatamente o que veio no
body. É responsabilidade do agente/UI nunca oferecer `ausente` como opção quando a resposta do
usuário só confirma ausência de dado (deve virar `inconclusivo` antes de chegar aqui).

### `GET /api/travel/dossiers/{uf}/{city}/strategy`

**Response 200**: estratégia consolidada (FR-012), calculada a partir dos 7 checks.
```jsonc
{
  "strategy": "transfer_hospedagem",
  "pending_checks": ["deslocamentos"],
  "rationale": "Uber e 99 ausentes, transporte público inconclusivo — transfer combinado com a pousada é o caminho mais seguro."
}
```

### `GET /api/travel/apps`

Sugestões de app por UF/cidade (FR-014, FR-015) — **nunca** veredito.

**Query**: `uf` (obrigatório) ou `city`.

**Response 200**:
```jsonc
{
  "apps": [
    {"name": "Ubiz Car", "kind": "app_corrida", "coverage_scope": "uf", "url": "...", "label": "cobertura declarada — confirmar in-app"}
  ]
}
```

---

## Checklist

### `GET /api/travel/trips/{trip_id}/checklist`

**Query**: `done` (opcional, `true`/`false`).

### `POST /api/travel/trips/{trip_id}/checklist`

**Body**: `AddChecklistItemBody { label: str, category: Optional[str] = None }` — item manual
(`origin='manual'`).

### `PATCH /api/travel/checklist/{item_id}`

**Body**: `UpdateChecklistItemBody { done: Optional[bool] = None, label: Optional[str] = None }`.

### `DELETE /api/travel/checklist/{item_id}`

Remove um item do checklist (hard delete). **Response 200**: `{"status": "ok", "item_id": "..."}`.

### `POST /api/travel/trips/{trip_id}/checklist/regenerate`

Gera itens a partir dos vereditos do dossiê da cidade da viagem (FR-016), sem duplicar rótulo já
existente e sem contradizer vereditos `ausente`/`inconclusivo` (SC-008).

**Response 200**: `{"status": "ok", "added": 3, "skipped_existing": 1}`.

---

## Matriz de conforto (motor puro — sem persistência)

### `GET /api/travel/comfort`

**Query params**:
| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `hours` | float | obrigatório | Duração do trecho em horas. |
| `night` | bool | `false` | Período noturno (FR-018). |
| `profile` | string | `equilibrado` | `economia` \| `equilibrado` \| `conforto` — influencia a fila de ROI. |
| `has_ride_app` | bool | `false` | Se o dossiê da cidade tem app de corrida `confirmado` — sobe/desce o transfer na fila (FR-019). |

**Response 200**:
```jsonc
{
  "recommended_class": "semi_leito",
  "rationale": "Trecho de 11h noturno acima de 8h — recomendado no mínimo semi-leito pelo custo de exaustão.",
  "roi_queue": ["transfer_privativo", "upgrade_hospedagem", "passeio_privativo", "executiva_domestica"]
}
```
Sem escrita em banco — chama `agents/yato/comfort_matrix.py` diretamente (motor puro, FR-017).

---

## Orçamento

### `GET /api/travel/trips/{trip_id}/budget`

**Response 200**:
```jsonc
{
  "items": [
    {"category": "hospedagem", "estimated": 600, "actual": 0, "balance": 600, "over_budget": false},
    {"category": "alimentacao", "estimated": 400, "actual": 45, "balance": 355, "over_budget": false}
  ],
  "total_estimated": 1000, "total_actual": 45, "total_balance": 955
}
```

### `PUT /api/travel/trips/{trip_id}/budget`

Define/atualiza o `estimated` de uma ou mais categorias (upsert).

**Body**: `SetBudgetBody { items: list[BudgetEstimateItem] }` onde
`BudgetEstimateItem { category: str, estimated: float }`.

### `GET /api/travel/trips/{trip_id}/expenses`

Lista os gastos já lançados (com `nami_transaction_ids`).

### `POST /api/travel/trips/{trip_id}/expenses`

Registra um gasto realizado **e** lança na Nami, na mesma transação PostgreSQL (FR-021, SC-006).

**Body**: `LogExpenseBody`
```python
class LogExpenseBody(BaseModel):
    category: str          # transporte_ida | transporte_volta | hospedagem | alimentacao |
                            # mobilidade_local | passeios | outros
    amount: float
    description: str
    date: Optional[str] = None   # default: hoje em America/Sao_Paulo
```

**Response 201**:
```jsonc
{"status": "ok", "budget_item": {"category": "alimentacao", "actual": 45}, "nami_transaction_id": "uuid"}
```

**Erros**: `400` com `conn.rollback()` no backend se a viagem não estiver com um gasto aplicável
(Edge Cases: "gasto sem viagem em curso") ou se o lançamento na Nami falhar — **nada** é gravado
dos dois lados (FR-021, US5 cenário 3).

### `DELETE /api/travel/trips/{trip_id}/expenses/{nami_transaction_id}`

Remove um gasto — reverte (soft delete) a transação na Nami **e** decrementa `actual` da
categoria, na mesma transação PostgreSQL (simétrico ao `POST .../expenses`, mesma garantia de
atomicidade). **Response 200**: `{"status": "ok", "trip_id": "...", "nami_transaction_id": "..."}`.

### `GET /api/travel/trips/{trip_id}/readiness`

Atalho usado pela tela Início — combina progresso do checklist + dossiê fechado + orçamento
definido num único número/õ resumo, para o `ReadinessMeter` do front-end.

```jsonc
{"readiness_pct": 60, "checklist_done": 3, "checklist_total": 5, "dossier_pending": 1, "budget_defined": true}
```

---

## Resumo de status codes

| Padrão | Uso |
|---|---|
| `200` | GET, PATCH, PUT que não criam recurso |
| `201` | POST que cria recurso (`trips`, `itinerary`, `expenses`, `checklist` manual) |
| `400` | erro de validação/negócio (`_check_result` a partir de `{"status": "error"}`) |
| `401` | sessão ausente/expirada (`require_user`) |
| `404` | recurso não encontrado (trip_id, item_id, dossiê inexistente) |
