# Phase 1 Data Model: Meu Dia — contexto Trabalho vs Pessoal (spec 038)

## `task_projects.context` (coluna nova)

```sql
ALTER TABLE task_projects ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT 'personal';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'task_projects_context_check'
    ) THEN
        ALTER TABLE task_projects ADD CONSTRAINT task_projects_context_check
            CHECK (context IN ('personal', 'work'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'task_projects_inbox_personal_check'
    ) THEN
        ALTER TABLE task_projects ADD CONSTRAINT task_projects_inbox_personal_check
            CHECK (NOT is_inbox OR context = 'personal');
    END IF;
END $$;
```

| Campo | Tipo | Notas |
|---|---|---|
| `context` | TEXT, `'personal'`\|`'work'` | Padrão `'personal'` — retrocompatível (FR-010): listas existentes nascem Pessoal. `CHECK` garante o Inbox sempre Pessoal (R3). |

Não existe coluna equivalente em `tasks` (R1) — o contexto de uma tarefa é sempre
`(SELECT context FROM task_projects WHERE id = tasks.project_id)`, resolvido por `JOIN` em
toda leitura que precisa dele (`list_my_day`).

## `calendar_prefs.context` (coluna nova)

```sql
ALTER TABLE calendar_prefs ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT 'personal';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'calendar_prefs_context_check'
    ) THEN
        ALTER TABLE calendar_prefs ADD CONSTRAINT calendar_prefs_context_check
            CHECK (context IN ('personal', 'work'));
    END IF;
END $$;
```

| Campo | Tipo | Notas |
|---|---|---|
| `context` | TEXT, `'personal'`\|`'work'` | Padrão `'personal'` (FR-004) — calendário sem preferência salva ainda também é tratado como Pessoal na leitura (`COALESCE`/default do dict). |

## Estruturas derivadas (não persistidas)

### `GET /api/tasks/my-day` — payload estendido

```jsonc
{
  "date": "2026-07-27",
  // Split por contexto (US2) — sempre presentes, podem ser listas vazias.
  "plano_work": [ /* Task[] com campo extra "context": "work" */ ],
  "plano_personal": [ /* Task[] com campo extra "context": "personal" */ ],
  "pendencias_ontem_work": [ /* ... */ ],
  "pendencias_ontem_personal": [ /* ... */ ],
  "sugestoes_work": [ /* ... */ ],
  "sugestoes_personal": [ /* ... */ ],
  "capacity_work": { /* mesmo shape de compute_capacity() */ },
  "capacity_personal": { /* mesmo shape de compute_capacity() */ },
  // Campos existentes, preservados para retrocompatibilidade (visão única, FR-010):
  "plano": [ /* união de work+personal, ordem original */ ],
  "pendencias_ontem": [ /* união */ ],
  "sugestoes": [ /* união */ ],
  "capacity": { /* capacity total — não particionada */ },
  "eventos": [ /* eventos do dia, cada item com campo extra "context" */ ]
}
```

Cada item de tarefa ganha o campo `context` (`'work'`|`'personal'`) resolvido do
`task_projects` da lista atual — informativo, nunca persistido em `tasks`.

## Requirements → Data mapping

| Requisito | Como é atendido |
|---|---|
| FR-001 (contexto por lista, Inbox sempre Pessoal) | `task_projects.context` + `CHECK` (R3) |
| FR-002 (herança automática, atualiza ao mover) | R1 — sem coluna em `tasks`, sempre via JOIN |
| FR-003 (ação em massa por grupo) | `set_group_context(group_id, context)` — `UPDATE` único (R4) |
| FR-004 (contexto por calendário) | `calendar_prefs.context` (R2) |
| FR-005 (seções separadas + capacity própria) | `plano_work`/`plano_personal` + `capacity_work`/`capacity_personal` |
| FR-006 (mesma janela; soma = total) | `compute_capacity` chamado 2×/3× com a mesma janela padrão; ver R6 para os campos estritamente somáveis |
| FR-007 (timeline única) | Sem mudança — `eventos`/`plano` (união) continuam alimentando a `DayTimeline` existente |
| FR-008 (toggle visão única/dividida, lembrado) | `localStorage` (R5) — UI pura, sem coluna |
| FR-009 (resumo Telegram com os dois blocos) | `my_day_status()` estendido |
| FR-010 (retrocompatibilidade) | Default `'personal'` em ambas as colunas — zero listas de trabalho ⇒ `plano_work=[]`/`capacity_work` zerada, UI recolhe a seção (R8) |
