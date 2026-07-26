---

description: "Task list for spec 061 — Violet: Conselho do Dia"
---

# Tasks: Violet — Conselho do Dia

**Input**: Design documents from `specs/061-violet-conselho-diario/` (plan.md, spec.md,
research.md, data-model.md, contracts/rest-api.md, quickstart.md)

**Tests**: Parcialmente requisitado — `plan.md` § Technical Context define
`tests/agents/test_kurisu_counsel.py` para as partes puras/sem rede (T016). Não é TDD
estrito (as funções nascem junto, não antes); `T033` (Polish) roda a validação manual
completa do `quickstart.md`.

**Organization**: Tarefas agrupadas por user story (prioridades do `spec.md`). Como quase
toda a lógica nova mora num único arquivo novo (`agents/kurisu/counsel.py`), a maioria das
tarefas dentro dele é sequencial (mesmo arquivo) — `[P]` só aparece entre arquivos
realmente independentes (router vs. frontend vs. testes vs. docs).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivo diferente, sem dependência de tarefa incompleta)
- **[Story]**: US1–US3, mapeado 1:1 às User Stories do `spec.md`
- Caminhos de arquivo são exatos, relativos à raiz do repo

## Path Conventions

Aplicação web existente (nenhum projeto novo): lógica nova em `agents/kurisu/counsel.py`,
rotas REST em `webapp/backend/routers/journal.py`, frontend em
`webapp/frontend/src/pages/violet/`. Ver `plan.md` § Project Structure.

---

## Phase 1: Setup

**Purpose**: Confirmar que o ambiente está pronto — nenhuma dependência nova nesta feature.

- [X] T001 Verificar que o ambiente local sobe limpo (`uvicorn webapp.backend.main:app
  --reload --port 8000` + `npm run dev` em `webapp/frontend/`) e que `GEMINI_API_KEY`,
  `VERTEX_RAG_CORPUS`, `DATABASE_URL` estão configuradas localmente, per `CLAUDE.md` § "Como
  rodar localmente". Nenhuma dependência nova é adicionada por esta feature (plan.md §
  Technical Context — `google-genai`/`vertexai` já em uso).

**Checkpoint**: Ambiente confirmado — seguro iniciar as mudanças Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: A tabela `journal_counsel` e a coleta de sinais do dia são a base de leitura e
escrita de **todas** as user stories — precisam existir e funcionar antes de qualquer uma
ser testável.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa.

- [X] T002 Criar `agents/kurisu/counsel.py` com `_get_conn()` (mesmo padrão de
  `agents/kurisu/tutor.py::_get_conn`) e `_ensure_counsel_tables()` criando `journal_counsel`
  (schema completo em `data-model.md`), chamada no import do módulo (mesmo mecanismo de
  `agents/kurisu/tutor.py::_ensure_tutor_tables`).
- [X] T003 Implementar `_coletar_dia(page_id: int, date: str) -> dict` em
  `agents/kurisu/counsel.py` — lê `journal_bullets`, `journal_emotion_logs`,
  `journal_letters` e `dream` da página (forma exata em `data-model.md` § "Payload de
  leitura"). Depende de T002.
- [X] T004 Implementar `_serialize_counsel(row: dict) -> dict` em `agents/kurisu/counsel.py`
  convertendo uma linha de `journal_counsel` para a forma `Counsel` da resposta HTTP
  (`contracts/rest-api.md`). Depende de T002.

**Checkpoint**: Schema + coleta do dia + serialização prontos — implementação das user
stories pode começar.

---

## Phase 3: User Story 1 - Pedir o conselho do dia (Priority: P1) 🎯 MVP

**Goal**: Botão que gera (ou regenera) o conselho do dia — 4 blocos fixos, ancorado nos
bullets/emoções/cartas daquele dia, com citação real da base e honestidade explícita quando
ela não cobre o tema.

**Independent Test**: Escrever bullets num dia com tema coberto pela base de conhecimento,
clicar em pedir o conselho, confirmar os 4 blocos e uma citação real; clicar em "Regerar" e
confirmar que substitui (não duplica); tentar num dia vazio e confirmar o aviso sem gerar
análise.

### Implementation for User Story 1

- [X] T005 [US1] Implementar `_extrair_temas(dia: dict) -> dict` em
  `agents/kurisu/counsel.py` — chamada Gemini one-shot com `response_schema` extraindo de
  2 a 4 consultas de busca + um sinal de carga emocional a partir do que foi coletado
  (`research.md` R2/R3 — teto de 4 consultas). Depende de T003.
- [X] T006 [US1] Implementar `_consultar_rag(temas: dict) -> list` em
  `agents/kurisu/counsel.py` — chama `agents.kurisu.tools.buscar_na_base` uma vez por
  consulta (≤4) e deduplica os trechos por `uri` (`research.md` R3). Depende de T005.
- [X] T007 [US1] Implementar `_sintetizar(dia, rag_trechos, web_trechos=None,
  conselhos_anteriores=None) -> dict` em `agents/kurisu/counsel.py` — chamada Gemini
  one-shot com `response_schema` produzindo os 4 blocos (espelho/toolkit/pergunta/ações) na
  voz da Violet, cumprindo FR-009/FR-012 (declarar explicitamente quando não achou nada na
  base, antes de qualquer sugestão externa). Depende de T006.
- [X] T008 [US1] Implementar `gerar_conselho(date: str, type_id: int = 1) -> dict` em
  `agents/kurisu/counsel.py` — orquestra `get_or_create_page` (reuso de
  `agents.journal.tools`) → guarda contra dia vazio (sem bullets/cartas/registros →
  `{"status": "error"}`) → `_coletar_dia` → `_extrair_temas` → `_consultar_rag` →
  `_sintetizar` → `UPSERT` em `journal_counsel` (`ON CONFLICT (page_id) DO UPDATE`,
  `data-model.md`) — a chamada de IA acontece inteiramente **antes** da escrita (FR-015,
  `research.md` R8). Depende de T003, T004, T005, T006, T007.
- [X] T009 [US1] Implementar `get_conselho(date: str, type_id: int = 1) -> dict | None` em
  `agents/kurisu/counsel.py` — leitura pura via `_serialize_counsel`, sem chamada de IA.
  Depende de T004.
- [X] T010 [US1] Adicionar o modelo Pydantic `GenerateCounselBody` e as rotas
  `POST /api/journal/counsel` e `GET /api/journal/counsel` em
  `webapp/backend/routers/journal.py` (`contracts/rest-api.md`), importando
  `agents.kurisu.counsel`. Depende de T008, T009.
- [X] T011 [P] [US1] Adicionar os tipos `Counsel`, `CounselToolkitItem`, `CounselAction` em
  `webapp/frontend/src/pages/violet/types.ts` (forma em `contracts/rest-api.md`).
- [X] T012 [US1] Adicionar `generateCounsel(date, type_id?)` e `getCounsel(date, type_id?)`
  a `violetApi` em `webapp/frontend/src/lib/api.ts`. Depende de T010, T011.
- [X] T013 [US1] Construir `webapp/frontend/src/pages/violet/components/CounselSection.tsx`
  — estados vazio/carregando/pronto/erro (`plan.md` § Project Structure), chamando
  `violetApi.getCounsel` no mount e `violetApi.generateCounsel` no clique; renderiza os 4
  blocos com a estrutura de citação/`origem` já pronta (mesmo que `origem` só possa ser
  `"base"` até a US3 existir). Depende de T012.
- [X] T014 [US1] Adicionar o bloco de CSS `.cs-*` (com prefixo próprio, escopado em
  `.vl-app`) no fim de `webapp/frontend/src/pages/violet/violet.css` (o `plan.md` alerta
  para o vazamento global conhecido deste arquivo — regras novas precisam de prefixo e
  escopo explícitos). Depende de T013.
- [X] T015 [US1] Inserir `<CounselSection pageId={page?.id ?? null} date={effectiveDate} />`
  em `webapp/frontend/src/pages/violet/screens/Write.tsx`, logo após `.w-prompt` e antes de
  `<EmotionSection>` (mesmo slot/padrão de `EmotionSection`/`LetterSection`). Depende de
  T013.
- [X] T016 [P] [US1] Criar `tests/agents/test_kurisu_counsel.py` cobrindo as partes puras/
  sem rede: guarda de dia vazio, dedup por `uri` em `_consultar_rag`, e o round-trip de
  `_serialize_counsel` (mesmo espírito de
  `tests/agents/test_kurisu_tutor_mastery.py`). Depende das assinaturas de T004 e T006
  já existirem.

**Checkpoint**: User Story 1 completa e testável de forma independente — o usuário consegue
clicar, gerar o conselho do dia com base em bullets/emoções/cartas, regerar, ver a
honestidade quando a base não cobre, e isso funciona em qualquer data.

---

## Phase 4: User Story 2 - Contexto ampliado e continuidade (Priority: P2)

**Goal**: O conselho passa a considerar a janela de 7 dias, o estado de tarefas/hábitos da
Kaguya e os 3 conselhos anteriores — e uma ação sugerida pode virar tarefa em um clique.

**Independent Test**: Gerar o conselho em dois dias seguidos sobre um tema recorrente e
confirmar que o segundo dia reconhece a recorrência e referencia o conselho anterior; clicar
em "virar tarefa" numa ação e confirmar a tarefa criada em `/tasks`.

### Implementation for User Story 2

- [X] T017 [US2] Implementar `_janela_7_dias(date: str) -> list` em
  `agents/kurisu/counsel.py` — bullets/emoções resumidos dos 7 dias anteriores (FR-004).
  Depende de T003.
- [X] T018 [US2] Implementar `_conselhos_anteriores(date: str, limit: int = 3) -> list` em
  `agents/kurisu/counsel.py` — lê os 3 `journal_counsel` mais recentes antes da data,
  projetando só os textos de `mirror`/`question`/`actions` (`research.md` R6, FR-005).
  Depende de T002.
- [X] T019 [US2] Implementar `_kaguya_do_dia() -> dict` em `agents/kurisu/counsel.py` —
  import lazy de `agents.kaguya.tools_tasks.list_tasks_today` e
  `agents.kaguya.tools_habits.list_habits` (`research.md` R4, FR-006).
- [X] T020 [US2] Conectar `_janela_7_dias`, `_conselhos_anteriores` e `_kaguya_do_dia` à
  etapa de coleta de `gerar_conselho` e ao contexto passado para `_sintetizar` (menções
  explícitas de recorrência e continuidade no prompt). Depende de T007, T017, T018, T019.
- [X] T021 [US2] Implementar `marcar_acao_como_tarefa(page_id: int, action_index: int,
  task_id: int) -> dict` em `agents/kurisu/counsel.py` — grava `task_id` no item
  correspondente de `actions_json` (regras de transição em `data-model.md`; índice fora do
  range deve permitir 404 na camada de router). Depende de T004.
- [X] T022 [US2] Adicionar `MarkCounselActionBody` + as rotas
  `PATCH /api/journal/counsel/actions` e `GET /api/journal/counsel/history` em
  `webapp/backend/routers/journal.py` (`contracts/rest-api.md`). Depende de T021.
- [X] T023 [P] [US2] Adicionar `markActionAsTask(page_id, action_index, task_id)` e
  `counselHistory(limit?)` a `violetApi` em `webapp/frontend/src/lib/api.ts`. Depende de
  T022.
- [X] T024 [US2] Adicionar a ação "virar tarefa" por ação sugerida em
  `CounselSection.tsx` — importa `kaguyaApi` (precedente: `LetterLog.tsx` importa
  `komiApi`) para criar a tarefa, depois chama `violetApi.markActionAsTask`; desabilita/
  marca o botão quando `task_id` já está preenchido. Depende de T013, T023.

**Checkpoint**: User Story 2 completa — contexto ampliado, continuidade entre dias e
"virar tarefa" funcionando, sem quebrar a US1.

---

## Phase 5: User Story 3 - Enriquecer com busca externa quando a base não cobre (Priority: P3)

**Goal**: Busca na web só quando a base não cobrir o tema identificado, com o item resultante
claramente marcado como externo.

**Independent Test**: Escrever sobre um tema fora da base, pedir o conselho, confirmar que a
busca externa dispara e que o item aparece marcado como vindo de fora; escrever sobre um tema
bem coberto pela base e confirmar que a busca externa **não** dispara.

### Implementation for User Story 3

- [X] T025 [US3] Implementar `_precisa_busca_web(rag_trechos: list) -> bool` em
  `agents/kurisu/counsel.py` — gate de `research.md` R3 (nenhum corpus com
  `status == "ok"`, ou menos de 2 trechos relevantes). Depende de T006.
- [X] T026 [US3] Implementar `_buscar_web(temas: dict) -> str | None` em
  `agents/kurisu/counsel.py` — chamada Gemini **separada**, com a tool `google_search`
  habilitada e **sem** `response_schema` (`research.md` R2 — restrição real da API),
  devolvendo o texto/URLs do grounding. Depende de T025.
- [X] T027 [US3] Conectar `_precisa_busca_web`/`_buscar_web` a `gerar_conselho` (só chama a
  web quando o gate disparar) e a `_sintetizar` (itens vindos da web marcados
  `"origem": "web"`; `used_web` gravado na linha — FR-010/011, `data-model.md`). Depende de
  T008, T026.
- [X] T028 [P] [US3] Estilizar os itens `origem: "web"` do toolkit de forma visualmente
  distinta em `CounselSection.tsx` / bloco `.cs-*` (FR-011) — selo "fonte externa" visível.
  Depende de T013, T014, T027.

**Checkpoint**: User Story 3 completa — busca externa só entra quando necessário, e sempre
identificada.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentação e validação final — nenhuma mudança de comportamento.

- [X] T029 [P] Atualizar `agents/kurisu/CLAUDE.md` com a seção "Conselho do Dia (spec 061)",
  espelhando a seção existente do Tutor de Idiomas.
- [X] T030 [P] Atualizar `webapp/CLAUDE.md` (tabela de endpoints do domínio Journal) e
  `webapp/docs/API.md`/`webapp/docs/FRONTEND.md` com as 4 rotas novas e o `CounselSection`.
- [X] T031 [P] Adicionar `journal_counsel` coluna a coluna em `docs/referencia/POSTGRES.md`.
- [X] T032 [P] Adicionar a linha da spec 061 em `ROADMAP.md`.
- [ ] T033 Rodar os 8 cenários de `quickstart.md` ponta a ponta e corrigir qualquer gap
  encontrado.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente.
- **Foundational (Phase 2)**: depende do Setup — bloqueia todas as user stories.
- **User Stories (Phase 3+)**: todas dependem da conclusão do Foundational.
  - US1 (P1) é o MVP e deve ser entregue primeiro.
  - US2 (P2) estende `gerar_conselho`/`CounselSection` da US1 — não é independente de
    arquivo, mas é independentemente **testável** (a US1 continua funcionando sem ela).
  - US3 (P3) estende os mesmos pontos de extensão da US2 — mesma relação.
- **Polish (Final Phase)**: depende de todas as user stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1)**: pode começar após o Foundational — sem dependência de outras stories.
- **US2 (P2)**: pode começar após o Foundational; estende funções e o componente da US1
  (mesmos arquivos), mas deve continuar testável de forma independente.
- **US3 (P3)**: mesma relação de extensão sobre US1/US2.

### Within Each User Story

- Funções puras/de coleta antes das que orquestram (`gerar_conselho`).
- Backend (`counsel.py` → router) antes do frontend (`violetApi` → componente → tela).
- CSS depois do componente que usa as classes.
- Story completa antes de avançar para a próxima prioridade.

### Parallel Opportunities

- T011 (tipos TS) pode rodar em paralelo com T005–T010 (backend) — arquivos diferentes.
- T016 (testes) pode rodar em paralelo com T007–T015 depois que as assinaturas de T004/T006
  existirem.
- T023 (métodos de API) pode rodar em paralelo com T021–T022 assim que os nomes dos campos
  estiverem definidos.
- T029–T032 (docs) são todos arquivos diferentes — podem rodar juntos.

---

## Parallel Example: User Story 1

```bash
# Depois que T002–T004 (Foundational) estiverem prontos:
Task: "Adicionar tipos Counsel/CounselToolkitItem/CounselAction em types.ts"      # T011
Task: "Implementar _extrair_temas em agents/kurisu/counsel.py"                    # T005

# Depois que T004 e T006 existirem (assinaturas):
Task: "Criar tests/agents/test_kurisu_counsel.py (partes puras)"                 # T016
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as stories)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: testar a User Story 1 de forma independente (cenários 1–4 do
   `quickstart.md`)
5. Demonstrar/usar em produção se estiver pronto

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → testar independentemente → usar (MVP!)
3. US2 → testar independentemente → usar
4. US3 → testar independentemente → usar
5. Cada story adiciona valor sem quebrar as anteriores

---

## Notes

- `[P]` = arquivos diferentes, sem dependência de tarefa incompleta
- A rótulo `[Story]` mapeia a tarefa à user story correspondente para rastreabilidade
- Cada user story deve ser completável e testável de forma independente
- Parar em qualquer checkpoint para validar a story isoladamente
- Evitar: tarefas vagas, conflito no mesmo arquivo marcado `[P]`, dependências entre stories
  que quebrem a independência
