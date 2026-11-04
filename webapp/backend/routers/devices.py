"""Router dos aparelhos do app Android: sessões ativas e tokens de push.

Rotas (todas exigem login via `require_user`):
    GET    /api/devices            — aparelhos logados (tela "aparelhos conectados")
    DELETE /api/devices/{id}       — desconectar um aparelho (revoga o acesso dele)
    POST   /api/devices/push       — registrar o token FCM deste aparelho (notificações push)
    DELETE /api/devices/push/{id}  — remover o registro de push (ex.: ao sair do app)

Usage:
    app.include_router(devices_router.router, prefix="/api/devices", tags=["devices"])
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from webapp.backend import mobile_auth, push_store
from webapp.backend.deps import require_user

router = APIRouter()


@router.get("")
def list_connected_devices(user: dict = Depends(require_user)) -> dict:
    """Listar os aparelhos do usuário que ainda estão conectados.

    Returns:
        `{"devices": [{id, name, created_at, last_used_at, current}]}`; `current` marca o
        aparelho que fez esta requisição (quando veio por bearer).
    """
    devices = mobile_auth.list_devices(user["email"])
    atual = user.get("did")  # só existe quando a requisição veio do app
    return {"devices": [{**d, "current": d["id"] == atual} for d in devices]}


@router.delete("/{device_id}")
def disconnect_device(device_id: str, user: dict = Depends(require_user)) -> dict:
    """Desconectar um aparelho (o app dele perde o acesso em até ~1 minuto).

    Raises:
        HTTPException: 404 se o aparelho não é deste usuário (ou não existe).
    """
    # Só deixa revogar aparelhos do próprio e-mail — evita mexer em id alheio por tentativa.
    meus = {d["id"] for d in mobile_auth.list_devices(user["email"])}
    if device_id not in meus:
        raise HTTPException(status_code=404, detail="Aparelho não encontrado.")
    mobile_auth.revoke_device(device_id)
    return {"status": "ok"}


class PushRegisterBody(BaseModel):
    """Corpo de `POST /api/devices/push`.

    Attributes:
        fcm_token: Token entregue pelo Firebase ao app (identifica este aparelho).
        device_name: Nome amigável do aparelho.
    """

    fcm_token: str = Field(min_length=20, max_length=4096)
    device_name: str = "Android"


@router.post("/push", status_code=201)
def register_push(body: PushRegisterBody, user: dict = Depends(require_user)) -> dict:
    """Registrar (ou atualizar) o token de push deste aparelho. Pode ser chamado a cada abertura."""
    # `did` só existe quando a requisição veio do app; pelo site fica sem vínculo.
    push_id = push_store.register_token(body.fcm_token, body.device_name, user.get("did"))
    return {"status": "ok", "id": push_id}


@router.delete("/push/{push_id}")
def unregister_push(push_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover um registro de push.

    Raises:
        HTTPException: 404 se o id não existe.
    """
    if not push_store.remove_push_device(push_id):
        raise HTTPException(status_code=404, detail="Registro de push não encontrado.")
    return {"status": "ok"}
