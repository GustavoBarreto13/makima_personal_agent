# Tasks: Pessoas — identidade canônica integrada a todos os agentes

**Input**: Design documents from `/specs/014-pessoas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos onde a spec exige verificação automatizada (SC-001 alias, SC-002 unicidade,
SC-003 atomicidade, SC-004 múltiplas pessoas, SC-005 agregação) e no padrão existente do repo
(`tests/agents/test_kaguya_tasks.py`).

**Organization**: agrupado por user story (US1–US3 da spec), em **ondas** na ordem de dependência;
cada user story é independentemente testável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência entre si)
- **[Story]**: a user story a que a tarefa pertence (US1/US2/US3)

---

## Phase 1: Setup

**Purpose**: schema novo no banco — pré-requisito físico de tudo.

- [ ] T001 Criar `agents/komi/__init__.py` (docstring de pacote) e `agents/komi/schema_pg.sql` com as 4 tabelas de `data-model.md` (`people`, `person_aliases`, `person_dates`, `person_links`), índices e constraints — incluindo o **índice único parcial** `CREATE UNIQUE INDEX idx_people_normalizado_vivo ON people (normalizado) WHERE deleted = FALSE`, o único global `idx_alias_normalizado ON person_aliases (normalizado)`, o `CHECK (entity_type IN ('transaction','task','book','journal_bullet'))` e `CONSTRAINT uq_person_link UNIQUE (person_id, entity_type, entity_id)`; FKs reais com `ON DELETE CASCADE` em aliases/dates/links → `people`; tudo idempotente (`IF NOT EXISTS`), no padrão de `agents/nami/schema_pg.sql`
- [ ] T002 Registrar `agents/komi/schema_pg.sql` em `scripts/setup_schemas.py` (`SCHEMA_FILES +=`); aplicar **de dentro do container** `makima-web` (`docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"` — o hostname do Postgres é serviço Docker Swarm, não resolve no host) e conferir `\dt` (4 tabelas) + `\d+ people` (índice parcial único presente)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a camada de lógica única (FR-015) — os dois canais (Telegram e webapp) são fachadas
sobre ela; nenhuma user story funciona sem isso.

**⚠️ CRITICAL**: nenhuma story começa antes desta fase terminar.

- [ ] T003 Criar `agents/komi/tools.py` sobre `agents/db.py`, conforme `contracts/komi-tools.md`: helper `_norm` (NFD minúsculo + sem acento, no estilo `_norm` de Frieren); CRUD `create_person`, `update_person` (recalcula `normalizado` se `name` mudar; toca `updated_at`), `delete_person` (soft delete `deleted=TRUE`), `add_alias` (erro claro se o apelido já pertence a outra pessoa — único global), `add_important_date` (`date` em `YYYY-MM-DD`), `list_people` (vivas, com `link_count`); `find_people(query)` (UNION `people.normalizado` + `person_aliases.normalizado`, só vivas, retorna `matches` 0/1/2+); `get_person` (perfil + aliases + próximas datas). Helpers transacionais `create_person_on_cursor(cur, ...)` e `link_person_on_cursor(cur, person_id, entity_type, entity_id)` (`INSERT ... ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING`, `entity_id` coagido a `str`). Todas retornam `{"status": "ok"|"error", "message": ...}`; type hints + docstring Google Style obrigatórios
- [ ] T004 Criar `tests/agents/test_komi.py` (molde `tests/agents/test_kaguya_tasks.py`: skip do módulo sem `DATABASE_URL`; fixture dropa+recria as tabelas a partir do `.sql`): criar pessoa com apelido e resolver por ele — `find_people("aninha")` → "Ana Silva" (**SC-001**); cadastrar "Ana" e "aná" → **1** linha viva em `people` (**SC-002**, índice único parcial); soft delete some das buscas preservando histórico; reusar apelido de outra pessoa → erro; `find_people("ana")` com duas Anas → **2** matches; rodar `python -m pytest tests/agents/test_komi.py -v`

**Checkpoint**: camada de lógica completa e testada — US1, US2 e US3 podem começar.

---

## Phase 3: User Story 1 - Identidade canônica + agente Komi (Priority: P1) 🎯

**Goal**: agenda de contatos conversacional — cadastrar/buscar/editar pessoa e pedir o resumo do
perfil pelo Telegram, com smart-match que nunca duplica em silêncio.

**Independent Test**: contra um banco com `schema_pg.sql` aplicado, criar uma pessoa com apelido e
data pelo Telegram; resolver por alias; criar uma segunda "Ana" e confirmar gatilho de
desambiguação (quickstart §3).

### Implementation for User Story 1

- [ ] T005 [US1] Criar `agents/komi/agent.py` — `komi_agent` **singleton sem MCP** (Agent ADK, `gemini-2.5-flash`, padrão Nami/Frieren — research R5), registrando as tools de T003 conforme `contracts/komi-tools.md`; `_INSTRUCTION` em pt-BR com **smart-match + confirmar** (eco da interpretação; 0 matches → oferece criar; 1 → usa direto; 2+ → pergunta qual antes de qualquer vínculo — FR-007), personalidade Komi-san (`Komi-san wa Comyushou desu`), erros sem stacktrace, formatação HTML
- [ ] T006 [US1] `coordinator/agent.py`: importar `komi_agent`, `sub_agents += komi`, atualizar `_MAKIMA_INSTRUCTION` com o novo especialista de pessoas/contatos/relacionamentos (FR-006); `coordinator/main.py`: `_DOMAINS += "pessoas"` e keywords do domínio em `_classify_domain()`
- [ ] T007 [US1] Validar `quickstart.md` §3 (Telegram: criar "Ana Silva, amiga, aniversário 12/03, instagram @anasilva"; apelido "Aninha"; resolver; resumo sem vínculos; desambiguação com "Ana Costa"; excluir por soft delete)

**Checkpoint**: agenda de contatos conversacional viva e independente (entrega valor sozinha).

---

## Phase 4: User Story 2 - Vincular pessoas a itens dos outros agentes (Priority: P2)

**Goal**: citar uma pessoa ao falar com Nami/Kaguya/Frieren/diário vincula o item a ela —
atomicamente, inclusive com múltiplas pessoas por item.

**Independent Test**: criar transação na Nami passando `person_ids` e confirmar o `person_links`
na **mesma** transação SQL; repetir para task e bullet com **duas** pessoas; forçar erro no passo
do vínculo e confirmar rollback total (quickstart §4).

### Implementation for User Story 2

- [ ] T008 [P] [US2] Nami (`agents/nami/tools.py`): `create_transaction` / `create_transaction_on_cursor` ganham `person_ids` opcional e chamam `link_person_on_cursor` no **mesmo cursor** do INSERT (`entity_type='transaction'`, `entity_id` = UUID da transação) — padrão atômico de `complete_payment_task` (research R2; FR-009)
- [ ] T009 [P] [US2] Kaguya (`agents/kaguya/tools_tasks.py`): `create_task` ganha `person_ids` opcional e grava os links no mesmo cursor (`entity_type='task'`, `entity_id = str(task_id)` — SERIAL)
- [ ] T010 [P] [US2] Frieren (`agents/frieren/tools.py`): `add_book` ganha `person_ids` opcional e grava os links no mesmo cursor (`entity_type='book'`, `entity_id` = UUID do livro)
- [ ] T011 [US2] Journal (`agents/journal/tools.py`): refatorar `upsert_bullet` (research R3) para gravar `person_links` **na mesma transação** que insere o bullet e re-sincroniza `journal_mentions` (hoje a função commita internamente) — aceitar `person_ids` explícito **e** auto-linkar `@menções` **apenas em match único exato** via `find_people` (0 ou 2+ → nenhum link, sem erro); `journal_mentions` denormalizada permanece intacta (FR-011); `entity_type='journal_bullet'`, `entity_id = str(bullet_id)`
- [ ] T012 [US2] Criar `tests/agents/test_komi_links.py` (mesmo molde de T004): forçar falha no passo do vínculo → **0** linhas novas em `transactions` **e** `person_links` (**SC-003**, rollback total); "jantar com a Ana e o Bruno" → exatamente **2** `person_links` p/ o mesmo `entity_id` (**SC-004**); citar a mesma pessoa 2× → 1 só link (`ON CONFLICT DO NOTHING`); auto-link de diário só em match único; recusar criar pessoa **não** bloqueia a criação do item-pai (FR-010); rodar pytest
- [ ] T013 [US2] Validar `quickstart.md` §4 (Nami + novo; Kaguya + existente; item dividido; diário com/sem pessoa cadastrada; recusa; idempotência)

**Checkpoint**: a identidade permeia finanças, tarefas, livros e diário — atomicamente.

---

## Phase 5: User Story 3 - Página da pessoa: resumo num lugar só (Priority: P3)

**Goal**: hub de agregação + seção Pessoas no webapp — grid → página da pessoa (Dashboard de 4
cards) + modal CRUD, paritária com o canal Telegram.

**Independent Test**: com uma pessoa que tem vínculo nos 4 domínios, `GET /api/pessoas/{id}` traz
os 4 blocos populados; abrir a página no webapp e ver os 4 cards; criar/editar pela modal e ver
persistir (quickstart §5).

### Implementation for User Story 3

- [ ] T014 [US3] Adicionar `get_person_summary(person_id)` a `agents/komi/tools.py` (research R6 / `data-model.md`): uma query por domínio (sem N+1), cast por `entity_type` (`entity_id::int` p/ task/journal_bullet; comparação direta p/ os UUID-TEXT de Nami/Frieren), estrutura única `{perfil, financas, tarefas, diario, livros}`, cada bloco vazio resolve sem erro (**SC-005**), ignora vínculos órfãos; cobrir o SC-005 (4 blocos cheios / 4 vazios) em `tests/agents/test_komi_links.py`
- [ ] T015 [US3] Criar `webapp/backend/routers/pessoas.py` (molde `webapp/backend/routers/tasks.py`) envelopando as tools de T003/T014 conforme `contracts/api-pessoas.md`: os 7 endpoints (GET lista, POST cria, GET `{id}` resumo, PATCH edita, DELETE soft, POST `{id}/aliases`, POST `{id}/dates`), todos com `Depends(require_user)`, bodies Pydantic, `_check_result` **só** em mutações; registrar em `webapp/backend/main.py` com `prefix="/api/pessoas"`
- [ ] T016 [P] [US3] Fundação do shell `webapp/frontend/src/pages/komi/` (padrão `pages/kaguya`, `pages/violet`): `komi.css` (tokens OKLCH escopados `.km-app`, acento **lavanda/roxo** suave, temas claro/escuro), `types.ts` (`Person`, `PersonSummary`, `PersonDate`, `Alias` — espelhando `contracts/api-pessoas.md`), `komiApi.ts` (objeto API dos 7 endpoints sobre `lib/api.ts`, nunca `fetch` cru)
- [ ] T017 [US3] Criar `webapp/frontend/src/pages/komi/KomiShell.tsx` (navegação interna por estado `{view:'grid'|'person', id?}`; gerencia o modal); registrar rota `/komi/*` em `webapp/frontend/src/App.tsx` (antes do catch-all) e a entrada "Pessoas" na sidebar global (`components/Layout.tsx`, acento lavanda)
- [ ] T018 [US3] Criar `pages/komi/screens/GridScreen.tsx` (grid de cards: avatar/iniciais, relationship, `link_count`) + `screens/PersonScreen.tsx` (cabeçalho de perfil — avatar, relacionamento, aniversário, contatos — + 4 cards Finanças/Tarefas/Diário/Livros, com **estados vazios** visíveis quando sem vínculo — SC-006), consumindo `get_person_summary` via `komiApi`
- [ ] T019 [P] [US3] Criar `pages/komi/modals/PersonModal.tsx` (criar/editar: nome, contatos, apelidos e datas; re-fetch após salvar)
- [ ] T020 [US3] Validar `quickstart.md` §5: `curl /api/pessoas/` sem cookie → **401/403** (SC-005 c5); grid com avatar/iniciais; página cheia (4 cards populados); página vazia (4 cards vazios sem erro); modal cria/edita e persiste ao reabrir; `GET /api/pessoas/{id}` direto traz os 4 blocos; `npm run build` sem erros

**Checkpoint**: todas as user stories funcionais — paridade de canais auditável (quickstart §6).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Criar `agents/komi/CLAUDE.md` (padrão dos outros agentes): tabela de tools, schema das 4 tabelas, smart-match, integração cross-agent (`link_person_on_cursor`), personalidade Komi-san
- [ ] T022 [P] Atualizar `CLAUDE.md` raiz: tabela de agentes (+ Komi → Pessoas/PostgreSQL), árvore de arquivos (`agents/komi/`, `webapp/backend/routers/pessoas.py`, `pages/komi/`), seção de integração cross-agent; anotar o parâmetro `person_ids` nos `CLAUDE.md` de Nami/Kaguya/Frieren/Journal (no padrão de `complete_payment_task`)
- [ ] T023 [P] Nota de governança (não bloqueante): registrar `komi → pessoas` como atualização factual da constitution (`.specify/memory/constitution.md`) elegível a um PATCH bump futuro (Complexity Tracking do `plan.md`) — tarefa de housekeeping, não pré-requisito
- [ ] T024 Rodar a validação completa do `quickstart.md` (§1–6) + a suíte pytest inteira; marcar a Definition of Done da spec
- [ ] T025 Refletir a mudança no vault do Obsidian (skill `obsidian-wiki`): novo agente Komi, tabela `person_links` polimórfica, nota de deploy (`scripts.setup_schemas` no container `makima-web`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → bloqueia tudo.
- **US1, US2 e US3** dependem da Foundational (T003). US1 e US2 são independentes entre si (agente/
  coordinator × tools dos outros agentes — sem arquivos em comum) e podem rodar em paralelo após T004.
- **US3** depende da Foundational (T003) para o webapp e de T014 (`get_person_summary`) para a
  `PersonScreen` e o `GET /{id}`. Os **dados ricos** dos cards (SC-005 com 4 blocos cheios) só
  aparecem depois dos vínculos da US2 — mas a estrutura (US3) é construível e testável (estados
  vazios) sem a US2 pronta.
- **Polish** depende de todas.

### Parallel Opportunities

- US1 ∥ US2 inteiras (após a Foundational).
- T008 ∥ T009 ∥ T010 (arquivos distintos da Onda 2: Nami × Kaguya × Frieren).
- T016 ∥ T019 dentro da US3 (CSS/types/api × modal).
- T021 ∥ T022 ∥ T023 no Polish.

## Implementation Strategy

**Incremental por ondas**: Setup + Foundational → US1 (agenda conversacional, já deployável) →
US2 (vínculos cross-agent atômicos) → US3 (hub + webapp) → Polish. Cada checkpoint é deployável e
mapeia uma user story independente da spec.

**Total**: 25 tasks — Setup 2 · Foundational 2 · US1 3 · US2 6 · US3 7 · Polish 5.
