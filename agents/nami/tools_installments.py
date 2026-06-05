"""Ferramentas de controle de compras parceladas para o agente Nami.

Permite registrar compras parceladas (ex.: 12x no cartão), acompanhar
parcelas pagas/pendentes e consultar compromissos futuros por mês.

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import uuid
import calendar
from datetime import date

from google.cloud import bigquery

# Importa os helpers privados e constantes compartilhados do módulo principal
from agents.nami.tools import (
    _run_dml, _run_select, _table, _project,
    _match_category, _resolve_account,
    CATEGORIES,
)


def create_installment(
    name: str,
    total_valor: float,
    num_parcelas: int,
    conta: str,
    categoria: str,
    first_due: str,
    notes: str = "",
) -> dict:
    """Registra uma compra parcelada e gera todas as parcelas no BigQuery.

    Cria uma linha em `installment_groups` e `num_parcelas` transações
    individuais em `transactions`, cada uma com data mensal a partir de
    `first_due`.

    Args:
        name: Nome da compra (ex.: "Notebook Dell")
        total_valor: Valor total em reais (ex.: 3600.00)
        num_parcelas: Número de parcelas — mínimo 2
        conta: Conta/cartão usado (deve estar cadastrada em accounts)
        categoria: Categoria da compra (deve estar em CATEGORIES)
        first_due: Data da 1ª parcela no formato AAAA-MM-DD
        notes: Observações opcionais

    Returns:
        Dicionário com "status": "ok", group_id e lista de transaction_ids,
        ou "status": "error" com mensagem descritiva.

    Example:
        >>> create_installment("Notebook", 3600.0, 12, "Cartao Nu", "Eletronicos", "2026-06-10")
        {"status": "ok", "group_id": "...", "transaction_ids": [...]}
    """
    # Valida conta e categoria antes de qualquer acesso ao banco
    acc_obj = _resolve_account(conta)
    if acc_obj is None:
        return {"status": "error", "message": f"Conta não encontrada: '{conta}'. Use list_accounts() para ver as contas disponíveis."}

    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'. Opções: {', '.join(CATEGORIES)}"}

    if num_parcelas < 2:
        return {"status": "error", "message": "num_parcelas deve ser >= 2"}

    # Calcula o valor de cada parcela com 2 casas decimais
    valor_parcela = round(float(total_valor) / num_parcelas, 2)

    # Gera ID único para o grupo de parcelas
    group_id = str(uuid.uuid4())

    # Insere o registro do grupo na tabela installment_groups
    sql_group = f"""
        INSERT INTO {_table("installment_groups")}
          (id, name, total_valor, num_parcelas, valor_parcela, conta, account_id,
           categoria, first_due, notes, created_at, deleted)
        VALUES (@id, @name, @total_valor, @num_parcelas, @valor_parcela, @conta,
                @account_id, @categoria, @first_due, @notes, CURRENT_TIMESTAMP(), FALSE)
    """
    params_group = [
        bigquery.ScalarQueryParameter("id", "STRING", group_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("total_valor", "FLOAT64", float(total_valor)),
        bigquery.ScalarQueryParameter("num_parcelas", "INT64", int(num_parcelas)),
        bigquery.ScalarQueryParameter("valor_parcela", "FLOAT64", valor_parcela),
        bigquery.ScalarQueryParameter("conta", "STRING", acc_obj["name"]),
        bigquery.ScalarQueryParameter("account_id", "STRING", acc_obj["id"]),
        bigquery.ScalarQueryParameter("categoria", "STRING", cat),
        bigquery.ScalarQueryParameter("first_due", "DATE", first_due),
        bigquery.ScalarQueryParameter("notes", "STRING", notes or None),
    ]

    try:
        _run_dml(sql_group, params_group)
    except Exception as e:
        return {"status": "error", "message": f"Erro ao criar grupo de parcelas: {e}"}

    # Gera uma transação para cada parcela com a data de vencimento correta
    tx_ids = []
    first_date = date.fromisoformat(first_due)

    for i in range(num_parcelas):
        # Calcula o mês da parcela i: soma i meses à data da 1ª parcela
        # Garante que o dia não ultrapasse o último dia do mês destino
        total_months = first_date.month - 1 + i
        year = first_date.year + total_months // 12
        month = total_months % 12 + 1
        day = min(first_date.day, calendar.monthrange(year, month)[1])
        parcela_date = date(year, month, day).strftime("%Y-%m-%d")

        tx_id = str(uuid.uuid4())
        tx_ids.append(tx_id)

        parcela_num = i + 1
        parcela_name = f"{name} ({parcela_num}/{num_parcelas})"
        parcela_notes = f"Parcela {parcela_num}/{num_parcelas}" + (f" — {notes}" if notes else "")

        sql_tx = f"""
            INSERT INTO {_table()}
              (id, name, valor, tipo, categoria, conta, account_id, data, source,
               notes, subscription_id, installment_group_id, created_at, deleted)
            VALUES (@id, @name, @valor, 'Despesa', @categoria, @conta, @account_id,
                    @data, 'telegram', @notes, NULL, @group_id, CURRENT_TIMESTAMP(), FALSE)
        """
        params_tx = [
            bigquery.ScalarQueryParameter("id", "STRING", tx_id),
            bigquery.ScalarQueryParameter("name", "STRING", parcela_name),
            bigquery.ScalarQueryParameter("valor", "FLOAT64", valor_parcela),
            bigquery.ScalarQueryParameter("categoria", "STRING", cat),
            bigquery.ScalarQueryParameter("conta", "STRING", acc_obj["name"]),
            bigquery.ScalarQueryParameter("account_id", "STRING", acc_obj["id"]),
            bigquery.ScalarQueryParameter("data", "DATE", parcela_date),
            bigquery.ScalarQueryParameter("notes", "STRING", parcela_notes),
            bigquery.ScalarQueryParameter("group_id", "STRING", group_id),
        ]

        try:
            _run_dml(sql_tx, params_tx)
        except Exception as e:
            return {"status": "error", "message": f"Erro ao criar parcela {parcela_num}: {e}"}

    return {
        "status": "ok",
        "group_id": group_id,
        "transaction_ids": tx_ids,
        "message": f"Compra parcelada criada: {name} R${float(total_valor):.2f} em {num_parcelas}x de R${valor_parcela:.2f}",
    }


def list_installments(status: str = "ativo") -> dict:
    """Lista grupos de parcelamento com contagem de parcelas pagas e pendentes.

    Args:
        status: "ativo" (padrão, exclui grupos cancelados) ou "all" para todos

    Returns:
        Dicionário com lista de grupos e contagem de parcelas por grupo.
    """
    # Filtra apenas grupos não-deletados quando status="ativo"
    where_clause = "ig.deleted = FALSE" if status == "ativo" else "TRUE"

    sql = f"""
        SELECT
            ig.id, ig.name, ig.total_valor, ig.num_parcelas, ig.valor_parcela,
            ig.conta, ig.categoria, CAST(ig.first_due AS STRING) AS first_due, ig.notes,
            COUNTIF(t.data <= CURRENT_DATE() AND t.deleted = FALSE) AS parcelas_pagas,
            COUNTIF(t.data > CURRENT_DATE() AND t.deleted = FALSE) AS parcelas_pendentes
        FROM {_table("installment_groups")} ig
        LEFT JOIN {_table()} t ON t.installment_group_id = ig.id
        WHERE {where_clause}
        GROUP BY ig.id, ig.name, ig.total_valor, ig.num_parcelas, ig.valor_parcela,
                 ig.conta, ig.categoria, ig.first_due, ig.notes
        ORDER BY ig.first_due DESC
    """

    try:
        rows = _run_select(sql)
        return {"status": "ok", "installments": rows, "count": len(rows)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_future_commitments(month: str) -> dict:
    """Soma todos os compromissos futuros de um mês específico.

    Inclui parcelas (transações com installment_group_id) e assinaturas
    com next_billing no período informado.

    Args:
        month: Mês no formato "YYYY-MM" (ex.: "2026-08")

    Returns:
        Dicionário com total de parcelas, assinaturas e total geral do mês.
    """
    # Calcula o primeiro e último dia do mês informado
    year, m = int(month[:4]), int(month[5:])
    last_day = calendar.monthrange(year, m)[1]
    start = f"{month}-01"
    end = f"{month}-{last_day:02d}"

    # Soma parcelas futuras (transações vinculadas a installment_group_id) no mês
    sql_parcelas = f"""
        SELECT COALESCE(SUM(valor), 0) AS total
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND installment_group_id IS NOT NULL
          AND deleted = FALSE
    """

    # Soma assinaturas ativas com cobrança prevista no mês
    sql_subs = f"""
        SELECT COALESCE(SUM(valor), 0) AS total
        FROM {_table("subscriptions")}
        WHERE next_billing BETWEEN @start AND @end
          AND status = 'ativa'
    """

    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start),
        bigquery.ScalarQueryParameter("end", "DATE", end),
    ]

    try:
        rows_parcelas = _run_select(sql_parcelas, params)
        rows_subs = _run_select(sql_subs, params)

        total_parcelas = float(rows_parcelas[0]["total"]) if rows_parcelas else 0.0
        total_subs = float(rows_subs[0]["total"]) if rows_subs else 0.0

        return {
            "status": "ok",
            "month": month,
            "total_parcelas": round(total_parcelas, 2),
            "total_assinaturas": round(total_subs, 2),
            "total": round(total_parcelas + total_subs, 2),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def cancel_installment_group(id: str) -> dict:
    """Cancela todas as parcelas futuras de um grupo (soft delete).

    Não apaga os registros — apenas marca como deleted=TRUE para preservar
    o histórico de parcelas já pagas.

    Args:
        id: ID do grupo de parcelas a cancelar

    Returns:
        Dicionário com quantidade de parcelas futuras canceladas.
    """
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    # Soft delete nas parcelas futuras (data > hoje) do grupo
    sql_tx = f"""
        UPDATE {_table()}
        SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP()
        WHERE installment_group_id = @id
          AND data > CURRENT_DATE()
          AND deleted = FALSE
    """

    # Soft delete no próprio grupo
    sql_group = f"""
        UPDATE {_table("installment_groups")}
        SET deleted = TRUE
        WHERE id = @id AND deleted = FALSE
    """

    try:
        cancelled = _run_dml(sql_tx, params)
        _run_dml(sql_group, params)
        return {"status": "ok", "message": f"{cancelled} parcelas futuras canceladas"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
