-- agents/komi/schema_pg.sql
-- Schema das tabelas de identidade canônica de pessoas (Komi) no PostgreSQL.
-- Introduz 4 tabelas novas: people, person_aliases, person_dates, person_links.
-- Rodar via: python scripts/setup_schemas.py (dentro do container makima-web no VPS)

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela principal: people (identidade canônica de cada pessoa)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada pessoa tem um UUID como PK (em TEXT — padrão de Nami/Frieren).
-- O campo `normalizado` é a chave de resolução: nome em minúsculo sem acento,
-- gerado pela camada de aplicação (função _norm em tools.py).
CREATE TABLE IF NOT EXISTS people (
    id           TEXT        PRIMARY KEY,           -- UUID (str(uuid.uuid4()))
    name         TEXT        NOT NULL,              -- nome de exibição
    normalizado  TEXT        NOT NULL,              -- minúsculo + sem acento; chave de resolução
    relationship TEXT,                              -- "amigo/amiga", "família", "trabalho"...
    category     TEXT        DEFAULT 'outros',      -- família | amigos | trabalho | outros (dirige filtros e cores)
    phone        TEXT,                              -- contato
    email        TEXT,                              -- contato
    instagram    TEXT,                              -- handle (sem normalizar)
    telegram     TEXT,                              -- handle do Telegram
    city         TEXT,                              -- cidade
    avatar_url   TEXT,                              -- URL de avatar; UI cai p/ iniciais se NULL
    notes        TEXT,                              -- observações livres
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    deleted      BOOLEAN     DEFAULT FALSE          -- soft delete: FALSE = viva
);

-- Migração idempotente para bancos que já existem sem a coluna category
-- (setup_schemas.py re-executa este arquivo; IF NOT EXISTS garante segurança)
ALTER TABLE people ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'outros';

-- Índice único parcial: impede duplicar o mesmo nome (por normalizado) entre pessoas vivas.
-- Permite recriar uma pessoa com o mesmo nome DEPOIS de excluí-la (soft delete).
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_normalizado_vivo
    ON people (normalizado) WHERE deleted = FALSE;

-- Índice auxiliar para filtrar pessoas excluídas nas listagens.
CREATE INDEX IF NOT EXISTS idx_people_deleted ON people (deleted);


-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: person_aliases (apelidos — nomes alternativos que resolvem para a mesma pessoa)
-- ─────────────────────────────────────────────────────────────────────────────
-- Um apelido ("Aninha", "ana", "Anasilva") aponta para exatamente uma pessoa.
-- Cascade real: excluir a pessoa apaga os apelidos automaticamente.
CREATE TABLE IF NOT EXISTS person_aliases (
    id          SERIAL      PRIMARY KEY,
    person_id   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    alias       TEXT        NOT NULL,               -- exibição do apelido
    normalizado TEXT        NOT NULL                -- apelido normalizado (chave de busca)
);

-- Índice único GLOBAL: um apelido aponta para no máximo uma pessoa — evita duplicatas silenciosas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_normalizado ON person_aliases (normalizado);

-- Índice para buscar todos os apelidos de uma pessoa.
CREATE INDEX IF NOT EXISTS idx_alias_person ON person_aliases (person_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: person_dates (datas importantes — aniversário, casamento, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cascade real: excluir a pessoa apaga as datas automaticamente.
-- `recurring` = TRUE significa que a data repete todo ano (aniversário, etc.).
CREATE TABLE IF NOT EXISTS person_dates (
    id          SERIAL      PRIMARY KEY,
    person_id   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    label       TEXT        NOT NULL,               -- "aniversário", "casamento"...
    date        DATE        NOT NULL,               -- a data; ano pode ser placeholder se recorrente
    recurring   BOOLEAN     DEFAULT TRUE            -- repete todo ano?
);

-- Índice para buscar todas as datas de uma pessoa.
CREATE INDEX IF NOT EXISTS idx_dates_person ON person_dates (person_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: person_links (vínculo polimórfico N:N entre pessoa e item de qualquer domínio)
-- ─────────────────────────────────────────────────────────────────────────────
-- Liga uma pessoa a qualquer item: transação (Nami), tarefa (Kaguya),
-- livro (Frieren) ou bullet de diário (Journal).
--
-- SEM FK de banco para as tabelas de origem — os IDs têm tipos divergentes:
--   transactions.id = TEXT UUID  (Nami)
--   tasks.id        = SERIAL int (Kaguya)
--   books.id        = TEXT UUID  (Frieren)
--   journal_bullets.id = SERIAL int (Journal)
-- entity_id é armazenado como TEXT para absorver os dois formatos.
-- A integridade é garantida pela camada de aplicação (ver tools.py).
CREATE TABLE IF NOT EXISTS person_links (
    id          SERIAL      PRIMARY KEY,
    person_id   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    entity_type TEXT        NOT NULL                -- tipo do item vinculado
        CHECK (entity_type IN ('transaction', 'task', 'book', 'journal_bullet')),
    entity_id   TEXT        NOT NULL,               -- ID do item (TEXT absorve UUID e SERIAL int)
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    -- Restrição de unicidade: a mesma pessoa não pode estar vinculada duas vezes ao mesmo item.
    -- Escrita idempotente via INSERT ... ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING.
    CONSTRAINT uq_person_link UNIQUE (person_id, entity_type, entity_id)
);

-- Índice para a query "que pessoas estão vinculadas a este item?" (usado na exclusão do item-pai).
CREATE INDEX IF NOT EXISTS idx_links_entity ON person_links (entity_type, entity_id);

-- Índice para a aggregação por pessoa (get_person_summary).
CREATE INDEX IF NOT EXISTS idx_links_person ON person_links (person_id);
