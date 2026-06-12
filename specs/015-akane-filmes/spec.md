# Feature Specification: Akane — agente de Filmes (experiência tipo Letterboxd)

**Feature Branch**: `015-akane-filmes`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Vamos começar a planejar outro agent. Akane Kurokawa de Oshi no Ko.
Ela vai manejar os filmes. (...) Toda integração com os outros agents que for possível, sugira.
O Webapp é o mais importante nesse agent. Pode lembrar bem o Letterboxd, mas seguindo o padrão
desse projeto. O Letterboxd ainda vai ser a fonte, deve ter um fluxo pra puxar o RSS de lá incluso,
mas aqui terão outras muitas features no futuro. Vou carregar o csv importado do Letterboxd também
depois, deixe no jeito pra isso."

**Decisões fechadas no brainstorm** (ver plano em `~/.claude/plans/vamos-come-ar-a-planejar-shimmying-walrus.md`):
fonte de metadados/pôsteres = **TMDB** (única, Bearer v4 `TMDB_TOKEN`); entrega **webapp-first**
(camada de dados + UI primeiro, depois ingestão Letterboxd, por último o agente Telegram); cross-agent
na 1ª fatia = só **Kaguya** (lembrete/sessão de filme); sync do RSS = **agendado + botão manual**;
o **CSV** de exportação do Letterboxd fica **pronto pra ser carregado depois** (importador construído,
o usuário sobe os dados na sequência).

---

## Escopo da fatia

**Entra na 015** (introduz schema novo — `agents/akane/schema_pg.sql` — e a seção webapp Filmes):

- **Catálogo de filmes** — tabela `movies` (UUID em TEXT, padrão Nami/Frieren) com metadados do TMDB
  (pôster, backdrop, gêneros, diretor, runtime, sinopse, ano), `tmdb_id`, `imdb_id`, `letterboxd_uri`
  (chave de dedup), `status` (`watchlist`|`watched`), `rating` favorita/atual (0.5–5.0), `liked`,
  `last_watched_date`, `times_watched`, soft delete.
- **Diário de sessões** — tabela `diary_entries` (1 linha por **vez** que o filme foi assistido —
  suporta rewatch; espelha `reading_logs` da Frieren): `watched_date`, `rating`, `rewatch`, `review`,
  `tags`, `source` (`manual`|`letterboxd_rss`|`letterboxd_csv`).
- **Listas** — tabelas `movie_lists` + `movie_list_items` (N:N, espelha `shelves`/`book_shelves`);
  **criadas agora** (baratas, preparam o terreno), mas **sem UI** nesta fatia.
- **Camada de lógica única** (`agents/akane/tools.py`) — CRUD do catálogo, log de sessão, watchlist,
  rating/like, busca TMDB, agregações; resolução de filme por fuzzy match (padrão `_find_book_by_query`
  da Frieren). Enriquecimento via TMDB com fallback gracioso (API fora → entrada sem metadados, sem quebrar).
- **Webapp (peça central)** — seção **Filmes** no padrão Shell (`pages/akane/`): grid de pôsteres tipo
  Letterboxd, diário cronológico, watchlist, página do filme (backdrop hero + sua nota/review + histórico
  de sessões) e estatísticas; router FastAPI `/api/movies/*` (paritário, `Depends(require_user)`).
- **Ingestão Letterboxd** — `scripts/sync_letterboxd.py` (RSS, idempotente, `--yesterday` para o cron
  diário no container `makima-web` + endpoint `POST /api/movies/sync-letterboxd` para o botão "Sincronizar
  agora") e `scripts/import_letterboxd_csv.py` (carga histórica da exportação oficial; o usuário roda depois).
- **Agente Akane (Telegram)** — novo especialista (ADK, singleton, sem MCP) roteado pela Makima:
  logar filme assistido, adicionar à watchlist, dar nota/review, consultar diário/stats.
- **Cross-agent Kaguya** — tool que cria lembrete/sessão ("quero assistir X" → tarefa na Kaguya e/ou
  evento de cinema no Calendar), no padrão das tools cross-domínio da Kaguya.

**Fica para depois** (sugestões registradas, fora desta fatia):
- **UI de listas** (criar/curar listas temáticas estilo Letterboxd) — tabelas já existem, falta a tela.
- **Cross-agent Nami** — lançar o gasto do ingresso de cinema **na mesma transação** ao logar uma sessão
  "no cinema" (espelho de `complete_payment_task`); depende de definir o fluxo de conta/categoria.
- **Cross-agent Kurisu** — análises longas viram nota no vault Obsidian.
- **Cross-agent Frieren** — marcar filme como adaptação de um livro do catálogo (link livro↔filme).
- **Estatísticas avançadas** ("year in review" rico, mapa de hábitos de cinema), recomendações,
  watch providers (onde assistir), suporte a séries/anime (domínio do futuro `agents/media/`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Webapp + camada de dados (catálogo, diário, watchlist, stats) (Priority: P1)

Abro a seção **Filmes** no webapp e tenho uma experiência tipo Letterboxd: um grid de pôsteres dos
filmes que já vi, um **diário** cronológico das sessões (com nota, data, glyph de rewatch e trecho da
review), uma **watchlist** e a **página do filme** (backdrop, metadados, minha nota/review e o histórico
de quantas vezes assisti). Busco um filme (TMDB), adiciono à watchlist, e logo uma sessão dando nota e
escrevendo uma review. Vejo minhas estatísticas do ano (quantos filmes, média de nota, top gêneros).

**Why this priority**: o webapp é a peça central pedida. Sem catálogo + diário + a UI, nada do resto
faz sentido. Entrega valor sozinha (um "Letterboxd pessoal" funcional) e destrava US2 (que só popula
estas mesmas tabelas/telas) e US3 (que expõe a mesma lógica no Telegram).

**Independent Test**: contra um banco com `agents/akane/schema_pg.sql` aplicado e `TMDB_TOKEN` setado,
buscar "Dune" (retorna pôster/ano/diretor do TMDB), adicionar à watchlist, logar uma sessão com nota
4.5 e review; abrir o grid (filme aparece como `watched`), o diário (sessão aparece), a página do filme
(backdrop + histórico com 1 sessão) e as stats (1 filme no ano, média 4.5).

**Acceptance Scenarios**:

1. **Given** a seção Filmes vazia, **When** busco "Dune" e adiciono à watchlist, **Then** nasce 1 linha
   em `movies` (`status='watchlist'`) com pôster, ano, diretor e gêneros do TMDB.
2. **Given** um filme na watchlist, **When** logo uma sessão com nota e review, **Then** nasce 1 linha em
   `diary_entries`, o `movies.status` vira `watched`, `last_watched_date` e `times_watched` (=1) atualizam,
   e a nota aparece no card.
3. **Given** um filme já assistido, **When** logo **outra** sessão (rewatch), **Then** nasce uma 2ª linha
   em `diary_entries` (`rewatch=TRUE`), `times_watched` vira 2, e o histórico na página mostra 2 sessões.
4. **Given** filmes com sessões, **When** abro o diário, **Then** vejo as sessões em ordem cronológica
   decrescente (mais recente no topo) com pôster, data, nota e glyph de rewatch quando aplicável.
5. **Given** filmes assistidos no ano, **When** abro as estatísticas, **Then** vejo contagem, média de
   nota e top gêneros/diretores — e a tela resolve **sem erro** quando não há nenhum filme no ano.
6. **Given** o webapp, **When** acesso `/api/movies/*` sem sessão válida, **Then** recebo **401**
   (toda rota protegida por `require_user`, como os demais domínios).

---

### User Story 2 - Ingestão Letterboxd (RSS + CSV) (Priority: P2)

O Letterboxd continua sendo a fonte do meu histórico. Uma sincronização **automática diária** puxa o
RSS do meu perfil e cria/atualiza filmes e sessões; um botão **"Sincronizar agora"** no webapp (e um
comando à Akane) dispara o mesmo fluxo sob demanda. Quando eu quiser carregar todo o histórico antigo,
rodo o **importador do CSV** da exportação oficial do Letterboxd — sem duplicar o que o RSS já trouxe.

**Why this priority**: é o que mantém o catálogo vivo com dados reais. Depende da US1 (schema + tools de
upsert). O RSS cobre o recente; o CSV cobre o histórico completo (o usuário carrega depois).

**Independent Test**: com `LETTERBOXD_USERNAME` setado, rodar `python -m scripts.sync_letterboxd
--yesterday` popular `movies`/`diary_entries` a partir do RSS; rodar **2×** e confirmar que a 2ª execução
não cria duplicatas (mesmo `letterboxd_uri` + `watched_date`). Rodar `import_letterboxd_csv.py` apontando
para uma pasta de exportação de teste e conferir que as contagens batem com `diary.csv`/`watchlist.csv`
e que reexecutar é idempotente.

**Acceptance Scenarios**:

1. **Given** um perfil Letterboxd com filmes assistidos, **When** rodo o sync do RSS, **Then** cada item
   de filme do feed vira/atualiza uma linha em `movies` (dedup por `letterboxd_uri`) e uma `diary_entries`
   (dedup por `letterboxd_uri` + `watched_date`), com `source='letterboxd_rss'`.
2. **Given** o sync já rodou, **When** rodo de novo sem novos filmes, **Then** **0** linhas novas são
   criadas (idempotência), e filmes com rating/review alterados no Letterboxd são **atualizados**.
3. **Given** um item do RSS sem nota (assistido sem avaliar), **When** processo, **Then** a sessão é
   criada com `rating` nulo, sem erro.
4. **Given** o webapp autenticado, **When** clico em "Sincronizar agora", **Then** o endpoint
   `POST /api/movies/sync-letterboxd` dispara o mesmo fluxo e retorna um resumo (`created`/`updated`).
5. **Given** uma exportação oficial do Letterboxd, **When** rodo o importador do CSV, **Then** `diary.csv`
   vira sessões, `watchlist.csv` vira filmes `status='watchlist'`, com `source='letterboxd_csv'`, e
   reexecutar **não** duplica.
6. **Given** o TMDB indisponível durante o sync, **When** um filme novo chega, **Then** ele é criado com
   os dados do Letterboxd (título/ano/nota/review) **sem** os metadados do TMDB, sem quebrar o lote.

---

### User Story 3 - Agente Akane (Telegram) + cross-agent Kaguya (Priority: P3)

Falo com a Akane pelo Telegram: "assisti Oppenheimer ontem, nota 4.5" e ela loga a sessão; "quero
assistir Interstellar" e ela adiciona à watchlist; "quais filmes vi esse mês?" e ela responde. Quando
digo "me lembra de assistir Interstellar sábado", ela cria um lembrete/sessão pela Kaguya.

**Why this priority**: dá o canal conversacional (paridade com o webapp) e a primeira integração
cross-agent. Depende da US1 (a lógica que a Akane expõe) e reusa a mesma camada de tools.

**Independent Test**: pelo Telegram, "assisti Dune ontem nota 4" cria a sessão (mesma tool da US1);
"me lembra de ver Interstellar sábado" cria a tarefa/lembrete via Kaguya; confirmar que a Akane é
roteada pela Makima (domínio "filmes" reconhecido no coordinator).

**Acceptance Scenarios**:

1. **Given** a Makima, **When** mando algo sobre filme/cinema/assistir, **Then** o pedido é roteado para
   a `akane_agent` (registrada em `sub_agents` e descrita no `_MAKIMA_INSTRUCTION`).
2. **Given** a Akane, **When** digo "assisti X ontem, nota 4.5", **Then** ela cria a sessão (nota, data
   resolvida para ontem) e confirma com os dados salvos — chamando a tool **antes** de responder.
3. **Given** a Akane, **When** digo "quero assistir Y", **Then** Y é adicionado à watchlist (enriquecido
   via TMDB) e ela confirma.
4. **Given** a Akane, **When** peço "me lembra de assistir Y no sábado", **Then** nasce uma tarefa/lembrete
   na Kaguya (e/ou evento no Calendar) vinculado ao filme, sem duplicar a watchlist.
5. **Given** a Akane, **When** peço "meu diário" ou "stats do ano", **Then** ela responde a partir das
   mesmas tools que o webapp usa (paridade de canais), formatando em HTML (nunca markdown).

---

### Edge Cases

- **Filme sem `letterboxd_uri`** (adicionado manualmente pelo webapp/Akane, não veio do Letterboxd):
  dedup cai para `tmdb_id` (quando houver) e, na ausência, para match fuzzy de título+ano; nunca trava.
- **Rewatch no mesmo dia**: duas sessões com o mesmo `watched_date` são permitidas pela aplicação;
  o dedup do RSS usa `letterboxd_uri + watched_date`, então um único item de RSS não cria duplicata,
  mas dois logs manuais no mesmo dia são intencionalmente 2 linhas em `diary_entries`.
- **Item de RSS que não é filme** (lista, watchlist, atividade): ignorado (sem `letterboxd:filmTitle`),
  como no `gustavoboxd`.
- **Filme não encontrado no TMDB**: criado com os dados disponíveis (título/ano) e `poster_url` nulo;
  a UI cai para um placeholder de pôster (sem quebrar o grid).
- **Nota fora de 0.5–5.0** (entrada manual inválida): rejeitada com mensagem clara (validação na tool).
- **TMDB/RSS indisponível** (rede/timeout): retorno gracioso — sync reporta erro no resumo e segue;
  busca no webapp mostra estado de erro, sem 500.
- **Excluir um filme com sessões**: soft delete em `movies` (`deleted=TRUE`); as `diary_entries`
  permanecem (histórico) mas o filme some do grid/buscas.
- **CSV e RSS cobrindo a mesma sessão**: idempotência por `letterboxd_uri + watched_date` evita
  duplicar; `source` registra a origem da primeira inserção.
- **`watched_date` ausente no RSS** (raro): a sessão usa a data de publicação do item como fallback.
- **Ano/stats sem dados**: cada bloco de `get_stats` retorna lista vazia / zero, nunca erro.

## Requirements *(mandatory)*

### Functional Requirements

**Catálogo, diário e metadados (US1)**

- **FR-001**: O sistema MUST persistir filmes em `movies` com `id` (UUID em TEXT), `title`, `year`,
  `tmdb_id`, `imdb_id`, `letterboxd_uri`, `director` (TEXT[]), `genres` (TEXT[]), `runtime`,
  `poster_url`, `backdrop_url`, `overview`, `status` (`watchlist`|`watched`), `rating` (NUMERIC(2,1)
  0.5–5.0), `liked` (BOOLEAN), `last_watched_date`, `times_watched`, `source`,
  `created_at`/`updated_at` (`TIMESTAMPTZ DEFAULT NOW()`) e `deleted` (soft delete).
- **FR-002**: O sistema MUST registrar cada visualização em `diary_entries` (1 linha por sessão,
  suportando rewatch): `id`, `movie_id` (FK), `movie_title` (denormalizado), `watched_date`, `rating`,
  `rewatch`, `review`, `tags` (TEXT[]), `source`, `created_at` — espelhando `reading_logs` da Frieren.
- **FR-003**: O sistema MUST oferecer, na camada de lógica (`agents/akane/tools.py`), as operações:
  `search_movie`, `add_movie`, `log_watch`, `rate_movie`, `set_like`, `add_to_watchlist`,
  `update_movie_status`, `list_movies` (com filtro/ordenação), `get_diary`, `get_watchlist`,
  `get_movie_detail`, `get_stats`, `delete_movie`, `delete_diary_entry` — usando `agents/db.py`,
  seguindo `{"status": "ok"|"error", "message": ...}` nas mutações e retorno direto nas listagens.
- **FR-004**: As tools MUST enriquecer metadados via **TMDB** (Bearer v4 `TMDB_TOKEN`): busca por
  título(+ano), detalhe por `tmdb_id` (gêneros, runtime, diretor via credits) e URLs de pôster/backdrop
  (`image.tmdb.org`), com **fallback gracioso** (API fora → entrada criada sem metadados, sem quebrar).
- **FR-005**: O sistema MUST resolver um filme por **fuzzy match** (título normalizado sem acento) e por
  `tmdb_id`/`letterboxd_uri`, no padrão `_find_book_by_query` da Frieren; e validar `rating` ∈ [0.5, 5.0].
- **FR-006**: `log_watch` MUST atualizar `movies.status='watched'`, `last_watched_date` e incrementar
  `times_watched`, marcando `rewatch=TRUE` quando já houver sessão anterior do mesmo filme.

**Webapp (US1)**

- **FR-007**: O backend MUST expor `/api/movies/*` (FastAPI, bodies Pydantic, `Depends(require_user)`,
  erros via `_check_result`): listar (grid, com filtro), watchlist, diário, detalhe, criar, logar sessão,
  nota, like, status, stats, excluir filme/sessão e busca TMDB — registrado em `webapp/backend/main.py`
  com prefixo `/api/movies` (ver `contracts/movies-api.md`).
- **FR-008**: O frontend MUST adicionar a seção **Filmes** no padrão Shell (`pages/akane/`): grid de
  pôsteres, diário cronológico, watchlist, página do filme (backdrop hero + nota/review + histórico de
  sessões) e estatísticas — CSS isolado com tokens OKLCH escopados em `.akane-shell`, navegação por
  estado, chamadas sempre via `akaneApi` (nunca `fetch` cru), rota `/movies/*` **antes** do catch-all.

**Ingestão Letterboxd (US2)**

- **FR-009**: `scripts/sync_letterboxd.py` MUST puxar o RSS de `https://letterboxd.com/{LETTERBOXD_USERNAME}/rss/`,
  parsear os campos `letterboxd:` (reuso do `gustavoboxd/main.py:349-412`), e fazer **upsert** em `movies`
  (dedup por `letterboxd_uri`) + `diary_entries` (dedup por `letterboxd_uri` + `watched_date`), com
  `source='letterboxd_rss'`. Flag `--yesterday` para o cron diário.
- **FR-010**: O sistema MUST permitir disparo **manual** do mesmo sync via `POST /api/movies/sync-letterboxd`
  (botão "Sincronizar agora" no webapp) **e** via comando à Akane, retornando um resumo (`created`/`updated`/`skipped`).
- **FR-011**: `scripts/import_letterboxd_csv.py` MUST importar a exportação oficial (pasta descompactada):
  `diary.csv` (sessões), `watchlist.csv` (filmes `status='watchlist'`), com fallback a `ratings.csv`/`watched.csv`,
  marcando `source='letterboxd_csv'`, **idempotente** (mesmo dedup do RSS), recebendo o caminho por argumento.
- **FR-012**: A sincronização MUST ser executável **de dentro do container `makima-web`** no VPS (o hostname
  do Postgres é serviço Docker Swarm, não resolve no host) e agendada diariamente (cron, no molde do
  `scripts/backup_postgres.py`).

**Agente Akane + cross-agent (US3)**

- **FR-013**: O coordinator (Makima) MUST rotear pedidos sobre filmes/cinema/assistir para uma nova
  `akane_agent` (ADK, `gemini-2.5-flash`, **singleton sem MCP**), registrada em `sub_agents` e descrita
  em `_MAKIMA_INSTRUCTION`; `coordinator/main.py` MUST reconhecer o domínio "filmes".
- **FR-014**: A `akane_agent` MUST expor a mesma camada de lógica (logar sessão, watchlist, nota/review,
  diário, stats), chamando a tool **antes** de responder e formatando em **HTML** (nunca markdown),
  com a personalidade da Akane Kurokawa (atriz analítica/perceptiva; sempre começa com "Akane:").
- **FR-015**: A Akane MUST oferecer uma tool cross-agent que cria **lembrete/sessão** via Kaguya
  ("quero assistir X no sábado" → tarefa/lembrete e/ou evento de Calendar), no padrão das tools
  cross-domínio da Kaguya — sem duplicar a entrada na watchlist.

**Paridade e convenções**

- **FR-016**: A lógica MUST viver na camada única (`agents/akane/tools.py`); Telegram e router
  `/api/movies/*` são fachadas finas. Buscar/adicionar/logar/avaliar/consultar MUST estar disponíveis
  pelos dois canais (a *página visual* é webapp-only; o equivalente Telegram é a resposta conversacional).
- **FR-017**: `agents/akane/schema_pg.sql` MUST ser registrado em `scripts/setup_schemas.py`; e o
  `CLAUDE.md` raiz MUST passar a listar a Akane (domínio **filmes**), restringindo o futuro `agents/media/`
  a séries + anime.

### Key Entities

- **Filme** (`movies`): identidade canônica do filme no catálogo; `id` UUID/TEXT, dedup por
  `letterboxd_uri`/`tmdb_id`, soft delete, metadados do TMDB.
- **Sessão de diário** (`diary_entries`): cada vez que um filme foi assistido (suporta rewatch); FK para
  `movies`; carrega nota/review/tags/rewatch/data daquela visualização.
- **Lista** (`movie_lists` + `movie_list_items`): coleções temáticas N:N (tabelas criadas; UI futura).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Buscar "Dune", adicionar à watchlist e logar uma sessão funciona ponta-a-ponta no webapp:
  o filme aparece no grid como `watched` com pôster do TMDB e a sessão no diário — coberto por teste.
- **SC-002**: Rewatch cria sessão adicional **sem** duplicar o filme: logar a mesma obra 2× resulta em
  **1** linha em `movies` (`times_watched=2`) e **2** em `diary_entries` — coberto por teste.
- **SC-003**: O sync do RSS é **idempotente**: rodar 2× sem novos filmes cria **0** linhas novas (dedup
  por `letterboxd_uri` + `watched_date`) — verificável por teste.
- **SC-004**: O importador do CSV carrega `diary.csv`/`watchlist.csv` e reexecutar **não** duplica;
  contagens batem com os arquivos — coberto por teste com uma exportação de amostra.
- **SC-005**: TMDB indisponível **não quebra** o fluxo: criar um filme com a API fora resulta em linha
  válida (sem `poster_url`), e o grid renderiza com placeholder — verificável por teste/inspeção.
- **SC-006**: `get_stats` de um ano com filmes retorna contagem/média/top gêneros; de um ano vazio
  retorna zeros/listas vazias **sem erro** — coberto por teste.
- **SC-007**: 100% das capacidades de filmes (buscar/adicionar/logar/avaliar/consultar) executáveis pelos
  **dois canais** (Telegram e webapp), com a lógica numa camada única — auditável por checklist de paridade.
- **SC-008**: Toda rota `/api/movies/*` exige sessão: chamada sem cookie válido retorna **401** — coberto por teste.

## Assumptions

- **Single-user** e fuso `America/Sao_Paulo`, como o restante do projeto; sem multiusuário/ACL além do
  `require_user` já existente no webapp.
- **Schema novo**: esta fatia **introduz** `agents/akane/schema_pg.sql` e o registra em
  `scripts/setup_schemas.py`; aplicado via container `makima-web`.
- **TMDB** é a fonte única de metadados (Bearer v4 `TMDB_TOKEN`); **nenhuma** dependência nova de runtime
  além de `requests` (já no projeto). OMDB **não** é usado nesta fatia.
- **Letterboxd RSS** é público (sem auth, User-Agent obrigatório); `LETTERBOXD_USERNAME` em env. O **CSV**
  é a exportação oficial do usuário, carregada manualmente depois (importador pronto desde já).
- O agente se chama **Akane** (`akane_agent`, de *Oshi no Ko*), seguindo a convenção de personagens de
  anime; o pacote vive em `agents/akane/`. Singleton sem MCP (padrão Nami/Frieren).
- **Filmes** passa a ser domínio da Akane; o futuro `agents/media/` fica restrito a **séries + anime**.
- **Listas (UI), cross-agent Nami/Kurisu/Frieren, recomendações, watch providers e estatísticas
  avançadas** ficam **fora** desta fatia (sugestões registradas).
- A captura em linguagem natural no Telegram usa o `gemini-2.5-flash` já configurado — nenhum serviço novo.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                  |
|--------------------|-------|------|--------|--------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Webapp Letterboxd-like + ingestão + agente, medíveis   |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | In/out explícitos; cross-agent além de Kaguya adiado   |
| Constraint Clarity | 0.80  | 0.65 | ✓      | TMDB único, idempotência, schema novo, single-user     |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 8 SCs pass/fail + cenários por US                       |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      | Decisões-chave fechadas no brainstorm                  |

---

*Phase: 015-akane-filmes*
*Spec created: 2026-06-12*
*Next step: discuss-phase / plan-phase — decisões de implementação (schema final, assinaturas das tools, telas e componentes do Shell, formato do resumo de sync)*
