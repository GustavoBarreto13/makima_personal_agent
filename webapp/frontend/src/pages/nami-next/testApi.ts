// Só para os testes: a API da Nami simulada (todas as chamadas como vi.fn) e dados de exemplo.
// Cada teste pode trocar a resposta de uma chamada com mockResolvedValue; `resetApi` volta ao padrão.

import { vi } from 'vitest'

const inv = (id: string, status: string, total: number, pago: number, items: object[]) => ({
  id, start: '2026-09-07', closing: '2026-10-06', due: '2026-10-13', total, pago, restante: +(total - pago).toFixed(2), status, items,
})

export const DATA = {
  accounts: [
    { id: 'a1', name: 'Itaú', type: 'corrente', balance_inicial: 2500, status: 'ativo' },
    { id: 'a2', name: 'NuConta', type: 'corrente', balance_inicial: 800, status: 'ativo' },
  ],
  cards: [{ id: 'c1', name: 'Nubank', account_id: 'a1', limite: 5000, closing_day: 6, due_day: 13, status: 'ativo', divida_atual: 1840.9 }],
  categories: [
    { id: 'Supermercado', name: 'Supermercado', icon: '', color: '', kind: 'out' },
    { id: 'Lazer', name: 'Lazer', icon: '', color: '', kind: 'out' },
    { id: 'Moradia', name: 'Moradia', icon: '', color: '', kind: 'out' },
    { id: 'Receita', name: 'Receita', icon: '', color: '', kind: 'in' },
  ],
  plan: {
    month: '2026-10', is_current: true, renda_recebida: 5200, renda_pendente: 0, renda_total: 5200, gasto: 2380.5, agendado: 410, pendente: 640,
    a_sair: 1050, livre: 1769.5, livre_por_dia: 63.2, dias_restantes: 28, estourou: false, barra: { gasto: 2380.5, a_sair: 1050, livre: 1769.5 },
    saldo_contas: 4120.35, a_pagar: [], top_categorias: [],
  },
  invoices: {
    card: { id: 'c1', name: 'Nubank', limite: 5000, closing_day: 6, due_day: 13, divida_atual: 1840.9, limite_disponivel: 3159.1 },
    invoices: [
      inv('2026-09', 'atrasada', 640, 0, [{ id: 'i1', name: 'Mercado', valor: 640, data: '2026-08-20', parcelada: false }]),
      inv('2026-10', 'aberta', 1200.9, 0, [{ id: 'i3', name: 'TV 55" (2/10)', valor: 320, data: '2026-09-30', parcelada: true }, { id: 'i4', name: 'iFood', valor: 880.9, data: '2026-10-02', parcelada: false }]),
      inv('2026-11', 'futura', 320, 0, [{ id: 'i8', name: 'TV 55" (3/10)', valor: 320, data: '2026-11-10', parcelada: true }]),
    ],
  },
  recurring: {
    items: [
      { id: 'r1', name: 'Salário', valor: 5200, ciclo: 'mensal', categoria: 'Receita', status: 'ativa', conta: 'Itaú', kind: 'renda', next_billing_day: 5, next_billing: '2026-11-05', cycle_status: 'paga' },
      { id: 'r2', name: 'Freela', valor: 800, ciclo: 'mensal', categoria: 'Receita', status: 'ativa', conta: 'NuConta', kind: 'renda', next_billing_day: 25, next_billing: '2026-10-25', cycle_status: 'pendente' },
      { id: 's1', name: 'Internet', valor: 119.9, ciclo: 'mensal', categoria: 'Moradia', status: 'ativa', conta: 'Itaú', kind: 'conta_fixa', next_billing_day: 8, next_billing: '2026-11-08', cycle_status: 'atrasada' },
      { id: 's3', name: 'Spotify', valor: 21.9, ciclo: 'mensal', categoria: 'Assinaturas', status: 'ativa', conta: 'Nubank', kind: 'assinatura', next_billing_day: 20, next_billing: '2026-10-20', cycle_status: 'pendente', auto_lancar: true },
    ],
    custo_fixo_mensal: 141.8, pendentes_count: 2, renda_pendente: 800,
  },
  stats: {
    period: { year: 2026, month: null, label: '2026' }, previous: { label: '2025' },
    kpis: [
      { key: 'income', label: 'Receitas', value: 42300, prefix: 'R$ ', decimals: 0, prev: 38100 },
      { key: 'expense', label: 'Despesas', value: 31870, prefix: 'R$ ', decimals: 0, prev: 33000 },
      { key: 'savings_rate', label: 'Taxa de poupança', value: 24.7, unit: '%', decimals: 0, absoluteDelta: true, prev: 13.4 },
      { key: 'net_worth', label: 'Patrimônio líquido', value: 2279.45, prefix: 'R$ ', decimals: 0, prev: null },
    ],
    daily: [{ date: '2026-03-02', value: 120 }], monthly: [{ month: 1, value: 3200 }], monthlyUnit: 'R$', distribution: [],
    rankings: { top_categories: { title: 'Onde mais gastei', items: [{ label: 'Moradia', count: 10, total: 15000 }] } }, records: [], moments: [],
    monthly_income: [{ month: 1, value: 4200 }], net_worth: { saldo_contas: 4120.35, divida_cartoes: 1840.9, patrimonio_liquido: 2279.45 },
  },
  budgets: { month: '2026-10', envelopes: [
    { categoria: 'Supermercado', limite: 1500, gasto: 1312.4, restante: 187.6, pct_usado: 87.5, estourado: false },
    { categoria: 'Lazer', limite: 400, gasto: 462, restante: -62, pct_usado: 115.5, estourado: true },
  ] },
  installments: [{ id: 'g1', name: 'TV 55"', total_valor: 3200, num_parcelas: 10, valor_parcela: 320, conta: 'Nubank', card_id: 'c1', categoria: 'Eletronicos', first_due: '2026-09-05', parcelas_pagas: 2, parcelas_pendentes: 8 }],
  loan: { id: 'l1', name: 'Carro Onix', tipo: 'veiculo', sistema_amortizacao: 'PRICE', valor_original: 42000, taxa_juros_mensal: 0.0149, num_parcelas_total: 48, parcelas_pagas: 14, valor_parcela: 1150, primeiro_vencimento: '2025-08-10', conta: 'Itaú', desconto_folha: false, status: 'ativo', saldo_devedor: 31890.5, parcelas_restantes: 34 },
  shopping: {
    list: { id: 'sl1', name: 'Mercado', status: 'ativa' },
    items: [
      { id: 'it1', name: 'Arroz', quantidade: '5kg', preco_estimado: 28, checked: false, ordem: 1 },
      { id: 'it3', name: 'Leite', quantidade: '6un', preco_estimado: 36, checked: true, ordem: 3 },
    ],
    pendentes_count: 1, checked_count: 1, total_estimado: 64,
  },
}

type Fn = ReturnType<typeof vi.fn>
export type TestApi = Record<string, Fn>

export function makeApi(): TestApi {
  const names = [
    'getAccounts', 'getCards', 'getCategories', 'getPlan', 'listTransactions', 'suggestEntry', 'getCardInvoices', 'getRecurringStatus', 'getStats',
    'getAccountsOverview', 'getBudgets', 'createBudget', 'deleteBudget', 'getInstallments', 'getInstallmentDetail', 'getFutureCommitments', 'cancelInstallment', 'deleteInstallment', 'createInstallment',
    'getLoans', 'getPayoffPriority', 'getPersonalLoans', 'payLoanInstallment', 'simulatePayoff', 'simulateAmortization', 'simulateAccelerated', 'registerLoan', 'updateLoan', 'deleteLoan',
    'createPersonalLoan', 'updatePersonalLoan', 'deletePersonalLoan', 'payPersonalLoanInstallment',
    'getShoppingLists', 'getShoppingList', 'getFrequentItems', 'addShoppingItems', 'updateShoppingItem', 'deleteShoppingItem', 'finishShopping', 'createShoppingList', 'updateShoppingList', 'deleteShoppingList',
    'createTransaction', 'createTransfer', 'updateTransaction', 'deleteTransaction', 'deleteTransfer', 'paySubscription', 'payCardBill', 'skipSubscriptionCycle',
    'createSubscription', 'updateSubscription', 'deleteSubscription', 'createAccount', 'updateAccount', 'deleteAccount', 'createCard', 'updateCard', 'deleteCard',
  ]
  const api: TestApi = Object.fromEntries(names.map((n) => [n, vi.fn()]))
  api.exportTransactionsUrl = vi.fn(() => '/api/finances/transactions/export')
  return api
}

/** Volta todas as chamadas ao comportamento padrão (dados de DATA, gravações com sucesso). */
export function resetApi(api: TestApi): void {
  Object.values(api).forEach((m) => m.mockClear())
  const ok = (m: string, v: unknown) => api[m].mockResolvedValue(v)
  ok('getAccounts', { accounts: DATA.accounts }); ok('getCards', { cards: DATA.cards }); ok('getCategories', DATA.categories)
  ok('getPlan', DATA.plan); ok('listTransactions', { transactions: [], has_more: false }); ok('suggestEntry', { suggestions: [] })
  ok('getCardInvoices', DATA.invoices); ok('getRecurringStatus', DATA.recurring); ok('getStats', DATA.stats)
  ok('getAccountsOverview', { accounts: [{ id: 'a1', name: 'Itaú', type: 'corrente', saldo_inicial: 2500, saldo_atual: 3180.35 }, { id: 'a2', name: 'NuConta', type: 'corrente', saldo_inicial: 800, saldo_atual: 940 }], saldo_total: 4120.35 })
  ok('getBudgets', DATA.budgets)
  ok('getInstallments', { installments: DATA.installments }); ok('getFutureCommitments', { month: '2026-11', total_parcelas: 920, total_assinaturas: 301.8, total: 1221.8 })
  ok('getInstallmentDetail', { group: DATA.installments[0], parcelas: [{ id: 'p1', numero: 1, data: '2026-09-05', valor: 320, pago: true, mes_corrente: false }, { id: 'p2', numero: 2, data: '2026-10-05', valor: 320, pago: false, mes_corrente: true }], parcelas_pagas: 1, parcelas_pendentes: 1 })
  ok('getLoans', { loans: [DATA.loan], count: 1 }); ok('getPayoffPriority', { priority: [], recomendacao: '' })
  ok('getPersonalLoans', { loans: [{ id: 'pl1', direction: 'lent', person_name: 'Ana', total_amount: 600, installments: 6, paid_installments: 2, next_due_day: 10 }] })
  ok('getShoppingLists', { lists: [{ id: 'sl1', name: 'Mercado', status: 'ativa' }] }); ok('getShoppingList', DATA.shopping); ok('getFrequentItems', { items: [] })
  ok('addShoppingItems', { status: 'ok', items: [] }); ok('updateShoppingItem', { status: 'ok' }); ok('deleteShoppingItem', { status: 'ok' }); ok('finishShopping', { status: 'ok', transaction_id: 'tx', new_list_id: 'sl2' })
  ok('createTransaction', { status: 'ok', id: 'tx-1' }); ok('createTransfer', { status: 'ok', transfer_id: 't-1' }); ok('deleteTransfer', { status: 'ok', deleted: 2 })
  ok('paySubscription', { status: 'ok', transaction_id: 'tx-9' }); ok('payCardBill', { status: 'ok', transfer_id: 't-2' }); ok('skipSubscriptionCycle', { status: 'ok' })
  ok('createSubscription', { status: 'ok' }); ok('updateSubscription', { status: 'ok' }); ok('deleteSubscription', { status: 'ok' })
  ok('createAccount', { status: 'ok' }); ok('updateAccount', { status: 'ok' }); ok('deleteAccount', { status: 'ok' }); ok('createCard', { status: 'ok' }); ok('updateCard', { status: 'ok' }); ok('deleteCard', { status: 'ok' })
  ok('createBudget', { status: 'ok' }); ok('deleteBudget', { status: 'ok' }); ok('cancelInstallment', { status: 'ok' }); ok('deleteInstallment', { status: 'ok' }); ok('createInstallment', { status: 'ok', group_id: 'g-new' })
  ok('payLoanInstallment', { status: 'ok', parcelas_pagas: 15, parcelas_restantes: 33, saldo_restante: 30500, transaction_id: 'tx', message: 'Parcela 15 registrada' })
  ok('simulatePayoff', { valor_quitacao: 30000, custo_continuar_pagando: 39100, economia_quitando_agora: 9100, message: 'Quitando agora você economiza R$ 9.100,00 em juros.' })
  ok('simulateAmortization', { parcelas_eliminadas: 4, economia_juros: 1200, message: 'Eliminaria 4 parcelas.' }); ok('simulateAccelerated', { meses_atual: 34, meses_novo: 28, meses_economizados: 6, economia_juros: 900, message: 'Terminaria 6 meses antes.' })
  ok('payPersonalLoanInstallment', { status: 'ok', paid_installments: 3, installments: 6 }); ok('registerLoan', { status: 'ok', id: 'l2' }); ok('createPersonalLoan', { status: 'ok', id: 'pl2' })
  ok('updateLoan', { status: 'ok' }); ok('deleteLoan', { status: 'ok' }); ok('updatePersonalLoan', { status: 'ok' }); ok('deletePersonalLoan', { status: 'ok' })
  ok('createShoppingList', { status: 'ok', id: 'sl2' }); ok('updateShoppingList', { status: 'ok' }); ok('deleteShoppingList', { status: 'ok' })
  ok('updateTransaction', { status: 'ok' }); ok('deleteTransaction', { status: 'ok' })
}
