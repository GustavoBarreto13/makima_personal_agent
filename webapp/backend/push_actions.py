"""Token assinado dos botões da notificação (Concluir / Adiar 1h / Amanhã).

O botão da notificação roda código nativo SEM a sessão do usuário (o token de sessão do app gira
a cada uso, e reaproveitar um antigo revoga o aparelho). Por isso o servidor manda, junto com o
push, um token próprio: ele só vale para UMA tarefa e por poucas horas, e só serve para este
endpoint — nunca abre o resto da API.

Usage:
    token = sign_action_token(42)
    task_id = read_action_token(token)   # 42, ou levanta PushActionError
"""

import itsdangerous

from webapp.backend.config import SESSION_SECRET

# Salt próprio: um token de sessão, de cookie ou de outro contexto nunca vale aqui (nem o contrário).
_serializer = itsdangerous.URLSafeTimedSerializer(SESSION_SECRET, salt="makima-push-action")

# O lembrete sai até 15 min depois da hora e a tarefa pode ser adiada: 36 h cobrem "dormi e toquei de manhã".
ACTION_MAX_AGE_SECONDS = 36 * 3600

# Ações aceitas pelo endpoint (as mesmas que o app desenha como botões).
VALID_ACTIONS = ("complete", "snooze_1h", "tomorrow")


class PushActionError(Exception):
    """Token de ação inválido ou vencido.

    Attributes:
        status: Código HTTP que o router deve devolver.
        message: Texto seguro para mostrar ao usuário.
    """

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def sign_action_token(task_id: int) -> str:
    """Gerar o token que autoriza os botões de UMA tarefa.

    Args:
        task_id: Id da tarefa do lembrete.

    Returns:
        Token assinado (seguro para ir em dado de push).
    """
    return _serializer.dumps({"task_id": int(task_id)})


def read_action_token(token: str) -> int:
    """Validar o token e devolver a tarefa a que ele dá acesso.

    Args:
        token: Token recebido do app.

    Returns:
        Id da tarefa.

    Raises:
        PushActionError: 401 se o token for inválido, adulterado ou vencido.
    """
    try:
        data = _serializer.loads(token, max_age=ACTION_MAX_AGE_SECONDS)
        return int(data["task_id"])
    except (itsdangerous.BadSignature, KeyError, TypeError, ValueError) as exc:
        # SignatureExpired é subclasse de BadSignature: cai aqui também.
        raise PushActionError(401, "Botão expirado — abra o app.") from exc
