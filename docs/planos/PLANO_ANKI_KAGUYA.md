# Plano — Anki → Kaguya: hábito automatizado de flashcards (spec 068)

**Status: planejado, não executado** · criado em 2026-08-23

## Context

Você quer criar um hábito de fazer flashcards, mas não quer marcar check-in na mão — quer que
o Anki seja a fonte da verdade e a Kaguya leia isso sozinha.

Isso já é um caminho pavimentado neste repo. A spec 036 criou o **registry de fonte automática
de hábito** ([habit_source_providers.py](../../agents/kaguya/habit_source_providers.py)), usado hoje por
Violet (diário), Frieren (leitura) e Kaguya (foco). O contrato inteiro é uma função:

```python
get_activity(start_date: str, end_date: str) -> dict[str, float]
```

Registrar um provider novo é **um bloco** em [habit_source_providers.py:117](../../agents/kaguya/habit_source_providers.py#L117).
O `<select>` do `HabitModal`, a rota `GET /api/tasks/habits/source-providers`, o merge com
check-ins manuais, o heatmap com origem `auto`/`manual`/`both` e a consistência/tendência já são
genéricos — pegam a fonte nova sozinhos, **sem tocar em frontend, rota ou schema de hábito**.

O trabalho real é o transporte. O AnkiConnect só existe em `127.0.0.1:8765` da sua máquina, e só
com o Anki aberto — o VPS nunca alcança. Além disso, o provider é chamado a cada leitura da tela
de Hábitos (janela de 70 dias) e o ano inteiro no heatmap, então nem HTTP no caminho crítico serve.

**Decisão tomada:** subir o **Anki Sync Server oficial** no VPS. Anki desktop e AnkiDroid passam a
sincronizar contra ele; o `collection.anki2` (SQLite) fica num volume local ao VPS; um job do
scheduler espelha o `revlog` no Postgres; o provider lê SQL, igual ao
[focus_habit_provider.py](../../agents/kaguya/focus_habit_provider.py).

Isso é o único cenário que captura revisão feita **no celular** e não depende de nenhuma máquina
sua estar ligada.

**Escopo:** hábito **binário** ("revisei hoje") + uma **tela de estatísticas** no shell da Kaguya.

## Arquitetura

```
AnkiDroid ─┐
           ├─ sync (HTTPS) ─→ makima-anki-sync  (container novo, volume anki_data)
Anki PC ───┘                        │
                                    ▼  /data/<user>/collection.anki2
                    scheduler job "anki_sync" (a cada 1h)
                          copia o arquivo → lê revlog → upsert
                                    ▼
              anki_reviews · anki_decks · anki_sync_state   (Postgres)
                    │                              │
                    │ provider "anki_reviews"      │ GET /api/tasks/anki/*
                    ▼                              ▼
            Hábito na Kaguya                 Tela "🃏 Anki"
```

---

## Etapa 1 — Anki Sync Server no VPS (infra)

**`docker-compose.yml`** — serviço novo + volume nomeado compartilhado com o scheduler:

- `anki-sync`: imagem `ghcr.io/dli7319/docker-anki-server` (**pinar a tag**, não usar `main` solto),
  `container_name: makima-anki-sync`, escuta em `8080` no container, redes `default` +
  `dokploy-network`. Env: `SYNC_USER1=<user>:<senha>` (via `.env` / painel do Dokploy, nunca no
  arquivo), `SYNC_BASE=/data`. Volume `anki_data:/data`.
- `scheduler`: acrescentar `anki_data:/anki` (leitura+escrita — o job **copia** o arquivo antes de
  abrir, ver Etapa 2). Nova env `ANKI_COLLECTION_PATH=/anki/<user>/collection.anki2`.
- Bloco `volumes:` no fim do arquivo declarando `anki_data`.

**Dokploy:** dar um domínio ao serviço (ex. `anki.<seu-domínio>`) apontando pra porta 8080, com
TLS do Let's Encrypt. O manual do Anki desaconselha HTTP puro exposto à internet — o proxy do
Dokploy resolve isso.

**Migração da coleção (feita por você, na ordem):**
1. Sync completo com o AnkiWeb + `Arquivo → Exportar → Pacote de coleção (.colpkg)` como rede de segurança.
2. Subir o serviço; conferir que a URL responde.
3. Anki desktop → `Ferramentas → Preferências → Sincronização` → self-hosted server URL + login.
   Primeiro sync: escolher **"Enviar para o servidor"** (o servidor está vazio).
4. AnkiDroid → `Avançado → Servidor de sincronização personalizado` (mesma URL, sync **e** mídia) →
   login → **baixar** do servidor.
5. Revisar alguns cards nos dois e confirmar que convergem.

**Rollback:** apontar os clientes de volta pro AnkiWeb e fazer um upload. A conta do AnkiWeb
continua existindo — nada é destruído.

**Risco a vigiar:** o servidor precisa ser compatível com a versão do cliente. Quando você atualizar
o Anki desktop/AnkiDroid, pode ser necessário atualizar a tag da imagem. Anotar isso no CLAUDE.md do
pacote.

---

## Etapa 2 — Espelho do `revlog` no Postgres

Pacote novo **`agents/anki/`** (fonte de dados, sem `agent.py`/`toolset.py` por ora — deixa a porta
aberta pra virar agente depois sem mover arquivo). Precedente de subpacote de dados: `agents/kurisu/memory/`.

### `agents/anki/schema_pg.sql`

Três tabelas, todas `CREATE TABLE IF NOT EXISTS` (aplicadas por `scripts/setup_schemas.py`):

- **`anki_reviews`** — espelho bruto, 1:1 com o `revlog` do Anki.
  `revlog_id BIGINT PRIMARY KEY` (o próprio `revlog.id`, epoch-ms — dá idempotência de graça),
  `reviewed_at TIMESTAMPTZ NOT NULL` (derivado de `revlog_id/1000` no ingest),
  `card_id BIGINT`, `deck_id BIGINT`, `ease SMALLINT`, `time_ms INT`, `review_type SMALLINT`,
  `ivl INT`, `last_ivl INT`.
  Índice em `(reviewed_at)` — é o que o provider e a tela consultam.
- **`anki_decks`** — `deck_id BIGINT PRIMARY KEY`, `name TEXT`, `updated_at TIMESTAMPTZ`. Reescrita
  a cada sync (upsert).
- **`anki_sync_state`** — singleton `id INT PRIMARY KEY CHECK (id = 1)`, `last_revlog_id BIGINT`,
  `last_sync_at TIMESTAMPTZ`. Mesmo padrão de `mal_sync_state`
  ([agents/marin/mal_auth.py](../../agents/marin/mal_auth.py)) e pela mesma razão: o container não tem
  volume persistente fora do Postgres.

**Nada derivado é persistido** — consistência, streak, retenção e heatmap são todos calculados na
leitura, igual a `habit_strength`/`focus_stats`.

### `agents/anki/collection.py` — leitura segura do SQLite

O sync server mantém o `collection.anki2` aberto. Abrir direto arrisca leitura suja e problemas de
WAL em mount read-only. Estratégia: **copiar** `collection.anki2` + `-wal` + `-shm` (se existirem)
para um diretório temporário com `shutil.copy2`, abrir a **cópia** normalmente, apagar no `finally`.
Leitura torta durante um sync ativo é mitigada por o job inteiro ser idempotente (`ON CONFLICT DO
NOTHING`) e o watermark só avançar em sucesso.

Funções:
- `open_collection(path) -> contextmanager[sqlite3.Connection]` — a cópia + cleanup.
- `read_reviews(conn, since_revlog_id) -> list[dict]` —
  `SELECT r.id, r.cid, r.ease, r.ivl, r.lastIvl, r.time, r.type, c.did
   FROM revlog r LEFT JOIN cards c ON c.id = r.cid
   WHERE r.id > ? AND r.type NOT IN (4, 5) ORDER BY r.id`.
  Os tipos 4 (`manual`) e 5 (`rescheduled`) **não são revisões** — são reagendamentos; excluí-los
  aqui evita inflar "revisei hoje" com operação de manutenção.
- `read_decks(conn) -> list[dict]` — o Anki moderno (schema ≥18) tem tabela `decks` real com
  `id`/`name` (hierarquia separada por `\x1f`, converter pra `::`). Fallback pro JSON legado em
  `col.decks` se a tabela não existir — decidir pela presença em `sqlite_master`.

### `agents/anki/sync.py`

`sync_anki(full: bool = False) -> dict` — mesmo formato de retorno do `sync_mal` da Marin
(dict de métricas, levanta em falha estrutural):

1. Lê o watermark (`0` se `full=True`).
2. `open_collection` → `read_reviews` → `read_decks`.
3. Upsert dos decks; `INSERT ... ON CONFLICT (revlog_id) DO NOTHING` das revisões (batch com
   `psycopg2.extras.execute_values`).
4. Grava `last_revlog_id` = maior id ingerido, `last_sync_at = NOW()`.
5. Retorna `{ok, reviews_fetched, reviews_inserted, decks_upserted, last_revlog_id}`.

Coleção ausente (sync server ainda vazio) → retorna `{ok: True, reviews_fetched: 0, ...}` sem erro.

### `agents/anki/stats.py` — motor PURO (sem banco)

Convenção do repo (`focus_stats.py`, `habit_strength.py`, `comfort_matrix.py`): agregações são
funções puras sobre uma lista de linhas, testáveis sem Postgres.

- `by_day(reviews, start, end)` — zero-fill do período: `{date, reviews, minutes, correct, total}`.
- `by_hour(reviews)` — 24 baldes zero-filled (hora local).
- `retention(reviews)` — `ease > 1` sobre `review_type IN (0,1,2)`.
- `current_streak(day_totals, today)` / `longest_streak(...)` — **copiar a semântica de
  [focus_stats.py](../../agents/kaguya/focus_stats.py)**, incluindo a regra de não quebrar o streak no
  meio do dia (se hoje ainda não tem revisão, conta a partir de ontem).
- `by_deck(reviews, deck_names)` — revisões, minutos e retenção por baralho.

Teste: `tests/agents/test_anki_stats.py`, no mesmo espírito de `test_kaguya_focus_stats.py`.

### `agents/anki/tools.py`

Camada de leitura (usa `agents.db.run_select`), consumida pelo router:
`get_anki_stats(start_date, end_date) -> dict` (payload único da tela, orquestra os motores puros
sobre uma janela só de `anki_reviews`) e `get_anki_heatmap(year) -> list` (esparso, só dias com
revisão).

### Job agendado

- `scheduler/jobs.py` — `run_anki_sync()`, estilo *direct import* (igual `run_marin_mal_sync`,
  [jobs.py:206](../../scheduler/jobs.py#L206)): import lazy de `agents.anki.sync.sync_anki`, print das
  métricas, `raise RuntimeError` se houver erro.
- `scheduler/registry.py` — **1 linha** em `JOBS`:
  `ScheduledJob("anki_sync", run_anki_sync, every(hours=1), "Espelha o revlog do Anki (sync server) → Postgres")`.

> **Latência real:** o VPS só vê a revisão depois que o cliente sincroniza. AnkiDroid sincroniza ao
> fechar o app; o desktop, ao abrir/fechar. Na prática o hábito marca sozinho dentro de ~1h.

---

## Etapa 3 — O provider (o pedaço menor de todos)

### `agents/anki/habit_provider.py`

Espelho fiel do [focus_habit_provider.py](../../agents/kaguya/focus_habit_provider.py) — hábito **binário**,
então emite `1.0`:

```python
def get_activity(start_date: str, end_date: str) -> dict[str, float]:
    rows = run_select(
        """
        SELECT DISTINCT (reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date AS date_local
        FROM anki_reviews
        WHERE (reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date
              BETWEEN %(start)s AND %(end)s
        """,
        {"start": start_date, "end": end_date},
    )
    return {r["date_local"].isoformat(): 1.0 for r in rows}
```

### Registro — `agents/kaguya/habit_source_providers.py`

Um bloco no fim, **mantendo `_try_import_provider`** (nunca import direto — é o que faz um provider
quebrado degradar sozinho em vez de derrubar o registry inteiro):

```python
register(
    "anki_reviews", "Flashcards (Anki)",
    _try_import_provider("agents.anki.habit_provider", "get_activity"),
)
```

**É só isso.** Nenhuma migração de hábito, nenhuma rota nova, nenhuma linha de frontend — a opção
aparece no `HabitModal` e o heatmap anual passa a marcar `source: "auto"` sozinho.

> **Decisão do dia local:** o Anki tem virada de dia própria às 4h (`col.crt`). Nós usamos
> meia-noite `America/Sao_Paulo`, a regra global do `CLAUDE.md`. Consequência: revisão feita à 1h da
> manhã conta como *hoje* na Kaguya e como *ontem* no Anki. Escolhi a consistência com o resto do
> app (heatmap do diário, foco, leitura) em vez da paridade com a tela de estatísticas do Anki.
> Documentar no CLAUDE.md do pacote.

---

## Etapa 4 — Tela de estatísticas

### Backend — `webapp/backend/routers/tasks.py`

Duas rotas finas, `Depends(require_user)` obrigatório, `_check_result` **não** se aplica (retornam
dict/lista direto, como as de journal/heatmap):

| Rota | Retorno |
|---|---|
| `GET /api/tasks/anki/stats?start=&end=` | payload único: KPIs, `by_day`, `by_hour`, `by_deck`, streaks, retenção |
| `GET /api/tasks/anki/heatmap?year=` | esparso `[{date, reviews, minutes}]` |

Prefixo `/anki/` não colide com as rotas parametrizadas existentes (`/habits/{habit_id}` etc.).

### Frontend — shell da Kaguya

- `pages/kaguya/screens/AnkiScreen.tsx` — modelada na `FocusScreen.tsx`: linha de KPIs (revisões
  hoje · streak · total no período · tempo total · retenção %), heatmap anual, barras por hora do
  dia, tabela por baralho.
- `pages/kaguya/ui/AnkiHeatmap.tsx` — **cópia** de `FocusHeatmap.tsx` com classes próprias
  `kg-aheat-*`. Isso é a convenção explícita do repo, não preguiça: os comentários de
  `HabitHeatmap.tsx` e `FocusHeatmap.tsx` registram a decisão de não compartilhar o componente
  entre features, pra cada um continuar editável de forma independente.
- `pages/kaguya/ui/AnkiHourBars.tsx` — mesma ideia a partir de `HourBars.tsx` (aqui sem a metade
  "pra baixo": barra única de revisões por hora).
- `kaguyaApi.ts` (`getAnkiStats`, `getAnkiHeatmap`) + `types.ts` + entrada `🃏 Anki` na sidebar do
  `KaguyaShell.tsx`, rota `/tasks/anki`.
- Datas: usar `lib/dateUtils.ts` (`todayISO`, `toISO`) — **nunca** `toISOString().slice(0,10)`.

*Opcional (só se sobrar fôlego):* card de "carga futura" (cards devidos nos próximos 7 dias, de
`cards.due` + `col.crt`). Exige entender o esquema de datas relativas do Anki — não bloqueia nada.

---

## Etapa 5 — Documentação

- `agents/anki/CLAUDE.md` — novo: schema, o job, a decisão da virada de dia, a nota de
  compatibilidade de versão do sync server, e o procedimento de rollback pro AnkiWeb.
- `CLAUDE.md` (raiz) — `agents/anki/` na árvore de arquivos + linha na tabela de agentes.
- `agents/kaguya/CLAUDE.md` — acrescentar `anki_reviews` na lista de providers da seção spec 036.
- `webapp/docs/API.md` — as duas rotas na seção `## Tasks`.
- `webapp/docs/FRONTEND.md` — a tela nova.
- `scheduler/CLAUDE.md` — linha do job `anki_sync` na tabela "Jobs atuais".
- `ROADMAP.md` — spec 068 + seção "Status atual".
- `docs/referencia/POSTGRES.md` — as 3 tabelas novas, coluna a coluna.
- Vault do Obsidian via skill `obsidian-vault`.

---

## Ordem de execução sugerida

1. **Etapas 2+3 primeiro, com dados de teste** — dá pra popular `anki_reviews` à mão e ver o hábito
   funcionando de ponta a ponta antes de mexer no seu sync do Anki. Zero risco.
2. **Etapa 1** (o sync server e a migração da coleção) só depois, com o `.colpkg` no bolso.
3. **Etapa 4** por último.

---

## Verificação

**Motores puros (local, sem infra):**
```bash
.venv\Scripts\python -m pytest tests/agents/test_anki_stats.py -v
```

**Job de sync (no VPS, depois do deploy):**
```bash
docker exec makima-scheduler python -m scheduler.main --list          # anki_sync aparece?
docker exec makima-scheduler python -m scheduler.main --run anki_sync  # roda à mão
```
```sql
-- via Adminer
SELECT count(*), max(reviewed_at AT TIME ZONE 'America/Sao_Paulo') FROM anki_reviews;
SELECT * FROM anki_sync_state;
SELECT job_name, status, duration_ms FROM scheduler_runs WHERE job_name='anki_sync' ORDER BY id DESC LIMIT 5;
```

**Provider:**
```bash
docker exec makima-web python -c "from agents.kaguya.habit_source_providers import list_providers, get_activity; print(list_providers()); print(get_activity('anki_reviews','2026-08-01','2026-08-31'))"
```

**Fluxo completo (o teste que importa):**
1. No webapp, criar o hábito "Flashcards" com fonte **Flashcards (Anki)** e frequência (ex. 6/7).
2. Revisar alguns cards no celular e deixar o AnkiDroid sincronizar.
3. Rodar `--run anki_sync` à mão (ou esperar a hora).
4. Recarregar a tela de Hábitos: o dia deve estar marcado com `done_today_source: "auto"`, sem
   você ter tocado no check-in. Conferir o heatmap anual mostrando a origem automática.
5. Fazer um check-in **manual** num dia sem revisão e confirmar que os dois convivem (o merge é
   união — um dia cumprido por qualquer fonte conta uma vez).

**Degradação (FR-008):** parar o container `makima-anki-sync` / esvaziar `anki_reviews` e confirmar
que a tela de Hábitos continua carregando normalmente, só sem os dias automáticos — nunca 500.
