# CLAUDE.md — scheduler/

## O que é

Padrão **único** para rodar scripts recorrentes na Makima — todo dia num horário fixo
(fuso São Paulo) ou de X em X tempo. Roda como o container dedicado **`makima-scheduler`**
usando [APScheduler](https://apscheduler.readthedocs.io/) (`BlockingScheduler`).

Substituiu os dois antigos containers de loop (`backup` e `kurisu-sync`, cada um com
`while true; sleep 86400`), que tinham 3 problemas: horário flutuante (reiniciava a cada
redeploy), não escalavam (1 serviço no compose por job) e falhavam em silêncio (foi assim
que o backup ficou meses quebrado — ver `docs/referencia/BACKUP_POSTGRES.md`).

## Como adicionar um job novo (o passo a passo)

1. **Tenha um script chamável** em `scripts/xxx.py` (uma função que faz o trabalho e
   **levanta exceção** se falhar).
2. **Crie um wrapper** em [`jobs.py`](jobs.py) — uma função sem argumentos que chama esse
   script. Se o script não levantar exceção em falha (ex.: retorna um contador de erros),
   cheque o resultado e `raise` você mesmo.
3. **Registre 1 linha** em [`registry.py`](registry.py), na lista `JOBS`:
   ```python
   ScheduledJob("meu_job", run_meu_job, daily_at(9, 30), "descrição curta"),
   ```
   Use `daily_at(hora, minuto)` para horário fixo ou `every(hours=..., minutes=...)` para
   intervalo. Ambos já ficam no fuso de São Paulo.
4. **Redeploy** do container `makima-scheduler` (o build já traz o novo código).

Pronto — o job ganha log em `scheduler_runs` e alerta no Telegram em falha automaticamente.

## Arquivos

| Arquivo | Papel |
|---|---|
| `registry.py` | Lista declarativa `JOBS` + `ScheduledJob` + helpers `daily_at()`/`every()` |
| `jobs.py` | Funções que embrulham os scripts existentes (backup, kurisu, letterboxd) |
| `runner.py` | `execute_with_logging(job)`: cronometra, grava `scheduler_runs`, alerta em falha |
| `notify.py` | `send_telegram_alert()` — POST na Bot API do Telegram (melhor esforço) |
| `main.py` | Entrypoint: monta o `BlockingScheduler` e agenda os jobs; modos `--run`/`--list` |
| `schema_pg.sql` | Tabela `scheduler_runs` (histórico de execuções) |
| `Dockerfile` | Imagem = base do webapp + `postgresql-client` + `gzip` (o backup precisa de pg_dump) |

## Observabilidade

Toda execução grava uma linha em **`scheduler_runs`** (`job_name`, `started_at`,
`finished_at`, `status` ∈ {running, success, error}, `error`, `duration_ms`). Em caso de
`error`, o bot manda um alerta no Telegram para `TELEGRAM_ALERT_CHAT_ID`.

Inspecionar as últimas execuções (via Adminer ou psql):
```sql
SELECT job_name, status,
       started_at  AT TIME ZONE 'America/Sao_Paulo' AS inicio_local,
       duration_ms
  FROM scheduler_runs
 ORDER BY id DESC
 LIMIT 20;
```

## Comandos úteis

```bash
# Rodar um job à mão (dentro do container do VPS):
docker exec makima-scheduler python -m scheduler.main --run backup_postgres

# Listar os jobs registrados e seus horários:
docker exec makima-scheduler python -m scheduler.main --list

# Ver o log do agendador (startup lista o próximo disparo de cada job):
docker logs -f makima-scheduler
```

## Variáveis de ambiente

Além das que cada job já usa (`DATABASE_URL`, `GCP_*`, `GCS_BACKUP_BUCKET`,
`VERTEX_RAG_CORPUS_OPERACIONAL`, `LETTERBOXD_USERNAME`, `TMDB_API_KEY`,
`GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`, `GEMINI_API_KEY`):

| Variável | Para quê |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do bot (já existe — o mesmo do coordinator) |
| `TELEGRAM_ALERT_CHAT_ID` | **Nova.** Chat que recebe os alertas de falha. Descubra o id mandando uma mensagem ao bot e lendo `https://api.telegram.org/bot<TOKEN>/getUpdates` |

## Jobs atuais

| Job | Quando | O que faz |
|---|---|---|
| `backup_postgres` | Todo dia 03:00 | `pg_dump` → Google Cloud Storage (`scripts/backup_postgres.py`) |
| `sync_kurisu` | Todo dia 04:00 | Memória unificada da Kurisu: Postgres → Vertex RAG (`agents/kurisu/memory/sync.py`) |
| `sync_letterboxd` | A cada 6h | Diário do Letterboxd (RSS) → catálogo da Akane (`scripts/sync_letterboxd.py`) |
| `lucy_digest` | Todo dia 08:00 | Digest matinal de emails (Lucy): classificação Gemini + labels/arquivo no Gmail + Telegram + histórico (`scripts/send_lucy_digest.py`) |
