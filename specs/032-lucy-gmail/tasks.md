---
description: "Task list for Lucy — agente de Gmail (email)"
---

# Tasks: Lucy — agente de Gmail (email)

**Input**: Design documents from `specs/032-lucy-gmail/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/interfaces.md](contracts/interfaces.md)

**Tests**: Incluídos — o plano (Technical Context) e o quickstart.md pedem `pytest` para as partes puras
(parser de email + `build_telegram_digest`). Efeitos externos (IMAP/Gemini/Telegram) são verificados
manualmente via [quickstart.md](quickstart.md), não em unit tests.

**Organization**: Tarefas agrupadas por user story (US1 digest = MVP; US2 agente read-only; US3 histórico).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 / US2 / US3 (fases de setup/foundational/polish não têm label)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto do pacote e dependências.

- [ ] T001 Criar o pacote `agents/lucy/` com `agents/lucy/__init__.py` (docstring do pacote: domínio email, submódulos `gmail_imap`/`tools`/`agent`)
- [ ] T002 [P] Confirmar `google-genai` fixado em `requirements.txt` (adicionar a linha se ausente — foi fixado na spec 031; não duplicar)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Camada IMAP pura reusada por US1 (fetch + label/arquivo) e US2 (fetch/search/get).

**⚠️ CRITICAL**: US1 e US2 dependem desta fase.

- [ ] T003 Implementar `agents/lucy/gmail_imap.py`: `_connect()` (IMAP4_SSL + login por `GMAIL_USERNAME`/`GMAIL_APP_PASSWORD`) e `_decode(header)` (RFC2047), portados do base `main.py`
- [ ] T004 Adicionar em `agents/lucy/gmail_imap.py` a extração de corpo/snippet (~500 chars, texto puro com fallback para HTML com tags removidas) e `fetch_emails(criteria, limit)` — usa `mail.uid('SEARCH'...)` + `mail.uid('FETCH', uid, '(X-GM-MSGID RFC822)')`, retornando `{imap_uid, gmail_msgid, from_name, from_addr, subject, date, snippet}` (R2)
- [ ] T005 Adicionar em `agents/lucy/gmail_imap.py`: `get_email_full(uid)` (conteúdo completo) e as ops de escrita `apply_label(uid, label)` / `archive(uid)` (STORE ±X-GM-LABELS) — usadas só pelo digest, **não** expostas como tool (R7)
- [ ] T006 [P] Teste `tests/agents/test_lucy_parse.py`: decodificação de headers RFC2047, extração de snippet e fallback HTML (funções puras de `gmail_imap.py`)

**Checkpoint**: camada IMAP pronta e parseável — US1 e US2 podem começar.

---

## Phase 3: User Story 1 - Digest matinal automático (Priority: P1) 🎯 MVP

**Goal**: Digest diário às 8h no Telegram (classifica os emails de ontem, aplica labels, arquiva Junk,
formato do base). Entrega o valor central mesmo sem US2/US3.

**Independent Test**: `python -m scripts.send_lucy_digest` → digest chega no Telegram no formato antigo;
labels aplicadas e Junk arquivados no Gmail. (Sem depender do agente nem da persistência.)

- [ ] T007 [US1] Implementar `classify_emails(emails)` em `agents/lucy/tools.py`: `google.genai` one-shot com `response_schema` (contrato C), **system prompt + 10 diretrizes copiados verbatim do base**, modelo `GEMINI_MODEL` (default `gemini-2.5-flash`), retry/backoff, normalização de enum inválido, coleta de `usage_metadata` (tokens) (R3)
- [ ] T008 [US1] Implementar `build_telegram_digest(classified, usage)` em `agents/lucy/tools.py`: layout do base (overview + INTEL BRIEFING de `Knowledge` + AÇÃO IMEDIATA + grupos por categoria com 🔴/🟡/🟢, **Junk oculto**, rodapé tokens/custo/hora) e caso "sem emails" (FR-011)
- [ ] T009 [P] [US1] Teste `tests/agents/test_lucy_digest.py`: `build_telegram_digest` — agrupamento por categoria, ocultação de Junk, cores por prioridade, caminho sem emails
- [ ] T010 [US1] Implementar `scripts/send_lucy_digest.py`: buscar emails de ontem (UTC-3, `SINCE/BEFORE`, cap 50) via `gmail_imap` → `classify_emails` → por item aplicar label + arquivar Junk em `try/except` (FR-015) → montar digest → `POST` Telegram (`parse_mode=HTML`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALERT_CHAT_ID`) → resumo em stdout; `sys.exit(1)` em falha estrutural (R4/R6/R9)
- [ ] T011 [US1] Adicionar `run_lucy_digest()` em `scheduler/jobs.py` (subprocess `python -m scripts.send_lucy_digest`, `RuntimeError` se `returncode != 0`)
- [ ] T012 [US1] Registrar `ScheduledJob(name="lucy_digest", func=run_lucy_digest, trigger=daily_at(8,0), description=...)` na lista `JOBS` de `scheduler/registry.py` (importar `run_lucy_digest`)

**Checkpoint**: Digest funcional e agendado — MVP entregável (sem persistência ainda).

---

## Phase 4: User Story 2 - Consultar emails sob demanda (Priority: P2)

**Goal**: `lucy_agent` (read-only) acionável pela Makima: ver não lidos/recentes, buscar, abrir email.

**Independent Test**: no Telegram, "Lucy, meus não lidos" e "busca email do Nubank" retornam ao vivo;
pedir para arquivar → ela recusa (só leitura), caixa intacta.

- [ ] T013 [US2] Implementar as 3 tools read-only em `agents/lucy/tools.py` (contrato A): `fetch_recent_emails(limit=10, unread_only=False)`, `search_emails(query, limit=10)`, `get_email(uid)` — wrappers sobre `gmail_imap`, retorno `{"status":"ok"/"error", ...}`, nunca levantam exceção; **nenhuma tool de escrita** (R7)
- [ ] T014 [US2] Criar `agents/lucy/agent.py`: `lucy_agent` singleton (`gemini-2.5-flash`, persona Lucy/Cyberpunk, respostas PT-BR/HTML começando com "Lucy:", `description` para roteamento, `tools=[fetch_recent_emails, search_emails, get_email]`)
- [ ] T015 [US2] Ativar no `coordinator/agent.py`: descomentar `from agents.lucy.agent import lucy_agent`, adicionar a `sub_agents`, remover "(ainda não ativada)" e acrescentar o bloco `ROTEAMENTO PARA LUCY` (emails/Gmail/não lidos/buscar — sem enviar/gerenciar)

**Checkpoint**: US1 e US2 funcionam de forma independente.

---

## Phase 5: User Story 3 - Histórico de emails classificados (Priority: P3)

**Goal**: Persistir cada email classificado (upsert idempotente por `gmail_uid`) — o digest passa a
gravar histórico.

**Independent Test**: rodar o digest 2x para o mesmo dia → mesma contagem de linhas em `lucy_emails`,
`classified_at` atualizado.

- [ ] T016 [P] [US3] Criar `agents/lucy/schema_pg.sql`: tabela `lucy_emails` + índice `idx_lucy_emails_cat_date` (conforme [data-model.md](data-model.md))
- [ ] T017 [US3] Adicionar `_ensure_tables()` (CREATE TABLE IF NOT EXISTS) em `agents/lucy/tools.py`, chamado na carga do módulo (padrão `agents/journal/tools.py`)
- [ ] T018 [US3] Implementar `persist_classified(records)` em `agents/lucy/tools.py`: upsert `INSERT ... ON CONFLICT (gmail_uid) DO UPDATE` via `agents.db` (`id` = `str(uuid.uuid4())`, `gmail_uid` = X-GM-MSGID, `received_date` local UTC-3) — sobrescrita (Clarification 2026-07-05)
- [ ] T019 [P] [US3] Registrar `"agents/lucy/schema_pg.sql"` na lista `SCHEMA_FILES` de `scripts/setup_schemas.py`
- [ ] T020 [US3] Chamar `persist_classified(...)` ao final de `scripts/send_lucy_digest.py`, mapeando cada classificação → registro (inclui `gmail_msgid` e `received_date`)

**Checkpoint**: histórico persistido e idempotente; todas as user stories funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentação e validação final (checklist de entrega do CLAUDE.md do projeto).

- [ ] T021 [P] Criar `agents/lucy/CLAUDE.md` (tools, schema `lucy_emails`, personalidade Lucy, decisões locais IMAP/genai/HTML)
- [ ] T022 [P] Atualizar docs: `ROADMAP.md` (Fase 4/Lucy ✅), `docs/referencia/POSTGRES.md` (tabela `lucy_emails` coluna a coluna), `CLAUDE.md` raiz (árvore de arquivos + linha da Lucy na tabela de agentes ⏳→✅), `coordinator/CLAUDE.md` (env vars `GMAIL_*` + Lucy ativa), `scheduler/CLAUDE.md` (job `lucy_digest`), `README.md` (1 linha)
- [ ] T023 [P] Refletir a mudança no vault do Obsidian (skill `obsidian-vault`)
- [ ] T024 Rodar a validação end-to-end do [quickstart.md](quickstart.md) (7 passos) e confirmar SC-001..SC-008

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — começa já.
- **Foundational (Phase 2)**: depende do Setup — **bloqueia US1 e US2**.
- **US1 (Phase 3)**: depende da Foundational. MVP.
- **US2 (Phase 4)**: depende da Foundational. Independente do US1 no comportamento (compartilha `tools.py`, mas não usa `classify`/digest).
- **US3 (Phase 5)**: componentes (tabela, `persist_classified`) são standalone; o **teste end-to-end** (rodar o digest 2x) e T020 dependem do script do US1. Ordenar após US1.
- **Polish (Phase 6)**: depois das user stories desejadas.

### User Story Dependencies

- **US1 (P1)**: só Foundational. Sem dependência de outras stories.
- **US2 (P2)**: só Foundational. Independentemente testável.
- **US3 (P3)**: depende do US1 para o fluxo do digest (T020 edita o script do US1).

### Within Each Story / File contention

- `agents/lucy/tools.py` é tocado por T007, T008 (US1), T013 (US2), T017, T018 (US3) → **mesmo arquivo, sequencial** (nunca marcados [P] entre si).
- `scripts/send_lucy_digest.py`: T010 (cria) → T020 (adiciona persist) — sequencial.
- Testes ([P]) só passam depois do código-alvo existir.

### Parallel Opportunities

- **Setup**: T002 [P] em paralelo com T001.
- **Foundational**: T006 [P] (teste) após T003–T005 (mesmo arquivo, sequenciais entre si).
- **US1**: T009 [P] (teste) em paralelo com o resto após T008.
- **US3**: T016 [P] (schema) e T019 [P] (setup_schemas) em paralelo — arquivos distintos.
- **Polish**: T021, T022, T023 [P] em paralelo (docs distintas); T024 por último.

---

## Parallel Example: Foundational + US1

```bash
# Depois de T003–T005 (gmail_imap.py pronto), os testes podem correr junto do trabalho de US1:
Task: "T006 [P] tests/agents/test_lucy_parse.py"
Task: "T009 [P] tests/agents/test_lucy_digest.py"   # após T008
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 (Setup) → Phase 2 (Foundational — bloqueia tudo) → Phase 3 (US1).
2. **PARAR e VALIDAR**: `python -m scripts.send_lucy_digest` + conferir Telegram/Gmail (quickstart passos 4).
3. Deploy/uso já entrega o valor central (substitui o n8n).

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → testar → deploy (MVP: digest agendado).
3. US2 → testar → deploy (consulta interativa pela Makima).
4. US3 → testar → deploy (histórico idempotente).
5. Polish (docs + Obsidian + quickstart completo).

---

## Notes

- Total: **24 tarefas** (Setup 2 · Foundational 4 · US1 6 · US2 3 · US3 5 · Polish 4).
- `[P]` = arquivos diferentes, sem dependência pendente.
- Garantia read-only do US2 é **estrutural**: escrita existe em `gmail_imap.py` mas não é tool.
- Segredos: durante a exploração, credenciais reais do base vazaram em texto claro — trocar a senha de
  app do Gmail e o token do bot antes/depois do deploy (fora do escopo de tasks, mas recomendado).
- Commit após cada task ou grupo lógico (quando o usuário pedir — regra de não commitar sozinho).
