// Grava um rascunho de sessão: cria o filme se ainda não está no catálogo, o local se for novo, loga a
// sessão e devolve um "Desfazer" que apaga exatamente o que esta gravação criou.

import type { akaneApi } from '../akaneApi'
import type { LogDraft } from './log'

type Api = Pick<typeof akaneApi, 'add' | 'logWatch' | 'like' | 'createWatchLocation' | 'deleteDiary' | 'delete'>

export interface SubmitResult {
  message: string
  undo: () => Promise<void>
}

export async function submitLog(d: LogDraft, api: Api): Promise<SubmitResult> {
  const film = d.film
  if (!film) throw new Error('Escolha o filme antes de salvar.')

  let movieId = film.local_id
  let created = false
  if (!movieId) {
    const added = await api.add({ tmdb_id: film.tmdb_id, title: film.title, status: 'watched', ...(film.year ? { year: film.year } : {}) })
    if (!added.id) throw new Error('Não foi possível adicionar o filme ao catálogo.')
    movieId = added.id
    created = true
  }

  let locationId: string | null = null
  if (d.place) locationId = 'id' in d.place ? d.place.id : (await api.createWatchLocation(d.place.name, d.place.kind)).location.id

  const logged = await api.logWatch(movieId, {
    watched_date: d.date,
    rating: d.rating,
    review: d.review.trim() || null,
    tags: d.tags,
    companion_ids: d.people.map((p) => p.id),
    watch_location_id: locationId,
    source: 'manual',
  })
  if (d.liked) await api.like(movieId, true)

  const diaryId = logged.diary_id
  const filmId = movieId
  return {
    message: `${film.title} registrado`,
    undo: async () => {
      if (diaryId) await api.deleteDiary(diaryId)
      if (created) await api.delete(filmId)   // filme novo desta gravação: some junto com a sessão
    },
  }
}
