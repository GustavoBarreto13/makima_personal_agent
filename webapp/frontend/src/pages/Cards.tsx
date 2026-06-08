// Página de cartões de crédito.
// Exibe cada cartão com nome, dívida atual, limite e uma barra de progresso do uso.
// Permite registrar pagamentos via modal.

import { useEffect, useState } from 'react'  // Hooks do React para estado e efeito
import { api } from '../lib/api'              // Wrapper de fetch autenticado

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Representa um cartão de crédito retornado pelo backend
interface Card {
  id:           string   // Identificador único do cartão
  name:         string   // Nome do cartão (ex: "Nubank Roxo")
  account_name: string   // Nome da conta corrente vinculada
  limite:       number   // Limite total do cartão
  divida_atual: number   // Dívida atual acumulada
  utilizacao_pct: number   // Percentual do limite já utilizado (0-100)
  status:       string   // Status: "ativo", "bloqueado", etc.
}

// Resposta do endpoint GET /api/finances/cards
interface CardsResponse {
  status:       string  // 'ok' quando a chamada teve sucesso
  cards:        Card[]  // Lista de cartões do usuário
  total_divida: number  // Soma de todas as dívidas de todos os cartões
}

// Resposta de registrar pagamento
interface MutationResponse {
  status: string
}

// ── Tipos do formulário de pagamento ──────────────────────────────────────────────────────────

// Estado do formulário de registro de pagamento
interface PaymentForm {
  valor: string  // Valor do pagamento como string
  data:  string  // Data do pagamento no formato YYYY-MM-DD
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
 * Retorna as classes Tailwind de cor para a barra de progresso baseado no percentual de uso.
 * Verde até 50%, amarelo até 80%, vermelho acima de 80%.
 *
 * Args:
 *   pct - Percentual de uso do cartão (0-100).
 *
 * Returns:
 *   String de classes Tailwind para o background da barra.
 */
function progressColor(pct: number): string {
  if (pct > 80) return 'bg-red-500'     // Uso alto: vermelho de alerta
  if (pct > 50) return 'bg-yellow-500'  // Uso médio: amarelo de atenção
  return 'bg-green-500'                  // Uso baixo: verde de normalidade
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de cartões de crédito.
 * Lista cartões com barra de uso e permite registrar pagamentos.
 *
 * Returns:
 *   JSX com cards de cartão e modal de pagamento.
 */
export default function Cards() {
  // Lista de cartões carregados do backend
  const [cards, setCards] = useState<Card[]>([])

  // Dívida total de todos os cartões
  const [totalDivida, setTotalDivida] = useState(0)

  // Estado de carregamento
  const [loading, setLoading] = useState(true)

  // Erro ao carregar (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // ID do cartão para o qual o modal de pagamento está aberto; null = fechado
  const [payingCardId, setPayingCardId] = useState<string | null>(null)

  // Estado do formulário de pagamento
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    valor: '',
    data:  new Date().toISOString().split('T')[0],  // Hoje como padrão
  })

  // Erro no formulário de pagamento
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // Indica se o pagamento está sendo enviado
  const [submitting, setSubmitting] = useState(false)

  // ── Carregamento inicial ──
  useEffect(() => {
    loadCards()
  }, [])

  /**
   * Busca todos os cartões do backend e atualiza o estado.
   */
  function loadCards() {
    setLoading(true)
    setError(null)
    api.get<CardsResponse>('/api/finances/cards')
      .then((res) => {
        setCards(res.cards)
        setTotalDivida(res.total_divida)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Abre o modal de pagamento para o cartão informado.
   *
   * Args:
   *   cardId - ID do cartão que receberá o pagamento.
   */
  function openPayment(cardId: string) {
    setPayingCardId(cardId)
    setPaymentForm({ valor: '', data: new Date().toISOString().split('T')[0] })
    setPaymentError(null)
  }

  /**
   * Fecha o modal de pagamento e limpa o estado.
   */
  function closePayment() {
    setPayingCardId(null)
    setPaymentError(null)
  }

  /**
   * Envia o pagamento para o backend via POST.
   */
  async function handlePaymentSubmit() {
    if (!payingCardId) return
    setPaymentError(null)
    setSubmitting(true)

    try {
      await api.post<MutationResponse>(
        `/api/finances/cards/${payingCardId}/payment`,
        {
          valor: parseFloat(paymentForm.valor),  // Converte string → número
          data:  paymentForm.data,
        }
      )
      closePayment()
      loadCards()  // Recarrega a lista para atualizar dívida e percentual
    } catch (err) {
      setPaymentError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-t1">Cartões</h1>
        {/* Exibe dívida total geral na barra superior */}
        {!loading && cards.length > 0 && (
          <span className="text-sm text-t3">
            Dívida total: <span className="text-red-400 font-semibold">{formatBRL(totalDivida)}</span>
          </span>
        )}
      </div>

      {/* Spinner de carregamento */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-border-light border-t-t3 rounded-full animate-spin" />
        </div>
      )}

      {/* Mensagem de erro */}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* Sem cartões cadastrados */}
      {!loading && !error && cards.length === 0 && (
        <p className="text-t4 text-sm">Nenhum cartão encontrado.</p>
      )}

      {/* Grade de cards — cada cartão ocupa um card visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.id} className="bg-bg-card border border-border-base rounded-xl p-5">

            {/* Nome e status do cartão */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-t1 font-semibold">{card.name}</h3>
                <p className="text-t4 text-xs mt-0.5">{card.account_name}</p>
              </div>
              {/* Badge de status */}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                card.status === 'ativo'
                  ? 'bg-green-900 text-green-300'
                  : 'bg-gray-700 text-t3'
              }`}>
                {card.status}
              </span>
            </div>

            {/* Dívida atual e limite */}
            <div className="mb-3">
              <p className="text-2xl font-bold text-t1">{formatBRL(card.divida_atual)}</p>
              <p className="text-xs text-t3 mt-0.5">
                de {formatBRL(card.limite)} ({card.utilizacao_pct.toFixed(1)}% usado)
              </p>
            </div>

            {/* Barra de progresso do uso do limite */}
            <div className="mb-4">
              {/* Container da barra: fundo cinza escuro */}
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                {/* Preenchimento colorido proporcional ao uso */}
                <div
                  className={`h-full rounded-full transition-all ${progressColor(card.utilizacao_pct)}`}
                  style={{ width: `${Math.min(card.utilizacao_pct, 100)}%` }}
                />
              </div>
            </div>

            {/* Botão de registrar pagamento */}
            <button
              onClick={() => openPayment(card.id)}
              className="w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-800 hover:border-indigo-600 rounded-lg transition-colors"
            >
              Registrar Pagamento
            </button>
          </div>
        ))}
      </div>

      {/* ── Modal de pagamento ── */}
      {payingCardId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closePayment}
        >
          <div
            className="bg-bg-card border border-border-base rounded-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-t1 mb-4">Registrar Pagamento</h2>

            <div className="space-y-3">

              {/* Valor do pagamento */}
              <div>
                <label className="block text-sm text-t3 mb-1">Valor (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.valor}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, valor: e.target.value }))}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="0.00"
                />
              </div>

              {/* Data do pagamento */}
              <div>
                <label className="block text-sm text-t3 mb-1">Data</label>
                <input
                  type="date"
                  value={paymentForm.data}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, data: e.target.value }))}
                  className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Erro do formulário */}
            {paymentError && (
              <p className="mt-3 text-red-400 text-sm">{paymentError}</p>
            )}

            {/* Botões do modal */}
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={closePayment}
                className="px-4 py-2 text-sm text-t3 hover:text-t1 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handlePaymentSubmit}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-t1 text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
