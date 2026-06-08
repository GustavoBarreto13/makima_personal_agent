// Página de assinaturas recorrentes.
// Lista assinaturas ativas com informações de valor, ciclo e próxima cobrança.
// Permite pausar, reativar e criar novas assinaturas.

import { useEffect, useState } from 'react'  // Hooks do React para estado e efeito
import { api } from '../lib/api'              // Wrapper de fetch autenticado

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Representa uma assinatura retornada pelo backend
interface Subscription {
  id:           string   // Identificador único da assinatura
  name:         string   // Nome do serviço (ex: "Spotify", "Netflix")
  valor:        number   // Valor cobrado por ciclo
  ciclo:        string   // "mensal" ou "anual"
  next_billing: string   // Data da próxima cobrança em formato ISO
  conta:        string   // Conta de débito
  categoria:    string   // Categoria (ex: "Assinaturas", "Lazer")
  status:       string   // "ativa", "pausada" ou "cancelada"
}

// Resposta do endpoint GET /api/finances/subscriptions
interface SubscriptionsResponse {
  status:        string         // 'ok' quando a chamada teve sucesso
  subscriptions: Subscription[] // Lista de assinaturas
  total_mensal:  number         // Soma do custo mensal de todas as assinaturas ativas
}

// Resposta genérica de escrita
interface MutationResponse {
  status: string
}

// ── Tipos do formulário ────────────────────────────────────────────────────────────────────────

// Estado do formulário de criação de assinatura
interface FormState {
  nome:         string  // Nome do serviço
  valor:        string  // Valor como string
  ciclo:        string  // "mensal" ou "anual"
  conta:        string  // Conta de débito
  next_billing: string  // Data da próxima cobrança
  categoria:    string  // Categoria
}

// Formulário vazio
const EMPTY_FORM: FormState = {
  nome:         '',
  valor:        '',
  ciclo:        'mensal',
  conta:        '',
  next_billing: new Date().toISOString().split('T')[0],  // Hoje como padrão
  categoria:    'Assinaturas',
}

// Categorias válidas para assinaturas
const CATEGORIAS = [
  'Assinaturas', 'Lazer', 'Educacao', 'Saude', 'Moradia',
  'Transporte', 'Alimentacao', 'Outro',
]

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
 * Retorna as classes Tailwind para o badge de status da assinatura.
 * Verde = ativa, amarelo = pausada, vermelho = cancelada.
 *
 * Args:
 *   status - Status da assinatura.
 *
 * Returns:
 *   String de classes Tailwind.
 */
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'ativa':     return 'bg-green-900 text-green-300'
    case 'pausada':   return 'bg-yellow-900 text-yellow-300'
    case 'cancelada': return 'bg-red-900 text-red-300'
    default:          return 'bg-gray-700 text-t3'
  }
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de assinaturas recorrentes.
 * Lista assinaturas com ações de pausar/reativar e permite criar novas.
 *
 * Returns:
 *   JSX com tabela de assinaturas e modal de criação.
 */
export default function Subscriptions() {
  // Lista de assinaturas carregadas do backend
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  // Total mensal de todas as assinaturas ativas
  const [totalMensal, setTotalMensal] = useState(0)

  // Estado de carregamento
  const [loading, setLoading] = useState(true)

  // Erro ao carregar (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // Controla quais assinaturas estão com operação em andamento (pausar/reativar)
  const [updating, setUpdating] = useState<Record<string, boolean>>({})

  // Visibilidade do modal de criação
  const [modalOpen, setModalOpen] = useState(false)

  // Estado do formulário
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Erro no formulário
  const [formError, setFormError] = useState<string | null>(null)

  // Indica se o formulário está sendo enviado
  const [submitting, setSubmitting] = useState(false)

  // ── Carregamento inicial ──
  useEffect(() => {
    loadSubscriptions()
  }, [])

  /**
   * Busca as assinaturas ativas do backend.
   */
  function loadSubscriptions() {
    setLoading(true)
    setError(null)
    // status=ativa filtra somente assinaturas ativas (não mostra canceladas)
    api.get<SubscriptionsResponse>('/api/finances/subscriptions?status=ativa')
      .then((res) => {
        setSubscriptions(res.subscriptions)
        setTotalMensal(res.total_mensal)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Altera o status de uma assinatura via PATCH.
   * Usado tanto para pausar (ativa → pausada) quanto para reativar (pausada → ativa).
   *
   * Args:
   *   id     - ID da assinatura.
   *   status - Novo status: "ativa" ou "pausada".
   */
  async function updateStatus(id: string, status: string) {
    // Marca esta assinatura como "em atualização" para desabilitar os botões
    setUpdating((prev) => ({ ...prev, [id]: true }))
    try {
      await api.patch<MutationResponse>(`/api/finances/subscriptions/${id}`, { status })
      loadSubscriptions()  // Recarrega após atualizar
    } catch (err) {
      alert(`Erro ao atualizar status: ${(err as Error).message}`)
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }))
    }
  }

  /**
   * Abre o modal de criação de assinatura.
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
  function handleFormChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Envia a nova assinatura para o backend via POST.
   */
  async function handleSubmit() {
    setFormError(null)
    setSubmitting(true)

    // O backend espera o campo "name" (em inglês) para o nome da assinatura
    const payload = {
      name:         form.nome,
      valor:        parseFloat(form.valor),  // Converte string → número
      ciclo:        form.ciclo,
      conta:        form.conta,
      next_billing: form.next_billing,
      categoria:    form.categoria,
    }

    try {
      await api.post<MutationResponse>('/api/finances/subscriptions', payload)
      closeModal()
      loadSubscriptions()  // Recarrega após criar
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
          <h1 className="text-2xl font-bold text-t1">Assinaturas</h1>
          {/* Exibe o total mensal no subtítulo */}
          {!loading && (
            <p className="text-sm text-t3 mt-0.5">
              Total mensal: <span className="text-t1 font-medium">{formatBRL(totalMensal)}</span>
            </p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-t1 text-sm font-medium rounded-lg transition-colors"
        >
          Nova Assinatura
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

      {/* Tabela de assinaturas */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border-base">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-elevated text-t3 text-left">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium">Ciclo</th>
                <th className="px-4 py-3 font-medium">Próxima Cobrança</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-t4">
                    Nenhuma assinatura encontrada.
                  </td>
                </tr>
              )}
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="border-t border-border-base bg-bg-card">
                  <td className="px-4 py-3">
                    <div className="text-t1 font-medium">{sub.name}</div>
                    {/* Categoria como subtexto */}
                    <div className="text-t4 text-xs">{sub.categoria}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-t1 font-medium">
                    {formatBRL(sub.valor)}
                  </td>
                  {/* Badge de ciclo */}
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-700 text-t2 rounded-full text-xs">
                      {sub.ciclo}
                    </span>
                  </td>
                  {/* Data da próxima cobrança formatada.
                      Usamos split para evitar o bug de fuso horário UTC em timezones negativos. */}
                  <td className="px-4 py-3 text-t3">
                    {(() => { const [y, m, d] = (sub.next_billing || '').split('T')[0].split('-'); return `${d}/${m}/${y}` })()}
                  </td>
                  <td className="px-4 py-3 text-t2">{sub.conta}</td>
                  {/* Badge de status com cor dinâmica */}
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(sub.status)}`}>
                      {sub.status}
                    </span>
                  </td>
                  {/* Botões de ação: pausar ou reativar conforme o status atual */}
                  <td className="px-4 py-3 text-center">
                    {sub.status === 'ativa' ? (
                      // Botão pausar: disponível quando a assinatura está ativa
                      <button
                        onClick={() => updateStatus(sub.id, 'pausada')}
                        disabled={updating[sub.id]}
                        className="text-xs text-yellow-400 hover:text-yellow-300 disabled:opacity-50 transition-colors"
                      >
                        {updating[sub.id] ? '...' : 'Pausar'}
                      </button>
                    ) : sub.status === 'pausada' ? (
                      // Botão reativar: disponível quando a assinatura está pausada
                      <button
                        onClick={() => updateStatus(sub.id, 'ativa')}
                        disabled={updating[sub.id]}
                        className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
                      >
                        {updating[sub.id] ? '...' : 'Reativar'}
                      </button>
                    ) : (
                      // Status cancelada: nenhuma ação disponível
                      <span className="text-t4 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal de criação de assinatura ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-bg-card border border-border-base rounded-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-t1 mb-4">Nova Assinatura</h2>

            <div className="space-y-3">

              {/* Nome */}
              <div>
                <label className="block text-sm text-t3 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => handleFormChange('nome', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Netflix"
                />
              </div>

              {/* Valor e ciclo lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-t3 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => handleFormChange('valor', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-t3 mb-1">Ciclo</label>
                  <select
                    value={form.ciclo}
                    onChange={(e) => handleFormChange('ciclo', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>

              {/* Conta */}
              <div>
                <label className="block text-sm text-t3 mb-1">Conta</label>
                <input
                  type="text"
                  value={form.conta}
                  onChange={(e) => handleFormChange('conta', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Nubank"
                />
              </div>

              {/* Próxima cobrança */}
              <div>
                <label className="block text-sm text-t3 mb-1">Próxima Cobrança</label>
                <input
                  type="date"
                  value={form.next_billing}
                  onChange={(e) => handleFormChange('next_billing', e.target.value)}
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
                {submitting ? 'Salvando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
