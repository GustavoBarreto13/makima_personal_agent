// Página inicial do dashboard financeiro da Makima.
// Exibe três seções: health score, resumo de gastos por categoria e compromissos futuros.
// Todos os dados são carregados do backend ao montar o componente.

import { useEffect, useState } from 'react'  // Hooks para efeito colateral e estado local
import { api } from '../lib/api'              // Wrapper de fetch autenticado por cookie de sessão

// ── Interfaces de resposta da API ──────────────────────────────────────────────────────────────

// Resposta do endpoint GET /api/finances/health
interface HealthResponse {
  status: string       // 'ok' quando a chamada teve sucesso
  score: number        // Pontuação de 0 a 100 da saúde financeira
  breakdown: {
    taxa_gasto:              number  // Pontos pela taxa despesas/receita
    taxa_poupanca:           number  // Pontos pela taxa de poupança
    comprometimento_futuro:  number  // Pontos pelo comprometimento com parcelas/assinaturas
    divida_cartao:           number  // Pontos pelo endividamento no cartão
  }
  message: string      // Mensagem textual de avaliação (ex: "Finanças saudáveis")
}

// Resposta do endpoint GET /api/finances/summary
// A tool retorna "summary" como dicionário {categoria: total}, não como array
interface SummaryResponse {
  status:  string                    // 'ok' quando a chamada teve sucesso
  summary: Record<string, number>   // Dicionário {categoria: total}
  period:  string                    // Período consultado (ex: "2026-06")
  total:   number                    // Total geral de gastos no período
}

// Resposta do endpoint GET /api/finances/commitments/{month}
// A tool retorna totais agregados, sem lista de itens individuais
interface CommitmentsResponse {
  status:            string  // 'ok' quando a chamada teve sucesso
  month:             string  // Mês consultado (ex: "2026-07")
  total:             number  // Soma parcelas + assinaturas
  total_parcelas:    number  // Só parcelas
  total_assinaturas: number  // Só assinaturas
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
 *
 * Example:
 *   formatBRL(1234.56) // → "R$ 1.234,56"
 */
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Retorna as classes Tailwind de cor de texto baseadas na pontuação do health score.
 * Verde para score alto (bom), amarelo para médio, vermelho para baixo (ruim).
 *
 * Args:
 *   score - Pontuação de 0 a 100.
 *
 * Returns:
 *   String de classes Tailwind (ex: "text-green-400").
 */
function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400'   // Saúde financeira boa
  if (score >= 40) return 'text-yellow-400'  // Saúde financeira média
  return 'text-red-400'                       // Saúde financeira ruim
}

/**
 * Calcula o próximo mês em formato YYYY-MM a partir da data atual.
 *
 * Returns:
 *   String no formato "YYYY-MM" representando o mês seguinte.
 *
 * Example:
 *   // Se hoje for junho/2026:
 *   nextMonth() // → "2026-07"
 */
function nextMonth(): string {
  const now = new Date()
  // Incrementa o mês; o Date.js trata automaticamente o overflow de dezembro → janeiro
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const year  = next.getFullYear()
  // padStart garante dois dígitos no mês (ex: "07" em vez de "7")
  const month = String(next.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de dashboard financeiro.
 * Carrega automaticamente os dados de health score, resumo de gastos e compromissos futuros.
 *
 * Returns:
 *   JSX com três cards: health score, top categorias e compromissos do próximo mês.
 */
export default function Dashboard() {
  // Estado para cada seção do dashboard; null = ainda não carregado
  const [health,      setHealth]      = useState<HealthResponse | null>(null)
  const [summary,     setSummary]     = useState<SummaryResponse | null>(null)
  const [commitments, setCommitments] = useState<CommitmentsResponse | null>(null)

  // Controla se cada seção ainda está carregando (para exibir spinner individualmente)
  const [loadingHealth,      setLoadingHealth]      = useState(true)
  const [loadingSummary,     setLoadingSummary]     = useState(true)
  const [loadingCommitments, setLoadingCommitments] = useState(true)

  // Mensagens de erro por seção (null = sem erro)
  const [errorHealth,      setErrorHealth]      = useState<string | null>(null)
  const [errorSummary,     setErrorSummary]     = useState<string | null>(null)
  const [errorCommitments, setErrorCommitments] = useState<string | null>(null)

  // useEffect executa uma vez ao montar o componente.
  // Dispara as três requisições em paralelo (independentes entre si) para economizar tempo.
  useEffect(() => {

    // ── Seção 1: Health Score ──
    api.get<HealthResponse>('/api/finances/health')
      .then(setHealth)
      .catch((err: Error) => setErrorHealth(err.message))
      .finally(() => setLoadingHealth(false))

    // ── Seção 2: Resumo por Categoria ──
    // group_by=categoria agrupa os gastos por tipo (Alimentacao, Lazer, etc.)
    api.get<SummaryResponse>('/api/finances/summary?group_by=categoria')
      .then(setSummary)
      .catch((err: Error) => setErrorSummary(err.message))
      .finally(() => setLoadingSummary(false))

    // ── Seção 3: Compromissos Futuros ──
    // Busca compromissos do próximo mês (parcelas, assinaturas, etc.)
    api.get<CommitmentsResponse>(`/api/finances/commitments/${nextMonth()}`)
      .then(setCommitments)
      .catch((err: Error) => setErrorCommitments(err.message))
      .finally(() => setLoadingCommitments(false))

  }, []) // Array vazio: executa somente uma vez, na montagem

  return (
    <div className="space-y-6">

      {/* Título da página */}
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Grade de três colunas (empilhadas em telas menores) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── Card 1: Health Score ── */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Saúde Financeira
          </h2>

          {/* Estado de carregamento: spinner centralizado */}
          {loadingHealth && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Estado de erro: mensagem em vermelho */}
          {errorHealth && (
            <p className="text-red-400 text-sm">{errorHealth}</p>
          )}

          {/* Dados carregados com sucesso */}
          {health && (
            <div>
              {/* Pontuação principal em fonte grande com cor dinâmica */}
              <p className={`text-5xl font-bold mb-2 ${scoreColor(health.score)}`}>
                {health.score}
              </p>
              <p className="text-gray-300 text-sm mb-4">{health.message}</p>

              {/* Detalhamento dos componentes do score */}
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Taxa de gasto</span>
                  <span className="text-gray-200">{health.breakdown.taxa_gasto}/25</span>
                </div>
                <div className="flex justify-between">
                  <span>Poupança</span>
                  <span className="text-gray-200">{health.breakdown.taxa_poupanca}/25</span>
                </div>
                <div className="flex justify-between">
                  <span>Comprometimento</span>
                  <span className="text-gray-200">{health.breakdown.comprometimento_futuro}/25</span>
                </div>
                <div className="flex justify-between">
                  <span>Dívida cartão</span>
                  <span className="text-gray-200">{health.breakdown.divida_cartao}/25</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Card 2: Gastos por Categoria ── */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Gastos por Categoria
          </h2>

          {loadingSummary && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {errorSummary && (
            <p className="text-red-400 text-sm">{errorSummary}</p>
          )}

          {summary && (
            <div>
              {/* Lista de categorias com valores — summary é um dict {categoria: total} */}
              <div className="space-y-2">
                {Object.entries(summary.summary).map(([label, total]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-white font-medium">{formatBRL(total)}</span>
                  </div>
                ))}
              </div>

              {/* Total geral no rodapé do card */}
              <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between text-sm font-semibold">
                <span className="text-gray-400">Total</span>
                <span className="text-white">{formatBRL(summary.total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Card 3: Compromissos Futuros ── */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Compromissos — {nextMonth()}
          </h2>

          {loadingCommitments && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {errorCommitments && (
            <p className="text-red-400 text-sm">{errorCommitments}</p>
          )}

          {commitments && (
            <div>
              {/* Total de compromissos em destaque */}
              <p className="text-3xl font-bold text-white mb-3">
                {formatBRL(commitments.total)}
              </p>

              {/* Detalhamento por tipo */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-300">Parcelas</span>
                  <span className="text-white">{formatBRL(commitments.total_parcelas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Assinaturas</span>
                  <span className="text-white">{formatBRL(commitments.total_assinaturas)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
