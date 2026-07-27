# Research: Expor na interface as funcionalidades de filmes já prontas no backend

Auditoria de código já feita (agente Explore). Para todos os 8 gaps, o backend (tools +
rotas REST + `akaneApi.ts`) já existe e está correto — o trabalho é friend-end quase puro.
Nenhuma migração de schema, nenhuma rota nova (exceto onde indicado).

## R1 — Adicionar filme a lista / editar lista (US1, FR-001, FR-002)

**Decisão**: backend 100% pronto (`add_to_list`, `update_list`, rotas `POST
/lists/{id}/items` e `PATCH /lists/{id}`, `akaneApi.addToList`/`updateList` já existem e
não são chamados por nenhum componente). Criar:
- `webapp/frontend/src/pages/akane/modals/AddToListModal.tsx` (novo) — aberto a partir de
  `MovieDetailScreen`, lista as listas existentes (`akaneApi.lists()`) com checkbox marcado
  se o filme já está presente (evita duplicata visível — Edge Case do spec.md); ação
  "Nova lista" inline chama `createList` antes de `addToList`.
- Editar lista: reusar o padrão de modal já existente (`CreateListModal`) extraindo-o para
  aceitar um modo `edit` (pré-preenche nome/descrição/cor, chama `updateList` em vez de
  `createList`) em vez de criar um componente duplicado do zero.

**Alternativas consideradas**: adicionar direto na `ListDetailView` um seletor de "filme
existente no catálogo" — rejeitado, o fluxo natural per FR-001 é a partir do **detalhe do
filme**, não da lista.

## R2 — Cofre editável (US2, FR-003)

**Decisão**: backend pronto (`add_vault_item`, `delete_vault_item`, rotas `POST
/{id}/vault` e `DELETE /vault/{id}`, `akaneApi.addVault`/`deleteVault` existem, não
chamados). Em `MovieDetailScreen.tsx` (seção Cofre, linhas ~209-251): trocar os `<div>`
read-only por itens com botão de remover (✕, mesmo padrão visual do botão de remover de
`ListDetailView`) + um formulário inline "Adicionar ao Cofre" (tipo/título/url/fonte) —
sem modal separado, dado que o Cofre já é uma seção da tela de detalhe (consistente com o
padrão de "Editar notas" que já é inline na mesma tela).

## R3 — Botão de sincronização manual (US3, FR-004)

**Decisão**: backend 100% pronto (`POST /api/movies/sync-letterboxd`, `akaneApi.
syncLetterboxd()` já existem, nenhum componente chama). Adicionar um botão "Sincronizar
Letterboxd" no `AkaneShell.tsx` (sidebar ou topbar, ao lado do "+ Watchlist"/"+ Logar" já
existentes) que chama `syncLetterboxd()`, mostra estado "Sincronizando…" (desabilitado
durante a chamada) e toast de sucesso (`created`/`updated`/`skipped`) ou erro — usando o
`onToast` já roteado pelos outros botões do shell.

## R4 — Mapa de calor (US4, FR-005)

**Decisão**: backend pronto (`get_heatmap`, rota `GET /api/movies/heatmap`, `akaneApi.
heatmap()` existem, nenhum consumidor). Portar o padrão já usado em `webapp/frontend/src/
pages/frieren/ui/Heatmap.tsx` (densifica o ano localmente, evita bug de UTC, grid de 7
linhas por mês + legenda `--heat-0..4`) para um novo `webapp/frontend/src/pages/akane/
components/Heatmap.tsx` (troca `pages` por `count` — mesmo shape `{date, count}` que o
tipo `HeatmapDay` da Akane já declara). Local de exibição: dentro de `RewindScreen.tsx`
(seção nova, abaixo do histograma de notas) — reusa a tela que já é o "olhar para trás" do
ano, evitando criar uma tela nova só para o heatmap (decisão de design da Assumption do
spec.md, resolvida aqui: bloco dentro de tela existente, não tela própria).

## R5 — Excluir filme / excluir sessão do diário (US5, FR-006, FR-007)

**Decisão**: backend pronto (`delete_movie`, `delete_diary_entry`, rotas `DELETE
/{movie_id}` e `DELETE /diary/{diary_id}`, `akaneApi.delete`/`deleteDiary` existem, não
chamados). Em `MovieDetailScreen.tsx`:
- Botão "Excluir filme" no cabeçalho/rodapé da tela, com confirmação (mesmo padrão
  `window.confirm` ou modal de confirmação já usado em `ListDetailView` para excluir
  lista — verificar qual padrão o componente já usa e reaproveitar, não introduzir um
  terceiro padrão de confirmação no mesmo shell).
- Cada linha do histórico de sessões (diário, linhas ~172-207) ganha um botão de excluir
  (✕) com a mesma confirmação, chamando `deleteDiary(entry.id)` e recarregando só a lista
  de sessões (não a tela inteira).

## R6 — Bloco "pessoas mais assistidas" no Rewind (US6/FR-008... na verdade mapeado à
Priority mencionada no spec como parte do escopo geral, sem user story própria — está
coberto pelas Key Entities/FR-008)

**Decisão**: dado já flui (`get_rewind` retorna `top_people`, tipado em `types.ts`,
corrigido na spec 049 para nome de exibição). `RewindScreen.tsx` já tem um componente
`TopLista` reutilizável (usado para `top_directors`/`top_genres`) que aceita `Array<{name,
count}>` — adicionar `<TopLista titulo="Pessoas mais assistidas" lista={data.top_people}
/>` é a menor mudança possível, sem criar componente novo.

## R7 — Erro de rede vs. estado vazio (US-implícita via Edge Cases, FR-009)

**Decisão**: `HomeScreen.tsx`, `TagsScreen.tsx` e `ListsScreen.tsx` hoje engolem o erro
(`.catch(() => {})`) e caem no mesmo estado vazio de "sem dados ainda". Menor mudança
consistente com o padrão já existente no shell Kaguya (`HabitsScreen.tsx` dispara toast de
erro no catch, em vez de engolir silenciosamente): trocar `.catch(() => {})` por um
`useState<boolean>` de erro (`loadError`) setado no catch + toast (reusando o `onToast` já
roteado nessas telas), e renderizar um bloco de erro distinto ("Não foi possível carregar —
tentar novamente" com botão de retry) em vez do estado vazio quando `loadError` é `true`.
Não introduz componente `ErrorState` compartilhado novo entre shells — mantém o fix local a
cada uma das 3 telas, como o restante do shell Akane já faz (sem componentes cross-shell).

## R8 — Copy do estado vazio da Watchlist (FR-010)

**Decisão**: a auditoria confirmou que a copy atual (`Adicione filmes que quer assistir
usando o botão "+ Watchlist".`) referencia um botão que **não existe** em lugar nenhum do
shell (`AkaneShell.tsx`, `FilmsScreen.tsx` — nenhum "+ Watchlist" foi encontrado). A ação
real disponível é a busca em "Logar filme" (CTA da sidebar): selecionar um resultado do TMDB
já chama `add_movie(status='watchlist')` imediatamente (`LogModal.tsx::selectResult`), antes
mesmo de confirmar qualquer sessão — fechar o modal sem logar já deixa o filme na watchlist.
Corrigir a copy para referenciar o botão real: `Use "Logar filme" na barra lateral, busque um
título e feche o modal — o filme já entra na sua watchlist.`

## Resumo de impacto

- **Nenhuma migração de schema** em nenhum dos 8 gaps.
- **Nenhuma rota REST nova** — todas as 12+ rotas envolvidas já existem em `movies.py`.
- **Nenhum método novo em `akaneApi.ts`** — todos os wrappers necessários já existem.
- Mudanças concentradas 100% no frontend: `MovieDetailScreen.tsx` (R1 trigger, R2, R5),
  `ListsScreen.tsx` + novo `AddToListModal.tsx` + `CreateListModal.tsx` (modo edit) (R1),
  `AkaneShell.tsx` (R3 botão), novo `components/Heatmap.tsx` + `RewindScreen.tsx` (R4, R6),
  `HomeScreen.tsx`/`TagsScreen.tsx`/`ListsScreen.tsx` (R7), `WatchlistScreen.tsx` (R8,
  conferência apenas).
