# Handoff: Kaguya — Tarefas

> **Para o Claude Code:** Os arquivos deste pacote são um **protótipo de design de alta fidelidade** (React/Babel inline, dados em memória). A tarefa é **reimplementar no stack real** (FastAPI + PostgreSQL + frontend React do webapp), seguindo o padrão dos outros shells. Não copie o HTML diretamente — use este documento + os arquivos de referência para fidelidade pixel-a-pixel. Esta é a **spec filha 011 (MVP)** e adjacentes da spec master `010-kaguya-tasks-app`.

---

## 1. Visão geral

**Kaguya — Tarefas** é o **quarto shell** do **Makima Web App** (depois de Violet/diário, Nami/finanças, Frieren/livros). Sistema de tarefas próprio que substitui o TickTick: o PostgreSQL local é o source of truth. Princípio central: **"uma tarefa, várias views"** (lista, Kanban, calendar, Eisenhower, Meu Dia, hábitos).

Estética: **"papelaria aristocrática"** — marfim levemente rosado + **acento azul** (configurável) + lacres semânticos. Tipo display **Hanken Grotesk** para títulos, **Playfair Display** só na marca lateral, **DM Sans** no corpo, **DM Mono** em datas/contadores/atalhos.

### Stack do protótipo (referência, não produção)
- React 18 + Babel standalone (JSX inline, sem bundler)
- CSS custom properties escopadas em `.kg-app` (tokens não vazam para outros shells)
- Dados em memória (arrays JS mutáveis em `kaguya/data.js`)
- Fontes: Google Fonts (Hanken Grotesk, Playfair Display, DM Sans, DM Mono)

### Arquitetura de arquivos do protótipo
```
Kaguya - Tarefas.html        ← entry point (carrega fontes + scripts na ordem)
kaguya/
  styles.css                 ← todo o sistema visual (tokens .kg-app, claro/escuro)
  data.js                    ← mock data + parser pt-BR + helpers (sem JSX)
  ui.jsx                     ← Icon, Check, PrioFlag, chips, StrengthRing, Heatmap, ParseMirror
  components.jsx             ← TaskRow, TaskCard, QuickAdd, CommandPalette, Toast
  modals.jsx                 ← Scrim, TaskModal, ProjectModal (lista), FilterModal
  screens-today.jsx          ← Meu Dia (capacity + timeline + time-blocking)
  screens-list.jsx           ← Lista (estilo Linear)
  screens-board.jsx          ← Kanban (drag-and-drop entre colunas)
  screens-cal.jsx            ← Calendar (mês/semana) + Eisenhower
  screens-habits.jsx         ← Hábitos (força + heatmap)
  app.jsx                    ← shell, sidebar do domínio, roteamento por estado, recorrência, tweaks
  kaguya.jpg                 ← retrato da Kaguya (hero + brand mark)
tweaks-panel.jsx             ← painel de Tweaks reutilizável (host protocol)
```
Cada arquivo `.jsx` exporta para `window` via `Object.assign` no final (escopos isolados do Babel). Ordem de carregamento importa: `data.js` → `ui.jsx` → `tweaks-panel.jsx` → `components.jsx` → `modals.jsx` → screens → `app.jsx`.

> **Regra dos shells** (`src/pages/CLAUDE.md`): componentes são **copiados e adaptados** por domínio, não importados entre shells. Pasta `pages/kaguya/`, raiz `KaguyaShell.tsx`, rota `/tasks/*`, navegação interna por estado local `{view, param}` (sem React Router). Client em `kaguya/kaguyaApi.ts` sobre `lib/api.ts` (nunca `fetch` direto).

---

## 2. Design Tokens

### Tipografia
| Função | Família | Uso |
|---|---|---|
| `--display` | **Hanken Grotesk** | Títulos de tela, números grandes, headings |
| `--serif` | **Playfair Display** | **Só** o wordmark "Kaguya" na sidebar |
| `--sans` | DM Sans | Corpo, labels, botões, itens de lista |
| `--mono` | DM Mono | Datas, contadores, atalhos de teclado, rótulos uppercase |

Escala: título de página 28px/800 · título de seção 18px/700 · linha de tarefa 13.5px · chip/mono 10–11px · hero 26–36px clamp.

### Cores — Tema Claro (marfim rosado), OKLCH
```
/* superfícies */
--paper:   oklch(0.991 0.005 350)   /* fundo principal */
--paper-2: oklch(0.974 0.008 350)   /* sidebar */
--card:    oklch(1 0.001 350)
--card-2:  oklch(0.978 0.007 350)
--mist:    oklch(0.962 0.016 348)   /* hero */
/* tinta (ameixa profunda) */
--ink:   oklch(0.275 0.020 348)   --ink-2: oklch(0.452 0.018 348)
--ink-3: oklch(0.595 0.015 348)   --ink-4: oklch(0.715 0.012 348)
/* linhas */
--line: oklch(0.905 0.011 348)    --line-2: oklch(0.944 0.008 348)
/* acento (AZUL — padrão; trocável via Tweaks/JS) */
--kg:        oklch(0.56 0.13 252)   --kg-deep: oklch(0.47 0.13 254)
--kg-bright: oklch(0.69 0.12 250)
--kg-tint:   oklch(0.56 0.13 252 / 0.12)   --kg-tint-2: oklch(0.56 0.13 252 / 0.20)
/* prioridade (semântica) */
--p-high: oklch(0.575 0.195 22)    /* lacre — alta / vencida */
--p-med:  oklch(0.735 0.135 78)    /* dourado — média */
--p-low:  oklch(0.585 0.085 250)   /* ardósia — baixa */
--done:   oklch(0.615 0.115 158)   /* esmeralda — concluído */
```
Cada prioridade tem variante `-t` (tint ~0.13–0.16 alpha).

### Cores — Tema Escuro ("noite de palácio")
```
--paper: oklch(0.185 0.022 320)   --paper-2: oklch(0.215 0.024 322)   --card: oklch(0.238 0.024 322)
--ink:   oklch(0.945 0.012 340)
--kg:    oklch(0.72 0.125 252)     /* acento ganha luminância */
--p-high:oklch(0.70 0.185 25)  --p-med: oklch(0.80 0.128 82)  --p-low: oklch(0.70 0.090 248)  --done: oklch(0.74 0.125 158)
```
Aplicado via `data-theme="dark"` no `.kg-app`. Só os tokens trocam — nenhuma mudança estrutural.

### Acento configurável
4 opções no Tweaks, mapeadas em `PALETTE_MAP` (`app.jsx`) que sobrescreve `--kg*` via JS:
`#3B82C4` azul (padrão) · `#EC4899` rosa Kaguya · `#8B5CF6` violeta · `#C9A227` dourado.

### Raios e sombras
```
--kg-r-sm: 7px   --kg-r-md: 12px   --kg-r-lg: 18px
--shadow-sm / --shadow-md / --shadow-lg  (suaves, hue 350; mais densas no dark)
```

---

## 3. Modelo de Dados

### Task (`tasks`) — núcleo
```
id              uuid
title           string
type            'task' | 'event' | 'birthday'      ← NOVO: tipo de tarefa
project_id      FK → task_projects (Inbox default)
column_id       FK → task_columns (kanban; default 'todo'/primeira)
parent_id       FK → tasks (subtarefa; nullable)   ← subtarefas são tasks ricas
priority        0..3  (nenhuma | baixa | média | alta)
due_date        date?      due_time   time?         (hora opcional)
duration_min    int?       (estimativa — já no schema da Fase 1)
start_at        time?      (time-blocking do Meu Dia)
position        int        (ordenação manual esparsa ×1000)
notes           text
today           bool       (selecionada para "Meu Dia")
completed_at    timestamp? (conclusão registra o momento)
deleted_at      timestamp? (soft delete)
created_at      timestamp
```
**Subtarefas** no protótipo são objetos aninhados `{id, title, done, prio, notes}` — no backend devem ser `tasks` com `parent_id` (1 nível), com **prioridade e descrição próprias** (são "mini-projetos" de uma parent). Tags N:N (`task_tag_links`).

### Recurrence (`task_recurrences`) — 1:1 com a task viva
```
task_id   FK
mode      'fixed' | 'after_completion'
rule      RRULE iCal  (ex.: 'todo dia 10', 'toda sexta', 'a cada 3 dias', 'mensal', 'anual')
active    bool
```

### Project / Lista (`task_projects`)
```
id   name   color(oklch)   icon   group_id(FK task_project_groups, nullable)
```
> No protótipo chamamos a entidade de **"Lista"** na UI (a sidebar diz "Listas"). Uma visão de *projetos* de verdade virá depois. Internamente o id/coluna continua `project`. Inbox é seed indelével, sempre no topo.

### Group (`task_project_groups`)
`id, name` — 1 nível (Pessoal, Crescimento, Vida prática). Listas agrupadas sob eles na sidebar.

### Column (`task_columns`) — Kanban
`id, name, color, is_done_column`. Default global no protótipo: Backlog · Esta semana · Fazendo · **Concluído** (`is_done`). Soltar card em coluna `is_done` completa a tarefa.

### Tag (`task_tags` + `task_tag_links`)
`name, color`. N:N com tasks. Ex.: foco, 5min, alta-energia, recados, profundo, compras, ligar.

### Filter / Smart list (`task_filters`)
`id, name, icon, rules(DSL declarativa), default_view`. Objetos de primeira classe na sidebar. Protótipo: predicado `test(task)`. Seeds: "Hoje + Vencidas", "Esta semana", "Alta energia", "5 minutos".

### Habit (`habits`) + Checkin (`habit_checkins`)
```
habit:   id, name, icon, color, freq_num/freq_den (ex 5/7), type(sim-não | mensurável), target_value, unit
checkin: habit_id, date, value(>0 = cumprido; número p/ mensurável)
```

### Event (Google Calendar via MCP)
Leitura do Calendar (`{day, start, end, title}`) para capacity/time-blocking. Tasks `type='event'`/`'birthday'` são tarefas próprias — distintas dos eventos do Google.

---

## 4. Endpoints de API (`/api/tasks/*`)
```
GET    /api/tasks?view=&project=&filter=&include_done=
POST   /api/tasks                         # cria (aceita parsing do quick-add já resolvido)
PATCH  /api/tasks/:id                      # editar / mover / completar / reabrir / time-block
DELETE /api/tasks/:id                      # soft delete
POST   /api/tasks/:id/complete             # completa; se recorrente, gera próxima ocorrência (backend!)
POST   /api/tasks/:id/subtasks             # subtarefa (parent_id)
GET    /api/projects   POST /api/projects   PATCH/DELETE :id   # "listas"
GET    /api/project-groups
GET    /api/columns    PATCH /api/columns/:id
GET    /api/tags       POST /api/tags
GET    /api/filters    POST /api/filters   DELETE :id          # smart lists
GET    /api/habits     POST /api/habits    POST /api/habits/:id/checkin
GET    /api/calendar?from=&to=             # eventos do Google (MCP), capacity
```
Padrão do repo: mutações retornam `{status:"ok"|"error", ...}`; listagens retornam dado direto (atenção ao `_check_result` — só onde há `status`). Cookie `makima_session` incluso pelo `lib/api.ts`.

---

## 5. Layout — Shell
```
┌───────────────────────────────────────────────────────────────┐
│ SIDEBAR (248px)        │ TOPBAR (56px, sticky, blur)           │
│ ● foto + Kaguya        │ ●título | (Mês/Semana no Calendar) | ⌘K│
│ [ + Nova tarefa   C ]  ├───────────────────────────────────────┤
│ VIEWS                  │ KG-SCROLL (página ativa)              │
│  ☀ Meu Dia             │  · max-width 1080px (1320 nas wide)   │
│  ▦ Kanban              │                                       │
│  ▤ Calendário          │                                       │
│  ⊞ Eisenhower          │                                       │
│ SMART LISTS  [+]       │                                       │
│  ☀ Hoje+Vencidas   7   │                                       │
│  … filtros salvos      │                                       │
│ LISTAS  [+]            │                                       │
│  • Inbox           1   │                                       │
│  ‹Pessoal›  Casa/Social/Saúde                                  │
│  ‹Crescimento› Estudos/Conhecimento/Arte                       │
│  ‹Vida prática› Finanças                                       │
│  ─────                 │                                       │
│  ↻ Hábitos             │                                       │
│ · Voltar à Makima      │                                       │
└───────────────────────────────────────────────────────────────┘
```
**Views fixas** (built-ins): Meu Dia · Kanban · Calendário · Eisenhower. **Smart lists** e **Listas** abrem a `ListScreen` com `scope` apropriado. Hábitos é entrada única.

---

## 6. Telas em detalhe

### 6.1 Meu Dia (ref. Sunsama) — `screens-today.jsx`
- **Hero**: eyebrow "Meu Dia · saudação", data por extenso (Hanken 800), sub com totais, **3 stats** (no plano / estimado / folga-ou-acima) e o **retrato da Kaguya** (`kaguya.jpg`) emoldurado à direita. *(Sem stepper de ritual — foi removido por feedback.)*
- **Pendências de ontem** (inline, só se houver): review-cards com ações **Hoje / Amanhã / Depois**.
- **Quick-add** + **No plano de hoje** (plan-cards arrastáveis) + **Sugestões** (vencem em breve, botão "+ Puxar").
- Coluna direita sticky: **CapacityBar** (soma de estimativas + agenda vs. janela livre 8h–22h; excedeu → avança em vermelho-lacre) e **DayTimeline** (07h–23h; arrastar plan-card para uma hora preenche `start_at`/`due_time` = time-blocking).

### 6.2 Lista (ref. Linear) — `screens-list.jsx`
- Linhas densas: checkbox circular, traço de prioridade à esquerda, título, chips (tags, lista, data colorida por urgência, estimativa). Edição **inline** do título (clique no texto).
- **Subtarefas aparecem expandidas por padrão** (`defaultSubOpen`), "quase tanto quanto a parent": cada uma com seu **traço/bandeira de prioridade** e **descrição** sob o título. Clique abre o modal da parent (onde edita prioridade/descrição da subtarefa).
- Agrupamento por lista (colapsável) ou flat quando a scope é uma lista única. Filtros por prioridade, "Concluídas", ordenação (Inteligente / Vencimento / Prioridade / Manual).

### 6.3 Kanban (ref. Linear/Vikunja) — `screens-board.jsx`
- Colunas globais; **TaskCard** com título + chips mínimos + traço de prioridade. **Drag-and-drop** entre colunas (HTML5). Soltar em **Concluído** completa; arrastar de Concluído reabre. Filtro por lista. Posições esparsas.

### 6.4 Calendário (ref. TickTick) — `screens-cal.jsx`
- **Mês** (pills por dia: eventos + tarefas + ghosts) e **Semana** (grade horária). Toggle no topbar.
- Recorrentes futuras = **ocorrências virtuais (fantasma)**: opacidade reduzida, ícone `loop`, projetadas da regra (não persistidas). Tarefas `type='event'` aparecem como eventos.

### 6.5 Eisenhower (view derivada) — `screens-cal.jsx`
- Grade 2×2 derivada de **prioridade × urgência** (urgente = vence ≤2 dias; importante = prioridade ≥ média).
- **Fundos graduados por urgência**: "Faça agora" lacre (mais intenso) → "Agende" dourado → "Resolva rápido" ardósia → "Depois" neutro.
- Drag entre quadrantes **ajusta os campos derivados** (mover p/ importante sobe prioridade; mover p/ não-urgente empurra a data). A matriz é uma view, não um campo novo.

### 6.6 Hábitos (ref. Loop) — `screens-habits.jsx`
- Card com **anel de força** (não streak), check-in num toque (sim/não) ou **stepper de valor** (mensurável), dots da semana, **heatmap anual** (padrão Frieren) e rodapé (força %, sequência, semana x/y).

### 6.7 Command Palette (⌘K, ref. Todoist+Linear) — `components.jsx`
- Campo único que **cria, busca e navega**. Parsing pt-BR com highlight ao vivo. ↑↓ navegam, ↵ executa, esc fecha.

---

## 7. Parser determinístico pt-BR (`parseTask` em `data.js`)
Sem LLM (o NLP fica no Telegram/Gemini). Tokeniza preservando posições para o **highlight ao vivo** (mirror sobre o input). Devolve `{title, due, time, tags, project, prio, recur, segments[]}`.

| Token | Exemplos | Resultado |
|---|---|---|
| Data relativa | `hoje`, `amanhã`, `sexta`/`sex`, `dia 5` | `due` |
| Hora | `17h`, `9h30`, `9:30` | `time` |
| Tag | `#foco` | `tags[]` |
| Prioridade | `!alta` `!média` `!baixa` | `prio` 3/2/1 |
| Lista | `@estudos` | `project` |
| Recorrência | `todo dia 10`, `toda sexta`, `a cada 2 dias`, `todo mês` | `recur{mode,rule,label}` |

Cada token reconhecido vira um `segment` com classe (`tok-date`, `tok-time`, `tok-tag`, `tok-proj`, `tok-prio-*`) colorida no mirror.

---

## 8. Recorrência — semântica Todoist (regra no BACKEND)
O frontend **nunca** implementa a regra de recorrência: ao completar uma recorrente, chama o endpoint e re-renderiza com o que voltar. No protótipo, `nextOccurrence()` (em `app.jsx`) demonstra a intenção. Edge cases (do spec master) que o backend deve cobrir:
- `fixed`: âncora não muda por reagendamento pontual; completar adiantado/atrasado consome **uma** ocorrência (puladas não acumulam).
- `after_completion`: próxima sempre a partir da **data de conclusão real**.
- Subtarefas **resetam** (não concluídas) na nova ocorrência. Fim de série desativa a regra (preserva histórico). Só a próxima ocorrência existe como linha viva; futuras são virtuais.

---

## 9. Força do hábito — fórmula Loop (perdoa falhas)
`habitStrength()` em `data.js`: decaimento suave com meia-vida ~13 dias, **normalizado pela meta de frequência** (não é streak que zera). Um hábito com ~80% de aderência permanece alto após uma falha isolada.
```
mult = 0.5^(1/13)            # decai por dia
actual = Σ decay(check_no_dia)
ideal  = Σ decay(meta freq_num/freq_den)
força  = clamp(actual / ideal, 0..1)
```

---

## 10. Componentes compartilhados
- **TaskRow** (coração): checkbox com **pop bounce** ao concluir + linha **fade/slide-out** (~250ms, Things 3); respeita `prefers-reduced-motion` e o tweak de animações. Glyph de tipo (evento/aniversário). Subtarefas ricas.
- **TaskCard** (Kanban), **QuickAdd** (parser + mirror + preview chips), **CommandPalette**, **Toast**.
- **Modais** (padrão `FormModal` schema-driven da Nami): **TaskModal** (tipo, prioridade, lista, estimativa, data/hora, repetição, tags, **subtarefas com prioridade+descrição**, notas), **ProjectModal** ("lista": nome, grupo, cor, ícone), **FilterModal** (smart list).
- **Primitivos** (`ui.jsx`): Icon (paths inline — substituir por Lucide/Heroicons no backend mantendo os nomes), Check, PrioFlag, TagChip/DateChip/ProjChip, StrengthRing, Heatmap, ParseMirror.

---

## 11. Comportamentos globais & Tweaks
`data-*` no `.kg-app`: `data-theme` (light/dark), `data-density` (compacta/confortavel), `data-pmark` (**bar** traço | **dot** ponto | **fill** fundo — estilo da marca de prioridade), `data-anim` (on/off). Acento via `PALETTE_MAP` → `--kg*`. Atalhos: **⌘K** palette, **C** nova tarefa, **Enter** edita, **Space/X** completa (a implementar full na Fase 5).

**Tweaks** (painel): Tema · Acento (azul/rosa/violeta/dourado) · Densidade · Marca de prioridade · Animações.

---

## 12. Responsividade
`< 860px`: sidebar colapsa para 60px (só ícones). `day-grid` e `eis-grid` viram 1 coluna; hero esconde o retrato. Mobile completo é Fase 5.

---

## 13. Assets
| Arquivo | Uso |
|---|---|
| `kaguya/kaguya.jpg` | Retrato da Kaguya — hero do Meu Dia + brand mark da sidebar |

---

## 14. Notas de implementação
1. **Paridade de canais (inegociável)**: toda capacidade nasce como função sobre o PostgreSQL; `/api/tasks/*` e as tools da Kaguya (Telegram) são fachadas finas e paritárias. Webapp 100% utilizável sem o bot e vice-versa.
2. **Recorrência só no backend** (único lugar dos edge cases). O front re-renderiza com o retorno.
3. **Posições esparsas ×1000** no drag-and-drop (média entre vizinhos) — mesma semântica do Journal.
4. **Subtarefas = tasks com `parent_id`** (1 nível), com prioridade e descrição próprias.
5. **Tipos de tarefa**: `task` (padrão), `event` (com hora), `birthday` (recorrência anual). Distintos dos eventos lidos do Google Calendar.
6. **Fuso fixo** `America/Sao_Paulo`. Single-user (sem assignees/colaboração). Sem migração do TickTick (banco nasce vazio + seeds: Inbox, colunas default).
7. Ícones do protótipo são SVG paths inline (`ICONS` em `ui.jsx`); troque por uma lib mantendo os nomes como referência.
