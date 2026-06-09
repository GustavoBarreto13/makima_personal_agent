// Wrapper tipado sobre lib/api.ts para todos os endpoints de /api/finances/*.
// Centraliza URLs e tipos de resposta — componentes não conhecem a URL diretamente.

import { api } from '../../lib/api'
import type {
  Transaction, Account, Card, Budget, Subscription,
  PersonalLoan, Financing, StatsResponse, Category,
} from './types'

// ── Stats ─────────────────────────────────────────────────────────────────────

/** Busca estatísticas consolidadas do mês (dashboard). */
export const namiApi = {

  getStats: (month: string): Promise<StatsResponse> =>
    api.get(`/api/finances/stats?month=${month}`),

  // ── Categorias ───────────────────────────────────────────────────────────────

  getCategories: (): Promise<Category[]> =>
    api.get('/api/finances/categories'),

  // ── Transações ───────────────────────────────────────────────────────────────

  getTransactions: (month: string): Promise<{ transactions: Transaction[] }> =>
    api.get(`/api/finances/transactions?start_date=${month}-01&end_date=${month}-31`),

  createTransaction: (body: {
    name: string; valor: number; tipo: string; categoria: string;
    conta?: string; card_id?: string; data?: string; notes?: string;
  }): Promise<{ status: string; id: string }> =>
    api.post('/api/finances/transactions', body),

  deleteTransaction: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/transactions/${id}`),

  // ── Contas ───────────────────────────────────────────────────────────────────

  getAccounts: (): Promise<{ accounts: Account[] }> =>
    api.get('/api/finances/accounts'),

  createAccount: (body: {
    name: string; type: string; balance_inicial: number;
    color?: string; short?: string; icon_url?: string;
  }): Promise<{ status: string }> =>
    api.post('/api/finances/accounts', body),

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

  deleteCard: (id: string): Promise<{ status: string }> =>
    api.del(`/api/finances/cards/${id}`),

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
