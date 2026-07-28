# Research: Carga histórica do Letterboxd e correção de dados (Akane)

Nenhum `NEEDS CLARIFICATION` restou no Technical Context — todas as decisões abaixo foram
resolvidas por auditoria direta do código existente (`agents/akane/tools.py`,
`scripts/import_letterboxd_csv.py`, `webapp/backend/routers/movies.py`,
`webapp/frontend/src/pages/akane/`) e pelas 4 clarificações registradas em `spec.md`.

## 1. `watched.csv` (FR-001) — já resolvido no clarify, confirmado no código

**Decision**: nova função `_process_watched(pasta, contadores)` (sem `enrich_tmdb` — este
arquivo nunca teve nota/review para enriquecer contextualmente além do título/ano, e o
comportamento acordado é só marcar `status='watched'`, sem sessão). Roda como Fase 5,
depois de `ratings.csv`. Para cada linha: dedup por `letterboxd_uri`; se já existe filme
(qualquer status), pula; se não existe, chama `add_movie(title, year, status='watched',
letterboxd_uri, source='letterboxd_csv', enrich_tmdb=enrich_tmdb)` — **sem** criar
`diary_entries` (schema exige `watched_date NOT NULL`, e este arquivo não tem data confiável).

**Rationale**: já decidido no `/speckit-clarify` anterior; `add_movie` já suporta
`status='watched'` sem sessão, então não precisa de tool nova.

**Alternatives considered**: criar `diary_entries` com data aproximada — rejeitado (spec já
resolveu isso na clarificação).

## 2. `--no-tmdb` vazando na watchlist (FR-003) — bug real confirmado

**Decision**: `_process_watchlist` (linha 249 de `scripts/import_letterboxd_csv.py`) chama
`add_movie(...)` sem passar `enrich_tmdb=enrich_tmdb` — usa o default (`True`) do parâmetro,
então `--no-tmdb` nunca se aplica à watchlist. Fix: adicionar `enrich_tmdb=enrich_tmdb` na
chamada.

**Rationale**: confirmado lendo o código (linha 249); é exatamente o bug descrito no `Input`
original da spec.

**Alternatives considered**: nenhuma — é um parâmetro faltando, correção direta.

## 3. Idioma dos metadados (FR-005)

**Decision**: trocar o literal `"pt-BR"` por `"en-US"` em `_tmdb_search` (linha 250-254 de
`agents/akane/tools.py`) e `_tmdb_detail` (linha 273). Extrair para uma constante de módulo
`_TMDB_LANG = "en-US"` (mesmo padrão de `agents/mai/metadata.py`, que já usa uma constante
`_LANG`), para não deixar o literal duplicado.

**Rationale**: os dois pontos de idioma hoje são strings soltas; consolidar numa constante
facilita qualquer ajuste futuro e documenta a decisão em um único lugar.

**Alternatives considered**: fallback automático pt-BR→en-US quando a sinopse vier vazia —
descartado (over-engineering; com `en-US` como idioma único a sinopse TMDB quase nunca vem
vazia, e o botão "Buscar Dados" cobre o caso residual).

**Nota sobre dados já gravados**: filmes importados antes desta mudança continuam com
metadados em português até que "Buscar Dados" seja acionado neles — não há migração em massa
(decisão já tomada no clarify: "sem migração em massa").

## 4. "Buscar Dados" — refresh de metadados (FR-006/FR-007)

**Decision**: nova função `refresh_movie_metadata(movie_id, tmdb_id=None)` em
`agents/akane/tools.py`:

1. Carrega o filme (`SELECT ... WHERE id = movie_id AND deleted = FALSE`); 404 se não achar.
2. Resolve o alvo: se `tmdb_id` foi passado (usuária escolheu um candidato) usa ele
   diretamente; senão usa `movie.tmdb_id` se existir; senão busca por
   `movie.title` + `movie.year` e usa o primeiro resultado (mesmo comportamento hoje usado na
   criação, via `_enrich_movie_from_tmdb`).
3. Chama `_tmdb_detail(target_tmdb_id)`. Se retornar `None` (TMDB fora do ar ou id inválido):
   retorna erro, **nenhuma coluna é tocada** (US4, cenário 4).
4. `UPDATE movies SET tmdb_id, imdb_id, title, normalizado, year, director, genres, runtime,
   overview, poster_url, backdrop_url, poster_palette, updated_at = NOW() WHERE id = movie_id`
   — recalcula `normalizado` e `poster_palette` a partir do novo título (mesmas funções
   `_norm()`/`_poster_palette()` já usadas em `add_movie`). **Nunca toca**: `status`, `rating`,
   `rating_source`, `liked`, `tags`, `notes`, `letterboxd_uri`, `last_watched_date`,
   `times_watched`, `source`, `deleted`, `created_at` — são exatamente os campos "pessoais" e
   de proveniência que FR-006/SC-006 protegem.

Para "escolher outro candidato" (FR-007): reaproveita o endpoint **já existente**
`GET /api/movies/tmdb/search?q=` (`tmdbSearch()` no frontend) — nenhuma rota de busca nova é
necessária. O fluxo na UI é: botão "Buscar Dados" chama primeiro o refresh direto (passo 2-4
acima, sem `tmdb_id`); se o resultado não for o esperado, a usuária abre "trocar filme" →
busca por texto (endpoint já existente) → escolhe um resultado → chama de novo
`refresh_movie_metadata(movie_id, tmdb_id=escolhido)`.

**Rationale**: reaproveitar `_tmdb_detail`, `_norm`, `_poster_palette` e o endpoint de busca
já existentes é o caminho de menor superfície nova (Princípio V). Um único endpoint que aceita
`tmdb_id` opcional cobre os dois cenários (refresh direto e troca de candidato) sem duplicar
rota.

**Alternatives considered**: rota de busca dedicada para candidatos — descartada, já existe
`tmdbSearch`. Endpoint separado para "aplicar candidato" vs "refresh simples" — descartado,
um único parâmetro opcional resolve os dois casos com menos superfície de API.

## 5. Edição manual — filme e sessão (FR-008/FR-009)

**Decision**:

- `update_movie_catalog(movie_id, title=None, year=None, director=None, genres=None,
  runtime=None, overview=None)` — atualização parcial (só os campos passados mudam);
  recalcula `normalizado` se `title` mudar. Os campos "pessoais" (`rating`, `liked`, `status`,
  `notes`) **já são editáveis** pelas tools existentes (`rate_movie`, `set_like`,
  `update_movie_status`, `set_notes`) — não precisam de tool nova, só de exposição na UI (hoje
  só `liked`/`status`/`notes` aparecem na tela; falta expor edição de nota fora do log de
  sessão, e o modal de edição de catálogo).
- `update_diary_entry(diary_id, watched_date=None, rating=None, review=None, tags=None,
  rewatch=None)` — atualização parcial de uma sessão. Após aplicar, recalcula os agregados do
  filme: `times_watched` = `COUNT(*)` de `diary_entries` daquele `movie_id`;
  `last_watched_date` = `MAX(watched_date)` daquele `movie_id`. Mesma lógica de recálculo que
  `delete_diary_entry` (linha 1104) já faz hoje — reaproveitar o padrão.

**Rationale**: o padrão de "tool por campo" já estabelecido (`rate_movie`, `set_like`, etc.)
funciona bem para os campos pessoais; para os campos de catálogo (6 campos, sempre editados
juntos num único modal "Editar filme") uma tool única de atualização parcial evita 6 rotas
PATCH separadas. Para sessão, idem: um único PATCH parcial.

**Alternatives considered**: uma tool `update_movie` genérica cobrindo também os campos
pessoais — descartada para não duplicar/competir com as tools campo-a-campo já em uso pelo
Telegram (`rate_movie`, `set_like` etc. são chamadas pelo agente ADK também, não só pelo
webapp); manter separado evita um segundo caminho para o mesmo dado.

## 6. Deduplicação por identidade externa (FR-010)

**Decision**: nova função privada `_resolve_movie_identity(letterboxd_uri, tmdb_id, title,
year) -> str | None` em `agents/akane/tools.py`, usada por `add_movie` e
`upsert_movie_from_letterboxd`. Ordem de resolução:

1. Se `letterboxd_uri` informado: `SELECT id FROM movies WHERE letterboxd_uri = %(uri)s`.
2. Senão, se `tmdb_id` resolvido (informado ou vindo do enriquecimento): `SELECT id FROM
   movies WHERE tmdb_id = %(tid)s AND deleted = FALSE`.
3. Senão (sem TMDB, ex. `--no-tmdb` ou TMDB não encontrou nada): `SELECT id FROM movies WHERE
   normalizado = %(norm)s AND year = %(year)s AND deleted = FALSE`.

Se encontrar um id existente em `add_movie`: em vez de retornar erro de duplicata (como hoje),
**funde** — `UPDATE movies SET letterboxd_uri = COALESCE(letterboxd_uri, %(uri)s), source =
CASE WHEN letterboxd_uri IS NULL THEN %(source)s ELSE source END WHERE id = %(id)s` (só
preenche o que estava vazio; não sobrescreve dado já presente) e retorna `status='merged'`
com o id existente. Em `upsert_movie_from_letterboxd`, mesma lógica no ponto onde hoje só
verifica `letterboxd_uri` (linha 1891-1893) — passa a também checar por `tmdb_id` antes de
decidir criar linha nova.

**Rationale**: resolve exatamente o caso descrito na US6 (filme manual + mesmo filme via
Letterboxd) sem migração de schema — `idx_movies_tmdb` já existe como índice (não-único, mas
suficiente para o `SELECT` de resolução; a garantia de não-duplicata fica na camada de
aplicação, mesmo padrão que `add_movie` já usa hoje para `letterboxd_uri`/`tmdb_id`).

**Alternatives considered**: promover `idx_movies_tmdb` a índice único — rejeitado por
Minimal Footprint: exigiria lidar com o caso de dois filmes hoje já duplicados no banco
(constraint falharia na migração); a resolução em duas etapas (SELECT-then-merge) já cobre o
requisito sem risco de quebrar dados existentes. Fica registrado como possível reforço futuro,
não bloqueante.

## 7. Ordem de sessões no mesmo dia (FR-011/FR-012)

**Decision**:

- **Importação**: `run_import` gera um `datetime` base no início da execução e incrementa por
  linha processada (ex.: `base + timedelta(milliseconds=i)`), passado como novo parâmetro
  opcional `created_at` de `upsert_movie_from_letterboxd` — substitui o `NOW()` do SQL
  (linha 1984) por um valor explícito quando fornecido. Isso garante que, dentro do mesmo
  `watched_date`, a ordem de `created_at` reflita a ordem das linhas do CSV, com contrato
  explícito (não um acidente de timing entre chamadas).
- **Reordenar pela UI**: nova função `reorder_diary_entries(watched_date, ordered_ids: list)`
  — para as entradas de um `movie_id` específico? Não: a ordenação é por dia (pode ter
  filmes diferentes no mesmo dia), então a assinatura correta é `reorder_diary_entries(date,
  ordered_ids)` sem filtrar por filme. Reatribui `created_at` para cada id na lista, em ordem,
  espaçados por 1 segundo a partir da meia-noite daquele dia (preserva a ordem relativa sem
  precisar saber o valor exato anterior). Valida que todos os `ordered_ids` pertencem a
  `diary_entries` com aquele `watched_date` antes de aplicar (não deixa misturar dias).

**Rationale**: não requer coluna nova (`position_in_day`) nem migração — reaproveita a
mesma coluna e o mesmo `ORDER BY watched_date DESC, created_at DESC` que já existe em ~5
queries (`get_diary`, `get_movie_detail`, `get_home`). É a opção que o usuário escolheu
explicitamente na clarificação.

**Alternatives considered**: coluna `position_in_day` dedicada — era a 3ª opção apresentada
na clarificação; rejeitada pelo usuário (exigiria migração + mudar ORDER BY em várias
queries, mais superfície para o mesmo resultado).

## 8. Onde a UI expõe a reordenação

**Decision**: como o histórico em `MovieDetailScreen.tsx` mostra sessões de **um filme**, a
reordenação de "dia com múltiplos filmes" não cabe ali sozinha — mas a spec (US7) só exige que
seja *possível* reordenar, não onde. Decisão de design: adicionar os controles de reordenar
(mover para cima/baixo) em cada linha de `DiaryEntryRow` sempre que houver mais de uma sessão
(de qualquer filme) no mesmo `watched_date` — para isso o detalhe do filme já teria que saber
das sessões de outros filmes naquele dia, o que ele não sabe hoje.

Caminho mais simples dentro do escopo desta spec: expor a reordenação a partir da tela
**Diário/`get_diary()`**, que já lista sessões cronologicamente entre filmes diferentes
(`GET /api/movies/diary`) — é o lugar natural onde "dia com 3 filmes" já aparece agrupado
visualmente. Adicionar os controles de mover para cima/baixo ali, agrupando por
`watched_date` no frontend.

**Rationale**: evita ensinar `MovieDetailScreen` sobre sessões de outros filmes (que não é o
seu papel) e reaproveita uma tela que já a lista cronológica de todo o diário.

**Alternatives considered**: reordenar dentro do detalhe do filme — rejeitado porque um
"dia" pode ter sessões de filmes diferentes, e o detalhe de um filme não tem visibilidade das
sessões dos outros.
