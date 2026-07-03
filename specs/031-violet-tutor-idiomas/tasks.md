---
description: "Task list — Tutor de Idiomas na Violet (031)"
---

# Tasks: Tutor de Idiomas na Violet (Kurisu)

**Input**: Design documents from `specs/031-violet-tutor-idiomas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: apenas o **gate do motor puro** (convenção do projeto para módulos `*_strength`/`*_mastery`
puros). Nenhum outro teste automatizado foi solicitado — verificação via quickstart.md.

**Organization**: agrupadas por user story. MVP = User Story 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependências pendentes)
- **[Story]**: US1–US4 (mapeia as user stories da spec)

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Adicionar `google-genai` ao `requirements.txt` (linha explícita) e instalar na `.venv` do makima
- [X] T002 [P] Criar os módulos vazios `agents/kurisu/tutor_mastery.py` e `agents/kurisu/tutor.py` com docstrings de módulo (referenciando spec 031)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T003 Implementar o motor puro em `agents/kurisu/tutor_mastery.py`: `mastery(signals)` (EMA peso 0.3), `trend(signals)` (2 EMAs, `None` se <3 sinais), `summarize(signals)`, `estimate_cefr(recent_scores) -> {level, preliminary}`, `pick_next_focus(skills, guide_targets) -> {concept_slug, concept_label, reason}|None` — sem banco (espelha `agents/kaguya/habit_strength.py`)
- [X] T004 [P] Escrever o gate do motor puro em `tests/agents/test_kurisu_tutor_mastery.py`: EMA sobe com acertos / cai suave com erros; tendência up/down/flat e oculta com <3; faixas CEFR + selo `preliminary`; `pick_next_focus` prioriza alvos do guia e depois menor maestria
- [X] T005 Em `agents/kurisu/tutor.py`: constante `CONCEPTS_EN` (lista canônica ~20–30 slugs + rótulos PT-BR) e `_ensure_tutor_tables()` criando as 4 tabelas `journal_tutor_{analyses,events,skills,guides}` conforme `data-model.md` (idempotente, chamado na importação)

**Checkpoint**: motor puro verde + tabelas criadas — as user stories podem começar.

---

## Phase 3: User Story 1 - Analisar e corrigir a escrita de um bullet (Priority: P1) 🎯 MVP

**Goal**: acionar a análise de um bullet e ver correção + reescrita natural + erros por conceito + resumo + nota num modal, com o resultado persistido.

**Independent Test**: escrever um bullet em inglês com erros, acionar a análise e conferir o modal com todos os campos; verificar as 3 tabelas populadas.

- [X] T006 [US1] Em `agents/kurisu/tutor.py`: `_TUTOR_SCHEMA` (response_schema) + `_build_prompt(text, language, guide=None)` (persona Kurisu, injeta `CONCEPTS_EN`; `guide` opcional no-op nesta fase) + `_call_gemini(prompt)` one-shot com `google-genai` (JSON validado)
- [X] T007 [US1] Em `agents/kurisu/tutor.py`: `analisar_escrita(bullet_id, language='en')` transacional — lê `journal_bullets.content`, chama o Gemini, insere `journal_tutor_analyses` (+ `natural_rewrite`), insere `journal_tutor_events` por conceito (erro→false / correto→true; slug fora de `CONCEPTS_EN` → `outros`) e faz UPSERT em `journal_tutor_skills` recomputando `mastery`/`trend` via `tutor_mastery`; falha do Gemini → `{status:'error'}` sem gravar nada
- [X] T008 [US1] Em `webapp/backend/routers/journal.py`: endpoint `POST /api/journal/bullets/{id}/tutor` (body `{language}`, `Depends(require_user)`, `_check_result`) → `analisar_escrita`
- [X] T009 [P] [US1] Em `webapp/frontend/src/lib/api.ts` e `webapp/frontend/src/pages/violet/types.ts`: método `violetApi.analyzeTutor(bulletId, language)` + tipos `TutorAnalysis`/`TutorError`
- [X] T010 [P] [US1] Criar `webapp/frontend/src/pages/violet/components/TutorModal.tsx`: painel com texto original vs corrigido, reescrita natural, lista de erros (conceito + explicação), resumo (voz Kurisu) e nota (segue o visual de `EmotionLog.tsx`/`LetterLog.tsx`)
- [X] T011 [US1] Em `webapp/frontend/src/pages/violet/screens/Write.tsx`: botão discreto no bullet (hover, na área `.b-mark`/ações) que chama `analyzeTutor(b.id,'en')` e abre o `TutorModal`; estado de carregando + erro amigável

**Checkpoint**: US1 funcional e testável isoladamente (MVP).

---

## Phase 4: User Story 2 - Alternar entre original e corrigido no bullet (Priority: P2)

**Goal**: bullets já analisados exibem um toggle discreto (original ↔ corrigido) que persiste entre sessões; o texto original nunca é sobrescrito.

**Independent Test**: após analisar, recarregar o diário e confirmar que o toggle aparece, alterna, e o registro salvo continua o texto original.

- [X] T012 [US2] Em `agents/kurisu/tutor.py`: `get_bullet_analysis(bullet_id)` (última análise) e `get_bullets_tutor_meta(bullet_ids) -> {bullet_id: {analysis_id, has_correction, error_count}}` (1 query agregada)
- [X] T013 [US2] Em `webapp/backend/routers/journal.py`: endpoint `GET /api/journal/bullets/{id}/tutor` + compor o campo `tutor` (nullable) em cada bullet do `GET /api/journal/page` via `get_bullets_tutor_meta` (sem alterar `agents/journal/get_or_create_page`)
- [X] T014 [P] [US2] Em `webapp/frontend/src/lib/api.ts` e `types.ts`: `violetApi.bulletAnalysis(bulletId)` + campo `tutor?: {...}` no tipo `Bullet`
- [X] T015 [US2] Em `webapp/frontend/src/pages/violet/screens/Write.tsx`: quando `b.tutor?.has_correction`, exibir toggle inline original↔corrigido (busca `corrected_text` sob demanda via `bulletAnalysis`); garantir que o conteúdo salvo do bullet permanece o original

**Checkpoint**: US1 + US2 funcionam de forma independente.

---

## Phase 5: User Story 3 - Acompanhar a evolução por conceito (Priority: P2)

**Goal**: tela de progresso com skills (maestria + tendência + selo "poucos dados"), nível CEFR estimado, sugestão de próximo foco e histórico de análises.

**Independent Test**: após várias análises, abrir a tela e ver a maestria de um conceito subir + tendência refletir a melhora; ver o nível CEFR e a sugestão de foco.

- [X] T016 [US3] Em `agents/kurisu/tutor.py`: `list_skills(language)`, `list_analyses(language, limit=20)` e `get_progress(language)` (compõe skills + `estimate_cefr` + `pick_next_focus` + guia ativo → payload do contrato)
- [X] T017 [US3] Em `webapp/backend/routers/journal.py`: endpoints `GET /api/journal/tutor/progress`, `GET /api/journal/tutor/analyses`, `GET /api/journal/tutor/concepts` (leituras diretas, sem `_check_result`)
- [X] T018 [P] [US3] Em `webapp/frontend/src/lib/api.ts` e `types.ts`: `tutorProgress`/`tutorAnalyses`/`tutorConcepts` + tipos `TutorSkill`/`TutorProgress`/`TutorConcept`
- [X] T019 [US3] Criar `webapp/frontend/src/pages/violet/screens/Tutor.tsx`: lista de skills (barra de maestria + glyph 📈/📉/➡️ + selo "poucos dados" quando `!enough_data`), bloco de nível CEFR (com marca de preliminar), sugestão de próximo foco e histórico recente; estado vazio quando sem análises
- [X] T020 [US3] Em `webapp/frontend/src/pages/violet/VioletShell.tsx`: adicionar item de sidebar "Tutor" + rota interna renderizando `Tutor.tsx`

**Checkpoint**: US1 + US2 + US3 independentes e funcionais.

---

## Phase 6: User Story 4 - Guiar o aprendizado por livro/método/conceito (Priority: P2)

**Goal**: um guia de estudo ativo (texto livre + conceitos-alvo) orienta as análises e destaca os alvos na tela de progresso; editar/remover só afeta análises futuras.

**Independent Test**: definir um guia com conceito-alvo, analisar bullets e confirmar ênfase no foco + destaque na tela; remover o guia e ver o retorno ao comportamento geral.

- [X] T021 [US4] Em `agents/kurisu/tutor.py`: `get_active_guide(language)`, `set_active_guide(language, description, target_concepts)` (desativa o anterior + ativa o novo na mesma transação; valida slugs contra `CONCEPTS_EN`), `deactivate_guide(language)`; passar o guia ativo ao `_build_prompt` (T006) e marcar `is_target` no `get_progress` (T016)
- [X] T022 [US4] Em `webapp/backend/routers/journal.py`: endpoints `GET/PUT/DELETE /api/journal/tutor/guide` (PUT/DELETE com `_check_result`; GET direto)
- [X] T023 [P] [US4] Em `webapp/frontend/src/lib/api.ts` e `types.ts`: `getTutorGuide`/`saveTutorGuide`/`deleteTutorGuide` + tipo `TutorGuide`
- [X] T024 [US4] Em `webapp/frontend/src/pages/violet/screens/Tutor.tsx`: bloco de gestão do guia (descrição + seleção de conceitos-alvo via `tutorConcepts`) e destaque/filtro dos alvos na lista de skills

**Checkpoint**: as 4 user stories funcionam de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 [P] Atualizar `agents/kurisu/CLAUDE.md`: documentar o tutor (tools, tabelas, motor puro, chamada Gemini one-shot) e o acoplamento cross-domain (FK para `journal_bullets`)
- [X] T026 [P] Atualizar `docs/referencia/POSTGRES.md` (4 tabelas `journal_tutor_*`, coluna a coluna) e `ROADMAP.md` (fase 031 entregue)
- [X] T027 [P] Atualizar `webapp/CLAUDE.md` (endpoints `/api/journal/tutor/*` na tabela do Journal) e `webapp/docs/API.md`/`FRONTEND.md` (tela Tutor)
- [X] T028 Executar a validação do `quickstart.md` ponta a ponta (motor puro → backend → API → frontend) e confirmar UTC-3 / `Depends(require_user)` / CASCADE na exclusão de bullet — *validado no sandbox de implementação: pytest do motor puro (17/17), import do app FastAPI completo com as 8 rotas do tutor no OpenAPI, `tsc --noEmit` e `npm run build` do frontend sem erros, `Depends(require_user)` confirmado nas 8 rotas, `ON DELETE CASCADE` confirmado nas 2 FKs. Passos 2–3 do quickstart (chamada real ao Gemini/Postgres) exigem `GEMINI_API_KEY`/`DATABASE_URL` reais — não disponíveis neste sandbox; recomenda-se rodar esses dois passos manualmente no ambiente com as credenciais antes de considerar a fase 100% fechada.*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → sem dependências.
- **Foundational (P2)** → depende do Setup; **bloqueia** todas as user stories.
- **User Stories (P3–P6)** → todas dependem da Foundational.
  - US1 (MVP) primeiro. US2/US3/US4 podem seguir em paralelo após a Foundational, mas:
    - US2 e US3 só produzem dados visíveis **depois** de existir ao menos uma análise (US1) — o código é independente, o teste manual pressupõe US1.
    - US4 (T021) **estende** o `_build_prompt` (T006 de US1) e o `get_progress` (T016 de US3) — acréscimo aditivo; requer esses arquivos existentes.
- **Polish (P7)** → depois das user stories desejadas.

### Within Each User Story

- Motor puro/tabelas antes da lógica; lógica (`tutor.py`) antes dos endpoints; endpoints/tipos antes da UI.

### Parallel Opportunities

- T004 [P] roda junto de T003 (mesmo módulo/teste separado, cuidado de ordem — T004 valida T003).
- Nas user stories, as tarefas [P] de frontend (tipos/api) são independentes das de backend do mesmo story.
- T025/T026/T027 [P] (docs) são independentes entre si.

---

## Parallel Example: User Story 1

```text
# Após T007 (lógica) e T008 (endpoint), o front pode ir em paralelo:
Task T009: violetApi.analyzeTutor + tipos em lib/api.ts / types.ts
Task T010: TutorModal.tsx
# T011 (botão no Write.tsx) integra T009 + T010.
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational, com o gate T004 verde) → 3. Phase 3 (US1).
4. **PARAR e VALIDAR** US1 isolada (analisar um bullet → modal). 5. Demo.

### Incremental Delivery

Foundational → US1 (MVP) → US2 (toggle) → US3 (progresso + CEFR + foco) → US4 (guia). Cada story
agrega valor sem quebrar as anteriores.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente. [Story] mapeia rastreabilidade.
- Commit após cada task ou grupo lógico.
- Todo `/api/*` sob `Depends(require_user)`; datas em UTC-3; nunca sobrescrever o conteúdo original do bullet.
- Falha do Gemini nunca grava dado parcial (transação).
