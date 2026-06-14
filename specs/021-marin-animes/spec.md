# Feature Specification: Marin Kitagawa — agente de Animes (fatia 021)

**Feature Branch**: `021-marin-animes`

**Created**: 2026-06-13

**Status**: Em andamento

**Input**: "vamos planejar um novo agent. Vai ser Marin Kitagawa, ela vai cuidar de toda a parte de
animes. Leia C:\Users\gusta\Documents\GitHub\n8n-python-scripts\anime_sync e
C:\Users\gusta\Documents\GitHub\n8n-python-scripts\mal_sync como base. Vamos criar as specs iniciais,
dê um guia para o claude design criar o front depois. Mantenha o padrão dos demais, mas dê a esse o
seu próprio brilho."

---

## Status de Implementação

> Atualizado em 2026-06-13. Antes de implementar qualquer coisa, **verifique esta seção** para não refazer trabalho já feito.

### ✅ Concluído e commitado

| O quê | Arquivo(s) | Commit |
|---|---|---|
| Todos os documentos de planejamento | `specs/021-marin-animes/spec.md`, `research.md`, `data-model.md`, `design-guide.md`, `contracts/api-anime.md`, `quickstart.md` | `e965988` |
| Docstring do pacote | `agents/marin/__init__.py` | `75cd1ef` |
| DDL PostgreSQL (4 tabelas) | `agents/marin/schema_pg.sql` | `75cd1ef` |
| Clientes de API puros (Jikan/AniList/ARM/TMDB) | `agents/marin/metadata.py` | `75cd1ef` |
| OAuth MAL PKCE + rotação de token | `agents/marin/mal_auth.py` | `75cd1ef` |
| Sync delta MAL → PostgreSQL | `agents/marin/mal_sync.py` | `75cd1ef` |

### ❌ Ainda não implementado (próxima sessão)

| O quê | Arquivo(s) alvo | Referência |
|---|---|---|
| Camada de lógica / tools do agente | `agents/marin/tools.py` | FR-004, FR-005, FR-006 |
| Agente ADK singleton + prompt | `agents/marin/agent.py`, `agents/marin/CLAUDE.md` | FR-015, FR-016 |
| Script OAuth bootstrap | `scripts/authorize_mal.py` | FR-014 |
| Wiring no coordinator | `coordinator/agent.py`, `coordinator/main.py`, `scripts/setup_schemas.py` | FR-017 |
| Docs raiz atualizados | `CLAUDE.md` (raiz), `coordinator/CLAUDE.md` | FR-017 |

### 🎨 Fora do escopo desta fatia (implementação futura)

| O quê | Observação |
|---|---|
| Protótipo hi-fi | ✅ **Criado** em `design_handoff_marin_animes/` — abre `Marin - Animes.html` para ver o visual final |
| Shell React + router FastAPI `/api/animes/*` | Fatia futura — `design-guide.md` e o handoff são a fonte de verdade |

> O `design-guide.md` foi **atualizado** (2026-06-13) com todos os detalhes do handoff:
> acento padrão Neon, tokens `--st-{status}`, dimensões reais (sidebar 244px, topbar 56px,
> NextBar 70px), hero com `profile-split`/`home-split`/carrossel, componentes `NextBar` +
> `FavoriteAnimes`/`AnimePicker` + `MalStats`, interações de hover/animação e breakpoints responsivos.

---

**Decisões fechadas no brainstorm**:
storage = **PostgreSQL** (padrão da casa — Nami/Kaguya/Frieren/Akane); MAL OAuth PKCE incluso na
fatia; granularidade = **episódio a episódio** (diário `watch_logs`); cache de metadados de episódios
em tabela `episodes`; entrega = **agente Telegram funcional + specs + guia de design** (front-end
React numa fatia futura); token MAL rotacionado a cada refresh → persistir em `mal_sync_state`
(jamais em arquivo — não sobrevive a redeploy Dokploy); fora de escopo: Calendar Hub, sync reverso
MAL, listas/coleções; Notion **não** é usado (scripts originais usavam Notion → PostgreSQL aqui).

---

## Escopo da fatia

**Entra na 021** (introduz schema novo — `agents/marin/schema_pg.sql`, **4 tabelas** — e o agente
Telegram Marin Kitagawa):

- **Catálogo de animes** — tabela `anime` com metadados ricos: `mal_id`, `anilist_id`, `tmdb_id`,
  título (EN/JP/exibição), `media_type` (tv/movie/ova/special/ona), temporada, estúdio, total de
  episódios, `episodes_watched`, `status` (assistindo/completo/quero_assistir/pausado/abandonado),
  `airing_status` (no_ar/finalizado/nao_lancado), nota (0.0–10.0 escala MAL), capas, gêneros, tags,
  notas e datas de início/fim. `normalizado` para fuzzy match, `source` e `deleted` soft delete.
- **Diário de sessões episódio a episódio** — tabela `watch_logs` (espelha `reading_logs` da
  Frieren): `anime_id`, `watched_date`, `ep_start`, `ep_end`, `episodes_count`, `rating`, `notes`.
- **Cache de episódios** — tabela `episodes`: metadados por episódio (título, data de exibição,
  sinopse, thumbnail, `airing_status`, `watched`). Alimentada pelo `anime_sync` (Jikan + AniList
  + TMDB). Cache best-effort — pode estar incompleto para séries longas.
- **Estado OAuth MAL** — tabela `mal_sync_state`: linha única com access/refresh tokens, expiração
  e timestamp do último sync. Tokens rotacionados a cada refresh (crítico: sem arquivo em disco).
- **Enriquecimento de metadados** — módulo `agents/marin/metadata.py`: Jikan (metadados + episódios),
  AniList (banner + schedule futuro), ARM (MAL→TMDB bridge), TMDB (thumbnails de episódio). Retry
  exponencial, delays respeitos, blacklist de MAL IDs longos (ex.: One Piece = 21).
- **Camada de lógica** — `agents/marin/tools.py`: todas as tools registradas no agente; operações:
  buscar, adicionar, logar sessão, atualizar status, avaliar, detalhar, schedule, stats, histórico,
  sync MAL, soft delete. Fuzzy match padrão Frieren/Akane.
- **MAL OAuth + sync** — `agents/marin/mal_auth.py` (PKCE, rotação de refresh) + `mal_sync.py`
  (delta pull do MAL → catálogo, sem sync reverso).
- **Agente Marin (Telegram)** — singleton ADK `gemini-2.5-flash`, sem MCP, registrado no coordinator.
  Personalidade: Marin Kitagawa (*My Dress-Up Darling*) — gyaru entusiasta de anime/cosplay, emoji
  ✨🎀💖📺🌸🎌⭐, começa cada resposta com "Marin:". HTML, nunca markdown.
- **Script de autorização MAL** — `scripts/authorize_mal.py`: fluxo PKCE interativo, grava os tokens
  iniciais em `mal_sync_state` (via inserção direta no PostgreSQL).

**Fica para depois** (sugestões registradas, fora desta fatia):

- **Front-end React** (Shell `pages/marin/`) + router FastAPI `/api/animes/*` — guia de design está
  pronto (ver `design-guide.md`), implementação fica para fatia futura.
- **Calendar Hub** — domínio de outra pessoa; não tocar em `calendar_hub.py`.
- **Sync reverso MAL** — atualizar o MAL a partir do catálogo local.
- **Listas/coleções** — temáticas, similar ao `movie_lists` da Akane.
- **Cross-agent Nami** — lançar assinatura de streaming ao logar primeira sessão.
- **Cross-agent Frieren** — marcar anime como adaptação de mangá/light novel do catálogo.
- **Cross-agent Kaguya** — lembrete "assistir episódio X hoje" como tarefa.
- **Recomendações** e **watch providers** (onde assistir).
- **Suporte a mangás** (domínio distinto da Frieren — livros impressos).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Camada de dados + agente Telegram (Priority: P1)

Adiciono um anime ao catálogo pelo Telegram: "Marin, quero ver Dungeon Meshi". Ela busca no Jikan,
encontra com MAL ID 52701, cria a entrada em `anime` com status `quero_assistir`, puxa metadados
(Jikan + AniList para banner). Depois digo "assisti os eps 1 a 3 do Dungeon Meshi". Ela loga a
sessão em `watch_logs`, avança `episodes_watched` para 3. Posso consultar o que estou assistindo
(`get_currently_watching`), dar uma nota, ver stats do ano (quantos eps assistidos, top gêneros).

**Why this priority**: é o núcleo. Sem catálogo + diário + agente, nada funciona. Entrega valor
sozinha como um "MyAnimeList pessoal conversacional" e destrava US2 (metadados) e US3 (sync).

**Independent Test**: com `agents/marin/schema_pg.sql` aplicado, `MAL_CLIENT_ID` setado e `TMDB_TOKEN`
opcional, chamar `add_anime("Dungeon Meshi")` → linha em `anime` com `mal_id=52701`, `status=
'quero_assistir'`, metadados do Jikan; chamar `log_watch("Dungeon Meshi", ep_start=1, ep_end=3)` →
linha em `watch_logs`, `anime.episodes_watched=3`; chamar `get_currently_watching()` após mudar
status para "assistindo" → anime aparece com progresso; `get_stats()` → contagem coerente.

**Acceptance Scenarios**:

1. **Given** catálogo vazio, **When** digo "Marin, quero ver Dungeon Meshi", **Then** nasce 1 linha
   em `anime` (`status='quero_assistir'`) com `mal_id`, título, gêneros e `poster_url` do Jikan.
2. **Given** anime na watchlist, **When** digo "assisti os eps 1-3 do Dungeon Meshi hoje",
   **Then** nasce 1 linha em `watch_logs` (`ep_start=1, ep_end=3, episodes_count=3`) e
   `anime.episodes_watched` vai para 3.
3. **Given** anime com `episodes_watched > 0`, **When** digo "estou assistindo Dungeon Meshi",
   **Then** `anime.status` vira `'assistindo'`.
4. **Given** vários animes assistindo, **When** peço `get_currently_watching()`, **Then** recebo
   lista com título, progresso (`episodes_watched / episodes_total`), próximo episódio e status
   de exibição.
5. **Given** sessões logadas no ano, **When** peço stats, **Then** vejo total de animes, total de
   episódios assistidos, horas estimadas, top gêneros — e resolver **sem erro** com ano vazio.
6. **Given** a Makima, **When** mando "animes", "anime", "assistindo", "episódio", "temporada",
   **Then** o pedido é roteado para a `marin_agent`.

---

### User Story 2 - Enriquecimento de metadados (Jikan / AniList / TMDB) (Priority: P2)

Além do catálogo básico, quero metadados ricos: episódios com data de lançamento, sinopse,
thumbnail; banner de qualidade da AniList; schedule dos próximos episódios dos animes que estou
assistindo ("Marin, quais eps saem essa semana?"). O `anime_sync` (portado do n8n) cuida disso —
pode ser invocado manualmente ("Marin, atualiza os metadados do Frieren") ou em batch.

**Why this priority**: eleva a experiência do P1 — saber que o próximo episódio de um anime sai
amanhã é o diferencial do sistema. Depende do P1 (precisa do catálogo).

**Independent Test**: com `MAL_CLIENT_ID` e `TMDB_TOKEN` setados, chamar
`from agents.marin.metadata import enrich_anime` com um `mal_id` conhecido → `episodes` populados
com título, `aired`, `watched=False`; chamar `get_airing_schedule(days=7)` com ao menos um anime
`assistindo` → retorna episódios futuros com data UTC; `TMDB_TOKEN` ausente → thumbnails são `None`,
sem erro (gracioso).

**Acceptance Scenarios**:

1. **Given** anime com `mal_id` válido, **When** rodo o enriquecimento, **Then** `episodes` tem
   pelo menos N páginas do Jikan com `number`, `title`, `aired` (DATE), `synopsis` (≤2000 chars)
   e `airing_status` correto.
2. **Given** anime em exibição, **When** busco na AniList via `idMal`, **Then** `anime.banner_url`
   é atualizado com a imagem de alta resolução da AniList (quando disponível), e o schedule de
   episódios futuros é persistido em `episodes` com `airingAt` convertido para DATE.
3. **Given** `TMDB_TOKEN` setado e `tmdb_id` resolvido via ARM, **When** enriqueço episódios,
   **Then** `episodes.thumbnail_url` é preenchido com URL do TMDB (`/w780`).
4. **Given** `TMDB_TOKEN` ausente, **When** enriqueço, **Then** thumbnails ficam `None`, sem erro.
5. **Given** One Piece (MAL ID 21) no catálogo, **When** rodo sync de episódios, **Then** o anime
   recebe atualização de metadados gerais (Jikan `/anime/21/full`) mas **nenhum** `episodes` é
   criado (blacklist ativa — 1100+ episódios travaria a API).
6. **Given** Jikan retorna 429, **When** faço uma chamada de enriquecimento, **Then** o sistema
   faz retry com backoff exponencial (2s → 4s → 8s) e só loga erro definitivo após 3 tentativas.

---

### User Story 3 - Cross-agent + sync MAL automático (Priority: P3)

Meu histórico já está no MAL. Ao fazer "Marin, sync MAL", ela puxa o delta da minha lista no MAL
(entradas atualizadas desde o último sync), converte os status MAL → PT-BR e atualiza o catálogo
(upsert por `mal_id`). O refresh_token é rotacionado a cada chamada e salvo em `mal_sync_state`.
Nunca escrevo em arquivo — isso não sobrevive a redeploy no Dokploy.

**Why this priority**: é o que mantém o catálogo sincronizado com o MAL sem digitação manual.
Depende do P1 (schema + tools) e do `mal_auth.py` (tokens). P3 porque o catálogo já tem valor
sem o sync; o sync amplifica.

**Independent Test**: com `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET` e tokens válidos em `mal_sync_state`,
rodar `from agents.marin.tools import sync_mal; sync_mal()` → animes com `updated_at > last_sync_at`
são upsertados em `anime` (status convertido); `mal_sync_state.last_sync_at` é atualizado; rodar 2×
sem alterações no MAL → **0** upserts novos (idempotente); refresh_token na tabela é diferente após
o sync (rotação); sem `MAL_CLIENT_ID` → retorna erro claro.

**Acceptance Scenarios**:

1. **Given** tokens válidos em `mal_sync_state`, **When** rodo `sync_mal()`, **Then** animes com
   `list_status.updated_at > last_sync_at` são upsertados em `anime` (criados se novos, atualizados
   se existentes) com status convertido do MAL (ex.: `watching` → `assistindo`).
2. **Given** sync já rodou, **When** rodo sem mudanças no MAL, **Then** **0** upserts — idempotente.
3. **Given** refresh_token na tabela, **When** o access_token expira, **Then** `mal_auth.py` faz
   refresh automático via `POST /v1/oauth2/token`, rotaciona o `refresh_token` e persiste o novo par
   em `mal_sync_state` — **jamais em arquivo**.
4. **Given** o MAL retornar um anime com `status='on_hold'`, **When** upserto, **Then**
   `anime.status` vira `'pausado'` (mapeamento PT-BR correto).
5. **Given** `MAL_CLIENT_ID` ausente, **When** chamo `sync_mal()`, **Then** retorno
   `{"status": "error", "message": "MAL_CLIENT_ID não configurado"}` sem traceback.
6. **Given** Marin no Telegram, **When** digo "Marin, sync MAL" ou "Marin, sincroniza meu MAL",
   **Then** ela chama `sync_mal()`, exibe resumo (`criados/atualizados/ignorados`) com entusiasmo ✨.

---

### Edge Cases

- **Anime não encontrado no Jikan**: `add_anime(query)` retorna lista de candidatos (até 5) em vez
  de criar; o usuário confirma qual ou passa `mal_id` direto.
- **`episodes_total` desconhecido** (anime em exibição sem data de fim): campo é `NULL` — a UI
  mostra "? episódios"; progresso como `X / ?`.
- **Logar episódio além do total**: `log_watch(ep_end=99)` em anime com `episodes_total=24` é
  permitido (o usuário pode ter informação mais recente que o cache) — apenas loga um aviso.
- **Mesmo episódio logado duas vezes**: `watch_logs` não tem índice único por episódio — é
  intencional (rewatches são permitidos, assim como na Frieren); cada `log_watch` é uma sessão.
- **One Piece e animes longos (blacklist)**: enriquecimento de episódios pulado, metadados gerais
  do anime atualizados normalmente.
- **AniList down**: metadados básicos do Jikan são suficientes; banner e schedule ficam `NULL`
  sem erro.
- **ARM retorna `tmdb_id: null`**: `tmdb_id` fica `NULL` em `anime`; thumbnails de episódio são
  `NULL` — não quebra nada.
- **Token MAL expirado antes do primeiro refresh**: `mal_auth.py` tenta refresh; se falhar (ex.:
  refresh_token inválido), retorna erro claro pedindo re-autorização via `authorize_mal.py`.
- **Soft delete de anime com logs**: `delete_anime` faz `UPDATE anime SET deleted=TRUE`; os
  `watch_logs` permanecem (histórico); o anime some das listagens ativas.
- **Stats com ano vazio**: cada bloco de `get_stats` retorna zeros/listas vazias, nunca erro.
- **Fuzzy match ambíguo** ("Naruto" → múltiplos resultados): retorna lista de candidatos com
  `mal_id`, `title` e `media_type`; não cria entrada sem confirmação.

---

## Requirements *(mandatory)*

### Functional Requirements

**Catálogo e diário (US1)**

- **FR-001**: O sistema MUST persistir animes em `anime` com UUID em TEXT (`id`), `mal_id`,
  `anilist_id`, `tmdb_id`, `title` NOT NULL, `title_english`, `title_japanese`, `normalizado`
  NOT NULL (fuzzy match), `media_type`, `season`, `studio`, `episodes_total`, `episodes_watched`
  DEFAULT 0, `status` DEFAULT `'quero_assistir'`, `airing_status`, `score` NUMERIC(3,1),
  `poster_url`, `banner_url`, `overview`, `genres` TEXT[], `tags` TEXT[], `notes`,
  `date_started`, `date_finished`, `source`, `mal_updated_at`, `created_at`, `updated_at`,
  `deleted` DEFAULT FALSE.
- **FR-002**: O sistema MUST registrar cada sessão em `watch_logs` (1 linha por sessão de
  episódios, sem índice único de dedup — rewatches permitidos): `id`, `anime_id` FK, `anime_title`
  (denorm), `watched_date` NOT NULL, `ep_start`, `ep_end`, `episodes_count`, `rating`
  NUMERIC(3,1), `notes`, `source`, `created_at`.
- **FR-003**: O sistema MUST cachear metadados de episódios em `episodes`: `id`, `anime_id` FK
  ON DELETE CASCADE, `number` NOT NULL, `title`, `aired` DATE, `synopsis`, `thumbnail_url`,
  `airing_status`, `watched` DEFAULT FALSE, `watched_date`; UNIQUE(anime_id, number).
- **FR-004**: O sistema MUST oferecer, em `agents/marin/tools.py`, as operações:
  `search_anime`, `add_anime`, `log_watch`, `get_currently_watching`, `get_watchlist`,
  `update_anime_status`, `rate_anime`, `get_anime_details`, `get_airing_schedule`,
  `get_stats`, `get_watch_history`, `sync_mal`, `delete_anime`, `delete_watch_log` —
  retornando HTML para o Telegram e dict estruturado para o router FastAPI (futuro).
- **FR-005**: O sistema MUST resolver animes por fuzzy match (normalização sem acento,
  minúsculo — padrão `_find_book_by_query` da Frieren) e por `mal_id` direto; validar
  `score` ∈ [0.0, 10.0] (escala MAL, meia nota).
- **FR-006**: `log_watch` MUST atualizar `anime.episodes_watched` (acumula `episodes_count`),
  atualizar `episodes.watched=TRUE` para os episódios logados (quando existirem em cache), e
  inferir `date_started` (primeira sessão) e `date_finished` (quando `episodes_watched >= episodes_total`).

**Enriquecimento de metadados (US2)**

- **FR-007**: `agents/marin/metadata.py` MUST buscar no Jikan: `/anime/{mal_id}/full` (metadados
  completos) e `/anime/{mal_id}/episodes?page=N` (paginado, delay 1.2s); parsear
  `pagination.has_next_page` para buscar todas as páginas.
- **FR-008**: O módulo MUST consultar AniList (GraphQL, `https://graphql.anilist.co`, delay 0.8s)
  para `bannerImage` e `airingSchedule` (timestamps UTC → DATE), delay 0.8s.
- **FR-009**: O módulo MUST resolver `tmdb_id` via ARM (`https://arm.haglund.dev/api/v2/ids`,
  delay 0.5s) e buscar thumbnails de episódio no TMDB (`/w780`, delay 0.3s) apenas quando
  `TMDB_TOKEN` estiver setado.
- **FR-010**: O módulo MUST respeitar a blacklist `{21}` (One Piece) — pular sync de episódios,
  atualizar apenas metadados gerais do anime.
- **FR-011**: HTTP helper MUST implementar retry exponencial: MAX_RETRIES=3, RETRY_BACKOFF=2.0s,
  em 429 e 5xx e exceções de rede; 404 → None imediato; outros 4xx → loga body e retorna None.

**MAL OAuth + sync (US3)**

- **FR-012**: `agents/marin/mal_auth.py` MUST implementar OAuth2 PKCE (code_verifier/challenge),
  `POST https://myanimelist.net/v1/oauth2/token` para troca de código e refresh; MUST rotacionar
  o `refresh_token` a cada refresh (MAL rotaciona) e persistir o novo par em `mal_sync_state`
  via UPDATE — **nunca em arquivo em disco** (não sobrevive a redeploy Dokploy).
- **FR-013**: `agents/marin/mal_sync.py` MUST fazer pull delta: `GET /users/@me/animelist` com
  `fields=list_status{score,num_episodes_watched,status,updated_at}`, `nsfw=true`, `limit=100`,
  `sort=list_updated_at`; paginar até não haver `next`; filtrar por `updated_at > last_sync_at`;
  upsert em `anime` por `mal_id` com mapeamento de status MAL → PT-BR.
- **FR-014**: `scripts/authorize_mal.py` MUST guiar o fluxo PKCE interativo (abre URL no browser,
  captura o callback manualmente), gravar tokens em `mal_sync_state` via INSERT OR UPDATE.

**Agente Telegram (US1/US3)**

- **FR-015**: A Makima MUST rotear pedidos sobre anime/episódio/temporada/assistindo/MAL para
  `marin_agent` (`agents/marin/agent.py`, singleton sem MCP, `gemini-2.5-flash`), registrada em
  `coordinator/agent.py:sub_agents` e descrita em `_MAKIMA_INSTRUCTION`.
- **FR-016**: A Marin MUST formatar respostas em **HTML** (nunca markdown), começar toda resposta
  com "Marin:", usar emojis característicos (✨🎀💖📺🌸🎌⭐) com moderação, e chamar tools
  **antes** de responder (nunca inventar dados).

**Paridade e convenções**

- **FR-017**: `agents/marin/schema_pg.sql` MUST ser registrado em `scripts/setup_schemas.py` (lista
  `SCHEMA_FILES`); `CLAUDE.md` raiz MUST listar Marin (domínio **animes**).
- **FR-018**: Toda lógica de domínio vive em `agents/marin/tools.py`; `webapp/backend/routers/
  animes.py` (futuro) será uma fachada fina — nunca lógica no router.

### Key Entities

- **Anime** (`anime`): identidade canônica; UUID TEXT, dedup por `mal_id`, soft delete; carrega
  `episodes_watched` (contador), `score` (0–10), `status` PT-BR, `airing_status`.
- **Log de sessão** (`watch_logs`): cada sessão de episódios assistidos; denormaliza `anime_title`;
  sem dedup único (rewatches são intencionais, igual `reading_logs` da Frieren).
- **Episódio** (`episodes`): cache de metadados; UNIQUE(anime_id, number); `watched` sincronizado
  pelo `log_watch`.
- **Estado MAL** (`mal_sync_state`): linha única (id=1); access/refresh tokens + expiração +
  `last_sync_at`; updated a cada sync.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `add_anime("Dungeon Meshi")` cria linha em `anime` com `mal_id=52701`, título,
  gêneros, `poster_url` e `status='quero_assistir'` — coberto por teste.
- **SC-002**: `log_watch("Dungeon Meshi", ep_start=1, ep_end=3)` cria linha em `watch_logs` e
  atualiza `anime.episodes_watched=3` — coberto por teste.
- **SC-003**: `sync_mal()` faz upsert de animes com `updated_at > last_sync_at` e atualiza
  `mal_sync_state.last_sync_at`; rodando 2× sem mudanças no MAL → 0 upserts — verificável.
- **SC-004**: refresh_token em `mal_sync_state` é diferente após um refresh bem-sucedido (rotação
  confirmada no banco) — verificável por consulta SQL.
- **SC-005**: One Piece (MAL ID 21) com blacklist ativa → metadados gerais atualizados, **0**
  linhas em `episodes` criadas para ele — verificável por teste.
- **SC-006**: TMDB ausente (`TMDB_TOKEN` não setado) → enriquecimento funciona sem thumbnails,
  sem erro — verificável por teste.
- **SC-007**: `get_stats()` de um ano com animes retorna contagens e top gêneros; de um ano vazio
  retorna zeros/listas sem erro — coberto por teste.
- **SC-008**: Makima roteia pedidos sobre anime para `marin_agent`; a Marin chama a tool antes de
  responder e formata em HTML — verificável no Telegram.
- **SC-009**: `delete_anime(query)` faz soft delete (`deleted=TRUE`); anime some das listagens;
  `watch_logs` permanecem no banco — coberto por teste.

---

## Assumptions

- **Single-user** e fuso `America/Sao_Paulo`, como o restante do projeto; sem multiusuário.
- **Schema novo**: fatia 021 introduz `agents/marin/schema_pg.sql` (4 tabelas), aplicado via
  container `makima-web` (`python -m scripts.setup_schemas`).
- **MAL** é a fonte de sync principal. Jikan é fonte de metadados (sem auth). AniList é fonte
  de banner + schedule. ARM é o bridge MAL→TMDB. TMDB é opcional (thumbnails).
- **Scripts originais usavam Notion** (anime_sync, mal_sync no n8n-python-scripts) — aqui a
  lógica de acesso a APIs é portada, o **sink é PostgreSQL**. Os IDs/constantes são copiados,
  não importados.
- **Front-end** (Shell React `pages/marin/`, router `/api/animes/*`) fica para fatia futura.
  O `design-guide.md` já está pronto para guiar o Claude Design quando chegar a hora.
- A Marin é um **singleton sem MCP** (padrão Nami/Frieren/Akane); factory só para McpToolset.
- **Nota**: escala 0–10 (MAL), meia nota (0.0–10.0), diferente da Akane (0.5–5.0 Letterboxd).
- **Rewatches**: múltiplos `watch_logs` por anime são intencionais e permitidos (sem unique).
- **Env vars novas**: `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET` obrigatórias; `MAL_REFRESH_TOKEN`,
  `MAL_ACCESS_TOKEN`, `MAL_TOKEN_EXPIRY` populadas pelo `authorize_mal.py` e depois gerenciadas
  em `mal_sync_state`. `TMDB_TOKEN` opcional.

---

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                                        |
|---------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity        | 0.92  | 0.75 | ✓      | Agente Telegram + schema + MAL sync; medíveis por SCs        |
| Boundary Clarity    | 0.88  | 0.70 | ✓      | Front-end explicitamente fora; Calendar Hub fora             |
| Constraint Clarity  | 0.85  | 0.65 | ✓      | PostgreSQL, OAuth PKCE, rotação token, 4 tabelas, sem MCP    |
| Acceptance Criteria | 0.87  | 0.70 | ✓      | 9 SCs pass/fail + cenários por 3 US + edge cases             |
| **Ambiguity**       | 0.13  | ≤0.20| ✓      | Decisões principais fechadas no brainstorm                   |

---

*Phase: 021-marin-animes*
*Spec created: 2026-06-13*
*Next step: implementar `tools.py` → `agent.py` → `authorize_mal.py` → wiring coordinator*
