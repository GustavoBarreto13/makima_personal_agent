# Frontend Design Guide — Kaguya Tasks App

**Feature**: `010-kaguya-tasks-app` (spec master)
**Público deste documento**: quem for desenhar e implementar o sub-app de tarefas no webapp.
Define identidade, estrutura, padrões de reuso e referências por view — para que cada spec
filha (011–015) chegue no frontend já sabendo onde e como encaixar suas telas.

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
| Entrada na sidebar global | `Layout.tsx`, cor `--c-kaguya: #f472b6` (rosa, já reservada em `index.css`) |
| CSS | `kaguya.css`, escopado em `.kg-app { }` — tokens não vazam para outros domínios |
| API client | `kaguya/kaguyaApi.ts` (volumoso o bastante para não ir em `lib/api.ts`) |
| Tipos | `kaguya/types.ts` espelhando os modelos do backend |
| Navegação interna | estado local `{ view, param }` no shell — **React Router não entra** |

Estrutura interna:

```
kaguya/
├── KaguyaShell.tsx       # raiz: sidebar do domínio, topbar, roteamento por estado
├── TweaksPanel.tsx       # preferências (tema claro/escuro, acento, densidade)
├── kaguya.css            # tokens OKLCH escopados em .kg-app
├── kaguyaApi.ts          # client tipado sobre lib/api.ts (nunca fetch direto)
├── types.ts
├── screens/              # uma tela por view
│   ├── TodayScreen.tsx       # Hoje (Fase 1) → evolui para Meu Dia (Fase 3)
│   ├── ListScreen.tsx        # lista por projeto / smart list (Fase 1)
│   ├── KanbanScreen.tsx      # board do projeto (Fase 1)
│   ├── CalendarScreen.tsx    # mês/semana + time-blocking (Fases 2–3)
│   ├── EisenhowerScreen.tsx  # matriz 2×2 derivada (Fase 2+)
│   └── HabitsScreen.tsx      # hábitos + força + heatmap (Fase 4)
├── modals/               # TaskModal (criar/editar), ProjectModal, FilterModal
├── components/           # TaskRow, TaskCard, QuickAdd, CommandPalette, Sidebar do domínio
└── ui/                   # primitivos: ícones, chips de tag/prioridade, heatmap, barras
```

**Proibições herdadas do padrão** (de `src/pages/CLAUDE.md`): não criar página legada na
raiz de `pages/`; não usar classes CSS de outro shell; não adicionar estado global; não
fazer `fetch` direto em componente.

---

## 2. Identidade visual

Cada shell tem uma metáfora própria sobre a mesma linguagem (papel + tinta + um acento):
Violet é "papel de carta", Nami é "caderno de bordo". **Kaguya é "papelaria
aristocrática"** — a estética da personagem: precisão, elegância, um toque imperial.

- **Acento primário**: rosa Kaguya — partir de `--c-kaguya: #f472b6` e derivar a escala
  em OKLCH (ex.: `--kg-accent: oklch(0.71 0.18 350)`), como Nami faz com a tangerina.
- **Acentos secundários** (semânticos, OKLCH): vermelho-lacre para prioridade alta/vencidas,
  dourado para média, azul-ardósia para baixa, verde para concluído — ecoando os acentos
  sapphire/gold/emerald/garnet do Violet, mas com hue próprio.
- **Papel/tinta**: tema claro = marfim levemente rosado; tema escuro = "noite de palácio"
  (tinta profunda, acento rosa ganhando luminância). Ambos via `data-theme` no `.kg-app`,
  como os outros shells.
- **Tipografia**: display serif elegante (Playfair Display, já carregada no projeto, ou
  Newsreader como o Violet) para títulos de tela; **DM Sans** para corpo; **DM Mono** para
  datas, contadores e atalhos de teclado. Tarefa é texto utilitário — corpo sempre DM Sans.
- **Raios e densidade**: tokens próprios (`--kg-r-sm/md/lg`) na faixa dos outros shells
  (6–18px); densidade compacta/normal controlada pelo TweaksPanel
  (padrão `--row-pad` da Nami).
- **Privacidade**: não se aplica (sem valores monetários); não portar o blur da Nami.

---

## 3. As views, com a referência de cada uma

### 3.1 Lista (Fase 1) — referência: *Linear*

- Linhas densas e rápidas: checkbox circular, título, chips discretos (projeto, tags,
  data colorida por urgência), prioridade como traço de cor à esquerda (estilo Linear).
- Agrupamento padrão: por projeto; dentro do projeto, por `position` (drag-and-drop).
- Subtarefas indentadas, colapsáveis no item pai.
- Completar = checkbox com animação curta (ver §5) e a linha desliza para fora da lista.
- Edição inline do título (clique no texto), modal só para campos avançados.

### 3.2 Kanban (Fase 1) — referência: *Linear / Vikunja*

- Colunas do projeto (`task_columns`); cards = `TaskCard` com título + chips mínimos.
- Drag entre colunas; soltar na coluna `is_done_column` completa a tarefa (mesma
  animação de conclusão da lista — é a mesma ação, views diferentes).
- Reordenar dentro da coluna usa as mesmas posições esparsas da lista.

### 3.3 Quick-add + Command Palette (Fase 1, refinada na 5) — referência: *Todoist + Linear*

- **⌘K** abre o palette: campo único que cria, busca e navega.
- Parsing **determinístico** em pt-BR enquanto digita, com highlight do que foi
  reconhecido (como o Todoist faz): `"revisar relatório sexta 17h #trabalho !alta"` →
  data sexta 17:00, tag trabalho, prioridade alta. Tokens: datas relativas
  ("hoje", "amanhã", "sexta", "dia 5"), hora ("17h", "9:30"), `#tag`, `!alta|!media|!baixa`,
  `@projeto`.
- Reusar a ideia do `RichText.tsx` do Violet (spans coloridos para menções) no highlight.
- Sem LLM no webapp — NLP fica no canal Telegram (Kaguya/Gemini).

### 3.4 Calendar (Fase 2) — referência: *TickTick*

- Vistas mês (pills por dia) e semana (grade horária).
- Recorrentes: a ocorrência viva é sólida; ocorrências futuras **virtuais** (projetadas
  da RRULE) aparecem fantasma (opacidade reduzida), não clicáveis para edição individual.

### 3.5 Meu Dia (Fase 3) — referência: *Sunsama*

- Tela em três momentos: **revisar** (pendências de ontem: reagendar/mover/descartar) →
  **planejar** (puxar tarefas para hoje, estimar `duration_min`) → **caber**
  (barra de capacity: soma das estimativas vs. horas livres derivadas do Google Calendar).
- Coluna do dia à direita com os eventos do Calendar; arrastar tarefa para um slot
  preenche `start_at`/`end_at` (time-blocking).
- Capacity como honestidade visual: excedeu → a barra passa do limite em vermelho-lacre,
  sem bloquear (o app informa, o usuário decide).

### 3.6 Eisenhower (Fase 2+) — view derivada

- Grade 2×2: urgente×importante a partir de `priority` + `due_date` (regra na master:
  urgente = vence em ≤2 dias; importante = prioridade ≥ média).
- Drag entre quadrantes ajusta os campos derivados (mover para "importante" sobe a
  prioridade; mover para "não urgente" limpa/empurra a data) — a matriz é uma view,
  não um campo novo.

### 3.7 Hábitos (Fase 4) — referência: *Loop Habit Tracker*

- Lista de hábitos com anel/barra de **força** (não streak) + check-in do dia em um toque.
- Heatmap anual por hábito — **reusar o padrão do `Heatmap.tsx` da Frieren**
  (densificação de array esparso) e do heatmap do Violet, adaptando tokens.
- Hábito mensurável: check-in abre stepper de valor (ex.: páginas lidas).

---

## 4. Sidebar do domínio (dentro do shell)

Ordem fixa, de cima para baixo:

1. **Views fixas**: Hoje/Meu Dia · Calendar · Eisenhower (built-ins, não configuráveis)
2. **Smart lists salvas** (`task_filters`) — objetos de primeira classe, com ícone,
   arrastáveis para reordenar (Fase 2)
3. **Projetos**, agrupados por `task_project_groups`, com contagem de abertas;
   Inbox sempre no topo do bloco de projetos
4. **Hábitos** (entrada única para a HabitsScreen, Fase 4)

---

## 5. Movimento e polish (Fase 5, mas nasce no DNA) — referência: *Things 3*

- **Conclusão de tarefa** é o momento-assinatura do app: checkbox preenche com leve
  bounce, linha faz fade+slide e some (~250ms). Mesma animação em lista, Kanban e Meu Dia.
- Drag-and-drop com sombra suave e placeholder claro do destino.
- Transições de view rápidas (<150ms) — velocidade Linear vence ornamento.
- `prefers-reduced-motion` respeitado: animações viram cortes secos.
- **Keyboard-first** (Fase 5 fecha, mas componentes já nascem focáveis): navegação por
  setas na lista, `Enter` edita, `Space`/`X` completa, `1–4` prioridade, `T` agenda hoje,
  `⌘K` palette. Atalhos exibidos em DM Mono nos tooltips.

---

## 6. Reuso concreto (não reinventar)

| O quê | De onde | Uso |
|---|---|---|
| `FormModal.tsx` (modal schema-driven, `FieldDef`) | `pages/nami/modals/` | Base para TaskModal/ProjectModal/FilterModal — portar o padrão (tipos `text`, `date`, `select`, `segment`, `color`), não importar cross-domínio |
| `Heatmap.tsx` | `pages/frieren/ui/` | Padrão para o heatmap de hábitos |
| `RichText.tsx` (spans de menção) | `pages/violet/components/` | Padrão para highlight do parsing no quick-add |
| `TweaksPanel.tsx` | qualquer shell | Tema/acento/densidade do domínio |
| `lib/api.ts` (`api.get/post/patch/del`) | global | Base do `kaguyaApi.ts` — cookies e erros já resolvidos |
| Posições esparsas ×1000 | Journal (backend) | Mesma semântica no drag-and-drop do front (calcular média entre vizinhos) |

Regra dos shells: componentes são **copiados e adaptados** por domínio (isolamento),
não importados entre shells — o padrão é o reuso, não o arquivo.

---

## 7. Contrato com o backend

- Toda chamada via `kaguyaApi.ts` sobre `lib/api.ts` (cookie `makima_session` incluso).
- Endpoints em `/api/tasks/*` (router FastAPI, padrão `Depends(require_user)` + Pydantic).
- Respostas seguem o padrão do repo: mutações retornam `{status: "ok"|"error", ...}`;
  listagens retornam dado direto (atenção ao `_check_result` — só onde há `status`).
- O frontend **nunca** implementa regra de negócio de recorrência: completar uma
  recorrente chama o endpoint e re-renderiza com o que voltar (a geração da próxima
  ocorrência é do backend, único lugar onde os edge cases vivem).

---

## 8. Roteiro de telas por spec filha

| Spec | Telas/componentes novos |
|---|---|
| 011 (MVP) | KaguyaShell, sidebar do domínio, ListScreen, KanbanScreen, TodayScreen (versão "Hoje" simples), QuickAdd básico, TaskModal, ProjectModal, kaguya.css completo |
| 012 | CalendarScreen, EisenhowerScreen, FilterModal + smart lists na sidebar, chips de tag, parsing de data no QuickAdd |
| 013 | TodayScreen → Meu Dia (ritual 3 momentos), capacity bar, drag para slot horário |
| 014 | HabitsScreen, anel de força, heatmap, stepper de valor |
| 015 | CommandPalette completo, atalhos de teclado em tudo, animações Things 3, responsivo mobile |
