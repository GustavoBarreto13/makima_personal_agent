// Cartão de um "não dito": para quem, por que não foi dito e como está. O texto fica BORRADO até tocar
// nele (é íntimo — pode haver gente olhando a tela); tocar no cabeçalho abre o detalhe.

import { useState } from 'react'
import { Avatar, Icon } from '../../../design'
import { fmtRelative } from '../../../design/core/format'
import { plainText } from '../lib/markup'
import { reasonLabel, statusLabel, unsaidTo } from '../lib/unsaid'
import type { Unsaid } from '../types'

export function UnsaidCard({ item, today, onOpen, showDate }: { item: Unsaid; today: string; onOpen: () => void; showDate?: boolean }) {
  const [shown, setShown] = useState(false)
  const to = unsaidTo(item)
  return (
    <div className={`vl-unsaid${item.status !== 'kept' ? ' vl-settled' : ''}`}>
      <button type="button" className="vl-unsaid-head" onClick={onOpen}>
        {item.people[0] ? <Avatar name={to} src={item.people[0].avatar_url} size={24} /> : <Icon name="quote" size={16} />}
        <b>Para {to}</b>
        <span className="vl-pill">{reasonLabel(item.reason)}</span>
        {item.status !== 'kept' && <span className="vl-pill vl-pill-ok">{statusLabel(item.status)}</span>}
      </button>
      <button
        type="button"
        className={`vl-unsaid-body${shown ? '' : ' vl-veiled'}`}
        aria-pressed={shown}
        aria-label={shown ? 'Esconder o texto' : 'Texto oculto — toque para ver'}
        onClick={() => setShown((s) => !s)}
      >
        <span>{plainText(item.body).slice(0, 280)}</span>
        {!shown && <span className="vl-unsaid-reveal"><Icon name="eye" size={14} />Toque para ver</span>}
      </button>
      {showDate && item.date && <span className="vl-unsaid-meta">{fmtRelative(item.date, today)}</span>}
    </div>
  )
}
