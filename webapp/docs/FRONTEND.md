# Frontend

## Stack

| Tecnologia | Versão | Papel |
|---|---|---|
| React | 19 | Framework de UI |
| TypeScript | ~5.8 (strict) | Tipagem estática |
| Vite | 6 | Bundler / dev server |
| react-router-dom | 7 | Roteamento client-side |
| Tailwind CSS | 3 | Utilitários CSS (nas páginas legadas e no `Layout` global) |
| PostCSS + autoprefixer | — | Processamento do Tailwind |
| @dnd-kit (core/sortable/utilities) | 6/10/3 | Drag-and-drop (shell Kaguya: listas, Kanban, Eisenhower) |
| react-markdown + remark-gfm | 10/4 | Renderização das notas Markdown de tarefas (shell Kaguya) |
| Vitest | 4 | Testes unitários (`npm run test` — ex.: parser de quick-add da Kaguya) |

**Sem bibliotecas de chart ou de data.** Todos os gráficos (donut, sparkline, barras, área, heatmap,
estrelas) são SVG/CSS escritos à mão. Todas as datas usam `Intl` / `toLocaleDateString('pt-BR', …)`
nativos do browser (ou os helpers próprios de cada shell, como `kaguya/lib/dateUtils.ts`).

**Sem Redux, Zustand ou React Query.** Estado local por `useState` + `useEffect`. Cada shell carrega
seus dados no mount e passa para os filhos via props; mutações refazem a carga local.

## Estrutura de arquivos relevante

```
webapp/frontend/
├── package.json              # npm scripts e dependências
├── vite.config.ts            # proxy de dev e plugins
├── tsconfig*.json            # configuração TypeScript (strict + noUnusedLocals)
├── tailwind.config.js        # tokens de cor por personagem, fontes
├── index.html                # carrega Google Fonts e o entry point React
└── src/
    ├── main.tsx              # createRoot + StrictMode
    ├── App.tsx               # verificação de auth (/auth/me) + BrowserRouter + rotas
    ├── lib/
    │   └── api.ts            # fetch tipado (api, violetApi, booksApi)
    ├── components/
    │   └── Layout.tsx        # sidebar Makima (legado) + área de conteúdo
    ├── pages/
    │   ├── Login.tsx         # tela de login (botão Google)
    │   ├── nami/             # shell de finanças (Nami)
    │   ├── violet/           # shell de diário (Violet)
    │   ├── frieren/          # shell de livros (Frieren)
    │   ├── kaguya/           # shell de tarefas/agenda (Kaguya)
    │   ├── akane/            # shell de filmes (Akane)
    │   ├── marin/            # shell de animes (Marin)
    │   ├── mai/              # shell de séries de TV (Mai)
    │   ├── komi/             # shell de pessoas (Komi)
    │   ├── yato/             # shell de viagens (Yato)
    │   ├── makima/           # shell do Hub — rota / em tela cheia (Makima)
    │   └── *.tsx             # páginas legadas de finanças (Transactions, Accounts, etc.)
    └── public/               # imagens copiadas para dist/ pelo Vite
        ├── nami.jpg / nami.png / nami-hero.png
        ├── violet.png
        ├── frieren.png
        ├── kaguya.jpg
        ├── akane.png
        ├── marin.png
        ├── mai.png
        ├── komi.png
        ├── yato.png
        └── makima.png
```

## Inicialização e autenticação

`App.tsx` faz `GET /auth/me` na montagem. Se receber `401` (não logado), renderiza `<Login />`
(tela de login). Caso contrário monta o `<BrowserRouter>` com todas as rotas.

```tsx
// App.tsx (simplificado)
const [user, setUser] = useState(null);

useEffect(() => {
  fetch("/auth/me", { credentials: "include" })
    .then(r => r.ok ? r.json() : null)
    .then(data => setUser(data));
}, []);

if (!user) return <Login />;
return <BrowserRouter>...</BrowserRouter>;
```

## Rotas

Na ordem de registro do `App.tsx` (os shells vêm **antes** do catch-all `/*`):

```
/books/*         → FrierenShell   (livros)
/journal/*       → VioletShell    (diário pessoal)
/nami/*          → NamiShell      (finanças — canônico)
/tasks/*         → KaguyaShell    (tarefas + agenda)
/movies/*        → AkaneShell     (filmes)
/animes/*        → MarinShell     (animes)
/series/*        → MaiShell       (séries de TV)
/people/*        → KomiShell      (pessoas e contatos)
/travel/*        → YatoShell      (viagens — roteiro + dossiê de mobilidade)
/                → MakimaShell    (Hub — tela cheia, SEM Layout global)
/transactions … /subscriptions → redirecionam para /nami#… (endereços antigos das finanças)
*                → redireciona para /  (Hub)
```

> **Páginas legadas removidas (spec 071):** o `Layout` global e as páginas soltas `Transactions`, `Accounts`, `Cards`, `Loans`,
> `Budgets`, `Subscriptions` e `Dashboard` foram apagados; as rotas antigas redirecionam. A rota `/` é o Hub (`MakimaShell`).

## Os dez shells

Cada domínio implementado tem um "shell": um componente raiz que cuida da navegação interna,
carregamento de dados, theming e modais. Eles **não usam React Router internamente** — o roteamento
dentro de cada shell é por estado interno ou hash de URL (exceção: o `MakimaShell` é uma tela
única, sem navegação interna).

---

### NamiShell — Finanças (`src/pages/nami/`)

Reconstruída na spec 071 sobre o Design System (`AppShell`, `Hero`, `useCollection`, `QuickCapture`, `StatsPage`, `DetailPage`),
direção de arte **"Carta náutica"**; página `conformant` no manifesto. Detalhes de produto em `specs/071-nami-simples/spec.md`.

**Roteamento:** deep-link por hash (`/nami#cartoes`). Os nomes antigos continuam valendo (`#dashboard`, `#transacoes`, `#assinaturas`,
`#contas-fixas`, `#financiamentos`…) via `lib/routes.ts`. Os endereços soltos `/transactions`, `/accounts`, `/cards`, `/loans`, `/budgets`
e `/subscriptions` redirecionam para a tela equivalente.

**Telas (`screens/`):**

| Hash | Tela | O que mostra |
|---|---|---|
| `#inicio` | Home | Hero **"Livre pra gastar"** (valor, por dia, saldo), barra gasto/ainda vai sair/livre com seletor de mês, linha rápida de lançamento, **A pagar** (Paguei / Pagar / Lembrar na Kaguya), pra onde foi, últimos lançamentos |
| `#lancamentos` | Transactions | Todos os movimentos: busca no servidor (todos os meses), filtros do padrão (tipo, conta/cartão, categoria, período), agrupar por dia/mês/categoria/conta, CSV; transferência é tratada como par |
| `#cartoes` | Cards | Cartões com limite usado; detalhe (`DetailPage`) com **uma aba por fatura** e "Pagar fatura" |
| `#recorrentes` | Recurring | Conta fixa + assinatura + entrada (salário) numa lista, com a situação do mês e Paguei/Recebi/Pular |
| `#resumo` | Summary | Retrospectiva no `StatsPage` (patrimônio real, taxa de poupança, delta vs. ano anterior) |
| `#contas` | Accounts | Saldo real por conta, dívida dos cartões, patrimônio líquido |
| `#parcelamentos` | Installments | Compromissos dos próximos meses e linha do tempo de cada compra parcelada |
| `#emprestimos` | Loans | Aba bancários (saldo devedor, simuladores, qual atacar primeiro) e aba entre pessoas |
| `#orcamentos` | Budgets | Limite por categoria/mês com aviso aos 90% e quando estoura |
| `#lista-compras` | Shopping | Itens numa frase, carrinho (otimista), frequentes, finalizar vira 1 gasto |

**Lançar (um jeito só):** `lib/entry.ts` (lógica pura) transforma texto em `EntryDraft` → pedido à API. A linha rápida
(`components/EntryCapture.tsx`, `QuickCapture` do DS) entende `45 ifood @nubank`, `1200 tv 10x @nubank`, `+3500 salário`, `ontem 30 uber`,
`#lazer`; salva direto quando entende tudo e abre o `EntryForm` preenchido quando não (`@` ambíguo, `+pessoa`, falta valor). O mesmo
formulário faz gasto, entrada e transferência (para um cartão = pagar a fatura). `lib/submit.ts` salva, edita e **desfaz**.

**Arquivos notáveis:**

| Arquivo | O que faz |
|---|---|
| `NamiShell.tsx` | `AppShell`, nav, estado compartilhado (contas, cartões, categorias), ações comuns pelo contexto, atalhos, preferências |
| `context.ts` | `NamiContext`: `openEntry`, `openPay`, `quickCapture`, `save`, `remove`, `money` (modo privacidade), `reload` |
| `namiApi.ts` | Cliente tipado de `/api/finances/*` |
| `lib/entry.ts`, `lib/submit.ts` | Rascunho, validação por campo, pedido à API, desfazer |
| `lib/txSchema.ts`, `lib/recurring.ts` | Esquemas de coleção (lançamentos, recorrentes) e regras puras (próximo vencimento, resumo) |
| `lib/useLoad.ts` | Estados carregando/erro/dados de cada tela |
| `components/` | `EntryForm`, `PayModal`, `CardForm`, `RecurringForm`, `AccountForm`, `LoanForms`, `TxRow` |
| `nami.css` | Só o que o DS não tem (barra do mês, valores, linhas de ação), com tokens `--ds-*` |
| `testApi.ts` | API simulada para os testes de tela |

**Preferências:** `ds:prefs:nami` (ocultar valores, origem padrão, estilo de arte). Tema é o global do DS.

**Testes:** `lib/*.test.ts` (lógica pura) e `NamiShell.test.tsx` / `screens.test.tsx` (shell de verdade no jsdom, API simulada).

---

### VioletShell — Diário (`src/pages/violet/`)

**Roteamento:** estado interno `{view, param}`. Não usa hash nem React Router internamente.

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `write` | Write | Bullet journal do dia; bullets tipados + campo dream |
| `journal` | Journal (Arquivo) | Entradas do passado agrupadas por mês, com busca |
| `reflect` | Reflect | Cartões de reflexão inspiracionais (prompts Violet) |
| `insights` | Insights | Heatmap anual + gráfico de área + big numbers + 7 tabs |
| `dreams` | Dreams | Todas as entradas com `dream` preenchido |
| `highlights` | Highlights | Coleção de bullets do tipo `highlight` |
| `ideas` | Ideas | Coleção de bullets do tipo `idea` |
| `wisdom` | Wisdom | Coleção de bullets do tipo `wisdom` |
| `notes` | Notes | Coleção de bullets do tipo `note` |
| `tags` | Tags | Nuvem de `#tags` por frequência |
| `people` | People | Grid de `@pessoas` mencionadas com avatar de iniciais |
| `tutor` | Tutor | Progresso do Tutor de Idiomas (spec 031): skills por conceito, nível CEFR, próximo foco e guia de estudo |

**Tutor de Idiomas (spec 031 — persona Kurisu):** botão discreto (`.tt-icon-btn`, ícone
`sparkles`) em cada bullet do `Write.tsx` pede uma análise de escrita via
`violetApi.analyzeTutor`; o resultado abre em `components/TutorModal.tsx` (correção,
reescrita natural, erros por conceito, resumo e nota). Bullets já analisados ganham um
toggle inline (`.tt-toggle-btn`) para alternar entre o texto original (nunca sobrescrito)
e a versão corrigida, buscada sob demanda via `violetApi.bulletAnalysis`. A tela `Tutor`
(sidebar, ícone `graduation`) mostra a barra de maestria + glyph de tendência (📈/📉/➡️)
por conceito, o nível CEFR estimado, a sugestão de próximo foco e o formulário do guia
de estudo (US4) — todos os endpoints em `violetApi.tutor*`/`*TutorGuide`.

**Componentes de UI (violet/ui/):**

| Arquivo | O que faz |
|---|---|
| `AreaChart.tsx` | Gráfico de área SVG com curva Catmull-Rom→Bezier (12 pontos mensais) |
| `HeatmapRow.tsx` | Heatmap estilo GitHub — grid anual de atividade de bullets por dia |
| `RichText.tsx` | Parser de `@pessoa` e `#tag` em spans clicáveis |
| `Icon.tsx` | Set de ícones SVG inline |

---

### FrierenShell — Livros (`src/pages/frieren/`) — no Design System (spec 073)

`conformant` no manifesto, direção de arte **"Biblioteca élfica"** (`design/art/elfica.css`). Um `AppShell`; a tela e o
item aberto vivem no **hash** (`lib/routes.ts`): `#inicio`, `#biblioteca`, `#quero-ler`, `#wishlist`, `#diario`,
`#estantes`, `#resenhas`, `#estatisticas`, `#livro/<id>`, `#estante/<id>` (aliases do shell antigo: `#catalogo`,
`#atividade`, `#listas`; `/books-next` redireciona para `/books`). O shell carrega catálogo e estantes uma vez
(contexto `useFrieren()`); `frierenApi.ts` normaliza na borda (`lib/normalize.ts`: os 7 status reais, nada de `null`).

- **Início** (modelo da Akane): hero (Cinemático/Editorial/Galeria nas Preferências), cartões de meta anual, páginas
  em 7 dias, ritmo de 30 dias e sequência, linha rápida (`components/LogCapture.tsx`, parser em `lib/log.ts`:
  `Duna p. 240 ontem`, `Hobbit terminei ★4.5`), vitrine de favoritos, lidos recentemente, painel Diário/Notas, lendo
  agora e mapa de calor do ano. Dados: `GET /api/books/home`.
- **Registrar leitura**: linha rápida salva direto só com livro e progresso claros; senão `LogForm` (carrossel de
  capas, +10/+25/+50/terminei, data, nota do dia, nota com meia estrela). `lib/submit.ts` devolve o "Desfazer".
- **Coleções** (`lib/schemas.ts`, `useCollection`): Biblioteca (7 status, agrupados na ordem natural por
  `withStatusOrder`), Quero ler, Wishlist (link da loja inline), Diário (editar/excluir sessão com Desfazer), Resenhas.
- **Detalhe** (`screens/BookDetail.tsx`, `DetailPage`): situação, curtir, vitrine, estantes, resenha inline, ficha,
  sessões e marcações (`BookMarks`); editar em `BookForm` (`clear` apaga campos opcionais).
- **Estantes**, **Estatísticas** (`StatsPage` com `GET /api/books/stats` + meta anual das Preferências).
- CSS: só complementos `.fr-*` com tokens `--ds-*` em `frieren.css`. Testes: `FrierenShell.test.tsx`,
  `screens.test.tsx`, `nullSafety.test.tsx` e `lib/*.test.ts`.

### KaguyaShell — Tarefas e agenda (`src/pages/kaguya/`)

**Roteamento:** estado interno `{view, param}` (tipo `KaguyaView` em `types.ts`). O maior shell
do app: sidebar própria com listas/grupos, smart-lists, Command Palette (⌘K) e TweaksPanel.

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `today` | TodayScreen | Meu Dia — plano do dia, pendências de ontem, sugestões, capacity bar e time-blocking |
| `list` | ListScreen | Tarefas da lista em árvore (subtarefas, quick-add com datas/recorrência/#tags, atalhos de teclado) |
| `group-list` | GroupListScreen | Tarefas de todas as listas de um grupo, em visão de lista |
| `kanban` | KanbanScreen | Board Kanban da lista, com views configuráveis (spec 024) |
| `group` | GroupBoardScreen | Board agregado do grupo — colunas de mesmo nome unificadas (spec 025) |
| `calendar` | CalendarScreen | Calendário mês/semana: tarefas datadas, ocorrências virtuais e eventos Google (Calendar Hub); sidebar `CalendarsAside` com seções Makima × Google (spec 069, ver abaixo) |
| `eisenhower` | EisenhowerScreen | Matriz 2×2 urgência × prioridade com drag-and-drop |
| `habits` | HabitsScreen | Hábitos com anel de consistência, check-in de hoje e heatmap anual |
| `experiments` | ExperimentsScreen / ExperimentDetailScreen | Tiny Experiments (spec 029): aderência, check-ins, pausa/retomada e revisão |
| `goals` | GoalsScreen / GoalDetailScreen | Metas (spec 030): agrupadas por área da vida, métrica, marcos e movimentos vinculados |
| `filter` | FilterScreen | Smart-list salva (filtros), com aviso de referência órfã |
| `date` | DateViewScreen | View fixa de mercado (spec 034): Todas/Hoje/Amanhã/Próximos 7 Dias — resolve a chave pelo sentinel numérico de `DATE_VIEW_IDS` |
| `trash` | TrashScreen | Lixeira — restaurar tarefas soft-deletadas |

**GTD core (spec 034):** a sidebar ganhou um bloco fixo no topo ("Navegação" —
`SidebarNav.tsx`) com as 5 views de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox, com
contadores via `GET /views/counts`); o item "Inbox" reusa a lista de verdade (`view='list'`)
em vez de duplicar tela, e leva um botão ⚡ que abre o `InboxProcessModal` (wizard item-a-item
do processamento guiado do inbox — 6 decisões, contador de progresso, resumível). O
`TaskModal` ganhou os campos **Status GTD** (seletor + nota de espera + "há X dias") e
**Contexto** (seletor, no máximo um). O `FilterModal` ganhou os campos `gtd_status` e
`context_id` na DSL de condições. Novo modal `ContextsModal` (CRUD de contextos — criar,
renomear, reordenar subir/descer, excluir).

**Revisão semanal guiada (spec 035):** novo modal `WeeklyReviewModal` — wizard de 6 passos
(Inbox zero, Próximas ações, Aguardando, Listas/projetos, Calendário, Algum dia/talvez) com
chips de progresso clicáveis (navegação livre), cada passo buscando dados ao vivo e aplicando
ações com efeito imediato (reusa `InboxProcessModal`'s `processInboxItem`, `complete`,
`updateTask`, `remove`, e a agregação do Calendar Hub — nenhuma lógica duplicada). Ao abrir,
sempre chama `POST /reviews/start`; se a resposta vier com `resumed: true`, pula direto para o
primeiro passo ainda não visto (US2) e mostra "revisão em andamento desde…" no cabeçalho. O
rodapé tem a nota final e o botão "Concluir revisão" (bloqueado com a lista de passos faltando
se algum não foi visto). A `SidebarNav` ganhou o item "Revisão semanal" (abaixo do bloco fixo
de views), com o nudge "última: há N dias"/"nunca" (US4) calculado no CLIENTE a partir de
`GET /reviews/last` — nunca com `CURRENT_DATE` no backend (regra global do fuso UTC-3).

**Metas e Hábitos cross-agent (spec 036):** `GoalDetailScreen` ganhou o toggle "🔗 Automática" /
"✍️ Manual" ao lado do label "Métrica" (chama `setMetricMode`; em modo automático o input vira
texto — "Valor calculado a partir dos itens vinculados"), e a seção de Movimentos ganhou um grupo
por provedor externo (`movements.external`, capa/título/status, aviso "indisponível agora" se o
provedor falhar) com um picker (select de provedor → busca → "Vincular") logo abaixo dos grupos.
`HabitModal` ganhou o campo "Fonte automática" (select carregado de
`listHabitSourceProviders()`; vazio = hábito manual). `HabitsScreen` mostra um badge "🔗 auto" ao
lado da tendência quando `done_today_source` é `auto`/`both`. `HabitHeatmap`/`HabitHeatDay` ganhou
`source?` opcional (ausente em dias vazios, presente — `manual`/`auto`/`both` — em dias com dado).

**Foco / Pomodoro (spec 037):** `FocusWidget` — widget flutuante montado uma vez em
`KaguyaShell.tsx` (fora do switch de views, mesmo nível de `Toast`), visível em **todas** as
telas internas enquanto há sessão ativa. O countdown NUNCA é contado do zero na tela: deriva
localmente (via `setInterval` de 1s) a partir do `started_at`/`duration_planned_min` recebidos
do servidor em `GET /focus/active` — por isso sobrevive a reload sem perder precisão. O
`KaguyaShell` também faz um poll de segurança a cada 30s enquanto há sessão ativa (cobre o caso
de a sessão ter sido fechada por abandono). `FocusStartModal` — escolhe preset (25/5, 50/10) ou
custom e inicia (confirma antes de encerrar uma sessão ativa existente); aberto a partir do
botão "Focar" (ícone relógio) no cabeçalho do `TaskModal` (edição) ou do botão "Foco avulso" no
topbar do shell (sem tarefa).

**Foco gameficado (spec 062) — floresta, vínculo com hábitos, overview de falhas.** Nova aba
🔲 **Foco** (view `'focus'`, ícone `timer` — estava sem uso desde sempre) na `SidebarNav`, com
tela própria `FocusScreen.tsx`: hero (streak · total focado · sessões · taxa de conclusão) →
`FocusForest` (uma árvore por sessão, agrupada por dia — clicável) → `FocusHeatmap` (grade
anual, classes `kg-fheat-*` próprias, não reusa `.kg-heat-*` dos hábitos) → `HourBars`
("quando eu foco × quando eu largo", 24 colunas com concluído pra cima/falha pra baixo) →
rankings por tarefa/lista/hábito → "padrão de falha" (taxa, tempo médio antes de desistir,
motivos recentes em texto livre) → `FocusAchievements` (grid de badges com barra de progresso
nas bloqueadas). Toggle de período (7 dias/30 dias/ano/tudo) refaz uma única chamada a
`GET /focus/stats?start=&end=`.

`ui/FocusTree.tsx` é a peça central — SVG puro, sem lib de gráfico (nenhuma existe no
`package.json`, mesmo padrão de `nami/ui.tsx`): a espécie (broto/pequena/média/grande/murcha)
é **derivada** da duração + do desfecho da sessão, nunca escolhida pelo usuário. `FocusWidget`
passa a mostrar essa árvore crescendo em tempo real (`growth` 0..1, escala a copa via
`transform: scale()`) em vez de só o `MM:SS`; o timer segue derivado de `started_at`, sem
mudança nesse princípio. Desistir abre `FocusCancelModal` (a árvore já murchando + campo
"o que te tirou do foco?" opcional) em vez de cancelar direto — `POST /focus/{id}/cancel` ganha
`reason?`. `FocusStartModal` ganha um seletor de alvo (tarefa/hábito/avulso, com `<select>` de
hábitos) quando aberto sem tarefa pré-definida; `HabitsScreen` ganha o botão "Focar neste
hábito" por card. `TaskModal` mostra o tempo acumulado de foco (`GET /{id}/focus-summary`) ao
lado do botão "Focar". `TodayScreen` troca a tirinha de barras cruas por árvores reais + streak
da semana visível.

**Meu Dia — contexto Trabalho/Pessoal (spec 038):** `TodayScreen` ganha um toggle
"Dividido/Único" (segmented control, preferência lembrada em `localStorage` — chave
`kg:myday:view`, mesmo padrão de `readViewMode`/`writeViewMode` já usado em
`KaguyaShell.tsx`). Em "Dividido" (default), a coluna esquerda mostra um bloco por contexto
(💼 Trabalho / 🏠 Pessoal — pendências, plano, sugestões filtrados), recolhendo o bloco vazio;
a coluna direita mostra duas `CapacityBar` (uma por contexto, via o novo prop opcional
`title`). Em "Único", a tela volta ao layout anterior à spec (uma lista, uma capacity). A
`DayTimeline` permanece única nos dois modos (FR-007). `ProjectModal` ganha o seletor
Pessoal/Trabalho (oculto para o Inbox); `GroupModal` ganha a ação em massa "Marcar todas as
listas do grupo como Pessoal/Trabalho" (spec 038, FR-003); `CalendarsAside` ganha um botão de
contexto (ícones 💼/🏠) por calendário Google de terceiros (`kind === 'integration'` — desde
a spec 069 não aparece nas fontes gerenciadas pela Kaguya, ver abaixo).

**Arquivar listas + localização nos eventos (spec 039):** `SortableListItem` ganha um botão
de arquivar revelado no hover (ao lado do grip), 1 clique e sem confirmação (arquivar não
move/apaga nada) — chama `archiveProject` direto. `ProjectModal` ganha "Arquivar lista" (ou
"Restaurar lista" quando já arquivada) ao lado da exclusão. Nova tela
`ArchivedProjectsScreen` (view `'archived'`, item "Arquivadas" na sidebar perto da Lixeira,
mesmo padrão de `TrashScreen`) lista as arquivadas com contagem de tarefas + data, com
Restaurar e Editar (reaproveita o `ProjectModal` para a exclusão definitiva). Resultados do
Command Palette (busca global) mostram "· arquivada" quando a tarefa vem de uma lista
arquivada. O local do evento (agenda, popover e agora também Meu Dia) virou link clicável
para o Google Maps via `lib/maps.ts::mapsLinkFor` (abre a própria URL se o local já for um
link, ex.: Google Meet).

**Sidebar do Calendário — seções Makima × Google (spec 069):** `CalendarsAside` agrupa as
fontes de `GET /api/tasks/calendar/sources` por `account` — a seção **Makima** reúne a suíte
de agentes (`kaguya`, `nami`, `frieren`, `violet`, `akane`, `marin`, `mai`, `komi` + `Kaguya
· Hábitos`), a seção **Google** só os calendários externos de terceiros. Os 7
calendários-espelho que a spec 069 cria no Google (`Nami — Finanças` … `Komi — Pessoas`)
**não** entram na seção Google — o backend os filtra (`_SKIP_NAMES`), a fonte do hub já os
representa. `Kaguya · Hábitos` é servido com `kind: 'base'` (não `'integration'`), então não
ganha o botão de contexto 💼/🏠 nem ancora o aviso "Google desconectado" (`firstGcalId`), mas
seu `id` continua `gcal:<id>`: `CalendarScreen.tsx::calEvents` liga/desliga os eventos de
alerta de hábito casando `cal === "gcal:<id>"` com `visibleGcal`, igual a qualquer calendário
Google.

**Reforma do `TaskModal` (modal de criação/edição de tarefa):**
- **`TaskModal` é o único modal de tarefa em todo o shell.** O antigo `AddTaskModal` (só
  título) foi aposentado: o "+ Adicionar tarefa" de cada coluna no Kanban de lista e no
  Kanban de grupo agora abre o `TaskModal` completo do shell via callback `onAddTask`.
  `defaults.columnId` (Kanban de lista) fixa a coluna de nascimento; `defaults.columnTargets`
  (Kanban de grupo) restringe o `<select>` de Lista às listas-membro da coluna unificada e a
  escolha resolve o `column_id`; `defaults.pickMemoryKey` lembra a última lista escolhida.
- **Zona essencial** sempre visível (título, lista+tipo, prioridade, data início/fim,
  início·fim·estimativa, tags, pessoas) + gaveta **"Mais opções"** recolhível (repetir, GTD,
  contexto, sinalizadores read-only) — estado em `localStorage: kg:taskmodal:more`.
- **GTD (Status + Contexto) também na CRIAÇÃO** (antes só em edição). `create_task` não
  aceita esses campos → o modal faz um `PATCH` de follow-up (`updateTask`) logo após criar,
  só quando algo foi escolhido (mesmo padrão do time-block).
- **Seletores de lista agrupados por grupo** (`components/ProjectSelectOptions.tsx`): Inbox +
  listas soltas no topo, depois um `<optgroup>` por grupo (ordem da sidebar). Usado no
  `<select>` de Lista do `TaskModal`, na regra `project_id` do `FilterModal` e no "copiar
  board de…" do Kanban vazio. O switcher de board do topbar já era assim (referência).
- **Título com parser na criação:** o campo aceita a mesma sintaxe do quick-add da Lista
  (`@lista !alta/!alto #tag amanhã 15h toda segunda`) — reusa `lib/parseTask.ts` + o mirror
  (`.kg-qa-wrap`/`.kg-mirror` sob `.kg-tm-title`). Os tokens reconhecidos preenchem os campos
  automaticamente (aditivo: nunca zera ajuste manual nem remove tags). `parseTask` passou a
  aceitar as duas flexões de gênero da prioridade (`!alta`/`!alto`).
- **Data início + data fim** (dois `DatePicker`) + **início·fim·estimativa** (dois `TimePicker`
  + select de duração) que se **espelham** via `lib/timeBlock.ts` (motor puro: editar dois
  quaisquer resolve o terceiro, só no mesmo dia; multi-dia deixa a estimativa independente).
  No save: `due_date` = início, `due_time` = hora de início; `setTimeBlock(start_at, end_at)`
  quando há início+fim de hora **ou** data de fim ≠ início. Nenhuma mudança de schema.
- **Campo "Pessoas"** (`components/PersonSearch.tsx`) — substitui o paredão de chips: busca
  case/acento-insensível, selecionados no topo, e "Criar «Fulano»" no rodapé quando não há
  match (`kaguyaApi.createPerson` → `POST /api/people/`). Rótulo genérico: serve para
  responsável de tarefa **ou** acompanhante de evento (sempre `person_ids` da Komi).
- **Editor de Markdown** (`MentionTextarea`): barra de formatação (B/I/H/lista/checklist/
  citação/código/link/divisor), atalhos `⌘B`/`⌘I`/`⌘K`/`⌘⇧X`, colar URL sobre seleção vira
  `[texto](url)`, e menu `/` de blocos no começo da linha (reusa o dropdown de `@menção`).
  No preview (`MarkdownPreview`), os checkboxes de checklist ficam **clicáveis** quando o pai
  passa `onChange` (marcar reescreve a n-ésima `- [ ]` ↔ `- [x]` no Markdown cru).

**Particularidades:**
- **DnD** com `@dnd-kit` (única dependência de drag-and-drop do app) — árvore de tarefas, Kanban e Eisenhower.
- **Inputs custom obrigatórios:** `DatePicker`/`TimePicker`/`MiniCalendar` no lugar dos nativos
  (ver "Padrões do frontend" em `webapp/CLAUDE.md`).
- **Notas Markdown** por tarefa (`MarkdownNotesEditor` + `react-markdown`/`remark-gfm`), com
  chips `[[id|Título]]` que reabrem tarefas mencionadas. No `TaskModal` o editor é
  **redimensionável** (divisor arrastável entre formulário e notas) e **colapsável**
  (fechar → modal só de formulário; reabrir pelo ícone de nota no cabeçalho) — largura e
  estado ficam em `localStorage` (`kg:notes:width`, `kg:notes:collapsed`). Na lista, a
  descrição **não** aparece como texto: a linha mostra só o ícone `note` (abre o modal).
- **Preferências** em `localStorage`: `kg-tweaks` (tema etc.) e `kaguya:kanban:last-list`
  (última lista aberta no Kanban).
- API: `kaguyaApi.ts` — todos os `/api/tasks/*`.

---

### AkaneShell — Filmes (`src/pages/akane/`) — no Design System (spec 072)

`conformant` no manifesto, direção de arte **"Cinema noir"** (`design/art/noir.css`). Um `AppShell`; a tela e o
item aberto vivem no **hash** (`lib/routes.ts`): `#inicio`, `#diario`, `#filmes`, `#quero-ver`, `#listas`,
`#etiquetas`, `#estatisticas`, `#filme/<id>`, `#lista/<id>` (`#rewind` cai em Estatísticas). Estado comum no
`context.ts` (`useAkane()`: rota, locais, `openLog`, `quickLog`, `save`). Complementos de CSS só com tokens
`--ds-*` em `akane.css` (prefixo `.ax-`). Capas sempre em **pôster 2:3** (`MediaCard cover="poster"` + `ds-grid-poster`; `Poster` nas prateleiras).
**Os dados do banco chegam com `null`** (`tags` é NULL em todos os filmes): `lib/normalize.ts` os troca por listas vazias uma vez, em `akaneApi`, e o `ScreenBoundary` mostra erro em vez de tela branca se uma tela estourar.

| Tela (`screens/`) | Padrão do DS | O que mostra |
|---|---|---|
| `Home` | `Hero` (tokens `--ds-hero-*` da arte) + `StatCard` + `Poster` | hero (saudação serifada, última sessão, citação, *Logar filme*/*Abrir diário*, retrato), 2 cartões (filmes no ano com a **meta** — preferência `yearlyGoal`, padrão 60 — e sessões da semana com mini-gráfico), **linha rápida de logar**, **Favoritos** e **Atividade recente** (4) em pôsteres 2:3, painel **Diário** (por mês) + **Notas** (histograma) e **Quero ver** em destaque (faixa horizontal) |
| `Films` (Filmes e Quero ver) | `useCollection` (`akane:filmes`, `akane:watchlist`) | grade de pôsteres ou lista; busca, situação/gênero/década/etiquetas/nota/curti/visto em |
| `Diary` | `useCollection` (`akane:diario`) + `renderGroupHeader` | lista por mês (nome em serifa, ano, contagem); linha com **dia grande + dia da semana**, pôster 44px, título em serifa, resenha em itálico, estrelas, chips de local/companhia; editar (`SessionEditor`), excluir com Desfazer, subir/descer na ordem do dia |
| `MovieDetail` | `DetailPage` | **primeira página** com sinopse, **Sessões e Notas lado a lado** (empilham no celular) e ficha/elenco; só o **Cofre** fica em aba; logar, curtir, situação, adicionar à lista, editar dados, atualizar/trocar match do TMDB, excluir |
| `Lists` / `ListDetail` | `useCollection` (`akane:listas`) + `DetailPage` | listas e seus filmes; criar/editar/excluir com Desfazer |
| `Tags` | `Chip` | nuvem de etiquetas; escolher mostra os filmes |
| `Stats` | `StatsPage` | o ano em filmes (`GET /api/movies/stats`); une o antigo Stats e o Rewind |

**Logar filme:** `LogCapture` (`QuickCapture`, `lib/log.ts`) entende `Título ★4.5 ontem @local +pessoa #etiqueta`.
Enter salva direto **só** se exatamente um resultado do TMDB tem o título digitado e a linha não deixou nada para
confirmar; `+pessoa` (smart-match da Komi), `@local` desconhecido ou dúvida abrem o `LogForm` preenchido
(Shift+Enter sempre abre). `lib/submit.ts` cria o filme se preciso, loga a sessão e devolve o Desfazer (apaga a sessão
e, se o filme nasceu agora, o filme). Excluir **filme** não tem Desfazer (a API não restaura).
**Onde assisti:** `PlacePicker` (campo de busca com lista, como o "Com quem"): digitar um nome novo oferece **Cadastrar como Cinema | Streaming**, que cria na hora e já seleciona; usado no `LogForm` e no `SessionEditor` (editar sessão no detalhe e no Diário). O `@local` que a linha rápida não reconhece abre o formulário com o nome já digitado.

### MarinShell — Animes (`src/pages/marin/`)

**Roteamento:** estado interno `{view, param}` (tipo `MarinView` no próprio `MarinShell.tsx`).

**Telas (screens/ + raiz):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | HomeScreen | Blocos agregados: última sessão, assistindo agora, próximos episódios, watchlist |
| `catalogo` | CatalogScreen | Catálogo de animes com filtros e ordenação |
| `diario` | DiaryScreen | Histórico de sessões de episódios |
| `watchlist` | WatchlistScreen | Fila "quero assistir" |
| `lancamentos` | ScheduleScreen | Schedule de episódios futuros dos animes em progresso |
| `stats` | StatsScreen | Estatísticas do ano |
| `detalhe` | AnimeDetail.tsx | Detalhe do anime: episódios paginados, log de sessão, nota (escala MAL 0–10) |

**Particularidades:** sync com o MyAnimeList (`POST /api/animes/sync`, delta ou full); metadados
via Jikan/AniList; preferências em `localStorage` (`mr-tweaks`) com `data-theme` claro/escuro.
API: `marinApi.ts` — todos os `/api/animes/*`.

---

### MaiShell — Séries de TV (`src/pages/mai/`)

**Roteamento:** estado interno `{view, param}` (tipo `MaiView` em `types.ts`).

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | HomeScreen | Blocos do início: assistindo agora, próximos episódios, favoritas |
| `catalog` | CatalogScreen | Catálogo de séries com filtros e pôsteres |
| `diary` | DiaryScreen | Diário de sessões |
| `watchlist` | WatchlistScreen | Séries "quero assistir" |
| `upcoming` | UpcomingScreen | Próximos episódios das séries em andamento |
| `stats` | StatsScreen | Estatísticas anuais |
| `detail` | DetailScreen | Detalhe da série: temporadas em acordeão (`SeasonAccordion`) com toggle de episódio/temporada |
| `search` | — (AddSeriesModal) | Busca no TMDB para adicionar série |

**Particularidades:** metadados via TMDB API v4 (Bearer); re-sync de metadados por série
(`POST /api/series/{id}/sync-metadata`); preferências em `localStorage` (`mai-tweaks`, com
densidade `compact|medium|cozy`). API: `maiApi.ts` — todos os `/api/series/*`.

---

### KomiShell — Pessoas (`src/pages/komi/`)

**Roteamento:** estado interno `{view, param}` (tipo `KomiView` no próprio `KomiShell.tsx`).

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | Home | Visão geral (`/api/people/overview`): cards por domínio, sugestões de reconexão, datas próximas |
| `grid` | Directory | Diretório de todas as pessoas (cards com avatar e contagem de vínculos) |
| `dates` | UpcomingDates | Datas importantes próximas (aniversários etc.) |
| `person` | PersonPage | Perfil da pessoa: apelidos, datas e vínculos cross-agent (finanças, tarefas, livros, diário) |

**Particularidades:** upload de avatar (`POST /api/people/uploads/avatar`, multipart);
`PersonModal` de criação/edição; preferências em `localStorage` (`km-tweaks`) com `data-theme`.
API: `komiApi.ts` — todos os `/api/people/*`.

---

### YatoShell — Viagens (`src/pages/yato/`)

**Roteamento:** estado interno `{view, param}` (tipo `NavState` em `types.ts`) — views `home`,
`trips`, `trip` (param = `trip_id`), `mobility`, `budget`, `checklist`.

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | HomeScreen | Hero da próxima viagem + prontidão do protocolo, 3 painéis (estratégia/orçamento/pendências), dia 1 do roteiro, outras viagens |
| `trips` | TripsScreen | Grade ⇄ lista de viagens, filtro por status, ordenação (tweak) |
| `trip` | TripDetailScreen | Cabeçalho com datas editáveis + 4 KPIs, board de dias (manhã/tarde/noite), `ComfortMatrix` do trecho |
| `mobility` | MobilityScreen | `MobilityDossier` (⭐ componente-assinatura, 7 carimbos) + estratégia recomendada + apps sugeridos |
| `budget` | BudgetScreen | 3 números grandes + `BudgetBar` por categoria + tabela de gastos (selo `→ Nami`) |
| `checklist` | ChecklistScreen | Itens agrupados por categoria (dados reais — ver nota abaixo), "Regerar do dossiê" |

**Particularidades:**
- `MobilityDossier`/`ProtocolWizard` conduzem o protocolo de 7 passos **um passo por vez** —
  nunca formulário único; cores de veredito (`--verdict-ok/none/unknown/pending`) são fixas,
  independentes do acento trocável (`data-accent`).
- `yatoApi.ts` desembrulha o `{status, trip|item: {...}}` que as tools do backend sempre devolvem
  (o router é fachada fina, não desembrulha) — ver `agents/yato/CLAUDE.md`.
- Datas de timestamp (`checked_at`, `last_checked_at`) usam `isoDateOnly()` (não `slice(0,10)`) para
  não errar o dia perto da meia-noite UTC, mesma classe de bug do `todayLocalISO()`.
- **Checklist** agrupa por categoria LIVRE dos dados (`app`/`contato`/`seguranca`/custom), não pelos
  3 baldes temporais do design handoff — o schema real não tem essa taxonomia fixa.
- Sem painel de "contatos locais" (do design handoff) — não existe tabela/tool para isso no schema
  real da fatia 066.
- Tweaks (`localStorage['yato-tweaks']`): tema, acento (4 variantes), densidade, textura de mapa,
  ordenação da tela Viagens.

API: `yatoApi.ts` — todos os `/api/travel/*`.

---

### MakimaShell — Hub (`src/pages/makima/`)

**Roteamento:** nenhum — é uma tela única na rota exata `/`, renderizada em **tela cheia,
sem o `Layout` global** (spec 023).

**O que mostra:** hero editorial + cards de agente (Nami, Frieren, Komi, Violet, Kaguya,
Mai, Marin, Akane, Yato), cada um com 2 stats reais vindos de `GET /api/hub/summary` (uma única
chamada no mount). Stat ausente/carregando/falho vira "—" (fallback gracioso). Os cards
navegam para as rotas dos shells via `<Link>` (SPA, sem reload).

**Particularidades:** tema dark/light persistido em `localStorage` (`makima-hub-theme`,
default dark); todo o CSS vive sob a classe raiz `.mkA` (zero vazamento); dados estáticos
do roster em `data.ts`. API: `makimaApi.ts` — só o `/api/hub/summary`.

## Cliente de API

Todos os domínios compartilham o mesmo mecanismo base em `src/lib/api.ts`:

```ts
// lib/api.ts (simplificado)
const api = {
  get: (url: string) => fetch(url, { credentials: "include" }).then(parse),
  post: (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(body), credentials: "include" }).then(parse),
  // patch, put, del — mesmo padrão
};
```

`credentials: "include"` garante que o cookie `makima_session` seja enviado em toda requisição.
Em erros HTTP (`!response.ok`), o wrapper lança `Error("HTTP <status>")`.

**Clientes por domínio:**

| Objeto | Onde | Endpoints cobertos |
|---|---|---|
| `api` | `lib/api.ts` | base; reexportado para usos avulsos |
| `violetApi` | `lib/api.ts` | todos os `/api/journal/*` |
| `booksApi` | `lib/api.ts` | todos os `/api/books/*` |
| `namiApi` | `pages/nami/namiApi.ts` | todos os `/api/finances/*` |
| `kaguyaApi` | `pages/kaguya/kaguyaApi.ts` | todos os `/api/tasks/*` |
| `akaneApi` | `pages/akane/akaneApi.ts` | todos os `/api/movies/*` |
| `marinApi` | `pages/marin/marinApi.ts` | todos os `/api/animes/*` |
| `maiApi` | `pages/mai/maiApi.ts` | todos os `/api/series/*` |
| `komiApi` | `pages/komi/komiApi.ts` | todos os `/api/people/*` |
| `makimaApi` | `pages/makima/makimaApi.ts` | `/api/hub/summary` |

**`uploadIcon`** em `namiApi.ts` usa `fetch` cru com `FormData` (o wrapper não suporta multipart).

## Theming e personagens

> **Design System Makima.** Existe um padrão compartilhado em `webapp/frontend/src/design/` (tokens
> `--ds-*`, tema global, `AppShell`, componentes, coleções, captura rápida, estatísticas), com
> página de referência em `/design`. Os shells abaixo ainda usam a identidade própria de cada
> um (`legacy`) e migram um por vez — ver [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (guia) e
> [`DESIGN_CONFORMANCE.md`](DESIGN_CONFORMANCE.md) (status por página). No padrão, cada agente
> mantém só a **cor de identidade** (`agents.json`) e o retrato; a estrutura é igual para todos.

Cada shell tem identidade visual própria baseada num personagem de anime:

| Shell | Personagem | Imagem | Arquivo CSS | Classe raiz |
|---|---|---|---|---|
| NamiShell | Nami (One Piece) | `nami.jpg`, `nami-hero.png` | `nami.css` | `.nami-app` |
| VioletShell | Violet Evergarden | `violet.png` | `violet.css` | `.vl-app` |
| FrierenShell | Frieren Beyond Journey's End | `frieren.png` | `frieren.css` (só complementos `.fr-*` do DS) | `.ds-app` (Design System) |
| KaguyaShell | Kaguya (Kaguya-sama: Love is War) | `kaguya.jpg` | `kaguya.css` | `.kg-app` |
| AkaneShell | Akane Kurokawa (Oshi no Ko) | `akane.png` | `akane.css` (só complementos `.ax-*` do DS) | `.ds-app` (Design System) |
| MarinShell | Marin Kitagawa (Sono Bisque Doll) | `marin.png` | `marin.css` | `.marin-shell` |
| MaiShell | Mai Sakurajima (Seishun Buta Yarou) | `mai.png` | `mai.css` | `.mai-shell` |
| KomiShell | Komi Shouko (Komi-san) | `komi.png` | `komi.css` | `.km-app` |
| MakimaShell | Makima (Chainsaw Man) | `makima.png` | `makima.css` | `.mkA` |

**Como o theming funciona:**
1. Cada CSS de personagem define tokens OKLCH ou variáveis CSS sob a classe raiz.
2. O shell aplica atributos `data-*` no elemento raiz:
   - NamiShell: `data-theme="dark|light"`, `data-acento="Tangerina|Azul-maré|Coral|Ouro"`,
     `data-privacy` (embaralha valores `.amount`), `data-density`.
   - VioletShell: `data-theme`, `data-acento` (sapphire/gold/emerald/garnet como variáveis OKLCH
     injetadas por JS), `modo-foco`, `modo-amplo`, `tipo-tecnica`.
   - Shells novos (Kaguya, Akane, Marin, Mai, Komi, Makima): `data-theme` dark/light aplicado
     na classe raiz; densidade onde houver (ex.: Mai).
3. Preferências são persistidas em `localStorage` (chaves `nami:*`, `vl-tweaks`, `fr-tweaks`,
   `kg-tweaks`, `akane-tweaks`, `mr-tweaks`, `mai-tweaks`, `km-tweaks`, `makima-hub-theme`).

**Tokens Tailwind para cores de personagem** (`tailwind.config.js`):
`c-makima`, `c-nami`, `c-frieren`, `c-kaguya`, `c-kurisu`, `c-journal`.
São usados nas páginas legadas e no `Layout` global; os shells modernos usam os tokens OKLCH
dos seus próprios arquivos CSS. O token `c-kurisu` existe mas o shell desse domínio ainda não
foi construído.

## Build e desenvolvimento

Scripts disponíveis em `webapp/frontend/`:

```bash
# Modo de desenvolvimento — HMR no localhost:5173
npm run dev

# Build de produção — compila TS + gera dist/
npm run build      # executa: tsc -b && vite build

# Pré-visualização do build (sem dev server)
npm run preview
```

A saída do build vai para `webapp/frontend/dist/` e é servida pelo FastAPI em produção.
O `dist/` não é commitado no git (veja `.gitignore`).
