# Data Model — Kaguya Tasks App

**Feature**: `010-kaguya-tasks-app` (spec master)
**Banco**: PostgreSQL local existente (o mesmo de Nami / Frieren / Journal), via `agents/db.py`.
**Arquivo de schema na implementação**: `agents/kaguya/schema_tasks_pg.sql` (criado na spec 011,
aplicado por `scripts/setup_schemas.py` — mesmo padrão de Nami/Frieren).

Princípio central: **uma tarefa, várias views** — a mesma linha em `tasks` renderiza como
lista (ordena por `position`/`due_date`), Kanban (agrupa por `column_id`), calendar
(`due_date` ou `start_at`/`end_at`), Eisenhower (deriva de `priority` × urgência) e
Meu Dia (`my_day_date`).

---

## Diagrama de relações

```
task_project_groups ──< task_projects ──< task_columns
                              │
                              └──< tasks ──< tasks (parent_id, subtarefas)
                                     │
                                     ├──1:1── task_recurrences
                                     └──N:N── task_tags (via task_tag_links)

task_filters   (independente — regras JSONB sobre tasks)
habits ──< habit_checkins   (módulo de hábitos, Fase 4)
```

---

## Tabelas

### `task_project_groups` — grupos de projetos (pastas da sidebar)

```sql
CREATE TABLE IF NOT EXISTS task_project_groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,                  -- nome do grupo (ex.: "Pessoal", "Trabalho")
    position    BIGINT NOT NULL DEFAULT 0,      -- ordem manual na sidebar (esparsa ×1000)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `task_projects` — listas / contextos GTD

```sql
CREATE TABLE IF NOT EXISTS task_projects (
    id          SERIAL PRIMARY KEY,
    group_id    INT REFERENCES task_project_groups(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    color       TEXT,                           -- cor de exibição (hex/oklch)
    icon        TEXT,                           -- emoji ou nome de ícone
    is_inbox    BOOLEAN NOT NULL DEFAULT FALSE, -- Inbox: seed indelével, recebe capturas sem projeto
    position    BIGINT NOT NULL DEFAULT 0,      -- ordem manual na sidebar (esparsa ×1000)
    archived_at TIMESTAMPTZ,                    -- projeto arquivado some das views, preserva dados
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante um único Inbox no sistema
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_projects_inbox
    ON task_projects (is_inbox) WHERE is_inbox;
```

**Seed obrigatório** (na aplicação do schema):
`INSERT INTO task_projects (name, is_inbox, icon) VALUES ('Inbox', TRUE, '📥') ON CONFLICT DO NOTHING;`

**Regras**:
- Inbox não pode ser excluído nem arquivado (validação na camada de lógica).
- Excluir projeto com tarefas: usuário escolhe mover tarefas para o Inbox ou soft-deletar junto.

### `task_columns` — colunas de Kanban por projeto

```sql
CREATE TABLE IF NOT EXISTS task_columns (
    id              SERIAL PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES task_projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    position        BIGINT NOT NULL DEFAULT 0,       -- ordem das colunas no board (esparsa ×1000)
    is_done_column  BOOLEAN NOT NULL DEFAULT FALSE,  -- mover tarefa para cá = completar
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No máximo uma coluna "done" por projeto
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_columns_done
    ON task_columns (project_id) WHERE is_done_column;
```

**Regras**:
- Projeto sem colunas = sem board (só lista). Criar a primeira coluna ativa o Kanban.
- Mover tarefa entre projetos: ela recebe a primeira coluna do destino (ou `NULL` se o destino não tem board).

### `tasks` — núcleo do sistema

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id              SERIAL PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES task_projects(id),
    column_id       INT REFERENCES task_columns(id) ON DELETE SET NULL,
    parent_id       INT REFERENCES tasks(id) ON DELETE CASCADE,  -- subtarefa (1 nível garantido)

    title           TEXT NOT NULL,
    description     TEXT,
    priority        SMALLINT NOT NULL DEFAULT 0
                    CHECK (priority BETWEEN 0 AND 3),   -- 0=nenhuma 1=baixa 2=média 3=alta

    -- Datas (Fase 2+): vencimento separado de bloco de tempo
    due_date        DATE,                               -- dia de vencimento
    due_time        TIME,                               -- hora opcional (NULL = dia inteiro)
    start_at        TIMESTAMPTZ,                        -- início do bloco (time-blocking, Fase 3)
    end_at          TIMESTAMPTZ,                        -- fim do bloco
    duration_min    INT,                                -- estimativa de duração (ritual Meu Dia)
    my_day_date     DATE,                               -- selecionada para "Meu Dia" desta data (Fase 3)

    -- Ordenação manual: posições esparsas ×1000 (padrão validado no Journal) —
    -- inserir entre 1000 e 2000 vira 1500, sem renumerar a lista
    position        BIGINT NOT NULL DEFAULT 0,

    -- Ciclo de vida (sempre timestamps, nunca booleans — viram histórico de graça)
    completed_at    TIMESTAMPTZ,                        -- NULL = aberta
    deleted_at      TIMESTAMPTZ,                        -- soft delete; NULL = viva
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (end_at IS NULL OR start_at IS NOT NULL),     -- bloco precisa de início
    CHECK (due_time IS NULL OR due_date IS NOT NULL)    -- hora exige dia
);

-- Índices orientados pelas queries reais das views
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks (due_date)   WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks (parent_id)  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_my_day    ON tasks (my_day_date) WHERE my_day_date IS NOT NULL;
```

**Convenções de estado** (deriváveis, sem coluna `status`):
- Aberta: `completed_at IS NULL AND deleted_at IS NULL`
- Vencida: aberta e `due_date < hoje` (ou `due_date = hoje AND due_time < agora`)
- Concluída: `completed_at IS NOT NULL`
- Na lixeira: `deleted_at IS NOT NULL` (restaurável; purga definitiva após 30 dias é tarefa de manutenção, não constraint)

### `task_recurrences` — regra de recorrência (1:1 com a tarefa viva da série)

```sql
CREATE TABLE IF NOT EXISTS task_recurrences (
    id          SERIAL PRIMARY KEY,
    task_id     INT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    rrule       TEXT NOT NULL,                  -- regra iCal RFC 5545 (ex.: 'FREQ=MONTHLY;BYMONTHDAY=5')
    mode        TEXT NOT NULL DEFAULT 'fixed'
                CHECK (mode IN ('fixed', 'after_completion')),
    anchor_date DATE NOT NULL,                  -- âncora da série (DTSTART) — base do cálculo em modo fixed
    active      BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = série encerrada ("complete forever"); preserva histórico
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Modelo de geração** (detalhe que implementa os edge cases da spec master):

1. **Só a próxima ocorrência existe** como linha em `tasks`. Futuras são virtuais
   (projetadas pela RRULE quando a view calendar precisar).
2. **Completar a tarefa recorrente**: dentro da mesma transação —
   a linha atual ganha `completed_at` (vira histórico) **e** uma nova linha é criada com:
   - `due_date` = próxima data da RRULE a partir da âncora (`fixed`) ou da data de
     conclusão (`after_completion`), sempre **estritamente no futuro** (puladas não acumulam);
   - subtarefas copiadas **abertas** (reset);
   - o registro em `task_recurrences` migra para apontar a nova linha (`task_id` atualizado).
3. **Encerrar a série**: `active = FALSE` + completa a ocorrência atual; nenhuma nova linha.
4. **Reagendar a ocorrência aberta** muda só o `due_date` dela; `anchor_date` não muda
   (em `fixed`, a próxima ocorrência segue a âncora original).
5. **Editar a regra**: atualiza `rrule`/`mode`/`anchor_date`; a ocorrência aberta mantém
   a data atual; a regra nova vale na próxima geração.

### `task_tags` + `task_tag_links` — etiquetas N:N

```sql
CREATE TABLE IF NOT EXISTS task_tags (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,                  -- ex.: 'high-energy', '5min', 'donext'
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nome único ignorando caixa (mesmo padrão de journal_emotions)
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_tags_name ON task_tags (LOWER(name));

CREATE TABLE IF NOT EXISTS task_tag_links (
    task_id     INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id      INT NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);
```

### `task_filters` — smart lists (filtros salvos como objetos de primeira classe)

```sql
CREATE TABLE IF NOT EXISTS task_filters (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    icon         TEXT,
    rules        JSONB NOT NULL,                 -- regras declarativas (DSL abaixo)
    default_view TEXT NOT NULL DEFAULT 'list'
                 CHECK (default_view IN ('list', 'kanban', 'calendar', 'eisenhower')),
    position     BIGINT NOT NULL DEFAULT 0,      -- ordem na sidebar
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### DSL de regras (`rules` JSONB)

Estrutura: um objeto com combinador e lista de condições. Sem aninhamento de grupos na v1
(um nível de `and`/`or` cobre os casos reais; aninhamento é extensão futura).

```json
{
  "combinator": "and",
  "conditions": [
    { "field": "project_id", "op": "in",     "value": [2, 5] },
    { "field": "priority",   "op": "gte",    "value": 2 },
    { "field": "due_date",   "op": "within", "value": "7d" },
    { "field": "tag",        "op": "has",    "value": "high-energy" },
    { "field": "state",      "op": "eq",     "value": "open" }
  ]
}
```

| Campo (`field`) | Operadores (`op`) | Valor |
|---|---|---|
| `project_id` | `in`, `not_in` | lista de IDs |
| `priority` | `eq`, `gte`, `lte` | 0–3 |
| `due_date` | `eq`, `before`, `after`, `within`, `overdue`, `none` | data ISO, atalho relativo (`"today"`, `"7d"`) ou nulo |
| `tag` | `has`, `not_has` | nome da tag |
| `state` | `eq` | `open` \| `completed` |
| `text` | `contains` | busca em título/descrição |

**Tradução**: a camada de lógica converte as regras em `WHERE` parametrizado — nunca
interpolar valores do JSONB direto no SQL. Regra com referência quebrada (tag/projeto
excluído) não casa nada e a UI indica.

**Smart lists derivadas (built-in, não persistidas)**: "Hoje + Vencidas" e a matriz de
Eisenhower são filtros fixos do código (não linhas em `task_filters`) — urgente =
`due_date <= hoje + 2d`; importante = `priority >= 2`.

### `habits` + `habit_checkins` — módulo de hábitos (Fase 4)

```sql
CREATE TABLE IF NOT EXISTS habits (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    icon         TEXT,
    color        TEXT,
    -- Frequência alvo: freq_num vezes a cada freq_den dias (ex.: 5/7 = 5x por semana)
    freq_num     SMALLINT NOT NULL DEFAULT 1,
    freq_den     SMALLINT NOT NULL DEFAULT 1,
    -- Hábito mensurável: meta numérica por check-in (NULL = sim/não)
    target_value NUMERIC,
    unit         TEXT,                           -- ex.: 'páginas', 'min'
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (freq_num >= 1 AND freq_den >= 1 AND freq_num <= freq_den)
);

CREATE TABLE IF NOT EXISTS habit_checkins (
    id          SERIAL PRIMARY KEY,
    habit_id    INT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    value       NUMERIC,                         -- valor medido (NULL em hábito sim/não)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (habit_id, date)                      -- um check-in por dia por hábito
);

CREATE INDEX IF NOT EXISTS idx_habit_checkins_date ON habit_checkins (habit_id, date);
```

**Força do hábito** (fórmula Loop Habit Tracker, calculada na leitura — não persistida):

```
multiplicador = 0.5 ^ (sqrt(freq) / 13)          onde freq = freq_num / freq_den
força_hoje    = força_ontem * multiplicador + cumpriu_hoje * (1 - multiplicador)
```

Média móvel exponencial: cumprir aproxima a força de 1, falhar decai suavemente
(meia-vida ~13 unidades de frequência) — nunca zera por um dia ruim. Hábito mensurável
conta como cumprido quando `value >= target_value`.

---

## Decisões transversais

- **Soft delete em tudo que o usuário cria à mão** (`deleted_at`/`archived_at`);
  queries de leitura sempre filtram `deleted_at IS NULL`.
- **Posições esparsas ×1000** em toda ordenação manual (`tasks.position`,
  `task_projects.position`, `task_columns.position`): novo item = última posição + 1000;
  inserir entre A e B = média; renormalizar (re-espaçar) só quando a média colidir.
- **Timestamps com timezone** (`TIMESTAMPTZ`) sempre; exibição em `America/Sao_Paulo`.
- **Sem ENUM do Postgres** — `CHECK` constraints em TEXT/SMALLINT (mais fácil de evoluir,
  padrão dos outros schemas do repo).
- **Atomicidade cross-domain**: `complete_payment_task` executa completar-tarefa +
  lançar-despesa (tabelas da Nami) na **mesma transação** — `get_conn()` único, commit único.
- **Extensões deixadas para depois** (registradas, não modeladas): dependências entre
  tarefas (Gantt), anexos, histórico materializado de ocorrências, grupos aninhados de
  filtros, sync multi-device.
