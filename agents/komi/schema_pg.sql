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
    entity_type TEXT        NOT NULL,               -- tipo do item vinculado (aberto: qualquer agente registra o seu)
    entity_id   TEXT        NOT NULL,               -- ID do item (TEXT absorve UUID e SERIAL int)
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    -- Restrição de unicidade: a mesma pessoa não pode estar vinculada duas vezes ao mesmo item.
    -- Escrita idempotente via INSERT ... ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING.
    CONSTRAINT uq_person_link UNIQUE (person_id, entity_type, entity_id)
);

-- Spec 077: a lista fixa de entity_type SAIU do banco. Antes, cada agente novo
-- (Violet, Akane...) precisava alargar o CHECK no boot. Agora qualquer agente
-- registra o seu tipo pelo contrato de integração (agents/komi/integration.py) e
-- o banco só exige um formato sensato (minúsculas, números e "_"), o que barra lixo
-- sem travar agentes futuros. O nome 'person_links_entity_type_check' é o que o
-- PostgreSQL gerou para o CHECK inline antigo; o DROP é idempotente.
ALTER TABLE person_links DROP CONSTRAINT IF EXISTS person_links_entity_type_check;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_links_entity_type_format') THEN
        ALTER TABLE person_links ADD CONSTRAINT person_links_entity_type_format
            CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,40}$');
    END IF;
END $$;

-- Índice para a query "que pessoas estão vinculadas a este item?" (usado na exclusão do item-pai).
CREATE INDEX IF NOT EXISTS idx_links_entity ON person_links (entity_type, entity_id);

-- Índice para a aggregação por pessoa (get_person_summary).
CREATE INDEX IF NOT EXISTS idx_links_person ON person_links (person_id);


-- =============================================================================
-- Spec 077 — Komi no Design System
-- Tudo abaixo é idempotente: pode rodar de novo (setup_schemas.py, ensure_schema()
-- e o script de migração fazem isso) sem duplicar nem perder dado.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- people: três campos de nome, espaço (pessoal/trabalho/ambos) e aniversário
-- ─────────────────────────────────────────────────────────────────────────────
-- `name` continua sendo o NOME que o dono escolhe (o que aparece em todo lugar).
-- `nickname` = Apelido e `full_name` = Nome completo. Cada um tem uma coluna
-- "_norm" (minúscula, sem acento) que é a chave de busca, gerada pela aplicação.
-- Nos outros agentes, o nome E o apelido servem para referenciar a pessoa.
ALTER TABLE people ADD COLUMN IF NOT EXISTS nickname        TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS nickname_norm   TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS full_name       TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS full_name_norm  TEXT;

-- Espaço da pessoa: 'personal' (pessoal), 'work' (trabalho) ou 'both' (ambos).
-- A Kaguya lê esta coluna para filtrar pessoas por espaço (people_space.py).
ALTER TABLE people ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT 'personal';

-- Aniversário é um campo de TODA pessoa (dia + mês obrigatórios juntos; ano é
-- opcional — a idade só aparece quando o ano existe). O lembrete é em dias antes
-- (NULL = sem lembrete; 0 = no próprio dia).
ALTER TABLE people ADD COLUMN IF NOT EXISTS birth_day            SMALLINT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS birth_month          SMALLINT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS birth_year           SMALLINT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS birthday_remind_days INT DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_context_check') THEN
        ALTER TABLE people ADD CONSTRAINT people_context_check
            CHECK (context IN ('personal', 'work', 'both'));
    END IF;
    -- Dia e mês andam juntos; ano só existe se houver dia/mês; faixas válidas.
    -- (Dia 31 em mês de 30 dias é barrado pela aplicação, que conhece o calendário.)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_birth_check') THEN
        ALTER TABLE people ADD CONSTRAINT people_birth_check CHECK (
            (birth_day IS NULL) = (birth_month IS NULL)
            AND (birth_year IS NULL OR birth_day IS NOT NULL)
            AND (birth_month IS NULL OR birth_month BETWEEN 1 AND 12)
            AND (birth_day   IS NULL OR birth_day   BETWEEN 1 AND 31)
        );
    END IF;
END $$;

-- O apelido também é único entre pessoas vivas: "@Bia" precisa apontar para
-- UMA pessoa. (Colisões entre nome × apelido × "outras formas" são checadas pela
-- aplicação — um índice só não cobre colunas e tabelas diferentes.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_nickname_vivo
    ON people (nickname_norm) WHERE deleted = FALSE AND nickname_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_fullname_norm ON people (full_name_norm) WHERE full_name_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_context ON people (context) WHERE deleted = FALSE;


-- ─────────────────────────────────────────────────────────────────────────────
-- person_categories: relacionamentos (família, amigos...) como LISTA CONFIGURÁVEL
-- ─────────────────────────────────────────────────────────────────────────────
-- `people.category` guarda o `slug` daqui. Arquivar não apaga: pessoas antigas
-- continuam apontando para o slug (a aplicação pede para onde mover). O `icon`
-- é um nome do registro de ícones do Design System (webapp/frontend/src/design/ui/icons.ts).
CREATE TABLE IF NOT EXISTS person_categories (
    id        SERIAL  PRIMARY KEY,
    slug      TEXT    NOT NULL UNIQUE,
    label     TEXT    NOT NULL,
    icon      TEXT    NOT NULL DEFAULT 'person',
    position  INT     NOT NULL DEFAULT 0,
    archived  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Sementes = as 4 categorias que sempre existiram. ON CONFLICT não sobrescreve o
-- que o dono renomeou/arquivou depois.
INSERT INTO person_categories (slug, label, icon, position) VALUES
    ('familia',  'Família',  'heart',  0),
    ('amigos',   'Amigos',   'people', 1),
    ('trabalho', 'Trabalho', 'work',   2),
    ('outros',   'Outros',   'person', 3)
ON CONFLICT (slug) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- person_dates: o lembrete de cada data importante (aniversário tem o seu em people)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE person_dates ADD COLUMN IF NOT EXISTS remind_days_before INT DEFAULT 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- person_notes: anotações (ideias de presente, do que gosta...)
-- ─────────────────────────────────────────────────────────────────────────────
-- A IA pode SUGERIR anotações a partir da memória (source='ia', status='sugerida',
-- com os backlinks de origem em source_refs). Nada vira 'ativa' sem o dono aceitar;
-- 'descartada' fica guardada (text_norm) para a IA não sugerir a mesma coisa de novo.
CREATE TABLE IF NOT EXISTS person_notes (
    id          SERIAL      PRIMARY KEY,
    person_id   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL DEFAULT 'nota'
        CHECK (kind IN ('presente', 'gosta', 'nao_gosta', 'nota')),
    context     TEXT        NOT NULL DEFAULT 'personal'
        CHECK (context IN ('personal', 'work')),
    text        TEXT        NOT NULL,
    text_norm   TEXT        NOT NULL,
    source      TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ia')),
    source_refs JSONB       NOT NULL DEFAULT '[]'::jsonb,
    status      TEXT        NOT NULL DEFAULT 'ativa'
        CHECK (status IN ('ativa', 'sugerida', 'descartada')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    deleted     BOOLEAN     DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_person_notes_person ON person_notes (person_id) WHERE deleted = FALSE;


-- ─────────────────────────────────────────────────────────────────────────────
-- person_interactions: "falei com fulano" (ligação, encontro, mensagem...)
-- ─────────────────────────────────────────────────────────────────────────────
-- Alimenta "sem contato há N dias", o heatmap das estatísticas e a Memória.
-- `context` separa interação de trabalho × pessoal (para quem é "ambos").
CREATE TABLE IF NOT EXISTS person_interactions (
    id          SERIAL      PRIMARY KEY,
    person_id   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL DEFAULT 'outro'
        CHECK (kind IN ('mensagem', 'ligacao', 'encontro', 'video', 'outro')),
    context     TEXT        NOT NULL DEFAULT 'personal'
        CHECK (context IN ('personal', 'work')),
    happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    deleted     BOOLEAN     DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_person_interactions_person
    ON person_interactions (person_id, happened_at DESC) WHERE deleted = FALSE;


-- ─────────────────────────────────────────────────────────────────────────────
-- person_memory_summaries: cache do resumo de IA da memória da pessoa
-- ─────────────────────────────────────────────────────────────────────────────
-- `source_hash` é um hash dos backlinks usados; se a memória mudar, o hash muda e a
-- tela mostra "desatualizado" (em vez de regerar sozinha e gastar IA à toa).
CREATE TABLE IF NOT EXISTS person_memory_summaries (
    person_id    TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    context      TEXT        NOT NULL DEFAULT 'all' CHECK (context IN ('all', 'personal', 'work')),
    summary      JSONB       NOT NULL,
    source_hash  TEXT        NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (person_id, context)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Relações entre pessoas e grupos
-- ─────────────────────────────────────────────────────────────────────────────
-- Tipos de relação configuráveis. `inverse_slug` = como a relação lê do outro lado
-- (pai_mae <-> filho). Igual ao próprio slug = simétrica (irmão, cônjuge, colega).
CREATE TABLE IF NOT EXISTS person_relation_kinds (
    slug         TEXT PRIMARY KEY,
    label        TEXT NOT NULL,
    inverse_slug TEXT NOT NULL,
    position     INT  NOT NULL DEFAULT 0
);
INSERT INTO person_relation_kinds (slug, label, inverse_slug, position) VALUES
    ('irmao',       'Irmão/irmã',            'irmao',       0),
    ('pai_mae',     'Pai/mãe',               'filho',       1),
    ('filho',       'Filho/filha',           'pai_mae',     2),
    ('conjuge',     'Cônjuge/parceiro(a)',   'conjuge',     3),
    ('amigo',       'Amigo(a)',              'amigo',       4),
    ('colega',      'Colega de trabalho',    'colega',      5),
    ('chefe',       'Chefe',                 'subordinado', 6),
    ('subordinado', 'Subordinado(a)',        'chefe',       7),
    ('outro',       'Outra relação',         'outro',       8)
ON CONFLICT (slug) DO NOTHING;

-- Uma linha = "A é <kind> de B". A aplicação grava só a forma canônica (o par
-- ordenado, ou o slug que vem primeiro quando há inverso), então o mesmo par nunca
-- aparece duas vezes.
CREATE TABLE IF NOT EXISTS person_relations (
    id         SERIAL      PRIMARY KEY,
    person_a   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    person_b   TEXT        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    kind       TEXT        NOT NULL REFERENCES person_relation_kinds(slug),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT person_relations_distinct CHECK (person_a <> person_b),
    CONSTRAINT uq_person_relation UNIQUE (person_a, person_b, kind)
);
CREATE INDEX IF NOT EXISTS idx_person_relations_a ON person_relations (person_a);
CREATE INDEX IF NOT EXISTS idx_person_relations_b ON person_relations (person_b);

-- Grupos livres ("turma da faculdade"): uma pessoa pode estar em vários.
CREATE TABLE IF NOT EXISTS person_groups (
    id          SERIAL      PRIMARY KEY,
    name        TEXT        NOT NULL,
    normalizado TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS person_group_members (
    group_id  INT  NOT NULL REFERENCES person_groups(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_person ON person_group_members (person_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- komi_migrations: marca as etapas de DADOS já aplicadas (scripts/migrate_komi_ds.py)
-- ─────────────────────────────────────────────────────────────────────────────
-- Garante que uma etapa one-time (ex.: "category trabalho -> context work") não
-- rode duas vezes e desfaça uma escolha que o dono fez depois.
CREATE TABLE IF NOT EXISTS komi_migrations (
    name       TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
