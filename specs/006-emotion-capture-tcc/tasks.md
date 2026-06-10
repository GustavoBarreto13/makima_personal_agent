---

description: "Task list — Registro Emocional (TCC)"
---

# Tasks: Registro Emocional (TCC)

**Input**: Design documents from `/specs/006-emotion-capture-tcc/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui.md, quickstart.md

**Tests**: O projeto não tem suíte automatizada (ver plan.md → Testing). Validação é manual via
`quickstart.md`. Nenhuma task de teste é gerada.

**Organization**: Tasks agrupadas por user story para entrega incremental e teste independente.

**Convenção de comentários (global)**: todo código novo segue o padrão do Gustavo — comentários
densos em português explicando o quê e o porquê; docstrings Google Style em toda função pública
Python; type hints obrigatórios. Isso vale para TODAS as tasks de implementação abaixo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: A qual user story a task pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Web app existente (ver plan.md → Project Structure):
- Backend tools: `agents/journal/tools.py`
- Backend router: `webapp/backend/routers/journal.py`
- Frontend: `webapp/frontend/src/lib/api.ts`, `webapp/frontend/src/pages/violet/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar contexto; nenhum init de projeto é necessário (repo existente).

- [ ] T001 Revisar `agents/journal/tools.py` (padrão `_get_conn`/`_ensure_tables`/RealDictCursor) e `webapp/backend/routers/journal.py` (padrão `_check_result` + Pydantic) para alinhar o estilo das novas tools/endpoints antes de implementar.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema das duas tabelas novas — bloqueia TODAS as user stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase.

- [ ] T002 Em `agents/journal/tools.py::_ensure_tables()`, adicionar a criação de `journal_emotions` (`CREATE TABLE IF NOT EXISTS` com `id`, `name`, `is_predefined`) + índice único `idx_emotions_name_lower` em `LOWER(name)`, conforme DDL em data-model.md.
- [ ] T003 Em `agents/journal/tools.py::_ensure_tables()`, adicionar o seed das 8 emoções base da TCC (alegria, tristeza, raiva, medo, ansiedade, culpa, vergonha, nojo) com `is_predefined=TRUE`, inserido apenas se `journal_emotions` estiver vazia (padrão do seed de `journal_types`). (depende de T002)
- [ ] T004 Em `agents/journal/tools.py::_ensure_tables()`, adicionar a criação de `journal_emotion_logs` (FK `page_id`→journal_pages ON DELETE CASCADE, FK `emotion_id`→journal_emotions, `intensity` SMALLINT CHECK 0–10, campos opcionais TEXT, `reappraised_intensity` SMALLINT CHECK 0–10 nullable, `created_at`) + índice `idx_emotion_logs_page`, conforme DDL. (depende de T002)
- [ ] T005 Verificar a criação idempotente: rodar `python -c "import agents.journal.tools"` (local) ou via container `makima-web` e confirmar via `list`/psql que as 2 tabelas e as 8 emoções base existem, sem erro em re-execução. (depende de T002, T003, T004)

**Checkpoint**: Schema pronto — user stories podem começar.

---

## Phase 3: User Story 1 — Registrar uma emoção do dia (Priority: P1) 🎯 MVP

**Goal**: Registrar, editar e excluir registros emocionais TCC na página do dia (emoção +
intensidade obrigatórias; demais campos opcionais e completáveis depois), com a lista base de
emoções já disponível.

**Independent Test**: Na tela Escrever de hoje, criar um registro (ansiedade/7 + situação),
recarregar e confirmar persistência; completar pensamento/resposta/reavaliação por edição; criar
um segundo registro no mesmo dia; excluir. (quickstart cenários 1 e 2)

### Backend — tools (`agents/journal/tools.py`)

- [ ] T006 [US1] Implementar `list_emotions() -> list` retornando `[{id, name, is_predefined}]` (predefinidas primeiro, depois custom por nome), com docstring Google Style.
- [ ] T007 [US1] Implementar `create_emotion_log(page_id, emotion_id, intensity, situation=None, automatic_thought=None, adaptive_response=None, reappraised_intensity=None) -> dict` retornando `{"status":"ok","log":{...}}` (created_at em ISO; FK violation → `{"status":"error",...}`).
- [ ] T008 [US1] Implementar `list_emotion_logs(page_id) -> list` com JOIN em `journal_emotions` para incluir `emotion_name`, ordenado por `created_at` ASC.
- [ ] T009 [US1] Implementar `update_emotion_log(log_id, **campos) -> dict` (atualização parcial dos campos opcionais + emotion_id/intensity), retornando o log atualizado ou erro se inexistente.
- [ ] T010 [US1] Implementar `delete_emotion_log(log_id) -> dict` (`{"status":"ok"}` / 404-like `{"status":"error"}` se rowcount 0).

### Backend — router (`webapp/backend/routers/journal.py`)

- [ ] T011 [US1] Adicionar imports das novas tools e os modelos Pydantic `CreateEmotionLogBody` e `UpdateEmotionLogBody` (intensidades com `Field(ge=0, le=10)`), conforme contracts/api.md.
- [ ] T012 [US1] Adicionar `GET /emotions` (retorna lista direto, **sem** `_check_result`) e `GET /emotion-logs?page_id=` (lista direto), ambos com `Depends(require_user)`.
- [ ] T013 [US1] Adicionar `POST /emotion-logs` (status 201, `_check_result`) com a validação de regra "`reappraised_intensity` exige `adaptive_response` não-vazia" (HTTP 400 se violada). (depende de T011)
- [ ] T014 [US1] Adicionar `PATCH /emotion-logs/{log_id}` (`_check_result` + mesma regra reavaliação↔resposta) e `DELETE /emotion-logs/{log_id}` (404 se inexistente). (depende de T011)

### Frontend — tipos e API

- [ ] T015 [P] [US1] Em `webapp/frontend/src/pages/violet/types.ts`, adicionar as interfaces `Emotion` e `EmotionLog` conforme contracts/ui.md.
- [ ] T016 [US1] Em `webapp/frontend/src/lib/api.ts`, adicionar ao `violetApi`: `listEmotions`, `emotionLogs(pageId)`, `createEmotionLog(body)`, `updateEmotionLog(id, body)`, `deleteEmotionLog(id)`. (usa T015)

### Frontend — UI

- [ ] T017 [US1] Criar `webapp/frontend/src/pages/violet/components/EmotionLog.tsx`: cartão de um registro (emoção + badge intensidade + horário + campos resumidos expansíveis + "intensidade após resposta") com ações editar/excluir, e o formulário criar/editar na ordem TCC (situação → emoção+intensidade → pensamento → resposta → reavaliação). Reavaliação desabilitada até a resposta adaptativa ter texto; salvar permitido só com emoção+intensidade; bloquear sem emoção. Seletor de emoção mostra as predefinidas (via `listEmotions`). (depende de T015, T016)
- [ ] T018 [US1] Integrar em `webapp/frontend/src/pages/violet/screens/Write.tsx`: seção de registro emocional abaixo do `.w-prompt` (estado vazio convidativo + lista de registros do dia via `emotionLogs(page.id)`), recarregando ao trocar de dia (padrão do `useEffect` por `effectiveDate`). (depende de T017)

**Checkpoint**: US1 funcional e testável — registro emocional completo na página do dia, com a
lista base de emoções.

---

## Phase 4: User Story 2 — Emoções predefinidas + próprias (Priority: P2)

**Goal**: Permitir criar emoções custom (dedupe case-insensitive) que passam a aparecer na lista.

**Independent Test**: Adicionar custom "frustração" em um registro; conferir que aparece em
registros futuros; tentar "Frustração" e confirmar que reutiliza a existente. (quickstart cenário 3)

- [ ] T019 [US2] Em `agents/journal/tools.py`, implementar `create_emotion(name) -> dict`: normaliza (trim), dedupe por `LOWER(name)` (retorna a existente se houver), insere com `is_predefined=FALSE`; retorna `{"status":"ok","emotion":{...}}`.
- [ ] T020 [US2] Em `webapp/backend/routers/journal.py`, adicionar `POST /emotions` (status 201, `_check_result`) com `CreateEmotionBody` (name não-vazio após strip → senão 422). (depende de T019)
- [ ] T021 [US2] Em `webapp/frontend/src/lib/api.ts`, adicionar `createEmotion(name)` ao `violetApi`.
- [ ] T022 [US2] Em `webapp/frontend/src/pages/violet/components/EmotionLog.tsx`, adicionar a opção "adicionar emoção" no seletor (campo de texto → `createEmotion` → usar no registro atual e recarregar a lista); distinguir predefinidas de custom (`is_predefined`). (depende de T021)

**Checkpoint**: US1 e US2 funcionais — vocabulário extensível com dedupe.

---

## Phase 5: User Story 3 — Analisar as emoções nos Insights (Priority: P2)

**Goal**: Aba "Emoções" nos Insights agregando os registros do ano (total, mais frequente,
intensidade média, por emoção, distribuição mensal), respeitando o ano da tela.

**Independent Test**: Com registros variados em meses distintos, abrir Insights → aba Emoções e
conferir os números + gráfico mensal; ano sem registros → estado vazio sem erro. (quickstart cenário 4)

- [ ] T023 [US3] Em `agents/journal/tools.py`, implementar `get_emotion_stats(year) -> dict` retornando `{total, avg_intensity, top_emotion, by_emotion:[{name,count,avg_intensity}], by_month:[12]}` (SQL com GROUP BY emotion, AVG/COUNT, EXTRACT(MONTH) filtrado por ano; estado vazio = zeros/null), conforme data-model.md.
- [ ] T024 [US3] Em `webapp/backend/routers/journal.py`, adicionar `GET /emotion-stats?year=` (retorna dict direto, **sem** `_check_result`).
- [ ] T025 [P] [US3] Em `webapp/frontend/src/pages/violet/types.ts`, adicionar a interface `EmotionStats`.
- [ ] T026 [US3] Em `webapp/frontend/src/lib/api.ts`, adicionar `emotionStats(year)` ao `violetApi`. (usa T025)
- [ ] T027 [US3] Em `webapp/frontend/src/pages/violet/screens/Insights.tsx`, adicionar `'Emoções'` ao array `TABS` e renderizar a aba: big numbers (total, intensidade média, mais frequente), lista por emoção (reusar `.ins-bars`) e distribuição mensal (reusar `<AreaChart data={by_month} />`); usar a variável `year` existente (integra com spec 005); estado vazio convidativo. (depende de T026)

**Checkpoint**: Todas as user stories funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentação, comentários e validação final.

- [ ] T028 [P] Atualizar `agents/journal/CLAUDE.md`: documentar as tabelas `journal_emotions`/`journal_emotion_logs`, as novas tools e a nota de que `get_emotion_stats`/`list_emotions`/`list_emotion_logs` retornam dados direto (sem `_check_result`).
- [ ] T029 [P] Atualizar `webapp/CLAUDE.md` (seção Journal): listar os 7 novos endpoints e a regra reavaliação↔resposta.
- [ ] T030 Revisar todo o código novo quanto à convenção de comentários do Gustavo (PT denso + docstrings Google Style + type hints) — Python e TSX.
- [ ] T031 Executar o `quickstart.md` ponta a ponta e marcar os critérios SC-001..SC-004, incluindo a verificação de que registros emocionais **não** alteram contagem de palavras/heatmap/coleções.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **bloqueia todas as user stories**.
- **User Stories (Phase 3–5)**: dependem da Foundational. US1 é o MVP. US2 e US3 dependem do
  schema (Phase 2) e tocam arquivos compartilhados com US1 (tools.py, journal.py, api.ts) — por
  isso são mais seguras **após** US1, embora sejam testáveis independentemente.
- **Polish (Phase 6)**: depois das user stories desejadas.

### User Story Dependencies

- **US1 (P1)**: só depende da Foundational. Entrega o MVP.
- **US2 (P2)**: depende da Foundational; estende o seletor de emoções da US1 (a UI vive no mesmo
  `EmotionLog.tsx`). Testável isolada via `create_emotion`/`POST /emotions`.
- **US3 (P2)**: depende da Foundational; consome os registros criados (na prática, validar após
  haver dados de US1). Independente em código (novo endpoint + nova aba).

### Within Each User Story

- Tools (modelo de dados) antes dos endpoints; endpoints antes da UI; tipos/API antes dos
  componentes que os usam.

### Parallel Opportunities

- T015 e T025 ([P]) podem ser feitas a qualquer momento (arquivo `types.ts`, sem dependência de
  backend).
- T028 e T029 ([P]) são docs independentes.
- US2 e US3 podem ser tocadas em paralelo por pessoas diferentes após US1, com atenção a conflitos
  em `tools.py`/`journal.py`/`api.ts` (mesmos arquivos → coordenar merges).

---

## Parallel Example: User Story 1

```bash
# Tipos do frontend podem começar em paralelo ao backend:
Task: "T015 [P] [US1] Adicionar interfaces Emotion e EmotionLog em types.ts"

# As 5 tools de US1 ficam no mesmo arquivo (tools.py) → NÃO paralelizar entre si;
# implementar em sequência T006→T010 e depois os endpoints T011→T014.
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational: schema) → Phase 3 (US1).
2. **PARAR e VALIDAR**: registrar/editar/excluir emoção na página do dia (quickstart 1–2).
3. Já entrega valor: captura emocional diária funcionando.

### Incremental Delivery

1. Foundational pronto → US1 (MVP) → validar → US2 (custom) → validar → US3 (Insights) → validar.
2. Cada story agrega valor sem quebrar as anteriores.

---

## Notes

- Registros emocionais são **ortogonais aos bullets** — não tocar nas queries de
  bullets/heatmap/coleções/stats existentes.
- `created_at` é convertido para ISO nas tools antes de retornar (padrão do módulo).
- Commit por task ou grupo lógico; não usar `git add .` (dist/ e uploads/ fora do git).
- Validar regra reavaliação↔resposta tanto na UI quanto no router.
