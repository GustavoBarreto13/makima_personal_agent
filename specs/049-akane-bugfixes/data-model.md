# Data Model: Correções de bugs da Akane

Nenhuma tabela nova, nenhuma coluna nova, nenhuma migração. Todas as correções reusam colunas
já existentes; a tabela abaixo mapeia cada requisito funcional às funções/queries que mudam.

| FR | Onde | O que muda |
|---|---|---|
| FR-001 | `agents/akane/tools.py::get_home` (recent_activity) | `d.liked` → `m.liked` na query |
| FR-002 | `agents/akane/tools.py::get_home` (s7/s7_prev) | adiciona `JOIN movies m` + `AND m.deleted = FALSE` |
| FR-003 | `webapp/frontend/.../HomeScreen.tsx` + `RewindScreen.tsx` | array `keys` do histograma casa com formato `"N.0"` já produzido pelo backend |
| FR-004 | `agents/akane/tools.py::get_rewind` (top_people) | `p.normalizado` → `p.name` no SELECT e no GROUP BY |
| FR-005 | `agents/akane/tools.py::_poster_palette` | `hash()` → `hashlib.md5(...)` |
| FR-006 | `agents/akane/tools.py::search_movie` + `LogModal.tsx` | busca passa a marcar `in_catalog`/`local_id`; modal usa o dado real |
| FR-007 | `webapp/frontend/.../akane/dateUtils.ts` (novo) + `LogModal.tsx` | `todayLocalISO()` local em vez de `toISOString()` |
| FR-008 | `scripts/sync_letterboxd.py::_fetch_rss` | fallback de `pubDate` via `email.utils.parsedate_to_datetime` |
| FR-009 | `scripts/sync_letterboxd.py::_fetch_rss` (+ `import_letterboxd_csv.py::_parse_rating` reusada) | clamp de rating para `0.5..5.0` |
| FR-010 | `scripts/sync_letterboxd.py::_fetch_rss` + `run_sync` | falha total levanta exceção → alerta via `scheduler/notify.py` |

## Entidades (sem mudança de shape, só de leitura/escrita corrigida)

- **Sessão de diário** (`diary_entries`): nenhuma coluna nova; leitura corrigida para não
  referenciar `d.liked` (não existe) e para excluir filmes soft-deletados no sparkline.
- **Filme** (`movies`): `liked` (já existente) agora lido do alias certo; `poster_palette`
  agora calculado de forma determinística; `deleted` (já existente) agora respeitado no
  sparkline de 7 dias.
- **Pessoa** (`movie_people`): `name` (display) agora exibido no Rewind em vez de
  `normalizado` (busca).

## Contratos

Sem contratos novos de API — todas as rotas afetadas (`GET /api/movies/home`,
`GET /api/movies/rewind/{year}`, `GET /api/movies/tmdb/search`,
`POST /api/movies` (log/add)) já existem; só o **conteúdo** dos dicts retornados muda
(campo `local_id`/`in_catalog` adicionado a `search_movie`, nenhum campo removido).
Ver `contracts/rest-api.md` para o diff exato do shape de `search_movie`.
