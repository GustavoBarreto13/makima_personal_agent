// Datas: aniversários e outras datas importantes de todo mundo, a mais próxima primeiro, cada uma com seu lembrete.
// Aniversário não vira tarefa: ele mora no calendário da Kaguya como evento, com o lembrete combinado aqui.

import { useMemo, useState } from 'react'
import { Avatar, Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, Page, Tag } from '../../../design'
import { useCollection } from '../../../design/headless/useCollection'
import { fmtDate } from '../../../design/core/format'
import { useKomi } from '../context'
import { inLabel, remindText, upcomingDates, type UpcomingDate } from '../lib/dates'
import { makeDatesSchema } from '../lib/people'

const NOUN: [string, string] = ['data', 'datas']

export function DateRow({ d, onOpen }: { d: UpcomingDate; onOpen: () => void }) {
  return (
    <button type="button" className="km-row" onClick={onOpen} aria-label={`${d.label} de ${d.personName}`}>
      <Avatar name={d.personName} src={d.avatarUrl} size={40} />
      <span className="km-row-main">
        <b className="km-name">{d.personName}</b>
        <span className="km-detail">
          <Icon name={d.isBirthday ? 'cake' : 'calendar'} size={13} /> {d.label}
          {d.years ? ` · ${d.isBirthday ? `faz ${d.years} anos` : `${d.years} ${d.years === 1 ? 'ano' : 'anos'}`}` : ''}
        </span>
      </span>
      <span className="km-when">{fmtDate(d.date)} · {inLabel(d.inDays)}</span>
      <Tag>{remindText(d.remind)}</Tag>
    </button>
  )
}

export function Dates() {
  const komi = useKomi()
  const items = useMemo(() => upcomingDates(komi.visible, komi.today, 366), [komi.visible, komi.today])
  const schema = useMemo(() => makeDatesSchema(), [])
  const c = useCollection(schema, items, { today: komi.today })
  const [filters, setFilters] = useState(false)

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar pessoa ou data" extra={<Button variant="primary" size="sm" icon="add" onClick={() => komi.openPerson()}>Nova pessoa</Button>} />
      <CollectionMeta c={c} noun={NOUN} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderRow={(d) => <DateRow key={d.key} d={d} onOpen={() => komi.goto({ view: 'people', personId: d.personId, tab: 'dates' })} />}
        loading={komi.peopleState.status === 'loading'}
        error={komi.peopleState.status === 'error'}
        onRetry={komi.retryPeople}
        emptyTitle="Nenhuma data com esses filtros"
        firstRun={
          <EmptyState
            icon="days"
            title="Nenhuma data por aqui ainda"
            hint="Cadastre o aniversário de alguém (ou uma data importante) e a Komi lembra você na hora certa, direto no calendário."
            action={<Button variant="primary" icon="add" onClick={() => komi.openPerson()}>Nova pessoa</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={items} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}
