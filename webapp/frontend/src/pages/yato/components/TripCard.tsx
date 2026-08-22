/**
 * TripCard.tsx — Yato · Viagens (fatia 066)
 *
 * Ticket kraft com canhoto serrilhado (recorte via mask-image, ver yato.css
 * `.ticket`). Viagem `cancelada` fica dessaturada com tarja diagonal.
 */

import type { Trip, MobilityCheck } from '../types'
import { fmtRange, daysBetween, todayLocalISO } from '../dateUtils'
import { ReadinessMeter, checkedCount } from './ReadinessMeter'

const PROFILE_LABEL: Record<string, string> = { economia: 'economia', equilibrado: 'equilibrado', conforto: 'conforto' }
const PROFILE_CLASS: Record<string, string> = { economia: 'chip-eco', equilibrado: 'chip-mid', conforto: 'chip-lux' }
const STATUS_LABEL: Record<string, string> = {
  planejando: 'planejando', confirmada: 'confirmada', em_curso: 'em curso',
  concluida: 'concluída', cancelada: 'cancelada',
}

interface TripCardProps {
  trip: Trip
  checks?: MobilityCheck[] | null
  onClick?: () => void
}

export function TripCard({ trip, checks, onClick }: TripCardProps) {
  const cancel = trip.status === 'cancelada'
  const cd = daysBetween(todayLocalISO(), trip.start_date)
  const days = daysBetween(trip.start_date, trip.end_date) + 1

  const body = (
    <div className={'ticket' + (cancel ? ' trip-cancel' : '')} onClick={onClick}>
      <div className="ticket-body">
        <div className="t-city">{trip.city}<span className="t-uf">/{trip.state_uf}</span></div>
        <div className="t-dates">{fmtRange(trip.start_date, trip.end_date)}</div>
        <div className="t-chips">
          <span className={'chip chip-static ' + PROFILE_CLASS[trip.profile]}>{PROFILE_LABEL[trip.profile]}</span>
          <span className="chip chip-static">{STATUS_LABEL[trip.status]}</span>
          {cd > 0 && !cancel && <span className="chip chip-static">faltam {cd} dias</span>}
        </div>
      </div>
      <div className="ticket-stub">
        <div>
          <div className="t-stub-k">dias</div>
          <div className="t-stub-v">{days}</div>
        </div>
        <div>
          <div className="t-stub-k">prontidão</div>
          <ReadinessMeter checks={checks} />
          <div className="t-stub-k" style={{ marginTop: 4, letterSpacing: '0.08em' }}>{checkedCount(checks)}/7</div>
        </div>
      </div>
    </div>
  )
  if (!cancel) return body
  return (
    <div className="trip-cancel-wrap">
      {body}
      <div className="trip-cancel-tag">cancelada</div>
    </div>
  )
}

export { PROFILE_LABEL, PROFILE_CLASS, STATUS_LABEL }
