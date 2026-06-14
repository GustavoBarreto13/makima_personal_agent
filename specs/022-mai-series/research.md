# Phase 0 — Research: Séries de TV (022-mai-series)

Decisões arquiteturais desta fatia. Referências primárias: `n8n-python-scripts/series_sync/main.py`
(lógica de API TMDB para TV), `agents/akane/tools.py` (padrão de auth e retry do projeto), `agents/marin/`
(irmão mais próximo — episódio a episódio, PostgreSQL, singleton sem MCP).

---

## R1 — Storage: PostgreSQL (não Notion)

**Decisão**: PostgreSQL via `agents/db.py` (`get_conn`, `run_select`, `run_dml`).

**Contexto**: o `series_sync` original (n8n) usava Notion como sink — três tipos de page
(Show/Season/Episode) em um único database Notion, com relações entre elas. Esse design serviu
para integração com o n8n via automação Notion, mas é incompatível com o stack da casa.

**Por que PostgreSQL**:
- Padrão universal do projeto (Nami, Kaguya, Frieren, Akane, Marin).
- `agents/db.py` já tem o driver (`psycopg2-binary`) e helpers. Zero deps novas.
- Schema relacional com FKs e índices é mais eficiente que queries Notion paginadas.
- Transações atômicas para `log_watch` (update `series` + insert `watch_logs` em uma transação).

**O que é reaproveitado do series_sync**: a *lógica de acesso à API TMDB* — endpoints, skip-logic
incremental, dedup de temporadas/episódios, rate limits. O sink muda; a API layer permanece.

---

## R2 — TMDB: autenticação Bearer v4 (não query-param v3)

**Decisão**: `Authorization: Bearer $TMDB_TOKEN` — igual à Akane, diferente do series_sync original.

**Contexto**: o `series_sync` usa autenticação v3 via query param:
```python
# series_sync/main.py (padrão ORIGINAL — NÃO usar)
def _tmdb_params(extra=None):
    return {"api_key": _TMDB_KEY, **(extra or {})}
```

O projeto Makima adotou Bearer v4 (mais seguro, token não exposto em logs de URL):
```python
# Padrão do PROJETO (Akane) — usar este
def _tmdb_headers() -> dict:
    token = os.environ.get("TMDB_TOKEN", "")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}
```

**Compatibilidade**: ambas as formas funcionam com a mesma `TMDB_TOKEN` — a distinção é só
de como o token é enviado. A env var é `TMDB_TOKEN` em ambos os casos. Nenhuma mudança de
credencial necessária.

---

## R3 — TMDB: endpoints para TV (portados do series_sync)

**Base URL**: `https://api.themoviedb.org/3`
**Imagens**: `https://image.tmdb.org/t/p/{size}/{path}` onde `size`:
- `w500` → pôster da série/temporada
- `w1280` → backdrop
- `w780` → still de episódio
- `original` → qualidade máxima (evitar em produção — bandwidth)

**Endpoints principais**:

| Endpoint | Parâmetros | Uso |
|---|---|---|
| `GET /search/tv` | `query`, `first_air_date_year` (opcional) | Busca de série por título |
| `GET /tv/{id}` | `language=pt-BR` | Detalhe da série (nome, status, rede, contagens) |
| `GET /tv/{id}/season/{n}` | `language=pt-BR` | Episódios de uma temporada |

**Campos relevantes do `/tv/{id}`** (mapeamento → coluna da tabela `series`):
```
name              → title
original_name     → title_original
id                → tmdb_id
external_ids.imdb_id → imdb_id
first_air_date    → first_air_date (DATE)
last_air_date     → last_air_date  (DATE)
status            → series_status  (mapeado: ver R6)
networks[0].name  → network
number_of_seasons → seasons_count
number_of_episodes→ episodes_count
overview          → overview (truncar em 2000 chars)
genres[].name     → genres (TEXT[])
poster_path       → poster_url  (prefix: image.tmdb.org/t/p/w500)
backdrop_path     → backdrop_url (prefix: /w1280)
```

**Campos relevantes do `/tv/{id}/season/{n}`** (mapeamento → tabela `seasons` e `episodes`):
```
season_number     → seasons.season_number
name              → seasons.name
episode_count     → seasons.episode_count
air_date          → seasons.air_date
overview          → seasons.overview
poster_path       → seasons.poster_url (prefix /w500)

episodes[]:
  episode_number  → episodes.episode_number
  name            → episodes.title
  air_date        → episodes.air_date
  overview        → episodes.overview (truncar 2000)
  still_path      → episodes.still_url (prefix /w780)
```

**Rate limits**: TMDB não publica limites explícitos, mas o series_sync usa `TMDB_DELAY=0.3s`
entre chamadas. Manter esse delay em `metadata.py` para evitar 429.

---

## R4 — Modelo de dados: 4 tabelas (Show → Season → Episode)

**Decisão**: 4 tabelas PostgreSQL com hierarquia Show→Season→Episode + diário `watch_logs`.

**Mapeamento do modelo Notion (series_sync) → PostgreSQL (Mai)**:

| Notion Page Type | Tabela PostgreSQL | Observação |
|---|---|---|
| `Type=Show` | `series` | PK TEXT/UUID; dedup por `tmdb_id` |
| `Type=Season` | `seasons` | `UNIQUE(series_id, season_number)` |
| `Type=Episode` | `episodes` | `UNIQUE(series_id, season_number, episode_number)` |
| *(não existia)* | `watch_logs` | Diário do usuário — novo em relação ao series_sync |

**Por que manter seasons como tabela separada** (e não só `episodes`):
- Exibição em acordeão: o front precisa de metadados de temporada (nome, poster, contagem) sem
  carregar todos os episódios.
- Progress por temporada: contar `episodes_watched` por `season_number` sem GROUP BY pesado.
- Sincronização incremental: saber se uma temporada já foi processada antes de buscar seus eps.

**Diferença em relação à Marin**: a Marin tem `episodes` mas não tem `seasons` (anime não tem
camada de temporada relevante — é flat, S1 = série inteira). Mai adiciona essa camada intermediária,
tornando-a a mais rica hierarquicamente entre as três agentes de mídia.

---

## R5 — Skip-logic incremental (portado do series_sync)

**Decisão**: manter o skip-logic do series_sync para sincronização eficiente de episódios.

**Lógica original** (série_sync `process_show`):
```python
# Pular episódio quando:
# 1. já existe no banco (has_existing)
# 2. tem air_date registrado
# 3. tem still (poster) registrado
# 4. air_date < hoje (já foi ao ar e tem imagem — não vai mudar mais)
if has_existing and existing["air_date"] and existing["has_still"] and air_date_past:
    skipped += 1
    continue
```

**Adaptação para PostgreSQL**: em vez do check Notion, consultar `episodes` table:
```python
# SELECT id, air_date, still_url FROM episodes
# WHERE series_id=$1 AND season_number=$2 AND episode_number=$3
# → se existe, air_date IS NOT NULL, still_url IS NOT NULL, air_date < hoje: pular
```

**Benefício**: re-sync de séries longas (ex.: Grey's Anatomy com 400+ eps) é rápido — apenas
episódios novos/sem still são processados. Episódios agendados (air_date > hoje, sem still) são
sempre re-sincronizados (data de exibição e still podem mudar antes do lançamento).

---

## R6 — Mapeamento de status TMDB → PT-BR

**`series.series_status`** (estado de exibição — campo do TMDB, não do usuário):

| TMDB `status` | `series_status` PT-BR | Significado |
|---|---|---|
| `"Returning Series"` | `no_ar` | Em exibição, renovada |
| `"In Production"` | `no_ar` | Produção em andamento |
| `"Pilot"` | `no_ar` | Piloto exibido, pendente renovação |
| `"Ended"` | `finalizada` | Encerrou normalmente |
| `"Canceled"` | `cancelada` | Cancelada antes do fim planejado |
| `"Planned"` | `nao_lancada` | Anunciada, ainda não começou |

**`series.status`** (estado do usuário — gerenciado pelo próprio usuário, não pelo TMDB):

| Valor | Descrição |
|---|---|
| `quero_assistir` | Watchlist |
| `assistindo` | Assistindo ativamente |
| `concluida` | Terminou de assistir |
| `pausada` | Pausado temporariamente |
| `abandonada` | Desistiu |

---

## R7 — Escala de nota: 0.5–5.0 (Letterboxd-style)

**Decisão**: `rating NUMERIC(2,1)`, valores ∈ {0.5, 1.0, 1.5, …, 5.0} — igual à Akane.

**Contexto das opções**:
- **0.5–5.0** (Letterboxd): 10 meios estrela (5 estrelas com meia). Padrão da Akane (filmes).
  Familiar para usuário do Letterboxd.
- **0.0–10.0** (MAL/AniList): escolhido pela Marin (escala nativa do MAL). 21 valores.
- **1–10 inteiro**: sem meia nota.

**Por que 0.5–5.0 para séries** (e não 0–10 como a Marin):
- Séries de TV têm mais parentesco com filmes (Akane) do que com anime (Marin) na forma como
  são avaliadas culturalmente no Brasil — Letterboxd é a referência familiar.
- Consistência interna: as duas agentes de "streaming ocidental" (filmes + séries) usam a mesma
  escala. A Marin (anime) usa a escala nativa do MAL.
- Validação simples: `rating % 0.5 == 0 and 0.5 <= rating <= 5.0`.

---

## R8 — Sem fonte de histórico externo nesta fatia

**Decisão**: sem OAuth, sem sync de lista externa nesta fatia. Diário = 100% manual via Telegram.

**Candidatos avaliados e deferidos**:

| Tracker | OAuth | API | Notas |
|---|---|---|---|
| **Trakt** | OAuth 2.0 (code flow) | REST, bem documentada | Mais completo; seria o "MAL das séries" |
| **Simkl** | OAuth 2.0 | REST | Similar ao Trakt; menor adoção |
| **Serializd** | Não documentado | Nenhuma API pública | Mais focado em reviews estilo Letterboxd |

**Por que deferir**:
- Nenhum desses tem lógica de API referenciada no repositório atual (ao contrário do MAL/AniList
  referenciados via `mal_sync` e `anime_sync`).
- O MVP de valor do agente (catálogo + diário + TMDB) não depende do sync.
- Adicioná-los exigiria uma `research.md` dedicada (R0–R8 de OAuth, endpoints, delta-sync, etc.)
  — escopo de uma fatia separada.

**Impacto na env**: **zero** variáveis novas nesta fatia. `TMDB_TOKEN` já existe no container.

---

## Resumo das decisões

| # | Tema | Decisão |
|---|---|---|
| R1 | Storage | PostgreSQL via `agents/db.py` (4 tabelas: `series`, `seasons`, `episodes`, `watch_logs`) |
| R2 | TMDB auth | Bearer v4 (`Authorization: Bearer $TMDB_TOKEN`) — igual à Akane |
| R3 | Endpoints TMDB | `/search/tv`, `/tv/{id}`, `/tv/{id}/season/{n}`; imagens `image.tmdb.org` |
| R4 | Modelo dados | Show→Season→Episode + diário `watch_logs`; `seasons` é camada exclusiva da Mai |
| R5 | Skip-logic | Episódio com air_date + still + air_date < hoje é pulado no re-sync (incremental) |
| R6 | Status TMDB | `series_status`: no_ar/finalizada/cancelada/nao_lancada; `status` usuário: PT-BR |
| R7 | Escala de nota | 0.5–5.0 (Letterboxd, meios estrela) — consistente com Akane, ≠ Marin (0–10) |
| R8 | Fonte externa | Nenhuma nesta fatia; Trakt deferido; zero env vars novas |
