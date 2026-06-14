# Quickstart — Mai Sakurajima · Séries de TV (022-mai-series)

Guia passo-a-passo para validar que a fatia 022 está funcionando corretamente após o `execute-phase`.
Cada seção mapeia para uma User Story da spec. Todos os comandos são executados **de dentro do
container `makima-web`** (o hostname do PostgreSQL só resolve no Docker Swarm).

---

## 0. Pré-requisitos

```bash
# Variáveis obrigatórias (verificar no container)
docker exec makima-web env | grep TMDB_TOKEN
# Esperado: TMDB_TOKEN=eyJ... (token presente e não vazio)

docker exec makima-web env | grep DATABASE_URL
# Esperado: DATABASE_URL=postgresql://... (string de conexão presente)
```

**Env vars da fatia 022**: apenas `TMDB_TOKEN` (já existente da Akane). **Zero variáveis novas**.

---

## 1. Aplicar o schema PostgreSQL

```bash
# Adicionar agents/mai/schema_pg.sql à lista SCHEMA_FILES em scripts/setup_schemas.py
# e então rodar:
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
# Esperado: saída listando os schemas aplicados, incluindo "mai" sem erros
```

**Verificar tabelas criadas**:
```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.db import get_conn
with get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute('''
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public'
            AND table_name IN ('series','seasons','episodes','watch_logs')
            ORDER BY table_name
        ''')
        print([r[0] for r in cur.fetchall()])
\""
# Esperado: ['episodes', 'seasons', 'series', 'watch_logs']
```

---

## 2. User Story 1 — Camada de dados + agente Telegram

### 2.1 Adicionar série via tools

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import add_series, get_currently_watching, get_stats

# SC-001: adicionar Severance
result = add_series(tmdb_id=95396)
print('add_series:', result['status'], result.get('series', {}).get('title'))
# Esperado: add_series: ok Severance

# Verificar que criou com status correto
assert result['series']['status'] == 'quero_assistir'
assert result['series']['tmdb_id'] == 95396
assert result['series']['poster_url'] is not None  # TMDB respondeu
print('SC-001 PASS')
\""
```

### 2.2 Logar sessão de episódios

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import log_watch, update_series_status, get_currently_watching

# Primeiro mudar status para assistindo
series_id = '<ID-DO-SEVERANCE>'  # pegar do resultado acima
update_series_status(series_id, 'assistindo')

# SC-002: logar T1E1-E2
result = log_watch(series_id, season_number=1, ep_start=1, ep_end=2, watched_date='2026-06-13')
print('log_watch:', result['status'])
print('episodes_watched:', result['series']['episodes_watched'])
# Esperado: log_watch: ok, episodes_watched: 2
assert result['series']['episodes_watched'] == 2
print('SC-002 PASS')

# Rewatch: logar mesmo bloco novamente (deve criar 2ª linha, não duplicar)
result2 = log_watch(series_id, season_number=1, ep_start=1, ep_end=2, watched_date='2026-06-14')
assert result2['series']['episodes_watched'] == 4  # acumula
print('rewatch PASS — episodes_watched =', result2['series']['episodes_watched'])

# get_currently_watching
watching = get_currently_watching()
assert any(s['title'] == 'Severance' for s in watching.get('series', []))
print('get_currently_watching PASS')
\""
```

### 2.3 Estatísticas

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import get_stats

# SC-005: stats com dados
stats = get_stats(year=2026)
assert stats['status'] == 'ok'
assert stats['total_episodes'] >= 2
print('get_stats com dados PASS — total_eps:', stats['total_episodes'])

# SC-005: stats com ano vazio (nunca erro)
stats_empty = get_stats(year=2000)
assert stats_empty['status'] == 'ok'
assert stats_empty['total_episodes'] == 0
print('get_stats ano vazio PASS')
\""
```

---

## 3. User Story 2 — Enriquecimento de metadados TMDB

### 3.1 Sync de temporadas e episódios

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import sync_metadata
from agents.db import run_select

series_id = '<ID-DO-SEVERANCE>'

# SC-003: primeira rodada — popula seasons + episodes
result = sync_metadata(series_id)
print('sync_metadata:', result)
assert result['status'] == 'ok'
assert result['seasons_upserted'] >= 2  # T1 e T2
assert result['episodes_created'] > 0
print('SC-003 primeira rodada PASS — seasons:', result['seasons_upserted'], 'eps_criados:', result['episodes_created'])

# SC-003: segunda rodada — skip-logic (eps antigos com still não são reprocessados)
result2 = sync_metadata(series_id)
assert result2['episodes_created'] == 0  # nada novo
assert result2['episodes_skipped'] >= result['episodes_created']  # todos pulados
print('SC-003 skip-logic PASS — skipped:', result2['episodes_skipped'])

# Verificar que season_number=0 não foi criado
seasons = run_select('SELECT season_number FROM seasons WHERE series_id=%s', (series_id,))
season_nums = [s['season_number'] for s in seasons]
assert 0 not in season_nums, f'Especial não deveria existir: {season_nums}'
print('SC-009 especiais excluídos PASS — temporadas:', season_nums)
\""
```

### 3.2 Próximos episódios

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import get_upcoming

# SC-006: upcoming (pode ser vazio se nenhuma série assistindo tem eps futuros)
result = get_upcoming(days=30)
assert result['status'] == 'ok'
print('get_upcoming PASS — episódios nos próximos 30 dias:', len(result['episodes']))
for ep in result.get('episodes', [])[:3]:
    print(f'  {ep[\"series_title\"]} S{ep[\"season_number\"]}E{ep[\"episode_number\"]} — {ep[\"air_date\"]}')
\""
```

### 3.3 TMDB indisponível (fallback gracioso)

```bash
docker exec makima-web sh -c "cd /app && python -c \"
import os, unittest.mock

# SC-004: simular TMDB fora
with unittest.mock.patch.dict(os.environ, {'TMDB_TOKEN': ''}):
    from importlib import reload
    import agents.mai.tools as t
    reload(t)
    result = t.add_series('Dark', year=2017)
    assert result['status'] == 'ok'
    assert result['series']['poster_url'] is None  # sem poster
    print('SC-004 TMDB down PASS — série criada sem poster:', result['series']['title'])
\""
```

---

## 4. User Story 3 — Consultas ricas + soft delete

### 4.1 Detalhe completo

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import get_series_detail, rate_series, set_notes

series_id = '<ID-DO-SEVERANCE>'

# Detalhe com seasons + next_episode + logs
detail = get_series_detail(series_id)
assert detail['status'] == 'ok'
assert 'seasons' in detail
assert len(detail['seasons']) >= 2
assert 'next_episode' in detail
assert 'recent_logs' in detail
print('get_series_detail PASS — temporadas:', len(detail['seasons']))

# Avaliar
rate_result = rate_series(series_id, 4.5)
assert rate_result['series']['rating'] == 4.5
print('rate_series PASS')

# Anotações
notes_result = set_notes(series_id, 'Uma das séries mais originais dos últimos anos.')
assert notes_result['series']['notes'] != ''
print('set_notes PASS')
\""
```

### 4.2 Soft delete

```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import add_series, delete_series, list_series
from agents.db import run_select

# Criar série temporária para deletar
tmp = add_series('The Bear')
tmp_id = tmp['series']['id']

# SC-008: soft delete
del_result = delete_series(tmp_id)
assert del_result['status'] == 'ok'

# Série some da listagem
series_list = list_series()
ids_active = [s['id'] for s in series_list.get('series', [])]
assert tmp_id not in ids_active, 'Série deletada não deveria aparecer na listagem'

# Watch logs permanecem (se houvesse algum)
row = run_select('SELECT deleted FROM series WHERE id=%s', (tmp_id,))
assert row[0]['deleted'] == True
print('SC-008 soft delete PASS')
\""
```

---

## 5. Verificação do agente Telegram

### 5.1 Roteamento pela Makima

```bash
# Teste manual no Telegram — enviar as mensagens abaixo e confirmar roteamento:
# "séries" → deve ir para mai_agent
# "quais séries estou assistindo?" → deve ir para mai_agent
# "temporada" → deve ir para mai_agent
# "mai, quero assistir Dark" → deve ir para mai_agent

# Verificar no log do container:
docker logs makima-coordinator --tail 50 | grep -i "mai\|serie"
# Esperado: linhas mostrando domínio "series" sendo atribuído à mai_agent
```

### 5.2 Resposta HTML (nunca markdown)

```bash
# No Telegram: "Mai, o que estou assistindo?"
# Esperado:
# - Mensagem começa com "Mai:"
# - Usa <b>título</b>, <i>network</i> — nunca **negrito** ou _itálico_ Markdown
# - Emojis presentes mas contidos (🐰 📺 🌙 etc.)
# - Tool foi chamada antes de responder (dados reais, não inventados)
```

---

## 6. Verificação no VPS / Docker

```bash
# Confirmar que os 4 schemas existem no banco de produção
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas --check"
# (se --check não existir, rodar com idempotência — IF NOT EXISTS garante segurança)

# Smoke test completo via coordinator
docker exec makima-web sh -c "cd /app && python -c \"
from agents.mai.tools import get_stats
r = get_stats()
assert r['status'] == 'ok'
print('Smoke test PASS:', r['total_series'], 'séries no catálogo')
\""
```

---

## Definition of Done da fatia

- [ ] `agents/mai/schema_pg.sql` existente com 4 tabelas (`series`, `seasons`, `episodes`, `watch_logs`)
- [ ] `scripts/setup_schemas.py` atualizado com `agents/mai/schema_pg.sql` na lista `SCHEMA_FILES`
- [ ] `agents/mai/tools.py` com todas as tools: `search_series`, `add_series`, `log_watch`,
      `get_currently_watching`, `get_watchlist`, `update_series_status`, `rate_series`, `set_notes`,
      `get_series_detail`, `get_upcoming`, `get_stats`, `get_watch_history`, `sync_metadata`,
      `delete_series`, `delete_watch_log`
- [ ] `agents/mai/metadata.py` implementando TMDB Bearer v4, skip-logic incremental, retry exponencial,
      exclusão de season_number=0
- [ ] `agents/mai/agent.py` com singleton `mai_agent` (ADK, `gemini-2.5-flash`, sem MCP), personalidade
      Mai Sakurajima, HTML, começa com "Mai:"
- [ ] `coordinator/agent.py` atualizado: import `mai_agent`, adicionado a `sub_agents`, descrito em
      `_MAKIMA_INSTRUCTION`
- [ ] `coordinator/main.py` atualizado: `_classify_domain` reconhece domínio `"series"`
- [ ] `CLAUDE.md` raiz atualizado: Mai listada (domínio séries de TV), `agents/media/` aposentado
- [ ] SC-001 PASS: `add_series("Severance")` → linha com `tmdb_id=95396`
- [ ] SC-002 PASS: `log_watch` → `episodes_watched` acumulado corretamente
- [ ] SC-003 PASS: `sync_metadata` idempotente, skip-logic funciona na 2ª rodada
- [ ] SC-004 PASS: TMDB fora → série criada sem pôster, sem traceback
- [ ] SC-005 PASS: `get_stats` com dados e com ano vazio, ambos sem erro
- [ ] SC-006 PASS: `get_upcoming` retorna episódios agendados
- [ ] SC-007 PASS: Makima roteia para `mai_agent`, que responde em HTML
- [ ] SC-008 PASS: soft delete funciona, logs permanecem
- [ ] SC-009 PASS: `season_number=0` não criado em `seasons`
