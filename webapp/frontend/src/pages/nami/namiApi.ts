// Wrapper tipado sobre lib/api.ts para todos os endpoints de /api/finances/*.
// Centraliza URLs e tipos de resposta — componentes não conhecem a URL diretamente.

import { api } from '../../lib/api'
import type {
  Transaction, Account, Card, Budget, Subscription,
  PersonalLoan, BankLoan, PayoffPriorityItem, StatsResponse, Category,
  Installment, InstallmentDetail, CardInstallment,
  RecurringStatusResponse, ShoppingList, ShoppingListDetail, ShoppingItem, FrequentItem,
} from './types'

// ── Stats ─────────────────────────────────────────────────────────────────────

/** Busca estatísticas consolidadas do mês (dashboard). */
export const namiApi = {

  getStats: (month: string): Promise<StatsResponse> =>
    api.get(`/api/finances/stats?month=${month}`),

  /** Score de saúde financeira 0-100 com 4 dimensões (spec 042). Mês vazio = mês atual. */
  getHealth: (month: string = ''): Promise<{
    score: number
    breakdown: { taxa_gasto: number; taxa_poupanca: number; comprometimento_futuro: number; divida_cartao: number }
    message: string
  }> =>
    api.get(`/api/finances/health${month ? `?month=${month}` : ''}`),

  /** Evolução mensal de gastos + projeção do mês corrente (spec 042). */
  getTrend: (months: number = 6): Promise<{
    trend: Record<string, number>
    current_month_projected: number
  }> =>
    api.get(`/api/finances/trend?months=${months}`),

  // ── Categorias ───────────────────────────────────────────────────────────────

  getCategories: (): Promise<Category[]> =>
    api.get('/api/finances/categories'),

  // ── Transações ───────────────────────────────────────────────────────────────

  /** Calcula o último dia real de um mês YYYY-MM (evita datas inválidas tipo "06-31"). */
  _monthBounds: (month: string): { start: string; end: string } => {
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
  },

  getTransactions: (
    month: string,
    opts?: { categoria?: string; tipo?: string; limit?: number; offset?: number },
  ): Promise<{ transactions: Transaction[]; has_more?: boolean }> => {
    const { start, end } = namiApi._monthBounds(month)
    const params = new URLSearchParams({ start_date: start, end_date: end })
    if (opts?.categoria) params.set('categoria', opts.categoria)
    if (opts?.tipo)      params.set('tipo', opts.tipo)
    if (opts?.limit)     params.set('limit', String(opts.limit))
    if (opts?.offset)    params.set('offset', String(opts.offset))
    return api.get(`/api/finances/transactions?${params.toString()}`)
  },

  /** Monta a URL de exportação CSV (spec 043) — navegação same-origin já leva o cookie de sessão. */
  exportTransactionsUrl: (month: string, opts?: { categoria?: string; tipo?: string }): string => {
    const { start, end } = namiApi._monthBounds(month)
    const params = new URLSearchParams({ start_date: start, end_date: end })
    if (opts?.categoria) params.set('categoria', opts.categoria)
    if (opts?.tipo)      params.set('tipo', opts.tipo)
    return `/api/finances/transactions/export?${params.toString()}`
  },

  createTransaction: (body: {
    name: string; valor: number; tipo: string; categoria: string;
    conta?: string; card_id?: string; data?: string; notes?: string;
    person_ids?: string[];
  }): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/transactions', body),

  updateTransaction: (id: string, body: {
    name?: string; valor?: number; tipo?: string; categoria?: string;
    conta?: string; card_id?: string; data?: string; notes?: string;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/transactions/${id}`, body),

  deleteTransaction: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/transactions/${id}`),

  /** Transferência atômica entre duas contas (spec 043) — exclui de receita/despesa. */
  createTransfer: (body: {
    from_account: string; to_account: string; valor: number; data?: string; notes?: string;
  }): Promise<{ status: string; transfer_id: string }> =>
    api.post('/api/finances/transfers', body),

  // ── Contas ───────────────────────────────────────────────────────────────────

  getAccounts: (): Promise<{ accounts: Account[] }> =>
    api.get('/api/finances/accounts'),

  createAccount: (body: {
    name: string; type: string; balance_inicial: number;
    color?: string; short?: string; icon_url?: string;
  }): Promise<{ status: string }> =>
    api.post('/api/finances/accounts', body),

  updateAccount: (id: string, body: {
    name?: string; institution?: string; notes?: string; balance_inicial?: number;
    color?: string; short?: string; icon_url?: string;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/accounts/${id}`, body),

  deleteAccount: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/accounts/${id}`),

  // ── Cartões ──────────────────────────────────────────────────────────────────

  getCards: (): Promise<{ cards: Card[] }> =>
    api.get('/api/finances/cards'),

  createCard: (body: {
    name: string; account_name: string; limite: number;
    closing_day: number; due_day: number;
    brand?: string; last4?: string; grad?: string;
  }): Promise<{ status: string }> =>
    api.post('/api/finances/cards', body),

  updateCard: (id: string, body: {
    name?: string; limite?: number; taxa_juros_mensal?: number;
    closing_day?: number; due_day?: number;
    brand?: string; last4?: string; grad?: string;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/cards/${id}`, body),

  deleteCard: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/cards/${id}`),

  /** Registra pagamento de fatura — reduz a dívida calculada em getCards (spec 042). */
  payCardBill: (cardId: string, valor: number, data?: string): Promise<{ status: string }> =>
    api.post(`/api/finances/cards/${cardId}/payment`, { valor, data: data || '' }),

  // ── Orçamentos ───────────────────────────────────────────────────────────────

  getBudgets: (month: string): Promise<{ budgets: Budget[] }> =>
    api.get(`/api/finances/budgets?month=${month}`),

  createBudget: (body: {
    month: string; categoria: string; limite: number;
  }): Promise<{ status: string }> =>
    api.post('/api/finances/budgets', body),

  deleteBudget: (month: string, categoria: string): Promise<{ status: string }> =>
    api.del(`/api/finances/budgets/${month}/${categoria}`),

  // ── Assinaturas ──────────────────────────────────────────────────────────────

  /** kind (spec 044): 'assinatura' | 'conta_fixa' — vazio/omitido traz ambos. */
  getSubscriptions: (status: string = 'ativa', kind?: string): Promise<{ subscriptions: Subscription[] }> =>
    api.get(`/api/finances/subscriptions?status=${status}${kind ? `&kind=${kind}` : ''}`),

  createSubscription: (body: {
    name: string; valor: number; ciclo: string;
    next_billing_day?: number; categoria?: string;
    color?: string; icon_url?: string; conta?: string;
    kind?: 'assinatura' | 'conta_fixa'; auto_lancar?: boolean;
  }): Promise<{ status: string }> =>
    api.post('/api/finances/subscriptions', body),

  updateSubscription: (id: string, body: {
    name?: string; valor?: number; ciclo?: string; next_billing?: string;
    conta?: string; status?: string; notes?: string;
    color?: string; icon_url?: string; next_billing_day?: number;
    kind?: 'assinatura' | 'conta_fixa'; auto_lancar?: boolean;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/subscriptions/${id}`, body),

  deleteSubscription: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/subscriptions/${id}`),

  // ── Contas Fixas (spec 044) ────────────────────────────────────────────────

  /** Status do ciclo corrente de cada recorrência (paga/pendente/atrasada/agendada). */
  getRecurringStatus: (kind?: string): Promise<RecurringStatusResponse> =>
    api.get(`/api/finances/recurring-status${kind ? `?kind=${kind}` : ''}`),

  /** Confirma o pagamento com o valor real — lança a despesa e rola o vencimento (atômico). */
  paySubscription: (id: string, body: { valor: number; data?: string; conta?: string }): Promise<{ status: string; transaction_id: string }> =>
    api.post(`/api/finances/subscriptions/${id}/pay`, body),

  /** Pula o ciclo corrente sem lançar despesa. */
  skipSubscriptionCycle: (id: string): Promise<{ status: string }> =>
    api.post(`/api/finances/subscriptions/${id}/skip`, {}),

  // ── Empréstimos pessoa-a-pessoa (spec 046) ────────────────────────────────────

  getPersonalLoans: (direction?: string): Promise<{ loans: PersonalLoan[] }> =>
    api.get(`/api/finances/personal-loans${direction ? `?direction=${direction}` : ''}`),

  createPersonalLoan: (body: {
    direction: string; person_name: string; total_amount: number;
    installments: number; paid_installments?: number;
    next_due_day?: number; note?: string;
  }): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/personal-loans', body),

  updatePersonalLoan: (id: string, body: {
    person_name?: string; total_amount?: number; installments?: number;
    paid_installments?: number; next_due_day?: number; note?: string;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/personal-loans/${id}`, body),

  /** Registra parcela paga do empréstimo p2p — só avança o contador, sem lançar despesa. */
  payPersonalLoanInstallment: (id: string): Promise<{ status: string; paid_installments: number; installments: number }> =>
    api.post(`/api/finances/personal-loans/${id}/payment`, {}),

  deletePersonalLoan: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/personal-loans/${id}`),

  // ── Empréstimos bancários / financiamentos unificados (spec 046) ─────────────

  getLoans: (status: string = 'ativo'): Promise<{ loans: BankLoan[]; count: number }> =>
    api.get(`/api/finances/loans?status=${status}`),

  registerLoan: (body: {
    nome: string; tipo: string; sistema?: string; valor_original: number;
    taxa_juros_mensal: number; prazo_meses: number; parcelas_pagas?: number;
    valor_parcela: number; data_inicio?: string; conta: string;
  }): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/loans', body),

  updateLoan: (id: string, body: {
    name?: string; notes?: string; status?: string; parcelas_pagas?: number;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/loans/${id}`, body),

  deleteLoan: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/loans/${id}`),

  /** Registra a parcela do mês — avança o contador, recalcula saldo e lança a despesa. */
  payLoanInstallment: (id: string, data?: string): Promise<{
    status: string; parcelas_pagas: number; parcelas_restantes: number;
    saldo_restante: number; transaction_id: string; message: string
  }> =>
    api.post(`/api/finances/loans/${id}/payment`, { data: data ?? '' }),

  simulatePayoff: (id: string): Promise<{
    valor_quitacao: number; custo_continuar_pagando: number; economia_quitando_agora: number; message: string
  }> =>
    api.post(`/api/finances/loans/${id}/simulate/payoff`, {}),

  simulateAmortization: (id: string, extra_value: number): Promise<{
    parcelas_eliminadas: number; economia_juros: number; message: string
  }> =>
    api.post(`/api/finances/loans/${id}/simulate/amortization`, { extra_value }),

  simulateAccelerated: (id: string, extra_monthly: number): Promise<{
    meses_atual: number; meses_novo: number; meses_economizados: number; economia_juros: number; message: string
  }> =>
    api.post(`/api/finances/loans/${id}/simulate/accelerated`, { extra_monthly }),

  getPayoffPriority: (): Promise<{ priority: PayoffPriorityItem[]; recomendacao: string }> =>
    api.get('/api/finances/loans/priority'),

  // ── Parcelamentos (compras parceladas) ────────────────────────────────────────

  getInstallments: (status: string = 'ativo'): Promise<{ installments: Installment[] }> =>
    api.get(`/api/finances/installments?status=${status}`),

  getInstallmentDetail: (id: string): Promise<InstallmentDetail> =>
    api.get(`/api/finances/installments/${id}`),

  createInstallment: (body: {
    name: string; valor_total: number; num_parcelas: number;
    conta?: string; card_id?: string; categoria?: string; data_inicio?: string;
  }): Promise<{ status: string; group_id: string }> =>
    api.post('/api/finances/installments', body),

  cancelInstallment: (id: string): Promise<{ status: string }> =>
    api.post(`/api/finances/installments/${id}/cancel`, {}),

  deleteInstallment: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/installments/${id}`),

  getFutureCommitments: (month: string): Promise<{
    month: string; total_parcelas: number; total_assinaturas: number; total: number
  }> =>
    api.get(`/api/finances/commitments/${month}`),

  getCardInstallments: (cardId: string): Promise<{
    installments: CardInstallment[]; monthly_commitment: number; ends_month: string | null
  }> =>
    api.get(`/api/finances/cards/${cardId}/installments`),

  // ── Lista de Compras (spec 045) ────────────────────────────────────────────

  getShoppingLists: (status: string = 'ativa'): Promise<{ lists: ShoppingList[] }> =>
    api.get(`/api/finances/shopping-lists?status=${status}`),

  createShoppingList: (name: string): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/shopping-lists', { name }),

  getShoppingList: (listId: string): Promise<ShoppingListDetail> =>
    api.get(`/api/finances/shopping-lists/${listId}`),

  /** Adiciona um ou mais itens numa frase só (ex.: "arroz, feijão 2kg, leite"). */
  addShoppingItems: (listId: string, items: string): Promise<{ status: string; items: ShoppingItem[] }> =>
    api.post(`/api/finances/shopping-lists/${listId}/items`, { items }),

  updateShoppingItem: (itemId: string, body: {
    name?: string; quantidade?: string; unidade?: string; preco_estimado?: number; checked?: boolean;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/shopping-items/${itemId}`, body),

  deleteShoppingItem: (itemId: string): Promise<{ status: string }> =>
    api.del(`/api/finances/shopping-items/${itemId}`),

  /** Lança a despesa (Supermercado) e arquiva a lista — atômico; abre a próxima lista ativa. */
  finishShopping: (listId: string, body: { valor_total: number; conta?: string; card_id?: string }): Promise<{
    status: string; transaction_id: string; new_list_id: string
  }> =>
    api.post(`/api/finances/shopping-lists/${listId}/finish`, body),

  getFrequentItems: (limit: number = 10): Promise<{ items: FrequentItem[] }> =>
    api.get(`/api/finances/shopping-lists/frequent?limit=${limit}`),

  // ── Upload de ícone ───────────────────────────────────────────────────────────

  uploadIcon: async (file: File): Promise<{ url: string }> => {
    // Usa fetch direto pois api.post não suporta multipart/form-data
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/finances/uploads/icon', {
      method: 'POST',
      body: form,
      credentials: 'include',  // envia o cookie de sessão
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Erro ao enviar imagem')
    }
    return res.json()
  },
}
