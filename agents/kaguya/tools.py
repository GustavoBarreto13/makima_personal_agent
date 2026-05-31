# Módulo de ferramentas do agente Kaguya — acesso completo ao TickTick via OAuth 2.0.
# Todas as funções públicas são tools registradas no ADK e retornam
# {"status": "ok"|"error", ...} — nunca lançam exceções para o agente.

import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests

# Logger do módulo — logs vão para stderr, visíveis nos logs do container
log = logging.getLogger(__name__)

# URL base da API Open do TickTick e endpoint de refresh OAuth
_TICKTICK_API_BASE = "https://api.ticktick.com/open/v1"
_TICKTICK_OAUTH_URL = "https://ticktick.com/oauth/token"

# Delay mínimo entre chamadas à API para respeitar o rate limit (200ms)
_API_DELAY = 0.2

# Prioridade numérica do TickTick → label legível para o usuário
PRIORITY_LABEL: dict[int, str] = {0: "Nenhuma", 1: "Baixa", 3: "Média", 5: "Alta"}

# Label de prioridade informado pelo usuário → valor numérico do TickTick
PRIORITY_VALUE: dict[str, int] = {"nenhuma": 0, "baixa": 1, "média": 3, "media": 3, "alta": 5}

# ── Cache do access token em memória ──────────────────────────────────────────
# Evita refresh desnecessário entre chamadas na mesma sessão do bot.
_cached_token: Optional[str] = None
_cached_expires_at: Optional[datetime] = None

# ── Cache de projetos em memória (TTL 5 min) ──────────────────────────────────
# Projetos são buscados dinamicamente da API para suportar renomeações e novos
# projetos sem mudança de código. Cache evita chamada à API em toda operação.
_projects_cache: list[dict] = []
_projects_cache_at: Optional[datetime] = None
_PROJECTS_CACHE_TTL = timedelta(minutes=5)


def _is_token_expired() -> bool:
    """Verifica se o access token em cache está expirado ou prestes a expirar (margem de 5 min)."""
    if _cached_token is None:
        return True
    if _cached_expires_at is None:
        return False  # sem data de expiração, assume válido
    return datetime.now(timezone.utc) >= _cached_expires_at - timedelta(minutes=5)


def _refresh_token() -> str:
    """Obtém um novo access token via OAuth refresh grant e atualiza o cache em memória.

    Loga o novo token para que o usuário possa atualizar manualmente no Dokploy se necessário.
    Não persiste em arquivo — tokens ficam apenas em memória e em variáveis de ambiente.
    """
    global _cached_token, _cached_expires_at

    client_id = os.environ.get("TICKTICK_CLIENT_ID", "")
    client_secret = os.environ.get("TICKTICK_CLIENT_SECRET", "")
    refresh_token = os.environ.get("TICKTICK_REFRESH_TOKEN", "")

    if not client_id or not client_secret:
        raise EnvironmentError("TICKTICK_CLIENT_ID e TICKTICK_CLIENT_SECRET são obrigatórios")
    if not refresh_token:
        raise EnvironmentError(
            "TICKTICK_REFRESH_TOKEN não configurado. "
            "Configure a variável de ambiente no Dokploy."
        )

    log.info("TickTick: renovando access token via refresh grant")
    resp = requests.post(
        _TICKTICK_OAUTH_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    _cached_token = data["access_token"]
    # TickTick pode rotacionar o refresh token — loga o novo para atualização manual
    new_refresh = data.get("refresh_token", refresh_token)
    if new_refresh != refresh_token:
        log.warning(
            f"TickTick: NOVO refresh token — atualize TICKTICK_REFRESH_TOKEN no Dokploy: {new_refresh}"
        )

    expires_in = int(data.get("expires_in", 15552000))  # padrão 180 dias
    _cached_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    log.info(f"TickTick: token renovado, expira em {_cached_expires_at.isoformat()}")
    log.info(f"TickTick: novo access token — atualize TICKTICK_ACCESS_TOKEN no Dokploy: {_cached_token}")

    return _cached_token


def _get_access_token() -> str:
    """Retorna um access token válido, renovando automaticamente se expirado."""
    global _cached_token, _cached_expires_at

    # Inicializa o cache na primeira chamada a partir das variáveis de ambiente
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

    if _is_token_expired():
        return _refresh_token()

    return _cached_token


def _headers() -> dict:
    """Retorna os headers HTTP necessários para qualquer chamada à API do TickTick."""
    return {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
    }


def _api_get(path: str, params: dict = None) -> Optional[dict | list]:
    """Faz uma requisição GET à API do TickTick e retorna o JSON parseado ou None em caso de erro."""
    try:
        resp = requests.get(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        time.sleep(_API_DELAY)  # respeita o rate limit da API
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except Exception as e:
        log.error(f"TickTick GET {path} falhou: {e}")
        raise


def _api_post(path: str, body: dict = None) -> Optional[dict]:
    """Faz uma requisição POST à API do TickTick e retorna o JSON parseado ou None."""
    try:
        resp = requests.post(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
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


def _api_delete(path: str) -> bool:
    """Faz uma requisição DELETE à API do TickTick. Retorna True se bem-sucedido."""
    try:
        resp = requests.delete(
            f"{_TICKTICK_API_BASE}{path}",
            headers=_headers(),
            timeout=30,
        )
        time.sleep(_API_DELAY)
        return resp.status_code in (200, 204)
    except Exception as e:
        log.error(f"TickTick DELETE {path} falhou: {e}")
        raise


def _get_projects() -> list[dict]:
    """Retorna a lista de projetos ativos do TickTick, com cache de 5 minutos.

    Busca dinamicamente da API para suportar novos projetos e renomeações
    sem necessidade de alterar código ou variáveis de ambiente.
    """
    global _projects_cache, _projects_cache_at
    now = datetime.now(timezone.utc)
    cache_expired = (
        not _projects_cache
        or _projects_cache_at is None
        or (now - _projects_cache_at) > _PROJECTS_CACHE_TTL
    )
    if cache_expired:
        raw = _api_get("/project")
        # Filtra projetos fechados/arquivados — só mantém os ativos
        _projects_cache = [p for p in (raw or []) if not p.get("closed")] if isinstance(raw, list) else []
        _projects_cache_at = now
    return _projects_cache


def _resolve_project(name: str) -> Optional[dict]:
    """Resolve um nome de projeto (case-insensitive, prefixo) para o objeto {id, name} do TickTick.

    Usa a lista dinâmica da API — suporta qualquer projeto existente no TickTick sem
    precisar de mapeamento hardcoded.

    Retorna None se não encontrar correspondência única.
    """
    norm = name.strip().lower()
    projects = _get_projects()
    # Tenta correspondência exata primeiro
    for p in projects:
        if p.get("name", "").lower() == norm:
            return p
    # Fallback: prefixo (ex.: "fin" → "Finanças")
    matches = [p for p in projects if p.get("name", "").lower().startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _today_iso() -> str:
    """Retorna a data de hoje no formato ISO 8601 do TickTick (YYYY-MM-DDT00:00:00+0000)."""
    return date.today().strftime("%Y-%m-%dT00:00:00+0000")


def _format_task(task: dict, project_name: str = "") -> dict:
    """Converte um task dict bruto da API do TickTick para um formato limpo e legível.

    Resolve o nome do projeto a partir do cache se não for informado explicitamente.
    """
    project_id = task.get("projectId", "")
    # Resolve nome do projeto pelo cache se disponível
    if not project_name and _projects_cache:
        for p in _projects_cache:
            if p.get("id") == project_id:
                project_name = p.get("name", project_id)
                break
    return {
        "id": task.get("id", ""),
        "project_id": project_id,
        "project": project_name or project_id,
        "title": task.get("title", ""),
        "status": "concluída" if task.get("status") == 2 else "ativa",
        "priority": PRIORITY_LABEL.get(task.get("priority", 0), "Nenhuma"),
        "due_date": task.get("dueDate", ""),
        "description": task.get("content", ""),
        "tags": task.get("tags", []),
        "items": [  # checklist items dentro da tarefa
            {
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "status": "concluído" if item.get("status") == 2 else "pendente",
            }
            for item in task.get("items", [])
        ],
    }
