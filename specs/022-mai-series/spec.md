# Feature Specification: Mai Sakurajima — agente de Séries de TV (fatia 022)

**Feature Branch**: `022-mai-series`

**Created**: 2026-06-13

**Status**: Draft

**Input**: "vamos planejar um novo agent. Vai ser Mai Sakurajima, ela vai cuidar de toda a parte de
séries de TV. Leia C:\Users\gusta\Documents\GitHub\n8n-python-scripts\series_sync como base. Vamos
criar as specs iniciais, dê um guia para o claude design criar o front depois. Mantenha o padrão
dos demais, mas dê a esse o seu próprio brilho."

**Decisões fechadas no brainstorm**:
storage = **PostgreSQL** (padrão da casa — Nami/Kaguya/Frieren/Akane/Marin); **sem fonte externa
de histórico** nesta fatia (Trakt/Simkl/Serializd deferidos para fatia futura) → única env var nova
é `TMDB_TOKEN`, já existente na Akane; granularidade = **episódio a episódio**, com `season_number`
(séries têm temporadas, camada inexistente na Akane e na Marin); escala de nota = **0.5–5.0**
(Letterboxd-style, consistente com a Akane, irmã de mídia); entrega = **agente Telegram funcional
+ specs + guia de design** (front-end React numa fatia futura); `agents/media/` (placeholder para
"séries + anime") é aposentado — Marin (021) absorve os animes, Mai (022) absorve as séries de TV.

---

## Escopo da fatia

**Entra na 022** (introduz schema novo — `agents/mai/schema_pg.sql`, **4 tabelas** — e o agente
Telegram Mai Sakurajima):

- **Catálogo de séries** — tabela `series` com metadados ricos: `tmdb_id`, `imdb_id`, título de
  exibição e original, `series_status` (no_ar/finalizada/cancelada/nao_lancada — campo de exibição
  da série, ≠ `status` do usuário), rede (`network`), contagens de temporadas/episódios, `episodes_watched`
  acumulado, status do usuário (quero_assistir/assistindo/concluida/pausada/abandonada), nota 0.5–5.0,
  pôster, backdrop, sinopse, gêneros, tags, notas, datas de início/fim e soft delete.
- **Cache de temporadas** — tabela `seasons` *(camada exclusiva da Mai, sem equivalente na Akane
  ou Marin)*: metadados por temporada (número, nome, contagem de episódios, data de estreia,
  sinopse, pôster); `UNIQUE(series_id, season_number)`. Alimentada pelo enriquecimento TMDB.
  Especiais excluídos (`season_number = 0`).
- **Cache de episódios** — tabela `episodes`: metadados por episódio (temporada, número, título,
  data de exibição, sinopse, still, `airing_status`, `watched`); `UNIQUE(series_id, season_number,
  episode_number)`. Alimentado via `GET /tv/{id}/season/{n}` (port do series_sync). Skip-logic
  incremental: episódio com data + still + air_date < hoje é pulado no re-sync (não recria).
- **Diário de sessões** — tabela `watch_logs` (espelha `watch_logs` da Marin, + `season_number`
  e `review`): 1 linha por sessão de episódios; sem índice único (rewatches permitidos).
- **Camada de lógica** — `agents/mai/tools.py`: todas as tools do agente; operações: buscar, adicionar,
  logar sessão, atualizar status, avaliar, detalhar (com temporadas + próximo episódio), schedule de
  próximos lançamentos, stats, histórico, sync de metadados TMDB, soft delete. Fuzzy match padrão
  Frieren/Akane/Marin.
- **Enriquecimento de metadados** — `agents/mai/metadata.py`: `GET /search/tv` (busca), `GET /tv/{id}`
  (detalhe da série), `GET /tv/{id}/season/{n}` (temporada + episódios). Auth Bearer v4 (igual Akane,
  diferente do v3 query-param do series_sync original). Retry exponencial, specials excluídos.
- **Agente Mai (Telegram)** — singleton ADK `gemini-2.5-flash`, sem MCP, registrado no coordinator.
  Personalidade: Mai Sakurajima (*Seishun Buta Yarou wa Bunny Girl Senpai*) — atriz serena, madura,
  elegante, humor seco/afiado, atenciosa por baixo da frieza. Trata séries como *performances de
  longo curso*: analisa arcos de personagem, estrutura de temporada, ritmo de roteiro. Emojis com
  parcimônia (🐰 📺 🌙 ✨ 🎬). Começa cada resposta com "Mai:". HTML, nunca markdown.

**Fica para depois** (sugestões registradas, fora desta fatia):

- **Front-end React** (Shell `pages/mai/`) + router FastAPI `/api/series/*` — guia de design pronto
  (ver `design-guide.md`), implementação fica para fatia futura.
- **Fonte de histórico externo** — sync Trakt (OAuth PKCE + pull do histórico), Simkl, Serializd
  (tipo Letterboxd para séries). Nenhuma delas tem lógica de API referenciada no repo; requer pesquisa
  dedicada.
- **Cross-agent Kaguya** — lembrete "assistir ep X hoje" como tarefa + evento no Calendar.
- **Cross-agent Nami** — lançar assinatura de streaming ao adicionar primeira série de um canal.
- **Cross-agent Frieren** — marcar série como adaptação de livro do catálogo.
- **Cross-agent Akane** — ligar série que virou filme / prequel-filme à série.
- **Listas/coleções** temáticas (similar ao `movie_lists` da Akane).
- **Avaliação por episódio** — nota individual por episódio (agora é por sessão/temporada).
- **Watch providers** — onde assistir (TMDB `/tv/{id}/watch/providers`).
- **Sync reverso** — atualizar Trakt/Simkl a partir do catálogo local.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Camada de dados + agente Telegram (Priority: P1)

Adiciono uma série pelo Telegram: "Mai, quero assistir Severance". Ela busca no TMDB, encontra
`tmdb_id=95396`, cria a entrada em `series` com `status='quero_assistir'`, pôster e metadados.
Depois digo "assisti os eps 1 e 2 da T1 de Severance hoje". Ela loga a sessão em `watch_logs`
com `season_number=1, ep_start=1, ep_end=2`, avança `episodes_watched` para 2. Posso consultar
o que estou assistindo (`get_currently_watching`), dar uma nota, ver stats do ano (quantas séries,
total de episódios, top gêneros). A Makima me roteia para a Mai quando falo sobre séries.

**Why this priority**: é o núcleo. Sem catálogo + diário + agente, nada funciona. Entrega valor
sozinha como um "tracker pessoal conversacional" e destrava US2 (metadados) e US3 (consultas ricas).

**Independent Test**: com `agents/mai/schema_pg.sql` aplicado e `TMDB_TOKEN` setado, chamar
`add_series("Severance")` → linha em `series` com `tmdb_id=95396`, `status='quero_assistir'`,
metadados do TMDB; chamar `log_watch("Severance", season_number=1, ep_start=1, ep_end=2)` →
linha em `watch_logs`, `series.episodes_watched=2`; chamar `get_currently_watching()` após mudar
status para `assistindo` → série aparece com progresso; `get_stats()` → contagem coerente.

**Acceptance Scenarios**:

1. **Given** catálogo vazio, **When** digo "Mai, quero assistir Severance", **Then** nasce 1 linha
   em `series` (`status='quero_assistir'`) com `tmdb_id`, título, pôster e gêneros do TMDB.
2. **Given** série na watchlist, **When** digo "assisti T1E1-E2 de Severance hoje", **Then** nasce
   1 linha em `watch_logs` (`season_number=1, ep_start=1, ep_end=2, episodes_count=2`) e
   `series.episodes_watched` vai para 2.
3. **Given** série com `episodes_watched > 0`, **When** digo "estou assistindo Severance", **Then**
   `series.status` vira `'assistindo'`.
4. **Given** várias séries com status `assistindo`, **When** peço `get_currently_watching()`, **Then**
   recebo lista com título, progresso, próximo episódio e `series_status` de exibição.
5. **Given** sessões logadas no ano, **When** peço stats, **Then** vejo total de séries, total de
   episódios assistidos, top gêneros — e resolver **sem erro** com ano vazio.
6. **Given** a Makima, **When** mando "séries", "série", "episódio", "temporada", "assistindo", "Mai",
   **Then** o pedido é roteado para a `mai_agent`.

---

### User Story 2 - Enriquecimento de metadados TMDB (Priority: P2)

Além do catálogo básico, quero metadados ricos: temporadas com data de estreia e pôster, episódios
com título e still. O módulo `metadata.py` (portado do series_sync) cuida disso — pode ser invocado
manualmente ("Mai, atualiza os metadados de Severance") ou após `add_series`. O schedule dos
próximos episódios das séries que estou assistindo ("Mai, o que sai essa semana?") usa o cache
de episódios já enriquecido.

**Why this priority**: eleva a experiência do P1 — saber que um novo episódio de uma série
sai amanhã é o diferencial do sistema. Depende do P1 (catálogo + schema).

**Independent Test**: com `TMDB_TOKEN` setado, chamar `from agents.mai.metadata import enrich_series`
com `tmdb_id=95396` (Severance) → `seasons` populadas (T1, T2 pelo menos) e `episodes` populados
com título, `air_date`, `still_url`, `airing_status`; re-rodar → episódios antigos com still não
são reprocessados (skip-logic); `get_upcoming(days=7)` com ao menos 1 série `assistindo` que tenha
episódios futuros → retorna os episódios agendados com data e still; `TMDB_TOKEN` ausente → erro
claro, sem traceback.

**Acceptance Scenarios**:

1. **Given** série com `tmdb_id` válido, **When** rodo o enriquecimento, **Then** `seasons` tem
   pelo menos 1 linha por temporada não-especial (season_number ≠ 0) com `name`, `episode_count`,
   `air_date` e `poster_url` (quando disponível do TMDB).
2. **Given** série enriquecida, **When** rodo de novo sem mudanças no TMDB, **Then** episódios com
   `air_date < hoje` E `still_url IS NOT NULL` são **pulados** (skip-logic); apenas episódios novos
   ou sem still são processados — re-sync é incremental.
3. **Given** episódio agendado (`air_date > hoje`) em série `assistindo`, **When** chamo
   `get_upcoming(days=7)`, **Then** o episódio aparece com `anime_title`, `season_number`,
   `episode_number`, `title`, `air_date`, `still_url`.
4. **Given** `TMDB_TOKEN` ausente, **When** tento enriquecer, **Then** retorno `{"status": "error",
   "message": "TMDB_TOKEN não configurado"}`, sem traceback.
5. **Given** série com temporada especial (`season_number=0`, name="Specials"), **When** processo
   as temporadas, **Then** a temporada 0 e seus episódios são **excluídos** da tabela `seasons`
   (não criados).
6. **Given** TMDB retornar 429 ou 5xx, **When** faço chamada de enriquecimento, **Then** o sistema
   faz retry com backoff exponencial (2s → 4s → 8s) e loga erro definitivo após 3 tentativas.

---

### User Story 3 - Consultas ricas + soft delete (Priority: P3)

Posso pedir o **detalhe completo** de uma série ("Mai, me conta sobre Severance"): ela responde com
metadados, progresso, próximo episódio e histórico de sessões. Posso **avaliar** ("nota 4.5 para
Severance"), adicionar **anotações** ("essa série tem roteiro incrível") e **excluir** entradas
indesejadas (soft delete preserva o histórico). O cross-agent Kaguya está registrado como futuro.

**Why this priority**: é o refinamento que transforma o tracker em uma ferramenta de análise.
Depende de US1 (catálogo + diário) e US2 (metadados ricos).

**Independent Test**: com série e sessões no banco, chamar `get_series_detail("Severance")` →
retorno com `series`, `seasons[]`, `next_episode`, `recent_logs[]`; chamar `rate_series` →
`series.rating` atualizado; chamar `set_notes` → `series.notes` atualizado; chamar `delete_series`
→ `series.deleted=TRUE`, série some de `list_series`; `watch_logs` da série permanecem.

**Acceptance Scenarios**:

1. **Given** série com temporadas/episódios no cache, **When** peço o detalhe, **Then** recebo
   `series` (metadados + status + nota), `seasons[]` (lista de temporadas com progresso), o
   `next_episode` não assistido e os últimos 5 `watch_logs`.
2. **Given** série no catálogo, **When** digo "nota 4.5 para Severance", **Then** `series.rating=4.5`
   e `series.rating_source='own'` são persistidos.
3. **Given** série no catálogo, **When** edito as anotações, **Then** `series.notes` é atualizado
   (separado do `review` de sessão, que fica em `watch_logs`).
4. **Given** série com sessões no banco, **When** faço soft delete, **Then** `series.deleted=TRUE`,
   a série some de todas as listagens ativas, mas `watch_logs` permanecem no banco (histórico).
5. **Given** a Mai no Telegram, **When** digo "nota 4.5 para Severance", **Then** ela chama a tool
   **antes** de responder, confirma a nota e responde em HTML — nunca inventa dados.

---

### Edge Cases

- **Série não encontrada no TMDB** (`add_series(query)` retorna lista de candidatos, até 5): o
  usuário confirma qual ou passa `tmdb_id` diretamente; a série não é criada sem confirmação quando
  há ambiguidade.
- **Série sem `tmdb_id`** (adicionada manualmente sem busca): dedup cai para fuzzy match de título;
  enriquecimento impossível sem `tmdb_id` — retorno gracioso.
- **`episodes_count` desconhecido** (série em exibição sem data de fim): campo `NULL` na tabela
  `series`; progresso exibido como "X / ? episódios".
- **Logar episódio além do total**: `log_watch(ep_end=99)` em série com `episodes_count=20` é
  permitido (usuário pode ter info mais recente); apenas loga aviso, não valida.
- **Mesmo episódio logado 2×**: `watch_logs` sem índice único por episódio — rewatch intencional
  (mesma filosofia da Marin e Frieren).
- **Temporada especial (season_number=0)**: excluída do cache `seasons` e `episodes` (skip do
  series_sync portado); metadados gerais da série atualizados normalmente.
- **TMDB down ou rate-limit**: sync de metadados loga erro e segue; série criada com dados básicos
  (título/tmdb_id) sem pôster — pôster tipográfico na UI (futuro).
- **Soft delete de série com logs**: `delete_series` faz `UPDATE series SET deleted=TRUE`; os
  `watch_logs` permanecem (histórico), a série some das listagens.
- **Stats com ano vazio**: cada bloco de `get_stats` retorna zeros/listas vazias, nunca erro.
- **Fuzzy match ambíguo** ("Friends" → múltiplos resultados): retorna lista de candidatos com
  `tmdb_id`, `title` e `first_air_date`; não cria entrada sem confirmação.
- **Nota inválida** (ex.: 3.7, fora dos 0.5 em 0.5): rejeitada com mensagem clara na camada de tools.

---

## Requirements *(mandatory)*

### Functional Requirements

**Catálogo e diário (US1)**

- **FR-001**: O sistema MUST persistir séries em `series` com `id` (UUID em TEXT), `tmdb_id`,
  `imdb_id`, `title` NOT NULL, `title_original`, `normalizado` NOT NULL (fuzzy match), `first_air_date`,
  `last_air_date`, `series_status` (`no_ar`|`finalizada`|`cancelada`|`nao_lancada`), `network`,
  `seasons_count`, `episodes_count`, `episodes_watched` DEFAULT 0, `status` DEFAULT `'quero_assistir'`
  (`quero_assistir`|`assistindo`|`concluida`|`pausada`|`abandonada`), `rating` NUMERIC(2,1), `rating_source`,
  `poster_url`, `backdrop_url`, `overview`, `genres` TEXT[], `tags` TEXT[], `notes`, `date_started`,
  `date_finished`, `source`, `created_at`/`updated_at` TIMESTAMPTZ, `deleted` DEFAULT FALSE.
- **FR-002**: O sistema MUST registrar cada sessão em `watch_logs` (1 linha por sessão; rewatches
  permitidos, sem índice único): `id`, `series_id` FK, `series_title` (denorm), `watched_date` NOT NULL,
  `season_number`, `ep_start`, `ep_end`, `episodes_count`, `rating` NUMERIC(2,1), `review`, `source`,
  `created_at` — espelhando `watch_logs` da Marin (+ `season_number` e `review`).
- **FR-003**: O sistema MUST oferecer, em `agents/mai/tools.py`, as operações: `search_series`,
  `add_series`, `log_watch`, `get_currently_watching`, `get_watchlist`, `update_series_status`,
  `rate_series`, `set_notes`, `get_series_detail`, `get_upcoming`, `get_stats`, `get_watch_history`,
  `sync_metadata`, `delete_series`, `delete_watch_log` — retornando dicts com `{"status": "ok"|"error"}`.
- **FR-004**: As tools MUST resolver séries por fuzzy match (normalização sem acento, minúsculo —
  padrão `_find_book_by_query` da Frieren) e por `tmdb_id` direto; validar `rating` ∈ {0.5, 1.0, …, 5.0}
  (escala 0.5 a 5.0 em meios).
- **FR-005**: `log_watch` MUST atualizar `series.episodes_watched` (acumula `episodes_count`),
  marcar `episodes.watched=TRUE` para os episódios logados (quando existirem em cache), e inferir
  `date_started` (primeira sessão) e `date_finished` (quando `episodes_watched >= episodes_count`).

**Enriquecimento de metadados TMDB (US2)**

- **FR-006**: `agents/mai/metadata.py` MUST enriquecer séries via TMDB com **Bearer v4**
  (`Authorization: Bearer $TMDB_TOKEN`, igual à Akane): `GET /search/tv?query=...&language=pt-BR`
  (busca), `GET /tv/{tmdb_id}?language=pt-BR` (detalhe da série), `GET /tv/{tmdb_id}/season/{n}?language=pt-BR`
  (temporada + episódios). Imagens: `https://image.tmdb.org/t/p/w500` (pôster), `/w1280` (backdrop),
  `/w780` (still de episódio).
- **FR-007**: O módulo MUST popular `seasons` (upsert por `UNIQUE(series_id, season_number)`) e
  `episodes` (upsert por `UNIQUE(series_id, season_number, episode_number)`) com os metadados
  retornados por `/tv/{id}/season/{n}`. Temporada 0 ("Specials") MUST ser excluída.
- **FR-008**: O enriquecimento de episódios MUST implementar **skip-logic incremental**: pular o
  episódio quando ele já existe no banco E tem `air_date IS NOT NULL` E tem `still_url IS NOT NULL`
  E `air_date < NOW()::DATE`. Demais episódios: atualizar se existem, criar se novos.
- **FR-009**: O helper HTTP MUST implementar retry exponencial: MAX_RETRIES=3, RETRY_BACKOFF=2.0s,
  em 429 e 5xx e exceções de rede; 404 → None imediato; outros 4xx → loga body e retorna None.

**Agente Telegram (US1/US2/US3)**

- **FR-010**: A Makima MUST rotear pedidos sobre série/séries/episódio/temporada/assistindo/Mai
  para `mai_agent` (`agents/mai/agent.py`, singleton sem MCP, `gemini-2.5-flash`), registrada em
  `coordinator/agent.py:sub_agents` e descrita em `_MAKIMA_INSTRUCTION`.
- **FR-011**: A Mai MUST formatar respostas em **HTML** (nunca markdown), começar toda resposta com
  "Mai:", usar emojis com parcimônia (🐰 📺 🌙 ✨ 🎬), e chamar tools **antes** de responder
  (nunca inventar dados). Personalidade: serena, madura, analítica, humor seco — como uma atriz que
  estuda a estrutura dramática de cada temporada.

**Paridade e convenções**

- **FR-012**: `agents/mai/schema_pg.sql` MUST ser registrado em `scripts/setup_schemas.py` (lista
  `SCHEMA_FILES`); `CLAUDE.md` raiz MUST listar a Mai (domínio **séries de TV**) e aposentar o
  placeholder `agents/media/` — que fica dividido entre Marin (animes, 021) e Mai (séries, 022).
- **FR-013**: Toda lógica de domínio vive em `agents/mai/tools.py`; `webapp/backend/routers/series.py`
  (futuro) será fachada fina sobre `tools.py` — nunca lógica no router.

### Key Entities

- **Série** (`series`): identidade canônica; UUID TEXT, dedup por `tmdb_id`, soft delete;
  carrega `episodes_watched` (contador acumulado), `rating` 0.5–5.0, `status` PT-BR,
  `series_status` (estado de exibição do TMDB).
- **Temporada** (`seasons`): cache por temporada; UNIQUE(series_id, season_number); nome, contagem
  de episódios, data de estreia, pôster. *(Camada exclusiva da Mai.)*
- **Episódio** (`episodes`): cache best-effort de metadados; UNIQUE(series_id, season_number,
  episode_number); `watched` sincronizado pelo `log_watch`.
- **Log de sessão** (`watch_logs`): cada sessão de episódios assistidos; denormaliza `series_title`;
  carrega `season_number`, `ep_start`/`ep_end`, `review`; sem dedup único (rewatches intencionais).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `add_series("Severance")` cria linha em `series` com `tmdb_id=95396`, título, pôster
  e `status='quero_assistir'` — coberto por teste.
- **SC-002**: `log_watch("Severance", season_number=1, ep_start=1, ep_end=2)` cria linha em
  `watch_logs` e atualiza `series.episodes_watched=2` — coberto por teste.
- **SC-003**: `sync_metadata("Severance")` popula `seasons` e `episodes` com dados do TMDB; rodando
  2× sem mudanças → episódios antigos com still são pulados (skip-logic) — verificável.
- **SC-004**: TMDB ausente (`TMDB_TOKEN` não setado) → `add_series` ainda cria a série (sem pôster),
  `sync_metadata` retorna erro claro, sem traceback — verificável por teste.
- **SC-005**: `get_stats()` de um ano com séries retorna contagens e top gêneros; de um ano vazio
  retorna zeros/listas sem erro — coberto por teste.
- **SC-006**: `get_upcoming(days=7)` com ao menos 1 série `assistindo` e episódio agendado retorna
  esse episódio com data, título e still — verificável.
- **SC-007**: Makima roteia pedidos sobre série para `mai_agent`; a Mai chama a tool antes de
  responder e formata em HTML — verificável no Telegram.
- **SC-008**: `delete_series(query)` faz soft delete (`deleted=TRUE`); série some das listagens;
  `watch_logs` permanecem no banco — coberto por teste.
- **SC-009**: Temporada especial (`season_number=0`) não é criada em `seasons` durante
  `sync_metadata` — verificável por consulta SQL após sync.

---

## Assumptions

- **Single-user** e fuso `America/Sao_Paulo`, como o restante do projeto; sem multiusuário.
- **Schema novo**: fatia 022 introduz `agents/mai/schema_pg.sql` (4 tabelas), aplicado via container
  `makima-web` (`python -m scripts.setup_schemas`).
- **TMDB** é a única fonte de metadados. Auth = **Bearer v4** (`TMDB_TOKEN`), igual à Akane — não
  o v3 query-param do `series_sync` original (adaptação conscientemente documentada em `research.md`).
- **Sem fonte de histórico externo** nesta fatia. Trakt/Simkl/Serializd são candidatos para fatia
  futura; não há lógica de API deles referenciada no repo atual.
- **Front-end** (Shell React `pages/mai/`, router `/api/series/*`) fica para fatia futura.
  O `design-guide.md` já está pronto para guiar o Claude Design.
- A Mai é um **singleton sem MCP** (padrão Nami/Frieren/Akane/Marin); factory só para McpToolset.
- **Nota**: escala 0.5–5.0 (Letterboxd-style, consistente com Akane) — diferente da Marin (0–10 MAL).
- **Rewatches**: múltiplos `watch_logs` por série/episódio são intencionais (sem unique em `watch_logs`).
- **Specials excluídas**: temporadas `season_number=0` (nome "Specials") são puladas no sync
  (portado do series_sync) — não criadas em `seasons` nem em `episodes`.
- **`agents/media/`** (placeholder "séries + anime", Fase 5b) é aposentado por esta fatia: Marin
  (021) absorve os animes, Mai (022) absorve as séries de TV.
- **Env vars**: apenas `TMDB_TOKEN` (já existente). Nenhuma var nova de terceiros nesta fatia.

---

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                                          |
|---------------------|-------|------|--------|----------------------------------------------------------------|
| Goal Clarity        | 0.91  | 0.75 | ✓      | Agente Telegram + schema + TMDB sync; medíveis por SCs         |
| Boundary Clarity    | 0.88  | 0.70 | ✓      | Front-end explicitamente fora; Trakt/sync externo fora         |
| Constraint Clarity  | 0.85  | 0.65 | ✓      | PostgreSQL, Bearer v4, 4 tabelas, 0.5–5.0, sem MCP, sem OAuth |
| Acceptance Criteria | 0.87  | 0.70 | ✓      | 9 SCs pass/fail + cenários por 3 US + edge cases              |
| **Ambiguity**       | 0.13  | ≤0.20| ✓      | Decisões principais fechadas no brainstorm                     |

---

*Phase: 022-mai-series*
*Spec created: 2026-06-13*
*Next step: plan-phase → execução (schema → metadata.py → tools → agent → coordinator wiring)*
