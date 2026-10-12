// Cartão de carta: o começo do texto já na fonte da carta, para quem, quando e se está lacrada.

import { Avatar, Icon } from '../../../design'
import { fmtRelative } from '../../../design/core/format'
import { fontClass } from '../lib/kinds'
import { plainText } from '../lib/markup'
import type { Letter } from '../types'

export function LetterCard({ letter, today, onOpen }: { letter: Letter; today: string; onOpen: () => void }) {
  return (
    <button type="button" className={`vl-lettercard${letter.status === 'sealed' ? ' vl-sealed' : ''}`} onClick={onOpen}>
      <span className="vl-lettercard-head">
        {letter.people[0] ? <Avatar name={letter.people[0].name} src={letter.people[0].avatar_url} size={24} /> : <Icon name="mail" size={16} />}
        <b>{letter.title || `Para ${letter.recipient}`}</b>
        {letter.status === 'sealed'
          ? <span className="vl-pill"><Icon name="seal" size={11} />lacrada</span>
          : <span className="vl-pill vl-pill-warn">rascunho</span>}
      </span>
      <span className={`vl-lettercard-body ${fontClass(letter.font)}`}>{plainText(letter.body).slice(0, 260)}</span>
      <span className="vl-lettercard-meta">
        {letter.title && <span>para {letter.recipient}</span>}
        {letter.date && <span>{fmtRelative(letter.date, today)}</span>}
      </span>
    </button>
  )
}
