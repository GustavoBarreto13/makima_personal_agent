# Phase 0 — Research: Filmes (015-akane-filmes)

Decisões técnicas que destravam o `plan.md`. Cada item: **decisão · alternativas · porquê**. A maioria
foi fechada no brainstorm (ver `spec.md`); aqui registramos o "como" verificado contra o código real do
repo e o projeto-referência `n8n-python-scripts/gustavoboxd`.

---

## R1 — Fonte de metadados/pôsteres: TMDB (única)

**Decisão**: usar **TMDB** (The Movie Database) como fonte única — busca por título(+ano), detalhe por
`tmdb_id` (gêneros, runtime, diretor via `/movie/{id}/credits`), e imagens (`poster_path`/`backdrop_path`
→ `https://image.tmdb.org/t/p/w500{poster_path}` e `w1280{backdrop_path}`). Auth: **Bearer token v4**
em `TMDB_TOKEN` (header `Authorization: Bearer ...`), como o `gustavoboxd` já faz para o backdrop.

**Alternativas consideradas**:
- *OMDB* (usado no gustavoboxd para metadados): dá diretor/elenco/plot/poster, mas **não tem backdrop**
  horizontal e a chave é limitada por requisição. Pior para um grid/hero visual estilo Letterboxd.
- *TMDB + OMDB* (TMDB principal, OMDB fallback p/ ratings IMDb): mais robusto, porém duas chaves e mais
  código — descartado nesta fatia por excesso de footprint (Princípio V).

**Porquê TMDB vence**: é a **mesma base** que o Letterboxd usa; entrega pôster + backdrop + gêneros +
runtime + diretor numa só API, sem limite por título, ideal para o grid de pôsteres e o hero da página.
Nenhuma dependência nova (`requests` já está no projeto).

## R2 — Reuso do parsing do RSS do Letterboxd (gustavoboxd)

**Decisão**: portar a lógica de `n8n-python-scripts/gustavoboxd/main.py:349-412` para
`scripts/sync_letterboxd.py`, trocando o **destino** (Notion → PostgreSQL via `agents/akane/tools.py`)
e a fonte de metadados (OMDB → TMDB). Mantém-se:
- URL `https://letterboxd.com/{username}/rss/` com `User-Agent: Mozilla/5.0` (Letterboxd bloqueia bots);
- namespaces `{"letterboxd": "https://letterboxd.com", "dc": "http://purl.org/dc/elements/1.1/"}`;
- campos: `letterboxd:filmTitle`, `letterboxd:filmYear`, `letterboxd:memberRating` (0.5–5.0, nullable),
  `letterboxd:watchedDate`, `<link>` (dedup), `<description>` → review via `_strip_html`;
- itens sem `filmTitle` (listas/watchlist/atividade) são **ignorados**;
- retry/backoff (`MAX_RETRIES=3`, backoff exponencial) em torno do `requests.get`.

**Porquê**: lógica já testada em produção; só muda o sink. Evita reinventar o parser de XML namespaced.

## R3 — Importador do CSV de exportação oficial do Letterboxd

**Decisão**: `scripts/import_letterboxd_csv.py` recebe o caminho da **pasta descompactada** da exportação
e processa, nesta ordem:
- **`diary.csv`** (fonte primária de sessões): colunas `Date, Name, Year, Letterboxd URI, Rating,
  Rewatch, Tags, Watched Date` → uma `diary_entries` por linha (`watched_date` = `Watched Date`,
  `rewatch` = coluna `Rewatch == 'Yes'`, `rating` da coluna `Rating`, `tags` split).
- **`reviews.csv`** (quando presente): mesmas chaves + `Review` → enriquece a sessão correspondente.
- **`watchlist.csv`**: cria `movies` com `status='watchlist'` (sem sessão).
- **`ratings.csv` / `watched.csv`**: fallback para filmes sem entrada de diário (nota/visto sem data
  detalhada) → cria `movies` `status='watched'` e, quando houver data, uma sessão.

Dedup idêntico ao RSS (`letterboxd_uri` em `movies`; `letterboxd_uri + watched_date` em `diary_entries`),
`source='letterboxd_csv'`, **idempotente** (rerun não duplica). Enriquecimento TMDB opcional (igual RSS).

**Nota**: o `gustavoboxd` **nunca implementou** o importador de CSV (só RSS) — então este é construído do
zero, mas reaproveita as tools de upsert e o dedup. O usuário sobe os dados depois.

**Porquê processar `diary.csv` primeiro**: é o arquivo mais rico (data + nota + rewatch + tags), espelha
1:1 o modelo `diary_entries`; os demais CSVs preenchem lacunas sem sobrescrever sessões já criadas.

## R4 — Padrão Shell do webapp + camada de lógica única

**Decisão**: seguir o padrão já consolidado (verificado em `pages/frieren`, `pages/kaguya`,
`webapp/backend/routers/books.py`, `webapp/frontend/src/App.tsx`):
- **Backend**: `agents/akane/tools.py` é a única dona da lógica/SQL; `webapp/backend/routers/movies.py`
  importa as tools e envelopa (`_check_result` para mutações; retorno direto para listagens);
  `Depends(require_user)` em todas as rotas; registrado em `main.py` com `prefix="/api/movies"`.
- **Frontend**: `pages/akane/` (Shell) com `AkaneShell.tsx`, `akaneApi.ts`, `types.ts`, `akane.css`
  (tokens OKLCH escopados em `.akane-shell`), `screens/`, `modals/`, `components/`, `ui/`. Rota
  `/movies/*` adicionada em `App.tsx` **antes** do catch-all `/*`. Componentes nunca chamam `fetch`
  cru — sempre `akaneApi.*`. Estado só com hooks (sem Redux/Zustand).

**Porquê**: paridade arquitetural com Frieren/Nami garante manutenção previsível e que o agente Telegram
e o webapp compartilhem exatamente a mesma lógica (FR-016).

## R5 — Modelagem catálogo + log e dedup/idempotência

**Decisão**: par `movies` (catálogo) + `diary_entries` (log por sessão), espelhando `books`/`reading_logs`
da Frieren — um filme tem N sessões (rewatch). Dedup/idempotência:
- `movies`: índice **único parcial** em `letterboxd_uri WHERE letterboxd_uri IS NOT NULL` (filmes manuais
  não têm URI); dedup secundária por `tmdb_id`; fallback fuzzy por título+ano (padrão `_find_book_by_query`).
- `diary_entries`: índice **único parcial** em `(letterboxd_uri, watched_date)` → o RSS/CSV é idempotente
  (SC-003), mas dois logs **manuais** do mesmo filme no mesmo dia (URI NULL) continuam permitidos.

**Porquê parcial**: filmes/sessões criados manualmente (webapp/Akane) não têm `letterboxd_uri`; um índice
único total impediria isso. O parcial dá idempotência ao Letterboxd sem amarrar a entrada manual.

## R6 — Sync: agendado + manual, executado no container

**Decisão**: o mesmo código de sync é chamado por dois gatilhos:
- **Agendado**: cron diário no container `makima-web` (molde de `scripts/backup_postgres.py`), rodando
  `python -m scripts.sync_letterboxd --yesterday`.
- **Manual**: `POST /api/movies/sync-letterboxd` (botão "Sincronizar agora" no Shell) e comando à Akane,
  ambos chamando a mesma função (`run_sync(...)`) — retornam o resumo `created/updated/skipped/errors`.

**Porquê dentro do container**: o hostname do Postgres é serviço Docker Swarm e **não resolve no host**
(ver CLAUDE.md raiz) — qualquer execução de schema/sync no VPS é via `docker exec makima-web`.

## R7 — Agente Akane: singleton sem MCP

**Decisão**: `akane_agent` instanciado direto no módulo (singleton), igual Nami/Frieren/Kurisu — **não**
factory. Personalidade: Akane Kurokawa (*Oshi no Ko*) — atriz metódica e perceptiva, analítica sobre
direção/atuação/porquê o filme funciona; sempre começa com "Akane:"; formata em HTML, nunca markdown.

**Porquê**: a factory (`create_kaguya_agent`) só existe por causa do `McpToolset` do Calendar (subprocesso
stdio por sessão). A Akane não tem MCP — todas as tools são funções Python locais → singleton é suficiente.

## R8 — Cross-agent Kaguya (lembrete/sessão de filme)

**Decisão**: tool da Akane que chama a lógica da Kaguya para criar uma tarefa/lembrete (e/ou evento de
Calendar) "assistir X em <data>", no padrão das tools cross-domínio da Kaguya
(`agents/kaguya/tools.py`). Não duplica a watchlist (a tarefa é o lembrete; a watchlist é o catálogo).

**Porquê só Kaguya nesta fatia**: decisão do usuário. Nami (gasto de cinema atômico), Kurisu (notas) e
Frieren (adaptações livro↔filme) ficam **sugeridas** para fatias futuras (ver `spec.md` › Fica para depois).

---

## Resumo das decisões

| # | Tema | Decisão |
|---|---|---|
| R1 | Metadados | TMDB único (Bearer v4 `TMDB_TOKEN`); poster+backdrop+gênero+runtime+diretor |
| R2 | RSS | Portar parser do `gustavoboxd` (namespaces `letterboxd:`), sink → PostgreSQL |
| R3 | CSV | Importador novo: `diary.csv` primário + watchlist/ratings/watched; idempotente |
| R4 | Webapp | Padrão Shell + router fino sobre `agents/akane/tools.py` (camada única) |
| R5 | Modelo | `movies` + `diary_entries` (catálogo+log); índices únicos parciais p/ dedup |
| R6 | Sync | Agendado (cron no container) + manual (endpoint/botão + Akane) |
| R7 | Agente | `akane_agent` singleton sem MCP (padrão Nami/Frieren) |
| R8 | Cross-agent | Só Kaguya (lembrete/sessão) nesta fatia; demais adiados |

Nenhuma decisão exige dependência nova de runtime nem amendment de constitution.
