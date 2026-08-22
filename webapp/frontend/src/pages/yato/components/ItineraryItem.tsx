/**
 * ItineraryItem.tsx — Yato · Viagens (fatia 066)
 *
 * Linha de um item do roteiro: ícone circular do modal de deslocamento,
 * horário em mono SÓ se existir (regra §10.12 — nunca inventar horário),
 * endereço e custo. `seam` desenha a costura tracejada até o próximo item.
 */

import type { ItineraryItem as ItineraryItemT, TransportMode } from '../types'
import { money } from '../dateUtils'

export const MODE_EMOJI: Record<string, string> = {
  a_pe: '🚶', transporte_publico: '🚌', app_corrida: '🚗', taxi: '🚕', mototaxi: '🛺', transfer: '🚐', outro: '•',
}
export const MODE_LABEL: Record<string, string> = {
  a_pe: 'a pé', transporte_publico: 'ônibus', app_corrida: 'app', taxi: 'táxi', mototaxi: 'mototáxi', transfer: 'transfer', outro: 'outro',
}
export const MODE_ORDER: TransportMode[] = ['a_pe', 'transporte_publico', 'app_corrida', 'taxi', 'mototaxi', 'transfer', 'outro']

interface ItineraryItemProps {
  item: ItineraryItemT
  seam?: boolean
}

export function ItineraryItemRow({ item, seam }: ItineraryItemProps) {
  const mode = item.transport_mode || 'outro'
  return (
    <div className="itin">
      {seam && <div className="itin-seam" />}
      <div className="itin-mode" title={MODE_LABEL[mode]}>{MODE_EMOJI[mode] || '•'}</div>
      <div className="itin-b">
        <div className="itin-top">
          {item.start_time && <span className="itin-time">{item.start_time}</span>}
          <span className="itin-title">{item.title}</span>
          {item.cost_estimate != null && <span className="itin-cost">{money(item.cost_estimate)}</span>}
        </div>
        {item.address && <div className="itin-addr">{item.address}</div>}
      </div>
    </div>
  )
}
