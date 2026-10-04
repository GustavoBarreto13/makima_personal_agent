// Diário: todas as sessões, agrupadas por mês. Cada linha edita, exclui (com Desfazer) e, quando há mais de uma
// sessão no mesmo dia, sobe/desce na ordem do dia. Tudo por botão: nada depende de arrastar.

import { useMemo, useState } from 'react'
import { fmtRelative } from '../../../design/core/format'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, IconButton, Page, Stars } from '../../../design'
import { akaneApi } from '../akaneApi'
import { SessionEditor } from '../components/SessionEditor'
import { useAkane } from '../context'
import { makeDiarySchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import type { DiaryEntry } from '../types'

const NONE: DiaryEntry[] = []

export function Diary() {
  const akane = useAkane()
  const { state, retry } = useLoad(() => akaneApi.diary().then((r) => r.entries), [akane.rev])
  const entries = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeDiarySchema(), [])
  const c = useCollection(schema, entries, { today: akane.today })
  const [filters, setFilters] = useState(false)
  const [editing, setEditing] = useState<DiaryEntry | null>(null)

  const remove = async (e: DiaryEntry) => {
    const ok = await confirm({ title: 'Excluir esta sessão?', body: `A sessão de ${e.movie_title ?? 'filme'} em ${e.watched_date.slice(8)}/${e.watched_date.slice(5, 7)} sai do diário. Você poderá desfazer logo depois.`, confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    try {
      await akaneApi.deleteDiary(e.id)
      akane.reload()
      toast('Sessão excluída', {
        undo: () => {
          void akaneApi.logWatch(e.movie_id, {
            watched_date: e.watched_date, rating: e.rating, review: e.review, tags: e.tags, rewatch: e.rewatch,
            companion_ids: e.companions.map((p) => p.id), watch_location_id: e.watch_location?.id ?? null, source: 'manual',
          }).then(akane.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
        },
      })
    } catch { toast('Não foi possível excluir a sessão.', { tone: 'error' }) }
  }

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
        renderRow={(e) => {
          const day = sameDay(e)
          const pos = day.findIndex((x) => x.id === e.id)
          const meta = [fmtRelative(e.watched_date, akane.today), e.watch_location?.name, e.companions.length ? `com ${e.companions.map((p) => p.name).join(', ')}` : null].filter(Boolean).join(' · ')
          return (
            <div key={e.id} className="ds-lrow ax-session">
              <span className="ds-lead"><Icon name={e.rewatch ? 'rewatch' : e.watch_location?.kind === 'cinema' ? 'cinema' : 'movie'} size={18} /></span>
              <button type="button" className="ds-t ax-link" onClick={() => akane.goto({ view: 'films', movieId: e.movie_id })}>
                <b>{e.movie_title ?? 'Filme'}</b><span>{meta}</span>
              </button>
              {e.rating ? <Stars value={e.rating} /> : null}
              {day.length > 1 && (
                <>
                  <IconButton icon="up" label={`Subir ${e.movie_title ?? 'sessão'} na ordem do dia`} size={16} disabled={pos === 0} onClick={() => void move(e, -1)} />
                  <IconButton icon="down" label={`Descer ${e.movie_title ?? 'sessão'} na ordem do dia`} size={16} disabled={pos === day.length - 1} onClick={() => void move(e, 1)} />
                </>
              )}
              <IconButton icon="edit" label={`Editar sessão de ${e.movie_title ?? 'filme'}`} size={16} onClick={() => setEditing(e)} />
              <IconButton icon="delete" label={`Excluir sessão de ${e.movie_title ?? 'filme'}`} size={16} onClick={() => void remove(e)} />
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
