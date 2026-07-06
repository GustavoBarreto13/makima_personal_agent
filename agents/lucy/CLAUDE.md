# CLAUDE.md — agents/lucy

## O que é este agente

**Lucy** é o agente de email (Gmail) do sistema Makima. Inspirada em Lucy de
*Cyberpunk: Edgerunners* — netrunner fria e eficiente, direta, sem enrolação.

Duas metades independentes (spec 032):

1. **Agente interativo `lucy_agent`** (singleton ADK, sem MCP) — **somente leitura** via
   IMAP: ver não lidos/recentes, buscar no inbox, abrir um email. Zero mutação da caixa.
2. **Script agendado `scripts/send_lucy_digest.py`** — roda diário às 08:00
   (America/Sao_Paulo) via `scheduler/`: busca os emails de ontem (cap 50), classifica
   cada um com o Gemini, aplica labels + arquiva os "Junk" no Gmail, envia o digest no
   Telegram, e persiste o histórico na tabela `lucy_emails`.

Aposenta o script externo `n8n-python-scripts/lucy_email_agent/main.py`.

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
lucy_agent (Agent ADK — singleton, sem MCP)
    └── tools.py (read-only: fetch_recent_emails, search_emails, get_email)
            └── gmail_imap.py → IMAP (imap.gmail.com)

scheduler (makima-scheduler, 08:00 America/Sao_Paulo)
    ↓
scripts/send_lucy_digest.py
    ├── gmail_imap.fetch_emails()      → busca emails de ontem
    ├── tools.classify_emails()        → Gemini one-shot (google-genai)
    ├── gmail_imap.apply_label/archive → labels + arquivamento (Junk)
    ├── tools.build_telegram_digest()  → HTML do digest
    ├── POST Telegram (parse_mode=HTML)
    └── tools.persist_classified()     → upsert em lucy_emails
```

**Lucy é singleton** — não usa `McpToolset`, não precisa de factory function.
Instância global `lucy_agent` em `agent.py`, importada diretamente pelo coordinator.

---

## Módulos

| Arquivo | Papel |
|---|---|
| `gmail_imap.py` | Camada IMAP **pura**: `_connect`, `_decode` (RFC2047), `fetch_emails`, `get_email_full`, `apply_label`/`archive` (escrita — usadas só pelo digest), `yesterday_search_criteria` |
| `tools.py` | 3 tools read-only do agente + `classify_emails` (Gemini) + `build_telegram_digest` + `persist_classified` + `_ensure_tables` |
| `agent.py` | `lucy_agent` singleton (persona Lucy, `gemini-2.5-flash`) |
| `schema_pg.sql` | Tabela `lucy_emails` |

---

## Garantia de somente-leitura (estrutural, não por prompt)

`gmail_imap.apply_label()` e `gmail_imap.archive()` existem no módulo (usadas pelo
digest agendado), mas **não** são importadas em `agent.py` nem registradas em
`tools=[...]`. O `lucy_agent` literalmente não tem como chamar essas funções — não há
guarda de prompt que possa ser contornada por injeção, a ausência é estrutural.

---

## Schema PostgreSQL

### Tabela `lucy_emails`

Histórico de cada email processado pelo digest, autocontida (sem FKs — Princípio III).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT PK | UUID gerado em Python (`str(uuid.uuid4())`) |
| `gmail_uid` | TEXT UNIQUE NOT NULL | **X-GM-MSGID** (id permanente do Gmail) — chave do upsert idempotente |
| `from_name` / `from_addr` | TEXT | Remetente (nome decodificado RFC2047 / endereço) |
| `subject` | TEXT | Assunto decodificado |
| `category` | TEXT NOT NULL | Uma das 10 categorias fixas |
| `priority` | TEXT | `high` \| `medium` \| `low` |
| `summary` | TEXT | Resumo de 1 linha (IA) |
| `action` | TEXT | `arquivar` \| `responder` \| `ler` \| `agir` \| `ignorar` |
| `received_date` | DATE | Data local (America/Sao_Paulo) de recebimento |
| `classified_at` | TIMESTAMPTZ | Momento da classificação; atualizado no upsert |

**Índice**: `idx_lucy_emails_cat_date ON lucy_emails (category, received_date DESC)`.

**Upsert (idempotência)**: `INSERT ... ON CONFLICT (gmail_uid) DO UPDATE SET ...` —
reexecutar o digest para o mesmo dia sobrescreve o registro existente (Clarification
2026-07-05), nunca duplica.

**Por que `gmail_uid` = X-GM-MSGID e não o IMAP UID**: o IMAP UID é único só dentro da
mailbox e pode, em teoria, ser reatribuído (`UIDVALIDITY`); o X-GM-MSGID é imutável e
global à conta Gmail — chave estável para o histórico entre execuções.

---

## Enum de categorias (fixo, copiado do script base)

| Categoria | Emoji | Tratamento no digest |
|---|---|---|
| `Art / Hobbies` | 🎭 | grupo normal |
| `Finance` | 💵 | grupo normal |
| `Knowledge` | 🎓 | grupo normal + alimenta o INTEL BRIEFING |
| `Shopping` | 🛒 | grupo normal |
| `Personal` | 👤 | grupo normal |
| `Health` | ⚕️ | grupo normal |
| `Security` | 🔒 | grupo normal + alimenta AÇÃO IMEDIATA |
| `Work` | 💼 | grupo normal |
| `Junk` | 🗑️ | **oculto** no digest; label aplicada + arquivado (fora da inbox) |
| `Other` | 🗂️ | grupo normal; fallback de categoria inválida |

**Pré-requisito operacional**: as 10 labels precisam existir na conta Gmail antes do
primeiro digest — o script não as cria.

Valores fora do enum (vindos do Gemini) são normalizados: `category` → `Other`,
`priority` → `low`, `action` → `ler`.

---

## Classificação (Gemini one-shot, `google-genai`)

`classify_emails(emails)` chama `genai.Client(api_key=GEMINI_API_KEY).models.generate_content`
com `response_mime_type="application/json"` e `response_schema` (array de
`{uid, category, priority, summary, action}`). Modelo: `GEMINI_MODEL` (default
`gemini-2.5-flash`; o script base do n8n usava `gemini-2.0-flash`).

- System prompt + as 10 diretrizes de categorização são **cópia verbatim** do base
  (`n8n-python-scripts/lucy_email_agent/main.py`).
- Retry com backoff exponencial (`_MAX_RETRIES=3`, `_RETRY_BACKOFF=15s`) — falha após
  esgotar as tentativas levanta `ClassificationError` (falha estrutural, aborta o job).
- `resp.usage_metadata` alimenta o rodapé de tokens/custo do digest.

**Diferença do contrato do base**: o schema aqui é só o **array** de classificações — o
`overview`/`intel_briefing`/`action_items` do script antigo (que vinham do próprio
Gemini) são **derivados algoritmicamente** em `build_telegram_digest`:
- `overview`: frase determinística com a contagem de emails não-Junk.
- `INTEL BRIEFING`: concatenação dos `summary` dos emails `Knowledge`.
- `AÇÃO IMEDIATA`: emails `Security` ou (`priority=high` E `action` em `agir`/`responder`).

---

## Digest (`build_telegram_digest`)

Layout herdado do base, HTML (`parse_mode=HTML` no Telegram):

```
🕸️ LUCY — Net Scan Matinal
━━━━━━━━━━━━━━━━━━
"overview (voz Lucy)"

🌐 INTEL BRIEFING:
[resumo consolidado do Knowledge]

🚨 AÇÃO IMEDIATA:
• item crítico 1
• item crítico 2

🎭 Art / Hobbies (N)
  🔴/🟡/🟢 resumo

━━━━━━━━━━━━━━━━━━
🧠 Tokens: X in | Y out
💸 Custo: ~$Z
🕗 HH:MM
```

Caso sem emails (FR-011): mensagem de "caixa limpa", sem seções, sem tratar como erro.

---

## Tools do `lucy_agent` (contrato A — somente leitura)

| Tool | Retorno |
|---|---|
| `fetch_recent_emails(limit=10, unread_only=False)` | `{"status":"ok","emails":[{uid, from_name, from_addr, subject, date}...]}` |
| `search_emails(query, limit=10)` | Mesmo formato + `snippet` |
| `get_email(uid)` | `{"status":"ok","email":{from_name, from_addr, subject, date, body}}` |

Todas retornam `{"status":"error","message": str}` em falha — **nunca** levantam exceção.

---

## Job agendado — `scripts/send_lucy_digest.py`

```bash
python -m scripts.send_lucy_digest
```

1. Busca emails de ontem (UTC-3, `SINCE/BEFORE`, cap 50) via `gmail_imap.fetch_emails`.
2. Classifica com `classify_emails` (falha estrutural → `sys.exit(1)`).
3. Para cada email: aplica label + arquiva se `Junk`, em `try/except` por item — falha
   individual é logada e não derruba o lote (FR-015).
4. Monta e envia o digest ao Telegram (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALERT_CHAT_ID`).
5. Persiste o histórico via `persist_classified`.

Registrado no scheduler (`scheduler/registry.py`, job `lucy_digest`, `daily_at(8, 0)`) —
ver `scheduler/CLAUDE.md` para o padrão geral de jobs.

---

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `GMAIL_USERNAME` | sim | Endereço Gmail (login IMAP) |
| `GMAIL_APP_PASSWORD` | sim | Senha de app do Gmail (não a senha normal — IMAP + 2FA) |
| `GEMINI_API_KEY` | sim | Chave do Gemini (classificação) |
| `GEMINI_MODEL` | não (default `gemini-2.5-flash`) | Modelo usado na classificação |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID` | sim (digest) | Envio do digest (reusa o par do scheduler) |
| `DATABASE_URL` | sim | PostgreSQL compartilhado — `lucy_emails` |

---

## Escopo (o que NÃO faz)

- Não envia, responde, arquiva, deleta ou marca emails pelo agente interativo.
- Não usa OAuth/Gmail API — IMAP + senha de app, decisão do usuário.
- Não porta o `clean_inbox.py` do n8n (limpeza em massa) — fora de escopo.
- Não tem tela no webapp para `lucy_emails` — schema pronto, UI é fase futura.
