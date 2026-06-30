# Phase 1 — Data Model: Tiny Experiments (Kaguya)

Storage: PostgreSQL compartilhado. DDL idempotente acrescentada a
`agents/kaguya/schema_tasks_pg.sql` (aplicada por `scripts/setup_schemas.py`). Campos
derivados são **calculados na leitura** (motor puro `experiment_adherence.py`), nunca
persistidos.

---

## Entidade: `tiny_experiments`

Um experimento testável com prazo.

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | — |
| `title` | `TEXT NOT NULL` | a fórmula "Vou [ação] por [duração]"; obrigatório (FR-001) |
| `why` | `TEXT` | porquê/motivação (opcional, FR-002) |
| `hypothesis` | `TEXT` | "talvez se eu __, então __" (opcional, FR-002) |
| `cadence` | `TEXT NOT NULL DEFAULT 'daily'` | `CHECK (cadence IN ('daily','weekly'))` (FR-003) |
| `start_date` | `DATE NOT NULL` | início (FR-001) |
| `end_date` | `DATE NOT NULL` | fim; `CHECK (end_date >= start_date)` (FR-001, edge case) |
| `status` | `TEXT NOT NULL DEFAULT 'active'` | `CHECK (status IN ('active','paused','completed'))` |
| `paused_at` | `DATE` | data em que entrou em pausa; `NULL` quando ativo/concluído (D4) |
| `paused_period_days` | `INTEGER NOT NULL DEFAULT 0` | acumulador de dias pausados (D4, FR-017) |
| `verdict` | `TEXT` | `CHECK (verdict IN ('persist','pause','pivot'))`; preenchido na revisão (FR-010) |
| `review` | `TEXT` | aprendizado registrado ao concluir (FR-010) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | — |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | atualizado nas mutações |

Índice parcial para a lista de ativos/pausados:
`CREATE INDEX IF NOT EXISTS idx_tiny_experiments_open ON tiny_experiments (status) WHERE status <> 'completed';`

**Sem `deleted_at`** — exclusão é hard delete (D3).

### Campos derivados (na resposta, não no banco)

| Campo | Cálculo |
|---|---|
| `periods_done` | nº de check-ins `done=true` |
| `periods_expected` | períodos entre `start_date` e `min(hoje, end_date)` menos pausados (D1/D4) |
| `adherence_pct` | `round(100 * periods_done / max(periods_expected, 1))`, capado em 100 |
| `logged_current` | existe check-in para o período corrente (hoje, ou a segunda da semana)? |
| `days_remaining` | `end_date - hoje` (≥0; negativo ⇒ atrasado) |
| `is_overdue` | `status='active' AND hoje > end_date` (FR-016, edge case) |

---

## Entidade: `tiny_experiment_logs`

Um check-in por período de um experimento (o tracker).

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | — |
| `experiment_id` | `INTEGER NOT NULL` | `REFERENCES tiny_experiments(id) ON DELETE CASCADE` (D3) |
| `period_date` | `DATE NOT NULL` | o dia (diária) ou a **segunda-feira** da semana (semanal, D2) |
| `done` | `BOOLEAN NOT NULL` | fez? (obrigatório, FR-005) |
| `feeling` | `SMALLINT` | `CHECK (feeling BETWEEN 1 AND 5)`; opcional (FR-005, edge case) |
| `note` | `TEXT` | opcional (FR-005) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | — |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | atualizado no upsert |

Unicidade (1 por período — FR-006): `UNIQUE (experiment_id, period_date)`.
Backfill permitido: `period_date` pode ser corrente ou passado dentro de `[start,end]` (FR-005/D2).

---

## Transições de estado (Experimento)

```
            criar
              │
              ▼
          ┌────────┐   pausar    ┌────────┐
          │ active │ ──────────► │ paused │
          │        │ ◄────────── │        │
          └───┬────┘   retomar   └───┬────┘
              │  revisão (verdict+aprendizado)│
              └──────────────┬───────────────┘
                             ▼
                       ┌───────────┐
                       │ completed │  (terminal)
                       └───────────┘
                   excluir (qualquer estado) ⇒ hard delete + cascade dos logs
```

Regras:
- `active → paused`: grava `paused_at = hoje` (D4). Some do "Meu Dia" (FR-014).
- `paused → active`: `paused_period_days += (hoje - paused_at)`, `paused_at = NULL` (D4).
- `active|paused → completed`: revisão grava `verdict` + `review`; sai da lista de ativos (FR-010/012).
  Se pausado ao concluir, fecha-se o intervalo de pausa em aberto antes de calcular a aderência final.
- `completed`: terminal (não reabre nesta fatia).
- Validações de criação/edição: `end_date >= start_date`; `cadence ∈ {daily,weekly}`;
  `feeling ∈ {1..5}` quando informado.

---

## Notas de integridade

- Aderência e `logged_current` dependem de "hoje" em **UTC-3** — usar
  `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` nas queries (D2).
- Mutações retornam `{"status": "ok"|"error", ...}`; listagens retornam o dado direto
  (convenção `tools_tasks.py`). Datas serializadas como `"YYYY-MM-DD"`; timestamps em ISO 8601.
- `goal_id` (vínculo com Metas) **não** existe nesta fatia — será adicionado pela spec 030 (D5).
