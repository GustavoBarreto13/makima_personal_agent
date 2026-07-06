# Research — Lucy (agente de Gmail)

Fase 0 do `/speckit-plan`. Resolve as decisões técnicas e os "NEEDS CLARIFICATION" implícitos
(nível-plano) antes do design. Formato por item: **Decisão · Justificativa · Alternativas rejeitadas**.

---

## R1. Acesso ao Gmail: IMAP + senha de app

**Decisão**: Conectar via `imaplib.IMAP4_SSL('imap.gmail.com')` autenticando com
`GMAIL_USERNAME` + `GMAIL_APP_PASSWORD`. Sem OAuth. Igual ao script base.

**Justificativa**: Decisão explícita do usuário (rodada de perguntas). É o mecanismo já provado no
n8n, stdlib pura (zero dependência nova), e suficiente para leitura + STORE de labels/arquivo. Envio
de email está fora de escopo, então SMTP/OAuth não são necessários.

**Alternativas rejeitadas**: Gmail API via OAuth (reaproveitando o app `GOOGLE_CALENDAR_*`) — mais
robusto e "próprio", mas exige re-autorizar com escopo Gmail e introduz o cliente `google-api-python-client`
no fluxo; rejeitado por YAGNI (Princípio V) já que só lemos/etiquetamos.

---

## R2. Identificador de idempotência: Gmail `X-GM-MSGID` (não o IMAP UID)

**Decisão**: A chave `gmail_uid` da tabela `lucy_emails` guarda o **`X-GM-MSGID`** (id de mensagem
permanente do Gmail, 64-bit), obtido no mesmo `FETCH`. O **IMAP UID** continua sendo usado apenas para
as operações `STORE` (aplicar label / arquivar) dentro da sessão, como no base.

**Justificativa**: FR-013/SC-004 exigem idempotência estável. IMAP UIDs são únicos só dentro de uma
mailbox e podem, em teoria, ser reatribuídos se `UIDVALIDITY` mudar; o `X-GM-MSGID` é imutável e
global à conta. O custo é uma linha a mais no comando de fetch
(`mail.uid('FETCH', uid, '(X-GM-MSGID RFC822)')`) e um regex para extrair o valor. Mantém a chave do
histórico correta mesmo entre execuções em dias diferentes.

**Alternativas rejeitadas**: (a) usar o IMAP UID como `gmail_uid` — mais simples e como o base o
tratava para STORE, mas frágil como chave persistente; (b) `Message-ID` do cabeçalho RFC822 — depende
do remetente e pode faltar/duplicar. O `X-GM-MSGID` é o identificador canônico do Gmail.

---

## R3. Classificação: `google-genai` one-shot com `response_schema` (não um Agent ADK)

**Decisão**: `agents/lucy/tools.py::classify_emails()` chama o Gemini via `google.genai` (client
`Client(api_key=GEMINI_API_KEY)`, `generate_content` com `config.response_mime_type="application/json"`
e `response_schema`), modelo `os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")`, com retry/backoff.
O **system prompt e as 10 diretrizes de categorização são copiados verbatim do base**.

**Justificativa**: O digest é batch determinístico-de-fluxo (não conversa); um `Agent` ADK completo
seria overhead. É exatamente o padrão adotado na spec 031 (Kurisu tutor: genai one-shot com JSON
estruturado a partir de um router, sem ADK). Preserva o comportamento do base (SC-008) e o schema de
saída `{uid, category, priority, summary, action}`. Modelo sobe de 2.0→2.5-flash por conformidade com
a constituição (Architecture Constraints); mantido configurável via env para paridade se preciso.

**Alternativas rejeitadas**: (a) rodar a classificação como uma tool do `lucy_agent` invocada pelo
coordinator — mistura o fluxo agendado com o ADK e viola o Princípio II; (b) manter `requests` cru
contra o endpoint REST do Gemini (como o base) — funciona, mas `google-genai` já está no projeto e dá
schema tipado + retries prontos.

**Nota de tokens/custo**: o rodapé do digest ("Tokens: X in | Y out · Custo ~$Z") é preservado; o
`google-genai` expõe `response.usage_metadata` (`prompt_token_count`, `candidates_token_count`) para
alimentar o mesmo cálculo do base.

---

## R4. Janela do digest: dia anterior calendário, em UTC-3, cap 50

**Decisão**: Buscar emails com critério IMAP `(SINCE "<ontem>" BEFORE "<hoje>")` onde "ontem"/"hoje"
são datas **locais** (America/Sao_Paulo), no formato `DD-Mon-YYYY`. Se houver > 50 resultados, usar os
50 mais recentes. Idêntico ao base.

**Justificativa**: Preserva o comportamento herdado (SC-002/SC-008). O critério IMAP `SINCE/BEFORE`
opera por data (não hora), então basta derivar as datas locais para respeitar o fuso do projeto.

**Alternativas rejeitadas**: janela deslizante de 24h — muda o conjunto de emails vs. o base e
complica reexecuções idempotentes; rejeitada.

---

## R5. Agendamento: `scheduler/` do repo (não n8n), `daily_at(8, 0)`

**Decisão**: Registrar `ScheduledJob(name="lucy_digest", func=run_lucy_digest, trigger=daily_at(8,0),
description=...)` em `scheduler/registry.py`; o wrapper `run_lucy_digest()` em `scheduler/jobs.py`
roda `python -m scripts.send_lucy_digest` via `subprocess`, levantando `RuntimeError` se
`returncode != 0`. O `runner.execute_with_logging()` já grava `scheduler_runs` e dispara alerta
Telegram em falha (FR-014).

**Justificativa**: Padrão declarativo já usado por backup/kurisu-sync/letterboxd (fase 032). Reaproveita
logging + alerta sem código novo. O digest aposenta o workflow n8n `FXeSRs23jMJvIUuj`.

**Alternativas rejeitadas**: manter o cron no n8n chamando o script — contraria o objetivo de trazer a
Lucy para dentro do Makima e duplicaria infra de agendamento.

---

## R6. Push do digest no Telegram: HTTP direto, `parse_mode=HTML`

**Decisão**: `send_lucy_digest.py` faz `POST https://api.telegram.org/bot<TOKEN>/sendMessage` com
`chat_id=TELEGRAM_ALERT_CHAT_ID`, `parse_mode="HTML"`, reusando o mesmo par bot/chat dos alertas do
scheduler (`scheduler/notify.py`). O layout HTML do base é preservado.

**Justificativa**: O digest herdado é HTML (negrito, agrupamento, emojis). É um envio proativo
single-shot — não passa pelo `python-telegram-bot` do coordinator (que responde a updates). Usuário
único → o chat de alerta é o chat do usuário.

**Alternativas rejeitadas**: (a) mandar via `python-telegram-bot` do coordinator — o coordinator é um
loop de polling que responde a mensagens, não um emissor agendado; acoplá-lo ao scheduler seria frágil.
(b) `parse_mode=Markdown` — quebraria o HTML já pronto do digest. Nota: se o par `TELEGRAM_*` do digest
precisar ser distinto do de alerta no futuro, basta uma env `LUCY_DIGEST_CHAT_ID`; hoje reusa-se
`TELEGRAM_ALERT_CHAT_ID` (documentado em coordinator/CLAUDE.md).

---

## R7. Agente interativo: 3 tools read-only, dados ao vivo por IMAP

**Decisão**: `lucy_agent` expõe exatamente `fetch_recent_emails(limit=10, unread_only=False)`,
`search_emails(query, limit=10)` e `get_email(uid)`. Todas leem ao vivo via `agents/lucy/gmail_imap.py`.
Nenhuma tool de escrita é registrada — a garantia de "somente leitura" (FR-005/SC-006) é estrutural
(as capacidades de STORE existem no módulo, mas **não** são expostas como tools do agente).

**Justificativa**: Decisão do usuário (só ler/buscar). Não expor tools de mutação é a defesa mais
forte contra ação acidental — o agente literalmente não tem como arquivar/enviar. `unread_only` cobre
"não lidos"; `limit` default 10 evita estourar a mensagem em caixas grandes (edge case).

**Alternativas rejeitadas**: expor tools de gerência com guardas por prompt — mais frágil (o LLM pode
ser induzido a usá-las); rejeitado em favor da ausência estrutural.

---

## R8. Persistência: `agents.db` + `_ensure_tables()`, upsert com sobrescrita

**Decisão**: `persist_classified()` usa `agents.db.get_conn()`/`run_dml()`. A tabela `lucy_emails` é
criada por `_ensure_tables()` (CREATE TABLE IF NOT EXISTS, chamado na carga do módulo — padrão
`agents/journal/tools.py`) **e** registrada em `scripts/setup_schemas.py`. Upsert:
`INSERT ... ON CONFLICT (gmail_uid) DO UPDATE SET ...` (sobrescreve categoria/prioridade/resumo/ação/
received_date/classified_at) — conforme Clarification 2026-07-05.

**Justificativa**: `agents.db` é o helper padrão (RealDictCursor, commit/rollback automáticos). O
duplo caminho de criação (ensure + setup_schemas) espelha o resto do repo: setup one-time no VPS +
segurança em runtime. `id` segue a convenção `TEXT PRIMARY KEY` com `str(uuid.uuid4())` gerado em
Python (como `agents/komi`), e `gmail_uid TEXT UNIQUE NOT NULL` é a chave natural do upsert.

**Alternativas rejeitadas**: `gen_random_uuid()` no SQL — exigiria a extensão `pgcrypto`; o repo gera
UUID em Python. `ON CONFLICT DO NOTHING` — rejeitado pela Clarification (o usuário escolheu sobrescrita).

---

## R9. Robustez do digest: falha por email não derruba o lote

**Decisão**: Aplicar label/arquivo e persistir cada email dentro de um `try/except` por item;
uma falha individual (ex.: label inexistente) é logada e o loop continua (FR-015). Falhas
estruturais (conexão IMAP, classificação Gemini após retries) abortam o job com exceção → o
scheduler registra erro e alerta (FR-014).

**Justificativa**: Distingue falha parcial (tolerável, best-effort) de falha estrutural (que invalida
o digest inteiro e não deve ser reportada como sucesso — edge cases da spec).

**Alternativas rejeitadas**: abortar tudo em qualquer erro — frágil demais para etiquetagem
best-effort; silenciar todas as falhas — mascararia problemas de conexão/classificação.

---

## Resumo das decisões

| # | Tema | Decisão |
|---|---|---|
| R1 | Acesso Gmail | IMAP + senha de app (stdlib), sem OAuth |
| R2 | Chave idempotência | `X-GM-MSGID` (persistência); IMAP UID só p/ STORE |
| R3 | Classificação | `google-genai` one-shot + `response_schema`, prompt do base, `gemini-2.5-flash` |
| R4 | Janela | dia anterior calendário (UTC-3), cap 50 |
| R5 | Agendamento | `scheduler/` do repo, `daily_at(8,0)` |
| R6 | Telegram | POST HTTP direto, `parse_mode=HTML`, chat de alerta |
| R7 | Agente | 3 tools read-only ao vivo; escrita não exposta |
| R8 | Persistência | `agents.db` + `_ensure_tables` + `setup_schemas`; upsert com sobrescrita |
| R9 | Robustez | erro por item tolerado; erro estrutural aborta+alerta |

Nenhum NEEDS CLARIFICATION remanescente.
