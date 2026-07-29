"""Ferramentas de empréstimos pessoa-a-pessoa (p2p) do agente Nami (spec 046).

Empréstimos informais entre pessoas — direção (emprestei/peguei), sem juros,
com ou sem parcelamento. Domínio separado de `loans` (dívida bancária PRICE/SAC):
aqui não há taxa, sistema de amortização nem despesa lançada automaticamente.

Esta camada existe para que o webapp pare de acessar `personal_loans` direto via
SQL (FR-006 da spec 046) — tanto o router do webapp quanto o agente Telegram
passam a chamar as mesmas funções.

Usage:
    Importado automaticamente pelo nami_agent em agents/nami/agent.py e pelo
    router webapp/backend/routers/finances.py.
"""

import uuid

from agents.db import run_select, run_dml

DIRECTIONS_VALIDAS = {"lent", "borrowed"}


def list_personal_loans(direction: str = "") -> dict:
    """Lista empréstimos pessoa-a-pessoa não deletados.

    Args:
        direction: Filtro opcional — "lent" (emprestei) ou "borrowed" (peguei).
            Vazio traz os dois.

    Returns:
        {"status": "ok", "loans": [...]}.
    """
    if direction and direction not in DIRECTIONS_VALIDAS:
        return {"status": "error", "message": "direction deve ser 'lent' ou 'borrowed'"}

    sql = """
        SELECT id, direction, person_name, total_amount, installments,
               paid_installments, next_due_day, note, created_at::text AS created_at
          FROM personal_loans
         WHERE deleted = FALSE
    """
    params = {}
    if direction:
        sql += " AND direction = %(direction)s"
        params["direction"] = direction
    sql += " ORDER BY created_at DESC"

    rows = run_select(sql, params)
    return {"status": "ok", "loans": rows}


def create_personal_loan(
    direction: str,
    person_name: str,
    total_amount: float,
    installments: int = 1,
    paid_installments: int = 0,
    next_due_day: int | None = None,
    note: str = "",
) -> dict:
    """Registra um novo empréstimo pessoa-a-pessoa.

    Args:
        direction: "lent" (emprestei) ou "borrowed" (peguei emprestado).
        person_name: Nome da pessoa envolvida.
        total_amount: Valor total do empréstimo.
        installments: Número de parcelas (1 = pagamento único/livre).
        paid_installments: Quantas parcelas já foram quitadas.
        next_due_day: Dia do mês de vencimento (1-28), opcional.
        note: Observação livre.

    Returns:
        {"status": "ok", "id": ...} ou {"status": "error", "message": ...}.
    """
    if direction not in DIRECTIONS_VALIDAS:
        return {"status": "error", "message": "direction deve ser 'lent' ou 'borrowed'"}
    if total_amount <= 0:
        return {"status": "error", "message": "total_amount deve ser positivo"}

    loan_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO personal_loans
            (id, direction, person_name, total_amount, installments,
             paid_installments, next_due_day, note, created_at, deleted)
        VALUES
            (%(id)s, %(direction)s, %(person_name)s, %(total_amount)s, %(installments)s,
             %(paid_installments)s, %(next_due_day)s, %(note)s, NOW(), FALSE)
        """,
        {
            "id": loan_id, "direction": direction, "person_name": person_name,
            "total_amount": float(total_amount), "installments": int(installments),
            "paid_installments": int(paid_installments), "next_due_day": next_due_day,
            "note": note or None,
        },
    )
    return {"status": "ok", "id": loan_id, "message": f"Empréstimo com {person_name} registrado"}


def update_personal_loan(
    id: str,
    person_name: str = "",
    total_amount: float | None = None,
    installments: int | None = None,
    paid_installments: int | None = None,
    next_due_day: int | None = None,
    note: str = "",
) -> dict:
    """Edita campos de um empréstimo pessoa-a-pessoa. Só altera os campos informados.

    Args:
        id: ID do empréstimo.
        person_name: Novo nome da pessoa (opcional).
        total_amount: Novo valor total (opcional).
        installments: Novo número de parcelas (opcional).
        paid_installments: Corrige o contador de parcelas pagas (opcional).
        next_due_day: Novo dia de vencimento (opcional).
        note: Nova observação (opcional).

    Returns:
        {"status": "ok", "message": ...} ou {"status": "error", "message": ...}.
    """
    sets: list[str] = []
    params: dict = {"id": id}

    if person_name:
        sets.append("person_name = %(person_name)s")
        params["person_name"] = person_name
    if total_amount is not None:
        sets.append("total_amount = %(total_amount)s")
        params["total_amount"] = total_amount
    if installments is not None:
        sets.append("installments = %(installments)s")
        params["installments"] = installments
    if paid_installments is not None:
        sets.append("paid_installments = %(paid_installments)s")
        params["paid_installments"] = paid_installments
    if next_due_day is not None:
        sets.append("next_due_day = %(next_due_day)s")
        params["next_due_day"] = next_due_day
    if note:
        sets.append("note = %(note)s")
        params["note"] = note

    if not sets:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    affected = run_dml(
        f"UPDATE personal_loans SET {', '.join(sets)} WHERE id = %(id)s AND deleted = FALSE",
        params,
    )
    if affected == 0:
        return {"status": "error", "message": f"Empréstimo não encontrado: {id}"}
    return {"status": "ok", "message": "Empréstimo atualizado"}


def register_personal_loan_payment(id: str) -> dict:
    """Registra que uma parcela do empréstimo p2p foi paga — avança o contador.

    Empréstimos p2p não lançam despesa/receita automaticamente (são informais,
    sem juros) — só o progresso (`paid_installments`) avança.

    Args:
        id: ID do empréstimo.

    Returns:
        {"status": "ok", "paid_installments": ..., "installments": ..., "message": ...}
        ou {"status": "error", "message": ...}.
    """
    rows = run_select(
        "SELECT person_name, installments, paid_installments FROM personal_loans"
        " WHERE id = %(id)s AND deleted = FALSE",
        {"id": id},
    )
    if not rows:
        return {"status": "error", "message": f"Empréstimo não encontrado: {id}"}

    loan = rows[0]
    if loan["paid_installments"] >= loan["installments"]:
        return {"status": "error", "message": f"Empréstimo com {loan['person_name']} já está quitado"}

    novo = loan["paid_installments"] + 1
    run_dml(
        "UPDATE personal_loans SET paid_installments = %(novo)s WHERE id = %(id)s",
        {"novo": novo, "id": id},
    )
    return {
        "status": "ok", "paid_installments": novo, "installments": loan["installments"],
        "message": f"Parcela {novo}/{loan['installments']} de {loan['person_name']} registrada",
    }


def delete_personal_loan(id: str) -> dict:
    """Remove um empréstimo pessoa-a-pessoa (soft delete — marca deleted=TRUE).

    Args:
        id: ID do empréstimo.

    Returns:
        {"status": "ok", "message": ...} ou {"status": "error", "message": ...}.
    """
    affected = run_dml(
        "UPDATE personal_loans SET deleted = TRUE WHERE id = %(id)s AND deleted = FALSE",
        {"id": id},
    )
    if affected == 0:
        return {"status": "error", "message": f"Empréstimo não encontrado: {id}"}
    return {"status": "ok", "message": "Empréstimo removido"}
