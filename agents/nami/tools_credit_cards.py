"""Ferramentas de tracker de cartões de crédito para o agente Nami.

Permite cadastrar cartões, monitorar dívida atual, registrar pagamentos
e simular cenários de quitação usando o Método Avalanche.

Arquitetura: `transactions` é a fonte da verdade para saldo de cartões.
- Dívida inicial → transação tipo Despesa na conta do cartão
- Pagamento de fatura → transferência conta→cartão (spec 071), não receita
- Dívida = SUM(Despesas) − SUM(Receitas) − SUM(Transferências recebidas) via card_id, acumulada

A tabela `credit_cards` guarda apenas metadados (limite, taxa, dias de fechamento)
e vincula ao cadastro em `accounts` via account_id (FK lógica).

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import uuid
from calendar import monthrange
from datetime import date, timedelta

# Importa os helpers PostgreSQL compartilhados
from agents.db import run_select, run_dml
from agents.nami.tools import (
    _resolve_account,
    _invalidate_cards_cache,
    _insert_transfer_pair,
    _today,
    _today_date,
    _touch_calendar,
    create_transaction,
)
from agents.db import get_conn


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
    # Hoje no fuso de São Paulo — date.today() seria a data UTC do servidor
    from agents.nami.tools import _today_date
    today = _today_date()

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


def _card_debt(card_id: str) -> float:
    """Dívida acumulada do cartão até hoje, em reais (nunca negativa).

    Soma tudo que já aconteceu no cartão, não só o ciclo corrente: uma fatura fechada e
    ainda não paga continua devida, e um pagamento de fatura anterior só abate o que
    realmente devia. Compras com data futura (parcelas) ficam de fora até chegarem.
      + Despesa                       → aumenta a dívida
      − Receita                       → estorno/crédito (e pagamentos legados, pré-spec 071)
      − Transferencia (valor positivo) → pagamento de fatura vindo de uma conta
    """
    rows = run_select(
        """
        SELECT COALESCE(SUM(CASE WHEN tipo = 'Despesa'       THEN  valor
                                 WHEN tipo = 'Receita'       THEN -valor
                                 WHEN tipo = 'Transferencia' THEN -valor
                                 ELSE 0 END), 0.0) AS saldo
        FROM transactions
        WHERE card_id = %(card_id)s
          AND deleted = FALSE
          AND data <= %(today)s
        """,
        {"card_id": card_id, "today": _today()},
    )
    return max(0.0, float(rows[0]["saldo"]) if rows else 0.0)


# ─── Faturas (derivadas — sem tabela nova) ────────────────────────────────────

def _clamp_day(year: int, month: int, day: int) -> date:
    """Data com o dia ajustado ao último dia do mês (dia 31 em abril → 30)."""
    return date(year, month, min(day, monthrange(year, month)[1]))


def _add_months(year: int, month: int, k: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + k
    return idx // 12, idx % 12 + 1


def _invoice_key(d: date, closing_day: int) -> tuple[int, int]:
    """(ano, mês) do fechamento da fatura que recebe uma compra feita em `d`.

    Compra até o dia de fechamento (inclusive) cai na fatura que fecha neste mês; depois
    dele, na que fecha no mês seguinte.
    """
    if d <= _clamp_day(d.year, d.month, closing_day):
        return d.year, d.month
    return _add_months(d.year, d.month, 1)


def _invoice_dates(key: tuple[int, int], closing_day: int, due_day: int) -> tuple[date, date, date]:
    """(início, fechamento, vencimento) da fatura que fecha no mês `key`.

    O vencimento cai no mesmo mês do fechamento se o dia dele for maior que o do fechamento
    (fecha dia 6, vence dia 13) e no mês seguinte caso contrário (fecha dia 25, vence dia 5).
    """
    y, m = key
    closing = _clamp_day(y, m, closing_day)
    py, pm = _add_months(y, m, -1)
    start = _clamp_day(py, pm, closing_day) + timedelta(days=1)
    dy, dm = (y, m) if due_day > closing_day else _add_months(y, m, 1)
    return start, closing, _clamp_day(dy, dm, due_day)


def build_invoices(
    purchases: list[dict],
    payments_total: float,
    closing_day: int,
    due_day: int,
    today: date,
    months_ahead: int = 3,
) -> list[dict]:
    """Monta as faturas do cartão a partir das compras e dos pagamentos — função pura.

    Cada compra (`valor`, `data`) cai numa fatura pelo dia de fechamento. Os pagamentos não
    são ligados a uma fatura específica: são aplicados da mais antiga para a mais nova (o
    que o banco faz na prática), então o que sobra em aberto soma exatamente a dívida.

    Retorna, em ordem de fechamento: as 2 faturas anteriores à atual, as não pagas mais
    antigas (fechadas/atrasadas), a atual e as `months_ahead` seguintes. Cada fatura traz
    id ("AAAA-MM" do fechamento), start/closing/due (ISO), total, pago, restante, status
    (paga | aberta | fechada | atrasada | futura) e `items` (as compras).
    """
    by_key: dict[tuple[int, int], list[dict]] = {}
    for p in purchases:
        by_key.setdefault(_invoice_key(p["data"], closing_day), []).append(p)

    current = _invoice_key(today, closing_day)
    keys = sorted(set(by_key) | {current})

    remaining = max(0.0, float(payments_total))
    out = []
    for key in keys:
        items = sorted(by_key.get(key, []), key=lambda p: (p["data"], p["name"]))
        total = round(sum(float(p["valor"]) for p in items), 2)
        pago = round(min(remaining, total), 2)
        remaining -= pago
        restante = round(total - pago, 2)
        start, closing, due = _invoice_dates(key, closing_day, due_day)

        if total > 0 and restante < 0.005:
            status = "paga"
        elif start > today:
            status = "futura"
        elif today <= closing:
            status = "aberta"
        elif today > due:
            status = "atrasada"
        else:
            status = "fechada"

        out.append({
            "id": f"{key[0]}-{key[1]:02d}",
            "start": start.isoformat(), "closing": closing.isoformat(), "due": due.isoformat(),
            "total": total, "pago": pago, "restante": restante, "status": status,
            "items": [
                {"id": p.get("id"), "name": p["name"], "valor": float(p["valor"]),
                 "data": p["data"].isoformat(), "parcelada": bool(p.get("installment_group_id"))}
                for p in items
            ],
        })

    lo = _add_months(*current, -2)
    hi = _add_months(*current, months_ahead)
    return [
        inv for inv in out
        if inv["status"] in ("fechada", "atrasada")
        or lo <= (int(inv["id"][:4]), int(inv["id"][5:])) <= hi
    ]


def get_card_invoices(card_id: str, months: int = 3) -> dict:
    """Faturas do cartão: a atual, as anteriores ainda em aberto e as próximas já comprometidas.

    As faturas são derivadas das transações (`card_id`) e dos dias de fechamento/vencimento do
    cartão; não existe tabela de faturas. Compras parceladas aparecem na fatura certa de cada
    mês porque cada parcela é uma transação datada (spec 071).

    Args:
        card_id: ID do cartão.
        months: Quantas faturas futuras incluir além da atual (padrão 3).

    Returns:
        {"status": "ok", "card": {id, name, limite, closing_day, due_day, divida_atual,
        limite_disponivel}, "invoices": [...]} — ver `build_invoices`.
    """
    try:
        cards = run_select(
            """
            SELECT id, name, limite, closing_day, due_day
              FROM credit_cards WHERE id = %(id)s AND status = 'ativo'
            """,
            {"id": card_id},
        )
        if not cards:
            return {"status": "error", "message": f"Cartão não encontrado: {card_id}"}
        card = cards[0]

        today = _today_date()
        rows = run_select(
            """
            SELECT id, name, valor, tipo, data, installment_group_id
              FROM transactions
             WHERE card_id = %(id)s AND deleted = FALSE
             ORDER BY data
            """,
            {"id": card_id},
        )
        for r in rows:
            if isinstance(r["data"], str):
                r["data"] = date.fromisoformat(r["data"])

        purchases = [r for r in rows if r["tipo"] == "Despesa"]
        # Pagamentos (transferência recebida) e créditos/estornos legados (Receita) abatem a dívida;
        # o que tem data futura ainda não aconteceu.
        payments_total = sum(
            float(r["valor"]) for r in rows
            if r["tipo"] in ("Transferencia", "Receita") and r["data"] <= today
        )
        invoices = build_invoices(
            purchases, payments_total, int(card["closing_day"]), int(card["due_day"]), today, months,
        )
        divida = _card_debt(card_id)
        limite = float(card["limite"] or 0)
        return {
            "status": "ok",
            "card": {
                "id": card["id"], "name": card["name"], "limite": limite,
                "closing_day": int(card["closing_day"]), "due_day": int(card["due_day"]),
                "divida_atual": round(divida, 2),
                "limite_disponivel": round(max(0.0, limite - divida), 2),
            },
            "invoices": invoices,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


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

    # Espelho Calendar Hub → Google Calendar (spec 069): vencimento do cartão vira
    # evento recorrente mensal em "Nami — Finanças" — reconcilia (best-effort).
    try:
        from agents.nami.tools import _touch_calendar as _tc
        _tc()
    except Exception:
        pass

    return {
        "status": "ok",
        "id": card_id,
        "message": f"Cartão '{name}' cadastrado. Limite: R${limite:.2f}, Dívida inicial: R${current_debt:.2f}",
    }


def update_credit_card(
    card_id: str,
    name: str = "",
    limite: float = None,
    taxa_juros_mensal: float = None,
    closing_day: int = None,
    due_day: int = None,
    notes: str = "",
) -> dict:
    """Atualiza campos de um cartão de crédito existente.

    Só altera os campos informados (não-vazios / não-None).

    Args:
        card_id: ID do cartão a ser atualizado.
        name: Novo nome do cartão (opcional).
        limite: Novo limite em reais (opcional).
        taxa_juros_mensal: Nova taxa mensal decimal, ex.: 0.15 para 15% (opcional).
        closing_day: Novo dia de fechamento da fatura 1–31 (opcional).
        due_day: Novo dia de vencimento 1–31 (opcional).
        notes: Novas observações (opcional).

    Returns:
        Dicionário com "status": "ok" ou "status": "error".
    """
    sets = ["updated_at = NOW()"]
    params = {"id": card_id}

    if name:
        sets.append("name = %(name)s")
        params["name"] = name

    if limite is not None:
        sets.append("limite = %(limite)s")
        params["limite"] = float(limite)

    if taxa_juros_mensal is not None:
        sets.append("taxa_juros_mensal = %(taxa)s")
        params["taxa"] = float(taxa_juros_mensal)

    if closing_day is not None:
        sets.append("closing_day = %(closing_day)s")
        params["closing_day"] = int(closing_day)

    if due_day is not None:
        sets.append("due_day = %(due_day)s")
        params["due_day"] = int(due_day)

    if notes:
        sets.append("notes = %(notes)s")
        params["notes"] = notes

    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    sql = f"UPDATE credit_cards SET {', '.join(sets)} WHERE id = %(id)s AND status = 'ativo'"
    try:
        affected = run_dml(sql, params)
        if affected == 0:
            return {"status": "error", "message": f"Cartão não encontrado ou inativo: {card_id}"}
        # Invalida o cache para refletir o novo nome se foi alterado
        _invalidate_cards_cache()
        # Espelho Calendar Hub → Google Calendar (spec 069) — vencimento pode ter mudado
        try:
            from agents.nami.tools import _touch_calendar as _tc
            _tc()
        except Exception:
            pass
        return {"status": "ok", "message": "Cartão atualizado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_credit_card(card_id: str) -> dict:
    """Encerra um cartão de crédito (soft deactivate — muda status para 'encerrado').

    Mantém o histórico de transações vinculadas ao cartão intacto.
    O cartão some de get_card_debt_summary() mas os dados permanecem para auditoria.

    Args:
        card_id: ID do cartão a ser encerrado.

    Returns:
        Dicionário com "status": "ok" ou "status": "error".
    """
    # Busca nome antes de encerrar para confirmação
    card_rows = run_select(
        "SELECT name FROM credit_cards WHERE id = %(id)s AND status = 'ativo'",
        {"id": card_id},
    )
    if not card_rows:
        return {"status": "error", "message": f"Cartão não encontrado ou já encerrado: {card_id}"}

    nome = card_rows[0]["name"]

    sql = "UPDATE credit_cards SET status = 'encerrado', updated_at = NOW() WHERE id = %(id)s"
    try:
        run_dml(sql, {"id": card_id})
        _invalidate_cards_cache()
        try:
            from agents.nami.tools import _touch_calendar as _tc
            _tc()
        except Exception:
            pass
        return {
            "status": "ok",
            "message": f"Cartão '{nome}' encerrado. Histórico de transações preservado.",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


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
            divida = _card_debt(card["id"])

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


def register_card_payment(card_id: str, valor: float, data: str = "", from_account: str = "") -> dict:
    """Registra o pagamento de uma fatura de cartão de crédito.

    Pagar fatura é MOVER dinheiro, não ganhar: grava uma transferência atômica da conta
    que paga o cartão (a vinculada em `credit_cards.account_id`, ou `from_account` se
    informada) para o cartão. O saldo da conta cai, a dívida do cartão cai e nada disso
    entra como receita/despesa (spec 071). Antes era gravado como Receita no cartão, o que
    inflava a renda do mês e nunca debitava a conta bancária.

    Args:
        card_id: ID do cartão (retornado por register_credit_card)
        valor: Valor pago em reais (positivo)
        data: Data do pagamento no formato AAAA-MM-DD (padrão: hoje)
        from_account: Conta de onde sai o dinheiro (padrão: a conta vinculada ao cartão)

    Returns:
        Dicionário com "status": "ok" (e "transfer_id") ou "status": "error".
    """
    if valor <= 0:
        return {"status": "error", "message": "Valor do pagamento deve ser positivo"}

    sql_card = """
        SELECT cc.id, cc.name, cc.account_id, a.name AS conta
        FROM credit_cards cc
        JOIN accounts a ON a.id = cc.account_id
        WHERE cc.id = %(id)s AND cc.status = 'ativo'
    """

    try:
        cards = run_select(sql_card, {"id": card_id})
        if not cards:
            return {"status": "error", "message": f"Cartão não encontrado: {card_id}"}
        card = cards[0]

        if from_account:
            origin = _resolve_account(from_account)
            if origin is None:
                return {"status": "error", "message": f"Conta de origem não encontrada: '{from_account}'"}
        else:
            origin = {"id": card["account_id"], "name": card["conta"]}

        with get_conn() as conn:
            with conn.cursor() as cur:
                transfer_id = _insert_transfer_pair(
                    cur,
                    origin=origin, dest={"id": card["id"], "name": card["name"]}, dest_is_card=True,
                    valor=valor, data=data or _today(), notes="",
                    names=(f"Pagamento fatura — {card['name']}", f"Pagamento recebido — {card['name']}"),
                )
        _touch_calendar()
        return {
            "status": "ok", "transfer_id": transfer_id,
            "message": f"Pagamento de R${valor:.2f} do {card['name']} saiu de {origin['name']}",
        }
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
        divida = _card_debt(card["id"])

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
