# Quickstart: validar GTD core (Kaguya) — spec 034

## Pré-requisitos

- Ambiente local rodando (`python -m coordinator.main` + webapp backend/frontend — ver
  `CLAUDE.md` raiz, seção "Como rodar localmente").
- Schema aplicado: `python -m scripts.setup_schemas` (aplica as novas colunas/tabela e roda a
  migração idempotente das tags reservadas — ver `data-model.md`).
- Pelo menos uma tarefa antiga marcada com `#aguardando` ou `#algum-dia` (para validar a
  migração), e algumas tarefas soltas no Inbox sem data (para validar o processamento).

## Cenário 1 — Migração das tags reservadas (US3, FR-010)

1. Antes de rodar o schema, anote uma tarefa com `#aguardando` e outra com `#algum-dia`.
2. Rode `python -m scripts.setup_schemas` (ou o schema completo, conforme o ambiente).
3. `GET /api/tasks/filters/builtin/waiting/tasks` → a tarefa aparece, com `waiting_since`
   preenchido (timestamp da migração) e **sem** a tag `#aguardando` em `task_tags`.
4. `GET /api/tasks/filters/builtin/someday/tasks` → idem para `#algum-dia`.
5. Rode o schema **de novo** (idempotência) → nenhuma duplicação, nenhum erro.

**Esperado**: SC-004 — zero tarefas com as tags reservadas; 100% das que tinham exibem o status
equivalente.

## Cenário 2 — Processar o inbox item a item (US1)

1. `GET /api/tasks/inbox/queue` → lista os itens não processados do Inbox.
2. Para cada item, chame `POST /api/tasks/inbox/{id}/process` com uma decisão diferente:
   - `{"decision": "next_action", "context_id": null}`
   - `{"decision": "waiting", "waiting_note": "orçamento do João"}`
   - `{"decision": "someday"}`
   - `{"decision": "schedule", "due_date": "2026-07-15"}`
   - `{"decision": "done"}`
   - `{"decision": "trash"}`
3. `GET /api/tasks/inbox/queue` de novo → fila vazia (ou só os itens não tocados).

**Esperado**: SC-001/SC-002 — fila esvazia, cada item no destino esperado.

## Cenário 3 — Views fixas de mercado (US2, FR-006/FR-007)

1. Crie 4 tarefas: uma vencida (`due_date` ontem), uma para hoje, uma para amanhã, uma em 10
   dias.
2. `GET /api/tasks/views/today` → inclui a vencida e a de hoje.
3. `GET /api/tasks/views/tomorrow` → só a de amanhã.
4. `GET /api/tasks/views/next7` → hoje + amanhã, **não** a de 10 dias.
5. `GET /api/tasks/views/counts` → contadores batem com o conteúdo de cada view.
6. Repita os passos 2–4 num horário após as 21h (fuso local) → mesmo resultado (sem bug UTC).

**Esperado**: SC-003.

## Cenário 4 — Contextos (US4)

1. `POST /api/tasks/contexts` com `{"name": "@casa"}` e outro com `{"name": "@rua"}`.
2. Tente criar `{"name": "@Casa"}` (case diferente) → erro (nome único case-insensitive).
3. `PATCH /api/tasks/{id}` de duas tarefas distintas com `context_id` de cada contexto.
4. Filtre por contexto (`context_id eq` na DSL de smart-list ou endpoint equivalente) → só as
   tarefas certas aparecem.
5. `DELETE /api/tasks/contexts/{id}` de `@rua` → as tarefas que o usavam continuam existindo,
   só com `context_id = null`.

**Esperado**: SC-005.

## Cenário 5 — Telegram (US5)

1. No bot: "Kaguya, vamos processar o inbox" → ela apresenta um item com botões inline
   (`ibx_*`).
2. Clique em um botão → a tarefa muda de estado, o próximo item aparece.
3. Para outro item, responda em texto livre (ex.: "estou esperando o João") → a Kaguya
   interpreta como "aguardando" e aplica.
4. Pergunte "o que tem pra amanhã?" e "próximos 7 dias" → respostas corretas via
   `resolve_view_by_name`.

**Esperado**: SC-006.
