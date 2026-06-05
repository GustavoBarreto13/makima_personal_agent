"""Tools cross-agent do agente Kaguya — integração entre TickTick e Nami (BigQuery).

Este módulo contém APENAS as tools que dependem de lógica cross-agent interna ao projeto
(importar tools da Nami). As tools genéricas do TickTick (listar, criar, completar tarefas,
etc.) foram migradas para mcp_servers/ticktick/server.py para rodar como processo MCP isolado.

Tools disponíveis:
    complete_payment_task    — completa tarefa de pagamento no TickTick E lança no BigQuery
    create_expense_reminder  — cria tarefa de lembrete de pagamento futuro no TickTick

Usage:
    Essas tools são passadas diretamente para o agente Kaguya em agents/kaguya/agent.py.
    Não é necessário chamá-las diretamente.
"""

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

log = logging.getLogger(__name__)

# URL base da API Open do TickTick e endpoint de renovação OAuth
_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"

# Delay mínimo entre chamadas à API para respeitar o rate limit do TickTick
_API_DELAY = 0.2  # segundos

# Cache mínimo de token em memória — necessário para as chamadas diretas neste módulo
# (o servidor MCP tem seu próprio cache independente)
_cached_token: Optional[str] = None
_cached_expires_at: Optional[datetime] = None


def _is_token_expired() -> bool:
    """Verifica se o access token em cache está expirado ou prestes a expirar.

    Usa uma margem de 5 minutos para renovar antes da expiração real —
    evita falhas em chamadas que ocorrem exatamente na hora de expiração.

    Returns:
        True se o token está expirado ou ausente; False se ainda é válido.
    """
    # Se não há token em cache, considera expirado — forçará a leitura da env var
    if _cached_token is None:
        return True
    # Se não temos informação de expiração, assume válido (evita renovação desnecessária)
    if _cached_expires_at is None:
        return True
    # Compara o horário atual (UTC) com a data de expiração, descontando a margem de 5 min
    return datetime.now(timezone.utc) >= _cached_expires_at - timedelta(minutes=5)


def _get_access_token() -> str:
    """Retorna um access token válido do TickTick, lendo do cache ou das env vars.

    Na primeira chamada, inicializa o cache a partir das variáveis de ambiente
    TICKTICK_ACCESS_TOKEN e TICKTICK_EXPIRES_AT. Se o token estiver expirado e
    não houver refresh token configurado, usa o token atual mesmo assim (com aviso).

    Returns:
        Access token para autenticar nas chamadas à API do TickTick.

    Raises:
        EnvironmentError: Se TICKTICK_ACCESS_TOKEN não estiver configurado.
    """
    global _cached_token, _cached_expires_at

    # Inicializa o cache na primeira chamada lendo as variáveis de ambiente
    if _cached_token is None:
        _cached_token = os.environ.get("TICKTICK_ACCESS_TOKEN", "")
        expires_str = os.environ.get("TICKTICK_EXPIRES_AT", "")
        if expires_str:
            try:
                # Converte a string ISO 8601 para datetime com timezone UTC
                _cached_expires_at = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
                # Garante que o datetime tem timezone (aware), necessário para comparação
                if _cached_expires_at.tzinfo is None:
                    _cached_expires_at = _cached_expires_at.replace(tzinfo=timezone.utc)
            except ValueError:
                # Formato de data inválido — ignora e assume token válido
                _cached_expires_at = None

    # Se o token está expirado mas não há refresh token, avisa e usa o token atual
    if _is_token_expired() and not os.environ.get("TICKTICK_REFRESH_TOKEN", ""):
        if not _cached_token:
            raise EnvironmentError("TICKTICK_ACCESS_TOKEN não configurado")
        log.warning("TickTick (tools.py): token pode estar expirado.")

    return _cached_token


def _api_post(path: str, body: dict = None) -> Optional[dict]:
    """Faz uma requisição POST à API do TickTick e retorna o JSON de resposta.

    Usado apenas pelas tools cross-agent deste módulo (complete_payment_task).
    As tools genéricas no servidor MCP têm seu próprio método _api_post independente.

    Args:
        path: Caminho da API a partir da URL base (ex: "/project/{id}/task/{id}/complete").
        body: Corpo da requisição como dicionário Python (será serializado em JSON).

    Returns:
        Dicionário com a resposta JSON, ou None se a API retornar 404 (não encontrado).

    Raises:
        Exception: Para qualquer erro HTTP diferente de 404 ou erro de rede.
    """
    try:
        token = _get_access_token()
        resp = requests.post(
            f"{_TICKTICK_API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body or {},
            timeout=30,
        )
        # Aguarda o delay mínimo para não ultrapassar o rate limit da API
        time.sleep(_API_DELAY)

        # 404 significa que a tarefa não foi encontrada ou já foi concluída — retorna None
        if resp.status_code == 404:
            return None

        # Lança exceção para outros erros HTTP (4xx, 5xx)
        resp.raise_for_status()

        # Retorna o JSON ou dict vazio se a resposta não tem corpo (ex.: 204 No Content)
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick POST {path} falhou: {e}")
        raise


def _api_get(path: str) -> Optional[dict]:
    """Faz uma requisição GET à API do TickTick e retorna o JSON de resposta.

    Usado apenas por complete_payment_task para obter o título da tarefa
    quando transaction_name não foi informado pelo usuário.

    Args:
        path: Caminho da API a partir da URL base (ex: "/project/{id}/task/{id}").

    Returns:
        Dicionário com a resposta JSON, ou None se a API retornar 404.

    Raises:
        Exception: Para qualquer erro HTTP diferente de 404 ou erro de rede.
    """
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

    Este é o fluxo principal de integração entre Kaguya (tarefas) e Nami (finanças).
    Use quando o usuário disser que pagou algo que tinha uma tarefa associada no TickTick.
    A Kaguya deve confirmar valor, categoria e conta com o usuário ANTES de chamar esta tool.

    Parâmetros:
        task_id          — ID da tarefa de pagamento no TickTick.
        project_id       — ID do projeto da tarefa no TickTick.
        amount           — Valor pago em reais (ex: 150.00).
        category         — Categoria da despesa (ex: "Moradia", "Assinaturas").
        account          — Conta ou meio de pagamento (ex: "Itau", "Cartao Nu").
        transaction_name — Nome para a transação no BigQuery.
                           Se vazio, usa o título da tarefa do TickTick como fallback.

    Retorna:
        Dicionário com "status" ("ok" ou "partial"), detalhes de cada etapa
        e uma mensagem resumida do resultado.
    """
    # Importação local evita dependência circular no nível de módulo —
    # Nami importa coisas do BigQuery; importar no topo deste arquivo causaria
    # problemas se o BigQuery não estiver disponível ao inicializar o agente Kaguya.
    from agents.nami.tools import create_transaction

    # Dicionário que acumula o resultado de cada etapa para o retorno final
    results = {}

    # ── Passo 1: Completa a tarefa no TickTick ────────────────────────────────
    try:
        resp = _api_post(f"/project/{project_id}/task/{task_id}/complete")
        if resp is None:
            # None = 404 = tarefa não encontrada ou já concluída anteriormente
            results["ticktick"] = {"status": "error", "message": "Tarefa não encontrada ou já concluída"}
        else:
            results["ticktick"] = {"status": "ok", "message": "Tarefa concluída no TickTick"}
    except Exception as e:
        results["ticktick"] = {"status": "error", "message": str(e)}

    # ── Passo 2: Lança a despesa no BigQuery via tools da Nami ────────────────
    try:
        # Se o usuário não informou o nome da transação, buscamos o título da tarefa
        # para usar como nome — mais descritivo do que um valor genérico como "Pagamento"
        name = transaction_name
        if not name:
            task = _api_get(f"/project/{project_id}/task/{task_id}")
            name = task.get("title", "Pagamento") if task else "Pagamento"

        # Chama a tool da Nami para registrar a despesa no BigQuery
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

    # Status geral: "ok" somente se AMBAS as etapas tiveram sucesso;
    # "partial" se uma delas falhou (e o usuário precisa ser informado sobre qual)
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
    """Cria uma tarefa de lembrete de pagamento futuro no TickTick.

    Use quando o usuário mencionar uma despesa futura e quiser ser lembrado de pagar.
    Esta tool APENAS cria a tarefa no TickTick — o lançamento da despesa no BigQuery
    ocorre separadamente quando o usuário realmente pagar (via complete_payment_task).

    Parâmetros:
        title        — Título do lembrete (ex: "Pagar aluguel de junho").
        due_date     — Data de vencimento no formato YYYY-MM-DD.
        project_name — Nome do projeto no TickTick onde criar a tarefa (padrão: "Finanças").
        amount       — Valor esperado em reais — incluído na descrição para referência (opcional).
        description  — Notas adicionais sobre o pagamento (opcional).

    Retorna:
        Dicionário com "status" ("ok" ou "error"), o ID da tarefa criada e uma mensagem.
    """
    try:
        # Monta a descrição completa: se amount > 0, inclui o valor esperado como referência.
        # Isso facilita encontrar o valor correto ao pagar depois (via complete_payment_task).
        full_description = description
        if amount > 0:
            full_description = f"Valor esperado: R${amount:.2f}. {description}".strip()

        # Monta o payload da tarefa com prioridade Alta (5) —
        # lembretes de pagamento têm prioridade alta por padrão para não serem ignorados
        payload: dict = {
            "title": title,
            "priority": 5,
        }
        if due_date:
            # Formato de data exigido pela API do TickTick: ISO 8601 com timezone explícito
            payload["dueDate"] = f"{due_date}T00:00:00+0000"
        if full_description:
            payload["content"] = full_description

        # ── Resolve o ID do projeto pelo nome ─────────────────────────────────
        # A API do TickTick exige o ID numérico do projeto, não o nome.
        # Buscamos a lista de projetos e encontramos pelo nome (exato ou por prefixo).
        token = _get_access_token()
        resp = requests.get(
            f"{_TICKTICK_API_BASE}/project",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()

        # Filtra apenas projetos ativos (não fechados/arquivados)
        projects = [p for p in resp.json() if not p.get("closed")]

        # Busca o projeto pelo nome exato (case-insensitive)
        norm = project_name.strip().lower()
        project = next((p for p in projects if p.get("name", "").lower() == norm), None)

        # Fallback: busca por prefixo do nome caso não haja correspondência exata
        if not project:
            project = next((p for p in projects if p.get("name", "").lower().startswith(norm)), None)

        # Se encontrou o projeto, adiciona o ID ao payload
        if project:
            payload["projectId"] = project["id"]

        # ── Cria a tarefa via API ──────────────────────────────────────────────
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
