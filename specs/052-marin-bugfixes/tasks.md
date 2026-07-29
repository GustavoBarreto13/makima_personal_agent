# Tasks — 052-marin-bugfixes

- [X] T001 [P] Corrigir paleta do pôster (`_poster_key` com md5) — `agents/marin/tools.py`
- [X] T002 Popular `thumbnail_url` no INSERT de episódios + chamar `tmdb_get_episode_thumbnail` no enriquecimento — `agents/marin/tools.py`, `agents/marin/metadata.py`
- [X] T003 Re-derivar estado do anime ao apagar sessão do diário (`delete_watch_log`) — `agents/marin/tools.py`
- [X] T004 Normalizar datetime naive do token MAL para UTC — `agents/marin/mal_auth.py`
- [X] T005 [P] Separar filtro de `AVG(rating)` do filtro de contagem de episódios — `agents/marin/tools.py`
- [X] T006 [P] Usar fuso local para decidir lançado/agendado — `agents/marin/metadata.py`
- [X] T007 [P] Remover `mal_updated_at` preenchido com data de estreia — `agents/marin/tools.py`
- [X] T008 [P] Adicionar ordenação "progress" no catálogo — `webapp/backend/routers/animes.py`
- [X] T009 Criar `dateUtils.ts` e usar em `LogWatchModal` — `webapp/frontend/src/pages/marin/`
- [X] T010 Thread `onToast` em Catalog/Schedule/Diary + remover catch vazio — `webapp/frontend/src/pages/marin/`
- [X] T011 `reloadKey`/`bump()` no MarinShell para refresh pós-ação — `webapp/frontend/src/pages/marin/MarinShell.tsx`, `HomeScreen.tsx`
- [X] T012 [P] Corrigir divergências de documentação — `agents/marin/CLAUDE.md`
- [X] T013 Verificação (tsc -b, build, ast.parse, smoke import)
