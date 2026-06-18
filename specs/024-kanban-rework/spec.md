# SPEC — 024 · Kanban "Vidro" (redesign do board do Kaguya)

> **Como este SPEC foi produzido.** O runtime do `gsd-spec-phase` (`~/.claude/get-shit-done/workflows/` + `templates/`) não está instalado nesta máquina, então o workflow oficial (loop Socrático + ambiguity scoring automático) não pôde rodar. Este SPEC reproduz o método manualmente: scout do codebase + entrevista de decisão + requisitos falsificáveis. Convenção de pasta segue a do repo (`specs/NNN-*/`), não `.planning/`.

## Objetivo (WHAT / WHY)

Reescrever a tela **Kanban** do Kaguya (`webapp/frontend/src/pages/kaguya/screens/KanbanScreen.tsx`) para o visual **"Vidro" (Glass)** definido no handoff em `specs/024-kanban-rework/design_handoff_kaguya_kanban/`, **mantendo o modelo de board atual** (por lista, colunas configuráveis pelo usuário) e **preservando integralmente as otimizações de performance** do drag-and-drop já implementadas com `@dnd-kit` (commit `dcc65db`).

**Por quê:** o board atual usa colunas cinzas planas. O redesign "Vidro" entrega um tratamento minimalista (frosted glass sobre gradiente, numerais grandes de contagem, capacity meter, anel de progresso de subtarefas, rodapé-resumo) que eleva a qualidade visual ao nível dos outros domínios (Violet, Nami, Frieren) sem regredir a fluidez do drag.

## Clarifications

### Session 2026-06-18
- Q: Rodapé-resumo — qual o 3º stat / como tratar a configurabilidade da visualização? → A: As visualizações do Kanban devem ser **configuráveis pela interface** via **views salvas e nomeadas, persistidas no backend** (cada view captura os elementos visíveis do board + filtros). Isso amplia a 024 para incluir mudança de backend (tabela + endpoints novos) e **revoga o boundary "sem mudança de backend"** da versão inicial.
- Q: O que uma view de Kanban salva captura? → A: **Configuração de exibição** (quais adornos visíveis: capacity meter, anel de subtarefas, rodapé-resumo, chips; e quais métricas nos 3 slots do rodapé) **+ um filtro de tarefas opcional**. As **colunas continuam sendo propriedade da lista** (a view NÃO guarda layout/ordem de colunas).
- Q: As views são globais ou por lista? → A: **Globais reutilizáveis** — não pertencem a nenhuma lista; aparecem no seletor de qualquer board. A **view ativa é lembrada por lista** (localStorage, cada board reabre na última view usada). Tabela **sem `project_id`**.
- Q: O filtro opcional da view reaproveita o motor de filtros existente? → A: Sim — a view armazena um objeto **`FilterRules` inline** (mesmo DSL das smart-lists: combinador + condições sobre `project_id/priority/due_date/tag/state/text`), reusando o motor de avaliação existente. **Sem acoplamento** a uma smart-list salva (evita referência órfã) e **sem motor de filtro novo**.
- Q: View padrão e baseline de fidelidade visual? → A: O sistema vem com uma view built-in **"Completa"** (todos os adornos ligados; slots do rodapé no padrão) que é a **default** de qualquer board sem seleção prévia. A **fidelidade pixel-fiel (A1) é avaliada nessa view "Completa"**. Configurar/criar views é **opt-in** — o design "Vidro" aparece 100% out-of-the-box.

## Decisões de escopo (travadas com o usuário)

0. **Views de Kanban configuráveis (NOVO — Session 2026-06-18):** o board ganha um sistema de **views salvas e nomeadas, globais e reutilizáveis**, gerenciadas pela UI e persistidas no backend. Cada view captura: (a) **configuração de exibição** (adornos visíveis + métricas dos 3 slots do rodapé) e (b) um **filtro opcional** (`FilterRules` inline, mesmo DSL das smart-lists). As **colunas continuam sendo da lista** (a view não guarda layout de colunas). A **view ativa é lembrada por lista** (localStorage). Há uma view built-in **"Completa"** (default, tudo ligado). Esta decisão **revoga** o antigo boundary "sem mudança de backend": a 024 agora inclui schema (`kanban_views`) + endpoints `/api/tasks/kanban-views/*`. Requisitos detalhados em R21–R29.
1. **Modelo de board: HÍBRIDO.** Mantém colunas configuráveis por lista (modelo atual). Adota o máximo do visual e dos componentes do handoff que façam sentido nesse modelo. Abre mão **apenas** do que é intrínseco ao modelo de colunas fixas cross-project do handoff: o badge **WIP n/3** fixo na coluna "Fazendo" e os **chips de filtro por projeto** (o board já está escopado a uma lista).
2. **Componentes incluídos (todos os 4):** anel de progresso de subtarefas, capacity meter por coluna, rodapé-resumo do board, chips de estimativa/data/projeto no card.
3. **DnD:** continua em `@dnd-kit` — o próprio handoff autoriza ("use a lib preferida do codebase"). Nenhuma regressão de performance é aceitável.

## Contexto / Estado atual

- **Board atual** (`KanbanScreen.tsx`): por lista (`projectId`), colunas configuráveis (`Column { id, name, position, is_done_column }` — **sem campo de cor**), uma coluna "concluído" alternável. DnD via `@dnd-kit` com: `PointerSensor` (ativação a 5px), `DragOverlay`, `SortableContext`/`verticalListSortingStrategy`, `onDragOver` que só atualiza estado quando o alvo muda (não por pixel), **optimistic update** com snapshot/rollback, **reload silencioso** (spinner só no `firstLoad`), reorder via endpoint `/position`, e tratamento de drop na coluna "concluído" (com confirmação de cascata de subtarefas).
- **Modelo de dados** (`types.ts`) — já suporta todo o **visual** dos cards/colunas sem mudança de backend; a mudança de backend desta spec é **exclusiva da feature de views** (tabela `kanban_views`), não dos adornos:
  - `priority` (0–3) → barra de prioridade no card.
  - `due_date` / `due_time` → DateChip relativo.
  - `duration_min` → chip de estimativa + capacity meter + "tempo estimado" do rodapé.
  - `subtasks[]` (com `completed_at`) → anel de progresso.
  - `project_id` / `project_name` → chip de projeto.
  - `completed_at`, `column_id`, `position` → mecânica do board.
- **Motor de filtros existente a REUSAR** (não reimplementar): DSL de smart-lists em `types.ts` (`FilterField`, `FilterCondition`, `FilterRules`) + avaliação backend em `agents/kaguya/tools_filters.py` + endpoints `/api/tasks/filters/*`. O filtro inline da view usa o **mesmo formato `FilterRules`**.
- **Tweaks** (`Tweaks` em `types.ts`): `theme` (light/dark), `accent` (blue/pink/violet/gold), `density`, `pmark` (bar/dot/fill — estilo da marca de prioridade), `anim` (on/off), persistidos em localStorage via `TweaksPanel`. O redesign **deve respeitar** esses tweaks. A **view ativa por lista** segue o mesmo padrão de persistência local (localStorage), separada das views (que são server-side).
- **Fuso horário (CLAUDE.md):** datas "hoje/ontem" no card devem usar partes locais (UTC-3), nunca `toISOString()`. Reutilizar `todayLocalISO()` / o padrão já presente no `TaskCard` atual.

## Requisitos funcionais (falsificáveis)

### Board (`.kg-board` → estética "Vidro")
- **R1.** O container do board renderiza o gradiente do handoff: `radial-gradient(120% 90% at 12% 0%, oklch(0.56 0.13 252 / 0.10), transparent 46%), radial-gradient(120% 90% at 92% 8%, oklch(0.62 0.15 330 / 0.09), transparent 44%), linear-gradient(160deg, var(--mist), var(--paper) 60%)`, com `border-radius: 20px`, borda 1px e `min-height: 62vh`.
- **R2.** O board é flex vertical com dois filhos: a fileira horizontal de colunas (scroll horizontal no overflow) e o rodapé-resumo.

### Coluna (`.kg-col`)
- **R3.** Cada coluna usa frosted glass: `background: oklch(1 0.002 350 / 0.62)`, `backdrop-filter: blur(18px) saturate(1.4)`, borda `oklch(1 0 0 / 0.6)`, `border-radius: 20px`, sombra `0 1px 0 oklch(1 0 0 / 0.7) inset, 0 10px 34px oklch(0.32 0.05 348 / 0.10)`. Sizing `flex: 1 1 0; min-width: 270px; max-width: 360px`.
- **R4.** Cabeçalho da coluna mostra: **numeral grande de contagem** (`.kc-num`: fonte display, 30px, weight 800, line-height 0.9, letter-spacing -0.03em, tabular-nums), o **nome** da coluna (sans 13px/700) e uma **sub-linha mono** 10px: para colunas abertas, `Σ <tempo estimado total>` (soma de `duration_min`, formatado ex. "5.8h") ou "sem estimativa"; para a coluna concluído, "concluídas".
- **R5.** Estado **drop-target** (card arrastado sobre a coluna): borda vira o accent ativo + anel 2px de tint do accent.
- **R6.** **Capacity meter** (`.kcol-cap`), oculto na coluna concluído: 5 segmentos iguais (4px de altura, `flex: 1`, `gap: 3px`); nº de segmentos "ligados" = `round( min(somaDuration_min / 240, 1) * 5 )`; off = `opacity 0.2`, on = `opacity 0.7`. Cor dos segmentos = accent ativo (colunas não têm cor própria no schema).
- **R7.** Botão **adicionar tarefa** (`.kcol-add`), oculto na coluna concluído: largura total, borda tracejada, centralizado; cria tarefa na coluna (comportamento atual via prompt preservado).
- **R8. (excluído por decisão híbrida)** Badge WIP n/3 fixo NÃO é implementado (intrínseco ao modelo de coluna fixa). Os chips de filtro por projeto também NÃO (board é por lista).

### Card (`TaskCard` → `.kg-card`)
- **R9.** Card glass: `background: oklch(1 0.002 350 / 0.78)`, borda `oklch(1 0 0 / 0.7)`, `border-radius: 14px`, padding `13px 14px`, sombra `0 2px 10px oklch(0.32 0.05 348 / 0.07)`; hover eleva para `0 4px 16px oklch(0.32 0.05 348 / 0.13)` e clareia a borda (transição ~0.14s, respeitando `anim=off`).
- **R10.** **Barra de prioridade** no topo (inset 13px lateral), 2px, cor por prioridade; oculta quando prioridade 0. Deve respeitar o tweak `pmark` (bar/dot/fill) — o padrão "bar" reproduz o handoff.
- **R11.** Corpo do card: título (`.kg-card-title`, 13.5px, lh 1.4) + linha de meta (gap 11px, wrap) na ordem: **DateChip** relativo (só se `due_date`; "Hoje"/"Ontem"/"N dias atrás"/dia-da-semana, opcional "· HH:MM"; vencida em vermelho, hoje no accent — usando data local UTC-3), **estimativa** (`duration_min`, mono 11px, ex. "20min"/"1.5h", só se houver e não concluída), **projeto** (quadrado 7px com cor do projeto + nome, ellipsis). Tags NÃO aparecem no card glass.
- **R12.** **Indicador à direita** (mutuamente exclusivo): se concluída → círculo verde 18px (`--done`) com check branco; senão se tem subtarefas → **anel de progresso** SVG 30px (`ProgressRing`) com fração "n/m" centralizada (mono 8.5px), track `--line-2`, stroke `--done` 3px round, rotacionado -90°; senão → nada.
- **R13.** Estado concluído no card: fundo translúcido + título riscado/esmaecido. Card abre o detalhe ao clicar (`onOpen`) — o clique curto (< 5px) continua funcionando sem disparar drag.

### Rodapé-resumo (`.kg-summary`)
- **R14.** Barra frosted no rodapé do board: `border-top: 1px solid oklch(1 0 0 / 0.55)`, `background: oklch(1 0 0 / 0.4)`, `backdrop-filter: blur(10px)`, padding `13px 30px`, flex gap 26px, com divisores 1px de 22px.
- **R15.** Três slots de stat, cada um `.ks-v` (display 19px/800 tabular-nums) + `.ks-k` (mono 9px uppercase letter-spacing 0.1em, mutado). **A métrica de cada slot é definida pela view ativa** (R23). O catálogo de métricas disponíveis é: `abertas` (não concluídas no board), `tempo_estimado` (Σ `duration_min` das abertas, formatado, "—" se zero), `concluidas` (nº na coluna concluído), `concluidas_hoje` (`completed_at` = hoje, data local UTC-3), `em_andamento` (abertas fora da 1ª coluna). **Default da view "Completa":** slot1=`abertas`, slot2=`tempo_estimado`, slot3=`em_andamento` (análogo fiel ao "em foco agora" do handoff no modelo de colunas configuráveis). Todos os slots recalculam com o filtro da view aplicado.

### Tema e tokens
- **R16.** Todos os tokens OKLCH do handoff (cor, tipografia, espaçamento, raio, sombra) são reproduzidos fielmente — ver `design_handoff_kaguya_kanban/README.md` §Design Tokens e `source/styles.css` (buscar `Kanban · "Vidro"`).
- **R17.** Suporte a **light e dark**: os overrides dark do handoff (`[data-theme='dark']` para `.board/.kcol/.kcard/.ksummary`) são aplicados, integrados ao tweak `theme` do shell.
- **R18.** Fontes do handoff disponíveis via pipeline do app: **Hanken Grotesk** (numerais/valores), **DM Sans** (corpo/UI), **DM Mono** (labels/tempo/frações).

### Performance (NÃO regredir — preservar e, se possível, melhorar)
- **R19.** Mantidos: `PointerSensor` 5px, `DragOverlay`, `SortableContext`, `onDragOver` sem setState por pixel, **optimistic update** com snapshot/rollback, **reload silencioso** (spinner só no `firstLoad`), reorder via `/position`, e o fluxo de drop em "concluído" com confirmação de cascata.
- **R20.** O `backdrop-filter: blur` das colunas/cards/rodapé **não pode** causar travamento perceptível durante o drag. Limitar camadas de blur e evitar repaint do board inteiro a cada frame (ex.: o card arrastado/overlay não recalcula blur de toda a coluna). Critério: drag visualmente fluido (~60fps) num board com ≥ 30 cards.

### Views de Kanban configuráveis (R21–R29) — feature nova desta spec
- **R21. Modelo de dados.** Nova tabela **`kanban_views`** (sem `project_id` — views são globais): `id`, `name`, `is_builtin` (bool), `display` (JSON: adornos visíveis + 3 chaves de métrica dos slots do rodapé), `filter` (JSON `FilterRules`, nullable), `position`, `created_at`. Schema vive em `agents/kaguya/schema_tasks_pg.sql`. **Seed obrigatório:** uma view built-in **"Completa"** (`is_builtin=true`, todos os adornos ligados, slots = default da R15, `filter=null`).
- **R22. Endpoints** `/api/tasks/kanban-views/*` no router de tarefas: `GET` (lista), `POST` (cria), `PATCH /{id}` (edita), `DELETE /{id}` (remove). Seguem o padrão do `webapp/CLAUDE.md`: `Depends(require_user)` em todas, bodies Pydantic, `_check_result`. A view built-in **não pode ser deletada nem renomeada** (HTTP 400).
- **R23. Configuração de exibição.** O JSON `display` controla, por toggle on/off, a renderização de: capacity meter (R6), anel de subtarefas (R12), rodapé-resumo (R14/R15) e chips do card (data/estimativa/projeto da R11). Os 3 slots do rodapé guardam chaves do catálogo de métricas da R15. Adorno desligado simplesmente não renderiza (sem buraco de layout).
- **R24. Filtro da view.** `filter` é um `FilterRules` opcional aplicado às tarefas do board (reusa o motor/semântica do DSL existente — R do Contexto). Cards que não casam são ocultados; **contadores de coluna, capacity meter e slots do rodapé recalculam sobre o conjunto filtrado**. `filter=null` → mostra tudo. A estratégia de avaliação (client-side vs reaproveitar avaliação server-side) é decisão de plan-phase, mas **deve usar a mesma semântica do DSL** (nada de reimplementar regras).
- **R25. Seletor de view.** O cabeçalho da tela Kanban exibe um seletor das views disponíveis, indica a ativa e permite trocar. A **view ativa é persistida por lista em localStorage** (chave por `project_id`); ao reabrir o board daquela lista, restaura a última view usada.
- **R26. Gerenciamento de views (UI).** Criar (nome + escolher adornos + métricas dos slots + filtro opcional), editar e deletar (exceto built-in). Posicionamento exato (cabeçalho do board, menu próprio e/ou `TweaksPanel`) é decisão de UI/plan-phase, mas deve seguir o shell pattern do Kaguya.
- **R27. Default e fidelidade.** Board de uma lista sem view ativa armazenada abre na built-in **"Completa"**. O critério de fidelidade A1 é medido **nessa view** (todos os adornos ligados).
- **R28. Colunas fora da view.** Trocar de view **nunca** altera a estrutura/ordem de colunas (propriedade da lista). A view só muda adornos, métricas e filtro.
- **R29. Camada de API e tipos.** O CRUD de views usa métodos novos no `kaguyaApi` (nunca `fetch` cru). Tipos novos em `types.ts` (ex.: `KanbanView`, `KanbanViewDisplay`, união de chaves de métrica de slot).

## Fora de escopo (boundaries)

- Badge WIP n/3 fixo e chips de filtro por projeto (decisão híbrida — intrínsecos ao modelo de coluna fixa). O filtro da view (R24) cobre a necessidade de filtragem de outra forma.
- ~~Qualquer mudança de schema/endpoint do backend~~ — **REVOGADO** na Session 2026-06-18: a feature de views (R21–R29) inclui a tabela `kanban_views` + endpoints `/api/tasks/kanban-views/*`. A mudança de backend está **restrita à feature de views**; os adornos visuais continuam sem exigir backend novo.
- Layout/ordem de colunas por view — fora (colunas são da lista; R28).
- Ordenação de cards configurável por view — fora desta spec (cards seguem a ordenação atual por `position`).
- Mudança no fluxo de criação de tarefa/coluna (continua via `window.prompt`; só o estilo do botão muda).
- Migração do modelo de colunas configuráveis para colunas de status fixas.
- Telas vizinhas do shell (Hoje, Calendário, Eisenhower, etc.) — fora desta spec.

## Critérios de aceitação (verificáveis)

- **A1.** Abrir o Kanban de uma lista (na view built-in **"Completa"**, o default) com várias colunas e cards reproduz o visual do `preview-vidro.png` / `Kaguya - Tarefas.html` (glass, gradiente, numerais grandes, cards glass) de forma pixel-fiel nos tokens (cor/tipografia/raio/sombra) — comparável lado a lado com o handoff.
- **A2.** Colunas exibem numeral de contagem correto, sub-linha `Σ tempo` / "sem estimativa" / "concluídas", e capacity meter com o nº de segmentos = fórmula da R6.
- **A3.** Cards exibem barra de prioridade (respeitando `pmark`), DateChip relativo correto (com data local UTC-3, vencida em vermelho), chip de estimativa, chip de projeto com cor, e anel de subtarefas com fração correta; card concluído mostra o check verde.
- **A4.** Rodapé-resumo mostra as 3 métricas **definidas pela view ativa**, calculadas corretamente (catálogo da R15) e recalculadas ao mudar o board e ao aplicar o filtro da view.
- **A5.** Light e dark renderizam corretamente conforme o tweak `theme`; `anim=off` desativa as transições de hover.
- **A6.** Drag entre colunas e reordenação dentro da coluna continuam funcionando com: overlay seguindo o cursor, movimento otimista imediato, sem spinner no drop, rollback em erro de rede, e drop em "concluído" completando a tarefa (com confirmação de cascata). Sem regressão de fluidez vs. a versão atual (R20).
- **A7.** As chamadas de board existentes seguem funcionando (`listColumns`, `listTasks`, `updateTask`, `reorder`, `complete`, `createTask`, `createColumn`, `updateColumn`); as **únicas** chamadas novas são o CRUD de views (`/api/tasks/kanban-views/*`), sempre via `kaguyaApi`.
- **A8.** Existe a view built-in "Completa" após a migração (seed); ela não pode ser deletada nem renomeada (a tentativa retorna erro). Criar, editar e deletar views customizadas funciona e persiste no backend.
- **A9.** Trocar de view no seletor altera adornos visíveis, métricas dos slots e filtro aplicado **sem** alterar a estrutura de colunas; a troca é imediata (sem recarregar a página).
- **A10.** A view ativa é lembrada por lista: reabrir o board de uma lista restaura a última view usada nela (localStorage); listas diferentes podem ter views ativas diferentes.
- **A11.** Aplicar uma view com filtro oculta os cards que não casam e os contadores de coluna, capacity meter e slots do rodapé refletem o conjunto filtrado; a semântica do filtro é idêntica à das smart-lists (mesmo DSL).

## Questões abertas (resolver em discuss-phase)

- **Q-A. ~~3º stat do rodapé~~ — RESOLVIDA (Session 2026-06-18).** Os slots do rodapé são configuráveis pela view (R15/R23); o default da view "Completa" usa slot3 = `em_andamento` (abertas fora da 1ª coluna), análogo fiel ao "em foco agora" do handoff.
- **Q-B. Origem da cor do capacity meter / dot do nome da coluna.** Colunas não têm campo de cor no schema. **Default:** usar o accent ativo (sem mudança de backend para isso). Alternativa (adicionar cor de coluna) fica fora do escopo desta spec. Confirmar em discuss-phase.

## Referências

- Handoff: `specs/024-kanban-rework/design_handoff_kaguya_kanban/` (README.md = fonte da verdade de medidas/cor/interação; `Kaguya - Tarefas.html` = protótipo autoritativo; `source/screens-board.jsx`, `source/components.jsx`, `source/styles.css`, `source/ui.jsx`, `source/data.js`).
- Implementação atual: `webapp/frontend/src/pages/kaguya/screens/KanbanScreen.tsx`, `components/TaskCard.tsx`, `components/SortableTaskCard.tsx`, `types.ts`.
- Convenções: `webapp/CLAUDE.md` (shell pattern, CSS por domínio, API por domínio), `CLAUDE.md` raiz (fuso UTC-3).
