/**
 * ui.tsx — Primitivos de UI compartilhados da Nami
 *
 * Portado do handoff de referência (docs/.../nami/ui.jsx).
 * Contém:
 *   - Money / BigMoney   — formatação de valores monetários com suporte a privacidade
 *   - CatBadge           — badge colorido de categoria
 *   - Donut              — gráfico de pizza SVG
 *   - Spark              — mini gráfico de linha
 *   - CashflowBars       — barras verticais de fluxo de caixa (in/out por mês)
 *   - Helpers de data    — fmtDay, relDay, daysUntil, greet, monthLabel
 */

import { Icon, lucideToKey } from './icons'
import type { Category, CategoryStat, MonthlyEntry } from './types'

// ── Formatadores monetários ───────────────────────────────────────────────────

/** Formata um número como moeda brasileira sem o símbolo "R$". Ex.: 1234.5 → "1.234,50" */
function fmtBRL(v: number): string {
  return Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Formata um número como moeda brasileira compacta. Ex.: 12345 → "12,3k" */
function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (abs >= 1_000)     return (abs / 1_000).toFixed(1).replace('.', ',') + 'k'
  return fmtBRL(abs)
}

// ── Componentes de valor monetário ───────────────────────────────────────────

interface MoneyProps {
  /** Valor numérico em reais */
  value: number
  /** Se true, mostra o sinal + na frente de valores positivos */
  signed?: boolean
  /** Classe CSS adicional para o span externo */
  className?: string
}

/**
 * Exibe um valor monetário estilizado, com a classe .amount para o
 * blur de privacidade (ativado por [data-privacy="on"]).
 *
 * Args:
 *   value: valor em reais.
 *   signed: se true, adiciona + para valores positivos.
 *   className: classe CSS extra (ex.: "in" ou "out" para colorir).
 *
 * Returns:
 *   <span> com o valor formatado em R$ e classe .amount.
 */
export function Money({ value, signed = false, className = '' }: MoneyProps) {
  const sign = signed && value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <span className={`amount ${className}`}>
      {sign}R$ {fmtBRL(value)}
    </span>
  )
}

/**
 * Versão grande do valor monetário, usada no hero do Dashboard.
 * Usa a fonte display em tamanho grande.
 */
export function BigMoney({ value, className = '' }: { value: number; className?: string }) {
  const neg = value < 0
  return (
    <span className={`amount ${className}`} style={{ fontFamily: 'var(--font-display)' }}>
      {neg ? '−' : ''}R$ {fmtBRL(value)}
    </span>
  )
}

// ── Badge de categoria ────────────────────────────────────────────────────────

interface CatBadgeProps {
  /** Objeto de categoria completo (com icon, color, name) */
  category: Category
  /** Tamanho do ícone em px (padrão: 11) */
  iconSize?: number
}

/**
 * Badge colorido para exibir a categoria de uma transação.
 * Usa o color oklch da categoria como fundo translúcido e tint.
 *
 * Args:
 *   category: objeto {id, name, icon, color, kind} da API.
 *   iconSize: tamanho do ícone em pixels.
 *
 * Returns:
 *   Span estilizado com ícone SVG + nome da categoria.
 */
export function CatBadge({ category, iconSize = 11 }: CatBadgeProps) {
  // Converte o nome Lucide (ex.: "ShoppingCart") para a chave do nosso conjunto SVG
  const iconKey = lucideToKey(category.icon)

  // Extrai a cor oklch para criar fundo translúcido (14% opacidade)
  // A cor já vem no formato "oklch(...)" da API
  const bg = category.color.replace(')', ' / 0.14)')

  return (
    <span
      className="cat-badge"
      style={{ background: bg, color: category.color }}
    >
      <Icon name={iconKey} size={iconSize} />
      {category.name}
    </span>
  )
}

// ── Donut Chart (pizza SVG) ───────────────────────────────────────────────────

interface DonutProps {
  /** Fatias do gráfico: cada uma com valor, cor e nome */
  slices: { value: number; color: string; name: string }[]
  /** Tamanho do SVG em px (padrão: 120) */
  size?: number
  /** Espessura do anel em px (padrão: 28) */
  thickness?: number
  /** Texto central — normalmente o total formatado */
  center?: string
  /** Rótulo abaixo do texto central */
  centerLabel?: string
}

/**
 * Gráfico de rosca (donut) SVG para mostrar distribuição por categoria.
 * Renderiza fatias como arcos SVG com comprimento proporcional ao valor.
 *
 * Args:
 *   slices: array de {value, color, name} — cores em oklch ou qualquer CSS.
 *   size: dimensão do SVG quadrado.
 *   thickness: espessura do anel (diferença entre raio externo e interno).
 *   center: texto principal no centro (ex.: "R$ 1.234").
 *   centerLabel: rótulo secundário no centro (ex.: "total").
 *
 * Returns:
 *   Elemento SVG com o gráfico de rosca.
 */
export function Donut({ slices, size = 120, thickness = 28, center, centerLabel }: DonutProps) {
  // Raio e circunferência do círculo
  const r = (size - thickness) / 2        // raio do centro do anel
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r            // comprimento total da circunferência

  // Soma total dos valores para calcular proporções
  const total = slices.reduce((s, sl) => s + Math.max(0, sl.value), 0)

  // Gera os arcos SVG para cada fatia
  let offset = 0 // posição acumulada na circunferência (começa do topo: -90°)

  const arcs = total > 0
    ? slices.map((sl, i) => {
        // Calcula o comprimento do traço (dash) para esta fatia
        const len = (sl.value / total) * circ
        // Gera o arco usando stroke-dasharray: len (visível) + resto (invisível)
        const dash = `${len - 2} ${circ - len + 2}` // gap de 2px entre fatias
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={sl.color}
            strokeWidth={thickness}
            strokeDasharray={dash}
            // dashoffset: posiciona a fatia no arco correto
            // SVG começa às 3h; -circ/4 move o início para as 12h
            strokeDashoffset={-(offset) + circ / 4}
            strokeLinecap="butt"
          />
        )
        offset += len
        return el
      })
    : [
        // Estado vazio: círculo cinza completo
        <circle key="empty" cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--line)" strokeWidth={thickness} />
      ]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {/* Anel de fundo (garante que sempre haja um círculo visível) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
      {arcs}
      {/* Texto central — desrotacionado para aparecer na posição correta */}
      {(center || centerLabel) && (
        <g style={{ transform: `rotate(90deg) translate(0, -${size}px)` }}>
          {center && (
            <text
              x={cx}
              y={centerLabel ? cy - 6 : cy + 5}
              textAnchor="middle"
              fill="var(--ink)"
              style={{ font: '700 12px var(--font-mono)', letterSpacing: '-0.3px' }}
            >
              {center}
            </text>
          )}
          {centerLabel && (
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              fill="var(--muted)"
              style={{ font: '500 9px var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {centerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  )
}

// ── Donut com legenda (painel "Para onde foi") ────────────────────────────────

interface DonutPanelProps {
  /** Estatísticas por categoria do StatsResponse */
  byCategory: CategoryStat[]
  /** Mapa de categorias por id (para pegar color e name) */
  catMap: Record<string, Category>
  /** Total de despesas do mês (para calcular % e montar o centro) */
  totalExpense: number
}

/**
 * Painel completo: Donut SVG + legenda de categorias ao lado.
 * Usado no Dashboard no grid de 2 colunas.
 *
 * Args:
 *   byCategory: array de {categoria (slug), total, pct} do mês.
 *   catMap: mapa {id → Category} para obter color e name.
 *   totalExpense: soma total das despesas do mês.
 */
export function DonutPanel({ byCategory, catMap, totalExpense }: DonutPanelProps) {
  // Pega as top-6 categorias por gasto para não poluir a legenda
  const top = byCategory.slice(0, 6)

  // Monta as fatias do donut com as cores reais das categorias
  const slices = top.map(cs => ({
    value: cs.total,
    color: catMap[cs.categoria]?.color ?? 'var(--muted)',
    name: catMap[cs.categoria]?.name ?? cs.categoria,
  }))

  // Texto central: total formatado de forma compacta
  const center = totalExpense > 0 ? `R$ ${fmtCompact(totalExpense)}` : '—'

  return (
    <div className="donut-wrap">
      <Donut slices={slices} size={120} thickness={28} center={center} centerLabel="gastos" />
      <div className="cat-legend">
        {top.map((cs, i) => (
          <div key={i} className="cat-leg-item">
            <span
              className="cat-leg-dot"
              style={{ background: slices[i]?.color ?? 'var(--muted)' }}
            />
            <span className="cat-leg-name">{slices[i]?.name ?? cs.categoria}</span>
            <span className="cat-leg-val">{cs.pct.toFixed(0)}%</span>
          </div>
        ))}
        {top.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sem dados</span>
        )}
      </div>
    </div>
  )
}

// ── Spark (mini linha) ────────────────────────────────────────────────────────

interface SparkProps {
  /** Série de valores (ex.: gastos diários) */
  data: number[]
  /** Largura do SVG em px (padrão: 80) */
  width?: number
  /** Altura do SVG em px (padrão: 28) */
  height?: number
  /** Cor da linha (padrão: var(--accent)) */
  color?: string
}

/**
 * Mini gráfico de linha sparkline para uso nos stat-cards.
 *
 * Args:
 *   data: array de valores numéricos.
 *   width: largura do SVG.
 *   height: altura do SVG.
 *   color: cor da linha SVG.
 */
export function Spark({ data, width = 80, height = 28, color = 'var(--accent)' }: SparkProps) {
  // Se não há dados ou há apenas um ponto, não renderiza nada
  if (!data || data.length < 2) return null

  const max = Math.max(...data, 1)   // evita divisão por zero
  const min = Math.min(...data, 0)
  const range = max - min || 1

  // Mapeia cada valor para coordenadas X e Y no SVG
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.05
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <div className="spark">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

// ── Cashflow Bars ─────────────────────────────────────────────────────────────

interface CashflowBarsProps {
  /** Dados de fluxo de caixa por mês */
  cashflow: MonthlyEntry[]
  /** Mês atual selecionado (para destacar) */
  currentMonth: string
}

/**
 * Barras verticais de fluxo de caixa (entradas vs saídas por mês).
 * Substitui o CashflowChart.tsx anterior.
 *
 * Args:
 *   cashflow: array de {month (YYYY-MM), income, expense}.
 *   currentMonth: mês atual no formato YYYY-MM (para destaque visual).
 */
export function CashflowBars({ cashflow, currentMonth }: CashflowBarsProps) {
  // Pega os últimos 6 meses para não poluir o gráfico
  const months = cashflow.slice(-6)

  // Valor máximo para escalar as barras (altura relativa)
  const maxVal = Math.max(...months.flatMap(m => [m.income, m.expense]), 1)

  // Altura máxima das barras em px (dentro do container .flow de 120px menos 20px do label)
  const BAR_MAX = 80

  return (
    <div className="flow">
      {months.map((m, i) => {
        // Altura de cada barra proporcional ao máximo
        const hIn  = Math.max(2, (m.income  / maxVal) * BAR_MAX)
        const hOut = Math.max(2, (m.expense / maxVal) * BAR_MAX)

        // Rótulo curto do mês (ex.: "Jan")
        const label = new Date(m.month + '-15').toLocaleDateString('pt-BR', { month: 'short' })
          .replace('.', '')
          .replace(/^\w/, c => c.toUpperCase())

        const isCurrentMonth = m.month === currentMonth

        return (
          <div
            key={i}
            className="flow-col"
            style={{ opacity: isCurrentMonth ? 1 : 0.65 }}
            title={`${label}: +R$${fmtBRL(m.income)} / -R$${fmtBRL(m.expense)}`}
          >
            <div className="flow-bars">
              <div className="flow-bar in"  style={{ height: hIn }}  />
              <div className="flow-bar out" style={{ height: hOut }} />
            </div>
            <span className="flow-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers de data e texto ───────────────────────────────────────────────────

/**
 * Formata uma data YYYY-MM-DD para exibição curta em PT-BR.
 * Ex.: "2026-06-09" → "9 de jun."
 *
 * Args:
 *   iso: data no formato YYYY-MM-DD.
 *
 * Returns:
 *   String de data legível em português.
 */
export function fmtDay(iso: string): string {
  // Adiciona T12:00 para evitar problema de fuso (UTC vs local)
  const d = new Date(iso + 'T12:00')
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
}

/**
 * Retorna a data relativa a hoje de forma amigável.
 * Ex.: "2026-06-09" → "hoje", "2026-06-08" → "ontem", "2026-06-05" → "9 de jun."
 *
 * Args:
 *   iso: data no formato YYYY-MM-DD.
 *
 * Returns:
 *   String relativa em português.
 */
export function relDay(iso: string): string {
  const today = new Date()
  const d = new Date(iso + 'T12:00')
  const diff = Math.round((today.setHours(12,0,0,0) - d.getTime()) / 86_400_000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff === -1) return 'amanhã'
  return fmtDay(iso)
}

/**
 * Calcula quantos dias faltam (ou passaram) até uma data de vencimento mensal.
 * Ex.: dia 15 do próximo vencimento → retorna número positivo.
 *
 * Args:
 *   day: dia do mês de vencimento (1-28).
 *
 * Returns:
 *   Número de dias até o próximo vencimento (negativo se já passou).
 */
export function daysUntil(day: number): number {
  const now = new Date()
  const currentDay = now.getDate()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Próximo vencimento: neste mês se ainda não passou, ou no próximo mês
  let target: Date
  if (day >= currentDay) {
    target = new Date(currentYear, currentMonth, day)
  } else {
    target = new Date(currentYear, currentMonth + 1, day)
  }

  // Diferença em dias (arredondada)
  const diffMs = target.getTime() - new Date(currentYear, currentMonth, currentDay).getTime()
  return Math.round(diffMs / 86_400_000)
}

/**
 * Retorna uma saudação baseada no horário atual.
 * Ex.: 9h → "bom dia", 15h → "boa tarde", 22h → "boa noite"
 *
 * Returns:
 *   String de saudação em português (sem acento inicial).
 */
export function greet(): string {
  const h = new Date().getHours()
  if (h < 12) return 'bom dia'
  if (h < 18) return 'boa tarde'
  return 'boa noite'
}

/**
 * Formata um mês YYYY-MM para exibição completa em PT-BR.
 * Ex.: "2026-06" → "junho de 2026"
 *
 * Args:
 *   month: mês no formato YYYY-MM.
 *
 * Returns:
 *   String de mês/ano em português.
 */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/**
 * Formata um mês YYYY-MM para o formato curto "Jun/26".
 *
 * Args:
 *   month: mês no formato YYYY-MM.
 *
 * Returns:
 *   String de mês/ano abreviada.
 */
export function monthShort(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1, 15)
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(y).slice(-2)
}

/**
 * Normaliza um valor de formulário de texto para número.
 * Aceita vírgula decimal (padrão BR): "1.234,50" → 1234.5
 *
 * Args:
 *   raw: string digitada pelo usuário.
 *
 * Returns:
 *   Número em float, ou 0 se inválido.
 */
export function parseAmount(raw: string): number {
  // Remove pontos de milhar e troca vírgula por ponto
  const clean = raw.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n
}

// ── Helpers de formatação para exibição ──────────────────────────────────────

/** Formata valor BRL para exibição rápida (ex.: 1234.5 → "R$ 1.234,50") */
export function fmtMoney(value: number): string {
  return `R$ ${fmtBRL(value)}`
}

/** Formata valor BRL compacto para espaços pequenos (ex.: 12345 → "R$ 12,3k") */
export function fmtMoneyCompact(value: number): string {
  return `R$ ${fmtCompact(value)}`
}

/**
 * Classifica urgência por número de dias restantes.
 *
 * Args:
 *   days: número de dias até o vencimento.
 *
 * Returns:
 *   'urgent' se ≤ 3 dias, 'soon' se ≤ 7 dias, 'ok' caso contrário.
 */
export function urgency(days: number): 'urgent' | 'soon' | 'ok' {
  if (days <= 3) return 'urgent'
  if (days <= 7) return 'soon'
  return 'ok'
}
