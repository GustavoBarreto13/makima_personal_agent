// Testes do reconhecimento de links compartilhados (lib/shareTarget.ts).

import { describe, expect, it } from 'vitest'
import { parseSharedLink } from './shareTarget'

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
