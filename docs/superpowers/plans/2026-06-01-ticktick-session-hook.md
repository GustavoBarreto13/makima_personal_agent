# TickTick Session Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um hook `SessionStart` que injeta o estado atual da tarefa "Makima - Personal Agent" do TickTick no contexto de cada sessão Claude Code.

**Architecture:** Um script Python standalone (`scripts/ticktick_status.py`) reutiliza a lógica de autenticação OAuth já existente no MCP server do TickTick, busca a task raiz e suas sub-tarefas recursivamente via API, e imprime um resumo de status no stdout. O hook no `.claude/settings.local.json` executa esse script ao iniciar cada sessão. Um guia em `docs/setup-hook.md` documenta como replicar a configuração em outras máquinas.

**Tech Stack:** Python 3, `requests`, `python-dotenv`, TickTick Open API v1, Claude Code hooks

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/ticktick_status.py` | Criar | Script standalone — autentica, busca tasks, imprime status |
| `.claude/settings.local.json` | Criar | Hook SessionStart (não commitado — específico por máquina) |
| `docs/setup-hook.md` | Criar | Guia para configurar em outras máquinas |

---

## Task 1: Script `scripts/ticktick_status.py`

**Files:**
- Create: `scripts/ticktick_status.py`

- [ ] **Step 1: Criar o script**

Crie `scripts/ticktick_status.py`. A lógica de refresh OAuth é a mesma do `mcp_servers/ticktick/server.py` — reutilizada diretamente.

```python
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
        _print_tree(tasks, task["id"], indent + 1)


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
```

- [ ] **Step 2: Testar o script manualmente**

```bash
cd c:\Users\barreto.gustavo\Documents\GitHub\makima_personal_agent
.venv\Scripts\python scripts/ticktick_status.py
```

Saída esperada:
```
=== Makima - Personal Agent (TickTick) ===
[ ] Nami - Finance Agent
    [ ] Contas Fixas
    ...
==========================================
```

- [ ] **Step 3: Testar falha silenciosa com token inválido**

```bash
set TICKTICK_ACCESS_TOKEN=invalido && set TICKTICK_REFRESH_TOKEN= && .venv\Scripts\python scripts/ticktick_status.py
echo Exit: %ERRORLEVEL%
```

Esperado: sem output no stdout, mensagem de erro no stderr, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/ticktick_status.py
git commit -m "feat: add TickTick status script for SessionStart hook"
```

---

## Task 2: Hook `SessionStart` no `.claude/settings.local.json`

**Files:**
- Create: `.claude/settings.local.json`

> `settings.local.json` não é commitado (caminhos absolutos são específicos por máquina).

- [ ] **Step 1: Criar `.claude/settings.local.json`**

Crie o arquivo na raiz do projeto:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "cd c:\\Users\\barreto.gustavo\\Documents\\GitHub\\makima_personal_agent && .venv\\Scripts\\python scripts/ticktick_status.py"
      }
    ]
  }
}
```

- [ ] **Step 2: Verificar que o hook funciona**

Feche a sessão atual do Claude Code e abra uma nova neste projeto. O output do script deve aparecer no contexto inicial da sessão.

Se não aparecer, verificar:
1. O caminho no `command` está correto e absoluto
2. A venv existe em `.venv/` com `requests` e `python-dotenv` instalados
3. As env vars `TICKTICK_*` estão disponíveis no ambiente onde o Claude Code roda

---

## Task 3: Guia `docs/setup-hook.md`

**Files:**
- Create: `docs/setup-hook.md`

- [ ] **Step 1: Criar o guia**

```markdown
# Configurar Hook SessionStart — TickTick Status

Este hook injeta o estado atual da tarefa "Makima - Personal Agent" do TickTick
no contexto de cada sessão Claude Code.

## Pré-requisitos

- Claude Code instalado
- Venv do projeto criada com dependências instaladas (`pip install -r requirements.txt`)
- Variáveis de ambiente `TICKTICK_*` configuradas no `.env` ou no ambiente do sistema

## Passos

1. Crie `.claude/settings.local.json` na raiz do projeto (ajuste o caminho absoluto):

**Linux/Mac:**
\`\`\`json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "cd /caminho/para/makima_personal_agent && .venv/bin/python scripts/ticktick_status.py"
      }
    ]
  }
}
\`\`\`

**Windows:**
\`\`\`json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "cd C:\\caminho\\para\\makima_personal_agent && .venv\\Scripts\\python scripts/ticktick_status.py"
      }
    ]
  }
}
\`\`\`

2. Abra uma nova sessão Claude Code no projeto — o status do TickTick aparece automaticamente.

## Saída esperada

\`\`\`
=== Makima - Personal Agent (TickTick) ===
[ ] Nami - Finance Agent
    [ ] Contas Fixas
    ...
[x] Kaguya Shinomiya - TickTick Agent
==========================================
\`\`\`

## Notas

- `settings.local.json` não é commitado — caminhos absolutos são específicos por máquina
- O script reutiliza as mesmas credenciais `TICKTICK_*` do MCP server da Kaguya
- Erros (token inválido, sem internet) são impressos no stderr e ignorados — a sessão continua normalmente
- Para desativar, remova ou renomeie `.claude/settings.local.json`
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup-hook.md
git commit -m "docs: add setup guide for TickTick SessionStart hook"
```

---

## Verificação Final

- [ ] Abrir nova sessão e confirmar que o status do TickTick aparece no contexto inicial
- [ ] Confirmar que tasks concluídas aparecem como `[x]` e pendentes como `[ ]`
- [ ] Confirmar que fechar e reabrir a sessão continua funcionando
