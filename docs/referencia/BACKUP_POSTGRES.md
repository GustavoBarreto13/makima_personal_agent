# Backup do PostgreSQL — Makima

Backup automático diário do banco PostgreSQL da Makima: um `pg_dump` comprimido é enviado todo dia para um bucket no Google Cloud Storage (GCS) e apagado sozinho após 30 dias.

---

## Como roda automaticamente

O backup **não é um cron job**. É um container Docker (`makima-backup`) que fica **ligado para sempre** rodando um loop. Dois mecanismos garantem a automação:

### 1. O loop infinito dentro do container

O `CMD` da imagem (em [`scripts/Dockerfile.backup`](../scripts/Dockerfile.backup)) é, em essência:

```sh
while true; do                                  # repete para sempre
  python scripts/backup_postgres.py || echo 'Backup falhou (ver erro acima)'
  echo 'Proximo backup em 24h'
  sleep 86400                                   # dorme 24 horas (86400 segundos)
done
```

Ou seja, o processo principal do container **nunca termina**: faz um backup, dorme 1 dia, faz outro, dorme 1 dia... É daí que vem a periodicidade diária. Se um backup falhar, o `|| echo` evita derrubar o loop — ele apenas registra a falha e tenta de novo no próximo ciclo.

### 2. `restart: unless-stopped` mantém o container vivo

No [`docker-compose.yml`](../docker-compose.yml) o serviço `backup` tem `restart: unless-stopped`. Isso faz o container:

- **voltar sozinho** se o processo cair, e
- **subir junto no boot** do VPS, se a máquina reiniciar.

> ⚠️ **O horário "flutua".** Como o intervalo é `sleep 24h` contado a partir de quando o container subiu, não existe um horário fixo (tipo "03:00"). Se você redeployar às 14h, os backups passam a acontecer ~14h todo dia. **Cada redeploy reinicia esse relógio e dispara um backup na hora.**

---

## Arquitetura / fluxo

```
container makima-backup (loop 24h, restart unless-stopped)
        ↓  scripts/backup_postgres.py
   pg_dump  →  gzip  →  upload
        ↓
gs://makima-backups/backups/backup_AAAAMMDD_HHMMSS.sql.gz
        ↓
lifecycle do bucket apaga objetos com mais de 30 dias
```

| Item | Valor |
|---|---|
| Imagem do container | construída de [`scripts/Dockerfile.backup`](../scripts/Dockerfile.backup) (Python + `postgresql-client` + `gzip`) |
| Script | [`scripts/backup_postgres.py`](../scripts/backup_postgres.py) |
| Formato do dump | `pg_dump --format=plain --no-owner --no-privileges`, comprimido com `gzip -6` |
| Bucket | `gs://makima-backups` · região `southamerica-east1` |
| Caminho dos objetos | `backups/backup_AAAAMMDD_HHMMSS.sql.gz` |
| Retenção | 30 dias (lifecycle do bucket apaga automaticamente) |
| Periodicidade | a cada 24h enquanto o container estiver no ar |

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
docker ps --filter "name=makima-backup" --format "{{.Names}} | {{.Image}} | {{.Status}}"
```

A imagem **não** deve ser `python:3.11-slim` (essa era a versão quebrada antiga) — deve ser a imagem buildada do `Dockerfile.backup`.

### 2. Os logs mostram sucesso?

```bash
docker logs --tail=40 makima-backup
```

Esperado: linhas `Iniciando backup: ...`, `Dump gerado: ... KB`, `✓ Backup enviado: gs://makima-backups/backups/...`. **Não** deve aparecer `FileNotFoundError: 'pg_dump'` nem `can't open file 'scripts/backup_postgres.py'`.

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

Útil antes de uma migração arriscada. Importante: o `makima-web` **não** tem o binário `pg_dump`, então rode de dentro de um container que tenha (o `makima-backup`):

```bash
docker exec makima-backup python scripts/backup_postgres.py
```

Ele gera um backup imediato no bucket e, ao final, lista os 5 mais recentes.

---

## Como restaurar um backup

> ⚠️ **Restaurar sobrescreve dados.** Sempre teste primeiro em um banco descartável antes de restaurar no banco de produção. Valide o procedimento abaixo antes de depender dele numa emergência.

O dump é SQL puro (`--format=plain`), então a restauração é um `psql` simples. O `makima-backup` tem tanto o `psql` quanto a rede para alcançar o banco.

```bash
# 1. Baixar o backup desejado do GCS para dentro do container (via Python, que tem as credenciais)
docker exec -i makima-backup python - <<'PY'
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
docker exec makima-backup sh -c "gunzip -f /tmp/restore.sql.gz && psql \"\$DATABASE_URL\" < /tmp/restore.sql"
```

Para restaurar em um banco **vazio de teste** em vez do de produção, troque `$DATABASE_URL` pela URL do banco descartável no comando `psql`.

---

## Histórico do conserto (2026-06-28)

Até 2026-06-28 o backup **nunca havia funcionado** — havia zero backups. Três falhas simultâneas foram corrigidas:

1. **`pg_dump` ausente** — a imagem antiga (`python:3.11-slim`) só fazia `pip install` e nunca instalava o `postgresql-client`. Corrigido com [`scripts/Dockerfile.backup`](../scripts/Dockerfile.backup).
2. **Bind mount `.:/app` frágil** — o Dokploy recria o diretório do código a cada redeploy, deixando o mount do container "stale" e o script inacessível. Corrigido assando `scripts/` na imagem via `COPY`.
3. **Bucket GCS inexistente** — `gs://makima-backups` nunca havia sido criado. Criado em `southamerica-east1` com lifecycle de 30 dias.

Detalhes do diagnóstico e da decisão de arquitetura estão no commit `fix(backup): conserta backup do Postgres que nunca funcionou`.
