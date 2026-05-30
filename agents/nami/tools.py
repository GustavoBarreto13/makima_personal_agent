#!/usr/bin/env python3
"""
Nami - Tools (ferramentas ADK de acesso ao Notion)

Estas são as "tools" que o nami_agent (agent.py) pode chamar. Quem raciocina e
decide qual tool usar é o LLM do nami_agent — aqui NÃO há chamada ao Gemini.

INDEPENDÊNCIA: este módulo é self-contained. Os IDs de categoria/conta e o
schema do Notion foram copiados (como referência) do batch que vive em
n8n-python-scripts/nami_finance_agent/main.py, mas NÃO importamos nada de lá:
os dois repositórios são independentes. O custo dessa independência é manter
esses IDs em sincronia manualmente se o Notion mudar.

Schema do database 💰 Transações (referência):
- "Name"            (title)
- "Valor"           (number)
- "Tipo"            (select: "Despesa" | "Receita")
- "Data"            (date)
- "Manual/Auto"     (select: "Automatico")
- "Categorias"      (relation -> IDs em CATEGORIES)
- "Contas e Cartões"(relation -> IDs em ACCOUNTS)

Cada tool retorna um dict serializável (status "ok"/"error") e nunca lança
exceção para o agente. As variáveis de ambiente são lidas de forma preguiçosa
(lazy), para que importar este módulo nunca falhe por falta de env var.
"""

import os
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

# ---------- CONFIG ----------

TZ = ZoneInfo("America/Sao_Paulo")
NOTION_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# ID do database de transações (default igual ao do batch; override por env var).
DEFAULT_DB_TRANSACTIONS = "2b4f090e-a3ca-8093-821c-fd0e28a1cdec"

# Categoria/conta padrão quando não dá para identificar.
DEFAULT_CATEGORY = "Inbox"
DEFAULT_ACCOUNT = "Generico"

# Mapas nome -> ID de relation no Notion (copiados como referência do batch).
CATEGORIES: dict[str, str] = {
    "Alimentacao": "2b4f090ea3ca80e7b1b5d7366da8de6c",
    "Comer Fora": "2b4f090ea3ca803ab491e92c916b8e84",
    "Transporte": "2b4f090ea3ca80919aaaf743b9f45561",
    "Moradia": "2b4f090ea3ca80568c53d382321087fd",
    "Saude": "2b4f090ea3ca8091b215e6e0fea0c332",
    "Lazer": "2b4f090ea3ca8083a9dcc81885c174ca",
    "Educacao": "2b4f090ea3ca80e883e6d4388b1c1aa2",
    "Assinaturas": "2b4f090ea3ca8006a703e1489e4dbfb9",
    "Compras": "2b4f090ea3ca8017924cca22154aa804",
    "Cuidados": "2b4f090ea3ca802f9eb3f51b2b8cd0ec",
    "Contas Consumo": "2b4f090ea3ca8099b3f4c03b0195ac65",
    "Viagens": "2b4f090ea3ca80d78d99c6f43c6348ff",
    "Investimento": "2b4f090ea3ca807496ffe72c91342095",
    "Reserva": "2b4f090ea3ca8021acefceec373cf9c7",
    "Metas": "2b4f090ea3ca80bfa99aeb54dde136a5",
    "Emprestimos": "2b4f090ea3ca8086a889da6c5950e84a",
    "Pagamento Divida": "2b4f090ea3ca80c58b54c4a2f197159c",
    "Salario": "2b4f090ea3ca80f5b465c0e542c04788",
    "Outras Receitas": "2b4f090ea3ca80b6aa17c9cf16477152",
    "Transferencias": "2b4f090ea3ca80059bd7c35f8423a0c1",
    "Inbox": "2b4f090ea3ca8079b356f256881f9316",
}

ACCOUNTS: dict[str, str] = {
    "Cartao Nu": "2c9f090ea3ca80b08ed6d781ef001397",
    "Cartao Itau": "2b4f090ea3ca80eea99dd95597e3c55a",
    "Cartao Porto": "2c9f090ea3ca80da90cef02f2e68df7b",
    "Itau": "2b4f090ea3ca802aa5f4ea7ea81bfb32",
    "Mercado Pago": "2dcf090ea3ca8070bac3f6f276adcd9d",
    "Generico": "2def090ea3ca80909abadd12e5e70a61",
}


# ---------- HELPERS INTERNOS ----------

def _token() -> str:
    """Lê o token do Notion do ambiente (lazy)."""
    return os.environ.get("NOTION_TOKEN", "")


def _db_id() -> str:
    """ID do database de transações (env var com fallback no default)."""
    return os.environ.get("NOTION_DB_TRANSACTIONS", DEFAULT_DB_TRANSACTIONS)


def _headers() -> dict:
    """Headers de autenticação da API do Notion."""
    return {
        "Authorization": f"Bearer {_token()}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _norm(s: str) -> str:
    """Normaliza texto para comparação: sem acento, minúsculo, sem espaços nas pontas."""
    nfd = unicodedata.normalize("NFD", s or "")
    sem_acento = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return sem_acento.lower().strip()


# Lookups normalizados nome -> ID (para create/update).
_CAT_BY_NORM = {_norm(nome): cid for nome, cid in CATEGORIES.items()}
_ACC_BY_NORM = {_norm(nome): cid for nome, cid in ACCOUNTS.items()}

# Lookups reversos ID -> nome (para apresentar a query de forma legível).
# Os IDs dos dicts vêm sem hífen; a API do Notion devolve relations com hífen
# (UUID). Por isso normalizamos removendo hífens dos dois lados.
_CAT_BY_ID = {cid.replace("-", ""): nome for nome, cid in CATEGORIES.items()}
_ACC_BY_ID = {cid.replace("-", ""): nome for nome, cid in ACCOUNTS.items()}


def _map_category(nome: str) -> str:
    """Nome de categoria -> ID de relation (default: Inbox)."""
    return _CAT_BY_NORM.get(_norm(nome), CATEGORIES[DEFAULT_CATEGORY])


def _map_account(nome: str) -> str:
    """Nome de conta -> ID de relation (default: Generico)."""
    return _ACC_BY_NORM.get(_norm(nome), ACCOUNTS[DEFAULT_ACCOUNT])


def _cat_name(rel_id: str) -> str:
    """ID de relation de categoria -> nome legível."""
    return _CAT_BY_ID.get((rel_id or "").replace("-", ""), "Desconhecida")


def _acc_name(rel_id: str) -> str:
    """ID de relation de conta -> nome legível."""
    return _ACC_BY_ID.get((rel_id or "").replace("-", ""), "Desconhecida")


def _today() -> str:
    """Data de hoje (America/Sao_Paulo) em YYYY-MM-DD."""
    return datetime.now(TZ).strftime("%Y-%m-%d")


def _first_day_of_month() -> str:
    """Primeiro dia do mês atual em YYYY-MM-DD."""
    return datetime.now(TZ).strftime("%Y-%m-01")


def _norm_tipo(tipo: str) -> str:
    """Normaliza o tipo para os valores aceitos pelo select do Notion."""
    return "Receita" if _norm(tipo).startswith("receita") else "Despesa"


def _parse_transaction(page: dict) -> dict:
    """Converte uma página crua do Notion num dict limpo (acesso defensivo)."""
    props = page.get("properties", {})

    titulo = props.get("Name", {}).get("title", [])
    name = titulo[0].get("plain_text", "") if titulo else ""

    tipo_sel = props.get("Tipo", {}).get("select") or {}
    data_obj = props.get("Data", {}).get("date") or {}
    cat_rel = props.get("Categorias", {}).get("relation") or []
    acc_rel = props.get("Contas e Cartões", {}).get("relation") or []

    return {
        "page_id": page.get("id"),
        "name": name,
        "valor": props.get("Valor", {}).get("number"),
        "tipo": tipo_sel.get("name"),
        "data": data_obj.get("start"),
        "categoria": _cat_name(cat_rel[0]["id"]) if cat_rel else None,
        "conta": _acc_name(acc_rel[0]["id"]) if acc_rel else None,
    }


# ---------- TOOLS (expostas ao agente) ----------

def create_transaction(
    name: str,
    valor: float,
    tipo: str,
    categoria: str,
    conta: str = "Generico",
    data: str = "",
) -> dict:
    """Registra uma nova transação financeira no Notion.

    Use quando o usuário relatar um gasto ou receita (ex.: "gastei 89 no Rappi
    no Cartão Nu", "recebi 5000 de salário").

    Args:
        name: Descrição curta da transação (ex.: "Rappi", "Salário").
        valor: Valor numérico positivo (ex.: 89.90).
        tipo: "Despesa" ou "Receita".
        categoria: Nome da categoria. Válidas: Alimentacao, Comer Fora, Transporte,
            Moradia, Saude, Lazer, Educacao, Assinaturas, Compras, Cuidados,
            Contas Consumo, Viagens, Investimento, Reserva, Metas, Emprestimos,
            Pagamento Divida, Salario, Outras Receitas, Transferencias, Inbox.
            Em dúvida, use "Inbox".
        conta: Nome da conta/cartão. Válidas: Cartao Nu, Cartao Itau, Cartao Porto,
            Itau, Mercado Pago, Generico. Sem menção, use "Generico".
        data: Data YYYY-MM-DD. Vazio = hoje.

    Returns:
        dict com status "ok" e o page_id criado (guarde-o para correções),
        ou status "error".
    """
    if not _token():
        return {"status": "error", "message": "NOTION_TOKEN não configurado."}

    payload = {
        "parent": {"database_id": _db_id()},
        "properties": {
            "Name": {"title": [{"text": {"content": name}}]},
            "Valor": {"number": valor},
            "Tipo": {"select": {"name": _norm_tipo(tipo)}},
            "Data": {"date": {"start": data.strip() or _today()}},
            "Manual/Auto": {"select": {"name": "Automatico"}},
            "Categorias": {"relation": [{"id": _map_category(categoria)}]},
            "Contas e Cartões": {"relation": [{"id": _map_account(conta)}]},
        },
    }

    try:
        resp = requests.post(
            f"{NOTION_BASE}/pages", headers=_headers(), json=payload, timeout=30
        )
        resp.raise_for_status()
        page = resp.json()
        return {
            "status": "ok",
            "page_id": page.get("id"),
            "transaction": {
                "name": name,
                "valor": valor,
                "tipo": _norm_tipo(tipo),
                "data": payload["properties"]["Data"]["date"]["start"],
                "categoria": categoria,
                "conta": conta,
            },
        }
    except requests.RequestException as e:
        return {"status": "error", "message": f"Falha ao criar no Notion: {e}"}


def query_expenses(start_date: str = "", end_date: str = "") -> dict:
    """Consulta transações no Notion em um intervalo de datas (inclusive).

    Use para perguntas como "quanto gastei essa semana?" ou "transações de maio".
    Sem intervalo, usa do primeiro dia do mês atual até hoje.

    Args:
        start_date: Data inicial YYYY-MM-DD. Vazio = primeiro dia do mês atual.
        end_date: Data final YYYY-MM-DD. Vazio = hoje.

    Returns:
        dict com status "ok", lista de transações (limpa), contagem e total
        somado dos valores; ou status "error".
    """
    if not _token():
        return {"status": "error", "message": "NOTION_TOKEN não configurado."}

    start = start_date.strip() or _first_day_of_month()
    end = end_date.strip() or _today()

    body = {
        "filter": {
            "and": [
                {"property": "Data", "date": {"on_or_after": start}},
                {"property": "Data", "date": {"on_or_before": end}},
            ]
        },
        "sorts": [{"property": "Data", "direction": "descending"}],
    }

    try:
        resp = requests.post(
            f"{NOTION_BASE}/databases/{_db_id()}/query",
            headers=_headers(),
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
    except requests.RequestException as e:
        return {"status": "error", "message": f"Falha ao consultar o Notion: {e}"}

    transactions = [_parse_transaction(p) for p in results]
    total = sum(t["valor"] for t in transactions if t["valor"] is not None)
    return {
        "status": "ok",
        "start_date": start,
        "end_date": end,
        "count": len(transactions),
        "total": total,
        "transactions": transactions,
    }


def update_transaction(
    page_id: str,
    name: str = "",
    valor: float = None,
    tipo: str = "",
    categoria: str = "",
    conta: str = "",
    data: str = "",
) -> dict:
    """Atualiza uma transação existente no Notion.

    Use para corrigir uma transação recém-criada (ex.: "na verdade era 45").
    Informe apenas os campos que mudam; o page_id é o retornado por
    create_transaction.

    Args:
        page_id: ID da página (transação) no Notion.
        name: Nova descrição. Vazio = não altera.
        valor: Novo valor. None = não altera.
        tipo: "Despesa"/"Receita". Vazio = não altera.
        categoria: Novo nome de categoria. Vazio = não altera.
        conta: Novo nome de conta. Vazio = não altera.
        data: Nova data YYYY-MM-DD. Vazio = não altera.

    Returns:
        dict com status "ok" e os campos alterados, ou status "error".
    """
    if not _token():
        return {"status": "error", "message": "NOTION_TOKEN não configurado."}

    # Monta apenas as propriedades informadas (patch parcial).
    properties: dict = {}
    if name.strip():
        properties["Name"] = {"title": [{"text": {"content": name}}]}
    if valor is not None:
        properties["Valor"] = {"number": valor}
    if tipo.strip():
        properties["Tipo"] = {"select": {"name": _norm_tipo(tipo)}}
    if data.strip():
        properties["Data"] = {"date": {"start": data}}
    if categoria.strip():
        properties["Categorias"] = {"relation": [{"id": _map_category(categoria)}]}
    if conta.strip():
        properties["Contas e Cartões"] = {"relation": [{"id": _map_account(conta)}]}

    if not properties:
        return {"status": "error", "message": "Nenhum campo para atualizar."}

    try:
        resp = requests.patch(
            f"{NOTION_BASE}/pages/{page_id}",
            headers=_headers(),
            json={"properties": properties},
            timeout=30,
        )
        resp.raise_for_status()
        return {"status": "ok", "page_id": page_id, "updated": list(properties.keys())}
    except requests.RequestException as e:
        return {"status": "error", "message": f"Falha ao atualizar no Notion: {e}"}


def delete_transaction(page_id: str) -> dict:
    """Apaga (arquiva) uma transação no Notion.

    No Notion não há delete definitivo via API — a página é arquivada
    (archived=True), removendo-a das visualizações normais.

    Args:
        page_id: ID da página (transação) a arquivar.

    Returns:
        dict com status "ok", ou status "error".
    """
    if not _token():
        return {"status": "error", "message": "NOTION_TOKEN não configurado."}

    try:
        resp = requests.patch(
            f"{NOTION_BASE}/pages/{page_id}",
            headers=_headers(),
            json={"archived": True},
            timeout=30,
        )
        resp.raise_for_status()
        return {"status": "ok", "page_id": page_id, "archived": True}
    except requests.RequestException as e:
        return {"status": "error", "message": f"Falha ao arquivar no Notion: {e}"}
