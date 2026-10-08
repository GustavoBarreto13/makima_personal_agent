// Listas: as coleções temáticas ("Isekai favoritos", "Top 10 de 2024") e, aberta uma delas, os animes dela.

import { useMemo, useState } from 'react'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { useCollection } from '../../../design/headless/useCollection'
import {
  Button, CollectionBody, CollectionMeta, CollectionToolbar, DetailPage, EmptyState, ErrorState, FilterSheet, Icon, IconButton, LoadingState,
  MediaCard, Page, Stars, Tag, hueFromName,
} from '../../../design'
import { ListForm } from '../components/ListForm'
import { useMarin } from '../context'
import { makeListsSchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'
import type { AnimeList } from '../types'

const NONE: AnimeList[] = []
const plural = (n: number) => `${n} ${n === 1 ? 'anime' : 'animes'}`

export function Lists() {
  const marin = useMarin()
  const { state, retry } = useLoad(() => marinApi.lists(), [marin.rev])
  const lists = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => makeListsSchema(), [])
  const c = useCollection(schema, lists, { today: marin.today })
  const [filters, setFilters] = useState(false)
  const [creating, setCreating] = useState(false)
  const layout = marin.prefs.layout
  const open = (l: AnimeList) => marin.goto({ view: 'lists', listId: l.id })

  return (
    <Page wide>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        view={layout}
        onView={(v) => marin.setPrefs({ layout: v })}
        searchPlaceholder="Buscar listas"
        extra={<Button icon="add" onClick={() => setCreating(true)}>Nova lista</Button>}
      />
      <CollectionMeta c={c} noun={['lista', 'listas']} />
      <CollectionBody
        c={c}
        view={layout}
        renderCard={(l, i) => <MediaCard key={l.id} title={l.name} subtitle={l.description || undefined} icon="list" hue={l.hue ?? hueFromName(l.name)} index={i} badge={l.ranked ? <Icon name="trophy" size={14} label="Ranking" /> : undefined} meta={<span className="ds-mono">{plural(l.count)}</span>} onOpen={() => open(l)} />}
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
        firstRun={<EmptyState icon="list" title="Nenhuma lista ainda" hint="Agrupe animes por tema ou ocasião: “Para ver com a família”, “Top 10 de 2024”." action={<Button variant="primary" icon="add" onClick={() => setCreating(true)}>Nova lista</Button>} />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={lists} onClose={() => setFilters(false)} noun={['lista', 'listas']} />}
      {creating && <ListForm onClose={() => setCreating(false)} onSaved={(id) => marin.goto({ view: 'lists', listId: id })} />}
    </Page>
  )
}

export function ListDetail({ id }: { id: string }) {
  const marin = useMarin()
  const { state, retry } = useLoad(() => marinApi.listDetail(id), [id, marin.rev])
  const [editing, setEditing] = useState(false)
  const back = () => marin.goto('lists')

  if (state.status === 'loading') return <Page><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') {
    return <Page><ErrorState title="Não foi possível abrir a lista" hint="Ela pode ter sido excluída, ou a conexão falhou." onRetry={retry} /><Button icon="left" onClick={back}>Voltar para Listas</Button></Page>
  }

  const { list, items } = state.data

  const removeItem = async (a: (typeof items)[number]) => {
    try {
      await marinApi.removeFromList(list.id, a.id)
      marin.reload()
      toast(`${a.title} saiu da lista`, { undo: () => { void marinApi.addToList(list.id, a.id, a.position ?? undefined).then(marin.reload) } })
    } catch { toast('Não foi possível tirar o anime da lista.', { tone: 'error' }) }
  }

  const removeList = async () => {
    const ok = await confirm({ title: `Excluir a lista “${list.name}”?`, body: 'Só a lista é apagada; os animes continuam no catálogo. Você poderá desfazer logo depois.', confirmLabel: 'Excluir', danger: true })
    if (!ok) return
    try {
      await marinApi.deleteList(list.id)
      marin.reload()
      back()
      toast('Lista excluída', {
        undo: () => {
          void (async () => {
            const made = await marinApi.createList({ name: list.name, description: list.description, ranked: list.ranked })
            if (made.id) for (const [i, a] of items.entries()) await marinApi.addToList(made.id, a.id, list.ranked ? i + 1 : undefined)
            marin.reload()
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
        subtitle={list.description || plural(items.length)}
        chips={list.ranked ? <Tag pr>Ranking</Tag> : undefined}
        image={items.find((a) => a.poster)?.poster}
        icon="list"
        hue={list.hue ?? hueFromName(list.name)}
        actions={<><Button icon="edit" onClick={() => setEditing(true)}>Editar</Button><Button variant="danger" icon="delete" onClick={() => void removeList()}>Excluir lista</Button></>}
        tabs={[{
          id: 'animes',
          label: `Animes (${items.length})`,
          content: items.length === 0
            ? <EmptyState icon="anime" title="Lista vazia" hint="Abra um anime e use “Adicionar à lista” para colocá-lo aqui." action={<Button icon="anime" onClick={() => marin.goto('catalog')}>Ver catálogo</Button>} />
            : (
              <div className="ds-list">
                {items.map((a, i) => (
                  <div key={a.id} className="ds-lrow mr-session">
                    {list.ranked && <span className="ds-num mr-pos">{i + 1}</span>}
                    <button type="button" className="ds-t mr-link" onClick={() => marin.goto({ view: 'catalog', animeId: a.id })}><b>{a.title}</b></button>
                    {a.rating ? <Stars value={a.rating} /> : null}
                    <IconButton icon="close" label={`Tirar ${a.title} da lista`} size={16} onClick={() => void removeItem(a)} />
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
