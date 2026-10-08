// Diário: todas as sessões, em lista agrupada por mês. Cada linha mostra o dia, o pôster, o anime (com os
// episódios e a anotação), a nota e as ações. Excluir pede confirmação e dá "Desfazer".

import { useMemo, useState } from 'react'
import { fmtRelative, parseISODate, WEEKDAYS_SHORT } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, IconButton, Page, Stars } from '../../../design'
import { Poster } from '../components/Poster'
import { useMarin } from '../context'
import { epLabel } from '../lib/log'
import { malLabel } from '../lib/score'
import { makeDiarySchema } from '../lib/schemas'
import { deleteSession } from '../lib/sessions'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'
import type { Session } from '../types'

const NONE: Session[] = []

/** "outubro de 2026" → mês grande + ano pequeno. Outros agrupamentos (por anime) caem no título simples. */
function GroupHeader({ name, count }: { name: string; count: number }) {
  const m = /^(.+) de (\d{4})$/.exec(name)
  return (
    <div className="mr-dmh">
      <span className="mr-dmn">{m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : name}</span>
      {m && <span className="mr-dmy">{m[2]}</span>}
      <span className="mr-dmc">{count} {count === 1 ? 'sessão' : 'sessões'}</span>
    </div>
  )
}

export function Diary() {
  const marin = useMarin()
  const { state, retry } = useLoad(() => marinApi.diary(), [marin.rev])
  const sessions = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeDiarySchema(), [])
  const c = useCollection(schema, sessions, { today: marin.today })
  const [filters, setFilters] = useState(false)

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar por anime ou anotação" />
      <CollectionMeta c={c} noun={['sessão', 'sessões']} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderGroupHeader={(key, count) => <GroupHeader name={key} count={count} />}
        renderRow={(s) => (
          <div key={s.id} className="mr-drow">
            <div className="mr-dday" title={fmtRelative(s.date, marin.today)}>
              <b>{Number(s.date.slice(8, 10))}</b>
              <span>{WEEKDAYS_SHORT[parseISODate(s.date).getDay()]}</span>
            </div>
            <Poster title={s.title} src={s.poster} small onOpen={() => marin.goto({ view: 'catalog', animeId: s.animeId })} />
            <button type="button" className="mr-link mr-dmain" onClick={() => marin.goto({ view: 'catalog', animeId: s.animeId })}>
              <span className="mr-dtitle">{s.title}</span>
              <span className="mr-deps">{epLabel(s.epStart, s.epEnd, s.count)}{s.epStart !== null && s.count > 1 ? ` · ${s.count} eps` : ''}</span>
              {s.notes && <span className="mr-dnote">“{s.notes}”</span>}
            </button>
            <div className="mr-dright">
              {s.rating ? <><Stars value={s.rating} /><span className="ds-mono">{malLabel(s.rating)}</span></> : <span className="ds-mono">sem nota</span>}
              <IconButton icon="delete" label={`Excluir sessão de ${s.title}`} size={16} onClick={() => void deleteSession(s, marin.reload)} />
            </div>
          </div>
        )}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhuma sessão com esses filtros"
        firstRun={<EmptyState icon="anime" title="O diário está vazio" hint="Cada vez que você assiste a episódios vira uma sessão aqui." action={<Button variant="primary" icon="add" onClick={() => marin.openLog()}>Logar episódio</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={sessions} onClose={() => setFilters(false)} noun={['sessão', 'sessões']} />}
    </Page>
  )
}
