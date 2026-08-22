---

description: "Task list template for feature implementation"
---

# Tasks: Yato — agente de Viagens

**Input**: Design documents from `specs/066-travel-agent/`

**Prerequisites**: `plan.md`, `spec.md`, `data-model.md`, `contracts/api-travel.md`,
`contracts/tools-yato.md`, `quickstart.md`, `research.md`

**Tests**: Não solicitados explicitamente na spec, exceto o motor puro `comfort_matrix.py`, onde
SC-005 exige 100% de paridade com a tabela ANTT do `research.md` — por isso `test_yato_comfort.py`
está incluído na US4. Um `test_yato.py` de nível de tool (padrão `test_akane.py`/`test_komi.py`) é
incluído na fase de Polish, cobrindo o restante do domínio sem bloquear nenhuma user story.

**Organization**: Tarefas agrupadas por user story (spec.md), para implementação e teste
independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência entre si)
- **[Story]**: US1–US5, mapeando para as user stories do `spec.md`
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Web application já existente no repo: `agents/yato/` (pacote de domínio), `webapp/backend/` (FastAPI),
`webapp/frontend/src/pages/yato/` (shell React) — ver `plan.md` → Project Structure para a árvore
completa.

---

## Phase 1: Setup

**Purpose**: Inicialização do pacote e do shell — nenhuma lógica de domínio ainda.

- [ ] T001 Criar `agents/yato/__init__.py` (comentário de 2 linhas, padrão `agents/mai/__init__.py`) e `agents/yato/schema_pg.sql` com as 8 tabelas de `data-model.md` (`trips`, `trip_items`, `mobility_dossiers`, `mobility_checks`, `trip_mobility_snapshots`, `mobility_apps`, `trip_checklist_items`, `trip_budget_items`), `IF NOT EXISTS`, índices e `UNIQUE` constraints conforme especificado
- [ ] T002 [P] Registrar `"agents/yato/schema_pg.sql"` em `SCHEMA_FILES` de `scripts/setup_schemas.py`
- [ ] T003 [P] Criar `scripts/seed_mobility_apps.py` — semeia os 12 apps do `research.md` (Garupa, Urbano Norte, Ubiz Car, BibiMob, Bora94, Chofer 46, Urban66, Rota Pop, V1, InDrive, Uber, 99, Cittamobi, Moovit) em `mobility_apps`
- [ ] T004 [P] Criar `webapp/frontend/src/pages/yato/types.ts` (interfaces `Trip`, `TripItem`, `MobilityDossier`, `MobilityCheck`, `Verdict`, `CheckKey`, `MobilityApp`, `TripChecklistItem`, `TripBudgetItem`, `YatoView`, `Tweaks`, mirrando `contracts/api-travel.md`) e `webapp/frontend/src/pages/yato/dateUtils.ts` (cópia local de `todayLocalISO()` + helpers de intervalo de dias, decisão D8 do `plan.md`)
- [ ] T005 [P] Portar tokens CSS de `specs/066-travel-agent/design_handoff_yato_viagens/yato/styles.css` para `webapp/frontend/src/pages/yato/yato.css`, escopado em `.yato-shell` (cores de veredito fixas, acentos azul-cachecol/ouro/carmim/musgo, densidades, tokens kraft/mapa); copiar `design_handoff_yato_viagens/yato/yato.png` para `webapp/frontend/public/yato.png`; adicionar `--c-yato: #4a6fa5` e `--c-yato-dim: #17202f` em `webapp/frontend/src/index.css`

**Checkpoint**: `python -m scripts.setup_schemas` cria as 8 tabelas; `python -m scripts.seed_mobility_apps` popula `mobility_apps`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura que TODAS as user stories precisam para ficar alcançáveis pelo bot e pelo webapp — sem lógica de domínio própria.

**⚠️ CRITICAL**: Nenhuma user story pode ser testada de ponta a ponta (bot ou webapp) antes desta fase.

- [ ] T006 Criar `agents/yato/toolset.py` (scaffold `TOOLS: list = []`, docstring padrão dos demais toolsets, nota sobre exclusão de `*_on_cursor`) e `agents/yato/agent.py` (singleton ADK `yato_agent`, `gemini-2.5-flash`, importando `TOOLS` de `agents.yato.toolset`, com `_YATO_INSTRUCTION` esqueleto: persona Yato de *Noragami*, HTML, prefixo `"Yato:"` conforme FR-025 — seções por domínio preenchidas incrementalmente pelas user stories abaixo)
- [ ] T007 Registrar `agents.yato.toolset.TOOLS` como `DOMAINS["yato"]` em `mcp_servers/makima/registry.py`
- [ ] T008 [P] Registrar `yato_agent` em `coordinator/agent.py` (import, lista `sub_agents`, roster + bloco de roteamento em `_MAKIMA_INSTRUCTION`)
- [ ] T009 [P] Criar `hermes/skills/yato-viagens/SKILL.md` (padrão `hermes/skills/mai-series/SKILL.md`) e adicionar o bloco `yato:` em `mcp_servers` de `hermes/config.yaml`, apontando para `http://makima-mcp:8090/mcp/yato`
- [ ] T010 Criar `webapp/backend/routers/travel.py` (scaffold `router = APIRouter()`, docstring padrão `series.py`, sem endpoints ainda) e registrar em `webapp/backend/main.py` (`app.include_router(travel_router.router, prefix="/api/travel", tags=["travel"])`, antes do catch-all da SPA)
- [ ] T011 Criar `webapp/frontend/src/pages/yato/YatoShell.tsx` (scaffold: sidebar/topbar/footbar, roteamento interno `{view, param}`, tweaks de `localStorage['yato-tweaks']`, import de `yato.css`) e `webapp/frontend/src/pages/yato/yatoApi.ts` (scaffold: import de `lib/api.ts`, objeto `yatoApi` vazio, preenchido incrementalmente pelas stories)
- [ ] T012 Adicionar `<Route path="/travel/*" element={<YatoShell />} />` em `webapp/frontend/src/App.tsx` (antes do catch-all `/*`) e a entrada Yato no array `DOMAINS` de `webapp/frontend/src/components/Layout.tsx` (`character: 'Yato'`, `label: 'Viagens'`, `mainPath: '/travel'`, `color: 'var(--c-yato)'`, `colorDim: 'var(--c-yato-dim)'`)

**Checkpoint**: domínio "yato" existe (mesmo vazio) em `/mcp/yato`, `/api/travel`, `/travel` no webapp e no menu Makima — pronto para as user stories preencherem tools/endpoints/telas.

---

## Phase 3: User Story 1 - Criar a viagem e montar o roteiro (Priority: P1) 🎯 MVP

**Goal**: Criar viagens e montar o roteiro dia a dia por conversa ou pelo webapp (FR-001 a FR-006).

**Independent Test**: criar viagem, adicionar 5 itens em 3 dias, listar o roteiro pelo bot e pelo
webapp — sem tocar em dossiê, checklist, conforto ou orçamento.

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implementar `create_trip`, `list_trips`, `get_trip`, `update_trip`, `resolve_trip_orphans` em `agents/yato/tools.py` — validação `end_date >= start_date` e intervalo ≤ 60 dias (FR-002); `update_trip` detecta itens órfãos ao mudar datas e retorna contagem em vez de aplicar sozinho (FR-005); ao setar `status='confirmada'` pela primeira vez, insere o snapshot em `trip_mobility_snapshots` lendo o estado corrente de `mobility_checks` da cidade (FR-013a — leitura SQL direta, sem depender de `tools_mobility.py`)
- [ ] T014 [P] [US1] Implementar `add_itinerary_item`, `list_itinerary`, `update_itinerary_item`, `delete_itinerary_item` em `agents/yato/tools.py` — recusa `day_date` fora do intervalo da viagem com o intervalo válido na mensagem (FR-004); listagem agrupada por dia e ordenada manhã→tarde→noite→posição (FR-006)
- [ ] T015 [US1] Adicionar as tools de T013/T014 a `TOOLS` em `agents/yato/toolset.py` e a seção de viagens+roteiro em `_YATO_INSTRUCTION` (`agents/yato/agent.py`) — templates HTML de card de viagem e item de roteiro (depende de T013, T014)
- [ ] T016 [US1] Implementar em `webapp/backend/routers/travel.py`: `GET/POST /trips`, `GET/PATCH /trips/{trip_id}`, `POST /trips/{trip_id}/resolve-orphans`, `GET/POST /trips/{trip_id}/itinerary`, `PATCH/DELETE /itinerary/{item_id}` com os bodies Pydantic `CreateTripBody`, `UpdateTripBody`, `ResolveOrphansBody`, `AddItineraryItemBody`, `UpdateItineraryItemBody` de `contracts/api-travel.md` (depende de T013, T014)
- [ ] T017 [P] [US1] Adicionar métodos de viagens e roteiro a `webapp/frontend/src/pages/yato/yatoApi.ts` (`listTrips`, `createTrip`, `getTrip`, `updateTrip`, `resolveOrphans`, `listItinerary`, `addItineraryItem`, `updateItineraryItem`, `deleteItineraryItem`)
- [ ] T018 [P] [US1] Criar `webapp/frontend/src/pages/yato/components/TripCard.tsx`, `components/DayColumn.tsx` e `components/ItineraryItem.tsx` (visual de bilhete kraft com talão serrilhado via `mask-image`, per `design_handoff_yato_viagens/yato/ui.jsx` e `screens-a.jsx`)
- [ ] T019 [US1] Criar `webapp/frontend/src/pages/yato/screens/TripsScreen.tsx` (lista + ordenação) e `screens/TripDetailScreen.tsx` (board de dias em colunas — "a tela mais densa"), incluindo o banner âmbar de itens órfãos com ações mover/remover, nunca exclusão silenciosa (FR-005) (depende de T017, T018)
- [ ] T020 [P] [US1] Criar `webapp/frontend/src/pages/yato/modals/NewTripModal.tsx` e `modals/NewItemModal.tsx` (per `design_handoff_yato_viagens/yato/modals.jsx`)
- [ ] T021 [US1] Ligar as views `trips` e `trip` (nav + `renderScreen()`) em `webapp/frontend/src/pages/yato/YatoShell.tsx` (depende de T019, T020)

**Checkpoint**: User Story 1 completa e testável de forma independente (bot + webapp).

---

## Phase 4: User Story 2 - Dossiê de mobilidade: descobrir como me locomover ANTES de comprar (Priority: P1)

**Goal**: Conduzir o protocolo de 7 passos e consolidar a estratégia de mobilidade recomendada
(FR-007 a FR-013, FR-013a).

**Independent Test**: rodar o protocolo completo para uma cidade, ver os 7 checks gravados com
veredito e fonte, e receber a estratégia — funciona mesmo sem roteiro montado (independe de US1).

### Implementation for User Story 2

- [ ] T022 [P] [US2] Criar `agents/yato/tools_mobility.py` com `get_or_create_mobility_dossier`, `record_mobility_check`, `get_mobility_strategy` e `suggest_mobility_apps` — protocolo passo a passo (FR-009), ausência de dado sempre `inconclusivo` nunca `ausente` (FR-010, FR-011), estratégia consolidada (FR-012), flag `stale` acima de 180 dias (FR-013), apps sempre rotulados "cobertura declarada — confirmar in-app" (FR-014, FR-015)
- [ ] T023 [US2] Adicionar as tools de T022 a `TOOLS` em `agents/yato/toolset.py` e a seção do protocolo de mobilidade em `_YATO_INSTRUCTION` — conduzir UM passo por vez, nunca declarar veredito em nome do usuário (depende de T022)
- [ ] T024 [US2] Implementar em `webapp/backend/routers/travel.py`: `GET /dossiers/{uf}/{city}`, `PUT /dossiers/{uf}/{city}/checks/{check_key}`, `GET /dossiers/{uf}/{city}/strategy`, `GET /apps` — registradas como rotas fixas, antes de qualquer rota parametrizada por `trip_id` (depende de T022)
- [ ] T025 [P] [US2] Adicionar métodos de dossiê e apps a `yatoApi.ts` (`getDossier`, `upsertCheck`, `getStrategy`, `suggestApps`)
- [ ] T026 [P] [US2] Criar `components/VerdictChip.tsx`, `components/MobilityDossier.tsx` (⭐ componente-assinatura, símbolo + rótulo textual, nunca só cor) e `components/ReadinessMeter.tsx`/`ReadinessLine.tsx`
- [ ] T027 [US2] Criar `screens/MobilityScreen.tsx` (painel dos 7 passos) e `modals/ProtocolWizard.tsx` (um passo por vez, nunca formulário único — FR-009; nota literal "Registrar dúvida é resultado, não desistência.") (depende de T025, T026)
- [ ] T028 [US2] Ligar a view `mobility` em `YatoShell.tsx` (depende de T027)

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente e simultânea.

---

## Phase 5: User Story 3 - O que instalar e o que levar antes de embarcar (Priority: P2)

**Goal**: Converter o diagnóstico do dossiê em checklist pré-viagem acionável (FR-014 a FR-016).

**Independent Test**: para uma cidade de MG, pedir sugestões de app e gerar o checklist; marcar
itens como feitos e ver o progresso persistir.

### Implementation for User Story 3

- [ ] T029 [US3] Implementar `list_checklist`, `add_checklist_item`, `set_checklist_item_done`, `regenerate_checklist_from_dossier` em `agents/yato/tools.py` — regeneração lê os vereditos do dossiê da cidade (via `tools_mobility.get_or_create_mobility_dossier`), nunca duplica `label` já existente e nunca inclui item contraditório com veredito `ausente`/`inconclusivo` (FR-016, SC-008) (depende de T022)
- [ ] T030 [US3] Adicionar as tools de T029 a `TOOLS`/`_YATO_INSTRUCTION` e implementar em `travel.py`: `GET/POST /trips/{trip_id}/checklist`, `PATCH /checklist/{item_id}`, `POST /trips/{trip_id}/checklist/regenerate` (depende de T029)
- [ ] T031 [P] [US3] Adicionar métodos de checklist a `yatoApi.ts`
- [ ] T032 [P] [US3] Criar `components/AppSuggestionCard.tsx` (selo ⚑ "confirmar in-app" obrigatório inclusive para Uber/99, FR-015) e `components/ChecklistRow.tsx`
- [ ] T033 [US3] Criar `screens/ChecklistScreen.tsx` e ligar a view `checklist` em `YatoShell.tsx` (depende de T031, T032)

**Checkpoint**: User Stories 1–3 funcionam de forma independente.

---

## Phase 6: User Story 4 - Economia × conforto: escolher a classe do ônibus e onde gastar mais (Priority: P2)

**Goal**: Motor puro de recomendação de classe rodoviária e fila de ROI de upgrades (FR-017 a
FR-019) — vale sozinho, sem viagem cadastrada.

**Independent Test**: chamar a recomendação com duração, período e orçamento e conferir a saída
contra a tabela ANTT do `research.md` — motor puro, testável sem banco.

### Tests for User Story 4 ⚠️

- [ ] T034 [P] [US4] `tests/agents/test_yato_comfort.py` — casos dos cenários de aceite do `spec.md` (11h noturno → semi-leito ou superior; 3h diurno → convencional sem upgrade; 13h noturno → leito-cama vs. diária de hotel; perfil economia sem app de corrida → transfer no topo do ROI), 100% de paridade com a tabela ANTT (SC-005)

### Implementation for User Story 4

- [ ] T035 [P] [US4] Implementar `agents/yato/comfort_matrix.py` — função pura `recommend(hours, night, profile, has_ride_app) -> dict`, sem banco/rede, categorias ANTT, custo de exaustão (FR-018), fila de ROI ponderada pelo dossiê (FR-019), docstring com `Example:` doctest (padrão `agents/kaguya/capacity.py`)
- [ ] T036 [US4] Implementar `recommend_comfort_class` em `agents/yato/tools.py` (fachada sobre `comfort_matrix.recommend`), adicionar a `TOOLS`/`_YATO_INSTRUCTION`, e implementar `GET /comfort` em `travel.py` chamando o motor direto, sem persistência (depende de T035)
- [ ] T037 [P] [US4] Adicionar `getComfort` a `yatoApi.ts` e criar `components/ComfortMatrix.tsx` (régua ANTT de 5 degraus + fila de ROI)
- [ ] T038 [US4] Integrar o painel de conforto em `screens/TripDetailScreen.tsx` (depende de T036, T037)

**Checkpoint**: User Stories 1–4 funcionam de forma independente.

---

## Phase 7: User Story 5 - Orçamento estimado × realizado, integrado à Nami (Priority: P3)

**Goal**: Orçamento por categoria com lançamento atômico de gastos na Nami (FR-020 a FR-022).

**Independent Test**: definir estimativas, registrar dois gastos, conferir o resumo e confirmar que
as despesas apareceram na Nami com a mesma data e valor — inclusive o caso de falha (nada é gravado
dos dois lados).

### Implementation for User Story 5

- [ ] T039 [P] [US5] Implementar `set_trip_budget`, `get_trip_budget` em `agents/yato/tools.py` — upsert por `(trip_id, category)`, saldo e destaque de categorias estouradas (FR-020, FR-022)
- [ ] T040 [US5] Implementar `log_trip_expense` em `agents/yato/tools.py` — `with get_conn() as conn: with conn.cursor() as cur:`, upsert de `trip_budget_items.actual` via `_log_trip_expense_on_cursor` privada, import lazy de `agents.nami.tools.create_transaction_on_cursor`, mapa de categoria Yato→Nami (D6 do `plan.md`: `alimentacao`→`Alimentacao`; `transporte_ida`/`transporte_volta`/`mobilidade_local`→`Transporte`; `hospedagem`/`passeios`/`outros`→`Viagem`), `conn.rollback()` e retorno de erro se qualquer lado falhar — nada gravado dos dois lados (FR-021, SC-006) (depende de T039)
- [ ] T041 [US5] Implementar `get_trip_readiness` em `agents/yato/tools.py` (combina checklist + dossiê + orçamento definido) (depende de T029, T022, T039)
- [ ] T042 [US5] Adicionar as tools de T039–T041 a `TOOLS`/`_YATO_INSTRUCTION` (`*_on_cursor` excluída, apenas `log_trip_expense` pública) e documentar o contrato cross-agent em `agents/yato/CLAUDE.md` (exigência da Constitution, Principle I) (depende de T040, T041)
- [ ] T043 [US5] Implementar em `travel.py`: `GET/PUT /trips/{trip_id}/budget`, `GET/POST /trips/{trip_id}/expenses`, `GET /trips/{trip_id}/readiness` (depende de T039, T040, T041)
- [ ] T044 [P] [US5] Adicionar métodos de orçamento/gastos a `yatoApi.ts`
- [ ] T045 [P] [US5] Criar `components/BudgetBar.tsx` (selo "→ Nami" por linha de gasto, com tooltip)
- [ ] T046 [US5] Criar `screens/BudgetScreen.tsx` e `modals/LogExpenseModal.tsx` — aviso literal "Lança nas finanças no ato — uma despesa por gasto. Se falhar, nada é salvo dos dois lados." (FR-021) (depende de T044, T045)
- [ ] T047 [US5] Criar `screens/HomeScreen.tsx` (próxima viagem + prontidão + orçamento + checklist, via `readiness`/`budget`/`checklist`) e ligar as views `budget`/`home` em `YatoShell.tsx` (depende de T041, T046)

**Checkpoint**: todas as 5 user stories funcionam de forma independente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Paridade com o hub da Makima e atualização da documentação viva do repo (checklist de
"Como manter a documentação" do `CLAUDE.md` raiz).

- [ ] T048 [P] Adicionar o card do Yato ao array `AGENTS` em `webapp/frontend/src/pages/makima/data.ts`
- [ ] T049 [P] Adicionar 2 stats do Yato (ex.: próxima viagem, prontidão do dossiê) em `GET /api/hub/summary` (`webapp/backend/routers/hub.py`), cada um em seu próprio `try/except` → fallback `"—"`
- [ ] T050 [P] Completar `agents/yato/CLAUDE.md` (tools em tabela, schema das 8 tabelas, personalidade, variáveis de ambiente — nenhuma nova —, rotas do webapp) se ainda não fechado em T042
- [ ] T051 [P] Atualizar tabela de agentes e árvore de arquivos do `CLAUDE.md` raiz (Yato ✅ 066)
- [ ] T052 [P] Adicionar seção `## Viagens (\`/api/travel/*\`)` em `webapp/docs/API.md`
- [ ] T053 [P] Adicionar seção `### YatoShell` em `webapp/docs/FRONTEND.md` (rotas, telas, cliente de API)
- [ ] T054 [P] Atualizar a tabela "Mapa dos domínios" em `webapp/frontend/src/pages/CLAUDE.md`
- [ ] T055 [P] Atualizar a árvore de `routers/` e a tabela "Fatias de implementação" em `webapp/CLAUDE.md` (linha 066)
- [ ] T056 Atualizar `ROADMAP.md` — marcar 066 como entregue, com a seção "Status atual"
- [ ] T057 [P] Criar `tests/agents/test_yato.py` — testes de nível de tool contra banco de teste (padrão `test_akane.py`/`test_komi.py`), cobrindo trips, itinerário, dossiê, checklist e orçamento
- [ ] T058 Rodar a validação completa de `quickstart.md` (os 10 passos) e confirmar SC-001 a SC-009

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende da Setup — BLOQUEIA todas as user stories
- **User Stories (Phase 3–7)**: todas dependem da Foundational; podem prosseguir em paralelo (se
  houver capacidade) ou em ordem de prioridade (US1/US2 → US3/US4 → US5)
- **Polish (Phase 8)**: depende de todas as user stories desejadas estarem completas

### User Story Dependencies

- **US1 (P1)**: pode começar após a Foundational — sem dependência de outras stories
- **US2 (P1)**: pode começar após a Foundational — sem dependência de US1 (roda mesmo sem roteiro montado)
- **US3 (P2)**: depende de `tools_mobility.py` (T022, de US2) para a regeneração do checklist a partir do dossiê
- **US4 (P2)**: sem dependência de nenhuma outra story — motor puro, testável isoladamente
- **US5 (P3)**: depende de `tools_mobility.py` (T022, de US2) e de `tools.py` de checklist (T029, de US3) apenas para `get_trip_readiness`; `log_trip_expense` em si depende só de `set_trip_budget`/`get_trip_budget` (T039, da própria US5)

### Parallel Opportunities

- Setup: T002, T003, T004, T005 em paralelo entre si (após T001 para T002/T003, mas T004/T005 são independentes de T001)
- Foundational: T008, T009 em paralelo entre si e com T007
- US1: T013/T014 em paralelo; T017/T018/T020 em paralelo entre si
- US2: T025/T026 em paralelo
- US3: T031/T032 em paralelo
- US4: T034/T035 em paralelo; T037 em paralelo com T036
- US5: T039 pode começar em paralelo com o fim de US2/US3; T044/T045 em paralelo
- Polish: T048–T055, T057 todos em paralelo entre si (arquivos de documentação/hub distintos)
- **Entre stories**: depois da Foundational, US1, US2 e US4 podem ser tocadas em paralelo por
  desenvolvedores diferentes (nenhuma depende das outras); US3 e US5 entram depois por causa da
  dependência em `tools_mobility.py`

---

## Parallel Example: User Story 1

```bash
# Tools da viagem e do roteiro, em arquivos/funções independentes:
Task: "create_trip, list_trips, get_trip, update_trip, resolve_trip_orphans em agents/yato/tools.py"
Task: "add_itinerary_item, list_itinerary, update_itinerary_item, delete_itinerary_item em agents/yato/tools.py"

# Depois que a API do frontend e os componentes existem, telas e modais em paralelo:
Task: "yatoApi.ts — métodos de viagens e roteiro"
Task: "components/TripCard.tsx, DayColumn.tsx, ItineraryItem.tsx"
Task: "modals/NewTripModal.tsx, NewItemModal.tsx"
```

---

## Implementation Strategy

### MVP First

A spec marca **duas** user stories como P1 (US1 e US2) — o motivo de existir do agente (dossiê de
mobilidade) é tão essencial quanto o catálogo de viagens. MVP recomendado:

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloqueia tudo)
3. Completar Phase 3: US1 (roteiro) — **STOP e validar** independentemente
4. Completar Phase 4: US2 (dossiê) — **STOP e validar** independentemente
5. Nesse ponto já existe um MVP demonstrável: criar viagem + montar roteiro + rodar o protocolo de
   mobilidade

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → testar isoladamente → demo (roteiro funcionando)
3. US2 → testar isoladamente → demo (dossiê funcionando) — **MVP completo**
4. US3 → testar isoladamente → demo (checklist)
5. US4 → testar isoladamente → demo (matriz de conforto, pode ser feita a qualquer momento)
6. US5 → testar isoladamente → demo (orçamento + Nami)
7. Polish → hub, documentação, validação final via `quickstart.md`

### Parallel Team Strategy

Com múltiplos desenvolvedores, após a Foundational:
- Dev A: US1 (roteiro)
- Dev B: US2 (dossiê) — em paralelo, sem conflito de arquivo com US1 exceto `toolset.py`/`agent.py`
  (seções distintas da instrução, merge simples)
- Dev C: US4 (motor puro, zero dependência) pode começar a qualquer momento
- US3 e US5 entram depois, quando US2 (e US3, no caso de US5) estiverem prontas

---

## Notes

- `[P]` = arquivos diferentes, sem dependência entre as tarefas
- `[Story]` mapeia a tarefa à user story correspondente do `spec.md`, para rastreabilidade
- Cada user story deve ser completável e testável de forma independente (ver "Independent Test" em
  cada fase, herdado do `spec.md`)
- Consultar `quickstart.md` para o roteiro de validação manual de cada story
- Consultar `contracts/api-travel.md` e `contracts/tools-yato.md` para os contratos exatos de
  endpoint/tool citados em cada tarefa
- Parar em qualquer checkpoint para validar a story isoladamente antes de seguir
- Evitar: tarefas vagas, conflito no mesmo arquivo entre tarefas `[P]`, dependências entre stories
  que quebrem a independência (a única exceção documentada é US3/US5 → `tools_mobility.py` de US2)
