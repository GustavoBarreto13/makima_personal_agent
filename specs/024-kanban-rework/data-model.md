# Data Model — 024 Kanban Views

## Tabela nova: `kanban_views`

Views de board globais (sem `project_id`), persistidas no PostgreSQL compartilhado. Schema em `agents/kaguya/schema_tasks_pg.sql`.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | `SERIAL` | PK | Identificador |
| `name` | `TEXT` | `NOT NULL`, não-vazio | Nome exibido no seletor |
| `is_builtin` | `BOOLEAN` | `NOT NULL DEFAULT false` | `true` = view de sistema (não deletável/renomeável) |
| `display` | `JSONB` | `NOT NULL` | Configuração de exibição (ver shape abaixo) |
| `filter` | `JSONB` | `NULL` | `FilterRules` inline (mesmo DSL das smart-lists) ou `NULL` = sem filtro |
| `position` | `INTEGER` | `NOT NULL` | Ordem no seletor (esparsa ×1000, padrão do projeto) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Auditoria |

**Índice/constraint:** `position` para ordenação; sem FK (views são globais). Built-in identificada por `is_builtin = true` (no máximo uma "Completa" via seed idempotente).

### Shape do `display` (JSONB)

```jsonc
{
  "adornos": {
    "capacity_meter": true,   // R6 — barra de 5 segmentos por coluna
    "subtask_ring":   true,   // R12 — anel de progresso no card
    "summary_footer": true,   // R14/R15 — rodapé-resumo
    "card_chips":     true    // R11 — chips data/estimativa/projeto no card
  },
  "slots": ["abertas", "tempo_estimado", "em_andamento"]  // 3 chaves de métrica (R15)
}
```

- `slots` tem **exatamente 3** itens, cada um do catálogo de `SummaryMetric` (abaixo).
- Adorno ausente/`false` → componente não renderiza (sem buraco de layout — R23).

### Catálogo de métricas dos slots (`SummaryMetric`)

| Chave | Significado | Cálculo (sobre o conjunto filtrado da view) |
|---|---|---|
| `abertas` | tarefas abertas no board | count(não concluídas) |
| `tempo_estimado` | soma de estimativas | Σ `duration_min` das abertas (formatado; "—" se 0) |
| `concluidas` | concluídas | count na coluna `is_done_column` |
| `concluidas_hoje` | concluídas hoje | count `completed_at` = hoje (data local UTC-3) |
| `em_andamento` | em andamento | count abertas fora da 1ª coluna |

### Seed obrigatório (idempotente)

```sql
INSERT INTO kanban_views (name, is_builtin, display, filter, position)
VALUES ('Completa', true,
        '{"adornos":{"capacity_meter":true,"subtask_ring":true,"summary_footer":true,"card_chips":true},
          "slots":["abertas","tempo_estimado","em_andamento"]}'::jsonb,
        NULL, 1000)
ON CONFLICT DO NOTHING;  -- (constraint de unicidade da built-in definida no schema)
```

### Regras de negócio (validadas na camada de lógica)

1. `name` não pode ser vazio (erro de validação).
2. `display.slots` deve ter 3 chaves válidas do catálogo; `display.adornos` só aceita as 4 chaves conhecidas (booleans).
3. `filter`, se presente, passa pelo mesmo `_validate_rules` das smart-lists (≥1 condição; combinador válido).
4. View com `is_builtin = true` **não** pode ser editada nem deletada (`{"status":"error"}` → HTTP 400).
5. `position` esparsa (última + 1000), padrão das listas/colunas/filtros.

## Reuso (sem tabela nova)

- **Filtro:** `FilterRules` = mesmo objeto JSONB das smart-lists (`{combinator, conditions[]}`), avaliado por `_build_where_from_rules` (ver `research.md` R-1/R-2). **Não** há tabela de junção nem FK para `task_filters` (decisão de clarify: filtro inline, sem acoplamento).
- **View ativa por lista:** localStorage (`kaguya:kanban:active-view:<project_id>`), **não** persistida no banco (R-7).
- **Colunas/tarefas:** inalteradas (`task_projects`, `task_columns`/colunas, `tasks`). A view não toca nelas (R28).

## Tipos TypeScript novos (`webapp/frontend/src/pages/kaguya/types.ts`)

```ts
export type SummaryMetric =
  | 'abertas' | 'tempo_estimado' | 'concluidas' | 'concluidas_hoje' | 'em_andamento'

export interface KanbanViewDisplay {
  adornos: {
    capacity_meter: boolean
    subtask_ring: boolean
    summary_footer: boolean
    card_chips: boolean
  }
  slots: [SummaryMetric, SummaryMetric, SummaryMetric]
}

export interface KanbanView {
  id: number
  name: string
  is_builtin: boolean
  display: KanbanViewDisplay
  filter: FilterRules | null   // FilterRules já existe em types.ts
  position: number
}
```

## Impacto em entidades existentes

| Entidade | Mudança |
|---|---|
| `Column` (types.ts) | nenhuma (cor segue vindo do accent — Q-B/R-6) |
| `Task` (types.ts) | nenhuma (todos os campos já existem) |
| `task_filters` | nenhuma (views não referenciam smart-lists) |
| `_build_where_from_rules` | refator mínimo: base `default_open` parametrizável (R-2) |
