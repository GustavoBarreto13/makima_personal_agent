// O banco guarda NULL (não "lista vazia") nas colunas de array e o backend repassa como veio: em produção
// `movies.tags` é NULL em todos os filmes e `diary_entries.tags` em boa parte das sessões. As telas assumem
// lista, então a normalização acontece UMA vez, na borda (akaneApi), e nenhuma tela precisa se defender.

import type { DiaryEntry, FavoriteFilm, HomeData, Movie, MovieDetail, MoviePerson, VaultItem } from '../types'

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])

/** Filme com `tags`, `genres`, `director` e `countries` sempre listas. */
export function normalizeMovie<M extends Pick<Movie, 'tags' | 'genres' | 'director' | 'countries'>>(m: M): M {
  return { ...m, tags: list(m.tags), genres: list(m.genres), director: list(m.director), countries: list(m.countries) }
}

/** Sessão com `tags` e `companions` sempre listas e `watch_location` explícito (null = sem local). */
export function normalizeEntry<E extends Pick<DiaryEntry, 'tags' | 'companions' | 'watch_location'>>(e: E): E {
  return { ...e, tags: list(e.tags), companions: list(e.companions), watch_location: e.watch_location ?? null }
}

export function normalizeDetail(d: MovieDetail): MovieDetail {
  return {
    ...d,
    movie: normalizeMovie(d.movie),
    people: list<MoviePerson>(d.people),
    vault: list<VaultItem>(d.vault),
    diary: list(d.diary).map(normalizeEntry),
  }
}

export function normalizeHome(h: HomeData): HomeData {
  return {
    ...h,
    favorites: list<FavoriteFilm>(h.favorites),
    recent_activity: list(h.recent_activity).map(normalizeEntry),
    watchlist_highlight: list(h.watchlist_highlight).map((m) => ({ ...m, director: list(m.director) })),
    rating_histogram: h.rating_histogram ?? {},
  }
}
