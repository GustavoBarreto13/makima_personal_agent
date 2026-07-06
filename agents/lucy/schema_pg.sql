-- agents/lucy/schema_pg.sql
-- Schema da tabela de histórico de emails classificados (Lucy) no PostgreSQL.
-- Introduz 1 tabela nova: lucy_emails.
-- Rodar via: python scripts/setup_schemas.py (dentro do container makima-web no VPS)

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: lucy_emails (histórico de emails processados pelo digest)
-- ─────────────────────────────────────────────────────────────────────────────
-- Autocontida (sem FKs para outras tabelas do repo) — Princípio III (self-contained).
-- gmail_uid guarda o X-GM-MSGID (id permanente do Gmail, imutável) — chave natural
-- do upsert idempotente (R2/R8 do research.md da spec 032).
CREATE TABLE IF NOT EXISTS lucy_emails (
    id             TEXT        PRIMARY KEY,           -- UUID (str(uuid.uuid4()))
    gmail_uid      TEXT        UNIQUE NOT NULL,        -- X-GM-MSGID — chave do upsert
    from_name      TEXT,                               -- remetente (decodificado RFC2047)
    from_addr      TEXT,                               -- endereço do remetente
    subject        TEXT,                               -- assunto decodificado
    category       TEXT        NOT NULL,               -- uma das 10 categorias fixas
    priority       TEXT,                               -- high | medium | low
    summary        TEXT,                               -- resumo de 1 linha gerado pela IA
    action         TEXT,                               -- arquivar | responder | ler | agir | ignorar
    received_date  DATE,                               -- data local (America/Sao_Paulo) de recebimento
    classified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- momento da classificação; atualizado no upsert
);

-- Índice para consulta por categoria/período (base para tela futura).
CREATE INDEX IF NOT EXISTS idx_lucy_emails_cat_date
    ON lucy_emails (category, received_date DESC);
