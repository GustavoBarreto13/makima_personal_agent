// Não ditos — tudo o que você queria dizer e não disse, num lugar só. Lista agrupada (guardados primeiro),
// com o texto borrado até tocar. Abrir um registro mostra o texto, o desfecho e as ações; "Registrar" funciona
// sem passar pelo Escrever (cai no dia de hoje).

import { useEffect, useMemo, useState } from 'react'
import {
  Avatar, Button, CollectionBody, CollectionMeta, CollectionToolbar, DetailPage, EmptyState, ErrorState, FilterSheet, Icon, LoadingState, Page, confirm, toast,
  type PersonOption,
} from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { UnsaidCard } from '../components/UnsaidCard'
import { UnsaidComposer } from '../components/UnsaidComposer'
import { RichText } from '../components/RichText'
import { komiApi } from '../../komi/komiApi'
import { useViolet } from '../context'
import { makeUnsaidSchema } from '../lib/schemas'
import { reasonLabel, statusLabel, unsaidTo } from '../lib/unsaid'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { Unsaid as UnsaidItem } from '../types'

const NONE: UnsaidItem[] = []

export function Unsaid() {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.allUnsaid({ limit: 200 }), [v.rev])
  const items = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeUnsaidSchema(), [])
  const c = useCollection(schema, items, { today: v.today })
  const [filters, setFilters] = useState(false)
  const [editing, setEditing] = useState<UnsaidItem | 'new' | null>(v.route.newUnsaid ? 'new' : null)
  const [preset, setPreset] = useState<PersonOption | null>(null)

  // Link vindo da página da pessoa (#naodito/novo/<id>): descobre o nome só para pré-preencher.
  const presetId = v.route.unsaidPerson
  useEffect(() => {
    if (!presetId) return
    let live = true
    komiApi.get(presetId).then((p) => { if (live) setPreset({ id: presetId, name: p.perfil.name, avatar: p.perfil.avatar_url }) }).catch(() => undefined)
    return () => { live = false }
  }, [presetId])

  if (v.route.unsaidId) return <UnsaidReader id={v.route.unsaidId} />

  const close = () => { setEditing(null); setPreset(null); if (v.route.newUnsaid) v.goto('unsaid') }

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar não ditos"
        extra={<Button variant="primary" icon="add" onClick={() => setEditing('new')}>Registrar</Button>} />
      <CollectionMeta c={c} noun={['não dito', 'não ditos']} />
      <CollectionBody
        c={c}
        view="grid"
        gridClass="vl-letters-grid"
        renderCard={(u) => <UnsaidCard key={u.id} item={u} today={v.today} showDate onOpen={() => v.goto({ view: 'unsaid', unsaidId: u.id })} />}
        renderRow={(u) => <UnsaidCard key={u.id} item={u} today={v.today} showDate onOpen={() => v.goto({ view: 'unsaid', unsaidId: u.id })} />}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nada com esses filtros"
        firstRun={<EmptyState icon="quote" title="Nada guardado ainda"
          hint="Sabe aquilo que você queria dizer pra alguém e não pode, não quer ou não consegue? Solta aqui. Fica só com você."
          action={<Button variant="primary" icon="add" onClick={() => setEditing('new')}>Registrar o primeiro</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={items} onClose={() => setFilters(false)} noun={['não dito', 'não ditos']} />}
      {editing && (
        <UnsaidComposer
          date={editing === 'new' ? v.today : editing.date ?? v.today}
          item={editing === 'new' ? null : editing}
          initialPerson={editing === 'new' ? preset : null}
          onClose={close}
          onSaved={() => v.reload()}
        />
      )}
    </Page>
  )
}

function UnsaidReader({ id }: { id: number }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.unsaid(id), [id, v.rev])
  const [editing, setEditing] = useState(false)
  const [shown, setShown] = useState(false)

  if (state.status === 'loading') return <Page><LoadingState variant="card" count={1} /></Page>
  if (state.status === 'error') return <Page><ErrorState title="Não encontrei esse registro" onRetry={retry} /></Page>
  const u = state.data.unsaid

  async function settle(status: 'said' | 'let_go' | 'kept') {
    try {
      await violetApi.resolveUnsaid(u.id, status)
      toast(status === 'kept' ? 'Voltou para os guardados.' : status === 'said' ? 'Que bom que você falou.' : 'Deixado para trás.', { tone: 'success' })
      v.reload()
    } catch { toast('Não consegui atualizar.', { tone: 'error' }) }
  }

  async function remove() {
    const ok = await confirm({ title: 'Apagar o registro?', body: 'Ele sai do diário e da página da pessoa na Komi.', confirmLabel: 'Apagar', danger: true })
    if (!ok) return
    try {
      await violetApi.deleteUnsaid(u.id)
      toast('Apagado.')
      v.reload()
      v.goto('unsaid')
    } catch { toast('Não consegui apagar.', { tone: 'error' }) }
  }

  return (
    <Page>
      <DetailPage
        backLabel="Não ditos"
        onBack={() => v.goto('unsaid')}
        title={`Para ${unsaidTo(u)}`}
        subtitle={`${u.date ? fmtDateLong(u.date) : ''} · ${reasonLabel(u.reason).toLowerCase()}`}
        chips={<span className={`vl-pill${u.status === 'kept' ? '' : ' vl-pill-ok'}`}>{statusLabel(u.status)}</span>}
        icon="quote"
        hue={252}
        actions={
          <>
            {u.status === 'kept' ? (
              <>
                <Button variant="primary" icon="send" onClick={() => void settle('said')}>Acabei falando</Button>
                <Button icon="check" onClick={() => void settle('let_go')}>Deixei ir</Button>
              </>
            ) : <Button icon="restore" onClick={() => void settle('kept')}>Voltar a guardar</Button>}
            <Button icon="edit" onClick={() => setEditing(true)}>Editar</Button>
            {u.date && <Button icon="journal" onClick={() => v.goto({ view: 'write', date: u.date })}>Ver o dia</Button>}
            <Button variant="ghost" icon="delete" onClick={() => void remove()}>Apagar</Button>
          </>
        }
        tabs={[
          {
            id: 'texto', label: 'O que ficou preso',
            content: (
              <article className="vl-letter-paper vl-letter-read vl-unsaid-paper">
                <span className="vl-letter-salute">Pra {unsaidTo(u)},</span>
                <button type="button" className={`vl-unsaid-read${shown ? '' : ' vl-veiled'}`} aria-pressed={shown} onClick={() => setShown((s) => !s)}
                  aria-label={shown ? 'Esconder o texto' : 'Texto oculto — toque para ver'}>
                  <div className="vl-letter-text"><RichText text={u.body} /></div>
                  {!shown && <span className="vl-unsaid-reveal"><Icon name="eye" size={14} />Toque para ver</span>}
                </button>
                {u.why && <p className="vl-muted"><b>O que me impede:</b> {u.why}</p>}
                {u.outcome_note && <p className="vl-muted"><b>Como foi:</b> {u.outcome_note}</p>}
              </article>
            ),
          },
          {
            id: 'pessoas', label: `Pessoas (${u.people.length})`,
            content: u.people.length ? (
              <div className="vl-people-list">
                {u.people.map((p) => (
                  <button key={p.id} type="button" className="vl-person-row" onClick={() => v.goto({ view: 'people', person: p.id })}>
                    <Avatar name={p.name} src={p.avatar_url} size={32} /><b>{p.name}</b><Icon name="right" size={14} />
                  </button>
                ))}
              </div>
            ) : <EmptyState icon="people" title="Ninguém da Komi aqui" hint="Edite para vincular uma pessoa." />,
          },
        ]}
      />
      {editing && <UnsaidComposer date={u.date ?? v.today} item={u} onClose={() => setEditing(false)} onSaved={() => v.reload()} />}
    </Page>
  )
}
