"""Imprime o status da árvore de tarefas "Makima - Personal Agent" do TickTick.

Usado pelo hook SessionStart do Claude Code para exibir o progresso do projeto
a cada sessão de desenvolvimento. Lê as credenciais das mesmas env vars do MCP
TickTick (definidas no .env do projeto).

Usage:
    python scripts/ticktick_status.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do .env antes de acessar as credenciais
load_dotenv()

# URL base da API Open do TickTick
_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"

# Endpoint OAuth para renovar o access token via refresh grant
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"

# ID da tarefa raiz "Makima - Personal Agent" no TickTick
# (tarefa pai que agrupa todas as fases do projeto)
_ROOT_TASK_ID = "6a1b7ed4ebd7ba00000000f8"

# ID do projeto que contém a tarefa raiz
_PROJECT_ID = "69e7f722ebd7ba0000000158"


def _get_access_token() -> str:
    """Retorna um access token válido do TickTick, renovando se necessário.

    Verifica primeiro se o token em cache ainda é válido (margem de 5 min).
    Se expirado, tenta renovar via OAuth refresh grant usando as credenciais
    configuradas nas variáveis de ambiente.

    Returns:
        Access token para autenticar nas chamadas à API do TickTick.
        Retorna string vazia se nenhum token estiver disponível.
    """
    # Lê o token atual e a data de expiração das variáveis de ambiente
    token = os.environ.get("TICKTICK_ACCESS_TOKEN", "")
    expires_at_str = os.environ.get("TICKTICK_EXPIRES_AT", "")

    if token and expires_at_str:
        try:
            # Converte a string de expiração para datetime
            expires_at = datetime.fromisoformat(expires_at_str)

            # Garante que o datetime tem timezone (necessário para comparar com utcnow)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            # Se o token ainda é válido (com margem de 5 min), usa sem renovar
            if datetime.now(timezone.utc) < expires_at - timedelta(minutes=5):
                return token
        except ValueError:
            # Data de expiração em formato inválido — tenta renovar de qualquer forma
            pass

    # Token expirado ou ausente — tenta renovar via refresh grant
    client_id = os.environ.get("TICKTICK_CLIENT_ID", "")
    client_secret = os.environ.get("TICKTICK_CLIENT_SECRET", "")
    refresh_token = os.environ.get("TICKTICK_REFRESH_TOKEN", "")

    # Se alguma credencial estiver faltando, retorna o token atual (pode estar expirado)
    if not all([client_id, client_secret, refresh_token]):
        return token

    # Faz a requisição de refresh usando autenticação básica HTTP (client_id + client_secret)
    resp = requests.post(
        _TICKTICK_OAUTH_URL,
        auth=(client_id, client_secret),
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        timeout=10,
    )
    resp.raise_for_status()

    # Retorna o novo access token gerado pelo servidor OAuth
    return resp.json()["access_token"]


def _get_project_tasks(token: str) -> list[dict]:
    """Busca todas as tarefas do projeto Makima na API do TickTick.

    Args:
        token: Access token válido para autenticação na API.

    Returns:
        Lista de dicionários com os dados de cada tarefa do projeto.
    """
    # Endpoint /data retorna todas as tarefas do projeto, incluindo subtarefas
    resp = requests.get(
        f"{_TICKTICK_API_BASE}/project/{_PROJECT_ID}/data",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()

    # O campo "tasks" contém a lista flat de todas as tarefas (pais e filhas)
    return resp.json().get("tasks", [])


def _build_tree(tasks: list[dict], parent_id: str) -> list[dict]:
    """Retorna os filhos diretos de uma tarefa pai, ordenados pelo campo sortOrder.

    Args:
        tasks:     Lista plana de todas as tarefas do projeto.
        parent_id: ID da tarefa pai cujos filhos queremos listar.

    Returns:
        Lista de tarefas filhas, ordenadas pela posição definida no TickTick.
    """
    # Filtra apenas as tarefas que têm este parent_id como pai direto
    children = [t for t in tasks if t.get("parentId") == parent_id]

    # Ordena pela posição da tarefa na lista (campo sortOrder do TickTick)
    return sorted(children, key=lambda t: t.get("sortOrder", 0))


def _status_icon(task: dict) -> str:
    """Retorna o ícone de status de uma tarefa ([x] para concluída, [ ] para pendente).

    Args:
        task: Dicionário com os dados da tarefa.

    Returns:
        "[x]" se a tarefa está concluída (status == 2), "[ ]" caso contrário.
    """
    # No TickTick, status == 2 significa "concluída"
    return "[x]" if task.get("status") == 2 else "[ ]"


def _print_tree(tasks: list[dict], parent_id: str, indent: int = 0) -> None:
    """Imprime recursivamente a árvore de tarefas com indentação visual.

    Cada nível de profundidade adiciona 4 espaços de indentação.
    Percorre os filhos de cada tarefa recursivamente para exibir subtarefas.

    Args:
        tasks:     Lista plana de todas as tarefas do projeto.
        parent_id: ID da tarefa cujos filhos serão impressos neste nível.
        indent:    Nível de indentação atual (aumenta a cada chamada recursiva).
    """
    # 4 espaços por nível de profundidade
    prefix = "    " * indent

    for task in _build_tree(tasks, parent_id):
        icon = _status_icon(task)
        title = task.get("title", "(sem título)")

        # Imprime a linha da tarefa com indentação e ícone de status
        print(f"{prefix}{icon} {title}")

        # Chama recursivamente para imprimir as subtarefas desta tarefa (se houver)
        task_id = task.get("id")
        if task_id:
            _print_tree(tasks, task_id, indent + 1)


def main() -> None:
    """Obtém o token, busca as tarefas e imprime a árvore do projeto no terminal."""
    token = _get_access_token()
    if not token:
        print("[TickTick] sem token disponível", file=sys.stderr)
        return

    # Busca todas as tarefas do projeto
    tasks = _get_project_tasks(token)

    # Encontra a tarefa raiz do projeto Makima pelo ID fixo
    root = next((t for t in tasks if t["id"] == _ROOT_TASK_ID), None)
    if root is None:
        print("[TickTick] task raiz não encontrada", file=sys.stderr)
        return

    # Imprime a árvore de tarefas a partir da raiz
    print("=== Makima - Personal Agent (TickTick) ===")
    _print_tree(tasks, _ROOT_TASK_ID)
    print("==========================================")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Captura qualquer erro (rede, API, etc.) e imprime sem quebrar o hook do Claude Code
        print(f"[TickTick] erro: {e}", file=sys.stderr)
        sys.exit(0)
