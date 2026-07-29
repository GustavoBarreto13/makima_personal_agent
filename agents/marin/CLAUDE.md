# CLAUDE.md — agents/marin

## O que é este agente

**Marin** é o agente de catálogo de animes do sistema Makima.
Inspirada em Marin Kitagawa de *Sono Bisque Doll wa Koi wo Suru* — gyaru doce, sem filtro,
apaixonada por anime e cosplay. Entusiasta genuína, acolhe qualquer gosto sem julgamentos.

Responsabilidades:
- Gerenciar catálogo de animes (watchlist + em progresso + completo + pausado + abandonado)
- Registrar sessões de episódios assistidos com nota, data e range de episódios
- Enriquecer metadados via Jikan (MAL) + AniList + ARM + TMDB (via `metadata.py`)
- Sincronizar lista do MyAnimeList via OAuth PKCE (via `mal_sync.py`)
- Gerar estatísticas anuais (episódios, horas, gêneros, estúdios, heatmap)
- Exibir schedule de lançamentos dos animes em progresso

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
marin_agent (Agent ADK — singleton, sem MCP)
    ├── tools.py  → PostgreSQL (catálogo, diário, episódios)
    ├── tools.py  → Jikan + AniList + ARM + TMDB via metadata.py
    └── tools.py  → MAL API v2 via mal_sync.py

Webapp (/animes/*)
    ↓
webapp/backend/routers/animes.py  (fachada fina)
    └── agents/marin/tools.py     (ÚNICA dona da lógica de negócio)
```

**Marin é singleton** — não usa `McpToolset`, portanto não precisa de factory function.
Instância global `marin_agent` em `agent.py`, importada em `coordinator/agent.py`.

---

## Banco de dados PostgreSQL

### Tabela `anime`

Catálogo principal de animes.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK gerada com `str(uuid.uuid4())` |
| `mal_id` | INTEGER | ID no MyAnimeList — para dedup do sync |
| `anilist_id` | INTEGER | ID no AniList (ARM bridging) |
| `tmdb_id` | INTEGER | ID no TMDB (para banner) |
| `title` | TEXT | Título principal (pt-BR ou romaji) |
| `title_english` | TEXT | Título inglês |
| `title_japanese` | TEXT | Título japonês |
| `normalizado` | TEXT | lowercase sem acentos — para fuzzy match |
| `media_type` | TEXT | `'tv'`, `'movie'`, `'ova'`, `'special'`, `'ona'` |
| `season` | TEXT | Ex.: `'Inverno 2024'` |
| `studio` | TEXT | Estúdio principal |
| `episodes_total` | INTEGER | Total de episódios (NULL se em andamento) |
| `episodes_watched` | INTEGER | Soma dos `episodes_count` de todos os watch_logs |
| `status` | TEXT | `'assistindo'`, `'completo'`, `'quero_assistir'`, `'pausado'`, `'abandonado'` |
| `airing_status` | TEXT | `'no_ar'`, `'finalizado'`, `'nao_lancado'` |
| `score` | NUMERIC(3,1) | Nota pessoal 0.0–10.0 (passo 0.5) |
| `poster_url` | TEXT | URL do pôster (Jikan) |
| `banner_url` | TEXT | URL do banner (TMDB backdrop) |
| `overview` | TEXT | Sinopse (AniList PT-BR ou Jikan EN) |
| `genres` | TEXT[] | Gêneros (array) |
| `tags` | TEXT[] | Tags pessoais |
| `notes` | TEXT | Anotações soltas |
| `date_started` | DATE | Data da primeira sessão (inferido automaticamente) |
| `date_finished` | DATE | Data da última sessão quando completo (inferido) |
| `source` | TEXT | `'jikan'`, `'mal_sync'`, `'manual'` |
| `mal_updated_at` | TIMESTAMPTZ | Timestamp `list_status.updated_at` do MAL — usado para delta sync |
| `local_updated_at` | TIMESTAMPTZ | Timestamp da última mutação LOCAL (log_watch/status/nota) — usado pelo pull para decidir o vencedor de um conflito de convergência (spec 053) |
| `deleted` | BOOLEAN | Soft delete — nunca apaga fisicamente |
| `created_at` | TIMESTAMPTZ | Criação do registro |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**Índice único parcial (dedup sync MAL):**
```sql
CREATE UNIQUE INDEX idx_anime_mal ON anime(mal_id) WHERE mal_id IS NOT NULL;
```

---

### Tabela `watch_logs`

Diário de sessões de episódios (1 sessão = 1 linha).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `anime_id` | TEXT | FK → `anime.id` |
| `anime_title` | TEXT | Desnormalizado (consultas sem JOIN) |
| `watched_date` | DATE | Data da sessão |
| `ep_start` | INTEGER | Primeiro episódio da sessão (opcional) |
| `ep_end` | INTEGER | Último episódio da sessão (opcional) |
| `episodes_count` | INTEGER | Quantidade de episódios (ep_end - ep_start + 1) |
| `rating` | NUMERIC(3,1) | Nota da sessão 0.0–10.0 (NULL = sem avaliação) |
| `notes` | TEXT | Observações da sessão |
| `source` | TEXT | `'manual'`, `'mal_sync'` |
| `created_at` | TIMESTAMPTZ | Criação do registro |

---

### Tabela `episodes`

Cache de episódios para schedule e rastreamento.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `anime_id` | TEXT | FK → `anime.id` |
| `number` | INTEGER | Número do episódio |
| `title` | TEXT | Título do episódio (Jikan) |
| `aired` | DATE | Data de exibição (Japão) |
| `synopsis` | TEXT | Sinopse do episódio |
| `thumbnail_url` | TEXT | Thumbnail do episódio |
| `airing_status` | TEXT | `'lancado'`, `'agendado'` |
| `watched` | BOOLEAN | Marcado como assistido |
| `watched_date` | DATE | Data em que foi marcado como assistido |

**Constraint único:**
```sql
UNIQUE (anime_id, number)
```

---

### Tabela `mal_sync_state`

Singleton que armazena tokens OAuth MAL e estado do último sync.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | Sempre 1 (constraint `CHECK (id = 1)`) |
| `access_token` | TEXT | Token de acesso MAL OAuth |
| `refresh_token` | TEXT | Token de refresh (persiste após expiração) |
| `expires_at` | TIMESTAMPTZ | Data de expiração do access_token |
| `last_sync_at` | TIMESTAMPTZ | Data do último sync delta bem-sucedido |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**FR-012 — Segurança crítica:** Tokens MAL NUNCA em arquivo `.env`. Sempre persistidos exclusivamente nesta tabela.

---

### Tabelas `anime_lists` / `anime_list_items` (spec 054)

Listas personalizadas de animes — mesma forma de `movie_lists`/`movie_list_items` da Akane.

| Campo | Tipo | Descrição |
|---|---|---|
| `anime_lists.id` | UUID | PK própria (gen_random_uuid) |
| `anime_lists.name` | TEXT | Nome da lista |
| `anime_lists.description` | TEXT | Descrição opcional |
| `anime_lists.accent` | TEXT | Cor de destaque (chave da paleta do frontend) |
| `anime_lists.ranked` | BOOLEAN | TRUE = lista ordenada (exibe posição) |
| `anime_list_items.anime_id` | TEXT | FK → `anime.id`, `ON DELETE CASCADE` |
| `anime_list_items.list_id` | UUID | FK → `anime_lists.id`, `ON DELETE CASCADE` |
| `anime_list_items.position` | INTEGER | Posição na lista (usada quando `ranked=TRUE`) |

PK composta `(anime_id, list_id)` — impede duplicata do mesmo anime na mesma lista.
Etiquetas (spec 054) **não** têm tabela própria — usam a coluna `anime.tags TEXT[]` já
existente no schema desde a fatia 021, normalizada por `_norm_tag()` (minúsculas + sem
acento, preserva espaços — mais leve que `_norm()`, que também remove pontuação).

---

## Integrações externas

### Jikan (MAL unofficial API)
- **Base URL**: `https://api.jikan.moe/v4` — sem chave de API
- **Rate limit**: `metadata.py` usa `JIKAN_DELAY = 1.2` segundos de espera entre chamadas
- **Endpoints usados**: `/anime`, `/anime/{id}`, `/anime/{id}/episodes`
- **Blacklist de episódios**: `MAL_EPISODE_BLACKLIST = frozenset({21})` — One Piece com 1000+ eps não popula a tabela `episodes`

### AniList + ARM
- **AniList**: GraphQL `https://graphql.anilist.co` — sinopse PT-BR, anilist_id
- **ARM**: `https://arm.haglund.dev/api/v2/ids` — bridging MAL ID → AniList ID + TMDB ID
- **TMDB**: api_key v3 (`TMDB_API_KEY`) — banner/backdrop + thumbnails de episódio (`tmdb_get_episode_thumbnail`, chamado dentro de `enrich_anime`)

### MAL API v2
- **Base URL**: `https://api.myanimelist.net/v2`
- **Auth**: OAuth2 PKCE S256 — gerenciado por `agents/marin/mal_auth.py`
- **Token refresh**: automático via `MALAuth.get_valid_token()` — atualiza `mal_sync_state` no banco
- **Bootstrap**: `python -m scripts.authorize_mal` (interativo, uma única vez)
- **Pull**: `mal_sync.sync_mal(full=False)` — delta, agendado a cada 6h (job `marin_mal_sync`)
- **Push (spec 053)**: `mal_sync.push_list_status(mal_id, status?, score?, num_watched_episodes?)`
  (`PATCH /v2/anime/{mal_id}/my_list_status`) e `mal_sync.push_delete(mal_id)`
  (`DELETE /v2/anime/{mal_id}/my_list_status`) — best-effort, chamados só pelas 5
  tools de mutação local (`log_watch`, `update_anime_status`, `rate_anime`,
  `delete_watch_log`, `delete_anime`), nunca pelo pull

---

## Escala de nota

| Domínio | Escala | Passo |
|---|---|---|
| Marin (MAL) | 0.0–10.0 | 0.5 |
| Akane (Letterboxd) | 0.5–5.0 | 0.5 |

Score 0 = remover avaliação (NULL no banco).

---

## Tools públicas

| Tool | Descrição |
|---|---|
| `search_anime(query, limit=5)` | Busca no Jikan por título — sem gravar; marca in_catalog |
| `add_anime(mal_id)` | Enriquece (Jikan+AniList+ARM+TMDB) + upserta em `anime` + popula `episodes` |
| `log_watch(anime_id_or_query, ep_start?, ep_end?, watched_date?, rating?, notes?)` | Insere watch_log, avança episodes_watched, marca episodes.watched, infere date_started/date_finished |
| `delete_watch_log(log_id)` | Remove sessão do diário e recalcula episodes_watched |
| `update_anime_status(query, status)` | UPDATE anime.status |
| `rate_anime(query, score)` | UPDATE anime.score (valida 0–10, passo 0.5) |
| `delete_anime(query)` | UPDATE anime SET deleted=TRUE (soft delete) |
| `get_currently_watching()` | SELECT anime WHERE status='assistindo' |
| `get_watchlist()` | SELECT anime WHERE status='quero_assistir' |
| `get_watch_history(query?, limit=50)` | watch_logs com JOIN anime (todos ou por anime) |
| `get_anime_details(query)` | anime + next_episode + episodes (12 primeiros) + recent_logs |
| `get_airing_schedule(days=14)` | episodes WHERE aired ≤ hoje+N AND anime.status='assistindo' |
| `get_stats(year?)` | total_animes, total_episodes, total_hours, avg_score, top_genres, top_studios, monthly[12], by_status, heatmap, highlight |
| `get_home()` | Todos os blocos da HomeScreen — last_session, currently_watching, recent_logs, upcoming_episodes, watchlist_preview, counts, episodes_7d, avg_score_year |
| `sync_mal(full=False)` | Delta (ou full) pull do MAL via `mal_sync.sync_mal()` |
| `set_anime_notes(query, notes)` | Salva o Caderno da Marin — anotações soltas por anime (spec 054) |
| `get_lists()` / `get_list(list_id)` | Lista todas as coleções / detalhe + animes de uma (spec 054) |
| `create_list(name, description?, accent?, ranked?)` | Cria coleção nova (spec 054) |
| `update_list(list_id, **kwargs)` / `delete_list(list_id)` | Atualiza / remove coleção (spec 054) |
| `add_to_list(list_id, anime_id, position?)` / `remove_from_list(list_id, anime_id)` | Gerencia membros da coleção (spec 054) |
| `get_tags()` | Nuvem de etiquetas com contagem (spec 054) |
| `add_tag(query, tag)` / `remove_tag(query, tag)` | Etiqueta/desetiqueta um anime, normalizado (spec 054) |
| `get_rewind(year?)` | Retrospectiva anual — camada fina sobre `get_stats` (spec 054) |

### Helpers privados (não chamados pelo ADK)

| Função | Descrição |
|---|---|
| `_norm(s)` | Fuzzy normalization: lower + NFD + strip acentos + strip pontuação |
| `_poster_key(title)` | Hash do título → 1 de 12 paletas tipográficas kawaii |
| `_find_anime_by_query(query)` | UUID → mal_id numérico → ILIKE normalizado |
| `_validate_score(score)` | Valida 0–10, passo 0.5 |
| `_norm_tag(tag)` | Normaliza etiqueta para dedup: minúsculas + sem acento, preserva espaços (spec 054) |
| `_ok(**kwargs)` | `{"status": "ok", ...}` |
| `_err(message)` | `{"status": "error", "message": ...}` |

---

## Paletas tipográficas

Quando `poster_url = NULL`, o frontend usa uma paleta OKLCH determinística por hash do título.
12 paletas: `magenta`, `violet`, `cyan`, `emerald`, `amber`, `sunset`, `indigo`, `rose`, `teal`, `lime`, `plum`, `sky`.

---

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL compartilhado — todas as tools |
| `MAL_CLIENT_ID` | sim | Client ID do app MAL (criar em myanimelist.net/apiconfig) |
| `MAL_CLIENT_SECRET` | sim | Client Secret do app MAL |
| `TMDB_API_KEY` | não (fallback gracioso) | API key v3 — banner/backdrop |

---

## Personalidade e formatação

Marin sempre começa com `Marin:`. Tom gyaru animado, sem filtro, entusiasta de anime.

Frases características:
- "Que incrível!! A abertura já me deixou obcecada na primeira vez."
- "Esse personagem tem um design INSANO, dá vontade de fazer cosplay!!"
- "Espera, você ainda não viu esse?! Você PRECISA assistir agora!!"

Nunca usa markdown. Apenas HTML (`<b>`, `<i>`) e emojis.

Emojis: 📺 (anime), ✨ (novo), ⭐ (nota), 🎀 (favorito), 📅 (agendado), 🎌 (japonês), 💖 (adorei).

---

## Integração com o coordinator

```python
# coordinator/agent.py
from agents.marin.agent import marin_agent

sub_agents=[..., akane_agent, marin_agent]
```

Keywords de roteamento em `coordinator/main.py`:
```python
if any(w in t for w in ["anime", "animes", "episódio", "temporada", "watchlist",
                          "mal", "assistindo", "watch", "marin", "anilist",
                          "opening", "ending", "fansub", "simulcast"]):
    return "animes"
```

Sessão separada por domínio: `{chat_id}_animes` — histórico de anime não contamina tarefas ou filmes.

---

## Sincronização bidirecional com o MAL (spec 053)

Local e MAL funcionam como espelhos: mudanças em qualquer um dos dois lados aparecem
no outro em até um ciclo de sync (6h) ou imediatamente via push.

- **Push** (local → MAL): as 5 tools de mutação local (`log_watch`,
  `update_anime_status`, `rate_anime`, `delete_watch_log`, `delete_anime`) chamam
  `mal_sync.push_list_status`/`push_delete` no final da transação, só se
  `anime.mal_id` estiver preenchido. Sempre best-effort — falha nunca desfaz a
  operação local (`_push_best_effort` em `tools.py` engole qualquer exceção).
- **Pull** (MAL → local): `mal_sync._upsert_mal_entry` nunca mais sobrescreve
  `anime.episodes_watched` direto — cria uma **sessão de ajuste** em `watch_logs`
  (`source='mal_sync'`) cobrindo o progresso novo, do mesmo jeito que uma sessão
  manual, para que o contador continue sempre derivável da soma das sessões.
- **Anti-eco**: não existe coluna de "origem por mutação". O pull escreve direto
  no banco (nunca chama as tools públicas), então nunca dispara push. E como o
  pull só escreve quando o valor do MAL difere do valor local atual, um ciclo
  sem mudanças novas não escreve nada — a idempotência nasce da própria
  comparação, sem precisar de uma tabela de dedup.
- **Conflito simultâneo** (status/nota mudou dos dois lados entre dois syncs):
  resolvido por `anime.local_updated_at` (só tocada pelas mutações locais) vs o
  `list_status.updated_at` que o MAL reporta para aquela entrada — quem for mais
  recente vence. Progresso de episódios usa uma regra mais simples: "maior
  progresso vence" (o pull só avança, nunca reduz `episodes_watched`).
- **Import de anime novo**: `_insert_enriched_anime` chama o mesmo `enrich_anime`
  (Jikan+AniList+ARM+TMDB) que `tools.add_anime` usa — animes vindos do pull não
  entram mais "pelados" (sem pôster/gêneros/episódios).
- **Soft-delete não ressuscita**: se o `mal_id` de uma entrada do MAL corresponde
  a um anime local com `deleted=TRUE`, o pull ignora silenciosamente (loga e
  segue) em vez de tentar recriar.

## Integração com o Calendar Hub (Kaguya)

`agents/marin/calendar_provider.py` expõe `list_calendar_events` e é registrado como fonte
`"marin"` no Calendar Hub (`agents/kaguya/calendar_hub.py`) — episódios agendados dos animes em
progresso aparecem no calendário unificado do webapp, ao lado dos eventos do Google Calendar e
das demais fontes cross-agent. Somente leitura (mesmo padrão da Akane/Nami).

## Webapp

- **Router**: `webapp/backend/routers/animes.py` — fachada fina, todos com `Depends(require_user)`
- **Shell React**: `webapp/frontend/src/pages/marin/` — rota `/animes/*`
- **CSS**: tokens OKLCH em `.marin-shell`, 4 acentos (default: Neon/cyan), modo claro/escuro
- **Paletas tipográficas**: 12 variantes com `[data-palette='X']` no CSS
- **Estrelas**: escala 10 — cor `--star: oklch(0.85 0.15 86)` (independente do acento)
