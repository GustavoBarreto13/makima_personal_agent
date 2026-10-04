// Filmes (catálogo todo) e Quero ver: a mesma lista com esquemas diferentes. Grade de pôsteres ou lista.

import { useMemo, useState } from 'react'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Page } from '../../../design'
import { akaneApi } from '../akaneApi'
import { FilmCard, FilmRow } from '../components/FilmCard'
import { useAkane } from '../context'
import { makeFilmsSchema, makeWatchlistSchema } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import type { Movie } from '../types'

const NONE: Movie[] = []   // referência estável enquanto carrega (o esquema e a coleção dependem dela)

export function Films() {
  return <MovieCollection mode="films" />
}

export function Watchlist() {
  return <MovieCollection mode="watchlist" />
}

function MovieCollection({ mode }: { mode: 'films' | 'watchlist' }) {
  const akane = useAkane()
  const { state, retry } = useLoad(
    () => (mode === 'films' ? akaneApi.list() : akaneApi.watchlist()).then((r) => r.movies),
    [akane.rev, mode],
  )
  const movies = state.status === 'ok' ? state.data : NONE
  const schema = useMemo(() => (mode === 'films' ? makeFilmsSchema(movies) : makeWatchlistSchema(movies)), [mode, movies])
  const c = useCollection(schema, movies, { today: akane.today })
  const [filters, setFilters] = useState(false)
  const noun: [string, string] = ['filme', 'filmes']
  const layout = akane.prefs.layout

  return (
    <Page wide>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        view={layout}
        onView={(v) => akane.setPrefs({ layout: v })}
        searchPlaceholder={mode === 'films' ? 'Buscar por título, diretor ou gênero' : 'Buscar no Quero ver'}
      />
      <CollectionMeta c={c} noun={noun} />
      <CollectionBody
        c={c}
        view={layout}
        renderCard={(m, i) => <FilmCard key={m.id} movie={m} index={i} showStatus={mode === 'films'} />}
        renderRow={(m) => <FilmRow key={m.id} movie={m} />}
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        onRetry={retry}
        emptyTitle="Nenhum filme com esses filtros"
        firstRun={
          mode === 'films' ? (
            <EmptyState icon="movie" title="Nenhum filme ainda" hint="Logue o primeiro filme que você viu ou guarde um no Quero ver." action={<Button variant="primary" icon="add" onClick={() => akane.openLog()}>Logar filme</Button>} />
          ) : (
            <EmptyState icon="watchlist" title="Nada guardado para ver depois" hint="Quando alguém recomendar um filme, guarde aqui. Ele sai da lista no dia em que você logar a sessão." />
          )
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={movies} onClose={() => setFilters(false)} noun={noun} />}
    </Page>
  )
}
