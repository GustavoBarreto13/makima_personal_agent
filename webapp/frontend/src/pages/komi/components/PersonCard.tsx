// Cartão e linha de pessoa (tela Pessoas, resultados e listas). O cartão tem cara de bilhete: foto, Nome em letra
// de mão, Apelido · Nome completo embaixo, relacionamento, espaço e o último contato.

import { Avatar, Icon, Tag } from '../../../design'
import { useKomi } from '../context'
import { daysSince, sinceLabel } from '../lib/dates'
import { SPACE } from '../lib/kinds'
import { nameDetail } from '../lib/people'
import type { PersonRow } from '../types'

/** Relacionamento mostrado ao lado do nome: o rótulo da lista configurável ou o texto livre ("mãe"). */
function useRelationLabel(p: PersonRow): string {
  const { categories } = useKomi()
  return p.relationship || categories.find((c) => c.slug === p.category)?.label || ''
}

function ContactLine({ p }: { p: PersonRow }) {
  const { today } = useKomi()
  const days = daysSince(p.last_interaction?.date, today)
  return <span className="km-contact"><Icon name="history" size={12} /> {days === null ? 'sem contato registrado' : `contato ${sinceLabel(days)}`}</span>
}

export function PersonCard({ person, onOpen }: { person: PersonRow; onOpen: () => void }) {
  const relation = useRelationLabel(person)
  const detail = nameDetail(person)
  return (
    <button type="button" className="ds-card km-card" onClick={onOpen} aria-label={`Abrir ${person.name}`}>
      <span className="km-tape" aria-hidden="true" />
      <Avatar name={person.name} src={person.avatar_url} size={56} />
      <span className="km-card-body">
        <b className="km-name">{person.name}</b>
        {detail && <span className="km-detail">{detail}</span>}
        <span className="km-tags">
          {relation && <Tag>{relation}</Tag>}
          {person.context !== 'personal' && <Tag pr>{SPACE[person.context].label}</Tag>}
        </span>
        <ContactLine p={person} />
      </span>
    </button>
  )
}

export function PersonRowItem({ person, onOpen }: { person: PersonRow; onOpen: () => void }) {
  const relation = useRelationLabel(person)
  const detail = nameDetail(person)
  return (
    <button type="button" className="km-row" onClick={onOpen} aria-label={`Abrir ${person.name}`}>
      <Avatar name={person.name} src={person.avatar_url} size={40} />
      <span className="km-row-main">
        <b className="km-name">{person.name}</b>
        <span className="km-detail">{[detail, relation].filter(Boolean).join(' · ')}</span>
      </span>
      {person.context !== 'personal' && <Tag pr>{SPACE[person.context].label}</Tag>}
      <ContactLine p={person} />
    </button>
  )
}
