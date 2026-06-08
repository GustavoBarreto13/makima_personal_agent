// Página de gerenciamento de transações financeiras.
// Exibe uma tabela com todas as transações e permite criar, editar e deletar registros.
// Usa modais controlados por estado para os formulários de criação e edição.

import { useEffect, useState } from 'react'  // Hooks do React para estado e efeito
import { api } from '../lib/api'              // Wrapper de fetch autenticado

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Representa uma transação individual retornada pelo backend
interface Transaction {
  id:         string   // Identificador único da transação no BigQuery
  nome:       string   // Descrição/nome da transação (ex: "Almoço no restaurante")
  valor:      number   // Valor monetário da transação
  tipo:       string   // "Despesa" ou "Receita"
  categoria:  string   // Categoria (ex: "Alimentacao", "Lazer")
  conta:      string   // Nome ou ID da conta associada
  data:       string   // Data da transação em formato ISO (ex: "2026-06-01")
}

// Resposta do endpoint GET /api/finances/transactions
interface TransactionsResponse {
  status:       string         // 'ok' quando a chamada teve sucesso
  transactions: Transaction[]  // Lista de transações retornadas
}

// Resposta genérica de operações de escrita (POST/PATCH/DELETE)
interface MutationResponse {
  status: string  // 'ok' quando a operação teve sucesso
}

// ── Constantes ──────────────────────────────────────────────────────────────────────────────────

// Lista de categorias válidas conforme o schema do BigQuery da Nami
const CATEGORIAS = [
  'Alimentacao', 'Comer Fora', 'Saude', 'Lazer', 'Transporte',
  'Moradia', 'Roupas', 'Educacao', 'Assinaturas', 'Viagem',
  'Presente', 'Beleza', 'Academia', 'Farmacia', 'Supermercado',
  'Eletronicos', 'Pet', 'Investimento', 'Receita', 'Inbox',
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
 * Retorna a data de hoje no formato YYYY-MM-DD para usar como valor padrão no input[type=date].
 *
 * Returns:
 *   String no formato "YYYY-MM-DD".
 */
function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Tipos do formulário ────────────────────────────────────────────────────────────────────────

// Estado interno do formulário de criação/edição
interface FormState {
  nome:      string  // Nome da transação
  valor:     string  // Valor como string (input number retorna string)
  tipo:      string  // "Despesa" ou "Receita"
  categoria: string  // Categoria da transação
  conta:     string  // Nome da conta
  data:      string  // Data no formato YYYY-MM-DD
}

// Formulário vazio para resetar após salvar ou cancelar
const EMPTY_FORM: FormState = {
  nome:      '',
  valor:     '',
  tipo:      'Despesa',
  categoria: 'Inbox',
  conta:     '',
  data:      todayISO(),
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de transações com tabela, modal de criação e modal de edição.
 *
 * Returns:
 *   JSX com tabela de transações e botões de ação por linha.
 */
export default function Transactions() {
  // Lista de transações carregadas do backend
  const [transactions, setTransactions] = useState<Transaction[]>([])

  // Estado de carregamento da lista principal
  const [loading, setLoading] = useState(true)

  // Mensagem de erro da lista principal (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // Controla se o modal de criação/edição está visível
  const [modalOpen, setModalOpen] = useState(false)

  // Quando editando, guarda o ID da transação em edição; null = criando nova
  const [editingId, setEditingId] = useState<string | null>(null)

  // Estado controlado do formulário (todos os campos como strings para compatibilidade com inputs)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Mensagem de erro do formulário (null = sem erro)
  const [formError, setFormError] = useState<string | null>(null)

  // Indica se o formulário está sendo submetido (desabilita o botão de salvar)
  const [submitting, setSubmitting] = useState(false)

  // ── Carregamento inicial ──
  // Executa uma vez ao montar o componente para buscar todas as transações
  useEffect(() => {
    loadTransactions()
  }, [])

  /**
   * Busca a lista de transações do backend e atualiza o estado.
   * Chamada na montagem e após cada operação de escrita.
   */
  function loadTransactions() {
    setLoading(true)
    setError(null)
    api.get<TransactionsResponse>('/api/finances/transactions')
      .then((res) => setTransactions(res.transactions))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Abre o modal para criar uma nova transação.
   * Reseta o formulário para o estado vazio e limpa o ID de edição.
   */
  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  /**
   * Abre o modal para editar uma transação existente.
   * Pré-preenche o formulário com os dados atuais da transação.
   *
   * Args:
   *   tx - A transação a ser editada.
   */
  function openEdit(tx: Transaction) {
    setEditingId(tx.id)
    setForm({
      nome:      tx.nome,
      valor:     String(tx.valor),
      tipo:      tx.tipo,
      categoria: tx.categoria,
      conta:     tx.conta,
      // Garante que a data esteja no formato YYYY-MM-DD (remove parte de hora se houver)
      data:      tx.data.split('T')[0],
    })
    setFormError(null)
    setModalOpen(true)
  }

  /**
   * Fecha o modal e limpa o estado do formulário.
   */
  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  /**
   * Atualiza um campo específico do formulário quando o usuário digita.
   *
   * Args:
   *   field - Nome do campo a atualizar.
   *   value - Novo valor do campo.
   */
  function handleFormChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Salva a transação: cria uma nova (POST) ou atualiza existente (PATCH),
   * dependendo se há um ID de edição definido.
   */
  async function handleSubmit() {
    setFormError(null)
    setSubmitting(true)

    // Monta o payload para enviar ao backend
    // Atenção: o backend espera o campo "name" (em inglês), não "nome"
    const payload = {
      name:      form.nome,
      valor:     parseFloat(form.valor),  // Converte string → número para o JSON
      tipo:      form.tipo,
      categoria: form.categoria,
      conta:     form.conta,
      data:      form.data,
    }

    try {
      if (editingId) {
        // Modo edição: PATCH com o ID da transação na URL
        await api.patch<MutationResponse>(`/api/finances/transactions/${editingId}`, payload)
      } else {
        // Modo criação: POST para o endpoint de transações
        await api.post<MutationResponse>('/api/finances/transactions', payload)
      }
      // Operação bem-sucedida: fecha o modal e recarrega a lista
      closeModal()
      loadTransactions()
    } catch (err) {
      // Exibe o erro no modal para o usuário corrigir
      setFormError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Solicita confirmação e deleta a transação informada.
   *
   * Args:
   *   id - ID da transação a deletar.
   */
  async function handleDelete(id: string) {
    // window.confirm abre diálogo nativo de confirmação; só prossegue se o usuário confirmar
    if (!window.confirm('Deseja realmente excluir esta transação?')) return
    try {
      await api.del<MutationResponse>(`/api/finances/transactions/${id}`)
      // Recarrega a lista após deletar com sucesso
      loadTransactions()
    } catch (err) {
      // Alerta de erro ao deletar
      alert(`Erro ao excluir: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-6">

      {/* Cabeçalho da página com título e botão de criar */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-t1">Transações</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-t1 text-sm font-medium rounded-lg transition-colors"
        >
          Nova Transação
        </button>
      </div>

      {/* Estado de carregamento */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-border-light border-t-t3 rounded-full animate-spin" />
        </div>
      )}

      {/* Mensagem de erro ao carregar a lista */}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Tabela de transações */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-border-base">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-elevated text-t3 text-left">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-t4">
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              )}
              {transactions.map((tx) => (
                // Linhas coloridas por tipo: vermelho para despesas, verde para receitas
                <tr
                  key={tx.id}
                  className={`border-t border-border-base ${
                    tx.tipo === 'Receita'
                      ? 'bg-green-950/30'   // Fundo verde suave para receitas
                      : 'bg-bg-card'        // Fundo padrão para despesas
                  }`}
                >
                  {/* Data formatada para o padrão brasileiro.
                      Usamos split em vez de new Date() para evitar o bug de fuso horário UTC
                      que faz datas como "2026-06-15" aparecerem como "14/06/2026" em timezones negativos. */}
                  <td className="px-4 py-3 text-t3">
                    {(() => { const [y, m, d] = (tx.data || '').split('T')[0].split('-'); return `${d}/${m}/${y}` })()}
                  </td>
                  <td className="px-4 py-3 text-t1">{tx.nome}</td>
                  <td className="px-4 py-3">
                    {/* Badge colorido por tipo */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.tipo === 'Receita'
                        ? 'bg-green-900 text-green-300'
                        : 'bg-red-900 text-red-300'
                    }`}>
                      {tx.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-t2">{tx.categoria}</td>
                  <td className="px-4 py-3 text-t2">{tx.conta}</td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    tx.tipo === 'Receita' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatBRL(tx.valor)}
                  </td>
                  {/* Botões de ação por linha */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openEdit(tx)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
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

      {/* ── Modal de criação/edição ── */}
      {modalOpen && (
        // Overlay escuro que cobre a tela; clicar fora do modal o fecha
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          {/* Caixa do modal; stopPropagation evita fechar ao clicar dentro */}
          <div
            className="bg-bg-card border border-border-base rounded-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-t1 mb-4">
              {editingId ? 'Editar Transação' : 'Nova Transação'}
            </h2>

            {/* Campos do formulário */}
            <div className="space-y-3">

              {/* Campo: Nome da transação */}
              <div>
                <label className="block text-sm text-t3 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => handleFormChange('nome', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Almoço no restaurante"
                />
              </div>

              {/* Campo: Valor */}
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

              {/* Campo: Tipo (Despesa / Receita) */}
              <div>
                <label className="block text-sm text-t3 mb-1">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => handleFormChange('tipo', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="Despesa">Despesa</option>
                  <option value="Receita">Receita</option>
                </select>
              </div>

              {/* Campo: Categoria */}
              <div>
                <label className="block text-sm text-t3 mb-1">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={(e) => handleFormChange('categoria', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {/* Gera um <option> para cada categoria válida */}
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Campo: Conta */}
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

              {/* Campo: Data */}
              <div>
                <label className="block text-sm text-t3 mb-1">Data</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => handleFormChange('data', e.target.value)}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Mensagem de erro do formulário */}
            {formError && (
              <p className="mt-3 text-red-400 text-sm">{formError}</p>
            )}

            {/* Botões de ação do modal */}
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
                {/* Troca o texto enquanto está salvando */}
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
