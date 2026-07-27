# Research: Correções de bugs da Akane

Auditoria de código já feita (agente Explore). Cada decisão abaixo aponta a causa raiz exata
e a correção mínima — sem redesenho, sem migração de schema em nenhum item.

## R1 — `get_home`: `d.liked` inexistente (US1, FR-001)

**Decisão**: trocar `d.liked` por `m.liked` na query de `recent_activity` em
`agents/akane/tools.py` (função `get_home`, ~linha 1212). `liked` é coluna de `movies`, não
de `diary_entries` (`schema_pg.sql` linha 29). O patch pós-query (linhas 1220-1222,
`if "liked" not in entry: entry["liked"] = False`) nunca executa porque a query já falha
antes — remover esse código morto junto com a correção.

**Alternativas consideradas**: manter o patch e deixar a query falhar silenciosamente —
rejeitado, a query precisa retornar o valor real de `liked`, não `False` fixo.

## R2 — Sparkline de 7 dias conta soft-deletados (US1, FR-002)

**Decisão**: em `get_home` (~linhas 1259-1269), adicionar `JOIN movies m ON m.id =
d.movie_id` e `AND m.deleted = FALSE` às duas queries (`s7_rows` e `s7p_rows`), no mesmo
padrão já usado por `recent_activity`/`favorites`/`hist_rows` na mesma função.

## R3 — Rewind usa nome normalizado em vez do nome de exibição (US2, FR-004)

**Decisão**: em `get_rewind` → `top_people` (~linha 1370), trocar `SELECT p.normalizado AS
name` por `SELECT p.name AS name` e `GROUP BY p.normalizado` por `GROUP BY p.name`.
Trocar só o `SELECT` e manter o `GROUP BY` em `normalizado` juntaria pessoas cujo nome
de exibição difere apenas por acentuação sob uma linha só com nome errado — por isso os
dois lados da troca são necessários.

## R4 — Paleta de pôster não determinística (Edge Case, FR-005)

**Decisão**: em `_poster_palette` (`agents/akane/tools.py` linha ~133), trocar
`hash(_norm(title))` (hash nativo do Python, salgado por processo via `PYTHONHASHSEED`) por
`int(hashlib.md5(_norm(title).encode()).hexdigest(), 16)`. `hashlib.md5` é estável entre
processos e reinícios — é a única mudança necessária na função.

## R5 — Rating do RSS do Letterboxd sem validação (US4, FR-009)

**Decisão**: extrair a lógica de validação já existente em
`scripts/import_letterboxd_csv.py::_parse_rating` (clamp para `None` fora de
`0.5 <= val <= 5.0`) e aplicá-la também ao valor lido em
`scripts/sync_letterboxd.py::_fetch_rss` (linha ~161, `rating_text`/`float(rating_text)`).
Decisão de reuso: extrair `_parse_rating` (ou a validação equivalente) para um lugar comum
importável pelos dois scripts, evitando duplicar a regra — mas sem introduzir módulo novo
se um import direto entre scripts resolver sem ciclo.

## R6 — Fallback de data ausente quebra (US4, FR-008)

**Decisão**: em `_fetch_rss` (linhas ~163-174), quando `watchedDate` estiver ausente, parsear
`pubDate` (formato RFC-822, ex. `"Wed, 02 Oct 2024 08:00:00 GMT"`) com
`email.utils.parsedate_to_datetime()` em vez de `pub_date_text[:10]` (que corta a string
errada e nunca produz um ISO-8601 válido, sempre caindo no `except ValueError` e descartando
a entrada). Converter o `datetime` resultante para `.date()` antes de seguir o fluxo normal.

## R7 — Falha total do RSS não alerta (US4, FR-010)

**Decisão**: `_fetch_rss` precisa **distinguir** "todas as tentativas falharam" (exceção real
de rede/parse) de "feed OK, zero itens novos" (lista vazia legítima). Menor mudança: fazer
`_fetch_rss` **levantar uma exceção** (em vez de retornar `[]`) quando todas as tentativas de
retry falharem ou o XML for malformado; `run_sync()` captura essa exceção, dispara o alerta
(reusar o mecanismo já usado por outros jobs do scheduler — `scheduler/notify.py::
send_telegram_alert`) e re-levanta para que o `runner.py` do scheduler já registre a falha em
`scheduler_runs` (nenhuma mudança adicional necessária ali — o scheduler já trata exceção de
job como falha). Zero itens novos genuínos continua retornando `[]` normalmente (sem exceção),
preservando o Edge Case do spec.md.

## R8 — Histograma de notas nunca mostra notas inteiras (US2, FR-003)

**Decisão**: o backend (`get_stats`/`get_home`, ambos com `hist: dict = {str(r / 2): 0 for r
in range(1, 11)}`) gera chaves `"1.0"`, `"2.0"`... para notas inteiras (divisão real gera
`.0`), mas `HomeScreen.tsx`/`RewindScreen.tsx` procuram as chaves `'1'`, `'2'`... (sem `.0`).
Corrigir no frontend (menor blast radius — 1 array literal em cada tela) trocando
`['0.5','1','1.5','2','2.5','3','3.5','4','4.5','5']` por
`['0.5','1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0']` nos dois arquivos, casando
exatamente com o formato que o backend já produz — sem tocar em `tools.py` (duas funções,
mais risco de regressão em outros consumidores do dict).

## R9 — Rewatch de filme já catalogado falha (US3, FR-006)

**Decisão**: three-layer fix, seguindo o fluxo já mapeado:
1. `search_movie()` (`agents/akane/tools.py` ~linha 398) passa a consultar `movies` por
   `tmdb_id` para cada resultado do TMDB e incluir `local_id`/`in_catalog` no dict retornado
   (uma query `SELECT id FROM movies WHERE tmdb_id = ANY(%(ids)s) AND deleted = FALSE` batched,
   não N+1).
2. Router (`webapp/backend/routers/movies.py`) não precisa de mudança — já repassa o dict.
3. `LogModal.tsx` (linha ~76): usar o `in_catalog`/`local_id` real em vez do hardcode
   `inCatalog: false`; `selectResult()` já tem a branch correta para `result.localId` — só
   precisa receber o dado real para entrar nela em vez de sempre cair no branch de criação.

**Alternativas consideradas**: fazer `add_movie` retornar o id existente em vez de erro
(mudaria a semântica de uma função também chamada por outros fluxos que dependem do erro
para bloquear duplicata explícita) — rejeitado; melhor sinalizar duplicata **antes** da
tentativa de criação, na busca.

## R10 — Data padrão "assistido hoje" em UTC (US3, FR-007)

**Decisão**: `LogModal.tsx` (linha ~50) usa `new Date().toISOString().slice(0,10)` — bug de
timezone já documentado no `CLAUDE.md` raiz (mesma classe do bug corrigido na Violet).
`webapp/frontend/src/pages/akane/` não tem `dateUtils.ts` próprio. Criar
`webapp/frontend/src/pages/akane/dateUtils.ts` com `todayLocalISO()` (mesma implementação de
`violet/dateUtils.ts`, usando `getFullYear()/getMonth()/getDate()` locais) e importar em
`LogModal.tsx` — consistente com o padrão de cada shell ter seu próprio helper local (Nami,
Kaguya já têm o seu; nenhum shell importa cross-shell).

## Resumo de impacto

- **Nenhuma migração de schema** em nenhum dos 10 bugs.
- **Nenhuma dependência nova**.
- Mudanças concentradas em: `agents/akane/tools.py` (R1, R2, R3, R4, R9),
  `scripts/sync_letterboxd.py` (R5, R6, R7), `scripts/import_letterboxd_csv.py` (extração de
  `_parse_rating`, R5), `webapp/backend/routers/movies.py` (nenhuma mudança — R9),
  `webapp/frontend/src/pages/akane/screens/HomeScreen.tsx` +
  `RewindScreen.tsx` (R8), `webapp/frontend/src/pages/akane/modals/LogModal.tsx` (R9, R10),
  novo `webapp/frontend/src/pages/akane/dateUtils.ts` (R10).
