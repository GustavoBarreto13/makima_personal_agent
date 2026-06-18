-- ============================================================================
-- schema_tasks_pg.sql — Schema PostgreSQL do sistema de tarefas próprio (Kaguya)
-- ============================================================================
--
-- Transcrição fiel do data-model da spec master
-- (specs/010-kaguya-tasks-app/data-model.md). TODO o schema é aplicado de uma
-- vez (FR-001) — inclusive tabelas que só ganham UI em fases futuras
-- (recorrência, filtros, hábitos) — para evitar migrações depois.
--
-- Princípio central: "uma tarefa, várias views" — a mesma linha em `tasks`
-- vira lista, Kanban, calendar, Eisenhower e Meu Dia.
--
-- Convenções do repo:
--   - Idempotente: tudo com IF NOT EXISTS (pode rodar várias vezes sem erro).
--   - Sem ENUM do Postgres — usamos CHECK em TEXT/SMALLINT (mais fácil de evoluir).
--   - Soft delete (deleted_at) e arquivamento (archived_at) no que o usuário cria.
--   - Posições esparsas ×1000 em toda ordenação manual (mesma ideia do Journal).
--   - Timestamps sempre com timezone (TIMESTAMPTZ); exibição em America/Sao_Paulo.
--
-- Aplicado por scripts/setup_schemas.py (de dentro do container makima-web no VPS).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- task_project_groups — grupos de listas (as "pastas" da sidebar)
-- ----------------------------------------------------------------------------
-- 1 nível só (sem aninhamento). Ex.: "Pessoal", "Crescimento", "Vida prática".
CREATE TABLE IF NOT EXISTS task_project_groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,                  -- nome do grupo exibido na sidebar
    position    BIGINT NOT NULL DEFAULT 0,      -- ordem manual na sidebar (esparsa ×1000)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- task_projects — "Listas" / contextos GTD (na UI: "Listas"; no modelo: project)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_projects (
    id          SERIAL PRIMARY KEY,
    -- Grupo ao qual a lista pertence. ON DELETE SET NULL: apagar o grupo não
    -- apaga as listas — elas só ficam "soltas" (sem grupo).
    group_id    INT REFERENCES task_project_groups(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    color       TEXT,                           -- cor de exibição (hex ou oklch)
    icon        TEXT,                           -- emoji ou nome de ícone
    -- Inbox: lista-semente indelével que recebe toda captura sem lista definida.
    is_inbox    BOOLEAN NOT NULL DEFAULT FALSE,
    position    BIGINT NOT NULL DEFAULT 0,      -- ordem manual na sidebar (esparsa ×1000)
    archived_at TIMESTAMPTZ,                    -- lista arquivada some das views, preserva dados
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante que só pode existir UM Inbox no sistema inteiro.
-- Índice único parcial: só vale para linhas onde is_inbox = TRUE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_projects_inbox
    ON task_projects (is_inbox) WHERE is_inbox;


-- ----------------------------------------------------------------------------
-- task_columns — colunas de Kanban (board) por lista
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_columns (
    id              SERIAL PRIMARY KEY,
    -- Lista dona da coluna. ON DELETE CASCADE: apagar a lista apaga suas colunas.
    project_id      INT NOT NULL REFERENCES task_projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    position        BIGINT NOT NULL DEFAULT 0,       -- ordem das colunas no board (esparsa ×1000)
    -- Coluna "concluído": soltar um card aqui = completar a tarefa.
    is_done_column  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No máximo UMA coluna "done" por lista (mesma ideia do índice parcial do Inbox).
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_columns_done
    ON task_columns (project_id) WHERE is_done_column;


-- ----------------------------------------------------------------------------
-- tasks — o núcleo do sistema
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id              SERIAL PRIMARY KEY,
    -- Lista da tarefa (obrigatória; sem lista → cai no Inbox na camada de lógica).
    project_id      INT NOT NULL REFERENCES task_projects(id),
    -- Coluna do Kanban. ON DELETE SET NULL: apagar a coluna não apaga a tarefa.
    column_id       INT REFERENCES task_columns(id) ON DELETE SET NULL,
    -- Subtarefa: aponta para a tarefa-pai. ON DELETE CASCADE: apagar a pai apaga as filhas.
    -- A regra de "1 nível só" é garantida na camada de lógica (o banco permitiria mais).
    parent_id       INT REFERENCES tasks(id) ON DELETE CASCADE,

    title           TEXT NOT NULL,
    description     TEXT,                               -- notas (a UI rotula como "Notas")
    -- Tipo da tarefa: task (padrão) | event (com hora) | birthday (recorrência anual).
    -- São tarefas próprias, distintas dos eventos lidos do Google Calendar.
    type            TEXT NOT NULL DEFAULT 'task'
                    CHECK (type IN ('task', 'event', 'birthday')),
    -- Prioridade em 4 níveis: 0=nenhuma 1=baixa 2=média 3=alta.
    priority        SMALLINT NOT NULL DEFAULT 0
                    CHECK (priority BETWEEN 0 AND 3),

    -- Datas (a UI avançada é da Fase 2+, mas os campos já existem):
    due_date        DATE,                               -- dia de vencimento
    due_time        TIME,                               -- hora opcional (NULL = dia inteiro)
    start_at        TIMESTAMPTZ,                        -- início do bloco (time-blocking, Fase 3)
    end_at          TIMESTAMPTZ,                        -- fim do bloco
    duration_min    INT,                                -- estimativa de duração (ritual Meu Dia)
    my_day_date     DATE,                               -- selecionada para "Meu Dia" desta data (Fase 3)
    google_event_id TEXT,                               -- id do evento espelho no calendário "Kaguya — Tarefas" (fatia 019)

    -- Ordenação manual: posições esparsas ×1000 (padrão validado no Journal).
    -- Inserir entre 1000 e 2000 vira 1500, sem renumerar a lista inteira.
    position        BIGINT NOT NULL DEFAULT 0,

    -- Ciclo de vida com timestamps (nunca booleans) — viram histórico de graça.
    completed_at    TIMESTAMPTZ,                        -- NULL = aberta
    deleted_at      TIMESTAMPTZ,                        -- soft delete; NULL = viva
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Um bloco de tempo precisa de início para ter fim.
    CHECK (end_at IS NULL OR start_at IS NOT NULL),
    -- Uma hora de vencimento exige um dia de vencimento.
    CHECK (due_time IS NULL OR due_date IS NOT NULL)
);

-- Índices guiados pelas queries reais das views (sempre filtrando tarefas vivas).
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks (project_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks (due_date)    WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks (parent_id)   WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_my_day    ON tasks (my_day_date) WHERE my_day_date IS NOT NULL;


-- ----------------------------------------------------------------------------
-- Migrações idempotentes — bancos pré-existentes
-- ----------------------------------------------------------------------------
-- ATENÇÃO: CREATE TABLE IF NOT EXISTS é no-op numa tabela que já existe.
-- Qualquer coluna acrescentada DEPOIS da criação original do banco precisa de
-- um ALTER TABLE ... ADD COLUMN IF NOT EXISTS próprio para ser adicionada em
-- produção. A declaração dentro do CREATE TABLE cobre apenas bancos novos.
-- Padrão: toda coluna nova → entra no CREATE TABLE (banco novo) E aqui (banco existente).

-- fatia 019: id do evento espelho no Google Calendar "Kaguya — Tarefas"
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;


-- ----------------------------------------------------------------------------
-- task_recurrences — regra de recorrência (1:1 com a tarefa viva da série)
-- ----------------------------------------------------------------------------
-- Tabela criada agora, mas só ganha lógica/UI na Fase 2 (012). Adormecida no MVP.
CREATE TABLE IF NOT EXISTS task_recurrences (
    id          SERIAL PRIMARY KEY,
    -- UNIQUE: cada tarefa tem no máximo uma regra. CASCADE: some com a tarefa.
    task_id     INT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    rrule       TEXT NOT NULL,                  -- regra iCal RFC 5545 (ex.: 'FREQ=MONTHLY;BYMONTHDAY=5')
    -- fixed = âncora fixa; after_completion = conta a partir da conclusão real.
    mode        TEXT NOT NULL DEFAULT 'fixed'
                CHECK (mode IN ('fixed', 'after_completion')),
    anchor_date DATE NOT NULL,                  -- âncora da série (DTSTART) — base do cálculo em modo fixed
    active      BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = série encerrada ("complete forever"); preserva histórico
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- task_tags + task_tag_links — etiquetas N:N
-- ----------------------------------------------------------------------------
-- Criadas agora; a UI de tags (e o token #tag no quick-add) é da Fase 2.
CREATE TABLE IF NOT EXISTS task_tags (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,                  -- ex.: 'high-energy', '5min', 'donext'
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nome único ignorando caixa (mesmo padrão de journal_emotions).
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_tags_name ON task_tags (LOWER(name));

CREATE TABLE IF NOT EXISTS task_tag_links (
    task_id     INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id      INT NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)              -- chave composta evita link duplicado
);


-- ----------------------------------------------------------------------------
-- task_filters — smart lists (filtros salvos como objetos de primeira classe)
-- ----------------------------------------------------------------------------
-- Criada agora; lógica/UI de smart lists é da Fase 2 (012). Adormecida no MVP.
CREATE TABLE IF NOT EXISTS task_filters (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    icon         TEXT,
    rules        JSONB NOT NULL,                 -- regras declarativas (DSL — ver data-model.md)
    default_view TEXT NOT NULL DEFAULT 'list'
                 CHECK (default_view IN ('list', 'kanban', 'calendar', 'eisenhower')),
    position     BIGINT NOT NULL DEFAULT 0,      -- ordem na sidebar
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- kanban_views — views de board configuráveis (spec 024)
-- ----------------------------------------------------------------------------
-- Views salvas e nomeadas, GLOBAIS (sem project_id) e reutilizáveis em qualquer
-- board. Cada view captura: (a) configuração de exibição (adornos visíveis +
-- métricas dos 3 slots do rodapé) e (b) um filtro opcional (FilterRules inline,
-- mesmo DSL das smart-lists — avaliado por tools_filters._build_where_from_rules).
-- A view ativa por lista é estado de UI (localStorage), não vive aqui.
CREATE TABLE IF NOT EXISTS kanban_views (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    -- Built-in "Completa": semente de sistema, não deletável nem renomeável.
    is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,
    display     JSONB NOT NULL,                 -- {adornos:{...}, slots:[m1,m2,m3]}
    filter      JSONB,                          -- FilterRules ou NULL (sem filtro)
    position    BIGINT NOT NULL DEFAULT 0,      -- ordem no seletor (esparsa ×1000)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No máximo UMA view built-in (mesma ideia do índice parcial do Inbox/done).
-- Permite o seed idempotente da "Completa" via ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_views_builtin
    ON kanban_views (is_builtin) WHERE is_builtin;


-- ----------------------------------------------------------------------------
-- habits + habit_checkins — módulo de hábitos
-- ----------------------------------------------------------------------------
-- Criados agora; lógica/UI de hábitos é da Fase 4 (014). Adormecidos no MVP.
CREATE TABLE IF NOT EXISTS habits (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    icon         TEXT,
    color        TEXT,
    -- Frequência alvo: freq_num vezes a cada freq_den dias (ex.: 5/7 = 5x por semana).
    freq_num     SMALLINT NOT NULL DEFAULT 1,
    freq_den     SMALLINT NOT NULL DEFAULT 1,
    -- Hábito mensurável: meta numérica por check-in (NULL = sim/não).
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


-- ----------------------------------------------------------------------------
-- calendar_prefs — preferências de calendário (visibilidade + cor por calendário)
-- ----------------------------------------------------------------------------
-- Persistidas entre sessões. Alimentadas pelo calendar_hub (fatia 019).
-- calendar_id corresponde ao id do CalendarItem/SOURCE (ex.: 'kaguya', 'nami', 'gcal').
CREATE TABLE IF NOT EXISTS calendar_prefs (
    calendar_id  TEXT PRIMARY KEY,            -- id do calendário conectado
    visible      BOOL NOT NULL DEFAULT TRUE,  -- mostrar/ocultar no grid e no mês
    color        TEXT,                        -- cor OKLCH sobrescrita (NULL = cor padrão do cal.)
    position     INT  NOT NULL DEFAULT 0      -- ordem na coluna lateral
);


-- ----------------------------------------------------------------------------
-- SEED — Inbox indelével (a única lista que nasce com o sistema)
-- ----------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING + índice único parcial uq_task_projects_inbox garantem
-- que rodar o schema de novo não cria um segundo Inbox.
INSERT INTO task_projects (name, is_inbox, icon)
VALUES ('Inbox', TRUE, '📥')
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
-- SEED — view de Kanban built-in "Completa" (spec 024)
-- ----------------------------------------------------------------------------
-- Todos os adornos ligados + slots default. É a view default de qualquer board
-- sem seleção prévia e o baseline de fidelidade visual (A1/A8). ON CONFLICT DO
-- NOTHING + uq_kanban_views_builtin garantem que rodar de novo não duplica.
INSERT INTO kanban_views (name, is_builtin, display, filter, position)
VALUES (
    'Completa', TRUE,
    '{"adornos":{"capacity_meter":true,"subtask_ring":true,"summary_footer":true,"card_chips":true},"slots":["abertas","tempo_estimado","em_andamento"]}'::jsonb,
    NULL, 1000
)
ON CONFLICT DO NOTHING;
