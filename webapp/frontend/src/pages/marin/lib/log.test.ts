// Linha rápida de "logar episódio": o que ela entende e quando salva direto (lógica pura, sem tela).

import { describe, expect, it } from 'vitest'
import { addDaysISO, todayISO } from '../../../design/core/format'
import { candidates, canSaveQuickly, draftFromCapture, epLabel, logParser, nextEpisode, pickAnime, validateDraft } from './log'
import { normalizeAnime } from './normalize'
import type { ApiAnime } from '../types'

// O parser entende "ontem" a partir do dia real: o teste usa o mesmo dia para não depender do calendário.
const TODAY = todayISO()

const anime = (id: string, title: string, over: Partial<ApiAnime> = {}) => normalizeAnime({
  id, mal_id: 1, title, media_type: 'tv', season: 'fall 2023', studio: 'Madhouse', episodes_total: 28, episodes_watched: 11, status: 'assistindo',
  airing_status: 'finalizado', score: null, poster_url: null, banner_url: null, overview: null, genres: ['Fantasia'], tags: [], notes: null,
  date_started: '2026-09-01', date_finished: null, created_at: '2026-01-01T12:00:00-03:00', updated_at: '2026-10-06T12:00:00-03:00', ...over,
})

const ANIMES = [
  anime('a1', 'Frieren', { title_english: 'Frieren: Beyond Journey’s End' }),
  anime('a2', 'Frieren Special', { status: 'quero_assistir', episodes_watched: 0, episodes_total: 1 }),
  anime('a3', 'Dungeon Meshi', { status: 'completo', episodes_watched: 24, episodes_total: 24 }),
]
const draft = (text: string, animes = ANIMES) => draftFromCapture(logParser(text), { today: TODAY, animes })

describe('pickAnime', () => {
  it('título igual escolhe o anime mesmo havendo outro que começa igual', () => {
    expect(pickAnime('frieren', ANIMES)?.id).toBe('a1')
  })
  it('acha pelo título em inglês', () => {
    expect(pickAnime('Frieren: Beyond Journey’s End', ANIMES)?.id).toBe('a1')
  })
  it('começo do título serve quando só um anime bate', () => {
    expect(pickAnime('dungeon', ANIMES)?.id).toBe('a3')
    expect(pickAnime('frier', ANIMES)).toBeNull()      // dois começam assim: pergunta
  })
  it('sem título: o único anime em andamento', () => {
    expect(pickAnime('', ANIMES)?.id).toBe('a1')
    expect(pickAnime('', [...ANIMES, anime('a4', 'Outro')])).toBeNull()
  })
})

describe('candidates', () => {
  it('assistindo primeiro, depois fila, completos por último', () => {
    expect(candidates(ANIMES).map((a) => a.id)).toEqual(['a1', 'a2', 'a3'])
  })
})

describe('nextEpisode', () => {
  it('é o seguinte ao último visto; nulo quando já viu todos', () => {
    expect(nextEpisode(ANIMES[0])).toBe(12)
    expect(nextEpisode(ANIMES[2])).toBeNull()
    expect(nextEpisode(anime('a5', 'Sem total', { episodes_total: null, episodes_watched: 3 }))).toBe(4)
  })
})

describe('draftFromCapture', () => {
  it('"Frieren ep 12 ontem": anime, episódio e data no passado', () => {
    expect(draft('Frieren ep 12 ontem')).toMatchObject({ animeId: 'a1', epStart: 12, epEnd: 12, date: addDaysISO(TODAY, -1) })
  })
  it('intervalo "ep 5-8" e nota', () => {
    expect(draft('Dungeon Meshi ep 5-8 ★4.5')).toMatchObject({ animeId: 'a3', epStart: 5, epEnd: 8, rating: 4.5 })
  })
  it('sem episódio na linha: assume o próximo', () => {
    expect(draft('Frieren')).toMatchObject({ animeId: 'a1', epStart: 12, epEnd: 12 })
  })
  it('página ("p. 240") não é episódio', () => {
    expect(draft('Frieren p. 240').epStart).toBe(12)    // cai no próximo episódio
  })
  it('anime desconhecido não escolhe nada', () => {
    expect(draft('Anime que não existe ep 3')).toMatchObject({ animeId: null, epStart: 3 })
  })
})

describe('validateDraft', () => {
  const a1 = ANIMES[0]
  it('episódio dentro do total: ok', () => {
    expect(validateDraft(draft('Frieren ep 12'), a1, TODAY)).toBeNull()
  })
  it('episódio além do total do anime', () => {
    expect(validateDraft(draft('Frieren ep 99'), a1, TODAY)?.message).toMatch(/28 episódios/)
  })
  it('último episódio antes do primeiro', () => {
    expect(validateDraft({ ...draft('Frieren ep 12'), epStart: 12, epEnd: 10 }, a1, TODAY)?.field).toBe('eps')
  })
  it('episódio zero ou quebrado', () => {
    expect(validateDraft({ ...draft('Frieren ep 12'), epStart: 0, epEnd: 0 }, a1, TODAY)?.field).toBe('eps')
    expect(validateDraft({ ...draft('Frieren ep 12'), epStart: 1.5, epEnd: 2 }, a1, TODAY)?.field).toBe('eps')
  })
  it('data no futuro', () => {
    expect(validateDraft({ ...draft('Frieren ep 12'), date: addDaysISO(TODAY, 1) }, a1, TODAY)?.field).toBe('date')
  })
  it('sem anime escolhido', () => {
    expect(validateDraft(draft('Qualquer ep 1'), null, TODAY)?.field).toBe('anime')
  })
  it('nota fora da meia estrela', () => {
    expect(validateDraft({ ...draft('Frieren ep 12'), rating: 4.3 }, a1, TODAY)?.field).toBe('rating')
  })
  it('sessão sem número de episódio é válida, mas não salva direto', () => {
    const d = { ...draft('Frieren ep 12'), epStart: null, epEnd: null }
    expect(validateDraft(d, a1, TODAY)).toBeNull()
    expect(canSaveQuickly(d, a1, TODAY)).toBe(false)
    expect(canSaveQuickly(draft('Frieren ep 12'), a1, TODAY)).toBe(true)
  })
})

describe('epLabel', () => {
  it('um episódio, intervalo ou só a contagem', () => {
    expect(epLabel(12, 12)).toBe('Ep 12')
    expect(epLabel(5, 8)).toBe('Eps 5–8')
    expect(epLabel(null, null, 3)).toBe('3 episódios')
    expect(epLabel(null, null, 0)).toBe('Sessão')
  })
})
