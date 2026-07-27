# REST Contract: Revisão semanal guiada (Kaguya)

**Base**: `webapp/backend/routers/tasks.py` (prefixo existente `/api/tasks`). Todas as rotas
exigem `require_user` (mesmo padrão do resto do arquivo). Mutações seguem `_check_result()`
(erro → HTTP 400 com `{"detail": ...}`; sucesso → o dict retornado pela tool).

Passos individuais **não** ganham rotas próprias — o frontend chama as rotas **já existentes**
de cada passo (inbox/views/filters/calendar) e só usa as rotas abaixo para o **estado da
revisão em si** (iniciar/retomar, marcar passo visto, concluir, histórico, indicador).

## Estado da revisão

### `GET /api/tasks/reviews/current`

Devolve a revisão aberta (ou `null` se nenhuma). Não cria nada — leitura pura.

```json
// aberta
{"id": 3, "started_at": "2026-07-19T22:10:00Z", "steps_seen": ["inbox", "next_actions"], "note": null}
// nenhuma aberta
null
```

### `POST /api/tasks/reviews/start`

Inicia uma revisão nova **ou** retoma a aberta (FR-005) — idempotente em relação ao estado
"há uma aberta". Sempre devolve a revisão (nova ou retomada) com um campo `resumed: bool`.

```json
// request: {} (sem body)
// response
{"id": 3, "started_at": "...", "steps_seen": [...], "note": null, "resumed": true}
```

### `PATCH /api/tasks/reviews/{review_id}/step`

Marca um passo como visto (idempotente — repetir não duplica).

```json
// request
{"step": "waiting"}  // um de: inbox | next_actions | waiting | lists | calendar | someday
// response
{"status": "ok", "steps_seen": ["inbox", "next_actions", "waiting"]}
```

Erros: `400` se `step` não é um dos 6 literais válidos, ou se `review_id` não corresponde à
revisão aberta atual (evita marcar passo numa revisão já fechada/inexistente).

### `POST /api/tasks/reviews/{review_id}/complete`

Conclui a revisão. Exige os 6 passos vistos (FR-006).

```json
// request
{"note": "Semana pesada, priorizar o projeto X na próxima."}  // note é opcional
// response (sucesso)
{"status": "ok", "id": 3, "completed_at": "2026-07-19T23:00:00Z"}
// response (passos faltando)
{"status": "error", "error": "steps_pending", "missing": ["calendar", "someday"]}
```

### `GET /api/tasks/reviews/last`

Indicador para o painel (US4) — a revisão concluída mais recente, ou `null`.

```json
{"completed_at": "2026-07-12T23:00:00Z", "note": "..."}
// ou
null
```

### `GET /api/tasks/reviews/history`

Lista as revisões concluídas (mais recente primeiro) — histórico (FR-004).

```json
[
  {"id": 2, "started_at": "...", "completed_at": "...", "note": "..."},
  {"id": 1, "started_at": "...", "completed_at": "...", "note": null}
]
```

## Passo 4 — marca de revisão de lista

### `POST /api/tasks/projects/{project_id}/mark-reviewed`

Registra `last_reviewed_at = now()` na lista. Não pertence ao namespace `/reviews/*` porque é
uma propriedade da **lista**, não da revisão (a lista pode ser marcada revisada fora do wizard
também, ex.: numa faxina ad-hoc).

```json
// response
{"status": "ok", "project_id": 5, "last_reviewed_at": "2026-07-19T22:40:00Z"}
```

## Passos que reusam rotas já existentes (sem contrato novo)

| Passo | Rota reusada | Origem |
|---|---|---|
| 1. Inbox zero | `GET /api/tasks/inbox/queue`, `POST /api/tasks/inbox/{id}/process` | spec 034 |
| 2. Próximas ações | `GET /api/tasks/filters/builtin/next-actions/tasks` | spec 034 |
| 3. Aguardando (ordenado) | `GET /api/tasks/reviews/waiting-ordered` *(nova — abaixo)* | — |
| 4. Listas/projetos | `GET /api/tasks/projects` (sidebar já traz `last_reviewed_at` após a migração) | existente |
| 5. Calendário | `GET /api/tasks/calendar-hub?start=...&end=...` (chamado 2x pelo frontend, janelas passada/futura) | fatia 019 |
| 6. Algum dia/talvez | `GET /api/tasks/filters/builtin/someday/tasks` | spec 034 |

### `GET /api/tasks/reviews/waiting-ordered`

Único endpoint novo específico de um passo — porque a ordenação "mais antigo primeiro"
(FR-003) não existe na DSL genérica de smart-lists (research.md R4).

```json
[
  {"id": 12, "title": "Orçamento do João", "waiting_note": "ele disse que manda até sexta",
   "waiting_since": "2026-07-01T10:00:00Z", "days_waiting": 18},
  {"id": 20, "title": "Aprovação do design", "waiting_note": null,
   "waiting_since": "2026-07-15T09:00:00Z", "days_waiting": 4}
]
```

## Telegram

Nenhuma rota/tool nova no agente Kaguya (research.md R10 — wizard é webapp-only). O único
contrato do lado Telegram é o **lembrete** (US3), que não é uma resposta do bot a uma mensagem
do usuário — é uma mensagem *enviada* pelo job `weekly_review_reminder` via
`POST https://api.telegram.org/bot{token}/sendMessage` (mesmo contrato usado por
`scheduler/notify.py` e `scripts/send_lucy_digest.py`), sem endpoint webapp associado.

```text
🗓 Revisão semanal pendente

Você não concluiu a revisão esta semana. Te espera:
• 4 itens no inbox
• 2 itens aguardando há mais de uma semana

Abra o painel e faça a revisão (leva menos de 15 min).
```
