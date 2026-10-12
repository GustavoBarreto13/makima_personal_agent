// Cartas — todas num lugar só (spec 076). Lista agrupada por mês (ou por destinatário), cada uma já na fonte em
// que foi escrita. Abrir uma lacrada lê em tela cheia, no papel; um rascunho abre direto para continuar.
// "Nova carta" escreve no dia de hoje sem precisar passar pelo Escrever.

import { useMemo, useState } from 'react'
import {
  Avatar, Button, CollectionBody, CollectionMeta, CollectionToolbar, DetailPage, EmptyState, ErrorState, FilterSheet, Icon, LoadingState, Page, confirm, toast,
} from '../../../design'
import { fmtDateLong, pluralize } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { LetterCard } from '../components/LetterCard'
import { LetterComposer } from '../components/LetterComposer'
import { RichText } from '../components/RichText'
import { useViolet } from '../context'
import { fontClass, fontLabel } from '../lib/kinds'
import { makeLettersSchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { Letter } from '../types'
import { MonthHeader } from './Archive'

const NONE: Letter[] = []

export function Letters() {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.allLetters({ limit: 200 }), [v.rev])
  const letters = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeLettersSchema(letters), [letters])
  const c = useCollection(schema, letters, { today: v.today })
  const [filters, setFilters] = useState(false)
  const [editing, setEditing] = useState<Letter | 'new' | null>(v.route.newLetter ? 'new' : null)

  if (v.route.letterId) return <LetterReader id={v.route.letterId} />

  const close = () => { setEditing(null); if (v.route.newLetter) v.goto('letters') }

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar cartas"
        extra={<Button variant="primary" icon="edit" onClick={() => setEditing('new')}>Nova carta</Button>} />
      <CollectionMeta c={c} noun={['carta', 'cartas']} />
      <CollectionBody
        c={c}
        view="grid"
        gridClass="vl-letters-grid"
        renderGroupHeader={(key, count) => <MonthHeader name={key} count={count} noun={['carta', 'cartas']} />}
        renderCard={(l) => (
          <LetterCard key={l.id} letter={l} today={v.today} onOpen={() => (l.status === 'draft' ? setEditing(l) : v.goto({ view: 'letters', letterId: l.id }))} />
        )}
        renderRow={(l) => <LetterCard key={l.id} letter={l} today={v.today} onOpen={() => v.goto({ view: 'letters', letterId: l.id })} />}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhuma carta com esses filtros"
        firstRun={<EmptyState icon="mail" title="Nenhuma carta ainda" hint="Escreva para alguém, para você no futuro, para um lugar — e lacre quando estiver pronta."
          action={<Button variant="primary" icon="edit" onClick={() => setEditing('new')}>Escrever a primeira</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={letters} onClose={() => setFilters(false)} noun={['carta', 'cartas']} />}
      {editing && (
        <LetterComposer
          date={editing === 'new' ? v.today : editing.date ?? v.today}
          letter={editing === 'new' ? null : editing}
          defaultFont={v.prefs.font}
          onClose={close}
          onSaved={() => v.reload()}
        />
      )}
    </Page>
  )
}

function LetterReader({ id }: { id: number }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.letter(id), [id, v.rev])
  const [editing, setEditing] = useState(false)

  if (state.status === 'loading') return <Page><LoadingState variant="card" count={1} /></Page>
  if (state.status === 'error') return <Page><ErrorState title="Não encontrei essa carta" onRetry={retry} /></Page>
  const l = state.data.letter

  async function remove() {
    const ok = await confirm({ title: 'Rasgar a carta?', body: 'Ela sai do diário para sempre.', confirmLabel: 'Rasgar', danger: true })
    if (!ok) return
    try {
      await violetApi.deleteLetter(l.id)
      toast('Carta rasgada.')
      v.reload()
      v.goto('letters')
    } catch { toast('Não consegui apagar a carta.', { tone: 'error' }) }
  }

  return (
    <Page>
      <DetailPage
        backLabel="Cartas"
        onBack={() => v.goto('letters')}
        title={l.title || `Para ${l.recipient}`}
        subtitle={`${l.date ? fmtDateLong(l.date) : ''} · fonte ${fontLabel(l.font)} · ${pluralize(l.body.split(/\s+/).filter(Boolean).length, 'palavra', 'palavras')}`}
        chips={l.status === 'sealed' ? <span className="vl-pill"><Icon name="seal" size={11} />lacrada</span> : <span className="vl-pill vl-pill-warn">rascunho</span>}
        icon="mail"
        hue={252}
        actions={
          <>
            {l.status === 'draft' && <Button variant="primary" icon="edit" onClick={() => setEditing(true)}>Continuar</Button>}
            {l.date && <Button icon="journal" onClick={() => v.goto({ view: 'write', date: l.date })}>Ver o dia</Button>}
            <Button variant="ghost" icon="delete" onClick={() => void remove()}>Rasgar</Button>
          </>
        }
        tabs={[
          {
            id: 'carta', label: 'Carta',
            content: (
              <article className={`vl-letter-paper vl-letter-read ${fontClass(l.font)}`}>
                <span className="vl-letter-salute">Para {l.recipient},</span>
                <div className="vl-letter-text"><RichText text={l.body} /></div>
                {l.sealed_at && <span className="vl-letter-seal"><Icon name="seal" size={14} />lacrada em {fmtDateLong(l.sealed_at.slice(0, 10))}</span>}
              </article>
            ),
          },
          {
            id: 'pessoas', label: `Pessoas (${l.people.length})`,
            content: l.people.length ? (
              <div className="vl-people-list">
                {l.people.map((p) => (
                  <button key={p.id} type="button" className="vl-person-row" onClick={() => v.goto({ view: 'people', person: p.id })}>
                    <Avatar name={p.name} src={p.avatar_url} size={32} /><b>{p.name}</b><Icon name="right" size={14} />
                  </button>
                ))}
              </div>
            ) : <EmptyState icon="people" title="Ninguém da Komi nesta carta" hint={l.status === 'draft' ? 'Continue a carta para vincular pessoas.' : undefined} />,
          },
        ]}
      />
      {editing && <LetterComposer date={l.date ?? v.today} letter={l} defaultFont={l.font} onClose={() => setEditing(false)} onSaved={() => v.reload()} />}
    </Page>
  )
}
