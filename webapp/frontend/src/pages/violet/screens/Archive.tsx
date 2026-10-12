// Arquivo: só os dias em que você escreveu algo (spec 076 — antes listava toda data só visitada, por isso
// "quase tudo aparecia vazio"). Agrupado por mês; cada dia mostra o começo do texto na fonte daquele dia, com as
// pessoas e referências como chips, e marcas discretas do que mais ele tem (destaque, sonho, emoção, carta…).
// A busca procura no texto inteiro (servidor), não só no trecho do cartão.

import { useEffect, useMemo, useState } from 'react'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, Page } from '../../../design'
import { fmtRelative, parseISODate, pluralize, WEEKDAYS_SHORT } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { RichText } from '../components/RichText'
import { useViolet } from '../context'
import { fontClass } from '../lib/kinds'
import { makeArchiveSchema, type ArchiveItem } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'

const NONE: ArchiveItem[] = []

export function MonthHeader({ name, count, noun }: { name: string; count: number; noun: [string, string] }) {
  const m = /^(.+) de (\d{4})$/.exec(name)
  return (
    <div className="vl-monthhead">
      <span className="vl-month">{m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : name}</span>
      {m && <span className="vl-year">{m[2]}</span>}
      <span className="vl-muted ds-mono">{pluralize(count, noun[0], noun[1])}</span>
    </div>
  )
}

export function Archive() {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.entries(), [v.rev])
  const schema = useMemo(() => makeArchiveSchema(), [])
  const [hits, setHits] = useState<ArchiveItem[] | null>(null)
  const all = state.status === 'ok' ? state.data : NONE
  const c = useCollection(schema, hits ?? all, { today: v.today })
  const [filters, setFilters] = useState(false)

  // Busca no texto inteiro: o servidor devolve os dias que batem; marcamos `hit` para a busca local deixá-los passar.
  // Busca vinda do topo da página (AppShell).
  useEffect(() => {
    const on = (e: Event) => c.setQ(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('violet:search', on)
    return () => window.removeEventListener('violet:search', on)
  }, [c])

  const q = c.state.q.trim()
  useEffect(() => {
    if (q.length < 2) { setHits(null); return }
    let live = true
    const t = window.setTimeout(() => {
      violetApi.entries({ q }).then((r) => { if (live) setHits(r.map((e) => ({ ...e, hit: q }))) }).catch(() => { if (live) setHits(null) })
    }, 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [q])

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar no diário inteiro" />
      <CollectionMeta c={c} noun={['dia', 'dias']} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderGroupHeader={(key, count) => <MonthHeader name={key} count={count} noun={['dia', 'dias']} />}
        renderRow={(e) => {
          const d = parseISODate(e.date)
          const open = () => v.goto({ view: 'write', date: e.date })
          return (
            <div key={e.date} className="vl-day" role="link" tabIndex={0} onClick={open} onKeyDown={(k) => { if (k.key === 'Enter') open() }}>
              <span className="vl-day-date"><b>{d.getDate()}</b><span>{WEEKDAYS_SHORT[d.getDay()]}</span></span>
              <span className="vl-day-main">
                <span className="vl-day-meta ds-mono">
                  #{e.num} · {fmtRelative(e.date, v.today)}
                  {e.bullet_count > 0 && ` · ${pluralize(e.bullet_count, 'momento', 'momentos')}`}
                  {e.word_count > 0 && ` · ${pluralize(e.word_count, 'palavra', 'palavras')}`}
                </span>
                <span className={`vl-day-excerpt ${fontClass(e.font)}`}>
                  {e.excerpt_kind === 'dream' && <Icon name="dream" size={13} />}
                  {e.excerpt_kind === 'letter' && <Icon name="mail" size={13} />}
                  <RichText text={e.excerpt} />
                </span>
                <span className="vl-day-marks" aria-label="O que o dia tem">
                  {e.has_favorite && <Icon name="heart" size={13} label="favorito" />}
                  {e.has_highlight && <Icon name="highlight" size={13} label="destaque" />}
                  {e.has_dream && <Icon name="dream" size={13} label="sonho" />}
                  {e.emotion_count > 0 && <span><Icon name="pulse" size={13} label="registro emocional" />{e.emotion_count}</span>}
                  {e.letter_count > 0 && <span><Icon name="mail" size={13} label="carta" />{e.letter_count}</span>}
                  {e.has_counsel && <Icon name="sparkles" size={13} label="conselho" />}
                </span>
              </span>
            </div>
          )
        }}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle={q ? `Nada com “${q}” no diário` : 'Nenhum dia com esses filtros'}
        firstRun={<EmptyState icon="journal" title="O diário ainda está em branco" hint="Cada dia em que você escrever algo aparece aqui." action={<Button variant="primary" icon="edit" onClick={() => v.goto('write')}>Escrever hoje</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={all} onClose={() => setFilters(false)} noun={['dia', 'dias']} />}
    </Page>
  )
}
