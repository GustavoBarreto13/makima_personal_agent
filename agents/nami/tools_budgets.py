"""Ferramentas de orçamento por categoria (Método Envelope) para o agente Nami.

Permite definir limites mensais por categoria e monitorar o progresso
de gastos em tempo real, com alertas de estouro.

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import uuid
import calendar
from datetime import date

# Importa os helpers PostgreSQL compartilhados
from agents.db import run_select, run_dml
from agents.nami.tools import (
    _match_category, _today, CATEGORIES,
)


def set_budget(month: str, categoria: str, limite: float) -> dict:
    """Define ou atualiza o limite (envelope) de uma categoria para o mês.

    Comportamento de upsert: cria um novo envelope se não existir para
    essa combinação mês+categoria, ou atualiza o limite se já existir.

    Args:
        month: Mês no formato "YYYY-MM" (ex.: "2026-06")
        categoria: Categoria a orçar (deve estar em CATEGORIES)
        limite: Limite de gastos em reais para o mês

    Returns:
        Dicionário com "status": "ok" e confirmação, ou "status": "error".
    """
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'. Opções: {', '.join(CATEGORIES)}"}

    # Verifica se já existe envelope para essa combinação mês+categoria
    sql_check = """
        SELECT id FROM budgets
        WHERE month = %(month)s AND categoria = %(cat)s
        LIMIT 1
    """
    params_check = {"month": month, "cat": cat}

    try:
        existing = run_select(sql_check, params_check)

        if existing:
            # Atualiza o limite existente — updated_at registra quando foi alterado
            sql = """
                UPDATE budgets
                SET limite = %(limite)s, updated_at = NOW()
                WHERE month = %(month)s AND categoria = %(cat)s
            """
            params = {"limite": float(limite), "month": month, "cat": cat}
            run_dml(sql, params)
            msg = f"Orçamento de {cat} em {month} atualizado para R${limite:.2f}"
        else:
            # Cria um novo envelope com ID único
            budget_id = str(uuid.uuid4())
            sql = """
                INSERT INTO budgets
                  (id, month, categoria, limite, created_at)
                VALUES (%(id)s, %(month)s, %(cat)s, %(limite)s, NOW())
            """
            params = {
                "id":     budget_id,
                "month":  month,
                "cat":    cat,
                "limite": float(limite),
            }
            run_dml(sql, params)
            msg = f"Orçamento definido: {cat} em {month} = R${limite:.2f}"

        return {"status": "ok", "message": msg}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_budget(month: str, categoria: str) -> dict:
    """Remove o envelope de orçamento de uma categoria em um mês específico.

    Args:
        month: Mês no formato "YYYY-MM" (ex.: "2026-06").
        categoria: Categoria do envelope a remover.

    Returns:
        Dicionário com "status": "ok" e confirmação, ou "status": "error".
    """
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}

    # Verifica se existe antes de deletar para retornar mensagem informativa
    existing = run_select(
        "SELECT id, limite FROM budgets WHERE month = %(month)s AND categoria = %(cat)s LIMIT 1",
        {"month": month, "cat": cat},
    )
    if not existing:
        return {"status": "error", "message": f"Envelope de {cat} em {month} não encontrado."}

    limite = existing[0]["limite"]

    try:
        run_dml(
            "DELETE FROM budgets WHERE month = %(month)s AND categoria = %(cat)s",
            {"month": month, "cat": cat},
        )
        return {
            "status": "ok",
            "message": f"Envelope de {cat} em {month} (limite R${float(limite):.2f}) removido.",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_budget_status(month: str) -> dict:
    """Retorna o status de todos os envelopes do mês com gasto real vs. limite.

    Args:
        month: Mês no formato "YYYY-MM" (ex.: "2026-06")

    Returns:
        Lista de envelopes com gasto atual, restante, % utilizado e flag de estouro.
    """
    # Busca os envelopes definidos para o mês
    sql_budgets = """
        SELECT id, categoria, limite
        FROM budgets
        WHERE month = %(month)s
    """

    # Calcula o primeiro e último dia do mês para filtrar as transações
    year, m = int(month[:4]), int(month[5:])
    last_day = calendar.monthrange(year, m)[1]
    start = f"{month}-01"
    end = f"{month}-{last_day:02d}"

    # Soma gastos reais por categoria no mês (apenas despesas não-deletadas)
    sql_gastos = """
        SELECT categoria, SUM(valor) AS total
        FROM transactions
        WHERE data BETWEEN %(start)s AND %(end)s
          AND tipo = 'Despesa'
          AND deleted = FALSE
        GROUP BY categoria
    """

    params_month = {"month": month}
    params_dates = {"start": start, "end": end}

    try:
        budgets = run_select(sql_budgets, params_month)
        gastos = run_select(sql_gastos, params_dates)

        # Cria dicionário categoria → gasto real para lookup eficiente
        gasto_map = {g["categoria"]: g["total"] for g in gastos}

        envelopes = []
        for b in budgets:
            gasto = gasto_map.get(b["categoria"], 0.0)
            restante = b["limite"] - gasto
            pct_usado = gasto / b["limite"] * 100 if b["limite"] > 0 else 0.0
            envelopes.append({
                "categoria": b["categoria"],
                "limite": b["limite"],
                "gasto": round(gasto, 2),
                "restante": round(restante, 2),
                "pct_usado": round(pct_usado, 1),
                "estourado": gasto > b["limite"],
            })

        # Ordena do mais estourado para o mais folgado
        envelopes.sort(key=lambda e: e["pct_usado"], reverse=True)

        return {"status": "ok", "month": month, "envelopes": envelopes}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def check_category_budget(categoria: str, valor: float) -> dict:
    """Verifica o estado do envelope da categoria após um gasto hipotético.

    Chamada internamente quando a Nami registra uma despesa. Retorna
    informações sobre o envelope para alertar o usuário se necessário.

    Args:
        categoria: Categoria da despesa
        valor: Valor a ser verificado (em reais)

    Returns:
        Dicionário com envelope_status ("ok", "alerta", "estourado", "sem_envelope").
    """
    # Mês atual no fuso de São Paulo — date.today() seria a data UTC do servidor
    from agents.nami.tools import _today_date
    month = _today_date().strftime("%Y-%m")
    status = get_budget_status(month)

    if status["status"] != "ok":
        return status

    envelope = next((e for e in status["envelopes"] if e["categoria"] == categoria), None)

    if envelope is None:
        return {"status": "ok", "envelope_status": "sem_envelope", "message": ""}

    gasto_com_novo = envelope["gasto"] + valor
    restante_apos = envelope["limite"] - gasto_com_novo
    pct_apos = gasto_com_novo / envelope["limite"] * 100 if envelope["limite"] > 0 else 0.0

    if gasto_com_novo > envelope["limite"]:
        envelope_status = "estourado"
        msg = (
            f"Voce estourou {categoria} em R${abs(restante_apos):.2f}! "
            f"Limite: R${envelope['limite']:.2f}, gasto total: R${gasto_com_novo:.2f}"
        )
    elif pct_apos >= 90:
        envelope_status = "alerta"
        msg = (
            f"{categoria} quase no limite! "
            f"Gastou R${gasto_com_novo:.2f} de R${envelope['limite']:.2f} ({pct_apos:.0f}%)"
        )
    else:
        envelope_status = "ok"
        msg = (
            f"Gastou R${gasto_com_novo:.2f} de R${envelope['limite']:.2f} "
            f"em {categoria}. Restam R${restante_apos:.2f} ({100 - pct_apos:.0f}%)"
        )

    return {
        "status": "ok",
        "envelope_status": envelope_status,
        "categoria": categoria,
        "gasto_atual": round(gasto_com_novo, 2),
        "limite": envelope["limite"],
        "restante": round(restante_apos, 2),
        "message": msg,
    }
