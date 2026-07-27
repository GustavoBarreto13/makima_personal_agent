# Phase 1 Data Model: Foco / Pomodoro (spec 037)

## `focus_sessions`

Registro atômico de uma sessão de foco — o único dado persistido pela feature (R1/R2 do
`research.md`: tudo mais é calculado na leitura).

```sql
CREATE TABLE IF NOT EXISTS focus_sessions (
    id                   SERIAL PRIMARY KEY,
    task_id              INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at             TIMESTAMPTZ,                 -- NULL = sessão ativa (aberta)
    duration_planned_min INTEGER NOT NULL,             -- foco planejado (25/50/custom)
    break_planned_min    INTEGER NOT NULL,             -- pausa planejada (5/10/custom)
    completed            BOOLEAN,                      -- NULL enquanto aberta; true/false ao fechar
    note                 TEXT
);

-- No máximo UMA sessão aberta por vez (FR-003) — garantia de schema (padrão da 035).
CREATE UNIQUE INDEX IF NOT EXISTS uq_focus_sessions_open
    ON focus_sessions ((true)) WHERE ended_at IS NULL;

-- Histórico por dia/semana (R6: agregação usa ended_at quando existe, senão started_at).
CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at ON focus_sessions (started_at DESC);
```

| Campo | Tipo | Notas |
|---|---|---|
| `task_id` | INTEGER, nullable | `ON DELETE SET NULL` — sessão vira avulsa se a tarefa for apagada (R8). |
| `started_at` | TIMESTAMPTZ | Hora real de início — base de toda derivação de tempo restante (R1). |
| `ended_at` | TIMESTAMPTZ, nullable | NULL = sessão ativa. Preenchido ao concluir, cancelar, ou fechamento automático (R2). |
| `duration_planned_min` | INTEGER | Minutos de foco planejados nesta sessão específica (congelado no início — mudar a preferência depois não altera sessões passadas). |
| `break_planned_min` | INTEGER | Minutos de pausa planejados (usado só para calcular a janela de "abandono", R2). |
| `completed` | BOOLEAN, nullable | `true` = concluída manualmente ou fim natural do foco; `false` = cancelada ou fechada automaticamente por abandono; NULL enquanto ativa. |
| `note` | TEXT, nullable | Nota opcional preenchida ao concluir (R10). |

`duration_focused_min` (tempo efetivamente focado, usado nas estatísticas) **não é uma
coluna** — é derivado em `tools_focus.py`/`focus_stats.py` como
`min(duration_planned_min, (COALESCE(ended_at, now()) - started_at) em minutos)`, nunca mais
que o planejado (SC-004).

## `focus_prefs`

Preferência de duração (foco/pausa) lembrada entre sessões (R4) — tabela de 1 linha, mesmo
padrão de `calendar_prefs`.

```sql
CREATE TABLE IF NOT EXISTS focus_prefs (
    id        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    focus_min INTEGER NOT NULL DEFAULT 25,
    break_min INTEGER NOT NULL DEFAULT 5
);

INSERT INTO focus_prefs (id, focus_min, break_min) VALUES (1, 25, 5)
ON CONFLICT (id) DO NOTHING;
```

## Estado de uma sessão (derivado, não persistido)

Calculado em `tools_focus.py` a cada leitura (`get_active_session`):

| Situação | Condição | Efeito |
|---|---|---|
| Ativa, em foco | `ended_at IS NULL` e `now() < started_at + duration_planned_min` | `phase="foco"`, `remaining_sec` decrescente |
| Ativa, em pausa | `ended_at IS NULL` e `duration_planned_min <= decorrido < duration_planned_min + break_planned_min` | `phase="pausa"`, `remaining_sec` decrescente |
| Abandonada | `ended_at IS NULL` e `decorrido >= duration_planned_min + break_planned_min` | Fecha automaticamente (`completed=false`, `ended_at = started_at + duration_planned_min`) antes de responder — R2 |
| Nenhuma ativa | não existe linha com `ended_at IS NULL` | `GET /focus/active` devolve `null` |

## Requirements → Data mapping

| Requisito | Como é atendido |
|---|---|
| FR-001 (iniciar de tarefa ou avulso) | `task_id` nullable |
| FR-002 (durações configuráveis + lembradas) | `focus_prefs` (1 linha) + campos `*_planned_min` congelados por sessão |
| FR-003 (1 sessão ativa) | Índice único parcial `uq_focus_sessions_open` |
| FR-004 (sinalizar fim, oferecer pausa/emendar) | Estado derivado `phase` no `get_active_session`, tratado no frontend |
| FR-005 (concluir antes / cancelar) | `finish_session(completed=true)` / `cancel_session(completed=false)`, ambos setam `ended_at=now()` |
| FR-006/FR-007 (widget em todas as telas, sobrevive a reload) | Sem coluna nova — resolvido no frontend (R7) consumindo `started_at`/`duration_planned_min` |
| FR-008 (abandono fecha automático, credita no máximo o planejado) | Regra de leitura R2 |
| FR-009 (campos do registro) | Todas as colunas de `focus_sessions` |
| FR-010 (resumo dia/semana no Meu Dia) | `focus_stats.py` (motor puro) sobre `list_sessions_for_range` |
| FR-011 (excluir tarefa preserva sessões) | `ON DELETE SET NULL` |
| FR-012 (fuso local nas agregações) | Conversão `AT TIME ZONE 'America/Sao_Paulo'` em toda query de agregação (R6) |
