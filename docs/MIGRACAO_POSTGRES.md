# Checklist de Deploy — Migração BigQuery → PostgreSQL

Todo o código já está pronto e commitado. Este documento contém apenas as ações manuais que precisam ser feitas **no VPS** para colocar em produção.

---

## Pré-requisitos

- Acesso SSH ao VPS
- Variáveis de ambiente `DATABASE_URL`, `GCP_PROJECT_ID` e `GCP_CREDENTIALS_JSON` já configuradas no `.env`
- Banco PostgreSQL rodando (já estava configurado para o ADK)

---

## Passo 1 — Puxar o código novo

```bash
cd /opt/makima_personal_agent
git pull origin master
```

---

## Passo 2 — Criar as tabelas no PostgreSQL

Este script cria todas as tabelas de Nami (finanças) e Frieren (livros) no PostgreSQL.
Se as tabelas já existirem, ele não faz nada (usa `CREATE TABLE IF NOT EXISTS`).

```bash
DATABASE_URL="postgresql://makima:gmi6BE1jPVPGVo1xY3Mv@personal-agent-makimadb-k3bxg9:5432/makima" python scripts/setup_schemas.py
```

Saída esperada:
```
Aplicando schema: agents/nami/schema_pg.sql
  ✓ agents/nami/schema_pg.sql aplicado com sucesso
Aplicando schema: agents/frieren/schema_pg.sql
  ✓ agents/frieren/schema_pg.sql aplicado com sucesso
Todos os schemas aplicados!
```

---

## Passo 3 — Migrar os dados do BigQuery para o PostgreSQL

Este script lê todos os dados existentes no BigQuery e insere no PostgreSQL.
É seguro rodar mais de uma vez — usa `ON CONFLICT DO NOTHING`.

```bash
DATABASE_URL="$DATABASE_URL" \
GCP_PROJECT_ID="$GCP_PROJECT_ID" \
GCP_CREDENTIALS_JSON="$GCP_CREDENTIALS_JSON" \
python scripts/migrate_bq_to_pg.py
```

Saída esperada (números variam):
```
→ Migrando nami_finance_agent.transactions → pg:transactions
  347 linhas | colunas: [id, name, valor, ...]
  ✓ transactions: 347 linhas migradas
...
✅ Migração concluída!
```

**Verificar contagem após a migração:**
```bash
python -c "
from agents.db import run_select
for t in ['transactions','subscriptions','accounts','credit_cards','loans','budgets','installment_groups','books','reading_logs']:
    n = run_select(f'SELECT COUNT(*) AS n FROM {t}')[0]['n']
    print(f'{t}: {n}')
"
```

---

## Passo 4 — Criar o bucket GCS para backups (uma vez só)

```bash
# Substituir SEU_PROJECT pelo GCP project ID
gcloud storage buckets create gs://makima-backups \
  --project=SEU_PROJECT \
  --location=southamerica-east1 \
  --uniform-bucket-level-access

# Configurar deleção automática após 30 dias
gcloud storage buckets update gs://makima-backups \
  --lifecycle-file=- <<'EOF'
{"lifecycle":{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}}
EOF
```

---

## Passo 5 — Adicionar as novas variáveis ao `.env`

Abrir o `.env` no VPS e adicionar:

```
GCS_BACKUP_BUCKET=makima-backups
DB_HOST=<host-do-postgres>   # ex: makima-db ou o hostname interno do Dokploy
```

O `DB_HOST` é o hostname que o Adminer vai usar para conectar ao PostgreSQL.
Para descobrir, olhar a `DATABASE_URL` — é o trecho entre `@` e `:porta`.

---

## Passo 6 — Rebuild e subir os containers

```bash
docker-compose build makima web
docker-compose up -d
```

Para subir também o Adminer e o backup:
```bash
docker-compose up -d adminer backup
```

---

## Passo 7 — Verificar logs

```bash
docker-compose logs --tail=50 makima
docker-compose logs --tail=50 web
```

Não deve aparecer nenhum `ImportError` de BigQuery nem erro de conexão PostgreSQL.

---

## Passo 8 — Testar o backup manualmente

```bash
python scripts/backup_postgres.py
```

Saída esperada:
```
Iniciando backup: backup_20260606_030000.sql.gz
Dump gerado: 42.3 KB
✓ Backup enviado: gs://makima-backups/backups/backup_20260606_030000.sql.gz

Últimos backups no GCS:
  backups/backup_20260606_030000.sql.gz (42.3 KB) — 2026-06-06 03:00
```

---

## Passo 9 — Acessar o Adminer

O Adminer fica disponível apenas via túnel SSH (nunca exposto na internet).

**No seu computador local:**
```bash
ssh -L 8082:localhost:8082 user@seu-vps
```

**No browser:**
```
http://localhost:8082
Sistema:  PostgreSQL
Servidor: <valor de DB_HOST>
Usuário:  <usuário da DATABASE_URL>
Senha:    <senha da DATABASE_URL>
```

---

## Passo 10 — Smoke test via Telegram

Enviar mensagens que exercitam Nami e Frieren:
- **Nami:** "quanto gastei esse mês?"
- **Frieren:** "quais livros estou lendo?"

---

## Resumo das variáveis de ambiente após a migração

| Variável | Antes | Depois |
|---|---|---|
| `DATABASE_URL` | Só sessões ADK | Sessões ADK + todos os dados de Nami e Frieren |
| `GCP_PROJECT_ID` | BigQuery | GCS backup |
| `GCP_CREDENTIALS_JSON` | BigQuery | GCS backup |
| `GCS_BACKUP_BUCKET` | — | **Nova** — nome do bucket de backup |
| `DB_HOST` | — | **Nova** — hostname do PostgreSQL (para o Adminer) |
