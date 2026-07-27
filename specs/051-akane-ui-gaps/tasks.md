# Tasks: Expor na interface as funcionalidades de filmes já prontas no backend

**Input**: Design documents from `specs/051-akane-ui-gaps/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

Sem testes automatizados (nenhuma suíte no repo — padrão das specs 024–049); validação via
`quickstart.md` + `tsc -b --force` + `npm run build`. Sem mudanças de backend nesta spec —
todas as tools/rotas já existem.

## Phase 1: Setup

- [X] T001 Nenhuma migração de schema ou rota nova necessária (research.md) — confirmar que
      `add_to_list`, `update_list`, `add_vault_item`, `delete_vault_item`, `run_sync`,
      `get_heatmap`, `delete_movie`, `delete_diary_entry` já existem em
      `agents/akane/tools.py` e as rotas correspondentes em
      `webapp/backend/routers/movies.py` (checagem, sem edição).

## Phase 2: User Story 1 - Organizar filmes em listas personalizadas (Priority: P1) 🎯 MVP

**Goal**: adicionar filme a lista pelo detalhe; editar nome/descrição/cor de lista
existente; sem duplicata visível.

**Independent Test**: criar lista, abrir detalhe de filme, adicionar à lista, confirmar que
aparece ao abrir a lista; editar a lista e confirmar persistência.

- [X] T002 [US1] Novo `webapp/frontend/src/pages/akane/modals/AddToListModal.tsx`: carrega
      `akaneApi.lists()`, exibe checkbox por lista (marcado se o filme já está presente —
      requer checar via `listDetail` ou expor no payload; decisão mais simples: ao abrir,
      buscar `listDetail(id)` de cada lista não é escalável — em vez disso, chamar
      `addToList` idempotente e deixar o backend/():`ON CONFLICT` implícito da query
      cuidar de duplicata, exibindo toast "já estava na lista" quando aplicável); campo
      "+ Nova lista" inline que chama `createList` e then `addToList`.
- [X] T003 [US1] Em `webapp/frontend/src/pages/akane/screens/MovieDetailScreen.tsx`: novo
      botão "+ Adicionar a lista" na barra de ações (ao lado de "Logar sessão"), abre
      `AddToListModal` com `movie.id`.
- [X] T004 [US1] Em `webapp/frontend/src/pages/akane/screens/ListsScreen.tsx`:
      `CreateListModal` ganha prop opcional `initial` (lista existente) — quando presente,
      título vira "Editar lista", pré-preenche nome/descrição/cor/ranked, e `onSave` chama
      `akaneApi.updateList(id, ...)` em vez de `createList`. Adicionar botão "Editar" em
      `ListDetailView` (ao lado de "Excluir") que abre o modal nesse modo.
- [X] T005 [US1] Em `CreateListModal` (mesmo arquivo): adicionar seletor de cor de acento
      (paleta fixa de ~6 swatches OKLCH, mesmo padrão do seletor de acento do
      `AkaneShell.tsx`) — campo `accent` passa a ser enviado em `createList`/`updateList`
      (hoje `createList` não envia `accent` nenhum).

**Checkpoint**: listas passam a ser realmente utilizáveis (adicionar + editar).

---

## Phase 3: User Story 2 - Gerenciar itens do Cofre (Priority: P2)

**Goal**: adicionar e remover itens do Cofre pelo detalhe do filme.

**Independent Test**: abrir detalhe, adicionar item ao Cofre, conferir que aparece,
remover, conferir que some.

- [X] T006 [US2] Em `webapp/frontend/src/pages/akane/screens/MovieDetailScreen.tsx`
      (seção Cofre, ~linhas 209-251): adicionar botão de remover (✕) por item, chamando
      `akaneApi.deleteVault(item.id)` e removendo do estado local (`setData`).
- [X] T007 [US2] No mesmo arquivo: form inline "+ Adicionar ao Cofre" (tipo — select entre
      `video`/`article`/`essay`/`review`; título; url opcional; fonte opcional), chamando
      `akaneApi.addVault(movie.id, {...})` e adicionando ao estado local no sucesso.

**Checkpoint**: Cofre totalmente gerenciável sem sair do detalhe do filme.

---

## Phase 4: User Story 3 - Disparar sincronização manual (Priority: P2)

**Goal**: botão visível que dispara `syncLetterboxd()` com retorno de sucesso/erro.

**Independent Test**: clicar em sincronizar, conferir toast de resultado (sucesso ou erro).

- [X] T008 [US3] Em `webapp/frontend/src/pages/akane/AkaneShell.tsx`: novo botão
      "⟳ Sincronizar Letterboxd" na sidebar (abaixo do "Logar filme"), com estado
      `syncing` (desabilitado + "Sincronizando…" durante a chamada), chamando
      `akaneApi.syncLetterboxd()` e mostrando toast com o resumo
      (`criados/atualizados/pulados`) ou erro via `showToast`.

**Checkpoint**: sincronização sob demanda funcional, com feedback visível.

---

## Phase 5: User Story 4 - Visualizar o mapa de calor (Priority: P3)

**Goal**: heatmap de sessões por dia, acessível sem navegação indireta.

**Independent Test**: abrir Rewind, conferir heatmap com dias destacados
proporcionalmente; ano sem sessões renderiza vazio sem quebrar.

- [X] T009 [US4] [P] Novo `webapp/frontend/src/pages/akane/components/Heatmap.tsx`:
      porta de `webapp/frontend/src/pages/frieren/ui/Heatmap.tsx` trocando o campo
      `pages` por `count` (mesmo shape `{date, count}` que `HeatmapDay` da Akane já
      declara); mesma densificação local de datas (getFullYear/getMonth/getDate, nunca
      `toISOString()`).
- [X] T010 [US4] Em `webapp/frontend/src/pages/akane/akane.css`: adicionar bloco de
      classes `.heat-*`/`.hm-*` + tokens `--heat-0`..`--heat-4` escopados em
      `.akane-shell` (portados de `frieren.css`, mesmos nomes de classe).
- [X] T011 [US4] Em `webapp/frontend/src/pages/akane/screens/RewindScreen.tsx`: nova
      seção "Atividade do ano" com `<Heatmap data={...} />`, buscando
      `akaneApi.heatmap(year)` (novo `useEffect` acionado pela troca de `year` já
      existente na tela).

**Checkpoint**: heatmap visível e correto dentro do Rewind.

---

## Phase 6: User Story 5 - Excluir filme e excluir sessão do diário (Priority: P2)

**Goal**: exclusão de filme e de sessão específica, ambas com confirmação prévia.

**Independent Test**: excluir filme de teste, confirma sumiço das listagens; excluir 1
sessão de um filme com múltiplas, confirma que só ela some.

- [X] T012 [US5] Em `webapp/frontend/src/pages/akane/screens/MovieDetailScreen.tsx`:
      botão "Excluir filme" na barra de ações, com confirmação em duas etapas (mesmo
      padrão já usado em `ListDetailView` de `ListsScreen.tsx` — `confirmDelete`
      state), chamando `akaneApi.delete(movie.id)` e voltando (`onBack()`) no sucesso.
- [X] T013 [US5] No mesmo arquivo, seção "Histórico" (~linhas 172-207): botão de excluir
      (✕) por linha de sessão, com a mesma confirmação em duas etapas, chamando
      `akaneApi.deleteDiary(entry.id)` e removendo só essa entrada do estado local
      (`setData`) — sem recarregar a tela inteira.

**Checkpoint**: correções de dados possíveis pela interface, com confirmação.

---

## Phase 7: Pessoas mais assistidas no Rewind + polimentos (erro/vazio + copy watchlist)

- [X] T014 [P] Em `webapp/frontend/src/pages/akane/screens/RewindScreen.tsx`: adicionar
      `<TopLista titulo="Pessoas mais assistidas" lista={data.top_people} />` (dado já
      flui de `get_rewind`, corrigido na spec 049 para nome de exibição) — reusa o
      componente `TopLista` já existente, mesmo padrão de `top_directors`/`top_genres`.
- [X] T015 [P] Em `webapp/frontend/src/pages/akane/screens/HomeScreen.tsx`: trocar
      `.catch(() => {})` por um `loadError` state; quando `true`, renderizar bloco de
      erro distinto ("Não foi possível carregar — Tentar novamente") em vez do estado
      vazio de boas-vindas.
- [X] T016 [P] Em `webapp/frontend/src/pages/akane/screens/TagsScreen.tsx`: mesmo padrão
      de T015 (estado de erro distinto de "nenhuma etiqueta ainda").
- [X] T017 [P] Em `webapp/frontend/src/pages/akane/screens/ListsScreen.tsx`: mesmo padrão
      de T015 (estado de erro distinto de "nenhuma lista ainda"), aplicado a `loadLists`.
- [X] T018 [P] Em `webapp/frontend/src/pages/akane/screens/WatchlistScreen.tsx`: corrigir
      a copy do estado vazio de `Adicione filmes que quer assistir usando o botão "+
      Watchlist".` (botão inexistente) para `Use "Logar filme" na barra lateral, busque
      um título e feche o modal — o filme já entra na sua watchlist.`

**Checkpoint**: todas as 8 lacunas fechadas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T019 [P] Atualizar `webapp/docs/FRONTEND.md`: nova seção descrevendo os 8 gaps
      fechados (listas, Cofre, sync manual, heatmap, exclusões, Rewind, erro/vazio,
      copy watchlist).
- [X] T020 [P] Atualizar `ROADMAP.md`: nova linha da fase 051 (✅) com resumo; atualizar
      "Status atual".
- [X] T021 Validação estática: `tsc -b --force` no frontend; `npm run build`.
- [ ] T022 Executar os cenários de `quickstart.md` contra um PostgreSQL real — não
      executável neste ambiente (sem `DATABASE_URL` no sandbox).

## Dependencies & Execution Order

- **Setup (T001)** → bloqueia tudo (checagem rápida).
- **US1 (T002–T005)** é o MVP — listas ganham utilidade real. T002 bloqueia T003; T004/T005
  são o mesmo arquivo, sequenciais.
- **US2 (T006–T007)** independente de US1 — mesmo arquivo (`MovieDetailScreen.tsx`) mas
  seções diferentes (Cofre vs. ações/histórico).
- **US3 (T008)** totalmente independente — só `AkaneShell.tsx`.
- **US4 (T009–T011)** independente — T009 bloqueia T010/T011 (componente precisa existir).
- **US5 (T012–T013)** mesmo arquivo de US2 (`MovieDetailScreen.tsx`) — coordenar para não
  conflitar nas mesmas seções (ações no topo vs. histórico).
- **Phase 7 (T014–T018)** todos em arquivos diferentes — paralelos entre si e com
  qualquer user story anterior.
- **Polish (T019–T022)** por último.

## Parallel Example

T014/T015/T016/T017/T018 (5 arquivos diferentes) são paralelos entre si. T009 pode começar
em paralelo com qualquer user story (componente novo, sem dependência).

## Implementation Strategy

**MVP scope**: US1 (listas utilizáveis) é o maior ganho de valor. US2/US3/US5 têm
prioridade P2 e podem seguir em qualquer ordem. US4 (heatmap) é P3 — visual agregado, não
bloqueia uso diário. Phase 7 fecha as lacunas restantes (Rewind + polimentos) e pode ser
feita a qualquer momento, em paralelo.
