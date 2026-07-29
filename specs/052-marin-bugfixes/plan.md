# Plano técnico — 052-marin-bugfixes

## Contexto técnico

Auditoria já mapeou os 12 bugs (FR-001..FR-012) para arquivo/linha exatos. Este plano
só registra as decisões de implementação; a localização de cada bug está no `spec.md`
e foi confirmada por pesquisa em `agents/marin/`, `webapp/backend/routers/animes.py` e
`webapp/frontend/src/pages/marin/`.

## Decisões

- **FR-001 (paleta do pôster)**: trocar `hash()` nativo por `hashlib.md5(...).hexdigest()`
  em `_poster_key`, mesmo padrão já usado pela Akane (`agents/akane/tools.py`).
- **FR-002 (thumbnails)**: adicionar `thumbnail_url` ao INSERT de `episodes` em `add_anime`
  e chamar `tmdb_get_episode_thumbnail` (já existe, nunca é usado) dentro do loop de
  enriquecimento em `enrich_anime` (metadata.py). Respeitar `TMDB_DELAY` existente.
- **FR-003 (delete_watch_log)**: após apagar a sessão, resetar `episodes.watched=FALSE`
  para todos os episódios do anime e remarcar `TRUE` a partir das sessões restantes
  (re-derivação total, aceita pela spec). Reverter `status`/`date_finished` se
  `episodes_watched < episodes_total` após recálculo. Recalcular `date_started` como
  `MIN(watched_date)` das sessões restantes (NULL se nenhuma restar).
- **FR-004 (token MAL)**: em `_load_state`, se `fromisoformat` retornar datetime naive
  (`.tzinfo is None`), aplicar `.replace(tzinfo=timezone.utc)`.
- **FR-005 (nota média)**: separar o filtro `episodes_count IS NOT NULL` do agregado de
  `AVG(w.rating)` — usar `AVG(w.rating) FILTER (WHERE w.rating IS NOT NULL)` sobre a
  query sem esse filtro, mantendo o filtro só para `SUM(episodes_count)`.
- **FR-006 (fuso do airing_status)**: em `metadata.py::anilist_get_data`, trocar
  `datetime.now(timezone.utc).date()` por data local (`ZoneInfo("America/Sao_Paulo")`),
  mesmo padrão de `tools.py::_today()`.
- **FR-007 (carimbo de sync)**: remover `"mal_updated_at": meta.get("mal_aired_from")` do
  INSERT de `add_anime` — deixar `NULL` até a primeira sincronização real com o MAL.
- **FR-008 (ordenar por progresso)**: adicionar `"progress"` ao `order_map` do router
  (`animes.py`), com `CASE WHEN episodes_total > 0 THEN episodes_watched::float /
  episodes_total ELSE 0 END DESC` — animes sem total conhecido tratados como 0%.
- **FR-009 (fuso no frontend)**: criar `webapp/frontend/src/pages/marin/dateUtils.ts`
  com `todayLocalISO()` (mesmo padrão de Akane/Nami/Violet). Usar em
  `LogWatchModal.tsx` (valor padrão e `max` do date picker).
- **FR-010 (erros silenciosos)**: threading de `onToast` para `CatalogScreen`,
  `ScheduleScreen` e `DiaryScreen` (hoje não recebem a prop); trocar `.catch(() =>
  setX([]))` por `.catch(() => { setX([]); onToast('Erro ao carregar ...') })`; remover
  o catch vazio de `DiaryScreen.handleDelete`.
- **FR-011 (refresh após ação)**: introduzir `reloadKey`/`bump()` em `MarinShell.tsx`,
  incrementado em `LogWatchModal.onSubmit` e no fim de `handleSyncMal`; os `useEffect`
  de `HomeScreen`, `navCounts` e `schedule` passam a depender dele.
- **FR-012 (documentação)**: corrigir em `agents/marin/CLAUDE.md`: nome da coluna
  `expires_at` (não `token_expiry`), precisão `NUMERIC(3,1)` de score/rating,
  `JIKAN_DELAY=1.2s`, host ARM `https://arm.haglund.dev/api/v2/ids`, e documentar
  `agents/marin/calendar_provider.py` (Calendar Hub) que hoje não aparece na doc.

## Arquivos afetados

- `agents/marin/tools.py` — FR-001, FR-002 (INSERT), FR-003, FR-005, FR-007
- `agents/marin/metadata.py` — FR-002 (thumbnail wiring), FR-006
- `agents/marin/mal_auth.py` — FR-004
- `agents/marin/CLAUDE.md` — FR-012
- `webapp/backend/routers/animes.py` — FR-008
- `webapp/frontend/src/pages/marin/dateUtils.ts` (novo) — FR-009
- `webapp/frontend/src/pages/marin/modals/LogWatchModal.tsx` — FR-009
- `webapp/frontend/src/pages/marin/screens/CatalogScreen.tsx` — FR-010
- `webapp/frontend/src/pages/marin/screens/ScheduleScreen.tsx` — FR-010
- `webapp/frontend/src/pages/marin/screens/DiaryScreen.tsx` — FR-010
- `webapp/frontend/src/pages/marin/MarinShell.tsx` — FR-010 (thread onToast), FR-011 (reloadKey)
- `webapp/frontend/src/pages/marin/screens/HomeScreen.tsx` — FR-011

## Verificação

- `npx tsc -b --force` + `npm run build` no frontend.
- `python -c "import ast; ast.parse(open(f, encoding='utf-8').read())"` nos arquivos Python tocados.
- Smoke test de import dos módulos alterados com `DATABASE_URL`/`GEMINI_API_KEY` dummy.
