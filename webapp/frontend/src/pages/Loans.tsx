// Página de empréstimos e financiamentos.
// Lista os empréstimos ativos com informações de parcelas e valor.
// Permite ver o saldo devedor atualizado e cadastrar novos empréstimos.

import { useEffect, useState } from 'react'  // Hooks do React para estado e efeito
import { api } from '../lib/api'              // Wrapper de fetch autenticado

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Representa um empréstimo retornado pelo backend
interface Loan {
  id:                  string   // Identificador único do empréstimo
  nome:                string   // Nome/descrição do empréstimo (ex: "Carro Fiesta")
  tipo:                string   // Tipo: veiculo, consignado, pessoal, imobiliario, outro
  sistema:             string   // Sistema de amortização: PRICE ou SAC
  valor_original:      number   // Valor total original do empréstimo
  taxa_juros_mensal:   number   // Taxa de juros mensal em percentual (ex: 1.5 para 1,5%)
  num_parcelas:        number   // Número total de parcelas
  parcelas_pagas:      number   // Quantas parcelas já foram pagas
  valor_parcela:       number   // Valor de cada parcela
  status:              string   // Status: "ativo", "quitado", etc.
}

// Resposta do endpoint GET /api/finances/loans
interface LoansResponse {
  status: string   // 'ok' quando a chamada teve sucesso
  loans:  Loan[]   // Lista de empréstimos
}

// Resposta do endpoint GET /api/finances/loans/{id}/balance
interface LoanBalanceResponse {
  status:         string  // 'ok' quando a chamada teve sucesso
  saldo_devedor:  number  // Saldo devedor atual (quanto ainda falta pagar)
}

// Resposta genérica de operações de escrita
interface MutationResponse {
  status: string
}

// ── Tipos do formulário ────────────────────────────────────────────────────────────────────────

// Estado do formulário de criação de empréstimo
interface FormState {
  nome:            string  // Nome do empréstimo
  tipo:            string  // Tipo do empréstimo
  sistema:         string  // PRICE ou SAC
  valor_original:  string  // Valor original como string
  taxa_mensal:     string  // Taxa mensal em %
  prazo:           string  // Número total de parcelas
  parcelas_pagas:  string  // Parcelas já pagas no momento do cadastro
  valor_parcela:   string  // Valor da parcela
  data_inicio:     string  // Data da primeira parcela
  conta:           string  // Conta de débito
}

// Formulário vazio
const EMPTY_FORM: FormState = {
  nome:           '',
  tipo:           'pessoal',
  sistema:        'PRICE',
  valor_original: '',
  taxa_mensal:    '',
  prazo:          '',
  parcelas_pagas: '0',
  valor_parcela:  '',
  data_inicio:    new Date().toISOString().split('T')[0],
  conta:          '',
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

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de empréstimos e financiamentos.
 * Lista empréstimos com progresso de parcelas e saldo devedor consultável.
 *
 * Returns:
 *   JSX com tabela de empréstimos e modal de criação.
 */
export default function Loans() {
  // Lista de empréstimos carregados do backend
  const [loans, setLoans] = useState<Loan[]>([])

  // Estado de carregamento
  const [loading, setLoading] = useState(true)

  // Erro ao carregar (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // Saldos devedores por empréstimo: mapa de id → saldo devedor
  const [balances, setBalances] = useState<Record<string, number | undefined>>({})

  // Controla quais empréstimos estão com saldo sendo carregado
  const [loadingBalance, setLoadingBalance] = useState<Record<string, boolean>>({})

  // Controla visibilidade do modal de criação
  const [modalOpen, setModalOpen] = useState(false)

  // Estado do formulário
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Erro no formulário
  const [formError, setFormError] = useState<string | null>(null)

  // Indica se o formulário está sendo enviado
  const [submitting, setSubmitting] = useState(false)

  // ── Carregamento inicial ──
  useEffect(() => {
    loadLoans()
  }, [])

  /**
   * Busca todos os empréstimos do backend.
   */
  function loadLoans() {
    setLoading(true)
    setError(null)
    api.get<LoansResponse>('/api/finances/loans')
      .then((res) => setLoans(res.loans))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Busca o saldo devedor de um empréstimo específico.
   *
   * Args:
   *   loanId - ID do empréstimo.
   */
  async function fetchBalance(loanId: string) {
    setLoadingBalance((prev) => ({ ...prev, [loanId]: true }))
    try {
      const res = await api.get<LoanBalanceResponse>(`/api/finances/loans/${loanId}/balance`)
      setBalances((prev) => ({ ...prev, [loanId]: res.saldo_devedor }))
    } catch (err) {
      alert(`Erro ao buscar saldo: ${(err as Error).message}`)
    } finally {
      setLoadingBalance((prev) => ({ ...prev, [loanId]: false }))
    }
  }

  /**
   * Abre o modal de criação de empréstimo.
   */
  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  /**
   * Fecha o modal e limpa o estado.
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
  async function handleDelete(loanId: string, nome: string) {
    if (!window.confirm(`Deseja realmente apagar o empréstimo "${nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      await api.del<MutationResponse>(`/api/finances/loans/${loanId}`)
      loadLoans()
    } catch (err) {
      alert(`Erro ao apagar empréstimo: ${(err as Error).message}`)
    }
  }

  function handleFormChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Envia o formulário de criação de empréstimo via POST.
   */
  async function handleSubmit() {
    setFormError(null)
    setSubmitting(true)

    const payload = {
      nome:            form.nome,
      tipo:            form.tipo,
      sistema:         form.sistema,
      valor_original:  parseFloat(form.valor_original),
      taxa_juros_mensal: parseFloat(form.taxa_mensal),
      prazo_meses:     parseInt(form.prazo, 10),           // parseInt com base 10 para evitar bugs; backend espera "prazo_meses"
      parcelas_pagas:  parseInt(form.parcelas_pagas, 10),
      valor_parcela:   parseFloat(form.valor_parcela),
      data_inicio:     form.data_inicio,
      conta:           form.conta,
    }

    try {
      await api.post<MutationResponse>('/api/finances/loans', payload)
      closeModal()
      loadLoans()  // Recarrega após criar com sucesso
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
        <h1 className="text-2xl font-bold text-t1">Empréstimos</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-t1 text-sm font-medium rounded-lg transition-colors"
        >
          Registrar Empréstimo
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

      {/* Tabela de empréstimos */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border-base">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-elevated text-t3 text-left">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Sistema</th>
                <th className="px-4 py-3 font-medium">Parcelas</th>
                <th className="px-4 py-3 font-medium text-right">Valor Parcela</th>
                <th className="px-4 py-3 font-medium">Saldo Devedor</th>
                <th className="px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-t4">
                    Nenhum empréstimo encontrado.
                  </td>
                </tr>
              )}
              {loans.map((loan) => (
                <tr key={loan.id} className="border-t border-border-base bg-bg-card">
                  <td className="px-4 py-3 text-t1 font-medium">{loan.nome}</td>
                  {/* Badge de tipo */}
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-700 text-t2 rounded-full text-xs">
                      {loan.tipo}
                    </span>
                  </td>
                  {/* Badge de sistema de amortização */}
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-900 text-blue-300 rounded-full text-xs">
                      {loan.sistema}
                    </span>
                  </td>
                  {/* Progresso de parcelas: pagas / total */}
                  <td className="px-4 py-3 text-t2">
                    {loan.parcelas_pagas}/{loan.num_parcelas}
                    {/* Barra de progresso das parcelas.
                        Guarda contra divisão por zero quando num_parcelas === 0. */}
                    <div className="w-24 h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: loan.num_parcelas > 0
                          ? `${Math.round((loan.parcelas_pagas / loan.num_parcelas) * 100)}%`
                          : '0%'
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-t1">
                    {formatBRL(loan.valor_parcela)}
                  </td>
                  {/* Coluna de saldo devedor com spinner inline */}
                  <td className="px-4 py-3 text-t1">
                    {loadingBalance[loan.id] ? (
                      <div className="w-4 h-4 border-2 border-border-light border-t-t3 rounded-full animate-spin" />
                    ) : balances[loan.id] !== undefined ? (
                      <span className="font-medium text-orange-400">
                        {formatBRL(balances[loan.id]!)}
                      </span>
                    ) : (
                      <span className="text-t4">—</span>
                    )}
                  </td>
                  {/* Botões de ação: ver saldo e apagar */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-3 justify-center">
                      <button
                        onClick={() => fetchBalance(loan.id)}
                        disabled={loadingBalance[loan.id]}
                        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                      >
                        Ver Saldo
                      </button>
                      <button
                        onClick={() => handleDelete(loan.id, loan.nome)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal de criação de empréstimo ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-bg-card border border-border-base rounded-xl p-6 w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-t1 mb-4">Registrar Empréstimo</h2>

            <div className="space-y-3">

              {/* Nome */}
              <div>
                <label className="block text-sm text-t3 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => handleFormChange('nome', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Carro Fiesta"
                />
              </div>

              {/* Tipo e Sistema lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-t3 mb-1">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => handleFormChange('tipo', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="veiculo">Veículo</option>
                    <option value="consignado">Consignado</option>
                    <option value="pessoal">Pessoal</option>
                    <option value="imobiliario">Imobiliário</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-t3 mb-1">Sistema</label>
                  <select
                    value={form.sistema}
                    onChange={(e) => handleFormChange('sistema', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="PRICE">PRICE</option>
                    <option value="SAC">SAC</option>
                  </select>
                </div>
              </div>

              {/* Valor original e taxa mensal */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-t3 mb-1">Valor Original (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_original}
                    onChange={(e) => handleFormChange('valor_original', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-t3 mb-1">Taxa Mensal (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.taxa_mensal}
                    onChange={(e) => handleFormChange('taxa_mensal', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="1.50"
                  />
                </div>
              </div>

              {/* Prazo e parcelas pagas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-t3 mb-1">Prazo (meses)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.prazo}
                    onChange={(e) => handleFormChange('prazo', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="48"
                  />
                </div>
                <div>
                  <label className="block text-sm text-t3 mb-1">Parcelas Pagas</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.parcelas_pagas}
                    onChange={(e) => handleFormChange('parcelas_pagas', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Valor da parcela */}
              <div>
                <label className="block text-sm text-t3 mb-1">Valor da Parcela (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor_parcela}
                  onChange={(e) => handleFormChange('valor_parcela', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="0.00"
                />
              </div>

              {/* Data de início e conta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-t3 mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => handleFormChange('data_inicio', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-t3 mb-1">Conta</label>
                  <input
                    type="text"
                    value={form.conta}
                    onChange={(e) => handleFormChange('conta', e.target.value)}
                    className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: Bradesco"
                  />
                </div>
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
                {submitting ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
