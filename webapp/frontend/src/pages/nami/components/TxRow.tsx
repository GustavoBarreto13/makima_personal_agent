// Linha individual de transação — usada na tela de Transações.
// Layout: ícone da categoria (38×38), nome + categoria·fonte, valor ±, botão lixeira.
// O botão lixeira fica invisível até o hover da linha inteira.

import type { Transaction } from '../types'

interface TxRowProps {
  tx: Transaction
  // Chamado quando o usuário confirma a exclusão
  onDelete: (id: string) => void
  deleting?: boolean
}

// Mapa de ícone por categoria (emoji simples — sem dependência externa)
const CAT_ICON: Record<string, string> = {
  Alimentacao: '🍽', 'Comer Fora': '🍔', Saude: '💊', Lazer: '🎮',
  Transporte: '🚌', Moradia: '🏠', Roupas: '👕', Educacao: '📚',
  Assinaturas: '🔁', Viagem: '✈️', Presente: '🎁', Beleza: '💄',
  Academia: '🏋️', Farmacia: '💉', Supermercado: '🛒', Eletronicos: '💻',
  Pet: '🐾', Investimento: '📈', Receita: '💰', Inbox: '📥',
}

// Mapa de cor de fundo do badge por categoria (OKLch aproximado como hex)
const CAT_COLOR: Record<string, string> = {
  Alimentacao: '#F59E0B', 'Comer Fora': '#F97316', Saude: '#10B981',
  Lazer: '#8B5CF6', Transporte: '#3B82F6', Moradia: '#6366F1',
  Roupas: '#EC4899', Educacao: '#0EA5E9', Assinaturas: '#14B8A6',
  Viagem: '#F59E0B', Presente: '#EF4444', Beleza: '#D946EF',
  Academia: '#84CC16', Farmacia: '#06B6D4', Supermercado: '#22C55E',
  Eletronicos: '#6366F1', Pet: '#F97316', Investimento: '#10B981',
  Receita: '#22C55E', Inbox: '#94A3B8',
}

/** Linha de transação com hover para revelar botão de exclusão. */
export function TxRow({ tx, onDelete, deleting }: TxRowProps) {
  const isReceita = tx.tipo === 'Receita'
  const icon  = CAT_ICON[tx.categoria] ?? '💳'
  const color = CAT_COLOR[tx.categoria] ?? '#94A3B8'

  // Formata valor como BRL com tabular-nums
  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)

  return (
    <div
      className="tx-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--r-sm)',
        // Hover é via CSS class .tx-row:hover definida no nami.css
        cursor: 'default',
        transition: 'background 0.15s',
        position: 'relative',
      }}
    >
      {/* Badge da categoria — quadrado arredondado com ícone */}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: `${color}24`,  // cor com 14% de opacidade (hex 24 ≈ 14%)
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Nome e metadados */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {tx.name}
        </div>
        {/* Pill: categoria · fonte */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          color: 'var(--ink-4)',
          marginTop: 2,
        }}>
          <span style={{
            background: 'var(--card-2, var(--paper))',
            borderRadius: 4,
            padding: '1px 6px',
            border: '1px solid var(--line)',
          }}>
            {tx.categoria}
          </span>
          {tx.conta && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--ink-3)' }}>{tx.conta}</span>
            </>
          )}
        </div>
      </div>

      {/* Valor com sinal */}
      <div
        className="amount"
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 14.5,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: isReceita ? 'var(--in)' : 'var(--out)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {isReceita ? '+' : '−'} R$ {fmt(tx.valor)}
      </div>

      {/* Botão lixeira — visível só no hover via CSS */}
      <button
        className="tx-delete-btn"
        onClick={() => onDelete(tx.id)}
        disabled={deleting}
        style={{
          background: 'none',
          border: 'none',
          cursor: deleting ? 'wait' : 'pointer',
          color: 'var(--ink-4)',
          padding: '4px 6px',
          flexShrink: 0,
          // A visibilidade é controlada pelo CSS .tx-row:hover .tx-delete-btn
          opacity: deleting ? 0.4 : 0,
          transition: 'opacity 0.15s',
        }}
        aria-label="Excluir transação"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}
