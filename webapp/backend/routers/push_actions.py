"""Router dos botões da notificação push (Concluir / Adiar 1h / Amanhã).

Rota (SEM `require_user`: a credencial é o token assinado de uma tarefa, ver `push_actions.py`):
    POST /api/push/action  — executa a ação no lembrete de UMA tarefa

Usage:
    app.include_router(push_actions_router.router, prefix="/api/push", tags=["push"])
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.db import run_select
from agents.kaguya import tools_tasks
from webapp.backend.push_actions import VALID_ACTIONS, PushActionError, read_action_token

router = APIRouter()


class PushActionBody(BaseModel):
    """Corpo do POST: token recebido no push e ação tocada."""

    token: str
    action: str


@router.post("/action")
def run_push_action(body: PushActionBody) -> dict:
    """Executar a ação de um botão da notificação.

    Args:
        body: Token assinado da tarefa e a ação (`complete`, `snooze_1h` ou `tomorrow`).

    Returns:
        `{"status": "ok", "message": ...}`; tocar de novo em "Concluir" numa tarefa já concluída
        também devolve ok, sem fazer nada (não gera ocorrência extra de recorrente).

    Raises:
        HTTPException: 400 ação inválida; 401 token inválido/vencido; 404 tarefa inexistente;
            409 se a tarefa tem subtarefas abertas (o usuário decide dentro do app).
    """
    if body.action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="Ação inválida.")
    try:
        task_id = read_action_token(body.token)
    except PushActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc

    if body.action == "complete":
        # Já concluída? Toque repetido não pode reabrir nem gerar a próxima ocorrência de novo.
        rows = run_select(
            "SELECT completed_at IS NOT NULL AS done FROM tasks WHERE id = %(id)s AND deleted_at IS NULL",
            {"id": task_id},
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
        if rows[0]["done"]:
            return {"status": "ok", "message": "A tarefa já estava concluída."}
        result = tools_tasks.complete_task(task_id, cascade=False)
        if result.get("needs_cascade"):
            raise HTTPException(
                status_code=409, detail="Tem subtarefas abertas — abra o app para concluir."
            )
    elif body.action == "snooze_1h":
        result = tools_tasks.snooze_task(task_id, 60)
    else:
        result = tools_tasks.postpone_to_tomorrow(task_id)

    if result.get("status") != "ok":
        raise HTTPException(status_code=404, detail=result.get("message", "Não foi possível."))
    return {"status": "ok", "message": result.get("message", "Feito.")}
