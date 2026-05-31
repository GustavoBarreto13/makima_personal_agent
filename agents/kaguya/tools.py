# Tools específicas do projeto Kaguya — integração cross-agent com Nami.
# As tools genéricas do TickTick (list, create, update, complete, delete, etc.)
# foram migradas para mcp_servers/ticktick/server.py.
# Este módulo mantém apenas o que depende de lógica cross-agent interna ao projeto.

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

log = logging.getLogger(__name__)

_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"
_API_DELAY = 0.2

# Cache mínimo de token — necessário para complete_payment_task chamar a API diretamente
_cached_token: Optional[str] = None
_cached_expires_at: Optional[datetime] = None


def _is_token_expired() -> bool:
    """Verifica se o access token está expirado (margem de 5 min)."""
    if _cached_token is None:
        return True
    if _cached_expires_at is None:
        return True
    return datetime.now(timezone.utc) >= _cached_expires_at - timedelta(minutes=5)


def _get_access_token() -> str:
    """Retorna access token válido, renovando se necessário."""
    global _cached_token, _cached_expires_at

    if _cached_token is None:
        _cached_token = os.environ.get("TICKTICK_ACCESS_TOKEN", "")
        expires_str = os.environ.get("TICKTICK_EXPIRES_AT", "")
        if expires_str:
            try:
                _cached_expires_at = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
                if _cached_expires_at.tzinfo is None:
                    _cached_expires_at = _cached_expires_at.replace(tzinfo=timezone.utc)
            except ValueError:
                _cached_expires_at = None

    if _is_token_expired() and not os.environ.get("TICKTICK_REFRESH_TOKEN", ""):
        if not _cached_token:
            raise EnvironmentError("TICKTICK_ACCESS_TOKEN não configurado")
        log.warning("TickTick (tools.py): token pode estar expirado.")

    return _cached_token


def _api_post(path: str, body: dict = None) -> Optional[dict]:
    """Requisição POST mínima — usada apenas por complete_payment_task."""
    try:
        token = _get_access_token()
        resp = requests.post(
            f"{_TICKTICK_API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body or {},
            timeout=30,
        )
        time.sleep(_API_DELAY)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick POST {path} falhou: {e}")
        raise


def _api_get(path: str) -> Optional[dict]:
    """Requisição GET mínima — usada apenas por complete_payment_task para obter título."""
    try:
        token = _get_access_token()
        resp = requests.get(
            f"{_TICKTICK_API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=30,
        )
        time.sleep(_API_DELAY)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick GET {path} falhou: {e}")
        raise


def complete_payment_task(
    task_id: str,
    project_id: str,
    amount: float,
    category: str,
    account: str,
    transaction_name: str = "",
) -> dict:
    """Completa uma tarefa de pagamento no TickTick E lança a despesa no BigQuery.

    Use quando o usuário disser que pagou algo que tinha uma tarefa associada.
    Este é o fluxo principal de integração Kaguya + Nami.

    Parâmetros:
        task_id          — ID da tarefa de pagamento no TickTick.
        project_id       — ID do projeto da tarefa.
        amount           — Valor pago em reais.
        category         — Categoria da despesa (ex: "Moradia", "Assinaturas").
        account          — Conta/meio de pagamento (ex: "Itau", "Cartao Nu").
        transaction_name — Nome para a transação no BigQuery (padrão: título da tarefa).
    """
    from agents.nami.tools import create_transaction

    results = {}

    # Passo 1: Completa a tarefa no TickTick
    try:
        resp = _api_post(f"/project/{project_id}/task/{task_id}/complete")
        if resp is None:
            results["ticktick"] = {"status": "error", "message": "Tarefa não encontrada ou já concluída"}
        else:
            results["ticktick"] = {"status": "ok", "message": "Tarefa concluída no TickTick"}
    except Exception as e:
        results["ticktick"] = {"status": "error", "message": str(e)}

    # Passo 2: Lança a despesa no BigQuery via tools da Nami
    try:
        name = transaction_name
        if not name:
            task = _api_get(f"/project/{project_id}/task/{task_id}")
            name = task.get("title", "Pagamento") if task else "Pagamento"

        tx_result = create_transaction(
            name=name,
            valor=amount,
            tipo="Despesa",
            categoria=category,
            conta=account,
        )
        results["bigquery"] = tx_result
    except Exception as e:
        results["bigquery"] = {"status": "error", "message": str(e)}

    overall = "ok" if all(r["status"] == "ok" for r in results.values()) else "partial"

    return {
        "status": overall,
        "ticktick": results["ticktick"],
        "bigquery": results["bigquery"],
        "message": (
            f"Tarefa concluída e despesa de R${amount:.2f} lançada em {category}."
            if overall == "ok"
            else "Uma ou mais operações falharam — veja detalhes acima."
        ),
    }


def create_expense_reminder(
    title: str,
    due_date: str,
    project_name: str = "Finanças",
    amount: float = 0.0,
    description: str = "",
) -> dict:
    """Cria uma tarefa de lembrete de pagamento no TickTick.

    Use quando o usuário criar ou mencionar uma despesa futura e quiser um lembrete.
    Esta tool APENAS cria a tarefa — o lançamento da despesa fica para quando o
    usuário realmente pagar (via complete_payment_task).

    Parâmetros:
        title        — Título do lembrete (ex: "Pagar aluguel").
        due_date     — Data de vencimento no formato YYYY-MM-DD.
        project_name — Nome do projeto no TickTick (padrão: "Finanças").
        amount       — Valor esperado — incluído na descrição para referência (opcional).
        description  — Notas adicionais (opcional).

    Nota: esta tool chama create_task via MCP internamente. Para criar a tarefa
    diretamente, use a tool create_task do servidor MCP.
    """
    try:
        full_description = description
        if amount > 0:
            full_description = f"Valor esperado: R${amount:.2f}. {description}".strip()

        # Cria a tarefa diretamente via API (sem passar pelo MCP para manter sincronia)
        payload: dict = {
            "title": title,
            "priority": 5,  # Alta — lembretes de pagamento têm prioridade alta por padrão
        }
        if due_date:
            payload["dueDate"] = f"{due_date}T00:00:00+0000"
        if full_description:
            payload["content"] = full_description

        # Resolve project_name via API direta (cache não disponível aqui)
        token = _get_access_token()
        resp = requests.get(
            f"{_TICKTICK_API_BASE}/project",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        projects = [p for p in resp.json() if not p.get("closed")]
        norm = project_name.strip().lower()
        project = next((p for p in projects if p.get("name", "").lower() == norm), None)
        if not project:
            project = next((p for p in projects if p.get("name", "").lower().startswith(norm)), None)
        if project:
            payload["projectId"] = project["id"]

        result = _api_post("/task", payload)
        if not result or "id" not in result:
            return {"status": "error", "message": "API não retornou ID da tarefa criada"}

        return {
            "status": "ok",
            "id": result["id"],
            "project_id": result.get("projectId", ""),
            "message": f"Lembrete criado: '{title}'" + (f" em {project_name}" if project_name else ""),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
