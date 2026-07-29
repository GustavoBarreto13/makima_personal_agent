// Card de empréstimo pessoa-a-pessoa e financiamento.
// Portado do handoff de referência (docs/.../nami/screens-b.jsx → LoanCard).
// Exibe: badge de direção, nome/descrição, valor restante, dots de parcelas,
// barra de progresso e botão de exclusão.

import { Icon } from '../icons'
import type { PersonalLoan, BankLoan } from '../types'

// ── LoanCard para empréstimos pessoa-a-pessoa ─────────────────────────────────

interface LoanCardProps {
  /** Empréstimo pessoa-a-pessoa */
  loan: PersonalLoan
  /** Callback de exclusão */
  onDelete: (id: string) => void
  /** Callback de registro de parcela paga (spec 046, US4) */
  onPay?: (id: string) => void
  /** Indica exclusão em progresso */
  deleting?: boolean
  /** Indica registro de pagamento em progresso */
  paying?: boolean
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/**
 * Card de empréstimo informal com barra de progresso e dots de parcelas.
 * Usa as classes .loan-card / .loan-dir / .loan-person / .loan-dots / .loan-track.
 */
export function LoanCard({ loan, onDelete, onPay, deleting, paying }: LoanCardProps) {
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

      {/* Registrar pagamento (spec 046, US4) — só avança o contador, sem juros */}
      {onPay && loan.paid_installments < loan.installments && (
        <div className="loan-actions">
          <button className="btn btn-ghost" onClick={() => onPay(loan.id)} disabled={paying}>
            Registrar pagamento
          </button>
        </div>
      )}
    </div>
  )
}

// ── BankLoanCard — empréstimo/financiamento bancário unificado (spec 046) ────

const TIPO_LABEL: Record<string, string> = {
  veiculo: 'Veículo', consignado: 'Consignado', pessoal: 'Pessoal',
  imobiliario: 'Imobiliário', outro: 'Outro',
}

interface BankLoanCardProps {
  loan: BankLoan
  onDelete: (id: string) => void
  onEdit: (loan: BankLoan) => void
  onPay: (loan: BankLoan) => void
  onSimulate: (loan: BankLoan) => void
  deleting?: boolean
}

/**
 * Card de empréstimo/financiamento bancário (PRICE/SAC, taxa de juros, saldo
 * devedor já calculado pelo backend — spec 046, unifica o antigo `financings`
 * com o tracker completo que só existia no Telegram).
 * Compartilha o layout `.loan-card` com o card de empréstimo p2p.
 */
export function BankLoanCard({ loan, onDelete, onEdit, onPay, onSimulate, deleting }: BankLoanCardProps) {
  const MAX_DOTS = 12
  const totalDots = Math.min(loan.num_parcelas_total, MAX_DOTS)
  const pctPaid = loan.num_parcelas_total > 0 ? loan.parcelas_pagas / loan.num_parcelas_total : 0
  const isQuitado = loan.status === 'quitado'

  return (
    <div className="loan-card">
      {/* Cabeçalho: badge + botão de exclusão */}
      <div className="loan-head">
        <span className="loan-dir financing">{TIPO_LABEL[loan.tipo] ?? loan.tipo} · {loan.sistema_amortizacao}</span>
        <button
          className="loan-del"
          onClick={() => onDelete(loan.id)}
          disabled={deleting}
          aria-label="Excluir empréstimo"
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      {/* Nome e observações */}
      <div>
        <div className="loan-person">{loan.name}</div>
        <div className="loan-note">
          Taxa: {(loan.taxa_juros_mensal * 100).toFixed(2)}%/mês
          {loan.conta ? ` · ${loan.conta}` : ''}
        </div>
        {loan.notes && <div className="loan-note">{loan.notes}</div>}
      </div>

      {/* Saldo devedor (já calculado pelo backend — mesmo motor do Telegram) */}
      <div className="loan-amount amount">R$ {fmt(loan.saldo_devedor)}</div>

      {/* Dots de parcelas */}
      <div className="loan-dots">
        {Array.from({ length: totalDots }, (_, i) => (
          <div
            key={i}
            className={`loan-dot ${i < loan.parcelas_pagas ? 'paid' : ''}`}
            title={`Parcela ${i + 1}`}
          />
        ))}
        {loan.num_parcelas_total > MAX_DOTS && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            +{loan.num_parcelas_total - MAX_DOTS}
          </span>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="loan-track">
        <div className="loan-fill" style={{ width: `${pctPaid * 100}%` }} />
      </div>

      {/* Meta: parcelas + valor parcela */}
      <div className="loan-meta">
        <span>
          <strong>{loan.parcelas_pagas}/{loan.num_parcelas_total}</strong> parcelas · R$ {fmt(loan.valor_parcela)}/mês
        </span>
        <span>{loan.parcelas_restantes} restantes</span>
      </div>

      {/* Ações */}
      <div className="loan-actions">
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onEdit(loan)}>
          Editar
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onSimulate(loan)}>
          Simular
        </button>
        {!isQuitado && (
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onPay(loan)}>
            Registrar parcela
          </button>
        )}
      </div>
    </div>
  )
}
