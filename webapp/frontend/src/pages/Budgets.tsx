// Página de orçamentos mensais por categoria.
// Exibe cada categoria com uma barra de progresso mostrando quanto foi gasto em relação ao limite.
// Permite definir um orçamento mensal para uma categoria específica.

import { useEffect, useState } from 'react'  // Hooks do React para estado e efeito
import { api } from '../lib/api'              // Wrapper de fetch autenticado

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Representa o orçamento de uma categoria no mês atual
interface Budget {
  categoria: string   // Nome da categoria (ex: "Alimentacao")
  limite:    number   // Limite mensal definido para a categoria
  gasto:     number   // Total já gasto nessa categoria no mês
  pct_usado: number   // Percentual usado: (gasto / limite) * 100
}

// Resposta do endpoint GET /api/finances/budgets
interface BudgetsResponse {
  status:  string    // 'ok' quando a chamada teve sucesso
  month:   string    // Mês consultado (ex: "2026-06")
  envelopes: Budget[]  // Lista de orçamentos por categoria (campo retornado pelo backend)
}

// Resposta genérica de escrita
interface MutationResponse {
  status: string
}

// ── Constantes ─────────────────────────────────────────────────────────────────────────────────

// Categorias válidas para orçamentos
const CATEGORIAS = [
  'Alimentacao', 'Comer Fora', 'Saude', 'Lazer', 'Transporte',
  'Moradia', 'Roupas', 'Educacao', 'Assinaturas', 'Viagem',
  'Presente', 'Beleza', 'Academia', 'Farmacia', 'Supermercado',
  'Eletronicos', 'Pet', 'Investimento',
]

// ── Tipos do formulário ────────────────────────────────────────────────────────────────────────

// Estado do formulário de definição de orçamento
interface FormState {
  mes:       string  // Mês no formato YYYY-MM
  categoria: string  // Categoria selecionada
  limite:    string  // Limite como string
}

/**
 * Retorna o mês atual no formato YYYY-MM para usar como valor padrão.
 *
 * Returns:
 *   String no formato "YYYY-MM".
 *
 * Example:
 *   // Em junho/2026:
 *   currentMonth() // → "2026-06"
 */
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Formulário vazio com mês atual pré-preenchido
const EMPTY_FORM: FormState = {
  mes:       currentMonth(),
  categoria: 'Alimentacao',
  limite:    '',
}

// ── Funções auxiliares ─────────────────────────────────────────────────────────────────────────

/**
 * Formata um número como moeda brasileira (R$).
 *
 * Args:
 *   value - Valor numérico a formatar.
 *
 * Returns:
 *   String no formato "R$ 1.234,56".
 */
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Retorna as classes Tailwind de cor para a barra de progresso do orçamento.
 * Verde até 50%, amarelo até 80%, vermelho acima de 80%.
 *
 * Args:
 *   pct - Percentual de uso do orçamento (0-100+).
 *
 * Returns:
 *   String de classes Tailwind para o background da barra.
 */
function progressColor(pct: number): string {
  if (pct > 80) return 'bg-red-500'
  if (pct > 50) return 'bg-yellow-500'
  return 'bg-green-500'
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de orçamentos mensais.
 * Mostra barras de progresso por categoria e permite definir novos limites.
 *
 * Returns:
 *   JSX com lista de orçamentos e modal de criação.
 */
export default function Budgets() {
  // Lista de orçamentos carregados do backend
  const [budgets, setBudgets] = useState<Budget[]>([])

  // Mês exibido (retornado pelo backend)
  const [month, setMonth] = useState('')

  // Estado de carregamento
  const [loading, setLoading] = useState(true)

  // Erro ao carregar (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // Visibilidade do modal de definição de orçamento
  const [modalOpen, setModalOpen] = useState(false)

  // Estado do formulário
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Erro no formulário
  const [formError, setFormError] = useState<string | null>(null)

  // Indica se o formulário está sendo enviado
  const [submitting, setSubmitting] = useState(false)

  // ── Carregamento inicial ──
  useEffect(() => {
    loadBudgets()
  }, [])

  /**
   * Busca os orçamentos do mês atual do backend.
   */
  function loadBudgets() {
    setLoading(true)
    setError(null)
    api.get<BudgetsResponse>('/api/finances/budgets')
      .then((res) => {
        setBudgets(res.envelopes)
        setMonth(res.month)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Abre o modal de definição de orçamento.
   */
  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  /**
   * Fecha o modal.
   */
  function closeModal() {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  /**
   * Atualiza um campo do formulário.
   *
   * Args:
   *   field - Nome do campo.
   *   value - Novo valor.
   */
  async function handleDelete(categoria: string) {
    if (!window.confirm(`Remover o envelope de "${categoria}" em ${month}?`)) return
    try {
      await api.del<MutationResponse>(`/api/finances/budgets/${month}/${encodeURIComponent(categoria)}`)
      loadBudgets()
    } catch (err) {
      alert(`Erro ao remover envelope: ${(err as Error).message}`)
    }
  }

  function handleFormChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Envia o orçamento para o backend via POST.
   */
  async function handleSubmit() {
    setFormError(null)
    setSubmitting(true)

    // O backend espera o campo "month" (em inglês) para o mês do orçamento
    const payload = {
      month:     form.mes,
      categoria: form.categoria,
      limite:    parseFloat(form.limite),  // Converte string → número
    }

    try {
      await api.post<MutationResponse>('/api/finances/budgets', payload)
      closeModal()
      loadBudgets()  // Recarrega após criar
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1">Orçamentos</h1>
          {/* Exibe o mês dos orçamentos carregados */}
          {month && (
            <p className="text-sm text-t3 mt-0.5">{month}</p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-t1 text-sm font-medium rounded-lg transition-colors"
        >
          Definir Orçamento
        </button>
      </div>

      {/* Spinner */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-border-light border-t-t3 rounded-full animate-spin" />
        </div>
      )}

      {/* Erro */}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Sem orçamentos */}
      {!loading && !error && budgets.length === 0 && (
        <p className="text-t4 text-sm">Nenhum orçamento definido para este mês.</p>
      )}

      {/* Lista de orçamentos com barras de progresso */}
      <div className="space-y-3">
        {budgets.map((budget) => (
          <div key={budget.categoria} className="bg-bg-card border border-border-base rounded-xl p-4">
            {/* Linha superior: categoria e valores */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-t1 font-medium">{budget.categoria}</span>
              <div className="text-sm text-right">
                {/* Valor gasto em relação ao limite */}
                <span className={budget.pct_usado > 100 ? 'text-red-400' : 'text-t1'}>
                  {formatBRL(budget.gasto)}
                </span>
                <span className="text-t4"> / {formatBRL(budget.limite)}</span>
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressColor(budget.pct_usado)}`}
                // min para não ultrapassar 100% visualmente (mas pode passar em valor real)
                style={{ width: `${Math.min(budget.pct_usado, 100)}%` }}
              />
            </div>

            {/* Linha inferior: percentual, saldo restante e botão remover */}
            <div className="flex justify-between mt-1.5 text-xs text-t4">
              <span>{budget.pct_usado.toFixed(1)}% usado</span>
              <div className="flex items-center gap-3">
                <span>
                  {budget.gasto <= budget.limite
                    ? `Restam ${formatBRL(budget.limite - budget.gasto)}`
                    : `Excedido em ${formatBRL(budget.gasto - budget.limite)}`
                  }
                </span>
                <button
                  onClick={() => handleDelete(budget.categoria)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  title="Remover envelope"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal de definição de orçamento ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-bg-card border border-border-base rounded-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-t1 mb-4">Definir Orçamento</h2>

            <div className="space-y-3">

              {/* Mês (input type=month aceita formato YYYY-MM) */}
              <div>
                <label className="block text-sm text-t3 mb-1">Mês</label>
                <input
                  type="month"
                  value={form.mes}
                  onChange={(e) => handleFormChange('mes', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm text-t3 mb-1">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={(e) => handleFormChange('categoria', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Limite */}
              <div>
                <label className="block text-sm text-t3 mb-1">Limite (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.limite}
                  onChange={(e) => handleFormChange('limite', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="500.00"
                />
              </div>
            </div>

            {/* Erro */}
            {formError && (
              <p className="mt-3 text-red-400 text-sm">{formError}</p>
            )}

            {/* Botões */}
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-t3 hover:text-t1 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-t1 text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
