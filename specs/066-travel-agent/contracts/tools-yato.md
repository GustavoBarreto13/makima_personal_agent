# Contrato de Tools — `agents/yato/`

Lista das tools públicas que compõem `agents/yato/toolset.py` (`TOOLS: list[Callable]`), expostas
via MCP HTTP em `/mcp/yato` (registro em `mcp_servers/makima/registry.py`, `DOMAINS["yato"]`) e
usadas diretamente pelo `agent.py` (ADK, coordinator legado) e por `webapp/backend/routers/travel.py`
(mesma fachada, sem instanciar ADK — padrão `movies.py`/`series.py`).

Convenção de retorno (padrão do repo, `agents/mai/tools.py`, `agents/akane/tools.py`): toda tool
devolve `dict` com `{"status": "ok", ...}` ou `{"status": "error", "message": "..."}` — nunca levanta
exceção para o chamador, nunca retorna string solta. Módulos: `tools.py` (fachada + trips/itinerário/
checklist/apps/orçamento), `tools_mobility.py` (dossiê/protocolo/estratégia), `comfort_matrix.py`
(motor puro, consumido por `tools.py`, não exportado como tool própria — é chamado internamente por
`recommend_comfort_class`).

`*_on_cursor` (ex.: `_log_trip_expense_on_cursor`) **nunca aparece aqui** — recebe cursor psycopg2
aberto, não serializável por MCP (regra confirmada em `agents/nami/toolset.py` e
`agents/kaguya/toolset.py`).

---

## Viagens

### `create_trip(city: str, state_uf: str, start_date: str, end_date: str, profile: str = "equilibrado", title: str | None = None, notes: str | None = None) -> dict`
Cria a viagem. Valida `end_date >= start_date` e intervalo ≤ 60 dias (FR-002) antes de qualquer
escrita. Retorno: `{"status": "ok", "trip": {...}}`.

### `list_trips(status: str | None = None, sort: str = "recent", limit: int = 100) -> dict`
`{"status": "ok", "trips": [...], "total": N}`.

### `get_trip(trip_id: str) -> dict`
`{"status": "ok", "trip": {...}}` ou erro se não encontrado.

### `update_trip(trip_id: str, **campos) -> dict`
Campos opcionais: `title, start_date, end_date, profile, status, notes`. Se datas mudarem e houver
itens órfãos, retorna `{"status": "orphans_pending", "orphan_count": N, "orphan_item_ids": [...]}`
em vez de aplicar a mudança (FR-005) — chamador (agente ou router) decide o próximo passo. Se
`status` virar `"confirmada"` pela primeira vez, grava o snapshot de mobilidade na mesma transação
(FR-013a).

### `resolve_trip_orphans(trip_id: str, action: str, item_ids: list[str], new_day_date: str | None = None) -> dict`
`action` = `"move"` (exige `new_day_date`) ou `"remove"`.

---

## Roteiro

### `add_itinerary_item(trip_id: str, day_date: str, period: str, title: str, start_time: str | None = None, address: str | None = None, transport_mode: str | None = None, cost_estimate: float | None = None, notes: str | None = None) -> dict`
Recusa se `day_date` fora do intervalo da viagem, informando o intervalo válido (FR-004).

### `list_itinerary(trip_id: str) -> dict`
`{"status": "ok", "days": [{"day_date": ..., "items": [...]}]}`, agrupado e ordenado
(manhã→tarde→noite, depois `position`) — FR-006.

### `update_itinerary_item(item_id: str, **campos) -> dict`

### `delete_itinerary_item(item_id: str) -> dict`

---

## Dossiê de mobilidade

### `get_or_create_mobility_dossier(city: str, state_uf: str) -> dict`
Cria o dossiê se não existir e devolve os 7 checks (a maioria `pendente`). Nunca pula para o
veredito (FR-007). Se `state_uf` vier vazio, retorna erro pedindo a UF (Edge Cases: cidade
homônima).

### `record_mobility_check(city: str, state_uf: str, check_key: str, verdict: str, source: str, evidence: str | None = None) -> dict`
Grava um passo por vez. `check_key` ∈ 7 valores fixos (ver `data-model.md`). Regra dura: quem chama
(agente) nunca deve passar `verdict="ausente"` quando a resposta do usuário só indica ausência de
dado — isso é `"inconclusivo"` (FR-010).

### `get_mobility_strategy(city: str, state_uf: str) -> dict`
`{"status": "ok", "strategy": "...", "pending_checks": [...], "rationale": "..."}` (FR-012).

### `suggest_mobility_apps(state_uf: str | None = None, city: str | None = None) -> dict`
Retorna apps candidatos rotulados "cobertura declarada — confirmar in-app" (FR-014, FR-015).

---

## Checklist

### `list_checklist(trip_id: str, done: bool | None = None) -> dict`

### `add_checklist_item(trip_id: str, label: str, category: str | None = None) -> dict`
`origin="manual"`.

### `set_checklist_item_done(item_id: str, done: bool) -> dict`

### `regenerate_checklist_from_dossier(trip_id: str) -> dict`
Gera itens a partir dos vereditos do dossiê da cidade da viagem, sem duplicar `label` já existente
e sem contradizer vereditos `ausente`/`inconclusivo` (FR-016, SC-008).

---

## Matriz economia × conforto (motor puro)

### `recommend_comfort_class(hours: float, night: bool = False, profile: str = "equilibrado", has_ride_app: bool = False) -> dict`
Fachada fina sobre `agents/yato/comfort_matrix.py::recommend(...)` (motor puro, sem banco). Aplica
custo de exaustão (>8h noturno ⇒ mínimo `semi_leito`; >12h ⇒ compara `leito_cama` com diária de
hotel — FR-018) e a fila de ROI (`transfer_privativo > upgrade_hospedagem > passeio_privativo >
executiva_domestica`, com `has_ride_app=False` subindo o transfer — FR-019).

---

## Orçamento e cross-agent Nami

### `set_trip_budget(trip_id: str, items: list[dict]) -> dict`
Cada item: `{"category": ..., "estimated": ...}`. Upsert por `(trip_id, category)`.

### `get_trip_budget(trip_id: str) -> dict`
Estimado, realizado e saldo por categoria + total, com categorias estouradas destacadas (FR-022).

### `log_trip_expense(trip_id: str, category: str, amount: float, description: str, date: str | None = None) -> dict`
**A tool cross-domain.** Internamente:
1. Resolve a categoria Nami a partir do mapa Yato→Nami (`plan.md` D6).
2. `with get_conn() as conn: with conn.cursor() as cur:` — abre UM cursor compartilhado.
3. Upsert em `trip_budget_items` (incrementa `actual`, acrescenta o id da transação a
   `nami_transaction_ids`) via `_log_trip_expense_on_cursor(cur, ...)` (privada, não exportada).
4. Chama `agents.nami.tools.create_transaction_on_cursor(cur, name=description, valor=amount,
   tipo="Despesa", categoria=<categoria Nami mapeada>, source="yato")` — import lazy, dentro da
   função (evita acoplar o startup do Yato à Nami).
5. Se qualquer uma das duas escritas falhar, `conn.rollback()` e retorna
   `{"status": "error", "message": ...}` — nada é gravado dos dois lados (FR-021, SC-006).
6. Sucesso: `{"status": "ok", "budget_item": {...}, "nami_transaction_id": "..."}`.

Este é o único ponto do domínio Yato que escreve fora de suas próprias tabelas — documentado também
em `agents/yato/CLAUDE.md` (exigido pela Constitution, Principle I).

### `get_trip_readiness(trip_id: str) -> dict`
Combina checklist + dossiê + orçamento definido num resumo único para a tela Início.

---

## Cobertura de Functional Requirements por tool

| FR | Tool(s) |
|---|---|
| FR-001, FR-002 | `create_trip` |
| FR-003, FR-004 | `add_itinerary_item` |
| FR-005 | `update_trip`, `resolve_trip_orphans` |
| FR-006 | `list_itinerary` |
| FR-007 a FR-011 | `get_or_create_mobility_dossier`, `record_mobility_check` |
| FR-012 | `get_mobility_strategy` |
| FR-013 | `get_or_create_mobility_dossier` (flag `stale`) |
| FR-013a | `update_trip` (gatilho na transição para `confirmada`) |
| FR-014, FR-015 | `suggest_mobility_apps` |
| FR-016 | `regenerate_checklist_from_dossier` |
| FR-017 a FR-019 | `recommend_comfort_class` (+ `comfort_matrix.py`) |
| FR-020, FR-022 | `set_trip_budget`, `get_trip_budget` |
| FR-021 | `log_trip_expense` |
