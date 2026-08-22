/**
 * ChecklistRow.tsx — Yato · Viagens (fatia 066)
 *
 * Checkbox estilo carimbo (glifo ✕, não ✓ genérico) + chip de origem
 * (`do dossiê` com tooltip do passo gerador, ou `manual`).
 */

import type { TripChecklistItem } from '../types'

interface ChecklistRowProps {
  item: TripChecklistItem
  onToggle: () => void
}

export function ChecklistRow({ item, onToggle }: ChecklistRowProps) {
  return (
    <div className={'chk-row' + (item.done ? ' done' : '')}>
      <button className={'chk-box' + (item.done ? ' done' : '')} onClick={onToggle}
              title={item.done ? 'desmarcar' : 'marcar'}>{item.done ? '✕' : ''}</button>
      <span className="chk-label">{item.label}</span>
      <span className={'chk-src' + (item.origin === 'dossie' ? ' dos' : '')}
            title={item.origin === 'dossie' ? 'item gerado por um passo do dossiê de mobilidade' : 'item criado à mão'}>
        {item.origin === 'dossie' ? 'do dossiê' : 'manual'}
      </span>
    </div>
  )
}
