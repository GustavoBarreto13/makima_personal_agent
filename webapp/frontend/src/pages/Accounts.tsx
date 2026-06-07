// Página de gerenciamento de contas bancárias.
// Lista as contas ativas do usuário e permite criar novas contas.
// Cada conta tem um botão "Ver Saldo" que busca o saldo atual inline.

import { useEffect, useState } from 'react'  // Hooks do React para estado e efeito
import { api } from '../lib/api'              // Wrapper de fetch autenticado

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Representa uma conta bancária retornada pelo backend
interface Account {
  id:         string   // Identificador único da conta
  name:       string   // Nome da conta (ex: "Nubank", "Bradesco Corrente")
  type:       string   // Tipo: corrente, poupança, dinheiro, investimento
  created_at: string   // Data de criação em formato ISO
}

// Resposta do endpoint GET /api/finances/accounts
interface AccountsResponse {
  status:   string     // 'ok' quando a chamada teve sucesso
  accounts: Account[]  // Lista de contas retornadas
}

// Resposta do endpoint GET /api/finances/accounts/{id}/balance
interface BalanceResponse {
  status:  string  // 'ok' quando a chamada teve sucesso
  saldo_atual: number  // Saldo atual da conta (campo retornado pelo backend)
}

// Resposta genérica de operações de escrita
interface MutationResponse {
  status: string
}

// ── Tipos do formulário ────────────────────────────────────────────────────────────────────────

// Estado do formulário de criação de conta
interface FormState {
  nome:          string  // Nome da conta
  tipo:          string  // Tipo: corrente / poupança / dinheiro / investimento
  saldo_inicial: string  // Saldo inicial como string (input retorna string)
  data_inicio:   string  // Data de início da conta no formato YYYY-MM-DD
}

// Formulário vazio para resetar após salvar ou cancelar
const EMPTY_FORM: FormState = {
  nome:          '',
  tipo:          'corrente',
  saldo_inicial: '0',
  data_inicio:   new Date().toISOString().split('T')[0],  // Hoje como padrão
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
 * Página de contas bancárias.
 * Lista contas ativas com opção de ver saldo e criar novas contas.
 *
 * Returns:
 *   JSX com tabela de contas e modal de criação.
 */
export default function Accounts() {
  // Lista de contas carregadas do backend
  const [accounts, setAccounts] = useState<Account[]>([])

  // Estado de carregamento
  const [loading, setLoading] = useState(true)

  // Erro ao carregar lista (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // Saldos por conta: mapa de account_id → saldo (undefined = ainda não carregado)
  const [balances, setBalances] = useState<Record<string, number | undefined>>({})

  // Indica quais contas estão com o saldo sendo carregado (para mostrar spinner inline)
  const [loadingBalance, setLoadingBalance] = useState<Record<string, boolean>>({})

  // Controla visibilidade do modal de criação
  const [modalOpen, setModalOpen] = useState(false)

  // Estado do formulário de criação
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Erro no formulário (null = sem erro)
  const [formError, setFormError] = useState<string | null>(null)

  // Indica se o formulário está sendo submetido
  const [submitting, setSubmitting] = useState(false)

  // ── Carregamento inicial ──
  useEffect(() => {
    loadAccounts()
  }, [])

  /**
   * Busca a lista de contas ativas do backend.
   */
  function loadAccounts() {
    setLoading(true)
    setError(null)
    // status=ativo filtra apenas contas ativas
    api.get<AccountsResponse>('/api/finances/accounts?status=ativo')
      .then((res) => setAccounts(res.accounts))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Busca o saldo de uma conta específica e armazena no estado de saldos.
   *
   * Args:
   *   accountId - ID da conta cujo saldo será buscado.
   */
  async function fetchBalance(accountId: string) {
    // Marca esta conta como "carregando saldo"
    setLoadingBalance((prev) => ({ ...prev, [accountId]: true }))
    try {
      const res = await api.get<BalanceResponse>(`/api/finances/accounts/${accountId}/balance`)
      // Armazena o saldo no mapa de saldos indexado pelo ID da conta
      setBalances((prev) => ({ ...prev, [accountId]: res.saldo_atual }))
    } catch (err) {
      alert(`Erro ao buscar saldo: ${(err as Error).message}`)
    } finally {
      // Remove o indicador de carregamento desta conta
      setLoadingBalance((prev) => ({ ...prev, [accountId]: false }))
    }
  }

  /**
   * Abre o modal de criação de conta.
   */
  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  /**
   * Fecha o modal e limpa o estado do formulário.
   */
  function closeModal() {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  /**
   * Atualiza um campo do formulário quando o usuário digita.
   *
   * Args:
   *   field - Nome do campo.
   *   value - Novo valor.
   */
  function handleFormChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Envia o formulário de criação de conta para o backend (POST).
   */
  async function handleSubmit() {
    setFormError(null)
    setSubmitting(true)

    // O backend espera os campos em inglês: name, type, balance_inicial, data_inicio
    const payload = {
      name:           form.nome,
      type:           form.tipo,
      balance_inicial: parseFloat(form.saldo_inicial),  // Converte string → número
      data_inicio:    form.data_inicio,
    }

    try {
      await api.post<MutationResponse>('/api/finances/accounts', payload)
      closeModal()
      loadAccounts()  // Recarrega a lista após criar com sucesso
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Contas</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Nova Conta
        </button>
      </div>

      {/* Spinner de carregamento */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Mensagem de erro ao carregar */}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Tabela de contas */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Criada em</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Nenhuma conta encontrada.
                  </td>
                </tr>
              )}
              {accounts.map((account) => (
                <tr key={account.id} className="border-t border-gray-800 bg-gray-900">
                  <td className="px-4 py-3 text-white font-medium">{account.name}</td>
                  {/* Badge de tipo da conta */}
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full text-xs">
                      {account.type}
                    </span>
                  </td>
                  {/* Data de criação formatada em português.
                      Usamos split para evitar o bug de fuso horário UTC em timezones negativos. */}
                  <td className="px-4 py-3 text-gray-400">
                    {(() => { const [y, m, d] = (account.created_at || '').split('T')[0].split('-'); return `${d}/${m}/${y}` })()}
                  </td>
                  {/* Coluna de saldo: mostra spinner, valor ou vazio */}
                  <td className="px-4 py-3 text-gray-200">
                    {loadingBalance[account.id] ? (
                      // Spinner inline enquanto o saldo está sendo buscado
                      <div className="w-4 h-4 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                    ) : balances[account.id] !== undefined ? (
                      // Saldo carregado: exibe formatado
                      <span className="font-medium text-green-400">
                        {formatBRL(balances[account.id]!)}
                      </span>
                    ) : (
                      // Saldo ainda não solicitado
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  {/* Botão para buscar o saldo desta conta */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => fetchBalance(account.id)}
                      disabled={loadingBalance[account.id]}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                    >
                      Ver Saldo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal de criação de conta ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white mb-4">Nova Conta</h2>

            <div className="space-y-3">

              {/* Nome da conta */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => handleFormChange('nome', e.target.value)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Nubank"
                />
              </div>

              {/* Tipo da conta */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => handleFormChange('tipo', e.target.value)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="investimento">Investimento</option>
                </select>
              </div>

              {/* Saldo inicial */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Saldo Inicial (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.saldo_inicial}
                  onChange={(e) => handleFormChange('saldo_inicial', e.target.value)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="0.00"
                />
              </div>

              {/* Data de início */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Data de Início</label>
                <input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => handleFormChange('data_inicio', e.target.value)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Erro do formulário */}
            {formError && (
              <p className="mt-3 text-red-400 text-sm">{formError}</p>
            )}

            {/* Botões do modal */}
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? 'Salvando...' : 'Criar Conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
