-- webapp/backend/schema_pg.sql
-- Tabelas do app Android (docs/planos/app_android). Aplicado por scripts/setup_schemas.py.
-- Idempotente (CREATE ... IF NOT EXISTS): pode rodar várias vezes sem estragar nada.

-- Um aparelho que fez login no app. Guarda só o HASH do refresh token (nunca o token em si),
-- então um vazamento do banco não permite entrar na conta.
CREATE TABLE IF NOT EXISTS mobile_devices (
    -- UUID gerado no Python (uuid4); faz parte do refresh token para localizar a linha.
    id            TEXT        PRIMARY KEY,
    -- E-mail dono do aparelho (hoje sempre o ALLOWED_EMAIL).
    email         TEXT        NOT NULL,
    -- Nome amigável mostrado na tela "aparelhos conectados" (ex.: "Pixel 8").
    name          TEXT        NOT NULL DEFAULT 'Android',
    -- SHA-256 do refresh token atual. Muda a cada renovação (rotação).
    refresh_hash  TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Último uso do refresh token: base da expiração deslizante de 90 dias.
    last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Preenchido quando o aparelho é revogado (logout ou "desconectar"); NULL = ativo.
    revoked_at    TIMESTAMPTZ
);

-- Token FCM (Firebase Cloud Messaging) de um aparelho: o "endereço" para onde o push é enviado.
CREATE TABLE IF NOT EXISTS push_devices (
    id               TEXT        PRIMARY KEY,
    -- O mesmo token não pode ser cadastrado duas vezes (reinstalar o app gera um novo).
    fcm_token        TEXT        NOT NULL UNIQUE,
    device_name      TEXT        NOT NULL DEFAULT 'Android',
    -- Liga o push ao aparelho logado; se o aparelho for apagado, o push fica órfão (SET NULL) e segue funcionando.
    mobile_device_id TEXT        REFERENCES mobile_devices(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Acelera "quais aparelhos ativos desse e-mail" e "qual push pertence a esse login".
CREATE INDEX IF NOT EXISTS idx_mobile_devices_email ON mobile_devices (email) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_push_devices_mobile ON push_devices (mobile_device_id);
