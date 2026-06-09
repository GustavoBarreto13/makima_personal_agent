// Card de empréstimo pessoa-a-pessoa e financiamento.
// Portado do handoff de referência (docs/.../nami/screens-b.jsx → LoanCard).
// Exibe: badge de direção, nome/descrição, valor restante, dots de parcelas,
// barra de progresso e botão de exclusão.

import { Icon } from '../icons'
import type { PersonalLoan, Financing } from '../types'

// ── LoanCard para empréstimos pessoa-a-pessoa ─────────────────────────────────

interface LoanCardProps {
  /** Empréstimo pessoa-a-pessoa */
  loan: PersonalLoan
  /** Callback de exclusão */
  onDelete: (id: string) => void
  /** Indica exclusão em progresso */
  deleting?: boolean
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/**
 * Card de empréstimo informal com barra de progresso e dots de parcelas.
 * Usa as classes .loan-card / .loan-dir / .loan-person / .loan-dots / .loan-track.
 */
export function LoanCard({ loan, onDelete, deleting }: LoanCardProps) {
  const isLent = loan.direction === 'lent'

  // Porcentagem de progresso (parcelas pagas / total)
  const pctPaid = loan.installments > 0
    ? loan.paid_installments / loan.installments
    : 0

  // Valor restante: total proporcional às parcelas não pagas
  const remaining  = loan.total_amount * (1 - pctPaid)
  const installVal = loan.installments > 0
    ? loan.total_amount / loan.installments
    : 0

  // Dots: máximo 12 visíveis para não poluir o card
  const MAX_DOTS = 12
  const totalDots = Math.min(loan.installments, MAX_DOTS)

  return (
    <div className="loan-card">
      {/* Cabeçalho: badge de direção + botão de exclusão */}
      <div className="loan-head">
        <span className={`loan-dir ${isLent ? 'lent' : 'borrowed'}`}>
          {isLent ? 'Emprestei' : 'Devo'}
        </span>
        <button
          className="loan-del"
          onClick={() => onDelete(loan.id)}
          disabled={deleting}
          aria-label="Excluir empréstimo"
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      {/* Nome da pessoa e anotação */}
      <div>
        <div className="loan-person">{loan.person_name}</div>
        {loan.note && <div className="loan-note">{loan.note}</div>}
      </div>

      {/* Valor restante com classe .amount para blur de privacidade */}
      <div className="loan-amount amount">R$ {fmt(remaining)}</div>

      {/* Dots de parcelas — círculos preenchidos = pagas */}
      <div className="loan-dots">
        {Array.from({ length: totalDots }, (_, i) => (
          <div
            key={i}
            className={`loan-dot ${i < loan.paid_installments ? 'paid' : ''}`}
            title={`Parcela ${i + 1}`}
          />
        ))}
        {/* Indicador de overflow quando há mais de MAX_DOTS parcelas */}
        {loan.installments > MAX_DOTS && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            +{loan.installments - MAX_DOTS}
          </span>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="loan-track">
        <div
          className="loan-fill"
          style={{ width: `${pctPaid * 100}%` }}
        />
      </div>

      {/* Meta: parcelas pagas + valor por parcela + vencimento */}
      <div className="loan-meta">
        <span>
          <strong>{loan.paid_installments}/{loan.installments}</strong> parcelas · R$ {fmt(installVal)}/mês
        </span>
        {loan.next_due_day && (
          <span>vence dia <strong>{loan.next_due_day}</strong></span>
        )}
      </div>
    </div>
  )
}

// ── FinancingCard — card de financiamento estruturado ─────────────────────────

interface FinancingCardProps {
  /** Financiamento com credor formal */
  financing: Financing
  onDelete: (id: string) => void
  deleting?: boolean
}

/**
 * Card de financiamento (credor formal, taxa de juros).
 * Compartilha o mesmo layout .loan-card, mas com badge "Financiamento".
 */
export function FinancingCard({ financing, onDelete, deleting }: FinancingCardProps) {
  // Porcentagem de progresso
  const pctPaid = financing.installments > 0
    ? financing.paid_installments / financing.installments
    : 0

  const remaining  = financing.total_amount * (1 - pctPaid)
  const installVal = financing.installments > 0
    ? financing.total_amount / financing.installments
    : 0

  const MAX_DOTS = 12
  const totalDots = Math.min(financing.installments, MAX_DOTS)

  return (
    <div className="loan-card">
      {/* Cabeçalho: badge + botão de exclusão */}
      <div className="loan-head">
        <span className="loan-dir financing">Financiamento</span>
        <button
          className="loan-del"
          onClick={() => onDelete(financing.id)}
          disabled={deleting}
          aria-label="Excluir financiamento"
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      {/* Descrição e credor */}
      <div>
        <div className="loan-person">{financing.description}</div>
        {financing.lender && (
          <div className="loan-note">{financing.lender}</div>
        )}
        {financing.interest_rate && (
          <div className="loan-note">Taxa: {financing.interest_rate}</div>
        )}
        {financing.note && (
          <div className="loan-note">{financing.note}</div>
        )}
      </div>

      {/* Valor restante */}
      <div className="loan-amount amount">R$ {fmt(remaining)}</div>

      {/* Dots de parcelas */}
      <div className="loan-dots">
        {Array.from({ length: totalDots }, (_, i) => (
          <div
            key={i}
            className={`loan-dot ${i < financing.paid_installments ? 'paid' : ''}`}
            title={`Parcela ${i + 1}`}
          />
        ))}
        {financing.installments > MAX_DOTS && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            +{financing.installments - MAX_DOTS}
          </span>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="loan-track">
        <div
          className="loan-fill"
          style={{ width: `${pctPaid * 100}%` }}
        />
      </div>

      {/* Meta: parcelas + valor parcela + vencimento */}
      <div className="loan-meta">
        <span>
          <strong>{financing.paid_installments}/{financing.installments}</strong> parcelas · R$ {fmt(installVal)}/mês
        </span>
        {financing.next_due_day && (
          <span>vence dia <strong>{financing.next_due_day}</strong></span>
        )}
      </div>
    </div>
  )
}
