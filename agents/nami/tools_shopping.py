"""Ferramentas de Lista de Compras da Nami (spec 045).

Múltiplas listas nomeadas (ativa/arquivada), itens com quantidade/unidade/preço
estimado opcionais e checkbox de carrinho, itens frequentes derivados do histórico
de listas arquivadas, e "finalizar compra" — que lança a despesa (categoria
Supermercado) e arquiva a lista numa única operação atômica.

As tools aceitam tanto `list_id` (uso direto do webapp, que já tem o ID carregado)
quanto `list_name` (uso natural pelo Telegram — resolvido por prefixo, mesmo padrão
de `_resolve_account`/`_resolve_credit_card` em agents/nami/tools.py). Quando nenhum
dos dois é informado, resolve a lista ativa padrão ("Mercado", ou a única ativa).

Usage:
    As ferramentas deste módulo são registradas automaticamente no nami_agent
    e chamadas pelo modelo de IA conforme necessário. Não é necessário chamá-las
    diretamente.
"""

import re
import uuid

from agents.db import run_select, run_dml, get_conn
from agents.nami.tools import _norm, create_transaction_on_cursor


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS INTERNOS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_item_text(text: str) -> tuple[str, str]:
    """Separa nome e quantidade de um texto livre de item.

    Extrai um token final que começa com dígito (ex.: "2kg", "3", "1,5 kg")
    como quantidade; o que não casar vira parte do nome inteiro — sem validação
    rígida, conforme o edge case da spec 045.

    Args:
        text: Texto do item como digitado pelo usuário (ex.: "feijão 2kg").

    Returns:
        Tupla (nome, quantidade) — quantidade é "" se não houver token numérico.

    Example:
        >>> _parse_item_text("feijão 2kg")
        ('feijão', '2kg')
        >>> _parse_item_text("arroz")
        ('arroz', '')
    """
    text = text.strip()
    # Casa um nome (não-guloso) seguido de um token final que começa com dígito
    match = re.match(r"^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?\s*[a-zA-Zçãõáéíóúâê%]*)$", text)
    if match:
        return match.group("name").strip(), match.group("qty").strip()
    return text, ""


def _get_active_lists() -> list[dict]:
    """Retorna todas as listas com status='ativa', ordenadas pela mais antiga primeiro."""
    return run_select(
        "SELECT id, name, status, transaction_id FROM shopping_lists"
        " WHERE status = 'ativa' ORDER BY created_at",
    )


def _resolve_active_list(list_id: str = "", list_name: str = "") -> tuple[dict | None, str | None]:
    """Resolve uma lista ativa por id, por nome (prefixo) ou pelo padrão implícito.

    Args:
        list_id: ID exato da lista (tem precedência sobre list_name).
        list_name: Nome ou prefixo da lista (resolução case/acento-insensitive).

    Returns:
        Tupla (lista, erro). Quando nem id nem name são informados e não há
        nenhuma lista ativa ainda, retorna (None, None) — sinaliza ao chamador
        que pode criar a lista padrão "Mercado" sob demanda (FR-001).
    """
    if list_id:
        rows = run_select(
            "SELECT id, name, status, transaction_id FROM shopping_lists WHERE id = %(id)s",
            {"id": list_id},
        )
        if not rows:
            return None, f"Lista não encontrada: {list_id}"
        return rows[0], None

    lists = _get_active_lists()

    if list_name:
        norm = _norm(list_name)
        matches = [l for l in lists if _norm(l["name"]) == norm or _norm(l["name"]).startswith(norm)]
        if not matches:
            return None, f"Nenhuma lista ativa encontrada para '{list_name}'."
        if len(matches) > 1:
            names = ", ".join(l["name"] for l in matches)
            return None, f"Mais de uma lista bate com '{list_name}': {names}. Seja mais específico."
        return matches[0], None

    # Nenhum id/nome informado — resolve o padrão implícito.
    if not lists:
        return None, None  # Sinaliza "sem lista ainda" — chamador decide se cria a padrão.
    default = next((l for l in lists if _norm(l["name"]) == "mercado"), None)
    if default:
        return default, None
    if len(lists) == 1:
        return lists[0], None
    names = ", ".join(l["name"] for l in lists)
    return None, f"Você tem múltiplas listas ativas ({names}). Diga qual usar."


def _get_or_create_active_list(list_id: str = "", list_name: str = "") -> tuple[dict | None, str | None]:
    """Como `_resolve_active_list`, mas cria a lista padrão "Mercado" se nenhuma existir.

    Usado por `add_shopping_items` — o primeiro item adicionado cria a lista
    automaticamente (FR-001, Acceptance Scenario 3 da US1).
    """
    lst, err = _resolve_active_list(list_id, list_name)
    if lst or err:
        return lst, err
    name = list_name or "Mercado"
    new_id = str(uuid.uuid4())
    run_dml(
        "INSERT INTO shopping_lists (id, name, status, created_at, updated_at)"
        " VALUES (%(id)s, %(name)s, 'ativa', NOW(), NOW())",
        {"id": new_id, "name": name},
    )
    return {"id": new_id, "name": name, "status": "ativa", "transaction_id": None}, None


# ─────────────────────────────────────────────────────────────────────────────
# FERRAMENTAS PÚBLICAS — chamadas pelo agente Nami via ADK
# ─────────────────────────────────────────────────────────────────────────────

def create_shopping_list(name: str) -> dict:
    """Cria uma nova lista de compras nomeada (ex.: "Farmácia", "Petshop").

    Args:
        name: Nome da lista.

    Returns:
        {"status": "ok", "id": ...} ou {"status": "error", "message": ...}.
    """
    if not name.strip():
        return {"status": "error", "message": "Informe um nome para a lista"}
    new_id = str(uuid.uuid4())
    run_dml(
        "INSERT INTO shopping_lists (id, name, status, created_at, updated_at)"
        " VALUES (%(id)s, %(name)s, 'ativa', NOW(), NOW())",
        {"id": new_id, "name": name.strip()},
    )
    return {"status": "ok", "id": new_id, "message": f"Lista '{name.strip()}' criada"}


def list_shopping_lists(status: str = "ativa") -> dict:
    """Lista as listas de compras cadastradas.

    Args:
        status: "ativa", "arquivada" ou "todas".

    Returns:
        {"status": "ok", "lists": [...]}.
    """
    if status == "todas":
        rows = run_select(
            "SELECT id, name, status, transaction_id, created_at::text AS created_at"
            " FROM shopping_lists ORDER BY created_at DESC",
        )
    else:
        st = "arquivada" if status == "arquivada" else "ativa"
        rows = run_select(
            "SELECT id, name, status, transaction_id, created_at::text AS created_at"
            " FROM shopping_lists WHERE status = %(status)s ORDER BY created_at DESC",
            {"status": st},
        )
    return {"status": "ok", "lists": rows}


def add_shopping_items(items: str, list_id: str = "", list_name: str = "") -> dict:
    """Adiciona um ou mais itens a uma lista de compras — vários de uma vez.

    Aceita frases com múltiplos itens separados por vírgula (ex.: "arroz,
    feijão 2kg, leite"). Se nenhuma lista ativa existir ainda, cria a lista
    padrão "Mercado" automaticamente (FR-001). Itens já presentes (não
    marcados) na lista não são duplicados.

    Args:
        items: Texto com um ou mais itens separados por vírgula.
        list_id: ID da lista (uso do webapp; tem precedência sobre list_name).
        list_name: Nome/prefixo da lista (uso do Telegram).

    Returns:
        {"status": "ok", "list_id": ..., "list_name": ..., "items": [...], "message": ...}
        ou {"status": "error", "message": ...}.
    """
    if not items.strip():
        return {"status": "error", "message": "Informe ao menos um item"}

    lst, err = _get_or_create_active_list(list_id, list_name)
    if err:
        return {"status": "error", "message": err}

    existing = run_select(
        "SELECT name FROM shopping_list_items WHERE list_id = %(lid)s AND checked = FALSE",
        {"lid": lst["id"]},
    )
    existing_norm = {_norm(r["name"]) for r in existing}

    max_row = run_select(
        "SELECT COALESCE(MAX(ordem), 0) AS max_ordem FROM shopping_list_items WHERE list_id = %(lid)s",
        {"lid": lst["id"]},
    )
    next_ordem = int(max_row[0]["max_ordem"]) + 1 if max_row else 1

    created: list[dict] = []
    skipped: list[str] = []
    for raw in items.split(","):
        raw = raw.strip()
        if not raw:
            continue
        name, qty = _parse_item_text(raw)
        if _norm(name) in existing_norm:
            skipped.append(name)
            continue
        item_id = str(uuid.uuid4())
        run_dml(
            "INSERT INTO shopping_list_items (id, list_id, name, quantidade, ordem, created_at, updated_at)"
            " VALUES (%(id)s, %(list_id)s, %(name)s, %(qty)s, %(ordem)s, NOW(), NOW())",
            {"id": item_id, "list_id": lst["id"], "name": name, "qty": qty or None, "ordem": next_ordem},
        )
        created.append({"id": item_id, "name": name, "quantidade": qty})
        existing_norm.add(_norm(name))
        next_ordem += 1

    msg = f"{len(created)} item(ns) adicionado(s) à lista {lst['name']}"
    if skipped:
        msg += f" ({len(skipped)} já estavam na lista: {', '.join(skipped)})"
    return {
        "status": "ok", "list_id": lst["id"], "list_name": lst["name"],
        "items": created, "message": msg,
    }


def show_shopping_list(list_id: str = "", list_name: str = "") -> dict:
    """Mostra os itens de uma lista de compras (padrão: a lista ativa implícita).

    Args:
        list_id: ID da lista (uso do webapp).
        list_name: Nome/prefixo da lista (uso do Telegram).

    Returns:
        {"status": "ok", "list": ..., "items": [...], "pendentes_count": ...,
        "checked_count": ..., "total_estimado": ...} ou {"status": "error", ...}.
    """
    lst, err = _resolve_active_list(list_id, list_name)
    if err:
        return {"status": "error", "message": err}
    if not lst:
        return {"status": "error", "message": "Nenhuma lista ativa ainda. Adicione um item para criar a lista 'Mercado'."}

    items = run_select(
        "SELECT id, name, quantidade, unidade, preco_estimado, checked, ordem"
        " FROM shopping_list_items WHERE list_id = %(lid)s ORDER BY ordem",
        {"lid": lst["id"]},
    )
    pendentes = [i for i in items if not i["checked"]]
    total_estimado = sum(
        i["preco_estimado"] for i in items if i["checked"] and i.get("preco_estimado") is not None
    )
    return {
        "status": "ok", "list": lst, "items": items,
        "pendentes_count": len(pendentes),
        "checked_count": len(items) - len(pendentes),
        "total_estimado": round(total_estimado, 2),
    }


def check_shopping_item(item_id: str, checked: bool = True) -> dict:
    """Marca ou desmarca um item no carrinho.

    Args:
        item_id: ID do item.
        checked: True para marcar (no carrinho), False para desmarcar.

    Returns:
        {"status": "ok", "message": ...} ou {"status": "error", "message": ...}.
    """
    rows = run_select("SELECT id FROM shopping_list_items WHERE id = %(id)s", {"id": item_id})
    if not rows:
        return {"status": "error", "message": f"Item não encontrado: {item_id}"}
    run_dml(
        "UPDATE shopping_list_items SET checked = %(checked)s, updated_at = NOW() WHERE id = %(id)s",
        {"checked": checked, "id": item_id},
    )
    return {"status": "ok", "message": "Item marcado" if checked else "Item desmarcado"}


def update_shopping_item(
    item_id: str,
    name: str = "",
    quantidade: str = "",
    unidade: str = "",
    preco_estimado: float | None = None,
) -> dict:
    """Edita nome, quantidade, unidade ou preço estimado de um item.

    Só altera os campos fornecidos.

    Args:
        item_id: ID do item.
        name: Novo nome (opcional).
        quantidade: Nova quantidade (opcional).
        unidade: Nova unidade (opcional).
        preco_estimado: Novo preço estimado (opcional).

    Returns:
        {"status": "ok", "message": ...} ou {"status": "error", "message": ...}.
    """
    rows = run_select("SELECT id FROM shopping_list_items WHERE id = %(id)s", {"id": item_id})
    if not rows:
        return {"status": "error", "message": f"Item não encontrado: {item_id}"}

    sets = []
    params: dict = {"id": item_id}
    if name:
        sets.append("name = %(name)s")
        params["name"] = name
    if quantidade:
        sets.append("quantidade = %(quantidade)s")
        params["quantidade"] = quantidade
    if unidade:
        sets.append("unidade = %(unidade)s")
        params["unidade"] = unidade
    if preco_estimado is not None:
        sets.append("preco_estimado = %(preco_estimado)s")
        params["preco_estimado"] = preco_estimado

    if not sets:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    sets.append("updated_at = NOW()")
    run_dml(f"UPDATE shopping_list_items SET {', '.join(sets)} WHERE id = %(id)s", params)
    return {"status": "ok", "message": "Item atualizado"}


def remove_shopping_item(item_id: str) -> dict:
    """Remove um item da lista (exclusão real — itens de lista ativa não têm valor de histórico).

    Args:
        item_id: ID do item.

    Returns:
        {"status": "ok", "message": ...} ou {"status": "error", "message": ...}.
    """
    rows = run_select("SELECT id FROM shopping_list_items WHERE id = %(id)s", {"id": item_id})
    if not rows:
        return {"status": "error", "message": f"Item não encontrado: {item_id}"}
    run_dml("DELETE FROM shopping_list_items WHERE id = %(id)s", {"id": item_id})
    return {"status": "ok", "message": "Item removido"}


def get_frequent_items(limit: int = 10) -> dict:
    """Retorna os itens mais recorrentes nas listas já arquivadas (histórico).

    Agrupa por nome normalizado (minúsculas) — não distingue "Arroz" de "arroz".

    Args:
        limit: Quantidade máxima de itens a retornar.

    Returns:
        {"status": "ok", "items": [{"name": ..., "count": ...}, ...]}.
    """
    rows = run_select(
        """
        SELECT MIN(sli.name) AS name, COUNT(*) AS count
          FROM shopping_list_items sli
          JOIN shopping_lists sl ON sl.id = sli.list_id
         WHERE sl.status = 'arquivada'
         GROUP BY LOWER(sli.name)
         ORDER BY count DESC, name
         LIMIT %(limit)s
        """,
        {"limit": limit},
    )
    return {"status": "ok", "items": [{"name": r["name"], "count": int(r["count"])} for r in rows]}


def finish_shopping(
    valor_total: float,
    conta: str = "",
    card_id: str = "",
    list_id: str = "",
    list_name: str = "",
) -> dict:
    """Finaliza a compra: lança a despesa (categoria Supermercado) e arquiva a lista — atômico.

    Cria a despesa com o valor total real informado, vincula `transaction_id` na
    lista arquivada e abre uma nova lista ativa com o mesmo nome, herdando os
    itens que não tinham sido marcados (continuam pendentes na próxima ida ao
    mercado). Tudo numa única transação via `get_conn()` — ou os dois lados
    (despesa + arquivamento) são gravados, ou nenhum (FR-005/SC-002).

    Args:
        valor_total: Valor total real gasto na compra.
        conta: Conta de pagamento (vazio = resolução automática, mesmo padrão de create_transaction).
        card_id: Cartão de pagamento (opcional; mutuamente exclusivo com conta).
        list_id: ID da lista a finalizar (uso do webapp).
        list_name: Nome/prefixo da lista a finalizar (uso do Telegram).

    Returns:
        {"status": "ok", "transaction_id": ..., "new_list_id": ..., "message": ...}
        ou {"status": "error", "message": ...}.
    """
    if valor_total <= 0:
        return {"status": "error", "message": "Valor total deve ser positivo"}

    lst, err = _resolve_active_list(list_id, list_name)
    if err:
        return {"status": "error", "message": err}
    if not lst:
        return {"status": "error", "message": "Nenhuma lista ativa para finalizar"}

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                tx = create_transaction_on_cursor(
                    cur,
                    name=f"Compra — {lst['name']}",
                    valor=float(valor_total),
                    tipo="Despesa",
                    categoria="Supermercado",
                    conta=conta,
                    card_id=card_id,
                    source="webapp",
                )
                if tx.get("status") != "ok":
                    raise ValueError(tx.get("message", "Erro ao lançar despesa"))

                cur.execute(
                    "UPDATE shopping_lists SET status = 'arquivada', transaction_id = %(tx_id)s,"
                    " updated_at = NOW() WHERE id = %(id)s",
                    {"tx_id": tx["id"], "id": lst["id"]},
                )

                # Abre a próxima lista ativa com o mesmo nome, herdando itens não marcados
                # (decisão de escopo do plan.md — evita um segundo diálogo de "mover ou arquivar").
                new_list_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO shopping_lists (id, name, status, created_at, updated_at)"
                    " VALUES (%(id)s, %(name)s, 'ativa', NOW(), NOW())",
                    {"id": new_list_id, "name": lst["name"]},
                )
                cur.execute(
                    "UPDATE shopping_list_items SET list_id = %(new_id)s, updated_at = NOW()"
                    " WHERE list_id = %(old_id)s AND checked = FALSE",
                    {"new_id": new_list_id, "old_id": lst["id"]},
                )
        return {
            "status": "ok", "transaction_id": tx["id"], "new_list_id": new_list_id,
            "message": f"Compra de R${valor_total:.2f} finalizada — lista '{lst['name']}' arquivada",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
