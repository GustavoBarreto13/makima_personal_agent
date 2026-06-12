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

> **Referência de design**: o protótipo hi-fi completo está em
> `specs/015-akane-filmes/design_handoff_akane_filmes/` (HTML/CSS/JSX + `data.js` + README). Ele é a
> **fonte de verdade visual e comportamental** da seção Filmes; as specs abaixo descrevem a experiência
> **completa** dele. A build é **faseada em ondas** (ver `plan.md`): o **schema inteiro** (7 tabelas)
> nasce na Onda 1; as telas/endpoints das features mais ricas entram nas Ondas **US4** (Início, Rewind,
> Favoritos) e **US5** (Listas, Etiquetas, Cofre, Pessoas).

**Entra na 015** (introduz schema novo — `agents/akane/schema_pg.sql`, **7 tabelas** — e a seção webapp Filmes):

- **Catálogo de filmes** — tabela `movies` (UUID em TEXT, padrão Nami/Frieren) com metadados do TMDB
  (pôster, backdrop, gêneros, diretor, runtime, sinopse, ano), `tmdb_id`, `imdb_id`, `letterboxd_uri`
  (chave de dedup), `status` (`watchlist`|`watched`), `rating` favorita/atual (0.5–5.0), **`rating_source`**
  (`letterboxd`|`own` — selo "via Letterboxd"), `liked`, **`tags`** (etiquetas de nível-filme), **`notes`**
  (anotações soltas ≠ review), **`poster_palette`** (paleta do pôster tipográfico de fallback),
  `last_watched_date`, `times_watched`, soft delete.
- **Diário de sessões** — tabela `diary_entries` (1 linha por **vez** que o filme foi assistido —
  suporta rewatch; espelha `reading_logs` da Frieren): `watched_date`, `rating`, `rewatch`, `review`,
  `tags`, `source` (`manual`|`letterboxd_rss`|`letterboxd_csv`).
- **Cofre de conteúdos** — tabela `movie_vault_items` (link tipado por filme: `video`/`article`/`essay`/
  `review`) — conteúdos salvos **sobre** o filme. Tabela criada agora; **UI na Onda US5**.
- **Pessoas do filme** — tabela `movie_people` (direção + elenco + equipe; `is_person_tag`; `person_id`
  **reservado** para o hub `people` da fatia 014). Local ao domínio; **UI/link futuro na Onda US5**.
- **Favoritos** — tabela `movie_favorites` (vitrine ordenada do perfil, persistida no **servidor**).
  **UI na Onda US4**.
- **Listas** — tabelas `movie_lists` (+`accent`) + `movie_list_items` (N:N, espelha `shelves`/`book_shelves`);
  criadas agora, **UI na Onda US5**.
- **Camada de lógica única** (`agents/akane/tools.py`) — CRUD do catálogo, log de sessão, watchlist,
  rating/like, notas, favoritos, vault, busca TMDB, agregações (stats/rewind/heatmap/tags/home/top-pessoas);
  resolução de filme por fuzzy match (padrão `_find_book_by_query` da Frieren). Enriquecimento via TMDB
  com fallback gracioso (API fora → entrada sem metadados + pôster tipográfico, sem quebrar).
- **Webapp (peça central)** — seção **Filmes** no padrão Shell (`pages/akane/`), recriando o protótipo:
  **Início** (hero + stat cards + favoritos editáveis + atividade recente + painel de notas + carrossel
  watchlist), **Filmes** (grid de pôsteres com chips de filtro e modo "etiqueta"), **Diário** cronológico,
  **Watchlist**, **página do filme** (backdrop hero + nota/selo Letterboxd + review + notas + Cofre +
  etiquetas/pessoas + histórico de sessões), **Listas**, **Etiquetas** (nuvem) e **Rewind** (year-in-review).
  Tema claro/escuro + acento trocável + barra "Próxima sessão"; router FastAPI `/api/movies/*` (paritário,
  `Depends(require_user)`).
- **Ingestão Letterboxd** — `scripts/sync_letterboxd.py` (RSS, idempotente, `--yesterday` para o cron
  diário no container `makima-web` + endpoint `POST /api/movies/sync-letterboxd` para o botão "Sincronizar
  agora") e `scripts/import_letterboxd_csv.py` (carga histórica da exportação oficial; o usuário roda depois).
- **Agente Akane (Telegram)** — novo especialista (ADK, singleton, sem MCP) roteado pela Makima:
  logar filme assistido, adicionar à watchlist, dar nota/review, consultar diário/stats/favoritos.
- **Cross-agent Kaguya** — tool que cria lembrete/sessão ("quero assistir X" → tarefa na Kaguya e/ou
  evento de cinema no Calendar), no padrão das tools cross-domínio da Kaguya.

**Fica para depois** (sugestões registradas, fora desta fatia):
- **Link com o hub de pessoas (014)** — promover `movie_people.person_id` para FK em `people`/`person_links`
  (`entity_type='movie'`), unificando elenco/equipe com a identidade canônica do projeto.
- **Cross-agent Nami** — lançar o gasto do ingresso de cinema **na mesma transação** ao logar uma sessão
  "no cinema" (espelho de `complete_payment_task`); depende de definir o fluxo de conta/categoria.
- **Cross-agent Kurisu** — análises longas viram nota no vault Obsidian.
- **Cross-agent Frieren** — marcar filme como adaptação de um livro do catálogo (link livro↔filme).
- **Recomendações**, **watch providers** (onde assistir) e **suporte a séries/anime** (domínio do futuro
  `agents/media/`, agora restrito a séries+anime).

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

### User Story 4 - Início, Rewind e Favoritos (perfil cinéfilo) (Priority: P2)

Abro a seção e a tela **Início** me dá um panorama: um hero com saudação e a última sessão, cards de
estatística ("Filmes · 2026" com meta; "Sessões · 7 dias" com sparkline e variação vs. a semana anterior),
a vitrine dos meus **Favoritos** (que eu posso **editar** — remover e adicionar via busca), a **atividade
recente** do diário e um painel estilo Letterboxd com o **histograma de notas** (0,5–5,0). No fim do ano,
abro o **Rewind**: total de filmes/sessões/horas/revisões, sessões por mês, histograma, e destaques
(filme favorito, maior maratona, década mais vista, nota média, top gêneros/diretores/pessoas).

**Why this priority**: é a camada de "perfil" que transforma o catálogo num Letterboxd pessoal —
panorama + retrospectiva. Depende da US1 (mesmas tabelas) e da US2 (dados reais tornam o Rewind rico).
Entrega valor visível sem novas tabelas além de `movie_favorites`.

**Independent Test**: com filmes/sessões no banco, abrir **Início** e ver hero, os 2 stat cards (com
sparkline), 4 favoritos, atividade recente e o histograma; **editar** favoritos (remover 1, adicionar
outro via busca) e confirmar que persiste após recarregar; abrir **Rewind** do ano e ver os 4 totais +
sessões/mês + histograma + destaques; abrir o Rewind de um ano **sem dados** e ver zeros/listas vazias
**sem erro** (SC-006).

**Acceptance Scenarios**:

1. **Given** filmes e sessões no banco, **When** abro o Início, **Then** vejo hero (última sessão), os 2
   stat cards (incl. sparkline de 7 dias com variação), favoritos, atividade recente e o histograma de notas.
2. **Given** a vitrine de favoritos, **When** entro em "Editar", removo um e adiciono outro (busca entre os
   vistos), **Then** o conjunto é persistido **no servidor** (`PUT /favorites`) e sobrevive a um reload.
3. **Given** filmes assistidos no ano, **When** abro o Rewind, **Then** vejo total de filmes/sessões/horas/
   revisões, sessões por mês, histograma de notas e os destaques (favorito, maratona, década, média, tops).
4. **Given** um ano sem filmes, **When** abro o Rewind desse ano, **Then** todos os blocos resolvem vazios
   (zeros/listas) **sem erro** (SC-006).

---

### User Story 5 - Listas, Etiquetas, Cofre e Pessoas (coleção e curadoria) (Priority: P3)

Organizo meu acervo: crio **Listas** temáticas ("Atrizes em colapso", "Cinema japonês") e abro cada uma
como uma grade de pôsteres; navego pela nuvem de **Etiquetas** e clico numa para filtrar os filmes; na
página do filme, guardo conteúdos no **Cofre** (um vídeo-ensaio, um artigo, uma crítica), escrevo
**anotações** soltas (≠ review), e vejo a **direção/elenco/equipe** — com as etiquetas de pessoa marcadas
(que vão se ligar à base de pessoas no futuro).

**Why this priority**: é a curadoria que dá profundidade ao acervo (coleções + descoberta por tag +
material de estudo por filme). Depende da US1 (catálogo) e reusa as tabelas-satélite já criadas no schema.

**Independent Test**: criar uma lista e adicionar 3 filmes → abrir a lista e ver os 3 pôsteres; abrir
**Etiquetas**, clicar numa tag e ver o grid filtrado por ela; na página de um filme, **adicionar** um item
ao Cofre (tipo "ensaio") e vê-lo listado, **remover** depois; editar as **anotações** e recarregar (persiste);
ver a lista de **pessoas** do filme com a etiqueta de pessoa destacada.

**Acceptance Scenarios**:

1. **Given** filmes no acervo, **When** crio uma lista e adiciono filmes, **Then** a lista aparece com a
   pilha de pôsteres, nome, descrição, acento e contagem; abri-la mostra a grade daqueles filmes.
2. **Given** filmes com etiquetas, **When** abro Etiquetas e clico numa tag, **Then** vou para os Filmes
   filtrados por aquela etiqueta (modo "tela de etiqueta"); tags de pessoa recebem o glifo de pessoa.
3. **Given** a página de um filme, **When** adiciono um item ao Cofre (`type`, título, url) e depois removo,
   **Then** o item nasce/some na galeria do Cofre (`movie_vault_items`), sem afetar o resto.
4. **Given** a página de um filme, **When** edito as **anotações**, **Then** elas persistem em `movies.notes`
   (separadas da review da sessão) e reaparecem ao recarregar.
5. **Given** um filme com elenco/equipe, **When** abro o detalhe, **Then** vejo `people[]` (nome + papel),
   com `is_person_tag` destacando quem também é etiqueta — `person_id` permanece reservado (sem link à 014).

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
  a UI cai para o **pôster tipográfico** (paleta de `poster_palette` + título), sem quebrar o grid (SC-005).
- **Favoritos acima de 4 / com filme excluído**: `set_favorites` aceita no máximo 4 ids `watched`; um id
  inexistente/soft-deleted é rejeitado com mensagem clara; remover o filme tira-o da vitrine (CASCADE).
- **Etiqueta sem filmes** (após remover o último): some da nuvem (a nuvem é derivada de `movies.tags`).
- **Item de Cofre com URL ausente**: aceito (alguns conteúdos são só título/anotação); `source` derivado
  da URL quando houver, senão vazio.
- **Pessoa repetida em vários filmes**: contada uma vez por filme em "top pessoas"; `normalizado` evita
  duplicar por acento/caixa.
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

**Catálogo enriquecido — notas, origem da nota, pôster de fallback (US1)**

- **FR-018**: `movies` MUST separar **`notes`** (anotações soltas do filme) de **`review`** (texto da
  sessão, em `diary_entries`) — campos distintos, editáveis independentemente (`PATCH /{id}/notes`).
- **FR-019**: `movies` MUST registrar **`rating_source`** (`letterboxd`|`own`|NULL): logar/avaliar
  manualmente grava `own`; o RSS/CSV grava `letterboxd`. A UI MUST exibir o selo **"via Letterboxd"**
  apenas quando `rating_source='letterboxd'`.
- **FR-020**: a UI MUST usar o pôster **real do TMDB** quando `poster_url` existe e cair para um **pôster
  tipográfico** (campo de cor de `poster_palette` + título em Display) quando NULL — nunca um quadrado vazio
  (reforça SC-005). `poster_palette` MUST ter default determinístico (hash do título) quando não definido.

**Início, Rewind, Favoritos, Heatmap (US4)**

- **FR-021**: a camada de lógica MUST oferecer agregações **derivadas** (sem tabela de cache):
  `get_home` (bloco do Início numa só query), `get_stats`/`get_rewind` (year-in-review: contagens, horas,
  revisões, sessões/mês, histograma, top gêneros/diretores/pessoas, década, maratona, favorito) e
  `get_heatmap` (sessões/dia do ano) — todas **vazio-seguras** (SC-006).
- **FR-022**: o sistema MUST persistir **favoritos no servidor** (`movie_favorites`, ordenados): `get_favorites`
  e `set_favorites([ids≤4])`; a UI do Início MUST permitir editar (remover/adicionar via busca entre os
  `watched`). É um desvio consciente do protótipo (que usava `localStorage`) por **paridade de canais**.
- **FR-023**: o frontend MUST entregar a tela **Início** (hero + 2 stat cards com sparkline + favoritos
  editáveis + atividade recente + histograma de notas + carrossel da watchlist) e a tela **Rewind**
  (4 totais + sessões/mês + histograma + destaques), no visual do protótipo.

**Listas, Etiquetas, Cofre, Pessoas (US5)**

- **FR-024**: o sistema MUST oferecer **Listas** (CRUD de `movie_lists`/`movie_list_items`, com `accent`)
  e a UI correspondente (grade de coleções com pilha de mini-pôsteres → grade da lista).
- **FR-025**: o sistema MUST derivar a nuvem de **Etiquetas** (`get_tags` a partir de `movies.tags`, com
  flag `person` via `movie_people.is_person_tag`) e permitir **filtrar o grid por etiqueta** (`?tag=`).
- **FR-026**: o sistema MUST oferecer o **Cofre de conteúdos** por filme (`movie_vault_items`: CRUD de
  links tipados `video`/`article`/`essay`/`review`) e exibi-lo na página do filme.
- **FR-027**: o sistema MUST armazenar **direção/elenco/equipe** em `movie_people` (nome, papel,
  `is_person_tag`) e exibi-los no detalhe e em "top pessoas" (Rewind); `person_id` MUST permanecer
  **reservado** (NULL) nesta fatia — o link com o hub `people` da 014 é trabalho futuro.

**UI: tema, acento, tweaks, barra de sessão (US1/US4)**

- **FR-028**: o Shell MUST suportar **tema claro/escuro** e **acento trocável** (`[data-accent]`: base
  rosa, alternativos carmim/âmbar/teal; **default de fábrica = teal**), com **estrelas/histograma em verde
  Letterboxd** independentes do acento. Tweaks (tema/acento/densidade/estilo do pôster/ordenação) são
  **client-only** (localStorage), sem endpoint.
- **FR-029**: o Shell MUST ter a barra inferior **"Próxima sessão"** (planeja a próxima da watchlist, botão
  "Já vi" → loga) e **toasts** de confirmação após logar/sincronizar.

### Key Entities

- **Filme** (`movies`): identidade canônica do filme no catálogo; `id` UUID/TEXT, dedup por
  `letterboxd_uri`/`tmdb_id`, soft delete, metadados do TMDB; carrega `rating_source`, `tags` (nível-filme),
  `notes` (anotações soltas) e `poster_palette` (fallback tipográfico).
- **Sessão de diário** (`diary_entries`): cada vez que um filme foi assistido (suporta rewatch); FK para
  `movies`; carrega nota/review/tags/rewatch/data daquela visualização.
- **Cofre de conteúdo** (`movie_vault_items`): link tipado (`video`/`article`/`essay`/`review`) salvo
  **sobre** um filme; 1 filme → N itens.
- **Pessoa do filme** (`movie_people`): direção/elenco/equipe local ao filme (nome, papel, `is_person_tag`);
  `person_id` reservado para o hub `people` da fatia 014.
- **Favorito** (`movie_favorites`): filme em destaque na vitrine do perfil; conjunto ordenado (≤4),
  persistido no servidor.
- **Lista** (`movie_lists` + `movie_list_items`): coleções temáticas N:N (com `accent`); UI na Onda US5.
- **Etiqueta** (derivada): nome + contagem agregados de `movies.tags`; `person=true` quando casa com
  `movie_people` — entidade conceitual, sem tabela própria.

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
- **SC-009**: Editar a vitrine de **favoritos** (remover + adicionar) persiste **no servidor**: após
  `PUT /favorites` e reload, a vitrine reflete o novo conjunto ordenado (≤4) — coberto por teste.
- **SC-010**: **Listas/Etiquetas/Cofre** fazem round-trip: criar lista + adicionar filme aparece na lista;
  clicar numa etiqueta filtra o grid; adicionar/remover item do Cofre reflete na página — coberto por teste.
- **SC-011**: Pôster ausente cai para **tipográfico** (paleta + título), nunca quadrado vazio; pôster real
  do TMDB é usado quando há `poster_url` — verificável por inspeção (estende SC-005).

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
- **Pôster**: imagem real do TMDB é o primário; o **pôster tipográfico** (14 paletas) é o fallback quando
  não há `poster_url` — o protótipo, que é tipográfico puro, vira referência da camada de fallback.
- **Tema/acento**: claro/escuro + acento trocável (base rosa, **default de fábrica teal**); estrelas em
  verde Letterboxd fixo. Tweaks são preferências de UI (localStorage), sem backend.
- **Favoritos** são persistidos no **servidor** (`movie_favorites`), não no `localStorage` (paridade de canais).
- **Pessoas** (elenco/equipe) ficam **locais** ao filme nesta fatia; o link com o hub `people` da **014**
  é futuro (`movie_people.person_id` reservado).
- **Listas (UI), Etiquetas e Rewind** entram nesta fatia, **faseados** nas Ondas US4/US5 (não mais "para
  depois"). Ficam fora: link com o hub 014, **cross-agent Nami/Kurisu/Frieren**, recomendações e watch
  providers.
- A captura em linguagem natural no Telegram usa o `gemini-2.5-flash` já configurado — nenhum serviço novo.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                       |
|--------------------|-------|------|--------|-------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Webapp Letterboxd completo + ingestão + agente, medíveis    |
| Boundary Clarity   | 0.86  | 0.70 | ✓      | In/out explícitos; escopo rico **faseado em ondas** (US4/5) |
| Constraint Clarity | 0.82  | 0.65 | ✓      | TMDB+fallback, idempotência, 7 tabelas, acento, single-user |
| Acceptance Criteria| 0.86  | 0.70 | ✓      | 11 SCs pass/fail + cenários por 5 US                        |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      | Protótipo é a referência; 3 decisões fechadas nesta revisão |

> **Revisão 2026-06-12 (handoff)**: spec ampliada para incorporar o protótipo hi-fi do "Claude Design"
> (`design_handoff_akane_filmes/`). Decisões fechadas: pôster = TMDB+fallback tipográfico; escopo completo
> faseado em 5 ondas; pessoas locais (link 014 futuro). Schema cresce de 4 → 7 tabelas.

---

*Phase: 015-akane-filmes*
*Spec created: 2026-06-12 · ampliada 2026-06-12 (design handoff)*
*Next step: plan-phase / execução por ondas — assinaturas finais das tools, componentes do Shell (a partir do protótipo), endpoints de Listas (US5)*
