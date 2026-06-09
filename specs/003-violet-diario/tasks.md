# Tasks: Violet · Diário

**Input**: Design documents from `specs/003-violet-diario/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅ · quickstart.md ✅

**Tests**: NÃO solicitados pela spec — sem tarefas de teste. Validação via `quickstart.md` na fase de polish.

**Organização**: tarefas agrupadas por história de usuário para entrega incremental independente.

## Formato: `[ID] [P?] [Story?] Descrição + caminho de arquivo`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependências)
- **[US#]**: história de usuário correspondente (US1–US6)
- **Setup/Foundational/Polish**: sem label de história

## Convenções de caminho

- **Backend (domínio)**: `agents/journal/tools.py`
- **Backend (endpoints)**: `webapp/backend/routers/journal.py`
- **Frontend (shell novo)**: `webapp/frontend/src/pages/violet/`
- **Frontend (config)**: `webapp/frontend/src/` (`App.tsx`, `lib/api.ts`, `index.html`)

---

## Phase 1: Setup (infraestrutura inicial)

**Objetivo**: Criar scaffolding do diretório Violet, copiar assets, preparar CSS.

- [ ] T001 Criar estrutura de diretórios `webapp/frontend/src/pages/violet/screens/` e `webapp/frontend/src/pages/violet/ui/`
- [ ] T002 [P] Copiar `docs/claude_design/design_handoff_violet/violet/violet.png` para `webapp/frontend/public/violet.png`
- [ ] T003 [P] Adicionar Newsreader (400/500/600/700, normal+italic) ao `<link>` Google Fonts em `webapp/frontend/index.html` — não remover Playfair Display e Archivo Black
- [ ] T004 Criar `webapp/frontend/src/pages/violet/violet.css` portando `docs/claude_design/design_handoff_violet/violet/styles.css`: rescoping `:root`→`.vl-app`, tema escuro em `.vl-app[data-theme='dark']`, sem regras em `html/body` (FR-040, FR-041, FR-042, FR-046)

**Checkpoint**: Diretório criado, asset e font disponíveis, CSS base isolado.

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Objetivo**: Schema do banco, tools e endpoints compartilhados, shell VioletShell, primitivos UI, rota em App.tsx.

**⚠️ CRÍTICO**: nenhuma história pode começar antes desta fase.

### Backend — schema + tools

- [ ] T005 Adicionar `ALTER TABLE journal_bullets ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'bullet'` e `ALTER TABLE journal_pages ADD COLUMN IF NOT EXISTS dream TEXT` em `agents/journal/tools.py::_ensure_tables()` — com verificação idempotente para o CHECK constraint `kind IN (...)` (FR-001, FR-002)
- [ ] T006 Estender `get_or_create_page` em `agents/journal/tools.py` para retornar `dream` (campo da page) e `num` derivado via `ROW_NUMBER() OVER (ORDER BY date)` na query
- [ ] T007 Adicionar parâmetro `kind: str = 'bullet'` a `upsert_bullet` em `agents/journal/tools.py`, persistindo no campo `kind` do bullet

### Backend — endpoints compartilhados

- [ ] T008 Atualizar `page_endpoint` (retornar `dream` e `num`) e `upsert_bullet_endpoint` (aceitar `kind` no body Pydantic, retornar `kind` na resposta) em `webapp/backend/routers/journal.py`

### Frontend — primitivos e API client

- [ ] T009 [P] Criar `webapp/frontend/src/pages/violet/types.ts` com interfaces: `Entry`, `Bullet`, `BulletKind`, `Stats`, `VioletPrefs`, `ReflectPrompt`, `CollectionItem`, `DreamItem`, `MentionCount`, `HeatmapData`
- [ ] T010 [P] Criar `webapp/frontend/src/pages/violet/ui/Icon.tsx` com SVG inline para ícones: `write`, `journal`, `reflect`, `insights`, `moon`, `heart`, `gem`, `bulb`, `hash`, `at`, `pin` — stroke 1.8px, `heart`/`moon`/`gem` preenchidos (FR-045)
- [ ] T011 [P] Criar `webapp/frontend/src/pages/violet/ui/RichText.tsx` que faz parse de `@NomePessoa`→`<span class="mention-person">` (emerald/500) e `#tag`→`<span class="mention-tag">` (accent-deep/500), ambos clicáveis via `onMentionClick` prop (FR-019)
- [ ] T012 Adicionar objeto `violetApi` em `webapp/frontend/src/lib/api.ts` espelhando o padrão de `booksApi`: métodos `page`, `upsertBullet`, `deleteBullet`, `setDream`, `heatmap`, `mentions`, `filter`, `search`, `collection`, `dreams`, `stats`, `entries`

### Frontend — shell raiz

- [ ] T013 Criar `webapp/frontend/src/pages/violet/VioletShell.tsx`: sidebar `.vl-side` de 244px com 2 grupos de nav (Write/Journal/Reflect/Insights + Dreams/Highlights/Tags/People/Notes/Wisdom/Ideas com contadores), topbar `.vl-topbar`, roteamento interno `useState<Route>({view, param})` + `renderView()` switch, `scrollRef` com reset ao navegar, botão "Escrever hoje", link "Voltar à Makima", `loadTweaks()` com defaults (FR-008–FR-014)
- [ ] T014 Em `webapp/frontend/src/App.tsx`: adicionar `<Route path="/journal/*" element={<VioletShell/>}/>` ANTES do catch-all `/*`; remover `<Route path="/journal" element={<Journal/>}/>` de dentro do Layout

**Checkpoint**: Foundational completo — todas as histórias podem começar em paralelo.

---

## Phase 3: User Story 1 — Escrever o dia (Priority: P1) 🎯 MVP

**Objetivo**: Tela Write com shell Violet ativo, bullets tipados, sonho, navegação temporal.

**Teste independente**: Acessar `/journal`, registrar bullets de cada tipo com marcadores visuais corretos, navegar com `«‹●›»`, sonho persiste. Entregar isso já resolve a dor diária.

- [ ] T015 [US1] Criar tool `set_dream(page_id: int, text: str)` em `agents/journal/tools.py` que faz `UPDATE journal_pages SET dream = %s WHERE id = %s`
- [ ] T016 [US1] Adicionar endpoint `PUT /api/journal/page/dream` em `webapp/backend/routers/journal.py` com Pydantic body `DreamBody(page_id, dream)`, retorna `{"status": "ok"}` (FR-016)
- [ ] T017 [US1] Criar `webapp/frontend/src/pages/violet/screens/Write.tsx`: cabeçalho de data (mês+dia DM Sans 15px/600 accent-deep, dia-da-semana Newsreader 56px/700, `#num · Hoje/X dias atrás`), prompt de sonho com ícone lua que salva via `violetApi.setDream` ao perder foco, lista de bullets com marcadores por `kind` + `<RichText/>` + timestamp, chips de tipo (Bullet/Destaque/Ideia/Sabedoria/Nota/Sonho) (FR-015–FR-018, FR-020)
- [ ] T018 [US1] Criar `webapp/frontend/src/pages/violet/screens/WriteFooter.tsx`: botões `«` (primeira), `‹` (anterior), `Lista`, `●` (hoje, estilo accent), `›` (próximo), `»` (última) — altura 52px, backdrop-filter blur(14px), desabilitar `«`/`»` nos limites (FR-021, FR-022)
- [ ] T019 [US1] Ligar view `write` no VioletShell: estado `{date, entryIdx}`, lista de datas das entries via `violetApi.entries()`, navegação entre entries, WriteFooter com callbacks `onNav`

**Checkpoint**: US1 completa e testável — MVP funcional do Violet.

---

## Phase 4: User Story 2 — Navegar o arquivo (Priority: P2)

**Objetivo**: Tela Journal com stream de cards agrupados por mês, busca, clique→Write.

**Teste independente**: Abrir Journal, ver cards com excerpt/pills por mês desc, buscar texto, clicar abre Write na entry correta.

- [ ] T020 [US2] Criar tool `list_entries(query: str = '')` em `agents/journal/tools.py`: retorna por data desc — `date`, `num`, `excerpt` (conteúdo do 1º bullet, max 150 chars), `bullet_count`, `has_highlight` (bool), `has_dream` (bool); filtra por `query` se fornecido via `search_vec @@ plainto_tsquery`
- [ ] T021 [US2] Adicionar endpoint `GET /api/journal/entries` em `webapp/backend/routers/journal.py` com query param opcional `q`
- [ ] T022 [US2] Criar `webapp/frontend/src/pages/violet/screens/Journal.tsx`: fetch via `violetApi.entries(query)`, agrupamento por mês em ordem desc, cabeçalho mês DM Mono uppercase letter-spacing 0.14em, cards com dia Newsreader 30px/600, dia-da-semana DM Mono 9.5px, `#num · X dias atrás`, excerpt 2 linhas `-webkit-line-clamp: 2`, pills garnet (highlight) e gold (dream), hover shadow+translateY; clique→`navigate('write', entry.date)` (FR-023–FR-025)

**Checkpoint**: US1 + US2 funcionais.

---

## Phase 5: User Story 3 — Coleções derivadas (Priority: P3)

**Objetivo**: Dreams, Highlights, Ideas, Wisdom, Notes, Tags, People — todos navegáveis.

**Teste independente**: Sidebar coleções com contadores, grid de highlights com accent bar garnet, nuvem Tags proporcional, People com avatares.

- [ ] T023 [P] [US3] Criar tool `list_collection(kind: str)` em `agents/journal/tools.py`: SELECT bullets com `kind = %s` + JOIN pages para `date` e `num` (entry_num), ordenado por `created_at DESC` — retorna lista de `{id, kind, content, date, entry_num, created_at}`
- [ ] T024 [P] [US3] Criar tool `list_dreams()` em `agents/journal/tools.py`: SELECT pages com `dream IS NOT NULL`, ordenado por `date DESC` — retorna `{page_id, date, entry_num, dream}`
- [ ] T025 [US3] Adicionar endpoints em `webapp/backend/routers/journal.py`: `GET /api/journal/collection/{kind}` (kind ∈ highlight/dream/idea/wisdom/note, retorna 400 para inválido) e `GET /api/journal/dreams` (FR-005, FR-006)
- [ ] T026 [P] [US3] Criar `webapp/frontend/src/pages/violet/screens/Collection.tsx`: props `{kind, navigate}`, fetch via `violetApi.collection(kind)` ou `violetApi.dreams()`, grid `repeat(auto-fill, minmax(280px,1fr))`, accent bar 3px por kind (gold/garnet/amber/violet-c/ink-3), tipografia Newsreader itálico para wisdom/dreams, data + link para origem; estado vazio com mensagem amigável (FR-026)
- [ ] T027 [P] [US3] Criar `webapp/frontend/src/pages/violet/screens/Tags.tsx`: fetch via `violetApi.mentions('tag')`, nuvem com `font-size = 0.92em + (count/maxCount) * 0.55em`, cada tag `border-radius: 999px`, hover fundo `accent-tint`, clique→`navigate('journal')` com filtro (FR-027)
- [ ] T028 [P] [US3] Criar `webapp/frontend/src/pages/violet/screens/People.tsx`: fetch via `violetApi.mentions('person')`, grid 4 colunas `minmax(220px,1fr)`, card por pessoa com avatar circular 42px (inicial, fundo `--emerald-tint`), nome 14.5px/600, contagem DM Mono 10.5px, clique→filtro (FR-028)
- [ ] T029 [US3] Ligar views `dreams`/`highlights`/`ideas`/`wisdom`/`notes`/`tags`/`people` no VioletShell + carregar contadores da sidebar via `violetApi.mentions` e `violetApi.collection`

**Checkpoint**: US1 + US2 + US3 funcionais — coleções completas.

---

## Phase 6: User Story 4 — Insights (Priority: P4)

**Objetivo**: Heatmap por palavras, gráfico área, barras por hora, big numbers, 7 abas.

**Teste independente**: Aba Diário com heatmap 5 níveis reais, chips contagem, área chart 12 meses, 3 grandes números.

- [ ] T030 [US4] Estender `list_heatmap(year)` em `agents/journal/tools.py` para retornar **palavras escritas** por dia: `SUM(length(regexp_replace(content, '\s+', ' ', 'g')) - length(replace(...)) + 1)` por bullet + `len(dream.split())` por page — em vez de contagem de bullets (FR-003, FR-004)
- [ ] T031 [US4] Criar tool `get_stats(year: int)` em `agents/journal/tools.py`: entradas, bullets, days_written, total_words, per_day, highlights, tags distintas, mentions distintos, dreams, highlight_rate, freq_per_week, words_by_month (array 12), daytime (array 12 bihourly) — tudo no servidor; `longestStreak`/`currentStreak` calculados no cliente
- [ ] T032 [US4] Adicionar endpoint `GET /api/journal/stats?year=` em `webapp/backend/routers/journal.py`
- [ ] T033 [P] [US4] Criar `webapp/frontend/src/pages/violet/ui/HeatmapRow.tsx`: 7 `<div>` de 9×9px com `background: var(--heat-N)` baseado em thresholds 0/1–49/50–99/100–189/≥190 palavras (FR-031)
- [ ] T034 [P] [US4] Criar `webapp/frontend/src/pages/violet/ui/AreaChart.tsx`: SVG puro, curva Catmull-Rom→Bezier, 12 pontos (words_by_month), gradiente de área accent 22%→2%, linha accent strokeWidth 2, labels meses DM Mono 9px (FR-033)
- [ ] T035 [US4] Criar `webapp/frontend/src/pages/violet/screens/Insights.tsx`: hero 2 colunas (eyebrow + H1 Newsreader 52px + badge Pro + parágrafo com dados reais / violet.png + halo radial blur 3px), 7 abas, aba Diário com HeatmapRow × semanas, chips contagem, linhas de stat, AreaChart, barras 12 bihourly com gradiente accent→accent-bright, big numbers Newsreader 48px/400 accent-deep (FR-029–FR-035)

**Checkpoint**: US1–US4 funcionais.

---

## Phase 7: User Story 5 — Reflect (Priority: P5)

**Objetivo**: Card de pergunta da Violet, ciclo de 4 prompts, "Releia-se" determinístico.

**Teste independente**: Card com pergunta Newsreader 30px, "Outra pergunta" cicla, "Releia-se" 4 itens consistentes no mesmo dia.

- [ ] T036 [US5] Criar `webapp/frontend/src/pages/violet/screens/Reflect.tsx`: card com `linear-gradient(150deg, mist, card 64%)`, eyebrow DM Mono uppercase, pergunta Newsreader 30px/500, assinatura Newsreader itálico 13.5px, botões "Responder hoje" (accent, →Write) e "Outra pergunta" (neutro, cicla 0–3); seção "Releia-se" com seleção determinística `arr[dayOfYear % arr.length]` para wisdom/highlight/dream/idea — pula slot se tipo vazio (FR-036–FR-039) *[Depende de T025 — endpoints de US3]*

**Checkpoint**: US1–US5 funcionais.

---

## Phase 8: User Story 6 — Tweaks (Priority: P6)

**Objetivo**: Painel de personalização com persistência localStorage.

**Teste independente**: Trocar tema escuro → persistir após reload; trocar acento → todos os elementos de acento mudam sem reload.

- [ ] T037 [US6] Criar `webapp/frontend/src/pages/violet/TweaksPanel.tsx`: 4 grupos de controles — Tema (claro/escuro), Acento (safira/ouro/esmeralda/granada com swatches), Modo (normal/amplo/foco), Tipografia (clássica/técnica); ao mudar qualquer tweak: `localStorage.setItem('vl-tweaks', JSON.stringify(tweaks))`; prop `onTweaks(t: VioletPrefs)` notifica o shell (FR-007, FR-043)
- [ ] T038 [US6] Ligar efeitos de Tweaks no VioletShell em `webapp/frontend/src/pages/violet/VioletShell.tsx`: `data-theme` no `.vl-app`, `style.setProperty` para os 5 `--accent-*` (paletas do data-model.md), classes `.modo-foco`/`.modo-amplo`/`.tipo-tecnica` no `.vl-app` (FR-042–FR-044)

**Checkpoint**: US1–US6 completas — feature Violet implementada na íntegra.

---

## Phase 9: Polish & Cross-Cutting

**Objetivo**: Remover órfão, estados vazios, responsividade, validação E2E.

- [ ] T039 [P] Remover arquivo órfão `webapp/frontend/src/pages/Journal.tsx` e seu import em `webapp/frontend/src/App.tsx`
- [ ] T040 [P] Garantir estados vazios em todas as coleções (Collection.tsx, Tags.tsx, People.tsx) e no "Releia-se" (Reflect.tsx) quando não há dados para um tipo — mensagem amigável, sem grid em branco
- [ ] T041 Adicionar breakpoint `@media (max-width: 900px)` em `webapp/frontend/src/pages/violet/violet.css`: sidebar colapsa para 64px (somente chips de ícone, labels `display: none`), hero dos Insights colapsa para coluna única (retrato oculto), big stats 1 coluna (FR-014, SC-008)
- [ ] T042 Rodar validação E2E do `specs/003-violet-diario/quickstart.md`: P1–P6, regressão (Dashboard, FrierenShell), responsividade 375px

---

## Dependencies & Execution Order

### Dependências entre fases

- **Phase 1 (Setup)**: sem dependências — pode começar imediatamente
- **Phase 2 (Foundational)**: depende de Setup — **bloqueia todas as histórias**
- **Phase 3–8 (US1–US6)**: todas dependem da Foundational; podem rodar em sequência de prioridade
- **US5 (Reflect)**: depende de US3 (T025) estar completo — usa endpoints `/collection/{kind}` e `/dreams`
- **Phase 9 (Polish)**: depende de todas as histórias desejadas estarem completas

### Dependências dentro das histórias

- T005 → T006 → T007 → T008 (backend: schema antes de tools antes de endpoints)
- T009/T010/T011 podem rodar em paralelo (diferentes arquivos)
- T012 (violetApi) → T013 (VioletShell usa violetApi) → T014 (App.tsx importa VioletShell)
- T015 (tool) → T016 (endpoint) → T017 (Write.tsx usa endpoint) → T018/T019

### Oportunidades de paralelismo

- **Setup**: T002 + T003 em paralelo
- **Foundational frontend**: T009 + T010 + T011 em paralelo (após T001)
- **US3**: T023 + T024 em paralelo; T026 + T027 + T028 em paralelo
- **US4**: T033 + T034 em paralelo (após T030/T031)
- **Polish**: T039 + T040 em paralelo

---

## Parallel Example: US3 Coleções

```
# Lançar em paralelo (tools independentes):
Task: "list_collection(kind) em agents/journal/tools.py"   [T023]
Task: "list_dreams() em agents/journal/tools.py"           [T024]

# Após T023+T024 completos, lançar T025 (endpoints):
Task: "GET /collection/{kind} + GET /dreams em webapp/backend/routers/journal.py"

# Após T025, lançar componentes em paralelo:
Task: "Collection.tsx em pages/violet/screens/"  [T026]
Task: "Tags.tsx em pages/violet/screens/"        [T027]
Task: "People.tsx em pages/violet/screens/"      [T028]
```

---

## Implementation Strategy

### MVP (US1 apenas — T001–T019)

1. Phase 1: Setup → scaffolding + assets + CSS base
2. Phase 2: Foundational → schema, tools compartilhadas, VioletShell, rota
3. Phase 3: US1 Write → `set_dream`, endpoint dream, Write.tsx, WriteFooter.tsx
4. **PARAR e VALIDAR**: acessar `/journal`, escrever bullets de todos os 6 tipos, navegar
5. Fazer deploy / demo se pronto

### Entrega incremental

1. Setup + Foundational → shell Violet visível (sidebar, topbar, rota ativa)
2. US1 Write → MVP! Valor imediato para uso diário
3. US2 Journal → arquivo histórico
4. US3 Coleções → highlights, dreams, tags, people
5. US4 Insights → heatmap por palavras, estatísticas
6. US5 Reflect → perguntas da Violet
7. US6 Tweaks → personalização completa

---

## Notes

- **[P]** = arquivos diferentes, sem dependências entre si
- **[US#]** = rastreabilidade da tarefa para a história
- `violet.css` é importado apenas dentro do VioletShell — tokens OKLCH isolados em `.vl-app`, sem vazar para o tema escuro global
- Cada ALTER é idempotente (`ADD COLUMN IF NOT EXISTS`); o CHECK constraint precisa de verificação adicional antes de criar
- `num` (número da entrada #N) nunca é persistido — sempre `ROW_NUMBER() OVER (ORDER BY date)` na query
- Salvar frequentemente com commits atômicos por tarefa ou por fase
