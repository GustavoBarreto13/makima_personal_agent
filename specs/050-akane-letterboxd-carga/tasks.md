# Tasks: Carga histórica do Letterboxd e correção de dados (Akane)

**Input**: Design documents from `specs/050-akane-letterboxd-carga/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

Sem testes automatizados (nenhuma suíte no repo — padrão das specs 024–051); validação via
`quickstart.md` + `tsc -b --force` + `npm run build` + execução manual dos scripts. Nenhuma
migração de schema — todas as mudanças são de comportamento sobre tabelas já existentes.

## Phase 1: Setup

- [X] T001 Nenhuma dependência ou schema novo necessário (research.md confirma reaproveitamento
      total do que já existe em `agents/akane/tools.py`, `scripts/import_letterboxd_csv.py` e
      `webapp/backend/routers/movies.py`) — checagem, sem edição.

## Phase 2: Foundational (bloqueia todas as user stories)

**Goal**: a nova função de resolução de identidade é usada por US1 (import) e US6 (dedup) —
construir uma vez, no back-end, antes de qualquer user story.

- [X] T002 Em `agents/akane/tools.py`: adicionar `_TMDB_LANG = "en-US"` como constante de
      módulo (perto de `_TMDB_BASE`/`_TMDB_IMG_POSTER`); trocar os dois literais `"pt-BR"` em
      `_tmdb_search` (~linha 250-254) e `_tmdb_detail` (~linha 273) por `_TMDB_LANG`.
- [X] T003 Em `agents/akane/tools.py`: nova função privada `_resolve_movie_identity(
      letterboxd_uri: str | None, tmdb_id: int | None, title: str, year: int | None) -> str |
      None` — resolve nesta ordem: (1) `SELECT id FROM movies WHERE letterboxd_uri = ...`
      se informado; (2) `SELECT id FROM movies WHERE tmdb_id = ... AND deleted = FALSE` se
      resolvido; (3) `SELECT id FROM movies WHERE normalizado = _norm(title) AND year = ...
      AND deleted = FALSE` como fallback. Retorna o primeiro `id` encontrado ou `None`.

**Checkpoint**: `_resolve_movie_identity` pronta para ser chamada por `add_movie` (US6) e
`upsert_movie_from_letterboxd` (US1/US6).

---

## Phase 3: User Story 1 - Importar todo o histórico do Letterboxd sem perdas (Priority: P1) 🎯 MVP

**Goal**: `watched.csv` processado; nenhum filme do export fica de fora; importação
permanece idempotente.

**Independent Test**: rodar a importação com um export de teste contendo um filme presente
apenas no `watched.csv` e confirmar que ele aparece na coleção ao final (ver quickstart.md,
Cenário 1).

- [X] T004 [US1] Em `scripts/import_letterboxd_csv.py`: nova função `_process_watched(pasta:
      Path, contadores: dict) -> None` — lê `watched.csv` (colunas `Name`, `Year`, `Letterboxd
      URI`); para cada linha, pula se `letterboxd_uri` vazio; verifica se já existe filme com
      esse `letterboxd_uri` (`SELECT id FROM movies WHERE letterboxd_uri = ...`) — se existe,
      pula; se não existe, chama `add_movie(title=row["Name"], year=..., status="watched",
      letterboxd_uri=..., source="letterboxd_csv", enrich_tmdb=enrich_tmdb)` — **sem** criar
      sessão. Segue o padrão de log/contadores de `_process_ratings_fallback`.
- [X] T005 [US1] Em `scripts/import_letterboxd_csv.py`, dentro de `run_import`: adicionar
      "Fase 5/5: watched.csv" chamando `_process_watched(pasta, contadores)` depois de
      `_process_ratings_fallback`; atualizar o log `"=== Fase 4/4"` → `"Fase 4/5"` nas 4 fases
      existentes e a docstring do módulo (linha 9-14) e de `run_import` para refletir as 5
      fases.
- [ ] T006 [US1] Validar manualmente (quickstart.md Cenários 1 e 2): rodar a importação duas
      vezes contra um export de teste com um filme só em `watched.csv`; confirmar que aparece
      com `status='watched'` sem `diary_entries`, e que a segunda execução não duplica nada.

**Checkpoint**: nenhuma lacuna de importação restante — todo arquivo do export é processado.

---

## Phase 4: User Story 2 - Importar sem enriquecimento externo (Priority: P3)

**Goal**: `--no-tmdb` se aplica uniformemente, incluindo a watchlist.

**Independent Test**: rodar a importação com `--no-tmdb` e confirmar, pelos logs, que nenhuma
chamada de rede ao TMDB ocorre nem para a watchlist (quickstart.md, Cenário 3).

- [X] T007 [US2] Em `scripts/import_letterboxd_csv.py`, `_process_watchlist` (~linha 249): a
      chamada a `add_movie(...)` está sem `enrich_tmdb=enrich_tmdb` — adicionar o argumento
      (bug real, já confirmado em research.md §2).
- [ ] T008 [US2] Validar manualmente (quickstart.md Cenário 3): rodar com `--no-tmdb -v` e
      grep nos logs (nível DEBUG) confirmando ausência de chamadas ao TMDB para itens da
      watchlist.

**Checkpoint**: `--no-tmdb` funciona por igual em todas as categorias do export.

---

## Phase 5: User Story 3 - Executar a carga histórica real em produção (Priority: P1)

**Goal**: roteiro documentado, passo a passo, para a carga real no VPS.

**Independent Test**: seguir o roteiro do início ao fim contra o export real e confirmar
contagem final coerente (quickstart.md, Cenário 9).

- [X] T009 [US3] Em `agents/akane/CLAUDE.md`, seção "Scripts de sincronização" →
      `scripts/import_letterboxd_csv.py`: expandir o roteiro de execução no VPS com os passos
      de confirmação pós-carga (consultar contagem via `GET /api/movies/stats` ou tela
      Estatísticas do webapp) e o passo de validação de idempotência (rodar 2×, comparar
      contagem). Referenciar `quickstart.md` (Cenário 9) em vez de duplicar o texto.
- [ ] T010 [US3] Executar a carga real do export do usuário no VPS (fora deste ambiente de
      desenvolvimento — comando documentado em T009); não executável neste sandbox sem
      `DATABASE_URL` de produção.

**Checkpoint**: catálogo real populado, roteiro validado.

---

## Phase 6: User Story 6 - Não duplicar filmes entre fontes (Priority: P1)

**Goal**: filme cadastrado manualmente + mesmo filme no export = um único registro.

**Independent Test**: cadastrar um filme manualmente, importar um export que o contém, e
confirmar que a coleção passa a ter um único registro, agora com `letterboxd_uri` (quickstart.md,
Cenário 4).

> Sequenciada antes de US4/US5/US7 porque `add_movie`/`upsert_movie_from_letterboxd` são
> tocadas por ela e por US1 (T004) — evita retrabalho de merge de código.

- [X] T011 [US6] Em `agents/akane/tools.py`, `add_movie` (~linha 462): substituir os dois
      blocos de dedup (`letterboxd_uri` → erro; `tmdb_id` → erro, linhas ~495-512) por uma
      chamada a `_resolve_movie_identity(letterboxd_uri, tmdb_id, title, year)` **antes** do
      enriquecimento TMDB (usando o `tmdb_id` informado, se houver) e novamente **depois**
      (usando `final_tmdb_id` resolvido pelo enriquecimento, se `tmdb_id` não foi informado).
      Se resolver um id existente: `UPDATE movies SET letterboxd_uri = COALESCE(letterboxd_uri,
      %(uri)s) WHERE id = %(id)s` (só preenche o que estava vazio) e retornar `{"status":
      "merged", "id": id_existente}` em vez de criar linha nova ou erro de duplicata.
- [X] T012 [US6] Em `agents/akane/tools.py`, `upsert_movie_from_letterboxd` (~linha 1850): no
      bloco de dedup de filme (linhas ~1891-1893, hoje só `WHERE letterboxd_uri = ...`),
      resolver primeiro o `tmdb_id` (via `_enrich_movie_from_tmdb` se `enrich_tmdb=True`) e
      chamar `_resolve_movie_identity` incluindo esse `tmdb_id` antes de decidir criar linha
      nova — se encontrar um filme existente sem `letterboxd_uri`, anexar o URI a ele (mesmo
      padrão de merge de T011) em vez de criar um segundo registro.
- [ ] T013 [US6] Validar manualmente (quickstart.md Cenário 4): cadastrar filme manual, rodar
      import com esse filme no export, confirmar registro único + `letterboxd_uri` anexado +
      dados manuais preservados.

**Checkpoint**: identidade de filme resolvida de forma consistente entre cadastro manual,
sync RSS e importação CSV.

---

## Phase 7: User Story 4 - Corrigir dados de um filme importado errado (Priority: P1)

**Goal**: botão "Buscar Dados" no detalhe do filme — sobrescreve metadados de catálogo,
permite trocar o match, nunca toca em dado pessoal.

**Independent Test**: acionar a busca de dados num filme com metadados desatualizados e
confirmar que só os campos de catálogo mudam (quickstart.md, Cenário 6).

- [X] T014 [US4] Em `agents/akane/tools.py`: nova função `refresh_movie_metadata(movie_id: str,
      tmdb_id: int | None = None) -> dict` — carrega o filme (404/erro se não achar ou
      `deleted`); resolve o alvo (`tmdb_id` do parâmetro > `movie.tmdb_id` > busca por
      título+ano, primeiro resultado); chama `_tmdb_detail`; se `None`, retorna erro sem tocar
      nenhuma coluna; senão `UPDATE movies SET tmdb_id, imdb_id, title, normalizado, year,
      director, genres, runtime, overview, poster_url, backdrop_url, poster_palette, updated_at
      = NOW() WHERE id = movie_id` (recalcula `normalizado` via `_norm(title)` e
      `poster_palette` via `_poster_palette(title)`, mesmas funções já usadas em `add_movie`).
      Nunca toca `status/rating/rating_source/liked/tags/notes/letterboxd_uri/source/
      last_watched_date/times_watched/created_at/deleted`.
- [X] T015 [US4] Em `webapp/backend/routers/movies.py`: novo modelo Pydantic
      `RefreshMetadataBody { tmdb_id: int | None = None }` e rota
      `POST /{movie_id}/refresh-metadata` chamando `refresh_movie_metadata(movie_id,
      body.tmdb_id)` com `_check_result`. Registrar entre as rotas fixas e `/{movie_id}` (mesma
      posição de `/{movie_id}/watch` — depois das rotas de coleção, antes do fim do arquivo).
- [X] T016 [US4] Em `webapp/frontend/src/pages/akane/akaneApi.ts`: novo método
      `refreshMetadata(movieId: string, tmdbId?: number)` → `POST
      /api/movies/{movieId}/refresh-metadata` com body `{ tmdb_id: tmdbId }`.
- [X] T017 [US4] Em `webapp/frontend/src/pages/akane/screens/MovieDetailScreen.tsx`: novo botão
      "🔎 Buscar Dados" na barra de ações (ao lado de "+ Adicionar a lista"); ao clicar, chama
      `akaneApi.refreshMetadata(movie.id)` sem `tmdb_id`, mostra toast de sucesso/erro, e
      atualiza `data.movie` com o retorno (via `setData`) — sem recarregar a tela inteira.
- [X] T018 [US4] Novo `webapp/frontend/src/pages/akane/modals/TmdbCandidatesModal.tsx`: reusa
      `akaneApi.tmdbSearch(query)` (rota já existente); lista resultados com pôster miniatura,
      título e ano; ao escolher um, chama `onSelect(tmdb_id)`. Acionado por um link/botão
      secundário "Trocar filme" dentro do fluxo de "Buscar Dados" em `MovieDetailScreen.tsx`,
      que then chama `akaneApi.refreshMetadata(movie.id, tmdb_id)`.
- [ ] T019 [US4] Validar manualmente (quickstart.md Cenário 6): filme com metadados em
      português → inglês após refresh; filme mal-casado → corrigido via troca de candidato;
      nota/coração/anotações/sessões inalterados nos dois casos; `TMDB_API_KEY` inválida →
      erro visível, filme inalterado.

**Checkpoint**: qualquer filme importado errado pode ser corrigido sem apagar e reimportar.

---

## Phase 8: User Story 5 - Editar manualmente filme e sessões (Priority: P1)

**Goal**: campos de catálogo e cada sessão do diário editáveis pela interface.

**Independent Test**: editar título/ano/diretor/duração/gêneros/sinopse de um filme e a
data/nota/resenha/tags/revisão de uma sessão, confirmando persistência e recálculo de
agregados (quickstart.md, Cenário 7).

- [X] T020 [US5] Em `agents/akane/tools.py`: nova função `update_movie_catalog(movie_id: str,
      title: str | None = None, year: int | None = None, director: list[str] | None = None,
      genres: list[str] | None = None, runtime: int | None = None, overview: str | None =
      None) -> dict` — atualização parcial (só monta `SET` para os campos não-`None`);
      recalcula `normalizado` via `_norm()` somente se `title` for um dos campos passados.
- [X] T021 [US5] Em `agents/akane/tools.py`: nova função `update_diary_entry(diary_id: str,
      watched_date: date | None = None, rating: float | None = None, review: str | None =
      None, tags: list[str] | None = None, rewatch: bool | None = None) -> dict` —
      atualização parcial de `diary_entries`; valida `rating` com `_validate_rating` se
      informado; após o `UPDATE`, recalcula e persiste no filme dono
      (`movies.last_watched_date = MAX(watched_date)`, `movies.times_watched = COUNT(*)` de
      `diary_entries` daquele `movie_id`) — mesmo padrão de recálculo que `delete_diary_entry`
      (~linha 1104) já usa. Retorna `{"status": "ok", "entry": {...}, "movie": {
      "last_watched_date": ..., "times_watched": ... }}`.
- [X] T022 [US5] Em `webapp/backend/routers/movies.py`: modelo `UpdateMovieCatalogBody`
      (todos os campos opcionais) + rota `PATCH /{movie_id}/catalog` chamando
      `update_movie_catalog`; modelo `UpdateDiaryEntryBody` (todos opcionais) + rota
      `PATCH /diary/{diary_id}` chamando `update_diary_entry` — registrar `PATCH
      /diary/{diary_id}` antes de qualquer rota `/{movie_id}` genérica que possa colidir
      (seguir a mesma ordem já usada por `DELETE /diary/{diary_id}`, linha 548).
- [X] T023 [US5] Em `webapp/frontend/src/pages/akane/akaneApi.ts`: novos métodos
      `updateCatalog(movieId, body: Partial<{title,year,director,genres,runtime,overview}>)`
      → `PATCH /api/movies/{movieId}/catalog`; `updateDiaryEntry(diaryId, body:
      Partial<{watched_date,rating,review,tags,rewatch}>)` → `PATCH
      /api/movies/diary/{diaryId}`.
- [X] T024 [US5] Novo `webapp/frontend/src/pages/akane/modals/EditMovieModal.tsx`: form com
      título, ano, diretor (input de tags/chips), gêneros (input de tags/chips), duração,
      sinopse (textarea); ao salvar, chama `akaneApi.updateCatalog` e retorna o filme
      atualizado via `onSaved(movie)`.
- [X] T025 [US5] Em `MovieDetailScreen.tsx`: botão "✎ Editar filme" na barra de ações, abre
      `EditMovieModal` pré-preenchido com `data.movie`; no `onSaved`, atualiza `data.movie`
      via `setData` (mesmo padrão dos outros patches locais do arquivo).
- [X] T026 [US5] Em `MovieDetailScreen.tsx`, `DiaryEntryRow` (~linha 439-519): adicionar modo
      de edição inline (ícone ✎ ao lado do ✕ já existente) — expande a linha em um pequeno
      form (data, nota via `StarRateInput` já usado no `LogModal`, resenha, tags, checkbox de
      revisão); ao salvar, chama `akaneApi.updateDiaryEntry` e atualiza tanto a entrada quanto
      `data.movie.last_watched_date`/`times_watched` no `setData`, usando o `movie` retornado
      pela API.
- [ ] T027 [US5] Validar manualmente (quickstart.md Cenário 7): editar campos de catálogo e
      confirmar persistência; editar data de uma sessão para uma data mais recente e confirmar
      que `last_watched_date`/`times_watched` do filme refletem a mudança.

**Checkpoint**: nenhum dado de filme ou sessão fica permanentemente errado por falha de fonte
externa ou da importação.

---

## Phase 9: User Story 7 - Ordem correta de sessões no mesmo dia (Priority: P2)

**Goal**: ordem de sessões no mesmo dia reflete o export; reordenável pela interface.

**Independent Test**: importar um export com 3 sessões no mesmo dia, confirmar ordem igual à
do CSV, reordenar pela interface e confirmar persistência (quickstart.md, Cenário 8).

- [X] T028 [US7] Em `agents/akane/tools.py`, `upsert_movie_from_letterboxd` (~linha 1850):
      adicionar parâmetro opcional `created_at: datetime | None = None`; no `INSERT` de
      `diary_entries` (~linha 1984), usar `%(created_at)s` com `COALESCE`-equivalente em
      Python (`created_at or _now()`) em vez de `NOW()` fixo no SQL.
- [X] T029 [US7] Em `scripts/import_letterboxd_csv.py`, `run_import`: gerar
      `base_ts = datetime.now()` no início; passar um contador global incrementado a cada
      linha processada (`created_at=base_ts + timedelta(milliseconds=contador_linha)`) para
      toda chamada de `upsert_movie_from_letterboxd` em `_process_diary`/`_process_reviews`/
      `_process_ratings_fallback` (as três funções que criam `diary_entries`) — repassar o
      contador como parâmetro adicional dessas funções.
- [X] T030 [US7] Em `agents/akane/tools.py`: nova função `reorder_diary_entries(watched_date:
      date, ordered_ids: list[str]) -> dict` — valida que
      `SELECT id FROM diary_entries WHERE watched_date = %(date)s AND id = ANY(%(ids)s)`
      retorna exatamente `len(ordered_ids)` linhas (senão erro, nenhuma mudança aplicada);
      aplica `UPDATE diary_entries SET created_at = %(ts)s WHERE id = %(id)s` para cada id na
      lista, com `ts = datetime.combine(watched_date, time.min) + timedelta(seconds=i)` na
      ordem da lista (índice 0 = mais antigo do dia).
- [X] T031 [US7] Em `webapp/backend/routers/movies.py`: modelo `ReorderDiaryBody {
      watched_date: date, ordered_ids: list[str] }` + rota `PATCH /diary/reorder` chamando
      `reorder_diary_entries` — registrar antes de `/diary/{diary_id}` para não colidir com o
      path param.
- [X] T032 [US7] Em `webapp/frontend/src/pages/akane/akaneApi.ts`: novo método
      `reorderDiary(watchedDate: string, orderedIds: string[])` → `PATCH
      /api/movies/diary/reorder`.
- [X] T033 [US7] Em `webapp/frontend/src/pages/akane/screens/DiaryScreen.tsx`: dentro de cada
      grupo de mês, sub-agrupar visualmente por `watched_date` quando houver >1 entrada no
      mesmo dia; para esses grupos, adicionar setas ↑/↓ em cada `DiaryRow` que chamam
      `akaneApi.reorderDiary` com a nova ordem calculada localmente, atualizando `entries` via
      `setEntries` no sucesso (sem recarregar a tela).
- [ ] T034 [US7] Validar manualmente (quickstart.md Cenário 8): importar export com 3 sessões
      no mesmo dia, confirmar ordem = ordem do CSV; reordenar pela UI, recarregar a página,
      confirmar que a nova ordem persiste.

**Checkpoint**: histórico de maratonas no mesmo dia reflete a ordem real, com correção manual
disponível.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T035 [P] Atualizar `agents/akane/CLAUDE.md`: nova entrada na tabela de tools (Wave 1 —
      Núcleo) para `refresh_movie_metadata`, `update_movie_catalog`, `update_diary_entry`,
      `reorder_diary_entries`; nota sobre `_TMDB_LANG = "en-US"` na seção "TMDB API"; nota
      sobre `_resolve_movie_identity` na seção "Idempotência (sync Letterboxd)".
- [X] T036 [P] Atualizar `webapp/CLAUDE.md` (ou `webapp/docs/API.md`, se essa for a fonte
      viva de rotas): registrar as 4 rotas novas de `movies.py`.
- [X] T037 [P] Atualizar `ROADMAP.md`: nova linha da fase 050 (✅) com resumo do escopo
      ampliado (carga histórica + correção de dados); atualizar "Status atual".
- [X] T038 Validação estática: `tsc -b --force` no frontend; `npm run build`.
- [ ] T039 Executar os cenários completos de `quickstart.md` (1–9) contra um PostgreSQL de
      teste antes de considerar a feature pronta para a carga real em produção (T010).

## Dependencies & Execution Order

- **Setup (T001)** → checagem rápida, não bloqueia nada de fato.
- **Foundational (T002–T003)** → bloqueia US1 (T004-T006 usa `enrich_tmdb`/idioma
  indiretamente) e é pré-requisito direto de US6 (T011-T012 usam `_resolve_movie_identity`).
- **US1 (T004–T006)** e **US6 (T011–T013)** tocam as mesmas funções
  (`add_movie`/`upsert_movie_from_letterboxd`) — fazer US6 logo após o Foundational e antes de
  finalizar US1 evita dois merges concorrentes no mesmo trecho de código. Ordem sugerida:
  Foundational → US6 → US1 → US2.
- **US2 (T007–T008)** independente — só `_process_watchlist`.
- **US3 (T009–T010)** documentação + execução real; depende logicamente de US1/US6 estarem
  concluídas (senão o roteiro documentaria um comportamento incompleto).
- **US4 (T014–T019)** independente de US1/US2/US3/US6 — só usa `_tmdb_detail`/`_norm`/
  `_poster_palette` já existentes.
- **US5 (T020–T027)** independente das demais — campos e tabelas diferentes das tocadas por
  US1/US6.
- **US7 (T028–T034)** independente das demais, exceto que T028 (parâmetro `created_at` em
  `upsert_movie_from_letterboxd`) toca a mesma função que T012 (US6) — fazer T012 antes de
  T028 para não perder o merge.
- **Polish (T035–T039)** por último; T039 é o gate final antes de T010 (carga real).

## Parallel Example

Depois do Foundational: US2 (T007-T008), US4 (T014-T019) e US5 (T020-T027) podem ser feitas
em paralelo entre si (arquivos/funções não sobrepostos). US6 (T011-T012) e US1 (T004) tocam o
mesmo arquivo na mesma função — sequenciar, não paralelizar. Dentro do Polish, T035/T036/T037
são arquivos diferentes — paralelos entre si.

## Implementation Strategy

**MVP scope**: US1 (watched.csv) + US6 (dedup) resolvem as duas lacunas mais graves da carga
histórica — sem elas, a carga real (US3) não é confiável. US2 é P3, conveniência de teste, não
bloqueia produção. US4/US5 (correção pós-importação) são o valor agregado desta ampliação de
escopo — entregar depois do MVP de carga, mas antes de rodar a carga real, já que servem
como rede de segurança para qualquer erro de match. US7 (ordem no mesmo dia) é P2 — cosmético
para maratonas, não bloqueia o uso normal do diário.
