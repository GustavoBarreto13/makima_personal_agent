// Coleções: destaques, ideias, sabedoria, notas e sonhos (os momentos daquele tipo, de todos os dias), e a página
// de uma referência a outro agente (todos os momentos que citam aquele filme, livro, tarefa…) com o atalho para
// abrir o item no agente dono — o começo dos backlinks.

import { useMemo, useState } from 'react'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, ErrorState, FilterSheet, Icon, LoadingState, Page } from '../../../design'
import { fmtRelative } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { DayBulletsList } from '../components/DayBulletsList'
import { RichText } from '../components/RichText'
import { useViolet } from '../context'
import { fontClass, kindMeta } from '../lib/kinds'
import { AGENT_META, refDeepLink, refIcon } from '../lib/refs'
import { makeBulletsSchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { BulletKind, CollectionItem } from '../types'
import { MonthHeader } from './Archive'

const NONE: CollectionItem[] = []

export function Collection() {
  const v = useViolet()
  if (v.route.ref) return <RefView {...v.route.ref} />
  return <KindCollection kind={v.route.kind ?? 'highlight'} />
}

function KindCollection({ kind }: { kind: BulletKind | 'dreams' }) {
  const v = useViolet()
  // "Sonhos" junta o campo sonho dos dias com os momentos marcados como Sonho.
  const { state, retry } = useLoad<CollectionItem[]>(async () => {
    if (kind !== 'dreams') return violetApi.collection(kind)
    const [pages, bullets] = await Promise.all([violetApi.dreams(), violetApi.collection('dream')])
    return [
      ...pages.map((d) => ({ id: -d.page_id, kind: 'dream' as const, content: d.dream, favorite: false, created_at: null, date: d.date, font: d.font, entry_num: d.entry_num })),
      ...bullets,
    ]
  }, [kind, v.rev])
  const items = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeBulletsSchema(), [])
  const c = useCollection(schema, items, { today: v.today })
  const [filters, setFilters] = useState(false)
  const meta = kind === 'dreams' ? { plural: 'Sonhos', icon: 'dream' as const } : kindMeta(kind)

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder={`Buscar em ${meta.plural.toLowerCase()}`} />
      <CollectionMeta c={c} noun={['item', 'itens']} />
      <CollectionBody
        c={c}
        view="grid"
        gridClass="vl-quotes"
        renderGroupHeader={(key, count) => <MonthHeader name={key} count={count} noun={['item', 'itens']} />}
        renderCard={(b) => (
          <figure key={b.id} className={`vl-quote ${fontClass(b.font)}`} data-kind={b.kind}>
            <blockquote><RichText text={b.content} /></blockquote>
            <figcaption>
              {b.favorite && <Icon name="heart" size={12} />}
              <button type="button" className="vl-linklike" onClick={() => v.goto({ view: 'write', date: b.date })}>
                {b.entry_num ? `#${b.entry_num} · ` : ''}{fmtRelative(b.date, v.today)}
              </button>
            </figcaption>
          </figure>
        )}
        renderRow={() => null}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nada com esses filtros"
        firstRun={<EmptyState icon={meta.icon} title={`Nenhum item em ${meta.plural.toLowerCase()}`}
          hint="No Escrever, escolha o tipo do momento (ou mude depois no menu ⋯)." action={<Button variant="primary" icon="edit" onClick={() => v.goto('write')}>Escrever</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={items} onClose={() => setFilters(false)} noun={['item', 'itens']} />}
    </Page>
  )
}

function RefView({ agent, entityType, entityId }: { agent: string; entityType: string; entityId: string }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.filterRef(agent, entityType, entityId), [agent, entityType, entityId, v.rev])
  const refs = useLoad(() => violetApi.refs({ agent }), [agent])
  const label = refs.state.status === 'ok' ? refs.state.data.find((r) => r.entity_type === entityType && r.entity_id === entityId)?.label : undefined
  const meta = AGENT_META[agent]
  return (
    <Page>
      <button type="button" className="ds-back-l" onClick={() => window.history.back()}><Icon name="left" size={16} /> Voltar</button>
      <header className="vl-personhead">
        <span className="vl-hash vl-hash-lg" data-agent={agent}><Icon name={refIcon(agent, entityType)} size={24} /></span>
        <div><h2>{label ?? 'Item citado'}</h2><p className="vl-muted">{meta ? `${meta.label} · ${meta.hint}` : agent}</p></div>
        <span className="vl-spacer" />
        <Button icon="forward" onClick={() => v.openLink(refDeepLink(agent, entityType, entityId))}>Abrir na {meta?.label ?? agent}</Button>
      </header>
      {state.status === 'loading' && <LoadingState count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (state.data.length ? <DayBulletsList days={state.data} /> : <EmptyState icon="link" title="Nenhum momento cita isso ainda" />)}
    </Page>
  )
}
