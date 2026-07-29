"""Ferramentas do agente Nami para gerenciamento de finanças pessoais.

Todas as operações financeiras — criar, editar, deletar e consultar
transações e assinaturas — são feitas aqui e armazenadas no PostgreSQL.

Usage:
    As ferramentas deste módulo são registradas automaticamente no
    nami_agent e chamadas pelo modelo de IA conforme necessário.
    Não é necessário chamá-las diretamente.
"""

import uuid     # Para gerar IDs únicos para cada transação/assinatura
from datetime import date, datetime  # Para obter a data de hoje no fuso local
from zoneinfo import ZoneInfo      # Para trabalhar com fuso horário (horário de Brasília)

# Importa os helpers PostgreSQL compartilhados — substituem o BigQuery _run_select/_run_dml.
# get_conn permite transações que compartilham cursor (ex.: pagamento atômico da Kaguya:
# completar a tarefa + lançar a despesa numa única transação).
from agents.db import run_select, run_dml, get_conn

# Fuso horário de São Paulo / Brasília — usado para garantir que as datas
# registradas sejam no horário brasileiro, não no UTC do servidor
_TZ = ZoneInfo("America/Sao_Paulo")

# Lista de categorias válidas para classificar uma transação.
# Qualquer valor fora dessa lista será rejeitado para manter consistência nos dados.
CATEGORIES = [
    "Alimentacao", "Comer Fora", "Saude", "Lazer", "Transporte",
    "Moradia", "Roupas", "Educacao", "Assinaturas", "Viagem",
    "Presente", "Beleza", "Academia", "Farmacia", "Supermercado",
    "Eletronicos", "Pet", "Investimento", "Receita", "Inbox",
]

# Lista hardcoded mantida apenas para compatibilidade com testes legados.
# A fonte canônica de contas agora é a tabela `accounts` no PostgreSQL.
ACCOUNTS = ["Cartao Nu", "Cartao Itau", "Itau", "Mercado Pago", "Generico", "Dinheiro"]

# Cache das contas carregadas da tabela `accounts` no PostgreSQL.
# None = não carregado ainda; lista vazia = nenhuma conta cadastrada.
_accounts_cache: list[dict] | None = None


def _load_accounts() -> list[dict]:
    """Carrega contas ativas do PostgreSQL e armazena em cache para evitar queries repetidas."""
    global _accounts_cache
    if _accounts_cache is None:
        try:
            # Busca contas ativas — usa run_select do módulo agents.db (PostgreSQL)
            rows = run_select(
                "SELECT id, name FROM accounts WHERE status = 'ativo'",
            )
            _accounts_cache = rows
        except Exception:
            # Se a tabela ainda não existir (ex.: ambiente de testes sem banco),
            # retorna lista vazia em vez de lançar exceção
            _accounts_cache = []
    return _accounts_cache


def _invalidate_accounts_cache() -> None:
    """Invalida o cache de contas para forçar recarga na próxima chamada."""
    global _accounts_cache
    _accounts_cache = None


# Cache de cartões ativos — mesmo padrão do cache de contas.
# None = ainda não carregado; lista = já carregado (pode ser vazia).
_cards_cache: list[dict] | None = None


def _load_cards() -> list[dict]:
    """Carrega cartões ativos do PostgreSQL e armazena em cache para evitar queries repetidas."""
    global _cards_cache
    if _cards_cache is None:
        try:
            # Busca cartões ativos — usa run_select do módulo agents.db (PostgreSQL)
            rows = run_select(
                "SELECT id, name FROM credit_cards WHERE status = 'ativo'",
            )
            _cards_cache = rows
        except Exception:
            # Se a tabela ainda não existir, retorna lista vazia
            _cards_cache = []
    return _cards_cache


def _invalidate_cards_cache() -> None:
    """Invalida o cache de cartões para forçar recarga na próxima chamada."""
    global _cards_cache
    _cards_cache = None


def _resolve_credit_card(name: str) -> dict | None:
    """Resolve nome de cartão para {id, name} consultando credit_cards.

    Aceita correspondência exata ou por prefixo (case-insensitive, sem acentos).
    Retorna None se não encontrar ou se houver ambiguidade (mais de 1 match).

    Args:
        name: Nome ou prefixo do cartão digitado pelo usuário.

    Returns:
        Dicionário {"id": ..., "name": ...} ou None.
    """
    norm = _norm(name)
    cards = _load_cards()
    matches = [c for c in cards if _norm(c["name"]) == norm or _norm(c["name"]).startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _resolve_account(name: str) -> dict | None:
    """Resolve nome de conta para {id, name} consultando a tabela accounts.

    Aceita correspondência exata ou por prefixo (case-insensitive, sem acentos).
    Retorna None se não encontrar ou se houver ambiguidade (mais de 1 match).

    Args:
        name: Nome ou prefixo da conta digitado pelo usuário.

    Returns:
        Dicionário {"id": ..., "name": ...} ou None.
    """
    norm = _norm(name)
    accounts = _load_accounts()
    matches = [a for a in accounts if _norm(a["name"]) == norm or _norm(a["name"]).startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _norm(s: str) -> str:
    """Normaliza uma string removendo acentos e convertendo para minúsculas.

    Usado para comparações flexíveis: "Alimentação" e "alimentacao" devem
    ser tratados como o mesmo valor ao buscar uma categoria ou conta.
    """
    import unicodedata

    # NFD decompõe os caracteres acentuados (ex.: "ã" → "a" + til combinante)
    # encode("ascii", "ignore") descarta os acentos (caracteres não-ASCII)
    # decode() converte de volta para string Python
    # lower() transforma em minúsculas para comparação case-insensitive
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def _today_date() -> date:
    """Retorna a data de hoje no fuso de São Paulo (UTC-3).

    date.today() retornaria a data do servidor (UTC no container), que após
    as 21h locais já aponta para o dia seguinte — regra mandatória do projeto.
    """
    return datetime.now(_TZ).date()


def _today() -> str:
    """Retorna a data de hoje no formato 'AAAA-MM-DD' (padrão aceito pelo PostgreSQL)."""
    return _today_date().strftime("%Y-%m-%d")


def _month_start() -> str:
    """Retorna o primeiro dia do mês atual no formato 'AAAA-MM-DD'.

    Usado como data de início padrão em consultas mensais.
    """
    # replace(day=1) troca apenas o dia para 1, mantendo mês e ano atuais
    return _today_date().replace(day=1).strftime("%Y-%m-%d")


def _match_category(name: str) -> str | None:
    """Tenta encontrar uma categoria válida a partir de um texto digitado pelo usuário.

    Aceita correspondência exata ou prefixo (ex.: "alim" encontra "Alimentacao").
    Retorna None se não encontrar nenhuma correspondência única — assim o sistema
    pode pedir ao usuário que seja mais específico em vez de assumir errado.
    """
    # Normaliza o texto digitado para comparação sem acentos e em minúsculas
    norm = _norm(name)

    # Filtra as categorias que são iguais ao texto OU começam com ele
    matches = [c for c in CATEGORIES if _norm(c) == norm or _norm(c).startswith(norm)]

    # Só retorna se houver exatamente 1 correspondência — evita ambiguidade
    return matches[0] if len(matches) == 1 else None


def _match_account(name: str) -> str | None:
    """Alias de compatibilidade — usa _resolve_account internamente.

    Retorna o nome canônico da conta (string) ou None se não encontrar.
    Prefira _resolve_account quando precisar do account_id.
    """
    result = _resolve_account(name)
    return result["name"] if result else None


# ─────────────────────────────────────────────────────────────────────────────
# FERRAMENTAS PÚBLICAS — chamadas pelo agente Nami via ADK
# ─────────────────────────────────────────────────────────────────────────────

def create_transaction_on_cursor(
    cur,
    name: str,
    valor: float,
    tipo: str,
    categoria: str = "Inbox",
    conta: str = "",
    data: str = "",
    notes: str = "",
    subscription_id: str = "",
    card_id: str = "",
    source: str = "telegram",
    person_ids: list[str] | None = None,
) -> dict:
    """Insere uma transação usando um cursor já aberto (sem abrir conexão própria).

    Mesma validação e SQL de ``create_transaction``, mas operando no ``cur`` recebido.
    Permite que a Kaguya lance a despesa **na mesma transação** em que completa a tarefa
    de pagamento (atomicidade tudo-ou-nada — FR-014). NÃO faz commit: quem chama controla.

    Aceita ``person_ids`` opcional: lista de UUIDs de pessoas (spec 014). Quando fornecida,
    grava os vínculos em ``person_links`` no mesmo cursor — tudo-ou-nada.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        name: Descrição da transação.
        valor: Valor em reais.
        tipo: "Despesa" ou "Receita".
        categoria: Categoria (deve casar com CATEGORIES).
        conta: Conta/meio de pagamento (resolvido por nome).
        data: Data AAAA-MM-DD (padrão: hoje).
        notes: Observações.
        subscription_id: Assinatura vinculada (opcional).
        card_id: Cartão de crédito (opcional; quando dado, account_id fica NULL).
        source: Origem do registro (ex.: "telegram", "kaguya").
        person_ids: Lista de UUIDs de pessoas a vincular à transação (opcional).

    Returns:
        ``{"status": "ok", "id": <uuid>}`` ou ``{"status": "error", "message": ...}``.
        Em caso de erro, o chamador deve abortar a transação (não commitar).
    """
    # Valida a categoria contra a lista canônica.
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'. Opções: {', '.join(CATEGORIES)}"}

    # Resolve conta vs. cartão (mutuamente exclusivos).
    if card_id:
        acc = conta
        acc_id = None
    else:
        acc_obj = _resolve_account(conta or "Generico")
        if acc_obj is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'. Use list_accounts() para ver as contas disponíveis."}
        acc = acc_obj["name"]
        acc_id = acc_obj["id"]

    if tipo not in ("Despesa", "Receita"):
        return {"status": "error", "message": "tipo deve ser 'Despesa' ou 'Receita'"}

    tx_id = str(uuid.uuid4())
    tx_date = data or _today()
    sql = """
        INSERT INTO transactions (id, name, valor, tipo, categoria, conta, account_id, card_id, data, source, notes, subscription_id, created_at, deleted)
        VALUES (%(id)s, %(name)s, %(valor)s, %(tipo)s, %(categoria)s, %(conta)s, %(account_id)s, %(card_id)s, %(data)s, %(source)s, %(notes)s, %(subscription_id)s, NOW(), FALSE)
    """
    params = {
        "id": tx_id, "name": name, "valor": float(valor), "tipo": tipo,
        "categoria": cat, "conta": acc, "account_id": acc_id, "card_id": card_id or None,
        "data": tx_date, "source": source, "notes": notes or None,
        "subscription_id": subscription_id or None,
    }
    # Executa no cursor recebido — quem chama decide commit/rollback.
    cur.execute(sql, params)

    # Grava vínculos de pessoas na mesma transação — tudo-ou-nada (spec 014 / FR-009).
    # Import lazy para evitar ciclo agents.nami → agents.komi → agents.nami.
    if person_ids:
        from agents.komi.tools import link_person_on_cursor  # noqa: PLC0415
        for pid in person_ids:
            link_person_on_cursor(cur, pid, "transaction", tx_id)

    return {"status": "ok", "id": tx_id, "message": f"Transação criada: {name} R${float(valor):.2f} ({cat})"}


def create_transaction(
    name: str,
    valor: float,
    tipo: str,
    categoria: str = "Inbox",
    conta: str = "",
    data: str = "",
    notes: str = "",
    subscription_id: str = "",
    card_id: str = "",
    person_ids: list[str] | None = None,
) -> dict:
    """Cria uma nova transação financeira (despesa ou receita) no PostgreSQL.

    Parâmetros:
        name          — Descrição da transação (ex.: "Almoço no bandejão")
        valor         — Valor em reais (ex.: 25.50)
        tipo          — "Despesa" ou "Receita"
        categoria     — Categoria da transação (deve estar na lista CATEGORIES)
        conta         — Conta/meio de pagamento (padrão: resolução automática)
        data          — Data no formato AAAA-MM-DD (padrão: hoje)
        notes         — Observações opcionais
        subscription_id — ID de assinatura vinculada (opcional)
        card_id       — ID do cartão de crédito (opcional). Quando fornecido,
                        account_id fica NULL — a transação pertence ao cartão,
                        não a uma conta bancária.
        person_ids    — Lista de UUIDs de pessoas a vincular (spec 014 / FR-009).

    Retorna um dicionário com "status": "ok" e o ID gerado, ou "status": "error"
    com uma mensagem descritiva se algo for inválido.
    """
    # Delega ao helper transacional, abrindo a própria conexão (uma transação completa).
    # Comportamento externo inalterado: mesma validação, mesmo retorno. A diferença é só
    # que agora a lógica de INSERT mora em create_transaction_on_cursor (reuso pela Kaguya).
    try:
        with get_conn() as conn:                       # get_conn faz commit ao sair sem erro
            with conn.cursor() as cur:
                result = create_transaction_on_cursor(
                    cur, name=name, valor=valor, tipo=tipo, categoria=categoria,
                    conta=conta, data=data, notes=notes,
                    subscription_id=subscription_id, card_id=card_id,
                    person_ids=person_ids,
                )
                # Se a validação falhou, aborta a transação (não persiste nada).
                if result.get("status") == "error":
                    conn.rollback()
                return result
    except Exception as e:
        # Captura qualquer erro do banco e retorna como mensagem amigável
        return {"status": "error", "message": str(e)}


def update_transaction(
    id: str,
    name: str = "",
    valor: float = None,
    tipo: str = "",
    categoria: str = "",
    conta: str = "",
    data: str = "",
    notes: str = "",
    card_id: str = "",
) -> dict:
    """Atualiza campos de uma transação existente no PostgreSQL.

    Só altera os campos que forem informados (não-vazios / não-None).
    O campo `updated_at` é sempre atualizado para registrar quando ocorreu a mudança.

    Parâmetros:
        id       — ID da transação a ser editada (obrigatório)
        card_id  — Novo cartão de crédito de origem. Quando informado, tem prioridade
                   sobre `conta`: atualiza card_id e conta (nome do cartão), zera
                   account_id. Se omitido e `conta` for informado, resolve como conta
                   bancária: atualiza account_id e conta, zera card_id. Mutuamente
                   exclusivos, mesmo padrão de create_transaction_on_cursor.
        Os demais parâmetros são opcionais — só os informados serão alterados.

    Retorna "status": "ok" se atualizado, "status": "error" se não encontrado ou inválido.
    """
    # Lista de cláusulas SET do SQL — começa sempre com updated_at para registrar a edição
    sets = ["updated_at = NOW()"]

    # Parâmetros da query — começa com o ID para o WHERE no final
    params = {"id": id}

    # Para cada campo opcional, só adiciona ao SET se o valor foi informado
    if name:
        sets.append("name = %(name)s")
        params["name"] = name

    if valor is not None:
        # Verifica explicitamente None (não string vazia) porque 0.0 é um valor válido
        sets.append("valor = %(valor)s")
        params["valor"] = float(valor)

    if tipo:
        # Valida o tipo antes de aceitar
        if tipo not in ("Despesa", "Receita"):
            return {"status": "error", "message": "tipo deve ser 'Despesa' ou 'Receita'"}
        sets.append("tipo = %(tipo)s")
        params["tipo"] = tipo

    if categoria:
        # Valida e normaliza o nome da categoria
        cat = _match_category(categoria)
        if cat is None:
            return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}
        sets.append("categoria = %(categoria)s")
        params["categoria"] = cat

    # Origem: cartão tem prioridade sobre conta (mutuamente exclusivos — mesma regra
    # de create_transaction_on_cursor). Antes desta correção, só o campo display `conta`
    # era atualizado — account_id/card_id ficavam presos na origem antiga.
    if card_id:
        card_obj = next((c for c in _load_cards() if c["id"] == card_id), None)
        if card_obj is None:
            return {"status": "error", "message": f"Cartão não encontrado: '{card_id}'"}
        sets.append("conta = %(conta)s")
        params["conta"] = card_obj["name"]
        sets.append("card_id = %(card_id)s")
        params["card_id"] = card_id
        sets.append("account_id = NULL")
    elif conta:
        # Valida e resolve a conta — precisa do id para popular account_id corretamente
        acc_obj = _resolve_account(conta)
        if acc_obj is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'"}
        sets.append("conta = %(conta)s")
        params["conta"] = acc_obj["name"]
        sets.append("account_id = %(account_id)s")
        params["account_id"] = acc_obj["id"]
        sets.append("card_id = NULL")

    if data:
        sets.append("data = %(data)s")
        params["data"] = data

    if notes:
        sets.append("notes = %(notes)s")
        params["notes"] = notes

    # Se só o updated_at foi adicionado, não há campos reais para mudar — aborta
    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    # Monta o UPDATE com todos os campos coletados acima
    # AND deleted = FALSE garante que não atualizamos transações já deletadas
    sql = f"UPDATE transactions SET {', '.join(sets)} WHERE id = %(id)s AND deleted = FALSE"

    try:
        affected = run_dml(sql, params)

        # Se nenhuma linha foi afetada, o ID não existe ou já foi deletado
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}

        return {"status": "ok", "message": "Transação atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_transaction(id: str) -> dict:
    """Remove uma transação do histórico financeiro (soft delete — não apaga do banco).

    Ao invés de apagar fisicamente o registro, marca o campo `deleted = TRUE`.
    Isso preserva o histórico e permite auditoria futura.

    Parâmetros:
        id — ID da transação a ser removida

    Retorna "status": "ok" se removida, "status": "error" se não encontrada.
    """
    # Soft delete: atualiza o flag `deleted` para TRUE em vez de usar DELETE
    # Também registra o momento da remoção em `updated_at`
    sql = "UPDATE transactions SET deleted = TRUE, updated_at = NOW() WHERE id = %(id)s AND deleted = FALSE"
    params = {"id": id}

    try:
        affected = run_dml(sql, params)

        # Se 0 linhas foram afetadas, o ID não existe ou já estava deletado
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}

        return {"status": "ok", "message": "Transação removida"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def query_expenses(
    start_date: str = "",
    end_date: str = "",
    categoria: str = "",
    tipo: str = "",
    limit: int = 0,
    offset: int = 0,
) -> dict:
    """Busca todas as transações em um período e retorna a lista com o total.

    Se as datas não forem informadas, usa o mês atual (do dia 1 até hoje).

    Parâmetros:
        start_date — Data de início no formato AAAA-MM-DD (padrão: primeiro dia do mês)
        end_date   — Data de fim no formato AAAA-MM-DD (padrão: hoje)
        categoria  — Filtra por categoria exata (vazio = todas, spec 043)
        tipo       — Filtra por "Despesa"/"Receita"/"Transferencia" (vazio = todos)
        limit      — Tamanho da página (spec 043). 0 = sem paginação (retorna tudo)
        offset     — Deslocamento da página (ignorado se limit=0)

    Retorna lista de transações, quantidade, soma total dos valores e `has_more`
    (True quando existem mais linhas além da página pedida).
    """
    # Define o período de busca: datas informadas ou padrão (mês atual)
    start = start_date or _month_start()
    end = end_date or _today()

    where = ["data BETWEEN %(start)s AND %(end)s", "deleted = FALSE"]
    params: dict = {"start": start, "end": end}

    if categoria:
        where.append("categoria = %(categoria)s")
        params["categoria"] = categoria
    if tipo:
        where.append("tipo = %(tipo)s")
        params["tipo"] = tipo

    # account_id/card_id no SELECT — sem eles o formulário de edição não sabe
    # se a transação é de conta ou de cartão (bug descoberto na spec 043)
    # data::text converte o campo date para string (equivalente ao CAST(data AS STRING) do BigQuery)
    sql = f"""
        SELECT id, name, valor, tipo, categoria, conta, account_id, card_id,
               data::text AS data, source, notes, subscription_id
        FROM transactions
        WHERE {' AND '.join(where)}
        ORDER BY data DESC, created_at DESC
    """

    # Busca 1 linha a mais que o limite pedido — se vier, sabemos que há mais
    # páginas sem precisar de uma segunda query de COUNT
    if limit > 0:
        sql += " LIMIT %(limit)s OFFSET %(offset)s"
        params["limit"] = limit + 1
        params["offset"] = offset

    try:
        rows = run_select(sql, params)

        has_more = False
        if limit > 0 and len(rows) > limit:
            has_more = True
            rows = rows[:limit]

        # Anexa as pessoas vinculadas a cada transação (spec 014/047) — 1 query
        # extra em lote, nunca N+1. Nenhuma transação tem pessoas → dict vazio,
        # não quebra nada (o vínculo é sempre opcional).
        if rows:
            tx_ids = [r["id"] for r in rows]
            people_rows = run_select(
                """
                SELECT pl.entity_id AS tx_id, p.id AS person_id, p.name AS person_name
                  FROM person_links pl
                  JOIN people p ON p.id = pl.person_id
                 WHERE pl.entity_type = 'transaction' AND pl.entity_id = ANY(%(tx_ids)s)
                """,
                {"tx_ids": tx_ids},
            )
            people_by_tx: dict[str, list[dict]] = {}
            for pr in people_rows:
                people_by_tx.setdefault(pr["tx_id"], []).append(
                    {"id": pr["person_id"], "name": pr["person_name"]}
                )
            for r in rows:
                r["people"] = people_by_tx.get(r["id"], [])

        # Soma todos os valores das transações para calcular o total do período
        # (inclui transferências — esta é a soma bruta do extrato, não um total de
        # receita/despesa; esses ficam nas queries que filtram tipo explicitamente)
        total = sum(r["valor"] for r in rows)

        return {
            "status": "ok", "transactions": rows, "count": len(rows),
            "total": total, "has_more": has_more,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_transfer(
    from_account: str,
    to_account: str,
    valor: float,
    data: str = "",
    notes: str = "",
) -> dict:
    """Registra uma transferência entre duas contas (spec 043) — par atômico.

    Cria duas transações vinculadas por `transfer_id`: uma Despesa* na conta de
    origem e uma Receita* na conta de destino (*tipo real é "Transferencia" —
    fora de receita/despesa nos relatórios, que filtram por tipo explicitamente).
    Atômico via get_conn(): ou os dois lados são gravados, ou nenhum (rollback).

    Args:
        from_account: Nome da conta de origem (débito).
        to_account: Nome da conta de destino (crédito).
        valor: Valor transferido em reais (positivo).
        data: Data da transferência AAAA-MM-DD (padrão: hoje).
        notes: Observações opcionais.

    Returns:
        {"status": "ok", "transfer_id": ...} ou {"status": "error", "message": ...}.
    """
    if _norm(from_account) == _norm(to_account):
        return {"status": "error", "message": "Conta de origem e destino devem ser diferentes"}

    acc_from = _resolve_account(from_account)
    if acc_from is None:
        return {"status": "error", "message": f"Conta de origem não encontrada: '{from_account}'"}

    acc_to = _resolve_account(to_account)
    if acc_to is None:
        return {"status": "error", "message": f"Conta de destino não encontrada: '{to_account}'"}

    if valor <= 0:
        return {"status": "error", "message": "Valor da transferência deve ser positivo"}

    tx_date = data or _today()
    transfer_id = str(uuid.uuid4())

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO transactions
                      (id, name, valor, tipo, categoria, conta, account_id, card_id,
                       data, source, notes, transfer_id, created_at, deleted)
                    VALUES
                      (%(id)s, %(name)s, %(valor)s, 'Transferencia', 'Transferencia',
                       %(conta)s, %(account_id)s, NULL, %(data)s, 'webapp', %(notes)s,
                       %(transfer_id)s, NOW(), FALSE)
                    """,
                    {
                        "id": str(uuid.uuid4()),
                        "name": f"Transferência para {acc_to['name']}",
                        "valor": float(valor),
                        "conta": acc_from["name"],
                        "account_id": acc_from["id"],
                        "data": tx_date,
                        "notes": notes or None,
                        "transfer_id": transfer_id,
                    },
                )
                cur.execute(
                    """
                    INSERT INTO transactions
                      (id, name, valor, tipo, categoria, conta, account_id, card_id,
                       data, source, notes, transfer_id, created_at, deleted)
                    VALUES
                      (%(id)s, %(name)s, %(valor)s, 'Transferencia', 'Transferencia',
                       %(conta)s, %(account_id)s, NULL, %(data)s, 'webapp', %(notes)s,
                       %(transfer_id)s, NOW(), FALSE)
                    """,
                    {
                        "id": str(uuid.uuid4()),
                        "name": f"Transferência de {acc_from['name']}",
                        "valor": float(valor),
                        "conta": acc_to["name"],
                        "account_id": acc_to["id"],
                        "data": tx_date,
                        "notes": notes or None,
                        "transfer_id": transfer_id,
                    },
                )
        return {
            "status": "ok", "transfer_id": transfer_id,
            "message": f"Transferência de R${valor:.2f} de {acc_from['name']} para {acc_to['name']}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_spending_summary(period: str = "month", group_by: str = "categoria") -> dict:
    """Retorna um resumo dos gastos agrupados por categoria, conta ou tipo.

    Permite visualizar para onde o dinheiro está indo em um dado período.

    Parâmetros:
        period   — Período de análise: "month" (mês atual), "week" (semana atual),
                   "year" (ano atual) ou "YYYY-MM" (mês específico, ex.: "2025-03")
        group_by — Campo de agrupamento: "categoria", "conta" ou "tipo"

    Retorna um dicionário com o total por grupo e o total geral do período.
    """
    import calendar
    from datetime import timedelta

    # Mapa fechado de agrupamentos válidos — a coluna usada no SQL sai SEMPRE
    # deste dicionário, nunca do input do usuário (elimina injeção no GROUP BY)
    group_cols = {"categoria": "categoria", "conta": "conta", "tipo": "tipo"}
    group_col = group_cols.get(group_by)
    if group_col is None:
        return {"status": "error", "message": "group_by deve ser 'categoria', 'conta' ou 'tipo'"}

    today = _today_date()

    # Determina o intervalo de datas com base no período solicitado
    if period == "month":
        # Mês atual: do dia 1 até hoje
        start = today.replace(day=1).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")

    elif period == "week":
        # Semana atual: de segunda-feira (weekday=0) até hoje
        # timedelta(days=today.weekday()) calcula quantos dias se passaram desde segunda
        start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")

    elif period == "year":
        # Ano atual: de 1 de janeiro até hoje
        start = today.replace(month=1, day=1).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")

    elif len(period) == 7 and period[4] == "-":
        # Formato "YYYY-MM" — mês específico: do dia 1 ao último dia do mês
        year, month = int(period[:4]), int(period[5:])
        last_day = calendar.monthrange(year, month)[1]  # quantos dias tem o mês
        start = f"{period}-01"
        end = f"{period}-{last_day:02d}"  # :02d formata com zero à esquerda (ex.: 09)

    else:
        # Formato não reconhecido — retorna erro com as opções válidas
        return {"status": "error", "message": "period inválido. Use 'month', 'week', 'year' ou 'YYYY-MM'"}

    # Query que soma os valores agrupados pelo campo escolhido
    # group_col vem do dicionário group_cols acima — nunca do input direto
    sql = f"""
        SELECT {group_col}, SUM(valor) AS total
        FROM transactions
        WHERE data BETWEEN %(start)s AND %(end)s
          AND deleted = FALSE
        GROUP BY {group_col}
        ORDER BY total DESC
    """

    params = {"start": start, "end": end}

    try:
        rows = run_select(sql, params)

        # Converte a lista de linhas em um dicionário {grupo: total}
        # Ex.: {"Alimentacao": 450.0, "Transporte": 120.0}
        summary = {r[group_by]: r["total"] for r in rows}

        return {
            "status": "ok",
            "summary": summary,
            "total": sum(summary.values()),  # soma geral de todos os grupos
            "period": period,
            "group_by": group_by,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_spending_trend(months: int = 3) -> dict:
    """Retorna o total gasto por mês nos últimos N meses e projeta o gasto do mês atual.

    Permite identificar tendências de aumento ou redução de gastos ao longo do tempo.

    Parâmetros:
        months — Quantos meses anteriores ao atual incluir na análise (padrão: 3)

    Retorna um dicionário com o total por mês e uma projeção para o mês atual
    baseada no ritmo de gastos até hoje.
    """
    import calendar
    from datetime import timedelta

    today = _today_date()

    # Calcula o primeiro dia do período: volta `months` meses antes do mês atual
    # A lógica: começa do dia 1 do mês atual e vai subtraindo meses um a um
    start = today.replace(day=1)
    for _ in range(months):
        # Subtrai 1 dia (vai para o último dia do mês anterior) e troca para dia 1
        start = (start - timedelta(days=1)).replace(day=1)

    # TO_CHAR formata a data como "YYYY-MM" — equivalente ao FORMAT_DATE('%Y-%m', ...) do BigQuery
    sql = """
        SELECT TO_CHAR(data, 'YYYY-MM') AS month, SUM(valor) AS total
        FROM transactions
        WHERE data BETWEEN %(start)s AND %(end)s
          AND deleted = FALSE
        GROUP BY month
        ORDER BY month
    """

    params = {
        "start": start.strftime("%Y-%m-%d"),
        "end":   today.strftime("%Y-%m-%d"),
    }

    try:
        rows = run_select(sql, params)

        # Converte a lista de linhas em um dicionário {mês: total}
        # Ex.: {"2025-01": 1200.0, "2025-02": 980.0, "2025-03": 430.0}
        trend = {r["month"]: r["total"] for r in rows}

        # Calcula a projeção do mês atual baseada nos gastos até hoje
        current_month = today.strftime("%Y-%m")
        current_spend = trend.get(current_month, 0.0)  # gasto acumulado até hoje neste mês
        days_in_month = calendar.monthrange(today.year, today.month)[1]  # total de dias no mês

        # Projeção linear: (gasto até hoje / dias decorridos) × total de dias no mês
        # today.day > 0 evita divisão por zero (sempre True, mas é uma salvaguarda)
        projected = round(current_spend / today.day * days_in_month, 2) if today.day > 0 else 0.0

        return {"status": "ok", "trend": trend, "current_month_projected": projected}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_subscription(id: str) -> dict:
    """Remove permanentemente uma assinatura do sistema (soft delete).

    Diferente de update_subscription(status="cancelada") que apenas muda o status,
    esta função marca a assinatura como deleted=TRUE, removendo-a de todas as listagens.

    Args:
        id: ID da assinatura a ser removida.

    Returns:
        Dicionário com "status": "ok" e nome/valor da assinatura removida,
        ou "status": "error" se não encontrada.
    """
    # Busca nome e valor antes de deletar para exibir na confirmação
    info_rows = run_select(
        "SELECT name, valor, ciclo FROM subscriptions WHERE id = %(id)s AND (deleted = FALSE OR deleted IS NULL)",
        {"id": id},
    )
    if not info_rows:
        return {"status": "error", "message": f"Assinatura não encontrada: {id}"}

    sub = info_rows[0]

    # Soft delete: marca deleted=TRUE e registra o momento
    sql = "UPDATE subscriptions SET deleted = TRUE, updated_at = NOW() WHERE id = %(id)s"
    try:
        run_dml(sql, {"id": id})
        return {
            "status": "ok",
            "message": f"Assinatura '{sub['name']}' (R${float(sub['valor']):.2f}/{sub['ciclo']}) removida.",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_subscription(
    name: str,
    valor: float,
    ciclo: str,
    next_billing: str,
    conta: str,
    categoria: str,
    notes: str = "",
    kind: str = "assinatura",
    auto_lancar: bool | None = None,
) -> dict:
    """Cadastra uma nova recorrência: assinatura OU conta fixa (spec 044).

    Parâmetros:
        name         — Nome do serviço/conta (ex.: "Netflix", "Luz")
        valor        — Valor esperado da cobrança (ex.: 55.90) — em conta fixa é só uma
                       estimativa, o valor real é confirmado em mark_subscription_paid
        ciclo        — Frequência: "mensal" ou "anual"
        next_billing — Próxima data de cobrança no formato AAAA-MM-DD
        conta        — Conta ou cartão usado para pagamento (resolvido dinamicamente)
        categoria    — Categoria da assinatura (deve estar em CATEGORIES)
        notes        — Observações opcionais
        kind         — "assinatura" (padrão) ou "conta_fixa" — serviço digital de valor
                       fixo é assinatura; conta doméstica de valor variável (luz, água,
                       aluguel) é conta fixa.
        auto_lancar  — Se None, usa o padrão por kind (assinatura=True, conta_fixa=False —
                       FR-002). Contas fixas exigem confirmação manual do valor real.

    Retorna "status": "ok" com o ID criado, ou "status": "error" se algo for inválido.
    """
    # Valida o ciclo de cobrança — só aceita mensal ou anual
    if ciclo not in ("mensal", "anual"):
        return {"status": "error", "message": "ciclo deve ser 'mensal' ou 'anual'"}

    if kind not in ("assinatura", "conta_fixa"):
        return {"status": "error", "message": "kind deve ser 'assinatura' ou 'conta_fixa'"}

    # Padrão por kind (FR-002) quando o chamador não decidiu explicitamente
    if auto_lancar is None:
        auto_lancar = kind == "assinatura"

    # Valida o formato da data antes de mandar ao banco — erro amigável em vez
    # de exceção do PostgreSQL (ex.: "2026-13-45" seria rejeitado só no INSERT)
    try:
        date.fromisoformat(next_billing)
    except (ValueError, TypeError):
        return {"status": "error", "message": f"next_billing inválido: '{next_billing}'. Use o formato AAAA-MM-DD."}

    # Resolve o pagador: primeiro tenta conta bancária, depois cartão de crédito.
    # Mesma regra de transactions: account_id e card_id são mutuamente exclusivos.
    account_id = None
    card_id = None
    acc = _resolve_account(conta)
    if acc is not None:
        conta_display = acc["name"]
        account_id = acc["id"]
    else:
        card = _resolve_credit_card(conta)
        if card is None:
            return {"status": "error", "message": f"Conta ou cartão não encontrado: '{conta}'. Cadastre com create_account ou register_credit_card."}
        conta_display = card["name"]
        card_id = card["id"]

    # Valida e normaliza a categoria informada
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}

    # Gera um ID único para esta assinatura
    sub_id = str(uuid.uuid4())

    # Monta a query de inserção na tabela de assinaturas
    # status 'ativa' é o valor inicial — pode ser alterado depois via update_subscription
    sql = """
        INSERT INTO subscriptions (id, name, valor, ciclo, next_billing, conta, account_id, card_id, categoria, status, notes, kind, auto_lancar, created_at)
        VALUES (%(id)s, %(name)s, %(valor)s, %(ciclo)s, %(next_billing)s, %(conta)s, %(account_id)s, %(card_id)s, %(categoria)s, 'ativa', %(notes)s, %(kind)s, %(auto_lancar)s, NOW())
    """

    params = {
        "id":           sub_id,
        "name":         name,
        "valor":        float(valor),
        "ciclo":        ciclo,
        "next_billing": next_billing,
        "conta":        conta_display,
        "account_id":   account_id,
        "card_id":      card_id,
        "categoria":    cat,
        "notes":        notes or None,  # None = NULL no banco
        "kind":         kind,
        "auto_lancar":  auto_lancar,
    }

    try:
        run_dml(sql, params)
        # Retorna confirmação com um resumo legível da assinatura criada
        label = "Conta fixa" if kind == "conta_fixa" else "Assinatura"
        return {"status": "ok", "id": sub_id, "message": f"{label} criada: {name} R${float(valor):.2f}/{ciclo}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_subscriptions(status: str = "ativa", kind: str = "") -> dict:
    """Lista todas as recorrências (assinaturas e/ou contas fixas) com o status informado.

    Também calcula o custo mensal total considerando as anuais
    (dividindo o valor anual por 12 para obter o equivalente mensal).

    Parâmetros:
        status — Filtro de status: "ativa" (padrão), "pausada" ou "cancelada"
        kind   — Filtro opcional: "assinatura" ou "conta_fixa" (spec 044). Vazio = ambos.

    Retorna lista de recorrências e o custo mensal equivalente total.
    """
    # Busca as assinaturas com o status solicitado, ordenando pela próxima cobrança
    # next_billing::text converte o campo date para string (equivalente ao CAST(... AS STRING) do BigQuery)
    # Filtra deleted=FALSE para excluir assinaturas removidas via delete_subscription
    where = ["status = %(status)s", "(deleted = FALSE OR deleted IS NULL)"]
    params: dict = {"status": status}
    if kind:
        where.append("kind = %(kind)s")
        params["kind"] = kind

    sql = f"""
        SELECT id, name, valor, ciclo, next_billing::text AS next_billing,
               conta, categoria, status, notes,
               COALESCE(kind, 'assinatura') AS kind,
               COALESCE(auto_lancar, TRUE)  AS auto_lancar
        FROM subscriptions
        WHERE {' AND '.join(where)}
        ORDER BY next_billing
    """

    try:
        rows = run_select(sql, params)

        # Calcula o total mensal equivalente:
        # - Assinaturas mensais: usa o valor diretamente
        # - Assinaturas anuais: divide por 12 para obter o custo mensal proporcional
        total_mensal = sum(
            r["valor"] if r["ciclo"] == "mensal" else r["valor"] / 12
            for r in rows
        )

        return {"status": "ok", "subscriptions": rows, "total_mensal": round(total_mensal, 2)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def update_subscription(
    id: str,
    name: str = "",
    valor: float = None,
    ciclo: str = "",
    next_billing: str = "",
    conta: str = "",
    status: str = "",
    notes: str = "",
    kind: str = "",
    auto_lancar: bool | None = None,
) -> dict:
    """Atualiza campos de uma assinatura ou conta fixa existente.

    Só altera os campos que forem informados (não-vazios / não-None).
    Permite pausar, cancelar ou reativar via o campo `status`.

    Parâmetros:
        id           — ID da recorrência a ser editada (obrigatório)
        Os demais parâmetros são opcionais — só os informados serão alterados.
        status       — Novo status: "ativa", "pausada" ou "cancelada"
        kind         — "assinatura" ou "conta_fixa" (spec 044) — permite reclassificar
        auto_lancar  — Liga/desliga o lançamento automático (spec 044/048)

    Retorna "status": "ok" se atualizado, "status": "error" se não encontrada ou inválida.
    """
    # Lista de cláusulas SET — começa com updated_at para registrar quando foi alterado
    sets = ["updated_at = NOW()"]

    # Parâmetros começam com o ID que será usado no WHERE
    params = {"id": id}

    # Adiciona cada campo ao SET apenas se foi informado pelo usuário
    if name:
        sets.append("name = %(name)s")
        params["name"] = name

    if valor is not None:
        # Checa None explicitamente pois 0.0 seria um valor válido (mesmo que estranho)
        sets.append("valor = %(valor)s")
        params["valor"] = float(valor)

    if ciclo:
        # Valida o ciclo antes de aceitar
        if ciclo not in ("mensal", "anual"):
            return {"status": "error", "message": "ciclo deve ser 'mensal' ou 'anual'"}
        sets.append("ciclo = %(ciclo)s")
        params["ciclo"] = ciclo

    if next_billing:
        sets.append("next_billing = %(next_billing)s")
        params["next_billing"] = next_billing

    if conta:
        # Valida e normaliza a conta
        acc = _match_account(conta)
        if acc is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'"}
        sets.append("conta = %(conta)s")
        params["conta"] = acc

    if status:
        # Só aceita os três estados válidos do ciclo de vida de uma assinatura
        if status not in ("ativa", "pausada", "cancelada"):
            return {"status": "error", "message": "status deve ser 'ativa', 'pausada' ou 'cancelada'"}
        sets.append("status = %(status)s")
        params["status"] = status

    if notes:
        sets.append("notes = %(notes)s")
        params["notes"] = notes

    if kind:
        if kind not in ("assinatura", "conta_fixa"):
            return {"status": "error", "message": "kind deve ser 'assinatura' ou 'conta_fixa'"}
        sets.append("kind = %(kind)s")
        params["kind"] = kind

    if auto_lancar is not None:
        sets.append("auto_lancar = %(auto_lancar)s")
        params["auto_lancar"] = auto_lancar

    # Se só o updated_at foi adicionado, não há campos reais a mudar — aborta
    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    # Monta o UPDATE — sem filtro deleted porque assinaturas não usam soft delete
    sql = f"UPDATE subscriptions SET {', '.join(sets)} WHERE id = %(id)s"

    try:
        affected = run_dml(sql, params)

        # Se nenhuma linha foi afetada, o ID não existe na tabela
        if affected == 0:
            return {"status": "error", "message": f"Assinatura não encontrada: {id}"}

        return {"status": "ok", "message": "Assinatura atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── Contas Fixas (spec 044) ──────────────────────────────────────────────────
# Reaproveita a mesma tabela subscriptions (kind='conta_fixa') — a mecânica de
# recorrência é idêntica; o que muda é o comportamento de confirmação de valor.

def _cycle_status(sub: dict, today: date) -> str:
    """Deriva o status do ciclo corrente de uma recorrência — função pura, sem banco.

    IMPORTANTE: não usa `next_billing` como "vencimento deste ciclo" — esse campo é o
    PRÓXIMO vencimento e já foi rolado para a frente assim que a conta é paga (ver
    mark_subscription_paid). Em vez disso, usa `next_billing_day` (dia do mês, estável
    entre rolagens) para calcular o vencimento do ciclo corrente a partir de `today`.

    Args:
        sub: dict com ao menos "ciclo", "next_billing" (ISO ou None),
            "next_billing_day" (int ou None).
        today: data de referência (sempre `_today_date()`, nunca `date.today()`).

    Returns:
        "agendada" — ciclo anual fora do mês de cobrança (edge case da spec 044).
        "pendente" — dentro do ciclo, ainda não venceu.
        "atrasada" — dentro do ciclo, já venceu.

    Note:
        Não verifica se já foi paga — quem chama (get_recurring_status) decide "paga"
        checando a existência de uma transação vinculada no período; esta função só
        cobre o caso "ainda não paga".
    """
    from calendar import monthrange

    ciclo = sub.get("ciclo") or "mensal"
    day = sub.get("next_billing_day")
    if not day:
        # Sem dia cadastrado — usa o dia do next_billing como fallback (compat. com
        # recorrências antigas criadas antes do campo next_billing_day existir)
        nb = sub.get("next_billing")
        day = date.fromisoformat(nb).day if nb else 1

    if ciclo == "anual":
        # Mês de cobrança fixo: persiste entre rolagens porque rolar soma 1 ano
        # (mês nunca muda). Fora desse mês, a conta não é urgente este mês.
        nb = sub.get("next_billing")
        billing_month = date.fromisoformat(nb).month if nb else today.month
        if today.month != billing_month:
            return "agendada"

    last_day = monthrange(today.year, today.month)[1]
    due = date(today.year, today.month, min(day, last_day))
    return "atrasada" if today > due else "pendente"


def get_recurring_status(kind: str = "", status: str = "ativa") -> dict:
    """Lista recorrências (assinaturas e/ou contas fixas) com o status do ciclo corrente.

    Para cada recorrência, verifica se já existe uma transação vinculada
    (`subscription_id`) dentro do ciclo corrente — se sim, "paga"; senão, aplica
    `_cycle_status` (pendente/atrasada/agendada).

    Args:
        kind: Filtro opcional "assinatura" ou "conta_fixa" — vazio retorna ambos.
        status: Filtro de status da recorrência (padrão "ativa").

    Returns:
        Dict com "status": "ok", lista "items" (cada um com "cycle_status"),
        "custo_fixo_mensal" (soma de todos, anuais proporcionalizadas) e
        "pendentes_count" (contas fixas com status pendente/atrasada).
    """
    result = list_subscriptions(status=status, kind=kind)
    if result.get("status") != "ok":
        return result

    today = _today_date()
    ano_mes_inicio = today.replace(day=1).isoformat()
    from calendar import monthrange
    ano_mes_fim = today.replace(day=monthrange(today.year, today.month)[1]).isoformat()

    items = []
    pendentes_count = 0
    custo_fixo_mensal = 0.0

    for sub in result.get("subscriptions", []):
        valor = float(sub["valor"])
        custo_fixo_mensal += valor if sub["ciclo"] == "mensal" else valor / 12

        # Verifica se já há transação vinculada a esta recorrência no mês corrente
        paid_rows = run_select(
            """
            SELECT 1 FROM transactions
             WHERE subscription_id = %(sub_id)s
               AND deleted = FALSE
               AND data BETWEEN %(start)s AND %(end)s
             LIMIT 1
            """,
            {"sub_id": sub["id"], "start": ano_mes_inicio, "end": ano_mes_fim},
        )
        if paid_rows:
            cycle_status = "paga"
        else:
            cycle_status = _cycle_status(sub, today)
            if cycle_status in ("pendente", "atrasada"):
                pendentes_count += 1

        items.append({**sub, "cycle_status": cycle_status})

    return {
        "status": "ok",
        "items": items,
        "custo_fixo_mensal": round(custo_fixo_mensal, 2),
        "pendentes_count": pendentes_count,
    }


def mark_subscription_paid(
    id: str,
    valor: float,
    data: str = "",
    conta: str = "",
) -> dict:
    """Confirma o pagamento de uma recorrência (spec 044, User Story 2) — atômico.

    Cria a despesa vinculada (`subscription_id`) com o valor REAL informado (pode ser
    diferente do valor esperado cadastrado — é o ponto central de "conta fixa") e rola
    `next_billing` para o próximo ciclo. Tudo numa única transação via `get_conn()`:
    ou os dois lados são gravados, ou nenhum (FR-005/SC-003).

    Args:
        id: ID da recorrência (subscriptions.id).
        valor: Valor real pago em reais.
        data: Data do pagamento AAAA-MM-DD (padrão: hoje).
        conta: Conta/cartão de pagamento — vazio usa o pagador já cadastrado na recorrência.

    Returns:
        {"status": "ok", "transaction_id": ...} ou {"status": "error", "message": ...}.
    """
    if valor <= 0:
        return {"status": "error", "message": "Valor pago deve ser positivo"}

    rows = run_select(
        "SELECT * FROM subscriptions WHERE id = %(id)s AND (deleted = FALSE OR deleted IS NULL)",
        {"id": id},
    )
    if not rows:
        return {"status": "error", "message": f"Recorrência não encontrada: {id}"}
    sub = rows[0]

    if data:
        try:
            date.fromisoformat(data)
        except ValueError:
            return {"status": "error", "message": f"Data inválida: '{data}'"}
    tx_date = data or _today()

    # Rola next_billing: mensal +1 mês, anual +1 ano — a partir do next_billing atual
    # (não de hoje), para não perder o dia de vencimento em pagamentos adiantados
    from datetime import timedelta
    current_next = sub["next_billing"] if sub.get("next_billing") else _today_date()
    if sub["ciclo"] == "anual":
        new_next = current_next.replace(year=current_next.year + 1)
    else:
        new_next = (current_next.replace(day=1) + timedelta(days=32)).replace(
            day=min(current_next.day, 28)
        )

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Pagador: usa o `conta` explícito se informado (resolve como conta
                # bancária); senão, reaproveita o pagador já cadastrado na recorrência —
                # que pode ser conta OU cartão (account_id/card_id mutuamente exclusivos,
                # mesma regra de transactions).
                if conta:
                    card_id = ""
                    payer = conta
                else:
                    card_id = sub.get("card_id") or ""
                    payer = sub.get("conta") or ""

                tx = create_transaction_on_cursor(
                    cur,
                    name=f"{sub['name']} (pago)",
                    valor=float(valor),
                    tipo="Despesa",
                    categoria=sub.get("categoria") or "Inbox",
                    conta=payer,
                    card_id=card_id,
                    data=tx_date,
                    subscription_id=id,
                    source="webapp",
                )
                if tx.get("status") != "ok":
                    raise ValueError(tx.get("message", "Erro ao lançar despesa"))

                cur.execute(
                    "UPDATE subscriptions SET next_billing = %(next_billing)s, updated_at = NOW() WHERE id = %(id)s",
                    {"next_billing": new_next.isoformat(), "id": id},
                )
        return {
            "status": "ok", "transaction_id": tx["id"],
            "message": f"Pagamento de R${valor:.2f} confirmado para {sub['name']}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def skip_subscription_cycle(id: str) -> dict:
    """Pula o ciclo corrente sem lançar despesa (edge case da spec 044).

    Usado quando uma conta fixa não teve fatura no mês (ex.: isenção). Rola
    `next_billing` do mesmo jeito que um pagamento, mas sem criar transação.

    Args:
        id: ID da recorrência.

    Returns:
        {"status": "ok"} ou {"status": "error", "message": ...}.
    """
    rows = run_select(
        "SELECT ciclo, next_billing FROM subscriptions WHERE id = %(id)s AND (deleted = FALSE OR deleted IS NULL)",
        {"id": id},
    )
    if not rows:
        return {"status": "error", "message": f"Recorrência não encontrada: {id}"}
    sub = rows[0]

    from datetime import timedelta
    current_next = sub["next_billing"] if sub.get("next_billing") else _today_date()
    if sub["ciclo"] == "anual":
        new_next = current_next.replace(year=current_next.year + 1)
    else:
        new_next = (current_next.replace(day=1) + timedelta(days=32)).replace(
            day=min(current_next.day, 28)
        )

    try:
        run_dml(
            "UPDATE subscriptions SET next_billing = %(next_billing)s, updated_at = NOW() WHERE id = %(id)s",
            {"next_billing": new_next.isoformat(), "id": id},
        )
        return {"status": "ok", "message": "Ciclo pulado, próximo vencimento atualizado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
