// Catálogo (os 5 estados) e Quero assistir (a fila): o mesmo catálogo com esquemas diferentes. Grade de pôsteres
// ou lista; busca, filtros, agrupar e as ordenações.

import { useEffect, useMemo, useState } from 'react'
import { useCollection } from '../../../design/headless/useCollection'
import {
  Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, Page, StatusChip,
} from '../../../design'
import { AnimeCard, AnimeRow, byline } from '../components/AnimeCard'
import { Poster } from '../components/Poster'
import { useMarin } from '../context'
import { makeAnimesSchema, makeQueueSchema } from '../lib/schemas'
import { STATUS } from '../lib/status'
import type { Anime } from '../types'

const NOUN: [string, string] = ['anime', 'animes']

/** Classe da densidade da grade (tamanho dos pôsteres), vinda das Preferências. */
const densityClass = (d: string) => `mr-dens-${d}`

export function Catalog() {
  const marin = useMarin()
  const animes = marin.animes
  const schema = useMemo(() => makeAnimesSchema(animes, marin.prefs.sort), [animes, marin.prefs.sort])
  const c = useCollection(schema, animes, { today: marin.today })
  const [filters, setFilters] = useState(false)
  const layout = marin.prefs.layout

  // Busca digitada no topo da página: aplica aqui e limpa (para não reaplicar ao voltar).
  const { topQuery, clearTopQuery } = marin
  const { setQ } = c
  useEffect(() => {
    if (topQuery) { setQ(topQuery); clearTopQuery() }
  }, [topQuery, clearTopQuery, setQ])

  return (
    <Page wide className={densityClass(marin.prefs.density)}>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        view={layout}
        onView={(v) => marin.setPrefs({ layout: v })}
        searchPlaceholder="Buscar no catálogo"
        extra={<Button icon="add" onClick={() => marin.openAdd()}>Adicionar anime</Button>}
      />
      <CollectionMeta c={c} noun={NOUN} />
      <CollectionBody
        c={c}
        view={layout}
        gridClass="ds-grid-poster"
        renderCard={(a, i) => <AnimeCard key={a.id} anime={a} index={i} />}
        renderRow={(a) => <AnimeRow key={a.id} anime={a} />}
        loading={marin.animesState.status === 'loading'}
        error={marin.animesState.status === 'error'}
        onRetry={marin.retryAnimes}
        emptyTitle="Nenhum anime com esses filtros"
        firstRun={
          <EmptyState
            icon="anime"
            title="O catálogo está vazio"
            hint="Adicione o anime que você está assistindo ou um que quer ver. Também dá para sincronizar com o MyAnimeList."
            action={<Button variant="primary" icon="add" onClick={() => marin.openAdd()}>Adicionar anime</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={animes} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}

/** "Começar": move o anime da fila para "assistindo" e abre o formulário já no episódio 1. */
function StartButton({ anime }: { anime: Anime }) {
  const marin = useMarin()
  return (
    <Button variant="primary" size="sm" icon="episode" onClick={() => marin.openLog({ animeId: anime.id, episode: 1 })}>Começar</Button>
  )
}

/** Linha da fila: pôster, título, estúdio/temporada, quantidade de episódios e o atalho de começar. */
function QueueRow({ anime }: { anime: Anime }) {
  const marin = useMarin()
  const tone = STATUS[anime.status].tone
  return (
    <div className="mr-row">
      <Poster title={anime.title} src={anime.poster} small onOpen={() => marin.goto({ view: 'catalog', animeId: anime.id })} />
      <button type="button" className="mr-link mr-row-main" onClick={() => marin.goto({ view: 'catalog', animeId: anime.id })}>
        <b className="mr-row-t">{anime.title}</b>
        <span className="mr-row-s">{[byline(anime), anime.total ? `${anime.total} eps` : null, anime.genres.slice(0, 3).join(', ') || null].filter(Boolean).join(' · ')}</span>
      </button>
      {tone && <StatusChip status={tone} label={STATUS[anime.status].label} />}
      <StartButton anime={anime} />
    </div>
  )
}

export function Queue() {
  const marin = useMarin()
  const animes = useMemo(() => marin.animes.filter((a) => a.status === 'quero_assistir'), [marin.animes])
  const schema = useMemo(() => makeQueueSchema(animes), [animes])
  const c = useCollection(schema, animes, { today: marin.today })
  const [filters, setFilters] = useState(false)
  const layout = marin.prefs.layout
  // Quantos episódios a fila toda soma (animes sem total contam como 12, como no shell antigo).
  const eps = animes.reduce((n, a) => n + (a.total ?? 12), 0)

  return (
    <Page wide className={densityClass(marin.prefs.density)}>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} view={layout} onView={(v) => marin.setPrefs({ layout: v })} searchPlaceholder="Buscar na fila" extra={<Button icon="add" onClick={() => marin.openAdd()}>Adicionar anime</Button>} />
      <CollectionMeta c={c} noun={['anime na fila', 'animes na fila']} />
      {animes.length > 0 && <p className="ds-hint mr-hint"><Icon name="clock" size={13} /> ~{eps} episódios na fila</p>}
      <CollectionBody
        c={c}
        view={layout}
        gridClass="ds-grid-poster"
        renderCard={(a, i) => <AnimeCard key={a.id} anime={a} index={i} showStatus={false} />}
        renderRow={(a) => <QueueRow key={a.id} anime={a} />}
        loading={marin.animesState.status === 'loading'}
        error={marin.animesState.status === 'error'}
        onRetry={marin.retryAnimes}
        emptyTitle="Nada na fila com esses filtros"
        firstRun={
          <EmptyState
            icon="watchlist"
            title="A fila está vazia"
            hint="Guarde aqui os animes que você quer ver. Eles saem da fila no dia em que você logar o primeiro episódio."
            action={<Button icon="add" onClick={() => marin.openAdd()}>Adicionar anime</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={animes} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}
