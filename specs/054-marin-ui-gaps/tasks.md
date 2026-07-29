# Tasks — 054-marin-ui-gaps

- [X] T001 [US1] Wire `RateInput` no cabeçalho de `AnimeDetail.tsx` + `marinApi.rate`
- [X] T002 [US2] `set_anime_notes` (tools.py) + rota `PATCH /animes/{id}/notes` + `NotesEditor` no detalhe
- [X] T003 [P] [US3] Tabelas `anime_lists`/`anime_list_items` — `agents/marin/schema_pg.sql`
- [X] T004 [US3] Tools de listas (get/create/update/delete/add/remove) — `agents/marin/tools.py`
- [X] T005 [US3] Rotas de listas — `webapp/backend/routers/animes.py`
- [X] T006 [US3] `ListsScreen.tsx` + `CreateListModal` + botão "+ lista" no detalhe
- [X] T007 [P] [US4] `_norm_tag()` + tools de etiquetas (get/add/remove) — `agents/marin/tools.py`
- [X] T008 [US4] Rotas de etiquetas — `webapp/backend/routers/animes.py`
- [X] T009 [US4] `TagsScreen.tsx` + editor de tags no detalhe
- [X] T010 [US5] `get_rewind(year)` (tools.py) + rota `GET /animes/rewind`
- [X] T011 [US5] `RewindScreen.tsx`
- [X] T012 Registrar novas telas no `MarinShell.tsx` (sidebar + navegação)
- [X] T013 Limpar vínculos de listas ao apagar anime (`delete_anime`) — FR-006
- [X] T014 [P] Documentar rota órfã `/currently-watching` como endpoint de integração — `webapp/docs/API.md`
- [X] T015 Registrar novas tools no `marin_agent` (Telegram) — `agents/marin/agent.py`
- [X] T016 Docs (`agents/marin/CLAUDE.md`, `webapp/docs/API.md`) + ROADMAP.md
- [X] T017 Verificação (tsc -b, build, ast.parse, smoke import)
