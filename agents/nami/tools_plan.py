"""Plano do mês da Nami — "quanto ainda posso gastar" (spec 070).

A conta da tela inicial:

    livre = renda (recebida + que ainda vai entrar)
          − gasto já realizado (despesas até hoje, inclusive as no cartão)
          − o que já está agendado (parcelas com data futura no mês)
          − contas fixas e assinaturas ainda pendentes

Transferências e pagamento de fatura ficam de fora: são movimentação de dinheiro, não gasto.
Compra no cartão conta no dia da compra, então a fatura não é descontada de novo.

Usage:
    from agents.nami.tools_plan import get_month_plan
"""

from calendar import monthrange
from datetime import date, timedelta

from agents.db import run_select
from agents.nami.tools import (
    _cycle_due_date,
    _today_date,
    get_recurring_status,
    list_subscriptions,
)

# "A pagar": contas e faturas que vencem nos próximos N dias (as atrasadas entram sempre)
A_PAGAR_DIAS = 10


def compute_plan(
    renda_recebida: float,
    renda_pendente: float,
    gasto: float,
    agendado: float,
    pendente: float,
    dias_restantes: int,
) -> dict:
    """Aritmética do plano do mês — função pura, sem banco.

    Args:
        renda_recebida: entradas já lançadas no mês.
        renda_pendente: entradas recorrentes (ou agendadas) que ainda vão cair.
        gasto: despesas já realizadas no mês.
        agendado: despesas com data futura dentro do mês (parcelas).
        pendente: contas fixas/assinaturas ainda não pagas.
        dias_restantes: dias do mês que faltam, contando hoje (0 fora do mês corrente).

    Returns:
        livre (pode ser negativo), livre_por_dia (None fora do mês corrente), `estourou` e os
        três segmentos da barra (gasto / a_sair / livre) já somando a renda total.
    """
    renda_total = renda_recebida + renda_pendente
    a_sair = agendado + pendente
    livre = renda_total - gasto - a_sair
    return {
        "renda_total": round(renda_total, 2),
        "a_sair": round(a_sair, 2),
        "livre": round(livre, 2),
        "livre_por_dia": round(max(livre, 0.0) / dias_restantes, 2) if dias_restantes > 0 else None,
        "estourou": livre < 0,
        "barra": {
            "gasto": round(gasto, 2),
            "a_sair": round(a_sair, 2),
            "livre": round(max(livre, 0.0), 2),
        },
    }


def _expected_recurring(items: list[dict], year: int, month: int) -> tuple[float, float]:
    """(despesas, rendas) recorrentes esperadas num mês futuro — função pura.

    Mensais contam todo mês; anuais só no mês do `next_billing`. Usada só para meses que
    ainda não começaram (no mês corrente vale o status real de pago/pendente).
    """
    despesas = rendas = 0.0
    for it in items:
        if it["ciclo"] == "anual":
            nb = it.get("next_billing")
            if not nb or date.fromisoformat(nb).month != month:
                continue
        if it.get("kind") == "renda":
            rendas += float(it["valor"])
        else:
            despesas += float(it["valor"])
    return despesas, rendas


def _a_pagar(recurring_items: list[dict], today: date) -> list[dict]:
    """Contas fixas, assinaturas e faturas de cartão a pagar nos próximos dias."""
    horizonte = today + timedelta(days=A_PAGAR_DIAS)
    out: list[dict] = []

    for it in recurring_items:
        if it.get("kind") == "renda" or it.get("cycle_status") not in ("pendente", "atrasada"):
            continue
        due = _cycle_due_date(it, today)
        if due is None or (it["cycle_status"] != "atrasada" and due > horizonte):
            continue
        out.append({
            "kind": "conta" if it.get("kind") == "conta_fixa" else "assinatura",
            "id": it["id"], "name": it["name"], "valor": round(float(it["valor"]), 2),
            "due": due.isoformat(), "status": it["cycle_status"],
        })

    # Faturas já fechadas e não pagas (a fatura aberta ainda não tem valor final)
    from agents.nami.tools_credit_cards import get_card_invoices

    for card in run_select("SELECT id, name FROM credit_cards WHERE status = 'ativo' ORDER BY name"):
        res = get_card_invoices(card["id"], months=0)
        if res.get("status") != "ok":
            continue
        for inv in res["invoices"]:
            if inv["status"] not in ("fechada", "atrasada") or inv["restante"] <= 0:
                continue
            due = date.fromisoformat(inv["due"])
            if inv["status"] != "atrasada" and due > horizonte:
                continue
            out.append({
                "kind": "fatura", "id": card["id"], "name": f"Fatura {card['name']}",
                "valor": inv["restante"], "due": inv["due"],
                "status": "atrasada" if inv["status"] == "atrasada" else "pendente",
                "invoice": inv["id"],
            })

    return sorted(out, key=lambda x: (x["due"], x["name"]))


def get_month_plan(month: str = "") -> dict:
    """Plano do mês: quanto da renda já foi, quanto ainda vai sair e quanto está livre.

    Args:
        month: Mês "AAAA-MM" (vazio = mês corrente, no fuso America/Sao_Paulo). Meses
            passados mostram o que aconteceu; meses futuros, o que já está comprometido.

    Returns:
        {"status": "ok", "month", "is_current", renda_recebida, renda_pendente, gasto,
        agendado, pendente, livre, livre_por_dia, dias_restantes, estourou, barra,
        saldo_contas, a_pagar: [...], top_categorias: [{categoria, total, pct}]}.
        `a_pagar` e `livre_por_dia` só existem para o mês corrente.
    """
    today = _today_date()
    if month:
        try:
            year, m = int(month[:4]), int(month[5:7])
            start = date(year, m, 1)
        except (ValueError, IndexError):
            return {"status": "error", "message": "month deve ser AAAA-MM"}
    else:
        year, m = today.year, today.month
        start = date(year, m, 1)
    end = date(year, m, monthrange(year, m)[1])
    cur_key = (today.year, today.month)
    is_current = (year, m) == cur_key
    is_future = (year, m) > cur_key

    try:
        tot = run_select(
            """
            SELECT
              COALESCE(SUM(CASE WHEN tipo = 'Receita' AND card_id IS NULL AND data <= %(today)s THEN valor ELSE 0 END), 0) AS renda_recebida,
              COALESCE(SUM(CASE WHEN tipo = 'Receita' AND card_id IS NULL AND data >  %(today)s THEN valor ELSE 0 END), 0) AS renda_agendada,
              COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND data <= %(today)s THEN valor ELSE 0 END), 0) AS gasto,
              COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND data >  %(today)s THEN valor ELSE 0 END), 0) AS agendado
              FROM transactions
             WHERE deleted = FALSE AND data BETWEEN %(start)s AND %(end)s
            """,
            {"today": today, "start": start, "end": end},
        )[0]
        renda_recebida = float(tot["renda_recebida"])
        renda_pendente = float(tot["renda_agendada"])
        gasto = float(tot["gasto"])
        agendado = float(tot["agendado"])

        pendente = 0.0
        a_pagar: list[dict] = []
        if is_current:
            status = get_recurring_status(status="ativa")
            if status.get("status") != "ok":
                return status
            for it in status["items"]:
                if it["cycle_status"] in ("pendente", "atrasada") and it.get("kind") != "renda":
                    pendente += float(it["valor"])
            renda_pendente += float(status.get("renda_pendente", 0))
            a_pagar = _a_pagar(status["items"], today)
        elif is_future:
            subs = list_subscriptions(status="ativa")
            if subs.get("status") != "ok":
                return subs
            desp, rend = _expected_recurring(subs["subscriptions"], year, m)
            pendente, renda_pendente = pendente + desp, renda_pendente + rend

        dias_restantes = (end - today).days + 1 if is_current else 0
        plan = compute_plan(renda_recebida, renda_pendente, gasto, agendado, pendente, dias_restantes)

        cats = run_select(
            """
            SELECT categoria, SUM(valor) AS total
              FROM transactions
             WHERE deleted = FALSE AND tipo = 'Despesa'
               AND data BETWEEN %(start)s AND %(end)s AND data <= %(today)s
             GROUP BY categoria ORDER BY total DESC LIMIT 5
            """,
            {"start": start, "end": end, "today": today},
        )
        top = [
            {"categoria": c["categoria"], "total": round(float(c["total"]), 2),
             "pct": round(float(c["total"]) / gasto * 100, 1) if gasto > 0 else 0.0}
            for c in cats
        ]

        saldo_contas = None
        try:
            from agents.nami.tools_accounts import get_accounts_overview
            ov = get_accounts_overview()
            saldo_contas = ov["saldo_total"] if ov.get("status") == "ok" else None
        except Exception:
            pass  # o plano não depende do saldo — falha isolada

        return {
            "status": "ok",
            "month": f"{year}-{m:02d}",
            "is_current": is_current,
            "renda_recebida": round(renda_recebida, 2),
            "renda_pendente": round(renda_pendente, 2),
            "gasto": round(gasto, 2),
            "agendado": round(agendado, 2),
            "pendente": round(pendente, 2),
            "dias_restantes": dias_restantes,
            **plan,
            "saldo_contas": saldo_contas,
            "a_pagar": a_pagar,
            "top_categorias": top,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
