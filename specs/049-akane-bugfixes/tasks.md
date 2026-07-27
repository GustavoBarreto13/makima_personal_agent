# Tasks: Correções de bugs da Akane (backend, sync Letterboxd, webapp)

**Input**: Design documents from `specs/049-akane-bugfixes/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

Sem testes automatizados (nenhuma suíte no repo — padrão das specs 024–039); validação via
`quickstart.md` + `tsc -b --force` + `py_compile`.

## Phase 1: Setup

- [X] T001 Nenhuma migração de schema necessária (research.md) — confirmar que
      `movies.liked`, `movies.deleted` e `movie_people.name`/`normalizado` já existem em
      `agents/akane/schema_pg.sql` antes de prosseguir (checagem, sem edição).

## Phase 2: User Story 1 - Tela Início carrega sem erro (Priority: P1) 🎯 MVP

**Goal**: `get_home` nunca quebra por coluna inexistente; sparkline de 7 dias exclui
soft-deletados.

**Independent Test**: abrir Início com dados reais — sem erro 500; pedir resumo pelo
Telegram — sem falha; soft-deletar filme com sessão recente — não conta no sparkline.

- [X] T002 [US1] Em `agents/akane/tools.py::get_home`: corrigir a query de
      `recent_activity` trocando `d.liked` por `m.liked` (~linha 1212); remover o patch morto
      pós-query (`if "liked" not in entry: entry["liked"] = False`) já que a coluna certa
      vem direto da query.
- [X] T003 [US1] Em `agents/akane/tools.py::get_home`: nas queries `s7_rows`/`s7p_rows`
      (~linhas 1259-1269), adicionar `JOIN movies m ON m.id = diary_entries.movie_id` e
      `AND m.deleted = FALSE`, no mesmo padrão de `recent_activity`/`favorites`.

**Checkpoint**: Início e resumo do Telegram funcionam sem erro; sparkline correto.

---

## Phase 3: User Story 2 - Notas exibidas corretamente nos gráficos (Priority: P1)

**Goal**: histograma de notas mostra inteiras e meias; Rewind mostra nome de exibição de
pessoas.

**Independent Test**: avaliar filmes com notas 1-5 inteiras e meias; conferir histogramas
na Início e no Rewind; conferir nome de pessoa com acentuação correta no Rewind.

- [X] T004 [US2] [P] Em `webapp/frontend/src/pages/akane/screens/HomeScreen.tsx` (~linha
      424): trocar o array `keys` de `['0.5','1','1.5','2','2.5','3','3.5','4','4.5','5']`
      para `['0.5','1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0']`, casando com o
      formato `"N.0"` que o backend já produz para notas inteiras.
- [X] T005 [US2] [P] Em `webapp/frontend/src/pages/akane/screens/RewindScreen.tsx` (~linha
      264): mesma correção do array `keys` de T004.
- [X] T006 [US2] Em `agents/akane/tools.py::get_rewind` (query `top_people`, ~linha 1370):
      trocar `SELECT p.normalizado AS name` por `SELECT p.name AS name` e
      `GROUP BY p.normalizado` por `GROUP BY p.name`.

**Checkpoint**: histogramas corretos nas duas telas; nomes de pessoas com capitalização e
acentos corretos no Rewind.

---

## Phase 4: User Story 3 - Registrar reassistida de um filme já no catálogo (Priority: P1)

**Goal**: buscar um filme já catalogado em "Logar filme" permite registrar rewatch em vez de
falhar; data padrão usa fuso local.

**Independent Test**: filme já cadastrado → buscar em "Logar filme" → selecionar → sessão de
reassistida criada sem erro; filme novo → fluxo de criação preservado; log às 22h (Brasil)
grava com a data local de hoje.

- [X] T007 [US3] Em `agents/akane/tools.py::search_movie` (~linha 398): após buscar no TMDB,
      consultar `movies` em lote por `tmdb_id` (`SELECT id, tmdb_id FROM movies WHERE
      tmdb_id = ANY(%(ids)s) AND deleted = FALSE`) e incluir `local_id`
      (id ou `None`) e `in_catalog` (bool) em cada item retornado.
- [X] T008 [US3] Em `webapp/frontend/src/pages/akane/modals/LogModal.tsx` (~linha 76): usar
      `result.local_id`/`result.in_catalog` reais (vindos da API) em vez do hardcode
      `inCatalog: false`, mapeando para o campo `localId` já consumido por `selectResult()`.
- [X] T009 [US3] [P] Novo `webapp/frontend/src/pages/akane/dateUtils.ts`: exportar
      `todayLocalISO()` (mesma implementação de `webapp/frontend/src/pages/violet/
      dateUtils.ts` — `getFullYear()/getMonth()/getDate()` locais).
- [X] T010 [US3] Em `webapp/frontend/src/pages/akane/modals/LogModal.tsx` (~linha 50):
      importar `todayLocalISO` de `../dateUtils` e usá-lo no `useState` inicial de
      `watchedDate` em vez de `new Date().toISOString().slice(0, 10)`.

**Checkpoint**: rewatch de filme já catalogado funciona ponta a ponta; data padrão correta
no fuso de Brasília.

---

## Phase 5: User Story 4 - Sincronização confiável com o Letterboxd (Priority: P2)

**Goal**: rating do RSS validado/clampado; fallback de data funciona; falha total do feed
gera alerta.

**Independent Test**: entrada RSS sem `watchedDate` → sessão criada com data de `pubDate`;
feed indisponível → alerta disparado; rating fora da escala → ajustado aos limites.

- [X] T011 [US4] [P] Em `scripts/import_letterboxd_csv.py`: garantir que `_parse_rating` é
      importável (função de módulo, já é — apenas confirmar assinatura estável) para reuso
      por `sync_letterboxd.py`.
- [X] T012 [US4] Em `scripts/sync_letterboxd.py::_fetch_rss` (~linha 161): importar
      `_parse_rating` de `scripts.import_letterboxd_csv` e usá-lo para validar/clampar o
      `rating_text` lido do feed, em vez do `float(rating_text)` direto e sem checagem.
- [X] T013 [US4] Em `scripts/sync_letterboxd.py::_fetch_rss` (~linhas 163-174): trocar o
      fallback de data (`pub_date_text[:10]`) por parse RFC-822 via
      `email.utils.parsedate_to_datetime(pub_date_text)` seguido de `.date()`, antes de cair
      no `try/except ValueError` existente.
- [X] T014 [US4] Em `scripts/sync_letterboxd.py::_fetch_rss`: quando todas as tentativas de
      retry falharem (exceção de rede) ou o XML vier malformado, levantar uma exceção em vez
      de retornar `[]` silenciosamente.
- [X] T015 [US4] Em `scripts/sync_letterboxd.py::run_sync`: capturar a exceção de T014,
      disparar alerta via `scheduler/notify.py::send_telegram_alert` (mesmo mecanismo já
      usado por outros jobs do scheduler) e re-levantar para que o `scheduler/runner.py`
      registre a falha em `scheduler_runs`. Zero itens novos genuínos (lista vazia sem
      exceção) continua sem alerta.

**Checkpoint**: as 4 user stories entregues e testáveis independentemente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T016 [P] Em `agents/akane/tools.py::_poster_palette` (~linha 133): trocar
      `hash(_norm(title))` por
      `int(hashlib.md5(_norm(title).encode()).hexdigest(), 16)` (determinístico entre
      processos); adicionar `import hashlib` no topo do arquivo se ainda não existir.
- [X] T017 [P] Atualizar `ROADMAP.md`: nova linha da fase 049 (✅) com resumo dos 10 bugs
      corrigidos; atualizar "Status atual".
- [X] T018 Validação estática: `python -m py_compile` nos módulos alterados
      (`agents/akane/tools.py`, `scripts/sync_letterboxd.py`,
      `scripts/import_letterboxd_csv.py`) + import smoke test de `agents.akane.tools` e
      `webapp.backend.main` com env vars dummy; `tsc -b --force` no frontend; `npm run
      build`.
- [ ] T019 Executar os cenários de `quickstart.md` contra um PostgreSQL real — não
      executável neste ambiente (sem `DATABASE_URL` no sandbox).

## Dependencies & Execution Order

- **Setup (T001)** → bloqueia tudo (checagem rápida).
- **US1 (T002–T003)** é o MVP — Início nunca quebra.
- **US2 (T004–T006)** independente de US1 (arquivos diferentes) — pode ser feito em paralelo.
- **US3 (T007–T010)** independente de US1/US2 — T007 bloqueia T008 (mesmo dado); T009
  bloqueia T010 (helper precisa existir antes do import).
- **US4 (T011–T015)** totalmente independente das demais (só toca `scripts/`) — T011 bloqueia
  T012; T013/T014 podem ser feitos em paralelo com T012; T015 depende de T014.
- **Polish (T016–T019)** por último — T016 é independente de todas as user stories.

## Parallel Example

T004/T005 (arquivos de tela diferentes) são paralelos entre si. T007+T009 podem começar em
paralelo (arquivos diferentes) antes de T008/T010 respectivamente. T016 pode rodar a qualquer
momento em paralelo com qualquer user story.

## Implementation Strategy

**MVP scope**: US1 (Início não quebra) é o bug mais crítico — bloqueia o uso do app inteiro.
US2/US3 (P1 também) seguem em sequência. US4 (P2, só sync em background) pode vir por
último sem bloquear o uso interativo do app.
