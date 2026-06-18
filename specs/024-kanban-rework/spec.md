# SPEC — 024 · Kanban "Vidro" (redesign do board do Kaguya)

> **Como este SPEC foi produzido.** O runtime do `gsd-spec-phase` (`~/.claude/get-shit-done/workflows/` + `templates/`) não está instalado nesta máquina, então o workflow oficial (loop Socrático + ambiguity scoring automático) não pôde rodar. Este SPEC reproduz o método manualmente: scout do codebase + entrevista de decisão + requisitos falsificáveis. Convenção de pasta segue a do repo (`specs/NNN-*/`), não `.planning/`.

## Objetivo (WHAT / WHY)

Reescrever a tela **Kanban** do Kaguya (`webapp/frontend/src/pages/kaguya/screens/KanbanScreen.tsx`) para o visual **"Vidro" (Glass)** definido no handoff em `specs/024-kanban-rework/design_handoff_kaguya_kanban/`, **mantendo o modelo de board atual** (por lista, colunas configuráveis pelo usuário) e **preservando integralmente as otimizações de performance** do drag-and-drop já implementadas com `@dnd-kit` (commit `dcc65db`).

**Por quê:** o board atual usa colunas cinzas planas. O redesign "Vidro" entrega um tratamento minimalista (frosted glass sobre gradiente, numerais grandes de contagem, capacity meter, anel de progresso de subtarefas, rodapé-resumo) que eleva a qualidade visual ao nível dos outros domínios (Violet, Nami, Frieren) sem regredir a fluidez do drag.

## Decisões de escopo (travadas com o usuário)

1. **Modelo de board: HÍBRIDO.** Mantém colunas configuráveis por lista (modelo atual). Adota o máximo do visual e dos componentes do handoff que façam sentido nesse modelo. Abre mão **apenas** do que é intrínseco ao modelo de colunas fixas cross-project do handoff: o badge **WIP n/3** fixo na coluna "Fazendo" e os **chips de filtro por projeto** (o board já está escopado a uma lista).
2. **Componentes incluídos (todos os 4):** anel de progresso de subtarefas, capacity meter por coluna, rodapé-resumo do board, chips de estimativa/data/projeto no card.
3. **DnD:** continua em `@dnd-kit` — o próprio handoff autoriza ("use a lib preferida do codebase"). Nenhuma regressão de performance é aceitável.

## Contexto / Estado atual

- **Board atual** (`KanbanScreen.tsx`): por lista (`projectId`), colunas configuráveis (`Column { id, name, position, is_done_column }` — **sem campo de cor**), uma coluna "concluído" alternável. DnD via `@dnd-kit` com: `PointerSensor` (ativação a 5px), `DragOverlay`, `SortableContext`/`verticalListSortingStrategy`, `onDragOver` que só atualiza estado quando o alvo muda (não por pixel), **optimistic update** com snapshot/rollback, **reload silencioso** (spinner só no `firstLoad`), reorder via endpoint `/position`, e tratamento de drop na coluna "concluído" (com confirmação de cascata de subtarefas).
- **Modelo de dados** (`types.ts`) — já suporta tudo que o visual exige, **sem mudança de backend**:
  - `priority` (0–3) → barra de prioridade no card.
  - `due_date` / `due_time` → DateChip relativo.
  - `duration_min` → chip de estimativa + capacity meter + "tempo estimado" do rodapé.
  - `subtasks[]` (com `completed_at`) → anel de progresso.
  - `project_id` / `project_name` → chip de projeto.
  - `completed_at`, `column_id`, `position` → mecânica do board.
- **Tweaks** (`Tweaks` em `types.ts`): `theme` (light/dark), `accent` (blue/pink/violet/gold), `density`, `pmark` (bar/dot/fill — estilo da marca de prioridade), `anim` (on/off). O redesign **deve respeitar** esses tweaks.
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
- **R15.** Três stats, cada um `.ks-v` (display 19px/800 tabular-nums) + `.ks-k` (mono 9px uppercase letter-spacing 0.1em, mutado): (1) **tarefas abertas** (não concluídas no board), (2) **tempo estimado** (Σ `duration_min` das abertas, formatado, "—" se zero), (3) **3º stat** — ver Questão Aberta Q-A.

### Tema e tokens
- **R16.** Todos os tokens OKLCH do handoff (cor, tipografia, espaçamento, raio, sombra) são reproduzidos fielmente — ver `design_handoff_kaguya_kanban/README.md` §Design Tokens e `source/styles.css` (buscar `Kanban · "Vidro"`).
- **R17.** Suporte a **light e dark**: os overrides dark do handoff (`[data-theme='dark']` para `.board/.kcol/.kcard/.ksummary`) são aplicados, integrados ao tweak `theme` do shell.
- **R18.** Fontes do handoff disponíveis via pipeline do app: **Hanken Grotesk** (numerais/valores), **DM Sans** (corpo/UI), **DM Mono** (labels/tempo/frações).

### Performance (NÃO regredir — preservar e, se possível, melhorar)
- **R19.** Mantidos: `PointerSensor` 5px, `DragOverlay`, `SortableContext`, `onDragOver` sem setState por pixel, **optimistic update** com snapshot/rollback, **reload silencioso** (spinner só no `firstLoad`), reorder via `/position`, e o fluxo de drop em "concluído" com confirmação de cascata.
- **R20.** O `backdrop-filter: blur` das colunas/cards/rodapé **não pode** causar travamento perceptível durante o drag. Limitar camadas de blur e evitar repaint do board inteiro a cada frame (ex.: o card arrastado/overlay não recalcula blur de toda a coluna). Critério: drag visualmente fluido (~60fps) num board com ≥ 30 cards.

## Fora de escopo (boundaries)

- Badge WIP n/3 fixo e chips de filtro por projeto (decisão híbrida — intrínsecos ao modelo de coluna fixa).
- Qualquer mudança de schema/endpoint do backend (`/api/tasks/*`) — o redesign é só frontend.
- Mudança no fluxo de criação de tarefa/coluna (continua via `window.prompt`; só o estilo do botão muda).
- Migração do modelo de colunas configuráveis para colunas de status fixas.
- Telas vizinhas do shell (Hoje, Calendário, Eisenhower, etc.) — fora desta spec.

## Critérios de aceitação (verificáveis)

- **A1.** Abrir o Kanban de uma lista com várias colunas e cards reproduz o visual do `preview-vidro.png` / `Kaguya - Tarefas.html` (glass, gradiente, numerais grandes, cards glass) de forma pixel-fiel nos tokens (cor/tipografia/raio/sombra) — comparável lado a lado com o handoff.
- **A2.** Colunas exibem numeral de contagem correto, sub-linha `Σ tempo` / "sem estimativa" / "concluídas", e capacity meter com o nº de segmentos = fórmula da R6.
- **A3.** Cards exibem barra de prioridade (respeitando `pmark`), DateChip relativo correto (com data local UTC-3, vencida em vermelho), chip de estimativa, chip de projeto com cor, e anel de subtarefas com fração correta; card concluído mostra o check verde.
- **A4.** Rodapé-resumo mostra os 3 stats corretos e recalcula ao mudar o board.
- **A5.** Light e dark renderizam corretamente conforme o tweak `theme`; `anim=off` desativa as transições de hover.
- **A6.** Drag entre colunas e reordenação dentro da coluna continuam funcionando com: overlay seguindo o cursor, movimento otimista imediato, sem spinner no drop, rollback em erro de rede, e drop em "concluído" completando a tarefa (com confirmação de cascata). Sem regressão de fluidez vs. a versão atual (R20).
- **A7.** Nenhuma chamada nova ao backend além das já existentes (`listColumns`, `listTasks`, `updateTask`, `reorder`, `complete`, `createTask`, `createColumn`, `updateColumn`).

## Questões abertas (resolver em discuss-phase)

- **Q-A. 3º stat do rodapé.** No handoff é "em foco agora" = nº de tarefas na coluna fixa "Fazendo". No modelo híbrido não há coluna "Fazendo" fixa. Candidatos: (a) "concluídas" = nº na coluna concluído; (b) "em andamento" = abertas fora da 1ª coluna (Backlog) e não concluídas; (c) permitir marcar uma coluna como "em foco" (análogo ao toggle de coluna concluído). **Default provisório:** (a) "concluídas". Travar em discuss-phase.
- **Q-B. Origem da cor do capacity meter / dot do nome da coluna.** Colunas não têm campo de cor no schema. Default: usar o accent ativo. Alternativa: adicionar cor de coluna (exigiria mudança de backend → violaria o boundary). **Default:** accent ativo, sem mudança de backend.

## Referências

- Handoff: `specs/024-kanban-rework/design_handoff_kaguya_kanban/` (README.md = fonte da verdade de medidas/cor/interação; `Kaguya - Tarefas.html` = protótipo autoritativo; `source/screens-board.jsx`, `source/components.jsx`, `source/styles.css`, `source/ui.jsx`, `source/data.js`).
- Implementação atual: `webapp/frontend/src/pages/kaguya/screens/KanbanScreen.tsx`, `components/TaskCard.tsx`, `components/SortableTaskCard.tsx`, `types.ts`.
- Convenções: `webapp/CLAUDE.md` (shell pattern, CSS por domínio, API por domínio), `CLAUDE.md` raiz (fuso UTC-3).
