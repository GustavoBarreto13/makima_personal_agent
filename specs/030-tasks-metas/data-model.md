# Phase 1 — Data Model: Metas (Kaguya)

Storage: PostgreSQL compartilhado. DDL idempotente acrescentada a
`agents/kaguya/schema_tasks_pg.sql` (aplicada por `scripts/setup_schemas.py`). Campos
derivados (progresso) são **calculados na leitura** (motor puro `goal_progress.py`), nunca
persistidos.

---

## Entidade: `goals`

Uma meta com prazo — a camada de direção.

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | — |
| `title` | `TEXT NOT NULL` | título específico; obrigatório (FR-001) |
| `why` | `TEXT` | porquê/motivação/valor (opcional, FR-002) |
| `life_area` | `TEXT` | área da vida (etiqueta livre, opcional, FR-003; D3) |
| `metric_target` | `NUMERIC` | métrica-alvo (opcional, FR-004); `NULL` = sem métrica |
| `metric_unit` | `TEXT` | unidade da métrica (ex.: "livros"); só faz sentido com `metric_target` |
| `metric_current` | `NUMERIC NOT NULL DEFAULT 0` | valor atual da métrica (FR-005) |
| `deadline` | `DATE NOT NULL` | prazo (FR-001) |
| `anti_goals` | `TEXT` | o que evitar no caminho (opcional, FR-006) |
| `accountability` | `TEXT` | nota de responsabilização (opcional, FR-006) |
| `status` | `TEXT NOT NULL DEFAULT 'active'` | `CHECK (status IN ('active','closed'))` (FR-015) |
| `outcome` | `TEXT` | `CHECK (outcome IN ('achieved','missed','revise'))`; preenchido na revisão (FR-013) |
| `review` | `TEXT` | aprendizado registrado ao encerrar (FR-013) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | — |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | atualizado nas mutações |

Índice parcial para a lista de ativas:
`CREATE INDEX IF NOT EXISTS idx_goals_active ON goals (status) WHERE status = 'active';`

**Sem `deleted_at`** — exclusão é hard delete (D4).

### Campos derivados (na resposta, não no banco)

| Campo | Cálculo |
|---|---|
| `metric_pct` | `min(100, round(100 * metric_current / metric_target))` se `metric_target > 0`, senão `null` |
| `milestones_total` | nº de marcos da meta |
| `milestones_done` | nº de marcos com `done = true` |
| `milestones_pct` | `round(100 * done / total)` se `total > 0`, senão `null` |
| `progress_pct` | média das dimensões presentes (métrica, marcos); `null` se nenhuma (D2) |
| `days_remaining` | `deadline - hoje` (≥0; negativo ⇒ atrasado) |
| `is_overdue` | `status='active' AND hoje > deadline` (FR-016) |

---

## Entidade: `goal_milestones`

Um marco nomeado dentro de uma meta.

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | — |
| `goal_id` | `INTEGER NOT NULL` | `REFERENCES goals(id) ON DELETE CASCADE` (D4) |
| `title` | `TEXT NOT NULL` | nome do marco (FR-004) |
| `done` | `BOOLEAN NOT NULL DEFAULT FALSE` | concluído/pendente (FR-005) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | ordena a lista (ASC) |

`CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones (goal_id);`

---

## Vínculo Meta↔Movimento — coluna `goal_id` (D1)

O vínculo é uma **coluna `goal_id` nullable** em cada tabela de execução da Kaguya, adicionada de
forma **idempotente** (bancos pré-existentes). FK `ON DELETE SET NULL` ⇒ excluir a meta desvincula
sem apagar o item (FR-010/SC-005). Cardinalidade "no máximo uma meta por item" imposta pela coluna
única (D1).

```sql
ALTER TABLE tiny_experiments ADD COLUMN IF NOT EXISTS goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL;  -- gancho D5 da spec 029
ALTER TABLE tasks            ADD COLUMN IF NOT EXISTS goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE habits           ADD COLUMN IF NOT EXISTS goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tiny_experiments_goal ON tiny_experiments (goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_goal            ON tasks (goal_id)            WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_habits_goal           ON habits (goal_id)           WHERE goal_id IS NOT NULL;
```

> **Ordem no schema**: as tabelas `goals`/`goal_milestones` são criadas **antes** dos `ALTER`
> acima (a FK referencia `goals`). Em `schema_tasks_pg.sql`, `tasks` e `habits` já existem;
> `tiny_experiments` foi criada pela 029 (mesmo arquivo). Todos os `ALTER ... IF NOT EXISTS` são
> no-op em bancos que já tenham a coluna.

### Movimentos no detalhe da meta (FR-009)

O agregador `get_goal(id)` lê os três tipos por `WHERE goal_id = :id` e devolve-os **agrupados por
tipo**, cada item com um **status mínimo** de contexto:

| Tipo | Fonte | Status exibido |
|---|---|---|
| `experiment` | `tiny_experiments` | `status` (active/paused/completed) + `adherence_pct` (motor 029) |
| `task` | `tasks` (vivas: `deleted_at IS NULL`) | aberta/concluída (`completed_at`) |
| `habit` | `habits` (ativos: `archived_at IS NULL`) | `consistency` (motor de hábito) |

Item de origem removido/arquivado **não** quebra a tela: o filtro de vivos/ativos o exclui da lista
de movimentos sem erro (edge case "vincular item inexistente/arquivado").

---

## Transições de estado (Meta)

```
            criar
              │
              ▼
          ┌────────┐   revisão (outcome + aprendizado)   ┌────────┐
          │ active │ ──────────────────────────────────► │ closed │  (terminal)
          └────────┘                                     └────────┘
       excluir (qualquer estado) ⇒ hard delete
         · marcos: CASCADE (apagados)
         · itens vinculados: SET NULL (desvinculados, preservados)
```

Regras:
- `active → closed`: revisão grava `outcome` + `review`; sai da lista de ativas (FR-013/FR-015).
  Encerramento antecipado permitido (FR-014). Os `goal_id` dos itens **permanecem** (histórico, D5).
- `closed`: terminal nesta fatia (não reabre).
- Validações: `deadline` obrigatória; `metric_target` (quando informado) numérico; `outcome`
  ∈ {achieved, missed, revise} na revisão; `metric_current` aceita valor acima do alvo (satura 100).

---

## Notas de integridade

- Progresso, `days_remaining` e `is_overdue` dependem de "hoje" em **UTC-3** — usar
  `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` ou o helper `_today()` (D6).
- Mutações retornam `{"status": "ok"|"error", ...}`; listagens retornam o dado direto
  (convenção `tools_experiments`/`tools_tasks`). Datas serializadas como `"YYYY-MM-DD"`; timestamps
  em ISO 8601; `NUMERIC` chega como `float` (normalização de `agents/db.py`).
