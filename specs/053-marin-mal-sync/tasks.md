# Tasks — 053-marin-mal-sync

- [X] T001 [P] `anime.local_updated_at` — `agents/marin/schema_pg.sql` + `scripts/migrate_marin_reforma.py`
- [X] T002 [US1] `push_list_status(mal_id, status?, score?, num_watched_episodes?)` + `_LOCAL_STATUS_TO_MAL` — `agents/marin/mal_sync.py`
- [X] T003 [US1] Push best-effort em `log_watch`, `update_anime_status`, `rate_anime`, `delete_watch_log`, `delete_anime` — `agents/marin/tools.py`
- [X] T004 [US2] Reescrever `_upsert_mal_entry`: cria sessão de ajuste em vez de sobrescrever contador — `agents/marin/mal_sync.py`
- [X] T005 [US2] [US5] Convergência determinística de status/nota (local_updated_at vs mal updated_at)
- [X] T006 [US4] `_insert_enriched_anime` compartilhada + enriquecimento automático no pull — `agents/marin/mal_sync.py`
- [X] T007 Edge case: soft-delete não ressuscita (checa `deleted=TRUE` antes do INSERT)
- [X] T008 [US3] `run_marin_mal_sync` + registro no scheduler (every 6h) — `scheduler/jobs.py`, `scheduler/registry.py`
- [X] T009 Docs (`agents/marin/CLAUDE.md`, `scheduler/CLAUDE.md`) + ROADMAP.md
- [X] T010 Verificação (ast.parse, smoke import, tsc -b se algo mudar no front)
