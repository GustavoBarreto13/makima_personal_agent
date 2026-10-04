// Diário: todas as sessões, em lista agrupada por mês. Cada linha mostra o dia, o pôster, o filme (com a resenha em
// itálico), a nota e onde/com quem foi; edita, exclui (com Desfazer) e, quando há mais de uma sessão no mesmo dia,
// sobe/desce na ordem do dia. Tudo por botão: nada depende de arrastar.

import { useMemo, useState } from 'react'
import { fmtRelative, parseISODate } from '../../../design/core/format'
import { toast } from '../../../design/headless/toast'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, IconButton, Page, Stars } from '../../../design'
import { akaneApi } from '../akaneApi'
import { Poster } from '../components/Poster'
import { SessionEditor } from '../components/SessionEditor'
import { useAkane } from '../context'
import { deleteSession } from '../lib/sessions'
import { makeDiarySchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import type { DiaryEntry } from '../types'

const NONE: DiaryEntry[] = []
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "outubro de 2026" → mês grande + ano pequeno. Outros agrupamentos (por local) caem no título simples. */
function GroupHeader({ name, count }: { name: string; count: number }) {
  const m = /^(.+) de (\d{4})$/.exec(name)
  return (
    <div className="ax-dmh">
      <span className="ax-dmn">{m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : name}</span>
      {m && <span className="ax-dmy">{m[2]}</span>}
      <span className="ax-dmc">{count} {count === 1 ? 'sessão' : 'sessões'}</span>
    </div>
  )
}

export function Diary() {
  const akane = useAkane()
  const { state, retry } = useLoad(() => akaneApi.diary().then((r) => r.entries), [akane.rev])
  const entries = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeDiarySchema(), [])
  const c = useCollection(schema, entries, { today: akane.today })
  const [filters, setFilters] = useState(false)
  const [editing, setEditing] = useState<DiaryEntry | null>(null)

  const remove = (e: DiaryEntry) => deleteSession(e, e.movie_title ?? 'filme', akane.reload)

  // Sessões do mesmo dia, na ordem em que aparecem (mais nova primeiro). O backend quer a mais antiga primeiro.
  const move = async (e: DiaryEntry, dir: -1 | 1) => {
    const day = entries.filter((x) => x.watched_date === e.watched_date)
    const i = day.findIndex((x) => x.id === e.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= day.length) return
    const next = [...day]
    ;[next[i], next[j]] = [next[j], next[i]]
    try {
      await akaneApi.reorderDiary(e.watched_date, next.map((x) => x.id).reverse())
      akane.reload()
    } catch { toast('Não foi possível mudar a ordem.', { tone: 'error' }) }
  }

  const sameDay = (e: DiaryEntry) => entries.filter((x) => x.watched_date === e.watched_date)

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar por filme, resenha ou pessoa" />
      <CollectionMeta c={c} noun={['sessão', 'sessões']} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderGroupHeader={(key, count) => <GroupHeader name={key} count={count} />}
        renderRow={(e) => {
          const day = sameDay(e)
          const pos = day.findIndex((x) => x.id === e.id)
          const title = e.movie_title ?? 'Filme'
          return (
            <div key={e.id} className="ax-drow">
              <div className="ax-dday" title={fmtRelative(e.watched_date, akane.today)}>
                <b>{Number(e.watched_date.slice(8, 10))}</b>
                <span>{WEEKDAYS[parseISODate(e.watched_date).getDay()]}</span>
              </div>
              <Poster title={title} src={e.poster_url} small onOpen={() => akane.goto({ view: 'films', movieId: e.movie_id })} />
              <button type="button" className="ax-link ax-dmain" onClick={() => akane.goto({ view: 'films', movieId: e.movie_id })}>
                <span className="ax-dtitle">{title}</span>
                {e.review && <span className="ax-dnote">“{e.review}”</span>}
              </button>
              <div className="ax-dright">
                <div className="ax-dmarks">
                  {e.rating ? <Stars value={e.rating} /> : <span className="ds-mono">sem nota</span>}
                  {e.rewatch && <Icon name="rewatch" size={14} label="Revisão" />}
                  {e.companions.map((p) => <span key={p.id} className="ax-chip ax-chip-person"><Icon name="person" size={11} />{p.name}</span>)}
                  {e.watch_location && <span className="ax-chip"><Icon name={e.watch_location.kind === 'cinema' ? 'cinema' : 'couch'} size={11} />{e.watch_location.name}</span>}
                </div>
                <div className="ax-dact">
                  {day.length > 1 && (
                    <>
                      <IconButton icon="up" label={`Subir ${title} na ordem do dia`} size={16} disabled={pos === 0} onClick={() => void move(e, -1)} />
                      <IconButton icon="down" label={`Descer ${title} na ordem do dia`} size={16} disabled={pos === day.length - 1} onClick={() => void move(e, 1)} />
                    </>
                  )}
                  <IconButton icon="edit" label={`Editar sessão de ${title}`} size={16} onClick={() => setEditing(e)} />
                  <IconButton icon="delete" label={`Excluir sessão de ${title}`} size={16} onClick={() => void remove(e)} />
                </div>
              </div>
            </div>
          )
        }}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhuma sessão com esses filtros"
        firstRun={<EmptyState icon="movie" title="O diário está vazio" hint="Cada vez que você assiste a um filme vira uma sessão aqui." action={<Button variant="primary" icon="add" onClick={() => akane.openLog()}>Logar filme</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={entries} onClose={() => setFilters(false)} noun={['sessão', 'sessões']} />}
      {editing && <SessionEditor key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
