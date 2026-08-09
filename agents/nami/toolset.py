"""Lista de tools públicas da Nami, para exposição via MCP (mcp_servers/makima).

Extraído de agents/nami/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E1 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.

Exclui variantes `*_on_cursor` (recebem cursor psycopg2 aberto, não serializáveis por
MCP) — essas seguem privadas, chamadas internamente pelas fachadas públicas.
"""

from agents.nami.tools import (
    create_transaction,
    query_expenses,
    update_transaction,
    delete_transaction,
    get_spending_summary,
    get_spending_trend,
    create_subscription,
    list_subscriptions,
    update_subscription,
    delete_subscription,
    get_recurring_status,
    mark_subscription_paid,
    skip_subscription_cycle,
)
from agents.nami.tools_installments import (
    create_installment,
    list_installments,
    get_future_commitments,
    cancel_installment_group,
    update_installment_group,
    delete_installment_group_full,
)
from agents.nami.tools_accounts import (
    create_account,
    list_accounts,
    get_account_balance,
    update_account,
    delete_account,
)
from agents.nami.tools_credit_cards import (
    register_credit_card,
    get_card_debt_summary,
    register_card_payment,
    simulate_debt_payoff,
    get_minimum_payment_cost,
    update_credit_card,
    delete_credit_card,
)
from agents.nami.tools_loans import (
    register_loan,
    list_loans,
    get_loan_balance,
    simulate_early_payoff,
    simulate_amortization,
    simulate_accelerated_payment,
    compare_payoff_priority,
    register_loan_payment,
    update_loan,
    delete_loan,
)
from agents.nami.tools_budgets import (
    set_budget,
    get_budget_status,
    check_category_budget,
    delete_budget,
)
from agents.nami.tools_health import get_financial_health_score
from agents.nami.tools_personal_loans import (
    list_personal_loans,
    create_personal_loan,
    update_personal_loan,
    register_personal_loan_payment,
    delete_personal_loan,
)
from agents.nami.tools_shopping import (
    create_shopping_list,
    list_shopping_lists,
    add_shopping_items,
    show_shopping_list,
    check_shopping_item,
    update_shopping_item,
    remove_shopping_item,
    get_frequent_items,
    finish_shopping,
)

TOOLS = [
    # Contas financeiras
    create_account,
    list_accounts,
    get_account_balance,
    update_account,
    delete_account,
    # Transações e consultas
    create_transaction,
    query_expenses,
    update_transaction,
    delete_transaction,
    get_spending_summary,
    get_spending_trend,
    # Assinaturas e Contas Fixas (spec 044)
    create_subscription,
    list_subscriptions,
    update_subscription,
    delete_subscription,
    get_recurring_status,
    mark_subscription_paid,
    skip_subscription_cycle,
    # Parcelas
    create_installment,
    list_installments,
    get_future_commitments,
    cancel_installment_group,
    update_installment_group,
    delete_installment_group_full,
    # Cartões de crédito
    register_credit_card,
    get_card_debt_summary,
    register_card_payment,
    simulate_debt_payoff,
    get_minimum_payment_cost,
    update_credit_card,
    delete_credit_card,
    # Empréstimos e financiamentos
    register_loan,
    list_loans,
    get_loan_balance,
    simulate_early_payoff,
    simulate_amortization,
    simulate_accelerated_payment,
    compare_payoff_priority,
    register_loan_payment,
    update_loan,
    delete_loan,
    # Orçamento por categoria
    set_budget,
    get_budget_status,
    check_category_budget,
    delete_budget,
    # Score de saúde financeira
    get_financial_health_score,
    # Empréstimos pessoa-a-pessoa (spec 046)
    list_personal_loans,
    create_personal_loan,
    update_personal_loan,
    register_personal_loan_payment,
    delete_personal_loan,
    # Lista de Compras (spec 045)
    create_shopping_list,
    list_shopping_lists,
    add_shopping_items,
    show_shopping_list,
    check_shopping_item,
    update_shopping_item,
    remove_shopping_item,
    get_frequent_items,
    finish_shopping,
]
