-- scheduler/schema_pg.sql
-- Tabela que registra CADA execução de um job agendado.
--
-- Por que ela existe: o padrão antigo (loop + sleep num container) não deixava
-- nenhum rastro no banco. Foi assim que o backup ficou meses quebrado sem
-- ninguém perceber. Aqui, toda vez que um job roda, gravamos uma linha —
-- começando com status 'running' e terminando com 'success' ou 'error'. Assim
-- dá para inspecionar o histórico (via Adminer ou uma tela futura) e saber
-- exatamente quando cada coisa rodou e se deu certo.

CREATE TABLE IF NOT EXISTS scheduler_runs (
    -- Identificador único e crescente de cada execução (BIGSERIAL = inteiro que
    -- o Postgres incrementa sozinho a cada INSERT).
    id           BIGSERIAL   PRIMARY KEY,

    -- Nome do job que rodou (ex.: 'backup_postgres'). É o mesmo `name` definido
    -- no registry.py — é assim que ligamos a execução ao job.
    job_name     TEXT        NOT NULL,

    -- Instante em que a execução começou. TIMESTAMPTZ guarda o momento absoluto
    -- (com fuso). Para ler a hora local de São Paulo, usar
    -- `started_at AT TIME ZONE 'America/Sao_Paulo'` na query (regra do CLAUDE.md).
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Instante em que terminou. Fica NULL enquanto o job ainda está rodando.
    finished_at  TIMESTAMPTZ,

    -- Estado da execução: 'running' (em andamento), 'success' (terminou ok) ou
    -- 'error' (deu exceção). Começa como 'running' e é atualizado no final.
    status       TEXT        NOT NULL DEFAULT 'running',

    -- Texto do erro (traceback) quando status = 'error'. NULL quando deu certo.
    error        TEXT,

    -- Quanto tempo a execução levou, em milissegundos. Útil para notar quando um
    -- job começa a ficar lento. Preenchido no final.
    duration_ms  INTEGER
);

-- Índice para buscar rapidamente as últimas execuções de um job específico
-- (ex.: "mostre os 5 últimos backups"). Ordena por data decrescente para que a
-- execução mais recente venha primeiro sem custo extra.
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job
    ON scheduler_runs (job_name, started_at DESC);
