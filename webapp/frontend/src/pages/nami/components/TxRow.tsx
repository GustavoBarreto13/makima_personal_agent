// Linha individual de transação — usada nas telas de Transações e Dashboard.
// Portada do handoff de referência (docs/.../nami/screens-a.jsx → TxRow).
// Layout: ícone da categoria, nome + meta, valor ±, botão lixeira (só no hover).

import { Icon, lucideToKey } from '../icons'
import type { Category } from '../types'
import type { NormalizedTx } from '../lib'

interface TxRowProps {
  /** Transação normalizada (type/amount/catId/merchant/source/date) */
  tx: NormalizedTx
  /** Mapa de categorias para lookup por id (pode ser vazio antes do carregamento) */
  catMap: Record<string, Category>
  /** Chamado quando o usuário clica no botão lixeira */
  onDelete: (id: string) => void
  /** Indica se a exclusão está em progresso (desabilita o botão) */
  deleting?: boolean
}

/**
 * Linha de transação com hover para revelar botão de exclusão.
 * Usa as classes .tx-row / .tx-ico / .tx-body / .tx-val / .tx-del definidas em nami.css.
 *
 * Args:
 *   tx: transação no formato normalizado da lib.ts.
 *   catMap: mapa {id → Category} para obter ícone e cor.
 *   onDelete: callback de exclusão.
 *   deleting: desabilita o botão durante a requisição.
 */
export function TxRow({ tx, catMap, onDelete, deleting }: TxRowProps) {
  // Busca a categoria pelo slug; usa valores padrão se não encontrar
  const cat = catMap[tx.catId]

  // Ícone: converte o nome Lucide que vem da API para a chave do nosso conjunto SVG
  const iconKey  = cat ? lucideToKey(cat.icon) : 'tag'

  // Cor da categoria para o fundo translúcido do ícone
  // Formato: "oklch(0.6 0.14 148)" → adiciona transparência
  const catColor = cat?.color ?? 'var(--muted)'
  const iconBg   = cat
    ? cat.color.replace(')', ' / 0.14)')      // cria variante translúcida (14%)
    : 'var(--mist)'

  // Formatação do valor: sempre positivo, cor pelo tipo
  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)

  return (
    <div className="tx-row">
      {/* Ícone da categoria — quadrado arredondado com cor translúcida */}
      <div
        className="tx-ico"
        style={{ background: iconBg, color: catColor }}
      >
        <Icon name={iconKey} size={16} />
      </div>

      {/* Nome + metadados */}
      <div className="tx-body">
        <div className="tx-name">{tx.merchant}</div>
        <div className="tx-meta">
          {/* Categoria → fonte (conta ou cartão) */}
          {cat?.name ?? tx.catId}
          {tx.source && ` · ${tx.source}`}
        </div>
      </div>

      {/* Lado direito: valor + botão lixeira */}
      <div className="tx-right">
        {/* Valor com classe .amount para blur de privacidade */}
        <span className={`tx-val amount ${tx.type}`}>
          {tx.type === 'in' ? '+' : '−'} R$ {fmt(tx.amount)}
        </span>

        {/* Botão lixeira — invisível até o hover da linha (CSS .tx-row:hover .tx-del) */}
        <button
          className="tx-del"
          onClick={() => onDelete(tx.id)}
          disabled={deleting}
          aria-label="Excluir transação"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  )
}

// ── TxList — lista de transações agrupadas por dia ────────────────────────────

interface TxListProps {
  /** Grupos de transações por dia (já ordenados decrescente) */
  groups: { date: string; txs: NormalizedTx[] }[]
  /** Mapa de categorias */
  catMap: Record<string, Category>
  /** Callback de exclusão */
  onDelete: (id: string) => void
  /** Id em processo de exclusão */
  deletingId?: string | null
}

/** Helper de formatação de data para o rótulo do grupo (ex.: "9 de jun.") */
function fmtGroupDate(iso: string): string {
  const d = new Date(iso + 'T12:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  // Datas especiais: hoje e ontem
  if (d.toDateString() === today.toDateString()) return 'hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'ontem'

  // Formato curto: "9 de jun."
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** Calcula saldo líquido do dia (entradas - saídas). */
function dayNet(txs: NormalizedTx[]): number {
  return txs.reduce((s, tx) => s + (tx.type === 'in' ? tx.amount : -tx.amount), 0)
}

/**
 * Lista de transações agrupadas por dia, com rótulo de data e saldo do dia.
 * Portada do handoff de referência (screens-a.jsx → TxList).
 */
export function TxList({ groups, catMap, onDelete, deletingId }: TxListProps) {
  if (groups.length === 0) {
    // Estado vazio com ícone
    return (
      <div className="empty">
        <Icon name="receipt" size={32} />
        <p>Nenhuma transação no período</p>
      </div>
    )
  }

  return (
    <div className="tx-list">
      {groups.map(({ date, txs }) => {
        const net = dayNet(txs)
        const fmt = (v: number) =>
          new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(Math.abs(v))

        return (
          <div key={date} className="tx-day-group">
            {/* Rótulo do dia com saldo à direita */}
            <div className="tx-day-label">
              <span>{fmtGroupDate(date)}</span>
              <span className={`tx-day-net amount ${net >= 0 ? 'in' : 'out'}`} style={{ color: net >= 0 ? 'var(--in)' : 'var(--out)' }}>
                {net >= 0 ? '+' : '−'} R$ {fmt(net)}
              </span>
            </div>

            {/* Linhas de transação do dia */}
            {txs.map(tx => (
              <TxRow
                key={tx.id}
                tx={tx}
                catMap={catMap}
                onDelete={onDelete}
                deleting={deletingId === tx.id}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
