# Data Model: Revisão semanal guiada (Kaguya)

**Input**: spec.md § Key Entities + research.md (R1–R4, R9, R11). Schema vive em
`agents/kaguya/schema_tasks_pg.sql` (mesmo arquivo de sempre — `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS` para bancos existentes, `CREATE TABLE IF NOT EXISTS` para bancos novos).

## `task_weekly_reviews` — a revisão (nova tabela)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `started_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | quando a revisão foi iniciada |
| `completed_at` | `TIMESTAMPTZ NULL` | `NULL` enquanto aberta; setado ao concluir |
| `steps_seen` | `TEXT[] NOT NULL DEFAULT '{}'` | subconjunto de `_ALL_STEPS` (ver abaixo) já vistos nesta revisão |
| `note` | `TEXT NULL` | nota final livre (FR-004), opcional mesmo ao concluir |

```sql
CREATE TABLE IF NOT EXISTS task_weekly_reviews (
    id           SERIAL PRIMARY KEY,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    steps_seen   TEXT[] NOT NULL DEFAULT '{}',
    note         TEXT
);

-- No máximo UMA revisão aberta por vez (FR-005) — garantia de schema, não só de aplicação.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_weekly_reviews_open
    ON task_weekly_reviews ((true)) WHERE completed_at IS NULL;

-- Histórico ordenado por conclusão (US4 / indicador "última revisão há N dias").
CREATE INDEX IF NOT EXISTS idx_task_weekly_reviews_completed_at
    ON task_weekly_reviews (completed_at DESC) WHERE completed_at IS NOT NULL;
```

### Passos fixos (`_ALL_STEPS`, código — não é tabela)

```python
_ALL_STEPS = ["inbox", "next_actions", "waiting", "lists", "calendar", "someday"]
```

Ordem = ordem de exibição no wizard (FR-001). `steps_seen` guarda um subconjunto destes literais;
"todos os passos vistos" (pré-condição de `complete_review`, FR-006) é
`set(steps_seen) >= set(_ALL_STEPS)`. Navegação livre entre passos (edge case) — marcar um passo
como visto não exige tê-lo visto em ordem.

### Transições

| Ação | Efeito |
|---|---|
| `start_or_resume_review()` | se existe linha com `completed_at IS NULL` → devolve ela (resume, FR-005); senão `INSERT` nova com `steps_seen = '{}'` |
| `mark_step_seen(review_id, step)` | `steps_seen = array_append` idempotente (sem duplicar — `CASE WHEN step = ANY(steps_seen)`) |
| `complete_review(review_id, note)` | exige `steps_seen` ⊇ `_ALL_STEPS` (senão erro `steps_pending`); seta `completed_at = now()`, `note = note` |

## `task_projects.last_reviewed_at` — marca de revisão da lista (coluna nova)

```sql
ALTER TABLE task_projects ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
```

Setada por `mark_project_reviewed(project_id)` (chamada inline no passo 4 do wizard, uma por
lista revisada). Não tem transição além de "atualizar para agora" — não há "desmarcar".

## Consultas derivadas dos passos (sem tabela nova)

Nenhum dado exibido em um passo é armazenado pela revisão — tudo é consultado ao vivo no
momento em que o passo é aberto (research.md R1, edge case "revisão muito antiga").

| Passo | Fonte dos dados | Módulo |
|---|---|---|
| 1. Inbox zero | `list_inbox_queue()` | `tools_tasks.py` (spec 034) |
| 2. Próximas ações | `BUILTIN_FILTERS["next-actions"]` | `tools_filters.py` (spec 034) |
| 3. Aguardando | mesmas condições de `BUILTIN_FILTERS["waiting"]` + `ORDER BY waiting_since ASC NULLS LAST` | `tools_review.py` (nova query — research.md R4) |
| 4. Listas/projetos | `get_sidebar()`, reordenado por `last_reviewed_at NULLS FIRST, last_reviewed_at ASC` | `tools_projects.py` + `tools_review.py` |
| 5. Calendário | `calendar_hub.aggregate(hoje-7, hoje)` + `aggregate(hoje, hoje+7)` + `list_tasks_in_range` nas mesmas janelas | `calendar_hub.py` + `tools_calendar.py` |
| 6. Algum dia/talvez | `BUILTIN_FILTERS["someday"]` | `tools_filters.py` (spec 034) |

## Ações inline por passo (reuso — nenhuma tool nova)

| Passo | Ações disponíveis | Tool reusada |
|---|---|---|
| 1 | processar (6 decisões) | `process_inbox_item` |
| 2 | concluir, reprioritizar, editar | `complete_task`, `update_task` |
| 3 | cobrar (editar `waiting_note`), concluir, desistir (mover a `next_action`/`someday` ou excluir) | `update_task`, `complete_task`, `delete_task` |
| 4 | marcar como revisada | `mark_project_reviewed` (novo, `tools_review.py`) |
| 5 | — (leitura, spec.md § Assumptions) | — |
| 6 | promover (`gtd_status → next_action`/agendar), excluir | `update_task`, `delete_task` |

## `get_last_completed_review()` — indicador (US4)

Devolve `{completed_at, note}` da linha mais recente com `completed_at IS NOT NULL`, ou `None`
se nenhuma revisão foi concluída ainda ("nunca" — Acceptance Scenario US4-1). O "há N dias" é
calculado no frontend a partir do `completed_at` (ISO UTC) — nunca no backend com `CURRENT_DATE`
puro (research.md R9 / regra global do `CLAUDE.md`).

## Resumo para o lembrete (US3 / R8)

`get_reminder_summary()` (usado só pelo script do scheduler, não expõe endpoint REST):

```python
{
    "should_send": bool,       # True somente se nenhuma revisão concluída nos últimos 7 dias corridos (fuso local)
    "inbox_count": int,        # len(list_inbox_queue())
    "stale_waiting_count": int # itens 'waiting' com waiting_since há mais de 7 dias
}
```
