"""
Imprime o status da tarefa "Makima - Personal Agent" do TickTick.
Usado pelo hook SessionStart do Claude Code.
Lê credenciais das mesmas env vars do MCP TickTick (.env do projeto).
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"
_ROOT_TASK_ID = "6a1b7ed4ebd7ba00000000f8"
_PROJECT_ID = "69e7f722ebd7ba0000000158"


def _get_access_token() -> str:
    token = os.environ.get("TICKTICK_ACCESS_TOKEN", "")
    expires_at_str = os.environ.get("TICKTICK_EXPIRES_AT", "")

    if token and expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < expires_at - timedelta(minutes=5):
                return token
        except ValueError:
            pass

    client_id = os.environ.get("TICKTICK_CLIENT_ID", "")
    client_secret = os.environ.get("TICKTICK_CLIENT_SECRET", "")
    refresh_token = os.environ.get("TICKTICK_REFRESH_TOKEN", "")

    if not all([client_id, client_secret, refresh_token]):
        return token

    resp = requests.post(
        _TICKTICK_OAUTH_URL,
        auth=(client_id, client_secret),
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _get_project_tasks(token: str) -> list[dict]:
    resp = requests.get(
        f"{_TICKTICK_API_BASE}/project/{_PROJECT_ID}/data",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("tasks", [])


def _build_tree(tasks: list[dict], parent_id: str) -> list[dict]:
    children = [t for t in tasks if t.get("parentId") == parent_id]
    return sorted(children, key=lambda t: t.get("sortOrder", 0))


def _status_icon(task: dict) -> str:
    return "[x]" if task.get("status") == 2 else "[ ]"


def _print_tree(tasks: list[dict], parent_id: str, indent: int = 0) -> None:
    prefix = "    " * indent
    for task in _build_tree(tasks, parent_id):
        icon = _status_icon(task)
        title = task.get("title", "(sem título)")
        print(f"{prefix}{icon} {title}")
        task_id = task.get("id")
        if task_id:
            _print_tree(tasks, task_id, indent + 1)


def main() -> None:
    token = _get_access_token()
    if not token:
        print("[TickTick] sem token disponível", file=sys.stderr)
        return

    tasks = _get_project_tasks(token)

    root = next((t for t in tasks if t["id"] == _ROOT_TASK_ID), None)
    if root is None:
        print("[TickTick] task raiz não encontrada", file=sys.stderr)
        return

    print("=== Makima - Personal Agent (TickTick) ===")
    _print_tree(tasks, _ROOT_TASK_ID)
    print("==========================================")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[TickTick] erro: {e}", file=sys.stderr)
        sys.exit(0)
