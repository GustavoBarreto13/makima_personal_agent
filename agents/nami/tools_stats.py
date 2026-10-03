"""Resumo/Rewind de finanças da Nami no contrato `StatsPayload` do Design System (spec 071).

Alimenta a tela "Resumo": KPIs com delta contra o mesmo período do ano anterior, gasto por mês
e por dia, ranking de categorias, recordes e patrimônio líquido real. Respeita as regras de
correção do padrão (webapp/docs/DESIGN_SYSTEM.md):
  - itens apagados fora da conta;
  - renda = Receita em conta (Receita em cartão é estorno, não renda); transferência e
    pagamento de fatura ficam fora de tudo;
  - ano em andamento compara com o MESMO trecho do ano anterior, não com o ano fechado.

Usage:
    from agents.nami.tools_stats import get_stats_payload
"""

from datetime import date

from agents.db import run_select
from agents.nami.tools import _today_date

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]


def _brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def period_bounds(year: int, month: int | None, today: date) -> tuple[date, date, date, date]:
    """(início, fim, início_anterior, fim_anterior) do período e do mesmo trecho do ano anterior.

    Mês: o mês inteiro. Ano corrente sem mês: de 1º/jan até hoje (o anterior vai até o mesmo
    dia/mês); ano passado: o ano todo. Se hoje é 29/fev e o ano anterior não é bissexto, o corte
    vira 28/fev.
    """
    from calendar import monthrange

    def _last(y: int, m: int) -> date:
        return date(y, m, monthrange(y, m)[1])

    if month:
        return date(year, month, 1), _last(year, month), date(year - 1, month, 1), _last(year - 1, month)

    if year == today.year:
        end = today
        prev_end = date(year - 1, today.month, min(today.day, monthrange(year - 1, today.month)[1]))
    else:
        end, prev_end = date(year, 12, 31), date(year - 1, 12, 31)
    return date(year, 1, 1), end, date(year - 1, 1, 1), prev_end


def savings_rate(income: float, expense: float) -> float:
    """Taxa de poupança em % — (renda − gasto) / renda; 0 quando não houve renda."""
    return round((income - expense) / income * 100, 1) if income > 0 else 0.0


def build_stats_payload(
    *,
    year: int,
    month: int | None,
    totals: dict,
    prev_totals: dict,
    monthly: list[dict],
    daily: list[dict],
    categories: list[dict],
    biggest_expense: dict | None,
    biggest_income: dict | None,
    net_worth: dict,
) -> dict:
    """Monta o StatsPayload a partir de números já consultados — função pura, sem banco.

    Args:
        totals / prev_totals: {income, expense} do período e do mesmo trecho do ano anterior.
        monthly: [{month (1-12), income, expense}] do ano (meses sem movimento podem faltar).
        daily: [{date (ISO), value}] de despesa do ano (só dias com gasto).
        categories: [{categoria, total, count}] de despesa no período, maior primeiro.
        biggest_expense / biggest_income: {name, valor, data} ou None.
        net_worth: {saldo_contas, divida_cartoes, patrimonio_liquido}.
    """
    income, expense = totals["income"], totals["expense"]
    prev_income, prev_expense = prev_totals["income"], prev_totals["expense"]
    has_prev = (prev_income + prev_expense) > 0   # sem histórico no ano anterior → sem delta

    label = f"{MESES[month - 1]} de {year}" if month else str(year)
    prev_label = f"{MESES[month - 1]} de {year - 1}" if month else str(year - 1)

    kpis = [
        {"key": "income", "label": "Receitas", "value": round(income, 2), "prefix": "R$ ", "decimals": 0,
         "prev": round(prev_income, 2) if has_prev else None},
        {"key": "expense", "label": "Despesas", "value": round(expense, 2), "prefix": "R$ ", "decimals": 0,
         "prev": round(prev_expense, 2) if has_prev else None},
        {"key": "net", "label": "Saldo do período", "value": round(income - expense, 2), "prefix": "R$ ",
         "decimals": 0, "prev": round(prev_income - prev_expense, 2) if has_prev else None},
        {"key": "savings_rate", "label": "Taxa de poupança", "value": savings_rate(income, expense),
         "unit": "%", "decimals": 0, "absoluteDelta": True,
         "prev": savings_rate(prev_income, prev_expense) if has_prev else None},
        {"key": "net_worth", "label": "Patrimônio líquido", "value": round(net_worth["patrimonio_liquido"], 2),
         "prefix": "R$ ", "decimals": 0, "prev": None},
    ]

    by_month = {r["month"]: r for r in monthly}
    monthly_expense = [{"month": m, "value": round(by_month.get(m, {}).get("expense", 0.0), 2)} for m in range(1, 13)]
    monthly_income = [{"month": m, "value": round(by_month.get(m, {}).get("income", 0.0), 2)} for m in range(1, 13)]

    records = []
    if biggest_expense:
        records.append({"label": "Maior gasto", "value": _brl(biggest_expense["valor"]),
                        "detail": f"{biggest_expense['name']} · {biggest_expense['data'][8:]}/{biggest_expense['data'][5:7]}"})
    if biggest_income:
        records.append({"label": "Maior entrada", "value": _brl(biggest_income["valor"]),
                        "detail": f"{biggest_income['name']} · {biggest_income['data'][8:]}/{biggest_income['data'][5:7]}"})
    in_period = [d for d in daily if (not month) or d["date"][5:7] == f"{month:02d}"]
    if in_period:
        top_day = max(in_period, key=lambda d: d["value"])
        records.append({"label": "Dia mais caro", "value": _brl(top_day["value"]),
                        "detail": f"{top_day['date'][8:]}/{top_day['date'][5:7]}/{top_day['date'][:4]}"})
    saved = [(m, r["income"] - r["expense"]) for m, r in by_month.items() if r["income"] > 0]
    if saved and not month:
        best_m, best_v = max(saved, key=lambda x: x[1])
        if best_v > 0:
            records.append({"label": "Mês que mais sobrou", "value": _brl(best_v), "detail": MESES[best_m - 1]})

    return {
        "period": {"year": year, "month": month, "label": label},
        "previous": {"label": prev_label} if has_prev else None,
        "kpis": kpis,
        "daily": daily,
        "monthly": monthly_expense,
        "monthlyUnit": "R$",
        "distribution": [],
        "rankings": {
            "top_categories": {
                "title": "Onde mais gastei",
                # `count` = nº de lançamentos; `total` = reais (a lista ordena por total)
                "items": [{"label": c["categoria"], "count": int(c["count"]), "total": round(float(c["total"]), 2)}
                          for c in categories[:8]],
            },
        },
        "records": records,
        "moments": [],
        # extensões do domínio (o StatsPage ignora; a tela da Nami usa)
        "monthly_income": monthly_income,
        "net_worth": net_worth,
    }


def _period_totals(start: date, end: date) -> dict:
    row = run_select(
        """
        SELECT COALESCE(SUM(CASE WHEN tipo = 'Receita' AND card_id IS NULL THEN valor ELSE 0 END), 0) AS income,
               COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) AS expense
          FROM transactions
         WHERE deleted = FALSE AND data BETWEEN %(start)s AND %(end)s
        """,
        {"start": start, "end": end},
    )[0]
    return {"income": float(row["income"]), "expense": float(row["expense"])}


def get_stats_payload(year: int = 0, month: int | None = None) -> dict:
    """Estatísticas de finanças de um ano (ou de um mês dele) no contrato `StatsPayload`.

    Args:
        year: Ano (0 = ano corrente em America/Sao_Paulo).
        month: Mês 1-12 para fechar o foco num mês; None = ano inteiro.

    Returns:
        {"status": "ok", **StatsPayload} ou {"status": "error", "message": ...}.
    """
    today = _today_date()
    year = year or today.year
    if month is not None and not 1 <= month <= 12:
        return {"status": "error", "message": "month deve estar entre 1 e 12"}

    try:
        start, end, prev_start, prev_end = period_bounds(year, month, today)
        totals = _period_totals(start, end)
        prev_totals = _period_totals(prev_start, prev_end)

        monthly = [
            {"month": int(r["m"]), "income": float(r["income"]), "expense": float(r["expense"])}
            for r in run_select(
                """
                SELECT EXTRACT(MONTH FROM data)::int AS m,
                       COALESCE(SUM(CASE WHEN tipo = 'Receita' AND card_id IS NULL THEN valor ELSE 0 END), 0) AS income,
                       COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) AS expense
                  FROM transactions
                 WHERE deleted = FALSE AND data BETWEEN %(start)s AND %(end)s
                 GROUP BY 1
                """,
                {"start": date(year, 1, 1), "end": date(year, 12, 31)},
            )
        ]
        daily = [
            {"date": r["day"], "value": round(float(r["total"]), 2)}
            for r in run_select(
                """
                SELECT data::text AS day, SUM(valor) AS total
                  FROM transactions
                 WHERE deleted = FALSE AND tipo = 'Despesa' AND data BETWEEN %(start)s AND %(end)s
                 GROUP BY data ORDER BY data
                """,
                {"start": date(year, 1, 1), "end": date(year, 12, 31)},
            )
        ]
        categories = run_select(
            """
            SELECT categoria, SUM(valor) AS total, COUNT(*) AS count
              FROM transactions
             WHERE deleted = FALSE AND tipo = 'Despesa' AND data BETWEEN %(start)s AND %(end)s
             GROUP BY categoria ORDER BY total DESC
            """,
            {"start": start, "end": end},
        )

        def _biggest(tipo: str) -> dict | None:
            only_account = "AND card_id IS NULL" if tipo == "Receita" else ""   # Receita em cartão é estorno
            rows = run_select(
                f"""
                SELECT name, valor, data::text AS data FROM transactions
                 WHERE deleted = FALSE AND tipo = %(tipo)s {only_account}
                   AND data BETWEEN %(start)s AND %(end)s
                 ORDER BY valor DESC LIMIT 1
                """,
                {"tipo": tipo, "start": start, "end": end},
            )
            return {"name": rows[0]["name"], "valor": float(rows[0]["valor"]), "data": rows[0]["data"]} if rows else None

        from agents.nami.tools_accounts import get_accounts_overview
        from agents.nami.tools_credit_cards import get_card_debt_summary

        ov = get_accounts_overview()
        saldo = float(ov.get("saldo_total", 0) or 0) if ov.get("status") == "ok" else 0.0
        debt = get_card_debt_summary()
        divida = float(debt.get("total_divida", 0) or 0) if debt.get("status") == "ok" else 0.0

        payload = build_stats_payload(
            year=year, month=month, totals=totals, prev_totals=prev_totals,
            monthly=monthly, daily=daily, categories=categories,
            biggest_expense=_biggest("Despesa"), biggest_income=_biggest("Receita"),
            net_worth={"saldo_contas": round(saldo, 2), "divida_cartoes": round(divida, 2),
                       "patrimonio_liquido": round(saldo - divida, 2)},
        )
        return {"status": "ok", **payload}
    except Exception as e:
        return {"status": "error", "message": str(e)}
