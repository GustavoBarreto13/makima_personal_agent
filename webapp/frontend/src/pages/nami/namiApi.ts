// Wrapper tipado sobre lib/api.ts para todos os endpoints de /api/finances/*.
// Centraliza URLs e tipos de resposta — componentes não conhecem a URL diretamente.

import { api } from '../../lib/api'
import type {
  Transaction, Account, Card, Budget, Subscription,
  PersonalLoan, Financing, StatsResponse, Category,
  Installment, InstallmentDetail, CardInstallment,
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

  getSubscriptions: (): Promise<{ subscriptions: Subscription[] }> =>
    api.get('/api/finances/subscriptions'),

  createSubscription: (body: {
    name: string; valor: number; ciclo: string;
    next_billing_day?: number; categoria?: string;
    color?: string; icon_url?: string;
  }): Promise<{ status: string }> =>
    api.post('/api/finances/subscriptions', body),

  updateSubscription: (id: string, body: {
    name?: string; valor?: number; ciclo?: string; next_billing?: string;
    conta?: string; status?: string; notes?: string;
    color?: string; icon_url?: string; next_billing_day?: number;
  }): Promise<{ status: string }> =>
    api.patch(`/api/finances/subscriptions/${id}`, body),

  deleteSubscription: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/subscriptions/${id}`),

  // ── Empréstimos pessoa-a-pessoa ───────────────────────────────────────────────

  getPersonalLoans: (): Promise<{ loans: PersonalLoan[] }> =>
    api.get('/api/finances/personal-loans'),

  createPersonalLoan: (body: {
    direction: string; person_name: string; total_amount: number;
    installments: number; paid_installments?: number;
    next_due_day?: number; note?: string;
  }): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/personal-loans', body),

  deletePersonalLoan: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/personal-loans/${id}`),

  // ── Financiamentos ────────────────────────────────────────────────────────────

  getFinancings: (): Promise<{ financings: Financing[] }> =>
    api.get('/api/finances/financings'),

  createFinancing: (body: {
    description: string; lender?: string; total_amount: number;
    installments: number; paid_installments?: number;
    next_due_day?: number; interest_rate?: string; note?: string;
  }): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/financings', body),

  deleteFinancing: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/financings/${id}`),

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
