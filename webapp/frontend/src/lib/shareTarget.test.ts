// Testes do reconhecimento de links compartilhados (lib/shareTarget.ts).

import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLink'
import { parseSharedLink, resolveShare, shareDeepLink, shareSearchText } from './shareTarget'

describe('parseSharedLink', () => {
  it.each([
    ['https://letterboxd.com/film/parasite-2019/', ['akane'], 'letterboxd', 'film', 'parasite-2019'],
    ['https://boxd.it/aB3d', ['akane'], 'letterboxd', 'short', 'aB3d'],
    ['https://www.imdb.com/title/tt6751668/?ref_=nv', ['akane', 'mai'], 'imdb', 'title', 'tt6751668'],
    ['https://www.themoviedb.org/movie/496243-parasite', ['akane'], 'tmdb', 'movie', '496243'],
    ['https://www.themoviedb.org/tv/1399-game-of-thrones', ['mai'], 'tmdb', 'tv', '1399'],
    ['https://myanimelist.net/anime/5114/Fullmetal_Alchemist', ['marin'], 'mal', 'anime', '5114'],
    ['https://myanimelist.net/manga/2/Berserk', ['frieren'], 'mal', 'manga', '2'],
    ['https://anilist.co/anime/21/ONE-PIECE', ['marin'], 'anilist', 'anime', '21'],
    ['https://anilist.co/manga/30002/Berserk', ['frieren'], 'anilist', 'manga', '30002'],
    ['https://books.google.com.br/books?id=zyTCAlFPjgYC&hl=pt', ['frieren'], 'googlebooks', 'book', 'zyTCAlFPjgYC'],
  ])('%s', (texto, agents, provider, kind, id) => {
    expect(parseSharedLink(texto)).toMatchObject({ agents, provider, kind, id })
  })

  it('acha o link no meio de uma frase e ignora pontuação colada', () => {
    const r = parseSharedLink('Olha esse filme: https://letterboxd.com/film/parasite-2019/. Muito bom!')
    expect(r).toMatchObject({ provider: 'letterboxd', id: 'parasite-2019', url: 'https://letterboxd.com/film/parasite-2019/' })
  })

  it('aceita versão mobile (m.)', () => {
    expect(parseSharedLink('https://m.imdb.com/title/tt0111161/')).toMatchObject({ id: 'tt0111161' })
  })

  it('reconhece ISBN solto (com hífens) como livro', () => {
    expect(parseSharedLink('978-85-359-1484-9')).toMatchObject({ agents: ['frieren'], provider: 'isbn', id: '9788535914849' })
    expect(parseSharedLink('852210201X')).toMatchObject({ provider: 'isbn', id: '852210201X' })
  })

  it.each([
    [''],
    ['   '],
    ['só um texto qualquer'],
    ['https://exemplo.com/pagina'],
    ['https://letterboxd.com/usuario/'], // perfil, não filme
    ['https://myanimelist.net/anime/abc'], // id inválido
    ['https://evil.com/?u=https://letterboxd.com/film/x/'], // domínio errado
    ['12345'],
  ])('não reconhece %j', (texto) => {
    expect(parseSharedLink(texto)).toBeNull()
  })
})

describe('shareSearchText / shareDeepLink / resolveShare', () => {
  it('tira o título do endereço (Letterboxd, TMDB, MAL, AniList)', () => {
    const t = (u: string) => shareSearchText(parseSharedLink(u)!)
    expect(t('https://letterboxd.com/film/parasite-2019/')).toBe('parasite 2019')
    expect(t('https://www.themoviedb.org/movie/603-the-matrix')).toBe('the matrix')
    expect(t('https://myanimelist.net/anime/5114/Fullmetal_Alchemist:_Brotherhood')).toBe('Fullmetal Alchemist: Brotherhood')
    expect(t('https://anilist.co/anime/5114/Fullmetal-Alchemist-Brotherhood/')).toBe('Fullmetal Alchemist Brotherhood')
  })

  it('sem título no endereço (IMDb, código curto): sem texto de busca', () => {
    expect(shareSearchText(parseSharedLink('https://www.imdb.com/title/tt0111161/')!)).toBe('')
    expect(shareSearchText(parseSharedLink('https://boxd.it/abc12')!)).toBe('')
  })

  it('ISBN vale como busca', () => {
    expect(shareSearchText(parseSharedLink('978-85-359-1484-9')!)).toBe('9788535914849')
  })

  it('gera um deep link seguro que o parseDeepLink aceita', () => {
    const link = shareDeepLink(parseSharedLink('https://letterboxd.com/film/amélie-2001/')!, 'akane')
    expect(link).toBe('makima://akane/compartilhar/amelie-2001')
    expect(parseDeepLink(link)).toBe('/movies#compartilhar/amelie-2001')
  })

  it('sem texto, só abre a tela do agente', () => {
    expect(shareDeepLink(parseSharedLink('https://www.imdb.com/title/tt0111161/')!, 'mai')).toBe('makima://mai')
  })

  it('resolveShare: um agente abre direto; IMDb pergunta; desconhecido desiste', () => {
    expect(resolveShare('olha: https://www.themoviedb.org/tv/1399-game-of-thrones')).toEqual({ kind: 'open', link: 'makima://mai/compartilhar/game-of-thrones' })
    const imdb = resolveShare('https://www.imdb.com/title/tt0111161/')
    expect(imdb.kind).toBe('choose')
    expect(imdb.kind === 'choose' && imdb.options.map((o) => o.label)).toEqual(['Filme', 'Série'])
    expect(resolveShare('https://exemplo.com/x')).toEqual({ kind: 'unknown' })
  })
})
