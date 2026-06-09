// Tipos TypeScript para todas as entidades da seção Nami (finanças).
// Espelham os shapes retornados pela API /api/finances/*.

// ── Categoria ─────────────────────────────────────────────────────────────────

/** Uma das 15 categorias fixas de transação (seed no backend). */
export interface Category {
  id: string       // slug: "mercado", "salario", etc.
  name: string     // nome em português: "Mercado"
  icon: string     // nome do ícone Lucide: "ShoppingCart"
  color: string    // oklch(…) — cor de fundo do badge
  kind: 'in' | 'out'  // "in" = receita, "out" = despesa
}

// ── Transação ─────────────────────────────────────────────────────────────────

/** Uma transação financeira (despesa ou receita). */
export interface Transaction {
  id: string
  name: string        // descrição / estabelecimento
  valor: number       // valor em reais (positivo para despesa e receita)
  tipo: string        // "Despesa" | "Receita" (padrão do backend)
  categoria: string   // id da categoria (ex.: "restaurante")
  conta: string       // nome da conta ou cartão de origem
  data: string        // YYYY-MM-DD
  notes?: string
  card_id?: string    // preenchido quando a transação é de cartão
}

// ── Conta ─────────────────────────────────────────────────────────────────────

/** Conta financeira (corrente, poupança, investimentos, dinheiro). */
export interface Account {
  id: string
  name: string
  institution?: string
  type: string        // "corrente" | "poupanca" | "dinheiro" | "investimento"
  balance_inicial: number  // saldo inicial / snapshot atual
  status: string
  // Campos novos adicionados pela migração 002-nami-financas:
  color?: string      // oklch/hex para barra de acento lateral
  short?: string      // sigla de 2 letras (fallback quando sem ícone)
  icon_url?: string   // URL do logo personalizado
}

// ── Cartão de crédito ────────────────────────────────────────────────────────

/** Cartão de crédito com plástico visual. */
export interface Card {
  id: string
  name: string
  account_id?: string
  limite: number
  closing_day: number    // dia de fechamento da fatura (1–28)
  due_day: number        // dia de vencimento (1–28)
  status: string
  // Campos novos adicionados pela migração 002-nami-financas:
  brand?: string         // "Mastercard" | "Visa" | "Elo" | "American Express"
  last4?: string         // últimos 4 dígitos
  grad?: string          // CSS gradient string para o plástico
}

// ── Orçamento ────────────────────────────────────────────────────────────────

/** Envelope de orçamento mensal por categoria. */
export interface Budget {
  id: string
  category_id: string   // slug da categoria
  categoria: string     // alias (algumas respostas usam este campo)
  limit_amount: number  // limite em reais
  month: string         // YYYY-MM-DD (primeiro dia do mês)
  spent?: number        // quanto já foi gasto (calculado pelo backend)
  pct?: number          // percentual gasto (0–100+)
}

// ── Assinatura ───────────────────────────────────────────────────────────────

/** Serviço recorrente com cobrança periódica. */
export interface Subscription {
  id: string
  name: string
  valor: number
  ciclo: string         // "mensal" | "anual"
  next_billing?: string // DATE (YYYY-MM-DD) — mantido para compatibilidade com o bot
  categoria: string
  status: string
  // Campos novos adicionados pela migração 002-nami-financas:
  color?: string
  icon_url?: string
  next_billing_day?: number  // dia do mês (1–28)
}

// ── Empréstimo pessoa-a-pessoa ───────────────────────────────────────────────

/** Empréstimo informal entre pessoas (completamente separado de Financing). */
export interface PersonalLoan {
  id: string
  direction: 'lent' | 'borrowed'  // "lent" = emprestei, "borrowed" = peguei
  person_name: string
  total_amount: number
  installments: number
  paid_installments: number
  next_due_day?: number    // dia do mês (1–28)
  note?: string
  created_at?: string
}

// ── Financiamento estruturado ────────────────────────────────────────────────

/** Financiamento com credor formal e taxa de juros (entidade nova). */
export interface Financing {
  id: string
  description: string   // ex.: "MacBook Pro"
  lender?: string       // ex.: "Nubank"
  total_amount: number
  installments: number
  paid_installments: number
  next_due_day?: number
  interest_rate?: string  // descritivo: "2,1% a.m."
  note?: string
  created_at?: string
}

// ── Estatísticas mensais (derivadas) ────────────────────────────────────────

/** Shape do GET /api/finances/stats?month=YYYY-MM */
export interface StatsResponse {
  month: string
  income: number
  expense: number
  net: number
  income_count: number
  expense_count: number
  prev_month_expense: number
  savings_rate: number      // 0–1 (ex.: 0.25 = 25%)
  patrimonio: number
  patrimonio_liquido: number
  by_category: CategoryStat[]
  daily_spending: DailyEntry[]
  cashflow: MonthlyEntry[]
}

/** Gastos por categoria no mês. */
export interface CategoryStat {
  categoria: string  // slug
  total: number
  pct: number        // percentual sobre total de despesas
}

/** Entradas/saídas em um dia específico. */
export interface DailyEntry {
  day: string     // YYYY-MM-DD
  income: number
  expense: number
}

/** Entradas/saídas de um mês (para o gráfico de fluxo de caixa). */
export interface MonthlyEntry {
  month: string   // YYYY-MM
  income: number
  expense: number
}

// ── Tweaks (preferências visuais) ─────────────────────────────────────────────

/** Preferências visuais persistidas no localStorage. */
export interface Tweaks {
  tema: 'Claro' | 'Escuro'
  acento: 'Tangerina' | 'Azul-maré' | 'Coral' | 'Ouro'
  densidade: 'Confortável' | 'Compacto'
  privacidade: boolean
}
