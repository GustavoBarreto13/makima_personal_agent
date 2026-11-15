"""Histórico do chat do app com o Hermes (tabela `app_chat_messages`).

A conversa do app é própria (não é a do WhatsApp/Telegram); a memória de longo prazo do Hermes é
compartilhada, mas o histórico mostrado aqui vive neste banco e some quando o usuário limpa.
A tabela é criada sob demanda (`CREATE TABLE IF NOT EXISTS`) para o primeiro deploy não depender de
rodar o setup de schemas; a mesma definição está em `webapp/backend/schema_pg.sql`.
"""

import json

from agents.db import get_conn, run_select

_READY = False
_DDL = """
CREATE TABLE IF NOT EXISTS app_chat_messages (
    id         BIGSERIAL   PRIMARY KEY,
    email      TEXT        NOT NULL,
    role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT        NOT NULL,
    actions    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_chat_messages_email ON app_chat_messages (email, id DESC);
"""


def ensure_table() -> None:
    """Cria a tabela uma vez por processo (idempotente)."""
    global _READY
    if _READY:
        return
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(_DDL)
    _READY = True


def add_message(email: str, role: str, content: str, actions: list[dict] | None = None) -> int:
    """Grava uma mensagem e devolve o id."""
    ensure_table()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_chat_messages (email, role, content, actions) VALUES (%s, %s, %s, %s::jsonb) RETURNING id",
            (email, role, content, json.dumps(actions or [], ensure_ascii=False)),
        )
        return cur.fetchone()[0]


def list_messages(email: str, limit: int = 60) -> list[dict]:
    """Últimas `limit` mensagens, da mais antiga para a mais nova."""
    ensure_table()
    rows = run_select(
        """
        SELECT id, role, content, actions, created_at FROM app_chat_messages
         WHERE email = %(e)s ORDER BY id DESC LIMIT %(n)s
        """,
        {"e": email, "n": max(1, min(limit, 200))},
    )
    out = [
        {"id": r["id"], "role": r["role"], "content": r["content"], "actions": r["actions"] or [], "created_at": r["created_at"].isoformat()}
        for r in rows
    ]
    return list(reversed(out))


def clear_messages(email: str) -> int:
    """Apaga todo o histórico deste usuário. Devolve quantas mensagens saíram."""
    ensure_table()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM app_chat_messages WHERE email = %s", (email,))
        return cur.rowcount
