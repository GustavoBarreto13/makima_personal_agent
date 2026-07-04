# Backup do PostgreSQL — Makima

Backup automático diário do banco PostgreSQL da Makima: um `pg_dump` comprimido é enviado todo dia para um bucket no Google Cloud Storage (GCS) e apagado sozinho após 30 dias.

---

## Como roda automaticamente

Desde jul/2026 o backup é **um job do agendador** (pacote `scheduler/`, container
`makima-scheduler`), e não mais um container de loop próprio. O agendador usa o
[APScheduler](https://apscheduler.readthedocs.io/) e dispara o backup **todo dia às 03:00 (horário
de São Paulo)** — horário **fixo**, que não flutua mais com o redeploy.

O job está registrado em [`scheduler/registry.py`](../scheduler/registry.py):

```python
ScheduledJob("backup_postgres", run_backup, daily_at(3, 0), "pg_dump do PostgreSQL → GCS"),
```

A cada execução, o agendador grava uma linha na tabela **`scheduler_runs`** (início, fim, status,
duração) e, **se o backup falhar, manda um alerta no Telegram** (`TELEGRAM_ALERT_CHAT_ID`). Isso
resolve o problema histórico da falha silenciosa. O container tem `restart: unless-stopped`, então
volta sozinho se cair e sobe no boot do VPS.

> Detalhes do padrão de agendamento (como adicionar outros jobs, comandos, env vars) em
> [`scheduler/CLAUDE.md`](../scheduler/CLAUDE.md).

---

## Arquitetura / fluxo

```
container makima-scheduler (APScheduler, restart unless-stopped)
        ↓  job "backup_postgres" dispara todo dia 03:00 (BRT)
        ↓  scripts/backup_postgres.py
   pg_dump  →  gzip  →  upload           + grava linha em scheduler_runs
        ↓                                  (e alerta no Telegram se falhar)
gs://makima-backups/backups/backup_AAAAMMDD_HHMMSS.sql.gz
        ↓
lifecycle do bucket apaga objetos com mais de 30 dias
```

| Item | Valor |
|---|---|
| Container | `makima-scheduler`, imagem de [`scheduler/Dockerfile`](../scheduler/Dockerfile) (Python + deps + `postgresql-client` + `gzip`) |
| Agendamento | job `backup_postgres` em [`scheduler/registry.py`](../scheduler/registry.py) — `daily_at(3, 0)` |
| Script | [`scripts/backup_postgres.py`](../scripts/backup_postgres.py) |
| Formato do dump | `pg_dump --format=plain --no-owner --no-privileges`, comprimido com `gzip -6` |
| Bucket | `gs://makima-backups` · região `southamerica-east1` |
| Caminho dos objetos | `backups/backup_AAAAMMDD_HHMMSS.sql.gz` |
| Retenção | 30 dias (lifecycle do bucket apaga automaticamente) |
| Periodicidade | todo dia às 03:00 (BRT) |

### Variáveis de ambiente necessárias (no container)

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | conexão com o PostgreSQL (o script converte em `PGHOST`/`PGUSER`/etc. para o `pg_dump`) |
| `GCP_CREDENTIALS_JSON` | credenciais do service account (JSON como string) para o upload ao GCS |
| `GCP_PROJECT_ID` | projeto GCP do bucket |
| `GCS_BACKUP_BUCKET` | nome do bucket (default: `makima-backups`) |

---

## Como verificar se está funcionando

Acesso ao VPS: `ssh root@n8n.gusstavo42-vps.cloud`.

### 1. O container está no ar?

```bash
docker ps --filter "name=makima-scheduler" --format "{{.Names}} | {{.Image}} | {{.Status}}"
```

### 2. Os logs mostram sucesso?

```bash
docker logs --tail=40 makima-scheduler
```

No startup o agendador lista os jobs e o próximo disparo de cada um. Quando o backup roda, aparecem
as linhas `▶ Iniciando job 'backup_postgres'`, `Iniciando backup: ...`, `Dump gerado: ... KB`,
`✓ Backup enviado: gs://makima-backups/backups/...` e `■ Job 'backup_postgres' terminou: success`.

Alternativamente, consulte o histórico direto na tabela `scheduler_runs`:

```bash
docker exec makima-web sh -c "cd /app && python -c \"from agents.db import run_select; import json; print(json.dumps(run_select(\\\"SELECT job_name, status, started_at AT TIME ZONE 'America/Sao_Paulo' AS inicio, duration_ms FROM scheduler_runs ORDER BY id DESC LIMIT 5\\\"), default=str, ensure_ascii=False, indent=2))\""
```

### 3. Há backups recentes no bucket?

O host não tem `gcloud`, então liste o bucket via Python de dentro do `makima-web` (que tem as credenciais):

```bash
docker exec -i makima-web python - <<'PY'
import os, json
from google.cloud import storage
from google.oauth2 import service_account
info = json.loads(os.environ["GCP_CREDENTIALS_JSON"])
creds = service_account.Credentials.from_service_account_info(
    info, scopes=["https://www.googleapis.com/auth/devstorage.read_write"])
c = storage.Client(project=os.environ["GCP_PROJECT_ID"], credentials=creds)
name = os.environ.get("GCS_BACKUP_BUCKET", "makima-backups")
blobs = sorted(c.list_blobs(name, prefix="backups/"), key=lambda b: b.time_created, reverse=True)
print("total:", len(blobs))
for b in blobs[:10]:
    print(b.name, round(b.size/1024, 1), "KB", b.time_created)
PY
```

Confirme que existe um arquivo com timestamp das últimas 24h e tamanho coerente (não-vazio, na mesma ordem de grandeza dos anteriores).

---

## Backup manual (ad-hoc)

Útil antes de uma migração arriscada. Importante: o `makima-web` **não** tem o binário `pg_dump`, então rode de dentro do `makima-scheduler` (que tem o `pg_dump` e roda o backup pela mesma casca de log/alerta):

```bash
docker exec makima-scheduler python -m scheduler.main --run backup_postgres
```

Ele gera um backup imediato no bucket, grava a linha em `scheduler_runs` e, ao final, lista os 5 mais recentes.

---

## Como restaurar um backup

> ⚠️ **Restaurar sobrescreve dados.** Sempre teste primeiro em um banco descartável antes de restaurar no banco de produção. Valide o procedimento abaixo antes de depender dele numa emergência.

O dump é SQL puro (`--format=plain`), então a restauração é um `psql` simples. O `makima-scheduler` tem tanto o `psql` quanto a rede para alcançar o banco.

```bash
# 1. Baixar o backup desejado do GCS para dentro do container (via Python, que tem as credenciais)
docker exec -i makima-scheduler python - <<'PY'
import os, json
from google.cloud import storage
from google.oauth2 import service_account
ARQUIVO = "backups/backup_AAAAMMDD_HHMMSS.sql.gz"   # <-- troque pelo backup que quer restaurar
info = json.loads(os.environ["GCP_CREDENTIALS_JSON"])
creds = service_account.Credentials.from_service_account_info(
    info, scopes=["https://www.googleapis.com/auth/devstorage.read_write"])
c = storage.Client(project=os.environ["GCP_PROJECT_ID"], credentials=creds)
name = os.environ.get("GCS_BACKUP_BUCKET", "makima-backups")
c.bucket(name).blob(ARQUIVO).download_to_filename("/tmp/restore.sql.gz")
print("baixado em /tmp/restore.sql.gz")
PY

# 2. Descomprimir e restaurar (psql lê a DATABASE_URL do ambiente do container)
docker exec makima-scheduler sh -c "gunzip -f /tmp/restore.sql.gz && psql \"\$DATABASE_URL\" < /tmp/restore.sql"
```

Para restaurar em um banco **vazio de teste** em vez do de produção, troque `$DATABASE_URL` pela URL do banco descartável no comando `psql`.

---

## Histórico do conserto (2026-06-28)

Até 2026-06-28 o backup **nunca havia funcionado** — havia zero backups. Três falhas simultâneas foram corrigidas:

1. **`pg_dump` ausente** — a imagem antiga (`python:3.11-slim`) só fazia `pip install` e nunca instalava o `postgresql-client`. Corrigido com [`scripts/Dockerfile.backup`](../scripts/Dockerfile.backup).
2. **Bind mount `.:/app` frágil** — o Dokploy recria o diretório do código a cada redeploy, deixando o mount do container "stale" e o script inacessível. Corrigido assando `scripts/` na imagem via `COPY`.
3. **Bucket GCS inexistente** — `gs://makima-backups` nunca havia sido criado. Criado em `southamerica-east1` com lifecycle de 30 dias.

Detalhes do diagnóstico e da decisão de arquitetura estão no commit `fix(backup): conserta backup do Postgres que nunca funcionou`.

> **Atualização (jul/2026):** o antigo container de loop `makima-backup` (e o
> `scripts/Dockerfile.backup`) foram **aposentados**. O backup virou o job `backup_postgres` do
> agendador (`scheduler/`, container `makima-scheduler`) — mesmo `pg_dump`/bucket de antes, agora com
> horário fixo (03:00 BRT), log em `scheduler_runs` e alerta no Telegram em falha.
