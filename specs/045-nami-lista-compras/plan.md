# Implementation Plan: Lista de Compras — do item no Telegram à despesa lançada

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/045-nami-lista-compras/spec.md`

## Summary

Duas tabelas novas (`shopping_lists`, `shopping_list_items`) — entidade sem análogo
existente na Nami (nenhuma outra tabela tem "itens ordenados com estado de carrinho").
Módulo novo `agents/nami/tools_shopping.py` com tools nomeadas para uso natural pelo
Telegram (por `list_name`, resolvido por prefixo) e também aceitas por `list_id` (uso
direto do webapp) — uma implementação única serve as duas portas (FR de paridade
Telegram/webapp). "Finalizar compra" é atômico via `get_conn()`, mesmo padrão de
`create_transfer` (043) e `mark_subscription_paid` (044): cria a despesa
(`create_transaction_on_cursor`, categoria "Supermercado") + arquiva a lista com
`transaction_id` vinculado + abre uma nova lista ativa com o mesmo nome, tudo no mesmo
cursor. Frontend: tela nova `Shopping.tsx`, mobile-first (alvos de toque grandes, sem
sidebar de dados pesados), com quick-add, checkboxes, contador X/N, total estimado,
seção Frequentes e seletor de listas.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend)

**Primary Dependencies**: nenhuma nova — reaproveita `get_conn()`/ADK já existentes

**Storage**: PostgreSQL — 2 tabelas novas via `CREATE TABLE IF NOT EXISTS` em
`schema_pg.sql` (aplicadas por `scripts/setup_schemas.py`, não por
`migrate_nami_reforma.py` — esse script é só para `ALTER TABLE` incremental em tabelas
já existentes; tabelas novas entram direto no schema idempotente)

**Testing**: `npx tsc -b --force` + `npm run build`; import smoke-test do router e do
`agent.py` (`DATABASE_URL` fake + `GEMINI_API_KEY` fake)

**Constraints**: FR-005 exige atomicidade (despesa + arquivamento — tudo ou nada);
FR-003 exige paridade Telegram/webapp usando a mesma fonte de dados (SC-004).

**Scale/Scope**: 4 user stories (P1, P1, P1, P2) — a mais densa das specs QoL da Nami
até agora (3 P1 simultâneas), mas independente das demais (só requer a Nami base).

## Project Structure

```text
agents/nami/schema_pg.sql               # + shopping_lists, shopping_list_items

agents/nami/tools_shopping.py           # NOVO — create_shopping_list, list_shopping_lists,
                                         #   add_shopping_items, show_shopping_list,
                                         #   check_shopping_item, update_shopping_item,
                                         #   remove_shopping_item, get_frequent_items,
                                         #   finish_shopping (atômico)
agents/nami/agent.py                    # instrução "LISTA DE COMPRAS" + 9 tools novas
agents/nami/CLAUDE.md                   # tabela de tools + templates HTML

webapp/backend/routers/finances.py      # GET/POST /shopping-lists, GET /shopping-lists/{id},
                                         #   POST /shopping-lists/{id}/items,
                                         #   PATCH/DELETE /shopping-items/{item_id},
                                         #   POST /shopping-lists/{id}/finish,
                                         #   GET /shopping-lists/frequent

webapp/frontend/src/pages/nami/
├── namiApi.ts                  # getShoppingLists, createShoppingList, getShoppingList,
│                                #   addShoppingItems, updateShoppingItem, deleteShoppingItem,
│                                #   finishShopping, getFrequentItems
├── types.ts                    # ShoppingList, ShoppingItem, FrequentItem
├── screens/Shopping.tsx        # novo — mobile-first
└── NamiShell.tsx                # nova view 'lista-compras'

webapp/docs/API.md, webapp/CLAUDE.md, ROADMAP.md
```

## Constitution Check

Sem `.specify/memory/constitution.md`. Gate de fato: FR-005/SC-002 (finalizar é
atômico) — `finish_shopping` usa `get_conn()` (mesmo padrão de `create_transfer`).

## Decisões de escopo

1. **Duas tabelas novas, não reaproveitamento** — ao contrário da 044 (que reaproveitou
   `subscriptions`), aqui não há tabela existente com forma parecida; `shopping_list_items`
   introduz "ordem" e "checked" que nenhuma outra entidade da Nami tem.
2. **Tools aceitam `list_id` OU `list_name`** (id tem precedência) — evita duplicar lógica
   entre a via Telegram (nomes, resolvidos por prefixo via `_norm`, mesmo padrão de
   `_resolve_account`) e a via webapp (IDs, já carregados na tela). Ambiguidade de prefixo
   (2+ matches) retorna erro pedindo para especificar — mesmo contrato de erro das demais
   tools (`{"status": "error", "message": ...}`).
3. **Quantidade/unidade: parsing best-effort, não obrigatório** — `_parse_item_text()` extrai
   um token final que começa com dígito (ex.: "2kg", "3", "1,5 kg") como quantidade; o que
   não casar vira parte do nome inteiro (edge case da spec). Função pura, testável
   isoladamente.
4. **Duplicata ao readicionar de Frequentes**: se já existe item com o mesmo nome
   (case/acento-insensitive) não marcado na lista ativa, `add_shopping_items` não insere de
   novo — mantém comportamento único e simples (edge case "não duplica ou incrementa" —
   optamos por não duplicar, sem incrementar quantidade em texto livre, que não é seguro de
   somar automaticamente).
5. **Total estimado do carrinho = soma de `preco_estimado` dos itens marcados** (não
   multiplicado pela quantidade em texto livre — não dá para multiplicar "2kg" de forma
   confiável). `preco_estimado` é o preço esperado *daquele item* como um todo.
6. **Itens não marcados ao finalizar são movidos para a nova lista ativa** (resolve o edge
   case "mover vs. arquivar" deixado em aberto na spec, per nota do checklist) — comportamento
   mais útil: o que não foi comprado continua pendente na próxima ida ao mercado, sem exigir
   um segundo diálogo de decisão (mantém SC-002 "menos de 20 segundos").
7. **Após finalizar, uma nova lista ativa é criada automaticamente com o mesmo nome** (dentro
   da mesma transação atômica) — carrega os itens não marcados (decisão 6) e garante que
   "vê a lista ativa vazia (ou a próxima lista)" (AC2 da US3) funcione sem passo extra do
   usuário.
8. **Remoção de item ativo é exclusão real** (não soft-delete) — itens de listas ativas não
   têm valor de auditoria; o histórico útil (FR-007) vem dos itens de listas **arquivadas**,
   que nunca são apagados (lista arquivada é imutável, edge case da spec).
9. **Itens frequentes**: agregação em SQL sobre `shopping_list_items` cujas `list_id`
   pertencem a listas arquivadas, agrupando por nome normalizado, ordenado por contagem
   desc — não é entidade persistida (Key Entity da spec já deixa isso explícito).
