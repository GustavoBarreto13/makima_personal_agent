# Frontend Design Guide — Kaguya Tasks App

**Feature**: `010-kaguya-tasks-app` (spec master)

**Status**: 🟢 **GUIA CANÔNICO** — este é o documento de referência único para **todo o
front-end** do sub-app de tarefas, em **todas as fases** (011 MVP → 015). Qualquer tela,
componente ou token criado para a Kaguya no webapp **DEVE** seguir este guia. Em caso de
divergência entre uma spec filha e este documento, este documento prevalece para questões
de design.

**Fonte de fidelidade (pixel-a-pixel)**: o protótipo de alta fidelidade em
[`docs/claude_design/design_handoff_kaguya_tarefas/`](../../docs/claude_design/design_handoff_kaguya_tarefas/)
(React/Babel inline, dados em memória) é a **referência visual**. Não copiar o HTML/JSX
direto para produção — reimplementar no stack real (FastAPI + PostgreSQL + React do webapp)
usando este guia + os arquivos do protótipo para fidelidade. O `README.md` do handoff é o
espelho narrativo deste guia.

**Público**: quem desenhar e implementar o sub-app de tarefas no webapp — para que cada
spec filha (011–015) chegue ao frontend já sabendo onde e como encaixar suas telas.

---

## 0. Mapa: protótipo de referência → produção

O handoff é organizado em arquivos `.jsx`/`.css` (Babel standalone, escopos isolados via
`Object.assign(window, …)`). Cada um tem um destino na estrutura real do shell:

| Arquivo do protótipo | Conteúdo | Vira em produção |
|---|---|---|
| `kaguya/styles.css` | sistema visual completo (tokens `.kg-app`, claro/escuro) | `pages/kaguya/kaguya.css` |
| `kaguya/data.js` | mock data + `parseTask` pt-BR + helpers (`nextOccurrence`, `habitStrength`) | parser → `lib/parseTask.ts`; lógica de recorrência/força → **backend** |
| `kaguya/ui.jsx` | `Icon`, `Check`, `PrioFlag`, chips, `StrengthRing`, `Heatmap`, `ParseMirror` | `pages/kaguya/ui/` |
| `kaguya/components.jsx` | `TaskRow`, `TaskCard`, `QuickAdd`, `CommandPalette`, `Toast` | `pages/kaguya/components/` |
| `kaguya/modals.jsx` | `Scrim`, `TaskModal`, `ProjectModal`, `FilterModal` | `pages/kaguya/modals/` |
| `kaguya/screens-*.jsx` | uma tela por view | `pages/kaguya/screens/` |
| `kaguya/app.jsx` | shell, sidebar, roteamento por estado, `PALETTE_MAP`, tweaks | `pages/kaguya/KaguyaShell.tsx` |
| `tweaks-panel.jsx` | painel de Tweaks reutilizável | `pages/kaguya/TweaksPanel.tsx` |
| `kaguya/kaguya.jpg` | retrato (hero do Meu Dia + brand mark da sidebar) | `webapp/frontend/public/kaguya.jpg` |

> Ícones do protótipo são SVG paths inline (`ICONS` em `ui.jsx`). Em produção, trocar por
> uma lib (Lucide/Heroicons) **mantendo os nomes** como referência de mapeamento.

---

## 1. Onde o sub-app vive (padrão dos shells)

O webapp já tem três shells isolados (Violet/diário, Nami/finanças, Frieren/livros).
O sub-app de tarefas é o **quarto shell**, seguindo exatamente o mesmo padrão
(documentado em `webapp/frontend/src/pages/CLAUDE.md`):

| Item | Valor |
|---|---|
| Pasta | `webapp/frontend/src/pages/kaguya/` |
| Componente raiz | `KaguyaShell.tsx` |
| Rota | `/tasks/*` em `App.tsx` — **antes** do catch-all |
| Entrada na sidebar global | `Layout.tsx`, cor `--c-kaguya: #f472b6` (rosa — **identidade do domínio** na nav global, separada do acento interno) |
| CSS | `kaguya.css`, escopado em `.kg-app { }` — tokens não vazam para outros domínios |
| API client | `kaguya/kaguyaApi.ts` (volumoso o bastante para não ir em `lib/api.ts`) |
| Tipos | `kaguya/types.ts` espelhando os modelos do backend |
| Navegação interna | estado local `{ view, param }` no shell — **React Router não entra** |

> **Acento global vs. acento interno**: a bolinha rosa `--c-kaguya` na sidebar **global**
> é a cor de identidade do domínio entre shells (como tangerina = Nami). Dentro do shell,
> o **acento padrão é azul** e é configurável pelo usuário (ver §2.3). São coisas distintas:
> a primeira marca "onde estou na Makima", a segunda colore a UI de tarefas.

Estrutura interna:

```
kaguya/
├── KaguyaShell.tsx       # raiz: sidebar do domínio, topbar, roteamento por estado, PALETTE_MAP
├── TweaksPanel.tsx       # tema · acento · densidade · marca de prioridade · animações
├── kaguya.css            # tokens OKLCH escopados em .kg-app (claro/escuro)
├── kaguyaApi.ts          # client tipado sobre lib/api.ts (nunca fetch direto)
├── types.ts
├── screens/              # uma tela por view
│   ├── TodayScreen.tsx       # Hoje (Fase 1) → evolui para Meu Dia (Fase 3)
│   ├── ListScreen.tsx        # lista por lista/smart list (Fase 1)
│   ├── KanbanScreen.tsx      # board do projeto (Fase 1)
│   ├── CalendarScreen.tsx    # mês/semana + time-blocking (Fases 2–3)
│   ├── EisenhowerScreen.tsx  # matriz 2×2 derivada (Fase 2+)
│   └── HabitsScreen.tsx      # hábitos + força + heatmap (Fase 4)
├── modals/               # TaskModal, ProjectModal (lista), FilterModal
├── components/           # TaskRow, TaskCard, QuickAdd, CommandPalette, Toast, SidebarNav
└── ui/                   # primitivos: Icon, Check, PrioFlag, chips, StrengthRing, Heatmap, ParseMirror
```

**Proibições herdadas do padrão** (de `src/pages/CLAUDE.md`): não criar página legada na
raiz de `pages/`; não usar classes CSS de outro shell; não adicionar estado global; não
fazer `fetch` direto em componente; não criar tela em `screens/` sem registrá-la no shell.

---

## 2. Identidade visual e Design Tokens

A metáfora da Kaguya é **"papelaria aristocrática"** — marfim levemente rosado, precisão,
elegância, um toque imperial, com **lacres semânticos** de prioridade. (Violet é "papel de
carta", Nami é "caderno de bordo".)

### 2.1 Tipografia

| Token | Família | Uso |
|---|---|---|
| `--display` | **Hanken Grotesk** | Títulos de tela, números grandes, headings |
| `--serif` | **Playfair Display** | **Só** o wordmark "Kaguya" na sidebar |
| `--sans` | **DM Sans** | Corpo, labels, botões, itens de lista |
| `--mono` | **DM Mono** | Datas, contadores, atalhos de teclado, rótulos uppercase |

Escala: título de página 28px/800 · título de seção 18px/700 · linha de tarefa 13.5px ·
chip/mono 10–11px · hero 26–36px (clamp). Tarefa é texto utilitário — corpo sempre DM Sans.

> Mudança em relação a versões antigas deste guia: o display passou a ser **Hanken Grotesk**
> (não Playfair/Newsreader). Playfair fica reservado **exclusivamente** ao wordmark da marca.

### 2.2 Cores — Tema Claro (marfim rosado), OKLCH

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
/* prioridade (semântica — "lacres") */
--p-high: oklch(0.575 0.195 22)    /* lacre — alta / vencida */
--p-med:  oklch(0.735 0.135 78)    /* dourado — média */
--p-low:  oklch(0.585 0.085 250)   /* ardósia — baixa */
--done:   oklch(0.615 0.115 158)   /* esmeralda — concluído */
```
Cada prioridade tem variante `-t` (tint ~0.13–0.16 alpha) para fundos.

### 2.3 Cores — Tema Escuro ("noite de palácio")

```
--paper: oklch(0.185 0.022 320)   --paper-2: oklch(0.215 0.024 322)   --card: oklch(0.238 0.024 322)
--ink:   oklch(0.945 0.012 340)
--kg:    oklch(0.72 0.125 252)     /* acento ganha luminância */
--p-high: oklch(0.70 0.185 25)   --p-med: oklch(0.80 0.128 82)
--p-low:  oklch(0.70 0.090 248)  --done:  oklch(0.74 0.125 158)
```
Aplicado via `data-theme="dark"` no `.kg-app`. **Só os tokens trocam** — nenhuma mudança
estrutural.

### 2.4 Acento configurável (4 opções)

O acento padrão é **azul**. O usuário troca pelo Tweaks; um `PALETTE_MAP` (em
`KaguyaShell.tsx`, portado de `app.jsx`) sobrescreve `--kg*` via JS:

| Opção | Hex base |
|---|---|
| **Azul** (padrão) | `#3B82C4` |
| Rosa Kaguya | `#EC4899` |
| Violeta | `#8B5CF6` |
| Dourado | `#C9A227` |

### 2.5 Raios e sombras

```
--kg-r-sm: 7px   --kg-r-md: 12px   --kg-r-lg: 18px
--shadow-sm / --shadow-md / --shadow-lg   (suaves, hue 350; mais densas no dark)
```

---

## 3. Modelo de dados (resumo — detalhe em `data-model.md`)

Princípio central: **uma tarefa, várias views** — a mesma linha em `tasks` renderiza como
lista, Kanban, calendar, Eisenhower e Meu Dia. Pontos que o front precisa conhecer:

- **`type`** = `task` (padrão) · `event` (com hora) · `birthday` (recorrência anual).
  Distinto dos eventos lidos do Google Calendar. Glyph de tipo na `TaskRow`/`TaskCard`.
- **Subtarefas = `tasks` com `parent_id`** (1 nível), com **prioridade e descrição
  próprias** — são "mini-projetos" da parent, não checkboxes simples. Na lista aparecem
  **expandidas por padrão** (`defaultSubOpen`), "quase tanto quanto a parent".
- **`description`** é o campo de notas (a UI pode rotular como "Notas").
- **Posições esparsas ×1000** em toda ordenação manual (mesma semântica do Journal).
- **Estados derivados** (sem coluna `status`): aberta / vencida / concluída / na lixeira.

> **Nomenclatura na UI**: a entidade `task_projects` é exibida como **"Listas"** (a sidebar
> diz "Listas", o modal é `ProjectModal` mas o título é "Nova lista"). Internamente o
> modelo/coluna continua `project`. Uma visão de *projetos* de verdade virá depois.

---

## 4. As views, com a referência de cada uma

### 4.1 Lista (Fase 1) — referência: *Linear* — `ListScreen` + `TaskRow`

- Linhas densas e rápidas: checkbox circular, **traço/bandeira de prioridade** à esquerda,
  título, chips discretos (tags, lista, data colorida por urgência, estimativa).
- Edição **inline** do título (clique no texto); modal só para campos avançados.
- **Subtarefas expandidas por padrão**, cada uma com seu traço/bandeira de prioridade e
  descrição sob o título. Clique abre o modal da parent (onde se edita prioridade/descrição
  da subtarefa).
- Agrupamento por lista (colapsável) ou flat quando o escopo é uma lista única. Filtros por
  prioridade, "Concluídas", ordenação (Inteligente / Vencimento / Prioridade / Manual).
- Completar = checkbox com **pop bounce** + linha **fade/slide-out** (~250ms) — ver §11.

### 4.2 Kanban (Fase 1) — referência: *Linear / Vikunja* — `KanbanScreen` + `TaskCard`

- Colunas globais/do projeto (`task_columns`); `TaskCard` = título + chips mínimos + traço
  de prioridade. Default do protótipo: Backlog · Esta semana · Fazendo · **Concluído** (`is_done`).
- **Drag-and-drop** entre colunas (HTML5). Soltar em **Concluído** completa a tarefa (mesma
  animação/ação da lista); arrastar de Concluído reabre. Filtro por lista. Posições esparsas.

### 4.3 Quick-add + Command Palette (Fase 1, refinada na 5) — referência: *Todoist + Linear*

- **⌘K** abre o `CommandPalette`: campo único que **cria, busca e navega**. ↑↓ navegam,
  ↵ executa, esc fecha.
- Parsing **determinístico** pt-BR enquanto digita, com **highlight ao vivo** (`ParseMirror`
  sobre o input) — ver §6.
- Reusar a ideia do `RichText.tsx` do Violet (spans coloridos) no mirror.
- **Sem LLM no webapp** — o NLP fica no canal Telegram (Kaguya/Gemini).

### 4.4 Calendário (Fase 2) — referência: *TickTick* — `CalendarScreen`

- **Mês** (pills por dia: eventos + tarefas + ghosts) e **Semana** (grade horária). Toggle
  no topbar.
- Recorrentes futuras = **ocorrências virtuais (fantasma)**: opacidade reduzida, ícone
  `loop`, projetadas da RRULE (não persistidas, não clicáveis para edição individual).
- Tarefas `type='event'` aparecem como eventos.

### 4.5 Eisenhower (Fase 2+) — view derivada — `EisenhowerScreen`

- Grade 2×2 derivada de **prioridade × urgência** (urgente = vence ≤2 dias; importante =
  prioridade ≥ média).
- **Fundos graduados por urgência**: "Faça agora" lacre (mais intenso) → "Agende" dourado →
  "Resolva rápido" ardósia → "Depois" neutro.
- Drag entre quadrantes **ajusta os campos derivados** (mover p/ importante sobe prioridade;
  mover p/ não-urgente empurra a data). A matriz é uma **view**, não um campo novo.

### 4.6 Meu Dia (Fase 3) — referência: *Sunsama* — `TodayScreen` evoluída

- **Hero**: eyebrow "Meu Dia · saudação", data por extenso (Hanken 800), sub com totais,
  **3 stats** (no plano / estimado / folga-ou-acima) e o **retrato da Kaguya**
  (`kaguya.jpg`) emoldurado à direita. *(Sem stepper de ritual — removido por feedback.)*
- **Pendências de ontem** (inline, só se houver): review-cards com ações **Hoje / Amanhã /
  Depois**.
- **Quick-add** + **No plano de hoje** (plan-cards arrastáveis) + **Sugestões** (vencem em
  breve, botão "+ Puxar").
- Coluna direita sticky: **CapacityBar** (soma de estimativas + agenda vs. janela livre
  8h–22h; excedeu → avança em vermelho-lacre, sem bloquear) e **DayTimeline** (07h–23h;
  arrastar plan-card para uma hora preenche `start_at`/`due_time` = time-blocking).

> No **MVP (011)** esta tela é a versão simples "**Hoje**": lista de hoje + vencidas
> agrupadas por lista, com quick-add no topo. Hero, capacity e timeline são da Fase 3.

### 4.7 Hábitos (Fase 4) — referência: *Loop Habit Tracker* — `HabitsScreen`

- Card com **anel de força** (`StrengthRing`, não streak), check-in num toque (sim/não) ou
  **stepper de valor** (mensurável), dots da semana, **heatmap anual** (padrão `Heatmap` da
  Frieren) e rodapé (força %, sequência, semana x/y).

---

## 5. Sidebar do domínio (dentro do shell)

Layout, de cima para baixo:

```
● foto + Kaguya (wordmark Playfair)
[ + Nova tarefa            C ]
VIEWS  (built-ins, fixas)
  ☀ Meu Dia        ▦ Kanban
  ▤ Calendário     ⊞ Eisenhower
SMART LISTS  [+]   (task_filters — objetos de 1ª classe, arrastáveis — Fase 2)
  ☀ Hoje+Vencidas   7
LISTAS  [+]        (task_projects, agrupadas por task_project_groups)
  • Inbox          1   (seed indelével, sempre no topo)
  ‹Pessoal›   Casa / Social / Saúde
  ‹Crescimento›  Estudos / Conhecimento / Arte
  ‹Vida prática›  Finanças
  ─────
  ↻ Hábitos        (entrada única → HabitsScreen, Fase 4)
· Voltar à Makima  (footer — sai do shell para a nav global)
```

- **Views fixas** (built-ins): Meu Dia · Kanban · Calendário · Eisenhower — não configuráveis.
- **Smart lists** e **Listas** abrem a `ListScreen` com o `scope` apropriado.
- Topbar (56px, sticky, blur): título · (toggle Mês/Semana no Calendar) · ⌘K. Conteúdo em
  `kg-scroll` com `max-width` 1080px (1320 em telas wide).

---

## 6. Parser determinístico pt-BR (`parseTask`)

Sem LLM (o NLP fica no Telegram/Gemini). Tokeniza preservando posições para o **highlight
ao vivo** (`ParseMirror` espelha o input). Devolve
`{title, due, time, tags, project, prio, recur, segments[]}`.

| Token | Exemplos | Resultado | Classe do segment |
|---|---|---|---|
| Data relativa | `hoje`, `amanhã`, `sexta`/`sex`, `dia 5` | `due` | `tok-date` |
| Hora | `17h`, `9h30`, `9:30` | `time` | `tok-time` |
| **Lista** | `@estudos` | `project` | `tok-proj` |
| Tag | `#foco` | `tags[]` | `tok-tag` |
| Prioridade | `!alta` `!média` `!baixa` | `prio` 3/2/1 | `tok-prio-*` |
| Recorrência | `todo dia 10`, `toda sexta`, `a cada 2 dias`, `todo mês` | `recur{mode,rule,label}` | — |

> **Convenção de tokens (canônica e à prova de futuro)**: `@lista` = projeto/lista ·
> `#tag` = etiqueta · `!prioridade`. **Não usar `#` para projeto** — `#` é de tags.
>
> **No MVP (011)** o quick-add reconhece **só `@lista` e `!prioridade`** (datas, `#tag` e
> recorrência entram na Fase 2). Token de lista que não casa nenhuma lista existente → a
> tarefa vai para o Inbox com o texto preservado e a UI avisa.

---

## 7. Recorrência — regra SEMPRE no BACKEND

O frontend **nunca** implementa a regra de recorrência: ao completar uma recorrente, chama
o endpoint e re-renderiza com o que voltar. No protótipo, `nextOccurrence()` (em `app.jsx`)
demonstra a intenção; em produção a geração vive no backend (único lugar dos edge cases —
ver `data-model.md` §`task_recurrences`):

- `fixed`: âncora não muda por reagendamento pontual; completar adiantado/atrasado consome
  **uma** ocorrência (puladas não acumulam).
- `after_completion`: próxima sempre a partir da **data de conclusão real**.
- Subtarefas **resetam** (abertas) na nova ocorrência. Fim de série desativa a regra
  (preserva histórico). Só a próxima ocorrência existe como linha viva; futuras são virtuais.

---

## 8. Força do hábito — fórmula Loop (perdoa falhas)

`habitStrength()` (protótipo em `data.js`; em produção calculada no backend na leitura):
decaimento suave normalizado pela meta de frequência (não é streak que zera). Um hábito com
~80% de aderência permanece alto após uma falha isolada. Fórmula em `data-model.md` §`habits`.

---

## 9. Componentes compartilhados e primitivos

### 9.1 Componentes (`components/`)

- **TaskRow** (coração da lista): checkbox com **pop bounce** ao concluir + linha
  **fade/slide-out** (~250ms, Things 3); respeita `prefers-reduced-motion` e o tweak de
  animações. Glyph de tipo (evento/aniversário). Subtarefas ricas.
- **TaskCard** (Kanban), **QuickAdd** (parser + `ParseMirror` + preview chips),
  **CommandPalette**, **Toast**, **SidebarNav**.

### 9.2 Modais (`modals/`) — padrão `FormModal` schema-driven da Nami

- **TaskModal**: tipo, prioridade, lista, estimativa, data/hora, repetição, tags,
  **subtarefas com prioridade + descrição**, notas.
- **ProjectModal** ("Nova lista"): nome, grupo, cor, ícone.
- **FilterModal** (smart list — Fase 2).

### 9.3 Primitivos (`ui/`)

`Icon` (paths inline → trocar por Lucide/Heroicons mantendo os nomes), `Check`, `PrioFlag`,
`TagChip`/`DateChip`/`ProjChip`, `StrengthRing`, `Heatmap`, `ParseMirror`.

### 9.4 Reuso concreto (não reinventar)

| O quê | De onde | Uso |
|---|---|---|
| `FormModal.tsx` (`FieldDef`: `text`/`date`/`select`/`segment`/`color`) | `pages/nami/modals/` | Base para Task/Project/FilterModal — **copiar e adaptar**, não importar cross-domínio |
| `Heatmap.tsx` | `pages/frieren/ui/` | Padrão para o heatmap de hábitos |
| `RichText.tsx` (spans de menção) | `pages/violet/components/` | Padrão para o `ParseMirror` do quick-add |
| `TweaksPanel.tsx` | qualquer shell | Base do painel de tweaks do domínio |
| `lib/api.ts` (`api.get/post/patch/del`) | global | Base do `kaguyaApi.ts` — cookies e erros resolvidos |
| Posições esparsas ×1000 | Journal (backend) | Mesma semântica no drag-and-drop do front |

Regra dos shells: componentes são **copiados e adaptados** por domínio (isolamento), não
importados entre shells — o padrão é o reuso, não o arquivo.

---

## 10. Comportamentos globais & Tweaks

`data-*` no `.kg-app`:

| Atributo | Valores | Efeito |
|---|---|---|
| `data-theme` | `light` \| `dark` | troca a paleta (§2.2/2.3) |
| `data-density` | `confortavel` \| `compacta` | padding das linhas |
| `data-pmark` | `bar` \| `dot` \| `fill` | estilo da marca de prioridade (traço / ponto / fundo) |
| `data-anim` | `on` \| `off` | liga/desliga animações |

Acento via `PALETTE_MAP` → `--kg*` (§2.4). **Painel de Tweaks** (`TweaksPanel`):
**Tema · Acento · Densidade · Marca de prioridade · Animações**.

**Atalhos**: **⌘K** palette · **C** nova tarefa · **Enter** edita · **Space/X** completa ·
`1–4` prioridade · `T` agenda hoje (full na Fase 5). Atalhos exibidos em DM Mono nos tooltips.

---

## 11. Movimento e polish (Fase 5, mas nasce no DNA) — referência: *Things 3*

- **Conclusão de tarefa** é o momento-assinatura: checkbox preenche com leve bounce, linha
  faz fade+slide e some (~250ms). **Mesma animação** em lista, Kanban e Meu Dia.
- Drag-and-drop com sombra suave e placeholder claro do destino.
- Transições de view rápidas (<150ms) — velocidade Linear vence ornamento.
- `prefers-reduced-motion` **e** o tweak `data-anim=off` viram cortes secos.
- **Keyboard-first**: componentes nascem focáveis desde a Fase 1; os atalhos fecham na Fase 5.

---

## 12. Responsividade

`< 860px`: sidebar colapsa para 60px (só ícones); `day-grid`/`eis-grid` viram 1 coluna; o
hero esconde o retrato. **Mobile completo é Fase 5.**

---

## 13. Assets

| Arquivo | Origem | Destino | Uso |
|---|---|---|---|
| `kaguya.jpg` | `docs/claude_design/design_handoff_kaguya_tarefas/kaguya/` | `webapp/frontend/public/kaguya.jpg` | retrato — brand mark da sidebar + hero do Meu Dia |

> Imagens de personagem vão em `frontend/public/` (servidas estáticas) — **nunca** em
> `frontend/dist/` (artefato de build).

---

## 14. Contrato com o backend

- Toda chamada via `kaguyaApi.ts` sobre `lib/api.ts` (cookie `makima_session` incluso).
- Endpoints em `/api/tasks/*` (router FastAPI, `Depends(require_user)` + Pydantic).
- Padrão do repo: **mutações** retornam `{status:"ok"|"error", …}` (converter via
  `_check_result`); **listagens** retornam dado direto (atenção: `_check_result` só onde há
  `status`).
- **Paridade de canais (inegociável)**: toda capacidade nasce como função sobre o
  PostgreSQL; `/api/tasks/*` e as tools da Kaguya (Telegram) são fachadas finas e paritárias.
  Webapp 100% utilizável sem o bot e vice-versa.
- O frontend **nunca** implementa regra de recorrência (§7) — completar uma recorrente
  chama o endpoint e re-renderiza com o retorno.

---

## 15. Roteiro de telas por spec filha

| Spec | Telas/componentes novos |
|---|---|
| **011 (MVP)** | KaguyaShell, SidebarNav (com brand mark + "Voltar à Makima"), TweaksPanel (tema/acento/densidade/pmark/anim), ListScreen + TaskRow (subtarefas ricas), KanbanScreen + TaskCard, TodayScreen (versão "Hoje" simples), QuickAdd básico (`@lista` + `!prio`) + ParseMirror, TaskModal (com `tipo` + subtarefas ricas), ProjectModal, primitivos (Icon, Check, PrioFlag, chips), kaguya.css completo, asset `kaguya.jpg` |
| **012** | CalendarScreen, EisenhowerScreen, FilterModal + smart lists na sidebar, TagChip + UI de tags, parsing de data/`#tag`/recorrência no QuickAdd |
| **013** | TodayScreen → Meu Dia (hero + retrato), CapacityBar, DayTimeline (drag para slot horário) |
| **014** | HabitsScreen, StrengthRing, Heatmap, stepper de valor |
| **015** | CommandPalette completo, atalhos de teclado em tudo, animações Things 3, responsivo mobile |
</content>
</invoke>
