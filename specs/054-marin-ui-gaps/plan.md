# Plano técnico — 054-marin-ui-gaps

## Contexto técnico

Pesquisa confirmou que FR-001/FR-002 (nota e caderno) são só fiação — os campos e, no
caso da nota, a própria rota já existem. FR-003/FR-004 (listas/etiquetas) e FR-005
(rewind) não têm nenhuma infra hoje; a Akane já implementa listas/etiquetas/rewind para
filmes e serve de referência direta (mesma forma de tabela, mesmos tools, mesmo
desenho de tela) — adaptado para `anime`/`mal_id` em vez de `movies`.

## Decisões

- **FR-001 (nota pela tela de detalhe)**: trocar `<Stars score={score} size={18} />`
  read-only por `<RateInput value={score} onChange={handleRateChange} />` (já existe,
  hoje só usado no `LogWatchModal`) no cabeçalho de `AnimeDetail.tsx`. `handleRateChange`
  chama `marinApi.rate(animeId, {score})` (rota `PATCH /animes/{id}/score` já existe,
  nunca chamada) e atualiza o estado local otimisticamente (mesmo padrão de
  `handleStatusChange`/`localStatus` já usado na tela).
- **FR-002 (Caderno da Marin)**: replicar 1:1 o padrão `NotesEditor` da Akane
  (`agents/akane/tools.py::set_notes`, router `PATCH /{id}/notes`,
  `MovieDetailScreen.tsx::NotesEditor`) — nova tool `set_anime_notes(anime_id_or_query,
  notes)` em `agents/marin/tools.py`, rota `PATCH /animes/{id}/notes`, componente
  `NotesEditor` em `AnimeDetail.tsx` (editar/exibir/vazio).
- **FR-003 (listas)**: novas tabelas `anime_lists`/`anime_list_items` (mesma forma de
  `movie_lists`/`movie_list_items` da Akane, FK para `anime.id TEXT`). Tools novas em
  `agents/marin/tools.py`: `get_lists`, `get_list`, `create_list`, `update_list`,
  `delete_list`, `add_to_list`, `remove_from_list` — porta direta da Akane. Rotas
  espelhando `webapp/backend/routers/movies.py`. Frontend: `ListsScreen.tsx` +
  `CreateListModal` (porta da Akane, paleta de acento própria da Marin), botão
  "+ Adicionar a lista" no detalhe (modal simples de seleção/criação inline).
- **FR-004 (etiquetas)**: usa a coluna `anime.tags TEXT[]` já existente (nunca lida/
  escrita hoje). Diferente da Akane (que não normaliza), a Marin precisa de
  normalização de caixa/acento para evitar duplicata — novo helper `_norm_tag()`
  (lowercase + NFD strip acentos, preserva espaços — mais leve que `_norm()`, que
  também remove pontuação/espaços). Tools novas: `get_tags()` (agrega
  `UNNEST(tags)` já normalizado), `add_tag(anime_id, tag)`, `remove_tag(anime_id, tag)`.
  Rotas novas (Akane só tem GET, aqui precisa de POST/DELETE também). Frontend:
  `TagsScreen.tsx` (porta da Akane, sem o badge `person`, já que Marin não tem tabela
  de pessoas/staff) + editor de tags no detalhe.
- **FR-005 (Rewind)**: `get_stats(year)` já calcula ~80% do necessário (total_hours,
  monthly, top_studios, highlight, max_marathon_day, heatmap, completed). Nova tool
  fina `get_rewind(year)` que chama `get_stats(year)` e não precisa computar nada a
  mais além do que `get_stats` já devolve — mantém paridade estrutural com a Akane
  (`get_rewind` como endpoint próprio, não reaproveitar `/stats` direto no frontend)
  mas sem duplicar cálculo. Rota `GET /animes/rewind?year=N`. Frontend:
  `RewindScreen.tsx` (porta do layout da Akane, sem o bloco "top pessoas" — Marin não
  tem staff/elenco).
- **FR-006 (excluir vínculos)**: `delete_anime` (soft delete) precisa apagar as linhas
  de `anime_list_items` para aquele `anime_id` (tags não precisam de limpeza — é um
  array na própria linha do anime, já fica soft-deleted junto). Como `anime_list_items`
  usa `ON DELETE CASCADE` só em hard delete, e `delete_anime` é soft delete, adiciona-se
  um `DELETE FROM anime_list_items WHERE anime_id = ...` explícito na mesma função.
- **FR-007 (rota órfã)**: documentar `GET /api/animes/currently-watching` em
  `webapp/docs/API.md` como "endpoint de integração" (mesmo texto usado para
  `/api/finances/summary` da Nami) — mantido pois o `marin_agent` (Telegram) usa a
  função Python por trás dele como tool ADK; não remover a rota HTTP.

## Arquivos afetados

- `agents/marin/schema_pg.sql` — `anime_lists`, `anime_list_items` (novas tabelas)
- `agents/marin/tools.py` — `set_anime_notes`, listas (7 funções), tags (3 funções),
  `get_rewind`, `_norm_tag()`, ajuste em `delete_anime`
- `agents/marin/agent.py` — registrar as novas tools ADK + instrução
- `webapp/backend/routers/animes.py` — rotas de notes/lists/tags/rewind
- `webapp/frontend/src/pages/marin/AnimeDetail.tsx` — RateInput, NotesEditor, tag editor, botão "+ lista"
- `webapp/frontend/src/pages/marin/screens/ListsScreen.tsx` (novo)
- `webapp/frontend/src/pages/marin/screens/TagsScreen.tsx` (novo)
- `webapp/frontend/src/pages/marin/screens/RewindScreen.tsx` (novo)
- `webapp/frontend/src/pages/marin/modals/CreateListModal.tsx` / `AddToListModal.tsx` (novos)
- `webapp/frontend/src/pages/marin/marinApi.ts`, `types.ts` — novos métodos/tipos
- `webapp/frontend/src/pages/marin/MarinShell.tsx` — novas views na sidebar
- `webapp/docs/API.md`, `agents/marin/CLAUDE.md` — documentação

## Verificação

- `npx tsc -b --force` + `npm run build`.
- `ast.parse` + smoke import dos módulos Python tocados.
- Revisão manual do fluxo: avaliar anime → escrever caderno → criar lista → adicionar
  anime à lista → etiquetar → abrir Rewind do ano corrente.
