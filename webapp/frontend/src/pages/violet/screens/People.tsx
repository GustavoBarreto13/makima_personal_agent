// Pessoas e Tags do diário (antes os cliques só abriam o arquivo inteiro; agora filtram de verdade).
// Pessoas citadas com @ vêm agrupadas pela pessoa da Komi (mesmo citada com nomes diferentes); as menções
// antigas, sem vínculo, aparecem pelo nome. A página da pessoa mostra todos os trechos e o atalho para a Komi.

import { useMemo, useState } from 'react'
import { Avatar, Button, EmptyState, ErrorState, Icon, Input, LoadingState, Page, SectionHeader } from '../../../design'
import { fmtRelative, pluralize } from '../../../design/core/format'
import { DayBulletsList } from '../components/DayBulletsList'
import { useViolet } from '../context'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { MentionCount } from '../types'

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function People() {
  const v = useViolet()
  if (v.route.person) return <PersonView personKey={v.route.person} />
  return <MentionIndex kind="person" />
}

export function Tags() {
  const v = useViolet()
  if (v.route.tag) return <TagView tag={v.route.tag} />
  return <MentionIndex kind="tag" />
}

function MentionIndex({ kind }: { kind: 'person' | 'tag' }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.mentions(kind), [kind, v.rev])
  const [q, setQ] = useState('')
  const items = useMemo(() => (state.status === 'ok' ? state.data.filter((m) => !q || norm(m.value).includes(norm(q))) : []), [state, q])
  const open = (m: MentionCount) => v.goto(kind === 'person' ? { view: 'people', person: m.person_id ?? `nome:${m.value}` } : { view: 'tags', tag: m.value })

  return (
    <Page>
      <Input type="search" aria-label={kind === 'person' ? 'Buscar pessoa' : 'Buscar tag'} placeholder={kind === 'person' ? 'Buscar pessoa…' : 'Buscar tag…'} value={q} onChange={(e) => setQ(e.target.value)} />
      {state.status === 'loading' && <LoadingState count={6} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.length === 0 && (
        <EmptyState icon={kind === 'person' ? 'people' : 'hash'} title={kind === 'person' ? 'Ninguém citado ainda' : 'Nenhuma tag ainda'}
          hint={kind === 'person' ? 'Escreva @ e o nome no diário — a Violet sugere as pessoas da Komi.' : 'Use #tag nos momentos para agrupar temas.'} />
      )}
      <div className="vl-mentions">
        {items.map((m) => (
          <button key={`${m.person_id ?? ''}:${m.value}`} type="button" className="vl-mention" onClick={() => open(m)}>
            {kind === 'person' ? <Avatar name={m.value} size={32} /> : <span className="vl-hash"><Icon name="hash" size={16} /></span>}
            <span className="vl-mention-main">
              <b>{kind === 'person' ? m.value : `#${m.value}`}</b>
              <small className="vl-muted">{pluralize(m.count, 'vez', 'vezes')} · última {fmtRelative(m.last_date, v.today)}{kind === 'person' && !m.person_id ? ' · sem vínculo na Komi' : ''}</small>
            </span>
            <Icon name="right" size={14} />
          </button>
        ))}
      </div>
    </Page>
  )
}

function PersonView({ personKey }: { personKey: string }) {
  const v = useViolet()
  const isName = personKey.startsWith('nome:')
  const value = isName ? personKey.slice(5) : ''
  const { state, retry } = useLoad(
    () => violetApi.filter('person', isName ? { value } : { person_id: personKey }),
    [personKey, v.rev],
  )
  const mentions = useLoad(() => violetApi.mentions('person'), [])
  const name = isName ? value : (mentions.state.status === 'ok' ? mentions.state.data.find((m) => m.person_id === personKey)?.value : undefined) ?? 'Pessoa'
  const count = state.status === 'ok' ? state.data.reduce((s, d) => s + d.bullets.length, 0) : 0

  return (
    <Page>
      <button type="button" className="ds-back-l" onClick={() => v.goto('people')}><Icon name="left" size={16} /> Pessoas</button>
      <header className="vl-personhead">
        <Avatar name={name} size={56} />
        <div>
          <h2>{name}</h2>
          <p className="vl-muted">{pluralize(count, 'momento', 'momentos')} no diário{isName ? ' · menção antiga, sem vínculo na Komi' : ''}</p>
        </div>
        <span className="vl-spacer" />
        {!isName && <Button icon="person" onClick={() => v.openLink(`/people#pessoa/${personKey}`)}>Abrir na Komi</Button>}
        <Button variant="ghost" icon="mail" onClick={() => v.goto({ view: 'letters' })}>Cartas</Button>
      </header>
      <SectionHeader title="No diário" />
      {state.status === 'loading' && <LoadingState count={4} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (state.data.length ? <DayBulletsList days={state.data} /> : <EmptyState icon="people" title="Nenhum momento com essa pessoa" />)}
    </Page>
  )
}

function TagView({ tag }: { tag: string }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.filter('tag', { value: tag }), [tag, v.rev])
  const pinned = v.prefs.pins.includes(`tag:${tag}`)
  return (
    <Page>
      <button type="button" className="ds-back-l" onClick={() => v.goto('tags')}><Icon name="left" size={16} /> Tags</button>
      <header className="vl-personhead">
        <span className="vl-hash vl-hash-lg"><Icon name="hash" size={24} /></span>
        <div><h2>#{tag}</h2></div>
        <span className="vl-spacer" />
        <Button icon="pin" variant={pinned ? 'primary' : 'default'} disabled={!pinned && v.prefs.pins.length >= 6}
          onClick={() => v.setPrefs({ pins: pinned ? v.prefs.pins.filter((p) => p !== `tag:${tag}`) : [...v.prefs.pins, `tag:${tag}`] })}>
          {pinned ? 'Fixada no Refletir' : 'Fixar no Refletir'}
        </Button>
      </header>
      {state.status === 'loading' && <LoadingState count={4} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (state.data.length ? <DayBulletsList days={state.data} /> : <EmptyState icon="hash" title={`Nada com #${tag}`} />)}
    </Page>
  )
}
