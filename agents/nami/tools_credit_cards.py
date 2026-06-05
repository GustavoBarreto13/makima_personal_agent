"""Ferramentas de tracker de cartões de crédito para o agente Nami.

Permite cadastrar cartões, monitorar dívida atual, registrar pagamentos
e simular cenários de quitação usando o Método Avalanche.

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import uuid
from agents.nami.tools import (
    _run_dml, _run_select, _table, _project,
    _match_account, _today, ACCOUNTS,
)
from google.cloud import bigquery


def register_credit_card(
    name: str,
    conta_key: str,
    limite: float,
    taxa_juros_mensal: float,
    closing_day: int,
    due_day: int,
    current_debt: float = 0.0,
    notes: str = "",
) -> dict:
    """Cadastra um cartão de crédito com suas informações e dívida inicial.

    Args:
        name: Nome do cartão (ex.: "Nubank")
        conta_key: Chave da conta em transactions (deve estar em ACCOUNTS)
        limite: Limite total do cartão em reais
        taxa_juros_mensal: Taxa de juros mensal (ex.: 0.15 para 15%)
        closing_day: Dia do fechamento da fatura (1-31)
        due_day: Dia do vencimento da fatura (1-31)
        current_debt: Dívida atual em reais (padrão: 0)
        notes: Observações opcionais

    Returns:
        Dicionário com "status": "ok" e id do cartão, ou "status": "error".
    """
    acc = _match_account(conta_key)
    if acc is None:
        return {"status": "error", "message": f"Conta inválida: '{conta_key}'. Opções: {', '.join(ACCOUNTS)}"}

    card_id = str(uuid.uuid4())

    sql = f"""
        INSERT INTO {_table("credit_cards")}
          (id, name, conta_key, limite, taxa_juros_mensal, closing_day, due_day,
           status, notes, created_at)
        VALUES (@id, @name, @conta_key, @limite, @taxa, @closing, @due,
                'ativo', @notes, CURRENT_TIMESTAMP())
    """
    params = [
        bigquery.ScalarQueryParameter("id", "STRING", card_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("conta_key", "STRING", acc),
        bigquery.ScalarQueryParameter("limite", "FLOAT64", float(limite)),
        bigquery.ScalarQueryParameter("taxa", "FLOAT64", float(taxa_juros_mensal)),
        bigquery.ScalarQueryParameter("closing", "INT64", int(closing_day)),
        bigquery.ScalarQueryParameter("due", "INT64", int(due_day)),
        bigquery.ScalarQueryParameter("notes", "STRING", notes or None),
    ]

    try:
        _run_dml(sql, params)
    except Exception as e:
        return {"status": "error", "message": str(e)}

    # Se há dívida inicial, registra como saldo_inicial em card_debt_entries
    if current_debt > 0:
        entry_id = str(uuid.uuid4())
        sql_entry = f"""
            INSERT INTO {_table("card_debt_entries")}
              (id, card_id, entry_date, tipo, valor, notes, created_at)
            VALUES (@id, @card_id, CURRENT_DATE(), 'saldo_inicial', @valor,
                    'Dívida inicial cadastrada', CURRENT_TIMESTAMP())
        """
        params_entry = [
            bigquery.ScalarQueryParameter("id", "STRING", entry_id),
            bigquery.ScalarQueryParameter("card_id", "STRING", card_id),
            bigquery.ScalarQueryParameter("valor", "FLOAT64", float(current_debt)),
        ]
        try:
            _run_dml(sql_entry, params_entry)
        except Exception as e:
            return {"status": "error", "message": f"Cartão criado mas erro ao registrar dívida: {e}"}

    return {
        "status": "ok",
        "id": card_id,
        "message": f"Cartão '{name}' cadastrado. Limite: R${limite:.2f}, Dívida inicial: R${current_debt:.2f}",
    }


def get_card_debt_summary() -> dict:
    """Retorna dívida atual de cada cartão ativo e total consolidado.

    Returns:
        Dicionário com lista de cartões, dívida e utilização de cada um, e totais.
    """
    sql_cards = f"""
        SELECT id, name, conta_key, limite, taxa_juros_mensal, closing_day, due_day
        FROM {_table("credit_cards")}
        WHERE status = 'ativo'
    """

    sql_balances = f"""
        SELECT card_id, SUM(valor) AS saldo
        FROM {_table("card_debt_entries")}
        GROUP BY card_id
    """

    try:
        cards = _run_select(sql_cards)
        balances = _run_select(sql_balances)

        balance_map = {b["card_id"]: b["saldo"] for b in balances}

        result = []
        total_divida = 0.0
        total_limite = 0.0

        for card in cards:
            divida = max(0.0, balance_map.get(card["id"], 0.0))
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

    Args:
        card_id: ID do cartão (retornado por register_credit_card)
        valor: Valor pago em reais (positivo — será armazenado como negativo)
        data: Data do pagamento no formato AAAA-MM-DD (padrão: hoje)

    Returns:
        Dicionário com "status": "ok" ou "status": "error".
    """
    entry_id = str(uuid.uuid4())
    entry_date = data or _today()

    sql = f"""
        INSERT INTO {_table("card_debt_entries")}
          (id, card_id, entry_date, tipo, valor, notes, created_at)
        VALUES (@id, @card_id, @entry_date, 'pagamento', @valor, NULL, CURRENT_TIMESTAMP())
    """
    # Valor negativo porque pagamento REDUZ a dívida
    params = [
        bigquery.ScalarQueryParameter("id", "STRING", entry_id),
        bigquery.ScalarQueryParameter("card_id", "STRING", card_id),
        bigquery.ScalarQueryParameter("entry_date", "DATE", entry_date),
        bigquery.ScalarQueryParameter("valor", "FLOAT64", -abs(float(valor))),
    ]

    try:
        _run_dml(sql, params)
        return {"status": "ok", "message": f"Pagamento de R${abs(valor):.2f} registrado"}
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

    # Ordena pelo maior juros primeiro (Método Avalanche)
    cards_sorted = sorted(cards, key=lambda c: c["taxa_juros_mensal"], reverse=True)

    balances = {c["id"]: c["divida_atual"] for c in cards_sorted}
    rates = {c["id"]: c["taxa_juros_mensal"] for c in cards_sorted}
    juros_total = 0.0
    meses = 0

    while sum(balances.values()) > 0.01 and meses < 360:
        meses += 1
        payment_left = monthly_payment

        # Aplica juros mensais em todos os cartões com saldo
        for cid in balances:
            if balances[cid] > 0:
                juros = balances[cid] * rates[cid]
                balances[cid] += juros
                juros_total += juros

        # Paga em ordem Avalanche (maior taxa primeiro)
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
    sql_card = f"SELECT * FROM {_table('credit_cards')} WHERE id = @id AND status = 'ativo'"
    params = [bigquery.ScalarQueryParameter("id", "STRING", card_id)]

    try:
        cards = _run_select(sql_card, params)
        if not cards:
            return {"status": "error", "message": f"Cartão não encontrado: {card_id}"}

        card = cards[0]

        sql_bal = f"""
            SELECT COALESCE(SUM(valor), 0) AS saldo
            FROM {_table("card_debt_entries")}
            WHERE card_id = @id
        """
        bals = _run_select(sql_bal, params)
        divida = max(0.0, float(bals[0]["saldo"]) if bals else 0.0)

        if divida <= 0:
            return {"status": "ok", "card_name": card["name"], "message": "Sem dívida neste cartão",
                    "custo_total": 0.0, "meses_para_quitar": 0, "juros_total": 0.0, "divida_atual": 0.0}

        i = card["taxa_juros_mensal"]
        MIN_RATE = 0.15   # mínimo = 15% do saldo (regra padrão Brasil)
        MIN_FLOOR = 50.0  # piso mínimo em reais

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
