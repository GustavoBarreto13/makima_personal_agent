# CLAUDE.md — agents/akane

## O que é este agente

**Akane** é o agente de cinemateca pessoal do sistema Makima.
Inspirada em Akane Kurokawa de *Oshi no Ko* — atriz analítica, metódica, perfeccionista.

Responsabilidades:
- Gerenciar catálogo pessoal de filmes (watchlist + watched) com status e metadados
- Registrar sessões de assistência com nota, review, tags e flag de rewatch
- Enriquecer metadados via TMDB API (pôster, diretor, gênero, runtime)
- Sincronizar com Letterboxd (RSS automático + importação CSV de histórico)
- Gerar estatísticas, Rewind anual e heatmap de sessões
- Gerenciar listas/coleções, etiquetas e Cofre de conteúdos (Onda 5)
- Criar lembretes de sessão via cross-agent com a Kaguya

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
akane_agent (Agent ADK — singleton, sem MCP)
    ├── tools.py     → PostgreSQL (catálogo, diário, listas, cofre)
    └── tools.py     → TMDB API v3 (metadados e pôsteres)

Webapp (/movies/*)
    ↓
webapp/backend/routers/movies.py  (fachada fina)
    └── agents/akane/tools.py     (ÚNICA dona da lógica de negócio — FR-016)

Scripts de sync
    ├── scripts/sync_letterboxd.py   (RSS diário automático)
    └── scripts/import_letterboxd_csv.py  (importação de histórico)
```

**Akane é singleton** — não usa `McpToolset`, então não precisa de factory function.
Instância global `akane_agent` em `agent.py`, importada em `coordinator/agent.py`.

---

## Banco de dados PostgreSQL

### Tabela `movies`

Catálogo principal de filmes.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK gerada com `str(uuid.uuid4())` |
| `tmdb_id` | INTEGER | ID do TMDB — para buscar pôster e detalhes |
| `imdb_id` | TEXT | IMDb ID (opcional) |
| `letterboxd_uri` | TEXT | URL do filme no Letterboxd — chave de dedup do sync |
| `title` | TEXT | Título (normalizado) |
| `normalizado` | TEXT | lowercase sem acentos — para fuzzy match |
| `year` | INTEGER | Ano de lançamento |
| `director` | TEXT[] | Lista de diretores |
| `genres` | TEXT[] | Lista de gêneros |
| `runtime` | INTEGER | Duração em minutos |
| `overview` | TEXT | Sinopse |
| `poster_url` | TEXT | URL do pôster TMDB (`w500`) |
| `backdrop_url` | TEXT | URL do backdrop TMDB (`w1280`) |
| `poster_palette` | TEXT | Paleta tipográfica fallback (14 opções, hash do título) |
| `status` | TEXT | `'watchlist'` ou `'watched'` |
| `rating` | NUMERIC(2,1) | Nota pessoal 0.5–5.0 (passo 0.5) |
| `rating_source` | TEXT | `'own'` ou `'letterboxd'` |
| `liked` | BOOLEAN | Coração (❤️) |
| `tags` | TEXT[] | Etiquetas pessoais |
| `notes` | TEXT | Anotações soltas |
| `last_watched_date` | DATE | Data da sessão mais recente |
| `times_watched` | INTEGER | Total de sessões (incluindo rewatches) |
| `source` | TEXT | `'manual'`, `'letterboxd_rss'`, `'letterboxd_csv'` |
| `deleted` | BOOLEAN | Soft delete — nunca apaga fisicamente |
| `created_at` | TIMESTAMPTZ | Criação do registro |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**Índice único parcial (dedup RSS/CSV):**
```sql
CREATE UNIQUE INDEX idx_movies_letterboxd
ON movies(letterboxd_uri) WHERE letterboxd_uri IS NOT NULL;
```

---

### Tabela `diary_entries`

Registro de sessões de assistência (1 sessão = 1 linha).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `movie_id` | TEXT | FK → `movies.id` |
| `movie_title` | TEXT | Desnormalizado (para consultas sem JOIN) |
| `watched_date` | DATE | Data da sessão |
| `rating` | NUMERIC(2,1) | Nota desta sessão (pode diferir da nota final) |
| `rewatch` | BOOLEAN | Se é uma revisão (inferido automaticamente) |
| `review` | TEXT | Texto da review |
| `tags` | TEXT[] | Etiquetas da sessão |
| `letterboxd_uri` | TEXT | URI do Letterboxd (para dedup do sync) |
| `source` | TEXT | `'manual'`, `'letterboxd_rss'`, `'letterboxd_csv'` |
| `created_at` | TIMESTAMPTZ | Criação do registro |

**Índice único parcial (dedup de sessão RSS/CSV):**
```sql
CREATE UNIQUE INDEX idx_diary_dedup
ON diary_entries(letterboxd_uri, watched_date) WHERE letterboxd_uri IS NOT NULL;
```

### Contexto da sessão (fase 063)

Cada `diary_entries` pode ter `watch_location_id` opcional para `movie_watch_locations`. O local é reutilizável e classificado como `cinema` ou `streaming`; duplicatas são bloqueadas por `normalizado`. Acompanhantes não são elenco: usam `person_links` da Komi com `entity_type='movie_diary_entry'`, podendo variar em cada rewatch. `log_watch` e `update_diary_entry` validam e gravam esses vínculos na mesma transação.

---

### Tabelas auxiliares

| Tabela | Propósito |
|---|---|
| `movie_lists` | Listas/coleções temáticas |
| `movie_list_items` | N:M entre lists e movies (com position) |
| `movie_vault_items` | Cofre de conteúdos ligados a um filme (vídeos, artigos, essays) |
| `movie_people` | Pessoas associadas a um filme (diretor, ator, etc.) |
| `movie_favorites` | Vitrine de até 4 filmes favoritos (com position) |

---

## TMDB API

- **Base URL**: `https://api.themoviedb.org/3`
- **Auth**: api_key v3 (`TMDB_API_KEY` — variável de ambiente)
- **Idioma**: `_TMDB_LANG = "en-US"` (spec 050) — todos os metadados vêm em inglês. Filmes
  gravados antes dessa mudança continuam em português até "Buscar Dados" ser acionado neles
  (sem migração em massa).
- **Endpoints usados**: `/search/movie`, `/movie/{id}`, `/movie/{id}/credits`
- **Imagens**: `https://image.tmdb.org/t/p/w500` (pôster) e `/w1280` (backdrop)
- **Retry**: 3 tentativas com backoff exponencial (2s, 4s, 8s)
- **Fallback gracioso (SC-005)**: API fora → filme criado sem `poster_url`, sem exceção

---

## Pôster tipográfico (fallback)

Quando `poster_url` é NULL (TMDB fora ou filme sem pôster), o frontend exibe um
pôster gerado com CSS a partir de 14 paletas — determinístico por hash do título.

14 paletas disponíveis: `noir`, `ember`, `rose`, `neon`, `teal`, `gold`, `ink`,
`blood`, `forest`, `dusk`, `bone`, `slate`, `wine`, `sea`.

O campo `poster_palette` em `movies` armazena a paleta calculada na inserção.

---

## Regras de negócio

### Rating
- Intervalo: `[0.5, 5.0]`, passo `0.5` (como o Letterboxd)
- `rating_source='own'` quando definida pelo usuário; `'letterboxd'` quando vem do sync

### Rewatch
- `rewatch` em `diary_entries` é inferido automaticamente:
  - 1ª sessão: `rewatch=False`
  - Sessões subsequentes: `rewatch=True`
- `movies.times_watched` incrementa em cada `log_watch`

### Soft delete
- `delete_movie(id)` apenas marca `deleted=TRUE`
- `diary_entries` do filme são preservadas (histórico imutável)

### Favoritos
- `movie_favorites` armazena no máximo 4 filmes
- `set_favorites()` é atômico: delete-all + insert em uma transação
- Apenas filmes com `status='watched'` podem ser favoritos

### Idempotência (sync Letterboxd)
- **Dedup de filme**: `letterboxd_uri` com índice parcial UNIQUE; se não encontrar, cai para
  `_resolve_movie_identity()` (spec 050, FR-010) — `tmdb_id` e, por último, título
  normalizado + ano. Encontrar um filme por qualquer uma dessas vias **funde** (anexa o
  `letterboxd_uri` que faltava) em vez de criar um registro novo — evita duplicar um filme
  cadastrado manualmente que a importação/sync reencontra depois. Usada tanto por `add_movie`
  quanto por `upsert_movie_from_letterboxd`.
- **Dedup de sessão**: `(letterboxd_uri, watched_date)` com índice parcial UNIQUE
- Rodar o sync 2× não cria duplicatas (SC-003)
- Importar o mesmo CSV 2× não cria duplicatas (SC-004)
- **Ordem no mesmo dia (spec 050, FR-011)**: `created_at` de `diary_entries` deixou de ser
  incidental — o importador CSV grava um valor explícito e incremental por linha lida, para
  que `ORDER BY watched_date DESC, created_at DESC` reflita a ordem real do export. A
  interface permite reordenar via `reorder_diary_entries()` quando o export vier errado.

---

## Correções de bugs conhecidos (spec 050, follow-up)

- **`_process_ratings_fallback` (renomeada `_process_ratings`) fabricava sessão de
  diário**: qualquer filme presente em `ratings.csv` sem sessão em `diary.csv` virava uma
  entrada em `diary_entries` usando a **data de publicação da nota** como se fosse a data
  de assistência — poluía o Diário com sessões que nunca existiram, misturando dado de
  catálogo (avaliação rápida) com dado de diário (sessão real). Corrigido: `ratings.csv`
  sem sessão correspondente agora só grava a nota no filme (`movies.rating`, preenchendo
  só o que estava vazio) — nunca cria `diary_entries`. Diário passou a ser estritamente o
  que vem do `diary.csv`.
- **`reviews.csv` era efetivamente ignorado**: `_process_reviews` chamava
  `upsert_movie_from_letterboxd`, que faz dedup de sessão por `(letterboxd_uri,
  watched_date)` e retornava cedo sem tocar em nada quando a sessão já existia (o caso
  normal — toda review pressupõe uma sessão já logada pelo `diary.csv`). Corrigido: nova
  função `backfill_diary_review()` localiza a sessão existente e preenche `review`/`tags`
  só onde estavam vazios; se não achar sessão correspondente, não cria nada (fiel à regra
  acima) e só loga um aviso.
- **Tags nunca chegavam ao banco**: `diary_entries.tags TEXT[]` existe no schema desde
  sempre, mas nem `_process_diary` lia a coluna "Tags" do CSV nem
  `upsert_movie_from_letterboxd` aceitava/gravava um parâmetro `tags`. Corrigido nos dois
  pontos — `diary.csv` e `reviews.csv` agora alimentam `diary_entries.tags`.
- **Migração dos dados já importados incorretamente**: script one-time
  `scripts/fix_letterboxd_fake_diary_sessions.py` (`--dry-run` por padrão, `--apply` remove
  de fato com backup JSON prévio) — compara `diary_entries` contra os pares
  `(letterboxd_uri, watched_date)` reais de `diary.csv`/`reviews.csv` e remove qualquer
  sessão fabricada pelo bug antigo, recalculando `times_watched`/`last_watched_date` dos
  filmes afetados.

## Correções de bugs conhecidos (spec 049)

- **`search_movie(q)`**: além de buscar no TMDB, agora consulta `movies` em lote por
  `tmdb_id` e inclui `local_id`/`in_catalog` em cada resultado — permite ao frontend
  ("Logar filme") registrar uma reassistida em vez de tentar recriar um filme já
  catalogado (que sempre falhava por violar o dedup de `add_movie`).
- **`_poster_palette(title)`**: usa `hashlib.md5` (não o `hash()` nativo do Python, que é
  salgado por processo via `PYTHONHASHSEED` e mudava a cada reinício do servidor).
- **`get_home()`**: `recent_activity` lê `liked` de `movies` (`m.liked`), não de
  `diary_entries` — a coluna não existe lá. O sparkline de 7 dias (`s7`/`s7_prev`) agora
  faz `JOIN movies` e exclui filmes soft-deletados (`m.deleted = FALSE`).
- **`get_rewind(year)`**: `top_people` exibe `p.name` (nome de exibição), não
  `p.normalizado` (forma de busca, minúscula e sem acento).
- **Histograma de notas** (Início e Rewind): o backend já produzia chaves `"1.0"`..`"5.0"`
  para notas inteiras (`str(r / 2)` em Python é sempre `float`); o frontend procurava
  `'1'`..`'5'` sem o `.0` — corrigido nos dois `screens/*Screen.tsx` (o array `keys` agora
  casa com o formato do backend, igual já era em `StatsScreen.tsx`).
- **Histograma de notas ambíguo em `get_home()`/`get_stats()`**: as duas queries faziam
  `JOIN diary_entries d ... movies m` e referenciavam `rating` sem qualificar o alias —
  como **as duas tabelas** têm coluna `rating`, o PostgreSQL recusava a query inteira com
  `42702 column reference "rating" is ambiguous`, derrubando a tela Início e Estatísticas
  com 500. Corrigido para `d.rating` (a nota é da sessão, não do filme).
- **Sync RSS do Letterboxd** (`scripts/sync_letterboxd.py`): a nota do feed passa por
  `_parse_rating` (reusada de `import_letterboxd_csv.py` — clamp `0.5..5.0`); a data de
  fallback (quando falta `watchedDate`) usa `email.utils.parsedate_to_datetime(pubDate)`
  (RFC-822, não ISO-8601 — o `pub_date_text[:10]` antigo nunca produzia uma data válida e a
  entrada era sempre descartada); indisponibilidade real do feed levanta
  `LetterboxdFetchError` (distinto de "feed OK, zero itens novos"), fazendo `run_sync`
  retornar `errors=1` — que já aciona o `raise` existente em
  `scheduler/jobs.py::run_letterboxd` e, com ele, o alerta padrão do scheduler no Telegram.

---

## Tools públicas

### Wave 1 — Núcleo

| Tool | Descrição |
|---|---|
| `search_movie(q)` | Busca no TMDB por texto — sem gravar |
| `add_movie(title?, tmdb_id?, status, year?, letterboxd_uri?, source, enrich_tmdb, rating?)` | Adiciona filme (com TMDB ou sem); `rating` grava nota vinda do Letterboxd sem sessão associada |
| `log_watch(movie_id, watched_date?, rating?, review?, tags?, rewatch?, source)` | Loga sessão + atualiza movies (transação) |
| `rate_movie(movie_id, rating)` | Define nota (`rating_source='own'`) |
| `set_like(movie_id, liked)` | Marca/desmarca ❤️ |
| `add_to_watchlist(title?, tmdb_id?, year?, letterboxd_uri?)` | Atalho: `add_movie(status='watchlist')` |
| `update_movie_status(movie_id, status)` | Altera status watchlist ↔ watched |
| `set_notes(movie_id, notes)` | Salva anotações soltas |
| `list_movies(status?, sort?, genre?, tag?, filter?)` | Grid filtrado e ordenado |
| `get_watchlist()` | Filmes com `status='watchlist'` |
| `get_diary(limit?)` | Histórico de sessões cronológico |
| `get_movie_detail(movie_id)` | Detalhe: movie + people + vault + diary |
| `get_stats(year?)` | Estatísticas anuais (vazio-seguro — SC-006) |
| `delete_movie(movie_id)` | Soft delete |
| `delete_diary_entry(diary_id)` | Remove sessão e recalcula `times_watched` |
| `refresh_movie_metadata(movie_id, tmdb_id?)` | "Buscar Dados" (spec 050) — rebusca no TMDB e sobrescreve só os campos de catálogo; nunca toca em dado pessoal |
| `update_movie_catalog(movie_id, title?, year?, director?, genres?, runtime?, overview?)` | Edição manual dos campos de catálogo (spec 050) |
| `update_diary_entry(diary_id, watched_date?, rating?, review?, tags?, rewatch?)` | Edição manual de uma sessão (spec 050) — recalcula `last_watched_date`/`times_watched` |
| `reorder_diary_entries(watched_date, ordered_ids)` | Reordena sessões do mesmo dia reatribuindo `created_at` (spec 050) |

### Wave 4 — Agregações

| Tool | Descrição |
|---|---|
| `get_home()` | Bloco completo do Início (multi-query, sem N+1) |
| `get_rewind(year?)` | Year-in-review com highlights |
| `get_heatmap(year?)` | Sessões/dia do ano |
| `get_favorites()` | Vitrine de favoritos (por position) |
| `set_favorites(ids)` | Substitui vitrine (delete-all + insert atômico, max 4) |
| `get_top_people(limit?)` | Diretores/atores mais frequentes |

### Wave 5 — Coleções

| Tool | Descrição |
|---|---|
| `get_lists()` | Todas as listas com contagem |
| `get_list(list_id)` | Detalhe de uma lista + filmes |
| `create_list(name, description?, accent?, ranked?)` | Cria nova coleção |
| `update_list(list_id, ...)` | Atualiza campos de uma lista |
| `delete_list(list_id)` | Remove lista (cascade nos itens) |
| `add_to_list(list_id, movie_id, position?)` | Adiciona filme à lista |
| `remove_from_list(list_id, movie_id)` | Remove filme da lista |
| `get_tags()` | Nuvem de etiquetas com contagem e flag `person` |
| `get_vault(movie_id)` | Itens do Cofre de um filme |
| `add_vault_item(movie_id, type, title, url?, source?)` | Adiciona item ao Cofre |
| `delete_vault_item(vault_id)` | Remove item do Cofre |

### Cross-agent

| Tool | Descrição |
|---|---|
| `create_movie_reminder(movie_query, when)` | Cria tarefa de lembrete via Kaguya |

### Helper de sync (não chamada pelo agente ADK)

| Função | Descrição |
|---|---|
| `upsert_movie_from_letterboxd(title, year, letterboxd_uri, rating, review, watched_date, source, enrich_tmdb, created_at?, tags?)` | Upsert idempotente para RSS/CSV — `created_at` explícito (spec 050) garante ordem entre sessões do mesmo dia; `tags` grava a etiqueta da sessão (diary.csv) |
| `backfill_diary_review(letterboxd_uri, watched_date, review?, tags?)` | Preenche review/tags de uma sessão **já existente** (usada só por reviews.csv) — nunca cria sessão nova; só preenche o que estava vazio |

---

## Scripts de sincronização

### `scripts/sync_letterboxd.py`

Busca o feed RSS do Letterboxd e ingere as entradas no catálogo.

```bash
# Sync completo (50 mais recentes):
python -m scripts.sync_letterboxd

# Só itens de ontem (cron diário):
python -m scripts.sync_letterboxd --yesterday

# Sem TMDB (mais rápido):
python -m scripts.sync_letterboxd --no-tmdb
```

**Variável necessária**: `LETTERBOXD_USERNAME` — username público do Letterboxd.

**Endpoint web**: `POST /api/movies/sync-letterboxd` — aciona `run_sync()` manualmente.

### `scripts/import_letterboxd_csv.py`

Importa histórico completo da exportação CSV do Letterboxd.

```bash
# Obter CSVs: Letterboxd → Settings → Import & Export → Export Your Data
# Extrair o ZIP, passar a pasta como argumento:
python -m scripts.import_letterboxd_csv ~/Downloads/letterboxd_export

# Sem TMDB (mais rápido para histórico grande):
python -m scripts.import_letterboxd_csv ~/pasta --no-tmdb
```

Ordem de processamento: `diary.csv` (única fonte de sessão) → `reviews.csv` (preenche
review/tags nas sessões já criadas, nunca cria sessão nova) → `watchlist.csv` →
`ratings.csv` (fallback de catálogo: só a nota, sem sessão) → `watched.csv` (fallback
final, spec 050 FR-001 — filmes sem data confiável entram só como "assistido", sem
sessão).

### `scripts/fix_letterboxd_fake_diary_sessions.py`

Migração one-time (rodar uma vez, se a importação já foi feita antes da correção acima):
remove sessões de `diary_entries` fabricadas pelo bug antigo do fallback de `ratings.csv`.

```bash
# Mostra o que seria removido, sem alterar nada:
python -m scripts.fix_letterboxd_fake_diary_sessions letterboxd_export --dry-run

# Remove de fato (grava backup JSON antes):
python -m scripts.fix_letterboxd_fake_diary_sessions letterboxd_export --apply
```

**Para rodar no VPS** (banco está em container Docker):
```bash
docker cp ~/Downloads/letterboxd_export makima-web:/app/letterboxd_export
docker exec makima-web sh -c "cd /app && python -m scripts.import_letterboxd_csv letterboxd_export -v"
```

**Roteiro completo da carga real (spec 050, US3)** — passo a passo até confirmar sucesso:

1. Copiar o export e rodar o import (comando acima). A saída final em JSON traz os
   contadores: `criados`, `atualizados`, `pulados`, `erros`.
2. **Confirmar a carga**: consultar `GET /api/movies/stats` (ou a tela Estatísticas do
   webapp) e comparar a contagem de filmes com o perfil público do usuário no Letterboxd
   (SC-004) — variação aceitável só para filmes privados/removidos do Letterboxd.
3. **Validar idempotência**: rodar o mesmo comando uma segunda vez. A contagem final de
   filmes e sessões MUST ser idêntica à da primeira execução (nenhum `criados` na segunda
   rodada, fora de filmes genuinamente novos adicionados entre as duas execuções).
4. Cenários de teste detalhados (export sintético, dedup contra filme manual, ordem no
   mesmo dia) estão em `specs/050-akane-letterboxd-carga/quickstart.md` — rodar contra um
   banco de teste antes da carga real, não direto em produção.

---

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL compartilhado — todas as tools |
| `TMDB_API_KEY` | sim | API key v3 do TMDB (obtida em themoviedb.org/settings/api) |
| `LETTERBOXD_USERNAME` | sim (sync RSS) | Username público do Letterboxd |

---

## Personalidade e formatação

A Akane sempre começa com `Akane:`. Tom analítico, preciso, como atriz que estuda roteiros.

Frases características:
- "O roteiro sustenta o peso emocional, mas a performance faz o trabalho real."
- "Esse diretor sabe exatamente quando deixar o silêncio trabalhar."
- "Revi e percebi o que não vi na primeira vez."

Nunca usa markdown. Apenas HTML (`<b>`, `<i>`) e emojis.

Emojis: 🎬 (filmes), 📽️ (sessão), ❤️ (favorito), ⭐ (nota), 🔁 (rewatch).

---

## Integração com o coordinator

```python
# coordinator/agent.py
from agents.akane.agent import akane_agent

sub_agents=[nami_agent, kaguya_agent, kurisu_agent, frieren_agent, akane_agent]
```

```python
# coordinator/main.py — _classify_domain()
if any(w in t for w in ["filme", "assistir", "assisti", "cinema", "diretor",
                          "letterboxd", "watchlist", "tmdb", "akane"]):
    return "filmes"
```

Sessão separada por domínio: `{chat_id}_filmes` — histórico de cinema não contamina tarefas.

---

## Cross-agent com Kaguya

`create_movie_reminder(movie_query, when)` importa `create_task` da Kaguya em runtime
(importação tardia para evitar circular import):

```python
# Dentro de tools.py:
def create_movie_reminder(movie_query: str, when: str) -> dict:
    from agents.kaguya.tools import create_task
    ...
```

Acionado quando o usuário diz "me lembra de assistir X sábado".

---

## Webapp

- **Router**: `webapp/backend/routers/movies.py` — fachada fina, todos com `Depends(require_user)`
- **Shell React**: `webapp/frontend/src/pages/akane/` — rota `/movies/*`
- **CSS**: tokens OKLCH em `.akane-shell`, 4 acentos (default: teal), modo claro/escuro
- **Paletas tipográficas**: 14 variantes com `[data-palette='X']` no CSS
- **Estrelas**: cor fixa `--gold: oklch(0.815 0.135 86)` (verde Letterboxd) — independente do acento
