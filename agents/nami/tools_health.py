"""Ferramenta de score de saúde financeira para o agente Nami.

Calcula um score de 0-100 baseado em 4 dimensões financeiras: taxa de gasto,
taxa de poupança, comprometimento futuro e dívida de cartão.

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import calendar
from google.cloud import bigquery
from agents.nami.tools import _run_select, _table, _project
from agents.nami.tools_credit_cards import get_card_debt_summary
from agents.nami.tools_installments import get_future_commitments


def get_financial_health_score(month: str) -> dict:
    """Calcula o score de saúde financeira do mês (0-100).

    As 4 dimensões valem 25 pontos cada:
    1. Taxa de gasto: despesas / receita (≤ 80% = cheio)
    2. Taxa de poupança: (receita - despesas) / receita (≥ 20% = cheio)
    3. Comprometimento futuro: parcelas+assinaturas / receita (≤ 25% = cheio)
    4. Dívida de cartão: dívida total / limite total (0% = cheio, linear até 100% = 0pts)

    Args:
        month: Mês no formato "YYYY-MM" (ex.: "2026-06")

    Returns:
        Dicionário com score total, breakdown por dimensão e mensagem interpretativa.
    """
    # Calcula o intervalo de datas do mês para filtrar as transações
    year, m = int(month[:4]), int(month[5:])
    last_day = calendar.monthrange(year, m)[1]
    start = f"{month}-01"
    end = f"{month}-{last_day:02d}"

    # Busca receitas e despesas do mês agrupadas por tipo
    sql = f"""
        SELECT tipo, SUM(valor) AS total
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
          AND tipo IN ('Receita', 'Despesa')
        GROUP BY tipo
    """
    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start),
        bigquery.ScalarQueryParameter("end", "DATE", end),
    ]

    try:
        rows = _run_select(sql, params)
        totals = {r["tipo"]: r["total"] for r in rows}

        receita = totals.get("Receita", 0.0)
        despesas = totals.get("Despesa", 0.0)

        # Sem receita registrada, o score não pode ser calculado
        if receita <= 0:
            return {
                "status": "ok",
                "score": 0,
                "breakdown": {"taxa_gasto": 0, "taxa_poupanca": 0, "comprometimento_futuro": 0, "divida_cartao": 0},
                "message": (
                    f"Score em {month}: 0/100. Sem receita registrada no mês — "
                    "cadastre sua renda para ativar o score."
                ),
            }

        # ── Dimensão 1: Taxa de gasto (despesas / receita) ──────────────────
        # ≤ 80% → 25pts | 80-100% → linear de 25 a 0 | > 100% → 0pts
        taxa_gasto = despesas / receita
        if taxa_gasto <= 0.80:
            pts_gasto = 25
        elif taxa_gasto <= 1.0:
            pts_gasto = round(25 * (1.0 - taxa_gasto) / 0.20)
        else:
            pts_gasto = 0

        # ── Dimensão 2: Taxa de poupança ((receita - despesas) / receita) ───
        # ≥ 20% → 25pts | 0-20% → linear | negativo → 0pts
        taxa_poupanca = (receita - despesas) / receita
        if taxa_poupanca >= 0.20:
            pts_poupanca = 25
        elif taxa_poupanca > 0:
            pts_poupanca = round(25 * taxa_poupanca / 0.20)
        else:
            pts_poupanca = 0

        # ── Dimensão 3: Comprometimento futuro (parcelas + assinaturas) ─────
        # ≤ 25% → 25pts | 25-50% → linear | > 50% → 0pts
        commits = get_future_commitments(month)
        total_commits = commits.get("total", 0.0) if commits["status"] == "ok" else 0.0
        taxa_commits = total_commits / receita
        if taxa_commits <= 0.25:
            pts_commits = 25
        elif taxa_commits <= 0.50:
            pts_commits = round(25 * (0.50 - taxa_commits) / 0.25)
        else:
            pts_commits = 0

        # ── Dimensão 4: Dívida de cartão (dívida total / limite total) ──────
        # 0% → 25pts | 100% → 0pts (linear)
        card_info = get_card_debt_summary()
        if card_info["status"] == "ok" and card_info["total_limite"] > 0:
            taxa_divida = card_info["total_divida"] / card_info["total_limite"]
            pts_divida = round(25 * max(0.0, 1.0 - taxa_divida))
        else:
            pts_divida = 25  # sem cartão cadastrado = sem dívida = pontuação máxima

        score = pts_gasto + pts_poupanca + pts_commits + pts_divida

        # Identifica o ponto mais forte e mais fraco para feedback personalizado
        dimensoes = {
            "taxa de gasto": pts_gasto,
            "taxa de poupança": pts_poupanca,
            "comprometimento futuro": pts_commits,
            "dívida de cartão": pts_divida,
        }
        ponto_forte = max(dimensoes, key=dimensoes.get)
        ponto_fraco = min(dimensoes, key=dimensoes.get)

        message = (
            f"Saúde financeira em {month}: {score}/100. "
            f"Ponto forte: {ponto_forte} ({dimensoes[ponto_forte]}/25). "
            f"Ponto fraco: {ponto_fraco} ({dimensoes[ponto_fraco]}/25)."
        )

        return {
            "status": "ok",
            "score": score,
            "breakdown": {
                "taxa_gasto": pts_gasto,
                "taxa_poupanca": pts_poupanca,
                "comprometimento_futuro": pts_commits,
                "divida_cartao": pts_divida,
            },
            "detalhes": {
                "receita": round(receita, 2),
                "despesas": round(despesas, 2),
                "comprometimentos_futuros": round(total_commits, 2),
                "divida_cartao": round(card_info.get("total_divida", 0.0), 2),
            },
            "message": message,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
