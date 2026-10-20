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
    │   └── api.ts            # fetch tipado (api, booksApi)
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

### VioletShell — Diário (`src/pages/violet/`) — no Design System (spec 076)

`conformant` no manifesto, direção de arte **"Papel de carta"** (`design/art/papel.css`: papel marfim pautado, tinta
azul-ardósia, serifa, safira + fio de ouro; contraste em `specs/076-violet-ds/contrast-papel.mjs`). Acento da Violet em
`agents.json`: safira (h 252). Um `AppShell`; a tela e o item aberto vivem no **hash** (`lib/routes.ts`): `#hoje`,
`#dia/<data>`, `#arquivo`, `#refletir`, `#refletir/semana/<data>`, `#refletir/semanas`, `#insights`, `#cartas`,
`#carta/<id>`, `#carta/nova`, `#emocoes`, `#emocao/<id>`, `#valores`, `#valores/editar`, `#valores/historico`,
`#pessoas`, `#pessoa/<id|nome:X>`, `#tags`, `#tag/<x>`, `#colecao/<tipo>`, `#sonhos`, `#ref/<agente>/<tipo>/<id>`,
`#tutor` (aliases do shell antigo e o `?date=` antigo do Calendário também abrem). API em `violetApi.ts` (saiu de `lib/api.ts`).
Celular: barra inferior **Escrever · Arquivo · Refletir · Mais**; o botão flutuante começa um momento novo.

- **Escrever** (`screens/Write.tsx`): hero compacto com o dia (setas, `DatePicker`, Hoje, fonte), sonho, Conselho do Dia,
  emoções e cartas do dia, momentos. Ler não cria página (`POST /page` no primeiro registro). Toque edita, autosave
  (800 ms), Enter cria o próximo, Backspace no vazio remove (Desfazer), deslizar troca de dia. **Barra de escrita**
  (`.vl-writebar`) presa acima do teclado (`useKeyboardInset`) com tipo, `@`, `/`, fonte e Pronto. Menu ⋯ por momento:
  favoritar, tipo, Tutor, apagar. Modo foco nas preferências.
- **Conversa no Conselho do Dia** (`components/CounselThread.tsx`, dentro do `CounselCard`): abaixo do conselho aberto,
  você responde e a Violet responde de volta (`POST /counsel/messages`); o fio vem em `GET /counsel` (`messages`) e
  reaparece ao reabrir o dia. Sua fala num bloco tingido, a da Violet no `Essay` (citações `[N]` tocáveis); regerar o
  conselho insere a divisória "Conselho regerado · HH:MM". Envio otimista, "A Violet está escrevendo…" (`role=status`),
  erro devolve o texto ao campo; Ctrl+Enter envia (no celular, só o botão Enviar). Ícone `send` novo no registro do DS.
- **Marcação** (`lib/markup.ts`, espelho de `agents/journal/markup.py`): `@[Nome](komi:id)`, `[Rótulo](agente:tipo:id)`,
  `@legado`, `#tag-com-hifen`. `components/SmartTextarea.tsx` sugere pessoas da Komi (com cadastro) ao digitar `@` e
  agentes/itens ao digitar `/` (`/k` Kaguya, `/akane`, `/frieren`, `/marin`, `/mai`, `/yato`); `RichText` desenha os chips.
- **Fontes**: Normal / Roteiro (`--ds-font-script`, Courier Prime) / Cursiva (`--ds-font-hand`, Caveat) — por dia
  (padrão nas preferências) e por carta, escolhidas já na edição (`components/FontPicker.tsx`, classes `.vl-font-*`).
- **Arquivo**: `useCollection` (`violet:arquivo`), só dias com conteúdo, busca no texto inteiro (servidor), excerpt na fonte do dia.
- **Cartas**: `violet:cartas`, leitura em `DetailPage`, compositor (`LetterComposer`) com fonte, destinatário e pessoas.
- **Registro emocional**: "como você tem estado", achados (camada 1) com evidência, leitura da Violet (camada 2),
  lista `violet:emocoes`, detalhe TCC; formulário guiado passo a passo (`EmotionForm`).
- **Refletir**: stream (revisão da semana, pergunta do dia respondível, gema/ideia, foco da Kaguya, ontem, semana,
  fixados de 30 dias, um ano atrás, memory lane com dado), seções configuráveis; revisões semanais.
- **Insights**: força da escrita (anel, tendência, série de 90 dias, meta semanal), horários, emoções × intensidade e o
  `StatsPage`. **Valores**: resumo, wizard guiado (intro → 12 áreas → notas → diagnóstico → narrativa → ações),
  check-in semanal e histórico. **Pessoas/Tags/Coleções** filtram de verdade; a página de uma referência abre o item no agente dono.

**Testes:** `lib/*.test.ts` (markup, rotas, prefs antigas) e `VioletShell.test.tsx` (shell no jsdom com a API simulada:
ler sem criar, escrever, `@`, `/`, fonte, Arquivo, Cartas, erro).

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

### KaguyaShell — Tarefas e agenda (`src/pages/kaguya/`) — no Design System (spec 075)

Reconstrução da Kaguya sobre o padrão (`AppShell`, `useCollection`, `StatsPage`, `DetailPage`, `Modal`, `confirm()` + `toast`
com Desfazer), arte **"Shuchiin aristocrático"** (`art/shuchiin.css`: vinho e dourado, papel timbrado). É o shell oficial de
`/tasks` desde a fase 11; `/tasks-next` (a prévia) redireciona para `/tasks` mantendo o `#hash`. O shell antigo (~22 mil linhas,
`kaguya.css`, TweaksPanel, Command Palette) foi removido. `conformance.json` marca a Kaguya como `conformant` (coleções com
escopo dinâmico `kaguya:*` — o lint aceita o prefixo).

- **Rotas por hash** (`lib/routes.ts`): `#hoje`, `#lista/12`, `#kanban/12`, `#grupo/3` (quadro) / `#grupo-lista/3`, `#matriz/12` (Matriz de Eisenhower de uma lista) / `#matriz-grupo/3` (de um grupo), `#visao/inbox|all|tomorrow|next7`,
  `#gtd/waiting`, `#filtro/5`, `#calendario`, `#eisenhower`, `#habitos`, `#metas[/id]`, `#experimentos[/id]`, `#foco`, `#concluidas`,
  `#estatisticas`, `#organizar`, `#etiquetas`, `#templates`, `#arquivadas`, `#lixeira`; o sufixo `/t/88` abre a tarefa no painel.
- **Espaço global** (Tudo · Trabalho · Pessoal) na barra superior: filtra todas as telas pelo `?space=`; a barra lateral, o digest e
  o Meu Dia respeitam.
- **Barra lateral** (`components/SideNav.tsx`, via `navSlot` do `AppShell`): grupos de listas que recolhem (lembrados em `prefs.collapsedGroups`),
  o **nome do grupo abre o quadro dele**, lista com o ícone próprio, tudo **arrastável** (listas dentro do grupo e entre grupos, grupos entre si,
  visões em qualquer ordem — `prefs.viewOrder`; regras puras em `lib/sideDnd.ts`). Ocultar e fixar itens ficam em **Ajustes**.
- **Ajustes** (`#ajustes`): exibição (espaço, abrir a tarefa ao lado/no centro, Meu Dia, estilo e lateral do calendário), agenda de trabalho,
  menu lateral (mostrar/fixar) e abas do celular. A gaveta de Preferências (`?`) fica só com o rápido e um botão para cá; a **largura do
  conteúdo** (centralizada/tela inteira) é do DS e vale para todos os agentes.
- **Ver como: Lista · Quadro · Matriz** (`components/ViewSwitch.tsx`): o mesmo controle, no topo à esquerda, em toda lista e todo grupo. A **Matriz**
  (`screens/Eisenhower.tsx`) usa a mesma barra da Lista (busca, Filtros, Ordenar e inverter, resumo "N de M" com Limpar filtros; sem "Agrupar",
  os quadrantes já agrupam; ordenação padrão por prioridade) com os controles guardados por escopo (`kaguya:matrix:list:12`). A Matriz geral
  (`#eisenhower`, menu "Planejar") segue existindo, com o filtro Lista no menu de Filtros. As três usam o **mesmo modal de Filtros** da Lista, do Quadro e do Calendário (veja abaixo). As três abrem a tarefa centralizada.
- **Modal de Filtros único** (`components/TaskFilterModal.tsx` + `lib/useTaskFilter.tsx`): o mesmo na Lista, no Quadro (lista e grupo), na Matriz (geral, de lista, de
  grupo) e no Calendário. **Filtros rápidos** (instantâneos, no cliente, com chips): Tipo (Tarefa/Evento/Aniversário), Lista e Grupo com "só estas / todas menos
  estas", prioridade, vencimento, etiquetas, Status GTD, Onde @ e interruptores (recorrentes, bloqueadas, notas, subtarefas, no Meu Dia). Mais as **regras
  avançadas (E/OU)** no fim do modal (o construtor completo das smart-lists; o servidor devolve os ids por `POST /api/tasks/filter-ids`); os dois se somam e as
  regras aparecem na barra como "Regras · N". Telas de uma lista só não têm Lista nem Grupo; o quadro de uma lista guarda regras como View. Os filtros ficam
  guardados por tela. No **Calendário** o botão "Filtros" (barra) vale só para o que é da Kaguya; Google e os outros agentes não são filtrados.
- **Lista no estilo TickTick**: 3 painéis (menu | lista | detalhe), adicionar no topo com chips ao vivo, subtarefas recolhíveis,
  seleção (Ctrl/Shift + clique) com barra de ação em massa e Desfazer, teclado (↑↓ Espaço Enter 0–3 T A Delete, **Alt+setas** para
  reordenar/aninhar), arrastar pela alça (antes/depois/dentro), concluídas recolhidas no fim, ordenar/agrupar/filtrar por tela.
- **Nova tarefa** (`NewTaskModal`, `Ctrl+N`/`n`): formulário completo (lista com busca/grupos/ícone, coluna, tipo, prioridade, data, horário, duração,
  repetição, etiquetas, pessoas, GTD, Onde @, Meu Dia, subtarefas e notas), com o título lido ao vivo (`@lista #tag !alta amanhã 17h`).
- **Painel de detalhe** (salva por campo; **ao lado** ou **centralizado** — `prefs.detailMode`, e sempre no centro a partir do Kanban/Calendário): data/hora, prioridade, título, lista, repetição (+ modo), estimativa, adiar, **notas em
  Markdown** (`MarkdownEditor` do DS: clica e edita, barra e atalhos, checklists clicáveis, callouts, `@pessoa` e `[[tarefa`),
  subtarefas, etiquetas, GTD/aguardando (pessoa da Komi + cobrar em), tipo, horário (bloco), coluna, local (Onde @), pessoas,
  dependências e aba **Histórico**.
- **Meu Dia**: dois tempos livres (trabalho e geral), plano (dividido ou único), pendências, sugestões, follow-ups, experimentos,
  hábitos, resumo do foco, modo férias e a **linha do dia** (arrastar a tarefa até uma hora reserva o horário).
- **Kanban e quadro de grupo**: estrutura e pele do shell antigo (título, linha de View, filtro com ordenação à direita, colunas "Vidro" com
  blur, cards de vidro, dnd, rodapé), em **tela inteira** (`Page full`).
- **Colunas do quadro de uma lista**: alça no cabeçalho para arrastar e reordenar (`colsort:<id>` no mesmo `DndContext` dos cards; colisão filtrada por tipo de arraste) e o botão **Colunas** → `ColumnsManagerModal` (nome, tipo da coluna, concluídas, excluir, criar, subir/descer; salva em ordem segura e manda a ordem final em `PUT …/columns/order`). Tipos em `lib/columnKinds.ts`, compartilhados com o `ColumnModal`.
- **Calendário** (Dia/Semana/Mês) com a estrutura do antigo (barra fixa, grade com rolagem própria, lateral de calendários com borda;
  `Page full fill`): tarefas + Google + outros agentes, faixa de expediente/almoço, mover/redimensionar/criar por arraste (com
  Desfazer), bandejas "Sem horário" e "Sem data", popover e menu de contexto, três estilos de evento.
  Nota: `Page fill` dentro de `.kn-main-col` precisa de `width:100%; margin:0` (regra em `kaguya.css`): o `margin: 0 auto` do `.ds-page` encolhe a página num pai flex em coluna e o calendário vira uma coluna estreita no meio.
- **Organizar** (`#organizar`): listas, grupos, smart-lists (construtor de regras com todos os campos), locais (Onde @), revisão
  semanal e processamento do Inbox (wizard com teclas 1–6).
- **Estatísticas**: `StatsPage` + aba **Planejamento** (onde o plano falha). **Foco**, **Hábitos** (com arquivados), **Metas**,
  **Experimentos** em `DetailPage`.
- API: `kaguya/api.ts` (`kaguyaApi`), usada também pela Nami (lembrete de pagamento) e pela Violet (ação do Conselho do Dia).
- CSS: `kaguya.css` (complementos `.kn-*` com tokens `--ds-*`) e `legacy.css` (Kanban e Calendário no escopo `.kn-legacy`, com o vidro
  e os raios do desenho original, independentes da arte). Testes: `KaguyaShell.test.tsx`, `screens/*.test.tsx`, `lib/*.test.ts`.
- Preferências em `ds:prefs:kaguya` (as chaves de localStorage `kaguya-next:*` foram mantidas para não perder o que já estava salvo).

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

No **Design System** desde a spec 074 (`conformant`, arte **"Neon kawaii"**): `AppShell`, `useCollection`,
`QuickCapture`, `DetailPage`, `StatsPage`. Rota `/animes/*`.

**Roteamento:** por hash (`/animes#diario`, `#anime/<id>`, `#lista/<id>`) em `lib/routes.ts`; o shell guarda a rota,
o catálogo (contagens do menu, linha rápida, busca do topo e Ctrl+K) e as ações comuns no `MarinContext`.
Nomes do shell antigo (`#watchlist`, `#rewind`) seguem aceitos como apelidos.

| Hash | Tela | O que mostra |
|---|---|---|
| `#inicio` | `screens/Home.tsx` | Hero "continue assistindo", 3 cartões (acompanhados, episódios em 7 dias, nota média do ano), linha rápida, favoritos (vitrine de 4), assistindo agora, atividade recente, próximos episódios, acervo por estado e a fila |
| `#catalogo` | `screens/Catalog.tsx` | Catálogo (5 estados) em pôsteres ou lista; busca, filtros (situação, gênero, formato, temporada, estúdio, etiqueta, nota, coração, data), agrupar e ordenar |
| `#quero-ver` | `Queue` (mesmo arquivo) | Fila "Quero assistir" com o atalho "Começar" |
| `#diario` | `screens/Diary.tsx` | Sessões agrupadas por mês; excluir com confirmação e Desfazer |
| `#lancamentos` | `screens/Schedule.tsx` | Próximos 14 dias por dia, selo "Novo ep", horário JST/BRT quando houver hora, "Já vi" |
| `#estatisticas` | `screens/Stats.tsx` | `StatsPage` sobre o `StatsPayload` (une o antigo Stats e o Rewind) |
| `#listas`, `#lista/<id>` | `screens/Lists.tsx` | Coleções (com ranking), criar/editar/excluir com Desfazer |
| `#etiquetas` | `screens/Tags.tsx` | Nuvem de etiquetas → animes da etiqueta |
| `#anime/<id>` | `screens/AnimeDetail.tsx` | `DetailPage`: estado, nota, coração, "Adicionar à lista", menu (atualizar dados, remover); abas Visão geral (sinopse, progresso, sessões, caderno, ficha, etiquetas) e Episódios (12 por vez) |

**Linha rápida:** `Frieren ep 12 ★4.5 ontem` (`lib/log.ts`: `ep 12`, `ep 5-8`, nota, data no passado). Sem episódio na linha, assume o
próximo. Enter salva direto quando o anime e o episódio ficaram claros; Shift+Enter ou dúvida abre o `LogForm`. Logar episódio
de anime da fila ou pausado o move para "assistindo" (o Desfazer devolve o estado).

**Nota:** o banco e o MyAnimeList usam 0–10; as telas mostram 0–5 estrelas com meia estrela. **Meia estrela = 1 ponto do MAL**
(`lib/score.ts`, que reaproveita `toFiveScale`/`fromFiveScale` do DS); a normalização acontece na borda (`lib/normalize.ts` e
`marinApi.ts`) e as telas só veem estrelas.

**Favoritos e Preferências:** a vitrine vive no servidor (`anime_favorites`); os favoritos que o shell antigo guardava em
`localStorage` (`marin.favorites`) são enviados uma vez e a chave é apagada (`lib/legacy.ts`), sem sobrescrever uma vitrine
que já exista. Preferências (`usePrefs('marin')`): layout, tamanho dos pôsteres, ordem inicial do Catálogo (lê o `mr-tweaks`
antigo uma vez) e os botões do MyAnimeList (sync delta e **completo**). Atalho `A` abre "Adicionar anime".

**API:** `marinApi.ts` — todos os `/api/animes/*` (estatísticas via `statsPayload`). Testes: `MarinShell.test.tsx`,
`screens.test.tsx`, `nullSafety.test.tsx` (payloads cheios de `null`) e `lib/*.test.ts`.

---|---|---|
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

### KomiShell — Pessoas (`src/pages/komi/`) — no Design System (spec 077)

Arte **"Caderno de bilhetes"** (`design/art/bilhetes.css`: papel quadriculado, títulos em letra de mão, "fita" nos
cartões). Sobre o `AppShell`; CTA único **Nova pessoa** (`N`); seletor **Tudo · Pessoal · Trabalho** no topo
(lembrado em `ds:prefs:komi`), que recorta todas as telas — quem é "ambos" aparece nos dois.

**Rotas por hash** (`lib/routes.ts`): `#inicio`, `#pessoas` (e `#pessoas/<relacionamento>` vindo do menu), `#datas`,
`#estatisticas`, `#pessoa/<id>` (+ `/memoria|anotacoes|interacoes|datas`). O `#pessoa/<id>` é o link que a Violet e a
Kaguya usam para abrir uma pessoa — **não mude o nome**.

| Tela | O que mostra |
|---|---|
| **Início** (`screens/Home.tsx`) | `Hero` (aniversário de hoje ou o próximo, e quem pede um oi), 4 cartões, **linha rápida** `+Bia café ontem` (`QuickCapture`, `lib/capture.ts`), próximas datas, "Reconectar" (sem contato há N dias — Preferências), "A acertar" (saldo da Nami), "Parecem a mesma pessoa" (mesclar) |
| **Pessoas** | `useCollection` (`komi:pessoas`): busca por Nome, Apelido, Nome completo, outras formas, cidade e grupo; facetas relacionamento, espaço, grupo, aniversário, último contato; agrupar; 3 ordenações; cartões ou lista |
| **Datas** | `useCollection` (`komi:datas`): aniversários e outras datas, a mais próxima primeiro, com o lembrete de cada uma |
| **Estatísticas** | `StatsPage` (`GET /api/people/stats`): contatos por mês e dia, pessoas contatadas, aniversários, sem contato, menções cruzadas |
| **Pessoa** (`screens/PersonDetail.tsx`, `DetailPage`) | Cabeçalho com os três nomes, relacionamento, espaço e contatos; ações Registrar contato · Editar · Mesclar com… · Apagar (com Desfazer). Abas: **Memória** (briefing, resumo com IA, linha do tempo dos agentes com filtro e "Desvincular", faixas Pessoal/Trabalho para "ambos", pessoas ligadas e grupos), **Anotações** (presentes/gosta/não gosta/notas + bloco de sugestões da IA com aceitar/editar/descartar), **Interações**, **Datas** (aniversário fixo + outras datas) |

**Particularidades:** a Memória é desenhada só com o que o servidor manda (`label`, `icon`, `deep_link` de cada agente) —
agente novo aparece sem mudar a tela; agente que não respondeu vira aviso "pode estar incompleta". Formulário de pessoa e de
contato em `Modal` + `Field` (conflito de Nome/Apelido volta no próprio campo). O editor da lista de **relacionamentos**
(criar, renomear, ícone, reordenar, arquivar com destino das pessoas) fica em Preferências (`components/CategoryEditor.tsx`).
Mesclar mostra a prévia (`MergeDialog`) e avisa que **não desfaz**. A foto é o único `fetch` direto (`multipart`).
`komiApi.create`/`search` mantêm a assinatura antiga (a Violet cadastra pessoas por elas).
Ícones novos no registro do DS: `cake`, `video`, `merge`.

API: `komiApi.ts` — todos os `/api/people/*` (normaliza `null` em listas). CSS: `komi.css` (só complementos `.km-*`). Testes:
`KomiShell.test.tsx`, `nullSafety.test.tsx`, `lib/*.test.ts`.

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
| `violetApi` | `pages/violet/violetApi.ts` | todos os `/api/journal/*` |
| `booksApi` | `lib/api.ts` | todos os `/api/books/*` |
| `namiApi` | `pages/nami/namiApi.ts` | todos os `/api/finances/*` |
| `kaguyaApi` | `pages/kaguya/api.ts` | todos os `/api/tasks/*` |
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
| VioletShell | Violet Evergarden | `violet.png` | `violet.css` (só complementos `.vl-*` do DS) | `.ds-app` (Design System) |
| FrierenShell | Frieren Beyond Journey's End | `frieren.png` | `frieren.css` (só complementos `.fr-*` do DS) | `.ds-app` (Design System) |
| KaguyaShell | Kaguya (Kaguya-sama: Love is War) | `kaguya.jpg` | `kaguya.css` + `legacy.css` (só complementos `.kn-*` do DS) | `.ds-app` (Design System) |
| AkaneShell | Akane Kurokawa (Oshi no Ko) | `akane.png` | `akane.css` (só complementos `.ax-*` do DS) | `.ds-app` (Design System) |
| MarinShell | Marin Kitagawa (Sono Bisque Doll) | `marin.png` | `marin.css` | `.marin-shell` |
| MaiShell | Mai Sakurajima (Seishun Buta Yarou) | `mai.png` | `mai.css` | `.mai-shell` |
| KomiShell | Komi Shouko (Komi-san) | `komi.png` | `komi.css` (só complementos `.km-*` do DS) | `.ds-app` (Design System) |
| MakimaShell | Makima (Chainsaw Man) | `makima.png` | `makima.css` | `.mkA` |

**Como o theming funciona:**
1. Cada CSS de personagem define tokens OKLCH ou variáveis CSS sob a classe raiz.
2. O shell aplica atributos `data-*` no elemento raiz:
   - NamiShell: `data-theme="dark|light"`, `data-acento="Tangerina|Azul-maré|Coral|Ouro"`,
     `data-privacy` (embaralha valores `.amount`), `data-density`.
   - Shells novos (Mai, Makima): `data-theme` dark/light aplicado
     na classe raiz; densidade onde houver (ex.: Mai).
3. Preferências são persistidas em `localStorage` (chaves `nami:*`, `fr-tweaks`,
   `kg-tweaks`, `akane-tweaks`, `mr-tweaks`, `mai-tweaks`, `makima-hub-theme`).

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
