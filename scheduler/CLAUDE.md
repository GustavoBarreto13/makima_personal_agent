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
   Use `daily_at(hora, minuto)` para horário fixo, `every(hours=..., minutes=...)` para
   intervalo, ou `weekly_at(dia_da_semana, hora, minuto)` para um dia fixo da semana
   (ex.: `weekly_at("sun", 20, 0)` — todo domingo às 20:00). Todos já ficam no fuso de São Paulo.
4. **Redeploy** do container `makima-scheduler` (o build já traz o novo código).

Pronto — o job ganha log em `scheduler_runs` e alerta no Telegram em falha automaticamente.

## Arquivos

| Arquivo | Papel |
|---|---|
| `registry.py` | Lista declarativa `JOBS` + `ScheduledJob` + helpers `daily_at()`/`every()`/`weekly_at()` |
| `jobs.py` | Funções que embrulham os scripts existentes (backup, kurisu, letterboxd) |
| `runner.py` | `execute_with_logging(job)`: cronometra, grava `scheduler_runs`, alerta em falha |
| `notify.py` | `send_telegram_alert()` — POST na Bot API do Telegram (melhor esforço), só para **falha de job** (FR-011) |
| `notify_channels.py` | `send_notification()` — push multi-canal (WhatsApp/Telegram/Discord) via os webhooks `--deliver-only` do Hermes, para avisos **voltados ao usuário** (FR-012) |
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

## Gotcha: `job.next_run_time` antes de `scheduler.start()`

O log de startup (`main.py`, resumo "Agendador iniciado com N job(s)") lê
`scheduler.get_jobs()` **antes** de `scheduler.start()`. Com o `BlockingScheduler` ainda
parado, o APScheduler devolve os jobs "pendentes" direto de `_pending_jobs`, sem passar
por `_real_add_job` — em versões `>=3.11`, o objeto `Job` resultante **nem chega a
ganhar o atributo `next_run_time`** (não é `None`; o atributo não existe). Acessá-lo
direto derruba o container com `AttributeError: 'Job' object has no attribute
'next_run_time'` logo no boot (foi um crash loop real de produção, corrigido em
ago/2026 — commit `a381fc8`).

Fix: `getattr(job, "next_run_time", None) or "calculando no start()"` em vez de
`job.next_run_time` direto — funciona independente da versão do APScheduler instalada,
já que não depende do atributo existir.

## Variáveis de ambiente

Além das que cada job já usa (`DATABASE_URL`, `GCP_*`, `GCS_BACKUP_BUCKET`,
`VERTEX_RAG_CORPUS_OPERACIONAL`, `LETTERBOXD_USERNAME`, `TMDB_API_KEY`,
`GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`, `GEMINI_API_KEY`):

| Variável | Para quê |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do bot (já existe — o mesmo do coordinator) |
| `TELEGRAM_ALERT_CHAT_ID` | Chat que recebe os alertas de **falha de job** (`notify.py`, FR-011) |
| `HERMES_WEBHOOK_BASE_URL` | Base da app Hermes na rede interna (`http://makima-hermes:8644`) — usada por `notify_channels.send_notification()` |
| `WEBHOOK_SECRET` | Mesmo segredo HMAC cadastrado no Hermes (`hermes/config.yaml` → `platforms.webhook.extra.secret`) — assina os POSTs de notificação |
| `NOTIFY_DEFAULT_CHANNELS` | Canais usados quando um job não passa `channels=[...]` explícito (hoje `"whatsapp"` — ligar Telegram/Discord é só acrescentar aqui, ex. `"whatsapp,telegram"`) |

## Notificação para o usuário: `send_notification()` vs. `send_telegram_alert()`

Dois caminhos de saída, propositalmente separados (spec 064, User Story 5 — FR-011/FR-012):

- **`notify.send_telegram_alert(job_name, error_text)`** — só para **falha estrutural de
  job** (o próprio runner chama automaticamente). Fixo em Telegram, fala direto com a API
  (nunca passa pelo Hermes) — precisa continuar de pé mesmo se o Hermes cair.
- **`notify_channels.send_notification(message, channels=None)`** — para **avisos voltados
  ao usuário** (lembretes, digests, relatórios). Usa as rotas de webhook `--deliver-only`
  do Hermes (ver `hermes/CLAUDE.md` § "Notificações multi-canal") — WhatsApp, Telegram e/ou
  Discord, conforme `NOTIFY_DEFAULT_CHANNELS`. Todo job novo que precisa avisar o usuário
  deve chamar esta função, não reimplementar o POST direto ao Telegram.

```python
from scheduler.notify_channels import send_notification

if not send_notification("<b>Fez algo</b> que o usuário precisa saber."):
    raise RuntimeError("nenhum canal recebeu a notificação")
```

`send_notification` nunca levanta exceção por conta própria (falha de UM canal não afeta
os outros) — devolve `True`/`False` (pelo menos um canal recebeu?) para quem chama decidir
se isso é falha do job. Mensagem em HTML simples (`<b>`, `<i>`, `<code>`) — convertida para
markdown leve nos canais que não são Telegram.

## Jobs atuais

| Job | Quando | O que faz |
|---|---|---|
| `backup_postgres` | Todo dia 03:00 | `pg_dump` → Google Cloud Storage (`scripts/backup_postgres.py`) |
| `sync_kurisu` | Todo dia 04:00 | Memória unificada da Kurisu: Postgres → Vertex RAG (`agents/kurisu/memory/sync.py`) |
| `sync_letterboxd` | A cada 6h | Diário do Letterboxd (RSS) → catálogo da Akane (`scripts/sync_letterboxd.py`) |
| `lucy_digest` | Todo dia 08:00 | Digest matinal de emails (Lucy): classificação Gemini + labels/arquivo no Gmail + Telegram + histórico (`scripts/send_lucy_digest.py`) |
| `kaguya_digest` | Todo dia 07:00 | Digest matinal de tarefas/agenda (Kaguya): vencidas, hoje, Próximas Ações, Rápidas, agenda do dia, hábitos pendentes, capacidade, diário recente e RAG da Kurisu → sugestão de plano via Gemini → WhatsApp + histórico em `kaguya_digests` (`scripts/send_kaguya_digest.py`). A resposta do usuário é interpretada pelo próprio Hermes via `get_pending_kaguya_digest`/`apply_kaguya_digest_selection` — ver `hermes/skills/kaguya-tarefas/SKILL.md` |
| `weekly_review_reminder` | Todo domingo 20:00 | Lembrete da revisão semanal do GTD (Kaguya) → Telegram, **somente se** nenhuma revisão foi concluída nos últimos 7 dias (`scripts/send_weekly_review_reminder.py`, spec 035) |
| `recurring_charges` | Todo dia 08:30 | Cobranças recorrentes (Nami): avisa D-3, lança automaticamente assinaturas/contas fixas com `auto_lancar=True` (via `mark_subscription_paid`, atômico) e pede confirmação das contas fixas manuais no vencimento — mensagens do dia agrupadas numa notificação só (`scripts/process_recurring_charges.py`, spec 048) |
| `budget_alert` | Todo dia 09:00 | Alerta de orçamento (Nami): categorias ≥90% do limite ou estouradas no mês corrente → Telegram; silencioso se tudo dentro do limite (`scripts/send_budget_alert.py`, spec 048) |
| `monthly_report` | Todo dia 1º 08:00 | Relatório do fechamento do mês anterior (Nami): top categorias, comparação com o mês anterior a esse, score de saúde financeira (`scripts/send_monthly_report.py`, spec 048) |
| `marin_mal_sync` | A cada 6h | Sync delta com o MyAnimeList (Marin): pull converte progresso novo em sessões de ajuste no diário (nunca sobrescreve o contador direto), converge status/nota por timestamp mais recente conhecido, enriquece automaticamente animes novos; coexiste com o push best-effort disparado pelas mutações locais (`log_watch`/`update_anime_status`/`rate_anime`/`delete_watch_log`/`delete_anime` em `agents/marin/tools.py`) (`agents/marin/mal_sync.py`, spec 053) |
| ~~`kaguya_due_reminders`~~ | **Desativado** | Lembrete pontual de tarefas vencendo (Kaguya) via WhatsApp — implementado e validado em produção, mas **desativado a pedido do usuário** logo em seguida ("não gostei, deixa só pelo Calendar, vamos fazer de outra forma depois"). Código mantido (`scripts/send_kaguya_due_reminders.py`, `tools_tasks.py::list_tasks_due_for_reminder`/`mark_due_reminder_sent`, coluna `tasks.due_reminder_sent_at`) — só removido de `registry.py::JOBS`, não roda mais. Reaproveitar quando o novo desenho for definido |
