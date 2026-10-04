// Listas: as coleções temáticas ("Cinema japonês", "Melhores de 2024") e, aberta uma delas, os filmes dela.

import { useMemo, useState } from 'react'
import { useCollection } from '../../../design/headless/useCollection'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import {
  Button, CollectionBody, CollectionMeta, CollectionToolbar, DetailPage, EmptyState, ErrorState, FilterSheet, Icon, IconButton, LoadingState, MediaCard,
  Page, Stars, Tag, hueFromName,
} from '../../../design'
import { akaneApi } from '../akaneApi'
import { ListForm } from '../components/ListForm'
import { useAkane } from '../context'
import { makeListsSchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import type { MovieList } from '../types'

const NONE: MovieList[] = []
const plural = (n: number) => `${n} ${n === 1 ? 'filme' : 'filmes'}`

export function Lists() {
  const akane = useAkane()
  const { state, retry } = useLoad(() => akaneApi.lists().then((r) => r.lists), [akane.rev])
  const lists = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeListsSchema(), [])
  const c = useCollection(schema, lists, { today: akane.today })
  const [filters, setFilters] = useState(false)
  const [creating, setCreating] = useState(false)
  const layout = akane.prefs.layout
  const open = (l: MovieList) => akane.goto({ view: 'lists', listId: l.id })

  return (
    <Page wide>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        view={layout}
        onView={(v) => akane.setPrefs({ layout: v })}
        searchPlaceholder="Buscar listas"
        extra={<Button icon="add" onClick={() => setCreating(true)}>Nova lista</Button>}
      />
      <CollectionMeta c={c} noun={['lista', 'listas']} />
      <CollectionBody
        c={c}
        view={layout}
        renderCard={(l, i) => <MediaCard key={l.id} title={l.name} subtitle={l.description || undefined} icon="list" hue={hueFromName(l.name)} index={i} badge={l.ranked ? <Icon name="trophy" size={14} label="Ranking" /> : undefined} meta={<span className="ds-mono">{plural(l.count)}</span>} onOpen={() => open(l)} />}
        renderRow={(l) => (
          <button key={l.id} type="button" className="ds-lrow" onClick={() => open(l)}>
            <span className="ds-lead"><Icon name={l.ranked ? 'trophy' : 'list'} size={18} /></span>
            <span className="ds-t"><b>{l.name}</b><span>{[plural(l.count), l.description].filter(Boolean).join(' · ')}</span></span>
            <Icon name="right" size={16} />
          </button>
        )}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhuma lista com esses filtros"
        firstRun={<EmptyState icon="list" title="Nenhuma lista ainda" hint="Agrupe filmes por tema, diretor ou ocasião: “Para ver com a família”, “Melhores de 2024”." action={<Button variant="primary" icon="add" onClick={() => setCreating(true)}>Nova lista</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={lists} onClose={() => setFilters(false)} noun={['lista', 'listas']} />}
      {creating && <ListForm onClose={() => setCreating(false)} onSaved={(id) => akane.goto({ view: 'lists', listId: id })} />}
    </Page>
  )
}

export function ListDetail({ id }: { id: string }) {
  const akane = useAkane()
  const { state, retry } = useLoad(() => akaneApi.listDetail(id), [id, akane.rev])
  const [editing, setEditing] = useState(false)
  const back = () => akane.goto('lists')

  if (state.status === 'loading') return <Page><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') {
    return <Page><ErrorState title="Não foi possível abrir a lista" hint="Ela pode ter sido excluída, ou a conexão falhou." onRetry={retry} /><Button icon="left" onClick={back}>Voltar para Listas</Button></Page>
  }

  const { list, films } = state.data

  const removeFilm = async (f: (typeof films)[number]) => {
    try {
      await akaneApi.removeFromList(list.id, f.id)
      akane.reload()
      toast(`${f.title} saiu da lista`, { undo: () => { void akaneApi.addToList(list.id, f.id, f.position ?? undefined).then(akane.reload) } })
    } catch { toast('Não foi possível tirar o filme da lista.', { tone: 'error' }) }
  }

  const removeList = async () => {
    const ok = await confirm({ title: `Excluir a lista “${list.name}”?`, body: 'Só a lista é apagada; os filmes continuam no catálogo. Você poderá desfazer logo depois.', confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    try {
      await akaneApi.deleteList(list.id)
      akane.reload()
      back()
      toast('Lista excluída', {
        undo: () => {
          void (async () => {
            const made = await akaneApi.createList({ name: list.name, description: list.description, ranked: list.ranked })
            if (made.id) for (const [i, f] of films.entries()) await akaneApi.addToList(made.id, f.id, list.ranked ? i + 1 : undefined)
            akane.reload()
          })().catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
        },
      })
    } catch { toast('Não foi possível excluir a lista.', { tone: 'error' }) }
  }

  return (
    <Page>
      <DetailPage
        backLabel="Listas"
        onBack={back}
        title={list.name}
        subtitle={list.description || plural(films.length)}
        chips={list.ranked ? <Tag pr>Ranking</Tag> : undefined}
        image={films.find((f) => f.poster_url)?.poster_url}
        icon="list"
        hue={hueFromName(list.name)}
        actions={<><Button icon="edit" onClick={() => setEditing(true)}>Editar</Button><Button variant="danger" icon="delete" onClick={() => void removeList()}>Excluir lista</Button></>}
        tabs={[{
          id: 'films',
          label: `Filmes (${films.length})`,
          content: films.length === 0
            ? <EmptyState icon="movie" title="Lista vazia" hint="Abra um filme e use “Adicionar à lista” para colocá-lo aqui." action={<Button icon="movie" onClick={() => akane.goto('films')}>Ver filmes</Button>} />
            : (
              <div className="ds-list">
                {films.map((f, i) => (
                  <div key={f.id} className="ds-lrow ax-session">
                    {list.ranked && <span className="ds-num ax-pos">{i + 1}</span>}
                    <button type="button" className="ds-t ax-link" onClick={() => akane.goto({ view: 'films', movieId: f.id })}><b>{f.title}</b><span>{f.year ?? ''}</span></button>
                    {f.liked && <Icon name="heart" size={14} label="Curtido" />}
                    {f.rating ? <Stars value={f.rating} /> : null}
                    <IconButton icon="close" label={`Tirar ${f.title} da lista`} size={16} onClick={() => void removeFilm(f)} />
                  </div>
                ))}
              </div>
            ),
        }]}
      />
      {editing && <ListForm list={list} onClose={() => setEditing(false)} />}
    </Page>
  )
}
