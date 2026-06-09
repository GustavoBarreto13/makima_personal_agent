// Card de empréstimo pessoa-a-pessoa — usado na tela Loans.tsx.
// Exibe: badge de direção (emprestei/peguei), nome, saldo restante,
// barra de progresso, dots de parcelas e botão de exclusão no hover.

import type { PersonalLoan } from '../types'

interface LoanCardProps {
  loan: PersonalLoan
  onDelete: (id: string) => void
  deleting?: boolean
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Card de empréstimo informal com progresso de parcelas e botão de exclusão. */
export function LoanCard({ loan, onDelete, deleting }: LoanCardProps) {
  const isLent = loan.direction === 'lent'
  const accent = isLent ? 'var(--in)' : 'var(--out)'
  const accentTint = isLent ? 'var(--in-tint)' : 'var(--out-tint)'
  const badge = isLent ? '🤝 Emprestei' : '📥 Devo'

  // Valor restante = total proporcional às parcelas não pagas
  const pctPaid    = loan.installments > 0
    ? loan.paid_installments / loan.installments
    : 0
  const remaining  = loan.total_amount * (1 - pctPaid)
  const installVal = loan.installments > 0
    ? loan.total_amount / loan.installments
    : 0

  // Dots de parcelas: máximo 12 visíveis, com "…" se houver mais
  const maxDots   = 12
  const totalDots = Math.min(loan.installments, maxDots)
  const overflow  = loan.installments > maxDots

  return (
    <div
      className="tx-row"
      style={{
        background: 'var(--card)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--line)',
        padding: '16px',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
      }}
    >
      {/* Cabeçalho: badge + nome + valor + botão lixeira */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badge de direção */}
          <span style={{
            display: 'inline-block',
            fontSize: 10,
            fontWeight: 700,
            color: accent,
            background: accentTint,
            borderRadius: 4,
            padding: '2px 7px',
            marginBottom: 5,
            letterSpacing: '0.05em',
          }}>
            {badge}
          </span>

          {/* Nome da pessoa */}
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--display, var(--sans))' }}>
            {loan.person_name}
          </div>

          {/* Detalhes: total + parcela + vencimento */}
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>
            Total R$ {fmt(loan.total_amount)} · parcela R$ {fmt(installVal)}
            {loan.next_due_day && ` · vence dia ${loan.next_due_day}`}
          </div>

          {/* Observação em itálico */}
          {loan.note && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', marginTop: 2 }}>
              {loan.note}
            </div>
          )}
        </div>

        {/* Valor restante + botão lixeira */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              className="amount"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 18,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: accent,
              }}
            >
              R$ {fmt(remaining)}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
              {loan.paid_installments}/{loan.installments} pagas
            </div>
          </div>

          {/* Botão lixeira — fica visível no hover via CSS .tx-row */}
          <button
            className="tx-delete-btn"
            onClick={() => onDelete(loan.id)}
            disabled={deleting}
            style={{
              background: 'none',
              border: 'none',
              cursor: deleting ? 'wait' : 'pointer',
              color: 'var(--ink-4)',
              padding: '4px 6px',
              opacity: deleting ? 0.4 : 0,
              transition: 'opacity 0.15s',
            }}
            aria-label="Excluir empréstimo"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pctPaid * 100}%`,
            background: accent,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Dots de parcelas — ✓ para pagas, número para pendentes */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {Array.from({ length: totalDots }, (_, i) => {
          const paid = i < loan.paid_installments
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 4,
                background: paid ? 'var(--in-tint)' : 'var(--line)',
                fontSize: paid ? 11 : 9,
                color: paid ? 'var(--in)' : 'var(--ink-4)',
                fontWeight: paid ? 700 : 400,
                fontFamily: 'var(--mono)',
              }}
            >
              {paid ? '✓' : i + 1}
            </span>
          )
        })}
        {/* Indicador de overflow quando há mais de 12 parcelas */}
        {overflow && (
          <span style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>
            …+{loan.installments - maxDots}
          </span>
        )}
      </div>
    </div>
  )
}
