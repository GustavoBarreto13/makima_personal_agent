# Tasks: Datas e Recorrência — Fase 2 (fatia 012)

**Input**: Design documents from `/specs/012-tasks-recurrence/`

**Prerequisites**: plan.md, spec.md, research.md (tabela-verdade dos 9 edge cases), data-model.md,
contracts/, quickstart.md. Schema da Fase 1 já aplicado (sem migração).

**Tests**: o motor de recorrência é o **gate** da fatia (SC-001 ≡ SC-004 da master) — testes
automatizados obrigatórios para os 9 edge cases. Router via FastAPI TestClient (padrão do repo).

**Organization**: agrupado por user story (US1–US4 da spec). A camada pura (`recurrence.py`) é
Foundational e bloqueia todas as stories.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: dependência de RRULE.

- [x] T001 Adicionar `python-dateutil` ao `requirements.txt` e instalar na `.venv`; confirmar `from dateutil.rrule import rrulestr` (research D1)

---

## Phase 2: Foundational (Blocking Prerequisites) — o motor puro

**Purpose**: toda a matemática de recorrência isolada e testável sem banco (research D3). É onde os 9
edge cases vivem ou morrem.

**⚠️ CRITICAL**: nenhuma user story de geração começa antes do gate (T003) verde.

- [x] T002 Criar `agents/kaguya/recurrence.py`: `next_occurrence(rrule, anchor_date, mode, *, current_due, completed_on) -> date | None` (modos `fixed` e `after_completion` exatamente como na tabela-verdade do `research.md`), `build_rrule(freq, interval=1, weekday=None, monthday=None) -> str` e `describe_rrule(rrule) -> str` (pt-BR), com docstrings Google-style e a tabela-verdade citada
- [x] T003 Criar `tests/agents/test_kaguya_recurrence.py` — parte pura: um teste por linha da tabela-verdade (reagendar+completar, adiantado, atrasado mensal/diário, `after_completion`, série esgotada `COUNT`/`UNTIL`, aniversário anual) + `build_rrule`/`describe_rrule`; rodar `pytest tests/agents/test_kaguya_recurrence.py -v` **verde** (gate SC-001)

**Checkpoint**: motor puro provado contra os 9 edge cases — pode integrar com o banco.

---

## Phase 3: User Story 1 - Recorrente que se regenera ao concluir (Priority: P1) 🎯

**Goal**: concluir/excluir uma recorrente gera (ou não) a próxima ocorrência preservando histórico —
o modelo "completar-e-gerar" (research D2).

**Independent Test**: quickstart V2/V3 — uma ocorrência viva por série, histórico íntegro.

- [x] T004 [US1] Estender `agents/kaguya/tools_tasks.py`: `set_recurrence(task_id, rrule, mode)` / `clear_recurrence(task_id)` (exigem `due_date`; upsert em `task_recurrences` com `anchor_date=due_date`); `recurrence` opcional em `create_task`/`update_task`; helper `_generate_next_occurrence(cur, task_id)` que aplica `next_occurrence`, cria a nova linha (herda campos, **reseta subtarefas** — edge 6) e realoca `task_recurrences.task_id`
- [x] T005 [US1] Integrar a geração em `_complete_task_on_cursor`/`complete_task` (param `end_series=False`): ao concluir uma recorrente ativa sem `end_series` → gera a próxima (retorna `generated_task_id`/`next_due_date`); com `end_series=True` ou `next=None` → `active=FALSE`, sem gerar. Estender `delete_task(task_id, scope="this")` (`this` gera a próxima; `series` desativa a regra) — mesma transação
- [x] T006 [US1] Adicionar a `tests/agents/test_kaguya_recurrence.py` os testes de **integração** (Postgres descartável, skip sem `DATABASE_URL`): concluir gera uma linha viva na data certa (V2); 3 conclusões → 3 consumidas + 1 viva (V3); subtarefas resetam; `end_series` não gera e desativa; excluir `this`/`series`; editar regra com ocorrência aberta mantém o `due_date` (edge 8)

**Checkpoint**: recorrência funciona ponta-a-ponta na camada de lógica.

---

## Phase 4: User Story 2 - Agendar com data e hora por qualquer canal (Priority: P1)

**Goal**: dar data/hora por linguagem natural (Telegram) ou atalho determinístico (quick-add).

**Independent Test**: quickstart V4 (webapp) e V6 (Telegram).

- [x] T007 [P] [US2] Criar `webapp/frontend/src/lib/parseDate.ts` (research D4): `hoje`/`amanhã`/`depois de amanhã`, dias da semana (abreviados e por extenso) → próxima ocorrência futura, `próxima <dia>`, `DD/MM[/AAAA]`, hora (`9h`/`17:30`); devolve `{due_date, due_time, matchedRanges}`; hora órfã ignorada (fuso `America/Sao_Paulo`)
- [x] T008 [US2] Integrar datas no quick-add: estender `webapp/frontend/src/lib/parseTask.ts` para chamar `parseDate` e marcar o trecho com a classe `tok-date`; ajustar `components/QuickAdd.tsx`/ParseMirror e `kaguya.css` para o destaque; `#` permanece reservado para tags (não vira título quebrado — FR-012)
- [x] T009 [US2] Atualizar `agents/kaguya/agent.py` (`_INSTRUCTION`): interpretar datas em pt-BR, **ecoar a interpretação** assumida e resolver ambiguidade ("sexta") para a próxima ocorrência futura (FR-011) — sem ferramenta nova (research D5)

**Checkpoint**: datas capturáveis e ecoadas pelos dois canais.

---

## Phase 5: User Story 3 - Aniversários anuais (Priority: P2)

**Goal**: `type=birthday` recorre todo ano pelo mesmo motor.

**Independent Test**: quickstart V7.

- [x] T010 [US3] Em `create_task` (e `update_task` ao mudar `type`), quando `type="birthday"` + `due_date`, configurar automaticamente `recurrence = build_rrule(freq="YEARLY")`, modo `fixed`, âncora=`due_date` (research D6); adicionar o caso ao `test_kaguya_recurrence.py` (cria → regra anual; conclui → ano seguinte)

**Checkpoint**: aniversários se mantêm sozinhos.

---

## Phase 6: User Story 4 - Gerir a vida de uma série recorrente (Priority: P2)

**Goal**: editar regra, encerrar série, excluir escopado — pelos dois canais (fachadas finas).

**Independent Test**: quickstart V5 (webapp) e V6 (Telegram).

- [x] T011 [US4] Threading no router `webapp/backend/routers/tasks.py` (contrato `api-tasks.md`): `recurrence`/`clear_recurrence` em create/update bodies; `end_series` em `POST /{id}/complete`; `scope` em `DELETE /{id}`; rotas `POST/DELETE /{id}/recurrence`; respostas de tarefa incluem `recurrence` + `recurrence_text`; estender `tests/test_tasks_router.py`
- [x] T012 [US4] Frontend `pages/kaguya`: `types.ts` (interface `Recurrence` + `recurrence?`/`recurrence_text?` em `Task`), `kaguyaApi.ts` (params novos + `setRecurrence`/`clearRecurrence`); `modals/TaskModal.tsx` ganha controle de recorrência (presets diária/semanal/mensal/anual + alternância `fixed`/`after_completion`) e botão "Concluir série"; `components/{TaskRow,TaskCard}.tsx` + `ui/Chips.tsx` exibem o glyph de recorrência (ícone `loop`) e o `recurrence_text`
- [x] T013 [US4] UX de exclusão de recorrente no webapp (em `TaskModal`/`ListScreen`): ao excluir uma tarefa com recorrência, perguntar "só esta ocorrência / a série inteira" e chamar `DELETE ?scope=`; e na instrução da Kaguya (`agent.py`), perguntar o escopo antes de `delete_task` e oferecer `complete_task(end_series=True)` (contrato `kaguya-tools.md`)

**Checkpoint**: ciclo de vida completo da série, paritário.

---

## Phase 7: Polish & Cross-Cutting

- [x] T014 [P] Atualizar `agents/kaguya/CLAUDE.md` (recorrência: modos, geração na conclusão, end_series, exclusão escopada; tools novas) e `webapp/CLAUDE.md` (nota de recorrência/datas no domínio Kaguya)
- [ ] T015 Rodar a validação do `quickstart.md` (V1–V8) + suíte pytest inteira (`tests/agents/test_kaguya_recurrence.py`, `tests/test_tasks_router.py`) + `npm run build`; registrar no checklist da spec
- [ ] T016 Refletir a fatia no vault do Obsidian (skill `obsidian-vault`): motor de recorrência, datas, semântica Todoist

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T003, gate)** → bloqueia geração.
- **US1 (T004–T006)** depende do gate. **US2 (T007–T009)** é largamente independente (datas já
  persistem desde a Fase 1; T007∥nada) e pode rodar em paralelo à US1, exceto que recorrência precisa
  de `due_date`. **US3 (T010)** depende de `build_rrule` (T002) + `create_task` (US1). **US4
  (T011–T013)** depende de US1 (lógica) para expor no router/UI.
- **Polish** depende de todas.

### Parallel Opportunities

- T007 (parseDate) ∥ T004/T005 (lógica de recorrência) — arquivos distintos (front × backend).
- T014 ∥ T015 setup de docs enquanto roda validação.

## Implementation Strategy

**Gate-first**: o motor puro (`recurrence.py` + seus testes) é a primeira coisa a ficar verde — os 9
edge cases são o maior risco. Só então integra com o banco (US1), expõe datas (US2), adiciona
aniversário (US3) e o ciclo de vida da série (US4). Cada fase é verificável isoladamente.

**Total**: 16 tasks — Setup 1 · Foundational 2 · US1 3 · US2 3 · US3 1 · US4 3 · Polish 3.
