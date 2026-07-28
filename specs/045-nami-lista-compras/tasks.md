# Tasks: Lista de Compras — do item no Telegram à despesa lançada

**Input**: plan.md, spec.md · **Branch**: `master`

## Phase 1: Setup

- [X] T001 Adicionar `shopping_lists`/`shopping_list_items` a `agents/nami/schema_pg.sql`

## Phase 2: Foundational (backend)

- [X] T002 Criar `agents/nami/tools_shopping.py`: helpers `_norm`-based `_resolve_list()`,
      `_parse_item_text()` (puro), `create_shopping_list`, `list_shopping_lists`
- [X] T003 `add_shopping_items` (split por vírgula + parse de quantidade + dedupe por nome)
- [X] T004 `show_shopping_list`, `check_shopping_item`, `update_shopping_item`,
      `remove_shopping_item`
- [X] T005 `get_frequent_items` (agregação sobre listas arquivadas)
- [X] T006 `finish_shopping` — atômico via `get_conn()`: despesa (Supermercado) + arquiva +
      abre nova lista ativa carregando itens não marcados

## Phase 3: User Story 1 — Montar a lista ao longo da semana (P1)

- [X] T007 [US1] Registrar tools em `agents/nami/agent.py` (import + `tools=[...]`)
- [X] T008 [US1] Seção "LISTA DE COMPRAS" na instruction (classificação, resolução por
      prefixo, templates HTML de confirmação/listagem)
- [X] T009 [US1] `types.ts`: `ShoppingList`, `ShoppingItem`, `FrequentItem`
- [X] T010 [US1] `namiApi.ts`: `getShoppingLists`, `createShoppingList`, `getShoppingList`,
      `addShoppingItems`
- [X] T011 [US1] Endpoints `GET/POST /shopping-lists`, `GET /shopping-lists/{id}`,
      `POST /shopping-lists/{id}/items` em `finances.py`
- [X] T012 [US1] `screens/Shopping.tsx`: quick-add (Enter), fetch da lista ativa

## Phase 4: User Story 2 — Usar a lista no mercado (celular) (P1)

- [X] T013 [US2] `namiApi.ts`: `updateShoppingItem`, `deleteShoppingItem`
- [X] T014 [US2] Endpoints `PATCH/DELETE /shopping-items/{item_id}`
- [X] T015 [US2] `Shopping.tsx`: checkbox grande + strike-through, contador X/N, total
      estimado, remoção com 1 toque, CSS mobile-first em `nami.css`

## Phase 5: User Story 3 — Finalizar a compra e virar despesa (P1)

- [X] T016 [US3] `namiApi.ts`: `finishShopping`
- [X] T017 [US3] Endpoint `POST /shopping-lists/{id}/finish`
- [X] T018 [US3] `Shopping.tsx`: modal "Finalizar compra" (valor total + conta/cartão),
      validação de valor obrigatório, toast de confirmação

## Phase 6: User Story 4 — Itens frequentes e múltiplas listas (P2)

- [X] T019 [US4] `namiApi.ts`: `getFrequentItems`
- [X] T020 [US4] Endpoint `GET /shopping-lists/frequent`
- [X] T021 [US4] `Shopping.tsx`: seção Frequentes (re-add com 1 toque) + seletor de listas

## Phase 7: Polish

- [X] T022 `NamiShell.tsx`: nova view `lista-compras` (hash, título, ícone `cart`, nav)
- [X] T023 Verificação: `npx tsc -b --force`, `npm run build`, import smoke-test Python
- [X] T024 Docs: `agents/nami/CLAUDE.md`, `webapp/CLAUDE.md`, `webapp/docs/API.md`,
      `ROADMAP.md`, status do `spec.md`
