"""Ferramentas de tracker de empréstimos e financiamentos para o agente Nami.

Suporta sistemas PRICE (parcela fixa) e SAC (parcela decrescente).
Permite cadastrar, consultar saldo devedor e simular amortizações e quitações.

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py.
"""

import uuid

# Importa os helpers PostgreSQL compartilhados
from agents.db import run_select, run_dml
from agents.nami.tools import (
    _resolve_account,
    create_transaction,
)
from agents.nami.tools_credit_cards import get_card_debt_summary


# ─────────────────────────────────────────────────────────────────────────────
# Helpers matemáticos para cálculo de amortização
# ─────────────────────────────────────────────────────────────────────────────

def _price_pmt(pv: float, i: float, n: int) -> float:
    """Calcula a parcela fixa do sistema PRICE (amortização francesa).

    Args:
        pv: Principal (valor original do empréstimo)
        i: Taxa de juros mensal (ex.: 0.01 para 1%)
        n: Número total de parcelas

    Returns:
        Valor da parcela mensal fixa.
    """
    # Fórmula: PMT = PV × i × (1+i)^n / ((1+i)^n - 1)
    return pv * i * (1 + i) ** n / ((1 + i) ** n - 1)


def _price_balance(pv: float, i: float, n: int, k: int) -> float:
    """Calcula o saldo devedor após k parcelas pagas no sistema PRICE.

    Args:
        pv: Principal original
        i: Taxa de juros mensal
        n: Total de parcelas
        k: Parcelas já pagas

    Returns:
        Saldo devedor restante após k pagamentos.
    """
    # Fórmula: SD_k = PV×(1+i)^k - PMT×((1+i)^k - 1)/i
    pmt = _price_pmt(pv, i, n)
    return pv * (1 + i) ** k - pmt * ((1 + i) ** k - 1) / i


def _sac_balance(pv: float, n: int, k: int) -> float:
    """Calcula o saldo devedor após k parcelas pagas no sistema SAC.

    No SAC, a amortização (A = PV/n) é constante, então o saldo
    decresce linearmente a cada mês.

    Args:
        pv: Principal original
        n: Total de parcelas
        k: Parcelas já pagas

    Returns:
        Saldo devedor restante após k pagamentos.
    """
    # Fórmula: SD_k = PV - k × (PV/n)
    return pv - k * (pv / n)


def _simulate_loan_months(
    start_balance: float,
    i: float,
    pmt: float,
) -> tuple:
    """Simula mês a mês um empréstimo com parcela fixa até quitação.

    Args:
        start_balance: Saldo devedor inicial
        i: Taxa de juros mensal
        pmt: Valor da parcela mensal

    Returns:
        Tupla (meses_ate_quitacao, juros_total_pago)
    """
    balance = start_balance
    meses = 0
    juros_total = 0.0

    # Limite de 50 anos para evitar loop infinito em caso de parcela insuficiente
    while balance > 0.01 and meses < 600:
        meses += 1
        juros = balance * i
        juros_total += juros
        balance = balance + juros - pmt
        if balance < 0:
            balance = 0.0

    return meses, juros_total


# ─────────────────────────────────────────────────────────────────────────────
# Ferramentas públicas
# ─────────────────────────────────────────────────────────────────────────────

TIPOS_VALIDOS = {"veiculo", "consignado", "pessoal", "imobiliario", "outro"}
SISTEMAS_VALIDOS = {"PRICE", "SAC"}


def register_loan(
    name: str,
    tipo: str,
    sistema_amortizacao: str,
    valor_original: float,
    taxa_juros_mensal: float,
    num_parcelas: int,
    parcelas_pagas: int,
    valor_parcela: float,
    primeiro_vencimento: str,
    conta: str,
    desconto_folha: bool = False,
    notes: str = "",
) -> dict:
    """Cadastra um empréstimo ou financiamento no PostgreSQL.

    Args:
        name: Nome do empréstimo (ex.: "Carro Onix", "Consignado Itaú")
        tipo: Tipo — "veiculo" | "consignado" | "pessoal" | "imobiliario" | "outro"
        sistema_amortizacao: "PRICE" (parcela fixa) ou "SAC" (parcela decrescente)
        valor_original: Valor total financiado em reais
        taxa_juros_mensal: Taxa mensal (ex.: 0.0099 para 0.99%)
        num_parcelas: Total de parcelas do contrato
        parcelas_pagas: Quantas já foram pagas até hoje
        valor_parcela: Valor da parcela atual (para SAC: próxima parcela)
        primeiro_vencimento: Data da 1ª parcela no formato AAAA-MM-DD
        conta: Conta de débito (deve estar em accounts)
        desconto_folha: True se for consignado/débito automático em folha
        notes: Observações opcionais

    Returns:
        Dicionário com "status": "ok" e id, ou "status": "error".
    """
    if tipo not in TIPOS_VALIDOS:
        return {"status": "error", "message": f"tipo inválido. Opções: {', '.join(TIPOS_VALIDOS)}"}

    if sistema_amortizacao not in SISTEMAS_VALIDOS:
        return {"status": "error", "message": f"sistema_amortizacao inválido. Opções: {', '.join(SISTEMAS_VALIDOS)}"}

    acc_obj = _resolve_account(conta)
    if acc_obj is None:
        return {"status": "error", "message": f"Conta não encontrada: '{conta}'. Use list_accounts() para ver as contas disponíveis."}

    loan_id = str(uuid.uuid4())

    sql = """
        INSERT INTO loans
          (id, name, tipo, sistema_amortizacao, valor_original, taxa_juros_mensal,
           num_parcelas_total, parcelas_pagas, valor_parcela, primeiro_vencimento,
           conta, account_id, desconto_folha, status, notes, created_at)
        VALUES (%(id)s, %(name)s, %(tipo)s, %(sistema)s, %(valor_original)s, %(taxa)s,
                %(num_parcelas)s, %(parcelas_pagas)s, %(valor_parcela)s, %(primeiro_vencimento)s,
                %(conta)s, %(account_id)s, %(desconto_folha)s, 'ativo', %(notes)s, NOW())
    """
    params = {
        "id":                  loan_id,
        "name":                name,
        "tipo":                tipo,
        "sistema":             sistema_amortizacao,
        "valor_original":      float(valor_original),
        "taxa":                float(taxa_juros_mensal),
        "num_parcelas":        int(num_parcelas),
        "parcelas_pagas":      int(parcelas_pagas),
        "valor_parcela":       float(valor_parcela),
        "primeiro_vencimento": primeiro_vencimento,
        "conta":               acc_obj["name"],
        "account_id":          acc_obj["id"],
        "desconto_folha":      bool(desconto_folha),
        "notes":               notes or None,
    }

    try:
        run_dml(sql, params)
        return {"status": "ok", "id": loan_id, "message": f"Empréstimo '{name}' cadastrado com sucesso"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_loans(status: str = "ativo") -> dict:
    """Lista todos os empréstimos com saldo devedor atual e parcelas restantes.

    Args:
        status: "ativo" (padrão) ou "quitado" para filtrar por situação

    Returns:
        Lista de empréstimos com saldo devedor calculado pelo sistema de amortização.
    """
    # primeiro_vencimento::text converte date para string — equivalente ao CAST(... AS STRING) do BigQuery
    sql = """
        SELECT id, name, tipo, sistema_amortizacao, valor_original, taxa_juros_mensal,
               num_parcelas_total, parcelas_pagas, valor_parcela,
               primeiro_vencimento::text AS primeiro_vencimento,
               conta, desconto_folha, status, notes
        FROM loans
        WHERE status = %(status)s
          AND (deleted = FALSE OR deleted IS NULL)
        ORDER BY taxa_juros_mensal DESC
    """
    params = {"status": status}

    try:
        rows = run_select(sql, params)

        # Calcula saldo devedor para cada empréstimo usando o sistema correto
        for loan in rows:
            pv = loan["valor_original"]
            i = loan["taxa_juros_mensal"]
            n = loan["num_parcelas_total"]
            k = loan["parcelas_pagas"]
            if loan["sistema_amortizacao"] == "PRICE":
                loan["saldo_devedor"] = round(_price_balance(pv, i, n, k), 2)
            else:  # SAC
                loan["saldo_devedor"] = round(_sac_balance(pv, n, k), 2)
            loan["parcelas_restantes"] = n - k

        return {"status": "ok", "loans": rows, "count": len(rows)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_loan_balance(loan_id: str) -> dict:
    """Retorna saldo devedor atual, parcelas restantes e valor da próxima parcela.

    Args:
        loan_id: ID do empréstimo (retornado por register_loan)

    Returns:
        Dicionário com saldo devedor, parcelas restantes e próxima parcela.
    """
    sql = "SELECT * FROM loans WHERE id = %(id)s AND status = 'ativo'"
    params = {"id": loan_id}

    try:
        rows = run_select(sql, params)
        if not rows:
            return {"status": "error", "message": f"Empréstimo não encontrado: {loan_id}"}

        loan = rows[0]
        pv = loan["valor_original"]
        i = loan["taxa_juros_mensal"]
        n = loan["num_parcelas_total"]
        k = loan["parcelas_pagas"]
        sistema = loan["sistema_amortizacao"]

        if sistema == "PRICE":
            saldo = _price_balance(pv, i, n, k)
            proxima_parcela = loan["valor_parcela"]  # PRICE: parcela fixa
        else:  # SAC
            saldo = _sac_balance(pv, n, k)
            a = pv / n  # amortização constante
            proxima_parcela = a + saldo * i  # SAC: amortização + juros sobre saldo atual

        return {
            "status": "ok",
            "name": loan["name"],
            "sistema": sistema,
            "saldo_devedor": round(max(0, saldo), 2),
            "parcelas_restantes": n - k,
            "proxima_parcela": round(proxima_parcela, 2),
            "taxa_juros_mensal": i,
            "desconto_folha": loan["desconto_folha"],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def simulate_early_payoff(loan_id: str) -> dict:
    """Calcula o valor necessário para quitar o empréstimo hoje.

    Valor de quitação = saldo devedor atual (sem juros futuros — direito
    garantido pelo CDC, Código de Defesa do Consumidor).

    Args:
        loan_id: ID do empréstimo a quitar

    Returns:
        Dicionário com valor de quitação e economia estimada vs. seguir pagando.
    """
    balance_info = get_loan_balance(loan_id)
    if balance_info["status"] != "ok":
        return balance_info

    saldo = balance_info["saldo_devedor"]
    parcelas_restantes = balance_info["parcelas_restantes"]
    proxima_parcela = balance_info["proxima_parcela"]

    # Custo total se continuar pagando normalmente (aproximação para SAC)
    custo_continuar = proxima_parcela * parcelas_restantes
    economia = custo_continuar - saldo

    return {
        "status": "ok",
        "valor_quitacao": round(saldo, 2),
        "custo_continuar_pagando": round(custo_continuar, 2),
        "economia_quitando_agora": round(economia, 2),
        "message": (
            f"Para quitar hoje: R${saldo:.2f}. "
            f"Continuando pagando: R${custo_continuar:.2f} total. "
            f"Quitando agora você economiza R${economia:.2f} em juros futuros."
        ),
    }


def simulate_amortization(loan_id: str, extra_value: float) -> dict:
    """Simula o impacto de pagar X a mais de uma só vez (amortização extraordinária).

    Compara dois cenários (com e sem a amortização extra) para mostrar
    quantas parcelas são eliminadas e quanto se economiza em juros.

    Args:
        loan_id: ID do empréstimo
        extra_value: Valor extra a ser amortizado hoje (em reais)

    Returns:
        Dicionário com parcelas eliminadas e economia de juros.
    """
    sql = "SELECT * FROM loans WHERE id = %(id)s AND status = 'ativo'"
    params = {"id": loan_id}

    try:
        rows = run_select(sql, params)
        if not rows:
            return {"status": "error", "message": f"Empréstimo não encontrado: {loan_id}"}

        loan = rows[0]
        pv = loan["valor_original"]
        i = loan["taxa_juros_mensal"]
        n = loan["num_parcelas_total"]
        k = loan["parcelas_pagas"]
        pmt = loan["valor_parcela"]

        if loan["sistema_amortizacao"] == "PRICE":
            saldo_atual = _price_balance(pv, i, n, k)
        else:
            saldo_atual = _sac_balance(pv, n, k)

        novo_saldo = max(0.0, saldo_atual - extra_value)

        # Simula os dois cenários mês a mês para calcular diferença de juros
        meses_sem, juros_sem = _simulate_loan_months(saldo_atual, i, pmt)
        meses_com, juros_com = _simulate_loan_months(novo_saldo, i, pmt)

        parcelas_eliminadas = meses_sem - meses_com
        economy = max(0.0, juros_sem - juros_com)

        return {
            "status": "ok",
            "extra_value": extra_value,
            "parcelas_eliminadas": parcelas_eliminadas,
            "economia_juros": round(economy, 2),
            "message": (
                f"Amortizando R${extra_value:.2f}: elimina {parcelas_eliminadas} parcelas "
                f"e economiza R${economy:.2f} em juros"
            ),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def simulate_accelerated_payment(loan_id: str, extra_monthly: float) -> dict:
    """Simula nova data de quitação pagando X a mais por mês.

    Args:
        loan_id: ID do empréstimo
        extra_monthly: Valor extra a pagar por mês (em reais)

    Returns:
        Dicionário com meses economizados e juros poupados.
    """
    sql = "SELECT * FROM loans WHERE id = %(id)s AND status = 'ativo'"
    params = {"id": loan_id}

    try:
        rows = run_select(sql, params)
        if not rows:
            return {"status": "error", "message": f"Empréstimo não encontrado: {loan_id}"}

        loan = rows[0]
        pv = loan["valor_original"]
        i = loan["taxa_juros_mensal"]
        n = loan["num_parcelas_total"]
        k = loan["parcelas_pagas"]
        pmt = loan["valor_parcela"]

        if loan["sistema_amortizacao"] == "PRICE":
            saldo = _price_balance(pv, i, n, k)
        else:
            saldo = _sac_balance(pv, n, k)

        # Simula o cenário atual e o acelerado para comparar
        meses_atual, juros_atual = _simulate_loan_months(saldo, i, pmt)
        meses_novo, juros_novo = _simulate_loan_months(saldo, i, pmt + extra_monthly)

        meses_economizados = meses_atual - meses_novo
        economia_juros = max(0.0, juros_atual - juros_novo)

        return {
            "status": "ok",
            "meses_atual": meses_atual,
            "meses_novo": meses_novo,
            "meses_economizados": meses_economizados,
            "economia_juros": round(economia_juros, 2),
            "message": (
                f"Pagando R${extra_monthly:.2f}/mês a mais: quita em {meses_novo} meses "
                f"({meses_economizados} a menos), economizando R${economia_juros:.2f} em juros"
            ),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def compare_payoff_priority() -> dict:
    """Lista cartões e empréstimos ativos ordenados por taxa de juros (maior primeiro).

    Implementa a lógica do Método Avalanche: atacar a dívida mais cara primeiro
    minimiza o custo total de juros pagos ao longo do tempo.

    Returns:
        Lista priorizada de todas as dívidas com recomendação de ordem de ataque.
    """
    sql = """
        SELECT id, name, taxa_juros_mensal, valor_original,
               num_parcelas_total, parcelas_pagas, sistema_amortizacao, valor_parcela
        FROM loans
        WHERE status = 'ativo'
    """

    try:
        loans = run_select(sql)
        card_summary = get_card_debt_summary()

        priority = []

        # Adiciona empréstimos com saldo devedor calculado
        for loan in loans:
            pv = loan["valor_original"]
            i = loan["taxa_juros_mensal"]
            n = loan["num_parcelas_total"]
            k = loan["parcelas_pagas"]
            if loan["sistema_amortizacao"] == "PRICE":
                saldo = _price_balance(pv, i, n, k)
            else:
                saldo = _sac_balance(pv, n, k)

            priority.append({
                "tipo": "emprestimo",
                "name": loan["name"],
                "taxa_juros_mensal": i,
                "taxa_juros_anual": round((1 + i) ** 12 - 1, 4),
                "saldo_devedor": round(saldo, 2),
            })

        # Adiciona cartões com dívida ativa
        if card_summary["status"] == "ok":
            for card in card_summary["cards"]:
                if card["divida_atual"] > 0:
                    i = card["taxa_juros_mensal"]
                    priority.append({
                        "tipo": "cartao",
                        "name": card["name"],
                        "taxa_juros_mensal": i,
                        "taxa_juros_anual": round((1 + i) ** 12 - 1, 4),
                        "saldo_devedor": card["divida_atual"],
                    })

        # Ordena do maior para o menor juros (Método Avalanche)
        priority.sort(key=lambda x: x["taxa_juros_mensal"], reverse=True)

        recomendacao = (
            f"Método Avalanche: pague o mínimo em todos e concentre o dinheiro extra "
            f"em '{priority[0]['name']}' ({priority[0]['taxa_juros_mensal']*100:.1f}%/mês) primeiro."
        ) if priority else "Sem dívidas ativas!"

        return {
            "status": "ok",
            "priority": priority,
            "recomendacao": recomendacao,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def update_loan(
    loan_id: str,
    name: str = "",
    notes: str = "",
    status: str = "",
    parcelas_pagas: int = None,
) -> dict:
    """Atualiza campos editáveis de um empréstimo.

    Args:
        loan_id: ID do empréstimo.
        name: Novo nome (opcional).
        notes: Novas observações (opcional).
        status: Novo status — "ativo" ou "quitado" (opcional).
        parcelas_pagas: Corrige o contador de parcelas pagas (opcional).

    Returns:
        Dicionário com "status": "ok" ou "status": "error".
    """
    sets = ["updated_at = NOW()"]
    params = {"id": loan_id}

    if name:
        sets.append("name = %(name)s")
        params["name"] = name

    if notes:
        sets.append("notes = %(notes)s")
        params["notes"] = notes

    if status:
        if status not in ("ativo", "quitado"):
            return {"status": "error", "message": "status deve ser 'ativo' ou 'quitado'"}
        sets.append("status = %(status)s")
        params["status"] = status

    if parcelas_pagas is not None:
        sets.append("parcelas_pagas = %(parcelas_pagas)s")
        params["parcelas_pagas"] = int(parcelas_pagas)

    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    sql = f"UPDATE loans SET {', '.join(sets)} WHERE id = %(id)s"
    try:
        affected = run_dml(sql, params)
        if affected == 0:
            return {"status": "error", "message": f"Empréstimo não encontrado: {loan_id}"}
        return {"status": "ok", "message": "Empréstimo atualizado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_loan(loan_id: str) -> dict:
    """Remove um empréstimo do sistema (soft delete — marca deleted=TRUE).

    O registro permanece no banco para auditoria mas some das listagens.

    Args:
        loan_id: ID do empréstimo a remover.

    Returns:
        Dicionário com "status": "ok" ou "status": "error".
    """
    loan_rows = run_select(
        "SELECT name FROM loans WHERE id = %(id)s AND (deleted = FALSE OR deleted IS NULL)",
        {"id": loan_id},
    )
    if not loan_rows:
        return {"status": "error", "message": f"Empréstimo não encontrado: {loan_id}"}

    nome = loan_rows[0]["name"]

    try:
        run_dml(
            "UPDATE loans SET deleted = TRUE, updated_at = NOW() WHERE id = %(id)s",
            {"id": loan_id},
        )
        return {"status": "ok", "message": f"Empréstimo '{nome}' removido."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def register_loan_payment(loan_id: str, data: str = "") -> dict:
    """Registra o pagamento de uma parcela de empréstimo ou financiamento.

    Incrementa o contador de parcelas pagas no empréstimo E cria uma transação
    tipo Despesa em `transactions` — mantendo a fonte da verdade unificada.

    Args:
        loan_id: ID do empréstimo (retornado por register_loan)
        data: Data do pagamento no formato AAAA-MM-DD (padrão: hoje)

    Returns:
        Dicionário com status, saldo restante e número de parcelas restantes.
    """
    sql_loan = """
        SELECT id, name, tipo, sistema_amortizacao, valor_original,
               taxa_juros_mensal, num_parcelas_total, parcelas_pagas,
               valor_parcela, conta, desconto_folha, status
        FROM loans
        WHERE id = %(loan_id)s AND status = 'ativo'
    """
    params = {"loan_id": loan_id}

    try:
        loans = run_select(sql_loan, params)
        if not loans:
            return {"status": "error", "message": f"Empréstimo não encontrado ou inativo: {loan_id}"}

        loan = loans[0]
        k = loan["parcelas_pagas"]
        n = loan["num_parcelas_total"]

        if k >= n:
            return {"status": "error", "message": f"Empréstimo '{loan['name']}' já está quitado ({n}/{n} parcelas)"}

        # Mapeia tipo do empréstimo para categoria da transação
        _CATEGORIA_MAP = {
            "imobiliario": "Moradia",
            "veiculo":     "Transporte",
        }
        categoria = _CATEGORIA_MAP.get(loan["tipo"], "Inbox")

        # Cria transação Despesa — registra o pagamento na fonte da verdade
        tx = create_transaction(
            name=f"Parcela {k + 1}/{n} — {loan['name']}",
            valor=float(loan["valor_parcela"]),
            tipo="Despesa",
            categoria=categoria,
            conta=loan["conta"],
            data=data,
        )
        if tx.get("status") != "ok":
            return {"status": "error", "message": f"Erro ao registrar transação: {tx.get('message')}"}

        # Incrementa parcelas_pagas no empréstimo via UPDATE
        sql_update = """
            UPDATE loans
            SET parcelas_pagas = parcelas_pagas + 1,
                updated_at = NOW()
            WHERE id = %(loan_id)s
        """
        run_dml(sql_update, params)

        # Calcula saldo restante após este pagamento
        k_novo = k + 1
        pv = loan["valor_original"]
        i = loan["taxa_juros_mensal"]
        if loan["sistema_amortizacao"] == "PRICE":
            saldo_restante = max(0.0, _price_balance(pv, i, n, k_novo))
        else:
            saldo_restante = max(0.0, _sac_balance(pv, n, k_novo))

        return {
            "status": "ok",
            "message": (
                f"Parcela {k + 1}/{n} de '{loan['name']}' registrada — "
                f"R${loan['valor_parcela']:.2f}. "
                f"Saldo restante: R${saldo_restante:.2f} ({n - k_novo} parcelas)"
            ),
            "parcelas_pagas": k_novo,
            "parcelas_restantes": n - k_novo,
            "saldo_restante": round(saldo_restante, 2),
            "transaction_id": tx.get("id"),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
