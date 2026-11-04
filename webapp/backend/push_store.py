"""Acesso ao banco dos tokens de push (tabela `push_devices`).

Usado pelo router `/api/devices/push` (o app registra o aparelho) e pelo scheduler
(`scheduler/notify_channels.py` lê os tokens para enviar o aviso). Fica em um módulo só
para as duas pontas falarem exatamente com a mesma tabela.

Usage:
    from webapp.backend.push_store import list_push_tokens
    tokens = [d["fcm_token"] for d in list_push_tokens()]
"""

import uuid

from agents.db import get_conn


def register_token(fcm_token: str, device_name: str, mobile_device_id: str | None) -> str:
    """Cadastrar (ou atualizar) o token FCM de um aparelho.

    Idempotente: o app pode chamar a cada abertura. Se o token já existe, só atualiza o
    nome, o vínculo com o login e a data de último uso.

    Args:
        fcm_token: Token entregue pelo Firebase ao app.
        device_name: Nome amigável do aparelho.
        mobile_device_id: Aparelho logado dono do token (None se veio pelo site).

    Returns:
        O id do registro (novo ou o já existente).
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO push_devices (id, fcm_token, device_name, mobile_device_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (fcm_token) DO UPDATE
                SET device_name = EXCLUDED.device_name,
                    mobile_device_id = EXCLUDED.mobile_device_id,
                    last_used_at = NOW()
            RETURNING id
            """,
            (uuid.uuid4().hex, fcm_token, device_name[:80] or "Android", mobile_device_id),
        )
        return cur.fetchone()[0]


def remove_push_device(push_id: str) -> bool:
    """Apagar um registro de push pelo id. Retorna True se existia."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM push_devices WHERE id = %s", (push_id,))
        return cur.rowcount > 0


def list_push_tokens() -> list[dict]:
    """Listar todos os aparelhos que podem receber push (id + token)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, fcm_token FROM push_devices ORDER BY created_at")
        return [{"id": r[0], "fcm_token": r[1]} for r in cur.fetchall()]


def remove_tokens(fcm_tokens: list[str]) -> int:
    """Apagar tokens que o FCM recusou (aparelho desinstalou o app). Retorna quantos saíram."""
    if not fcm_tokens:
        return 0
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM push_devices WHERE fcm_token = ANY(%s)", (fcm_tokens,))
        return cur.rowcount
