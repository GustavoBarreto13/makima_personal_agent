// Diário (a "Atividade" do shell antigo): todas as sessões de leitura, em lista agrupada por mês. Cada linha
// mostra o dia, a capa, o livro (com a nota do dia em itálico), o que aconteceu (começou, +N páginas, terminou)
// e as ações de editar e excluir (com "Desfazer"). Tudo por botão: nada depende de arrastar.

import { useMemo, useState } from 'react'
import { fmtRelative, parseISODate, WEEKDAYS_SHORT } from '../../../design/core/format'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, IconButton, Page } from '../../../design'
import { BookCover } from '../components/BookCover'
import { SessionEditor } from '../components/SessionEditor'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { makeDiarySchema } from '../lib/schemas'
import { deleteSession } from '../lib/sessions'
import { useLoad } from '../lib/useLoad'
import type { Session } from '../types'

const NONE: Session[] = []   // referência estável enquanto carrega (a coleção depende dela)
const NOUN: [string, string] = ['sessão', 'sessões']

/** "outubro de 2026" → mês grande + ano pequeno. Agrupar por livro cai no título simples. */
function GroupHeader({ name, sessions }: { name: string; sessions: Session[] }) {
  const m = /^(.+) de (\d{4})$/.exec(name)
  const pages = sessions.reduce((a, s) => a + s.pages, 0)
  return (
    <div className="fr-dmh">
      <span className="fr-dmn">{m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : name}</span>
      {m && <span className="fr-dmy">{m[2]}</span>}
      <span className="fr-dmc">{sessions.length} {sessions.length === 1 ? 'sessão' : 'sessões'} · {pages} págs.</span>
    </div>
  )
}

/** O que a sessão foi, em uma etiqueta: começou, terminou ou +N páginas (até a página X). */
function What({ s }: { s: Session }) {
  if (s.kind === 'finished') return <span className="fr-chip fr-chip-on"><Icon name="finished" size={12} />Terminou · p. {s.page}</span>
  if (s.kind === 'started') return <span className="fr-chip"><Icon name="book" size={12} />Começou · até p. {s.page}</span>
  return <span className="fr-chip"><Icon name="page" size={12} />+{s.pages} · p. {s.page}</span>
}

export function Diary() {
  const frieren = useFrieren()
  const { state, retry } = useLoad(() => frierenApi.sessions(), [frieren.rev])
  const sessions = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeDiarySchema(), [])
  const c = useCollection(schema, sessions, { today: frieren.today })
  const [filters, setFilters] = useState(false)
  const [editing, setEditing] = useState<Session | null>(null)
  // Capa de cada sessão vem do catálogo já carregado pelo shell.
  const covers = useMemo(() => new Map(frieren.books.map((b) => [b.id, b.coverUrl])), [frieren.books])
  // Sessões de cada grupo (o cabeçalho mostra a soma de páginas do mês).
  const byGroup = useMemo(() => new Map(c.result.groups.map((g) => [g.key, g.items])), [c.result.groups])

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar por livro, autor ou nota" />
      <CollectionMeta c={c} noun={NOUN} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderGroupHeader={(key) => <GroupHeader name={key} sessions={byGroup.get(key) ?? []} />}
        renderRow={(s) => {
          const open = () => frieren.goto({ view: 'catalog', bookId: s.bookId })
          return (
            <div key={s.id} className="fr-drow">
              <div className="fr-dday" title={fmtRelative(s.date, frieren.today)}>
                <b>{Number(s.date.slice(8, 10))}</b>
                <span>{WEEKDAYS_SHORT[parseISODate(s.date).getDay()]}</span>
              </div>
              <BookCover title={s.title} src={covers.get(s.bookId) ?? null} small onOpen={open} />
              <button type="button" className="fr-link fr-dmain" onClick={open}>
                <span className="fr-dtitle">{s.title}</span>
                {s.note && <span className="fr-dnote">“{s.note}”</span>}
              </button>
              <div className="fr-dright">
                <What s={s} />
                <div className="fr-dact">
                  <IconButton icon="edit" label={`Editar sessão de ${s.title}`} size={16} onClick={() => setEditing(s)} />
                  <IconButton icon="delete" label={`Excluir sessão de ${s.title}`} size={16} onClick={() => void deleteSession(s, frieren.reload)} />
                </div>
              </div>
            </div>
          )
        }}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhuma sessão com esses filtros"
        firstRun={
          <EmptyState
            icon="days"
            title="O diário está vazio"
            hint="Cada vez que você registra até onde leu vira uma sessão aqui."
            action={<Button variant="primary" icon="add" onClick={() => frieren.openLog()}>Registrar leitura</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={sessions} onClose={() => setFilters(false)} noun={NOUN} />}
      {editing && <SessionEditor key={editing.id} session={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
