# Quickstart — Marin Kitagawa (animes) · fatia 021

Guia de configuração e validação end-to-end, do zero até a Marin respondendo no Telegram.
Organizado por ordem de execução; cada passo tem o que esperar ao final.

---

## 0. Pré-requisitos

```bash
# Variáveis de ambiente obrigatórias
MAL_CLIENT_ID=<seu-client-id-do-MAL>       # obrigatório para sync MAL
MAL_CLIENT_SECRET=<seu-client-secret>      # obrigatório para sync MAL

# Variáveis opcionais
TMDB_TOKEN=<bearer-token-v4-ou-api-key>    # opcional; sem ele, thumbnails ficam NULL
DATABASE_URL=postgresql://...              # já existente no projeto

# Para registro de aplicativo no MAL:
# Vá em https://myanimelist.net/apiconfig
# Crie uma aplicação, anote Client ID e Client Secret
# App Type: "other" (sem web redirect), use "urn:ietf:wg:oauth:2.0:oob" como redirect_uri
```

---

## 1. Aplicar o schema no banco

No VPS, o hostname do Postgres é serviço Docker Swarm — rodar **dentro do container** `makima-web`.

```bash
# No VPS
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"

# Localmente (DATABASE_URL apontando para Postgres acessível)
python -m scripts.setup_schemas
```

**Esperado**: 4 novas tabelas criadas (ou "already exists" se rodado novamente):
```sql
-- Verificar no psql
\dt
-- Deve listar: anime, watch_logs, episodes, mal_sync_state

\d+ anime          -- conferir idx_anime_mal (UNIQUE, parcial WHERE mal_id IS NOT NULL)
\d+ episodes       -- conferir UNIQUE(anime_id, number)
\d+ mal_sync_state -- verificar linha id=1 inserida (sem tokens ainda)

SELECT * FROM mal_sync_state;
-- Esperado: 1 linha com id=1, access_token NULL, refresh_token NULL
```

---

## 2. Autorizar o MAL (primeira vez)

Fluxo PKCE interativo. Rodar **localmente** (precisa de browser). Após autorizar, os tokens são
gravados diretamente no PostgreSQL (tabela `mal_sync_state`).

```bash
# Localmente (não no VPS — precisa de browser para autorizar)
python scripts/authorize_mal.py

# O script vai:
# 1. Gerar code_verifier e code_challenge
# 2. Exibir a URL de autorização (abrir no browser)
# 3. Aguardar o usuário colar o código de retorno
# 4. Trocar o código por access_token + refresh_token via POST /v1/oauth2/token
# 5. Gravar em mal_sync_state via INSERT ... ON CONFLICT DO UPDATE
```

**O que digitar quando o script pedir**:
```
Abra esta URL no browser e autorize:
  https://myanimelist.net/v1/oauth2/authorize?...

Cole o código de retorno aqui: _____________
```

**Verificar após o script terminar**:
```sql
SELECT id, LEFT(access_token, 20) || '...' AS access_token_preview,
       LEFT(refresh_token, 20) || '...' AS refresh_token_preview,
       expires_at
FROM mal_sync_state WHERE id = 1;
-- Deve ter access_token e refresh_token não-nulos
```

**Após autorizar localmente**, se quiser usar no VPS, os tokens já estão no banco de dados (que é
compartilhado). Se o banco local é diferente do VPS, use `docker exec` para rodar o script dentro
do container com acesso ao banco de produção:
```bash
# Copiar e rodar no container (se necessário)
docker cp scripts/authorize_mal.py makima-web:/app/scripts/authorize_mal.py
docker exec -it makima-web sh -c "cd /app && python -m scripts.authorize_mal"
```

---

## 3. Testar a busca de metadados

```python
# Python REPL ou script temporário
from agents.marin.metadata import search_anime, enrich_anime

# Testar busca no Jikan
results = search_anime("Dungeon Meshi")
print(results)
# Esperado: lista com dicts contendo mal_id=52701, title="Dungeon Meshi", etc.

# Testar enriquecimento completo
anime_data = enrich_anime(mal_id=52701)
print(anime_data)
# Esperado: dict com title, title_english, studio="TRIGGER", episodes_total=24,
#           poster_url, banner_url (AniList), genres, airing_status="finalizado"
# Se TMDB_TOKEN setado: tmdb_id resolvido via ARM

# Testar sem TMDB_TOKEN (gracioso)
import os
del os.environ['TMDB_TOKEN']
anime_data_no_tmdb = enrich_anime(mal_id=52701)
# Esperado: funciona normalmente, tmdb_id=None, sem erro
```

**Verificar delays**: o script deve levar ~2-3 segundos por anime (Jikan 1.2s + AniList 0.8s).

---

## 4. Testar o sync MAL

```python
from agents.marin.tools import sync_mal

result = sync_mal()
print(result)
# Esperado:
# { "status": "ok", "created": X, "updated": Y, "skipped": Z, "errors": [] }

# Verificar no banco
import psycopg2, os
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM anime WHERE source='mal_sync'")
print(cur.fetchone())  # deve ser > 0 se você tem animes no MAL
cur.execute("SELECT title, status, score, episodes_watched FROM anime LIMIT 5")
for row in cur.fetchall():
    print(row)
```

**Idempotência** — rodar 2× sem mudanças no MAL:
```python
result2 = sync_mal()
print(result2)
# Esperado: { "created": 0, "updated": 0, "skipped": N, "errors": [] }
# last_sync_at foi atualizado — próximo sync só pega itens mais recentes
```

**Rotação de refresh_token** (verificar no banco):
```sql
SELECT LEFT(refresh_token, 20) || '...' AS before FROM mal_sync_state;
-- Após sync que fez refresh, o token aqui deve ser diferente do que havia antes
```

---

## 5. Testar as tools diretamente

```python
from agents.marin import tools

# Adicionar anime manualmente (sem sync MAL)
result = tools.add_anime(query="Frieren Beyond Journey's End")
print(result)
# Esperado: { "status": "ok", "anime": { "id": "...", "mal_id": 52991, "title": "Frieren...", ... } }

# Logar episódios assistidos
anime_id = result["anime"]["id"]
log = tools.log_watch(
    anime_id=anime_id,
    ep_start=1,
    ep_end=3,
    watched_date="2026-06-13",
    rating=9.5,
    notes="Abertura perfeita da série"
)
print(log)
# Esperado: { "status": "ok", "log": { ... }, "anime_progress": { "episodes_watched": 3, ... } }

# Atualizar status
update = tools.update_anime_status(anime_id=anime_id, status="assistindo")
print(update)
# Esperado: { "status": "ok", ... }

# Consultar o que está assistindo
watching = tools.get_currently_watching()
print(watching)
# Esperado: lista com o Frieren, progresso 3/28 (ou total do Jikan)

# Stats do ano
stats = tools.get_stats(year=2026)
print(stats)
# Esperado: { "total_animes": 1, "total_episodes": 3, "avg_score": 9.5, ... }

# Stats de ano vazio (não deve dar erro)
empty = tools.get_stats(year=2020)
print(empty)
# Esperado: { "total_animes": 0, "total_episodes": 0, ... } sem traceback
```

---

## 6. Testar no Telegram

Com o coordinator rodando (`python -m coordinator.main`):

| Mensagem enviada | Comportamento esperado |
|------------------|------------------------|
| `Marin, quero ver Dungeon Meshi` | Marin: busca, pergunta confirmação ou adiciona direto; resposta começa com "Marin:" |
| `Marin, assisti os eps 1 a 3 do Dungeon Meshi hoje` | Loga sessão, confirma progresso com HTML |
| `Marin, que animes estou assistindo?` | Lista `assistindo` com progresso (X/Y eps) |
| `Marin, nota 9 pro Dungeon Meshi` | Atualiza `score=9.0`, confirma |
| `Marin, sync MAL` | Dispara `sync_mal()`, responde com resumo criados/atualizados |
| `Marin, que eps saem essa semana?` | Chama `get_airing_schedule(days=7)`, lista eps com datas |
| `Marin, stats de 2026` | Chama `get_stats(2026)`, responde com totais formatados em HTML |
| `Marin, deleta o Naruto da minha lista` | Soft delete, confirma (watch_logs mantidos) |

**Verificar roteamento da Makima**:
```
Usuário → "animes" / "assistindo" / "episódio" / "temporada" / "anime"
Makima deve rotear para marin_agent (não para kaguya/frieren/akane)
```

---

## 7. Variáveis de ambiente necessárias

### Obrigatórias (fatia 021 — agente Telegram + MAL sync)

| Variável | Onde obtida | Uso |
|----------|-------------|-----|
| `MAL_CLIENT_ID` | https://myanimelist.net/apiconfig | OAuth PKCE — obrigatório para sync |
| `MAL_CLIENT_SECRET` | https://myanimelist.net/apiconfig | Troca de tokens — obrigatório |
| `DATABASE_URL` | Já existente no projeto | PostgreSQL — tabelas `anime`, `watch_logs`, `episodes`, `mal_sync_state` |

### Opcionais

| Variável | Onde obtida | Uso | Sem ela |
|----------|-------------|-----|---------|
| `TMDB_TOKEN` | https://www.themoviedb.org/settings/api | Thumbnails de episódio via TMDB | `episodes.thumbnail_url` fica NULL — sem erro |

### Tokens gerenciados automaticamente (não configurar manualmente)

Os tokens OAuth do MAL são gravados e rotacionados pelo sistema diretamente em `mal_sync_state`.
Após rodar `authorize_mal.py` uma vez, o sistema gerencia tudo automaticamente.

**Não adicionar** `MAL_REFRESH_TOKEN`, `MAL_ACCESS_TOKEN`, `MAL_TOKEN_EXPIRY` como env vars —
eles ficam no banco, não em variáveis de ambiente (sobrevivem a redeploys).

---

## 8. Verificação no VPS (Docker Swarm)

O hostname do Postgres (`personal-agent-makimadb-k3bxg9`) é serviço Docker Swarm e não resolve
no host. Toda execução de manutenção deve ser **dentro do container `makima-web`**.

```bash
# Verificar que o schema foi aplicado
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"

# Testar sync MAL de dentro do container
docker exec makima-web sh -c "cd /app && python -c 'from agents.marin.tools import sync_mal; import json; print(json.dumps(sync_mal()))'"

# Ver log de execução do coordinator (para verificar roteamento da Marin)
docker logs makima-coordinator --tail 50 | grep -i marin
```

---

## Definition of Done da fatia 021

- [ ] `scripts.setup_schemas` cria as **4 tabelas** (`anime`, `watch_logs`, `episodes`,
      `mal_sync_state`) no container `makima-web`.
- [ ] `scripts/authorize_mal.py` funciona e grava tokens em `mal_sync_state` (não em arquivo).
- [ ] `agents/marin/metadata.py`: `search_anime`, `enrich_anime` funcionam; `TMDB_TOKEN`
      ausente não dá erro (thumbnails NULL).
- [ ] `agents/marin/tools.py`: `add_anime`, `log_watch`, `get_currently_watching`,
      `get_watchlist`, `update_anime_status`, `rate_anime`, `get_anime_details`,
      `get_airing_schedule`, `get_stats`, `sync_mal`, `delete_anime`, `delete_watch_log`.
- [ ] One Piece (MAL ID 21) na blacklist → enriquecimento de episódios pulado, metadados ok.
- [ ] `sync_mal()` é idempotente: 2× sem mudanças → 0 upserts; refresh_token rotacionado no banco.
- [ ] Marin roteada pela Makima no Telegram; começa com "Marin:", usa HTML, chama tool antes de responder.
- [ ] `agents/marin/CLAUDE.md` documenta tools, schema, APIs, tokens, personalidade.
- [ ] `CLAUDE.md` raiz atualizado: tabela de agentes lista Marin (domínio **animes**).
- [ ] `specs/021-marin-animes/` com todos os 6 documentos (spec, research, data-model,
      design-guide, contracts/api-anime, quickstart).
