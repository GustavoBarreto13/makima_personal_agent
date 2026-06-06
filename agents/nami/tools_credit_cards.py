"""Ferramentas de tracker de cartões de crédito para o agente Nami.

Permite cadastrar cartões, monitorar dívida atual, registrar pagamentos
e simular cenários de quitação usando o Método Avalanche.

Arquitetura: `transactions` é a fonte da verdade para saldo de cartões.
- Dívida inicial → transação tipo Despesa na conta do cartão
- Pagamento de fatura → transação tipo Receita na conta do cartão
- Saldo atual = SUM(Despesas) - SUM(Receitas) via account_id no ciclo de faturamento

A tabela `credit_cards` guarda apenas metadados (limite, taxa, dias de fechamento)
e vincula ao cadastro em `accounts` via account_id (FK lógica).

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import uuid
from calendar import monthrange
from datetime import date

# Importa os helpers PostgreSQL compartilhados
from agents.db import run_select, run_dml
from agents.nami.tools import (
    _resolve_account,
    _invalidate_cards_cache,
    create_transaction,
)


def _billing_cycle(closing_day: int) -> tuple:
    """Calcula o intervalo de datas do ciclo de faturamento atual.

    O ciclo vai do dia após o fechamento do mês anterior até o fechamento
    do mês atual. Por exemplo, com closing_day=6:
    - Se hoje é dia 5: ciclo = 07/mai a 05/jun (fatura ainda aberta)
    - Se hoje é dia 10: ciclo = 07/jun a 10/jun (fatura em curso)

    Args:
        closing_day: Dia do fechamento da fatura (1-31)

    Returns:
        Tupla (start_date, end_date) no formato "AAAA-MM-DD".
    """
    today = date.today()

    if today.day <= closing_day:
        prev_month = today.month - 1 if today.month > 1 else 12
        prev_year = today.year if today.month > 1 else today.year - 1
        last_day_prev = monthrange(prev_year, prev_month)[1]
        start_day = min(closing_day + 1, last_day_prev)
        start = date(prev_year, prev_month, start_day)
    else:
        last_day_cur = monthrange(today.year, today.month)[1]
        start_day = min(closing_day + 1, last_day_cur)
        start = date(today.year, today.month, start_day)

    return start.isoformat(), today.isoformat()


def register_credit_card(
    name: str,
    account_name: str,
    limite: float,
    taxa_juros_mensal: float,
    closing_day: int,
    due_day: int,
    current_debt: float = 0.0,
    notes: str = "",
) -> dict:
    """Cadastra um cartão de crédito e vincula a uma conta corrente ou poupança.

    A conta (account_name) deve ser do tipo corrente, poupança, dinheiro ou investimento
    — representa a conta de onde a fatura será paga. Cartões não são contas.
    Se houver dívida inicial, ela é registrada como transação tipo Despesa vinculada
    ao cartão (card_id) — não à conta bancária.

    Args:
        name: Nome do cartão (ex.: "Nubank", "Itaú Platinum")
        account_name: Nome da conta corrente/poupança vinculada (ex.: "Itau")
        limite: Limite total do cartão em reais
        taxa_juros_mensal: Taxa de juros mensal decimal (ex.: 0.15 para 15%)
        closing_day: Dia do fechamento da fatura (1-31)
        due_day: Dia do vencimento da fatura (1-31)
        current_debt: Dívida atual em reais (padrão: 0)
        notes: Observações opcionais

    Returns:
        Dicionário com "status": "ok" e id do cartão, ou "status": "error".
    """
    # Resolve nome → {id, name} na tabela accounts
    acc = _resolve_account(account_name)
    if acc is None:
        return {"status": "error", "message": f"Conta não encontrada: '{account_name}'. Use list_accounts() para ver as contas disponíveis."}

    card_id = str(uuid.uuid4())

    sql = """
        INSERT INTO credit_cards
          (id, name, account_id, limite, taxa_juros_mensal, closing_day, due_day,
           status, notes, created_at)
        VALUES (%(id)s, %(name)s, %(account_id)s, %(limite)s, %(taxa)s, %(closing)s, %(due)s,
                'ativo', %(notes)s, NOW())
    """
    params = {
        "id":         card_id,
        "name":       name,
        "account_id": acc["id"],
        "limite":     float(limite),
        "taxa":       float(taxa_juros_mensal),
        "closing":    int(closing_day),
        "due":        int(due_day),
        "notes":      notes or "",
    }

    try:
        run_dml(sql, params)
        # Invalida o cache para que o novo cartão apareça imediatamente em _load_cards()
        _invalidate_cards_cache()
    except Exception as e:
        return {"status": "error", "message": str(e)}

    # Dívida inicial → transação Despesa vinculada ao cartão (não à conta bancária)
    if current_debt > 0:
        tx = create_transaction(
            name=f"Saldo inicial — {name}",
            valor=float(current_debt),
            tipo="Despesa",
            categoria="Inbox",
            conta=name,         # nome do cartão para exibição
            card_id=card_id,    # vincula ao cartão — account_id fica NULL
        )
        if tx.get("status") != "ok":
            return {"status": "error", "message": f"Cartão criado mas erro ao registrar dívida: {tx.get('message')}"}

    return {
        "status": "ok",
        "id": card_id,
        "message": f"Cartão '{name}' cadastrado. Limite: R${limite:.2f}, Dívida inicial: R${current_debt:.2f}",
    }


def get_card_debt_summary() -> dict:
    """Retorna dívida atual de cada cartão ativo e total consolidado.

    O saldo de cada cartão é calculado somando as Despesas menos as Receitas
    em transactions filtradas por card_id, no ciclo de faturamento atual.

    Returns:
        Dicionário com lista de cartões, dívida e utilização de cada um, e totais.
    """
    # Busca cartões com nome da conta via JOIN em accounts
    sql_cards = """
        SELECT cc.id, cc.name, cc.account_id, a.name AS conta,
               cc.limite, cc.taxa_juros_mensal, cc.closing_day, cc.due_day
        FROM credit_cards cc
        JOIN accounts a ON a.id = cc.account_id
        WHERE cc.status = 'ativo'
    """

    try:
        cards = run_select(sql_cards)

        result = []
        total_divida = 0.0
        total_limite = 0.0

        for card in cards:
            start_date, end_date = _billing_cycle(card["closing_day"])

            # Filtra transactions pelo card_id — separa completamente das transações de conta bancária
            sql_saldo = """
                SELECT
                    COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0.0)
                  - COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END), 0.0)
                  AS saldo
                FROM transactions
                WHERE card_id = %(card_id)s
                  AND deleted = FALSE
                  AND data BETWEEN %(start_date)s AND %(end_date)s
            """
            params_saldo = {
                "card_id":    card["id"],
                "start_date": start_date,
                "end_date":   end_date,
            }
            rows = run_select(sql_saldo, params_saldo)
            divida = max(0.0, float(rows[0]["saldo"]) if rows else 0.0)

            utilizacao = divida / card["limite"] * 100 if card["limite"] > 0 else 0.0
            result.append({
                **card,
                "divida_atual": round(divida, 2),
                "utilizacao_pct": round(utilizacao, 1),
            })
            total_divida += divida
            total_limite += card["limite"]

        util_total = total_divida / total_limite * 100 if total_limite > 0 else 0.0

        return {
            "status": "ok",
            "cards": result,
            "total_divida": round(total_divida, 2),
            "total_limite": round(total_limite, 2),
            "utilizacao_total_pct": round(util_total, 1),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def register_card_payment(card_id: str, valor: float, data: str = "") -> dict:
    """Registra pagamento de fatura de cartão de crédito.

    Cria uma transação tipo Receita na conta do cartão — isso subtrai do saldo
    calculado em get_card_debt_summary, efetivamente reduzindo a dívida.

    Args:
        card_id: ID do cartão (retornado por register_credit_card)
        valor: Valor pago em reais (positivo)
        data: Data do pagamento no formato AAAA-MM-DD (padrão: hoje)

    Returns:
        Dicionário com "status": "ok" ou "status": "error".
    """
    # Busca cartão com nome da conta via JOIN (necessário para create_transaction)
    sql_card = """
        SELECT cc.id, cc.name, cc.account_id, a.name AS conta
        FROM credit_cards cc
        JOIN accounts a ON a.id = cc.account_id
        WHERE cc.id = %(id)s AND cc.status = 'ativo'
    """
    params = {"id": card_id}

    try:
        cards = run_select(sql_card, params)
        if not cards:
            return {"status": "error", "message": f"Cartão não encontrado: {card_id}"}

        card = cards[0]

        # Pagamento vira Receita vinculada ao cartão — reduz o saldo calculado em get_card_debt_summary
        from agents.nami.tools import _today
        tx = create_transaction(
            name=f"Pagamento fatura — {card['name']}",
            valor=float(valor),
            tipo="Receita",
            categoria="Inbox",
            conta=card["name"],    # nome do cartão para exibição
            card_id=card["id"],    # vincula ao cartão — account_id fica NULL
            data=data or _today(),
        )
        if tx.get("status") != "ok":
            return {"status": "error", "message": f"Erro ao registrar pagamento: {tx.get('message')}"}

        return {"status": "ok", "message": f"Pagamento de R${abs(valor):.2f} registrado no {card['name']}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def simulate_debt_payoff(monthly_payment: float) -> dict:
    """Simula quitação de todas as dívidas de cartão usando o Método Avalanche.

    Avalanche: ataca primeiro o cartão de maior taxa de juros.

    Args:
        monthly_payment: Valor total disponível para pagamento por mês (em reais)

    Returns:
        Dicionário com meses para quitar, juros total e ordem de ataque.
    """
    summary = get_card_debt_summary()
    if summary["status"] != "ok":
        return summary

    cards = [c for c in summary["cards"] if c["divida_atual"] > 0]
    if not cards:
        return {"status": "ok", "message": "Nenhuma dívida ativa nos cartões", "meses": 0, "juros_total": 0.0}

    cards_sorted = sorted(cards, key=lambda c: c["taxa_juros_mensal"], reverse=True)

    balances = {c["id"]: c["divida_atual"] for c in cards_sorted}
    rates = {c["id"]: c["taxa_juros_mensal"] for c in cards_sorted}
    juros_total = 0.0
    meses = 0

    while sum(balances.values()) > 0.01 and meses < 360:
        meses += 1
        payment_left = monthly_payment

        for cid in balances:
            if balances[cid] > 0:
                juros = balances[cid] * rates[cid]
                balances[cid] += juros
                juros_total += juros

        for card in cards_sorted:
            if payment_left <= 0:
                break
            cid = card["id"]
            if balances[cid] > 0:
                paid = min(balances[cid], payment_left)
                balances[cid] -= paid
                payment_left -= paid
                if balances[cid] < 0.01:
                    balances[cid] = 0.0

    return {
        "status": "ok",
        "meses": meses,
        "juros_total": round(juros_total, 2),
        "ordem_pagamento": [c["name"] for c in cards_sorted],
        "message": (
            f"Com R${monthly_payment:.2f}/mês, quita em {meses} meses "
            f"pagando R${juros_total:.2f} em juros (Método Avalanche)"
        ),
    }


def get_minimum_payment_cost(card_id: str) -> dict:
    """Calcula o custo total de pagar apenas o mínimo em um cartão.

    Simula o cenário de pagar apenas 15% do saldo por mês (padrão brasileiro).

    Args:
        card_id: ID do cartão a analisar

    Returns:
        Dicionário com meses, juros total e custo total da dívida.
    """
    sql_card = """
        SELECT cc.id, cc.name, cc.account_id, cc.taxa_juros_mensal, cc.limite,
               cc.closing_day, cc.due_day
        FROM credit_cards cc
        WHERE cc.id = %(id)s AND cc.status = 'ativo'
    """
    params = {"id": card_id}

    try:
        cards = run_select(sql_card, params)
        if not cards:
            return {"status": "error", "message": f"Cartão não encontrado: {card_id}"}

        card = cards[0]
        start_date, end_date = _billing_cycle(card["closing_day"])

        # Busca saldo via card_id — separa completamente das transações de conta bancária
        sql_saldo = """
            SELECT
                COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0.0)
              - COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END), 0.0)
              AS saldo
            FROM transactions
            WHERE card_id = %(card_id)s
              AND deleted = FALSE
              AND data BETWEEN %(start_date)s AND %(end_date)s
        """
        params_saldo = {
            "card_id":    card["id"],
            "start_date": start_date,
            "end_date":   end_date,
        }
        rows = run_select(sql_saldo, params_saldo)
        divida = max(0.0, float(rows[0]["saldo"]) if rows else 0.0)

        if divida <= 0:
            return {"status": "ok", "card_name": card["name"], "message": "Sem dívida neste cartão",
                    "custo_total": 0.0, "meses_para_quitar": 0, "juros_total": 0.0, "divida_atual": 0.0}

        i = card["taxa_juros_mensal"]
        MIN_RATE = 0.15
        MIN_FLOOR = 50.0

        balance = divida
        juros_total = 0.0
        meses = 0

        while balance > 0.01 and meses < 360:
            meses += 1
            juros = balance * i
            balance += juros
            juros_total += juros
            payment = max(balance * MIN_RATE, MIN_FLOOR)
            balance = max(0.0, balance - payment)

        return {
            "status": "ok",
            "card_name": card["name"],
            "divida_atual": round(divida, 2),
            "meses_para_quitar": meses,
            "juros_total": round(juros_total, 2),
            "custo_total": round(divida + juros_total, 2),
            "message": (
                f"Pagando só o mínimo (15%): quita em {meses} meses "
                f"com R${juros_total:.2f} em juros (custo total: R${divida + juros_total:.2f})"
            ),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
