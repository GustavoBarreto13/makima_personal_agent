# Quickstart — Verificação end-to-end da Lucy

Roteiro para provar que a fase funciona. Não contém código de implementação — só passos executáveis e
resultados esperados, referenciando [contracts/interfaces.md](contracts/interfaces.md) e
[data-model.md](data-model.md).

## Pré-requisitos

- `.venv` do makima com as deps do `requirements.txt` instaladas.
- Env vars setadas (local `.env` ou ambiente): `GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`,
  `GEMINI_API_KEY`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`.
  Opcional: `GEMINI_MODEL` (default `gemini-2.5-flash`).
- As **10 labels** de categoria já existem na conta Gmail (Art / Hobbies, Finance, Knowledge, Shopping,
  Personal, Health, Security, Work, Junk, Other).

## 1. Schema criado (FR-012)

```bash
# local, ou dentro do container: docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
python -m scripts.setup_schemas
```
**Esperado**: sem erro; a tabela `lucy_emails` existe.
```sql
SELECT to_regclass('public.lucy_emails');   -- não-nulo
\d lucy_emails                               -- colunas conforme data-model.md
```

## 2. Testes das partes puras

```bash
pytest tests/agents/test_lucy_parse.py tests/agents/test_lucy_digest.py -v
```
**Esperado**: verde. Cobrem decodificação de headers RFC2047, extração de snippet (com fallback HTML),
e `build_telegram_digest` (agrupamento por categoria, ocultação de `Junk`, cores de prioridade, caso
sem emails).

## 3. Agente interativo — somente leitura (US2 / FR-001..005, SC-005/SC-006)

```bash
python -m coordinator.main   # sobe o bot; enviar as mensagens abaixo no Telegram
```
- "Lucy, meus emails não lidos" → **Esperado**: lista ao vivo (remetente/assunto/data), resposta em
  português começando com "Lucy:", em ≤ 15 s.
- "Lucy, busca email do Nubank" → **Esperado**: resultados correspondentes.
- "Lucy, abre o primeiro" → **Esperado**: conteúdo do email.
- "Lucy, arquiva esse email" → **Esperado**: ela informa que só faz leitura; **nada muda na caixa**
  (verificar no Gmail que o email continua na inbox, sem label nova).

## 4. Digest manual (US1 / FR-006..011)

```bash
python -m scripts.send_lucy_digest
```
**Esperado**:
- (a) **Telegram**: chega 1 mensagem no formato do base — overview + INTEL BRIEFING + AÇÃO IMEDIATA +
  grupos por categoria (🔴/🟡/🟢), **sem** a seção Junk, rodapé com tokens/custo/hora.
- (b) **Gmail**: cada email de ontem ganhou a label da sua categoria; os `Junk` saíram da inbox
  (arquivados) e têm a label `Junk`.
- (c) **Postgres**: novas linhas em `lucy_emails`.
```sql
SELECT category, priority, action, subject
  FROM lucy_emails
 WHERE received_date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1
 ORDER BY category;
```

## 5. Idempotência (FR-013 / SC-004)

```bash
python -m scripts.send_lucy_digest   # roda de novo para o mesmo dia
```
**Esperado**: a contagem de linhas de ontem **não aumenta**; `classified_at` atualizado (sobrescrita).
```sql
SELECT COUNT(*) FROM lucy_emails
 WHERE received_date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
-- mesma contagem da etapa 4
```

## 6. Scheduler (FR-014)

```bash
python -m scheduler.main --list                 # 'lucy_digest' aparece com trigger 08:00
python -m scheduler.main --run lucy_digest       # executa on-demand
```
**Esperado**: execução registrada.
```sql
SELECT job_name, status, duration_ms
  FROM scheduler_runs
 WHERE job_name = 'lucy_digest'
 ORDER BY id DESC LIMIT 3;   -- status='success'
```

## 7. Caminho de falha (FR-014 / SC-007)

```bash
GMAIL_APP_PASSWORD=errado python -m scheduler.main --run lucy_digest
```
**Esperado**: `scheduler_runs.status='error'` para `lucy_digest` **e** um alerta chega no Telegram.
Nenhum digest parcial é enviado como se fosse sucesso.

## Critérios de aceite cobertos

| Passo | Requisitos / SC |
|---|---|
| 1 | FR-012 |
| 2 | FR-010 (layout), FR-007 (normalização) |
| 3 | FR-001..005, SC-005, SC-006 |
| 4 | FR-006..011, SC-001, SC-002, SC-003, SC-008 |
| 5 | FR-013, SC-004 |
| 6 | FR-014 |
| 7 | FR-014, FR-015, SC-007 |
