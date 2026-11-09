// Reconhece o que o usuário compartilha PARA a Makima (menu "Compartilhar" do Android).
//
// O Android entrega um texto — normalmente um link, às vezes "Olha esse filme: https://…".
// `parseSharedLink` acha o primeiro link, descobre de qual serviço é e devolve de qual agente
// é o assunto, para o app abrir a tela de registrar já preenchida (Akane, Marin, Mai, Frieren).
//
// Função pura (sem rede): só olha o endereço. Resolver o título/ano do item é trabalho dos
// agentes, depois, usando o `id` devolvido aqui.

export type ShareAgent = 'akane' | 'mai' | 'marin' | 'frieren'

export interface SharedLink {
  /**
   * Agentes que podem registrar isso. Um só quando o link já diz (TMDB /movie → Akane);
   * dois quando é ambíguo (IMDb não diferencia filme de série) — a tela pergunta.
   */
  agents: ShareAgent[]
  /** Serviço de origem: 'letterboxd' | 'imdb' | 'tmdb' | 'mal' | 'anilist' | 'googlebooks' | 'isbn'. */
  provider: string
  /** Tipo do item dentro do serviço: 'film', 'title', 'movie', 'tv', 'anime', 'manga', 'book', 'isbn', 'short'. */
  kind: string
  /** Identificador do item no serviço (slug, tt-id, número, código curto, ISBN…). */
  id: string
  /** O link original (ou o ISBN, quando o texto não tinha link). */
  url: string
}

/** Primeiro link http(s) dentro do texto compartilhado. */
function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i)
  return m ? m[0].replace(/[.,;!?]+$/, '') : null
}

/** ISBN-13 (978/979…) ou ISBN-10 solto no texto, com ou sem hífens. */
function isbnFrom(text: string): string | null {
  const limpo = text.replace(/[\s-]/g, '')
  if (/^(97[89]\d{10})$/.test(limpo)) return limpo
  if (/^\d{9}[\dXx]$/.test(limpo)) return limpo.toUpperCase()
  return null
}

/**
 * Interpreta o texto compartilhado.
 *
 * @param text - Texto recebido do menu Compartilhar (link, "frase + link" ou só um ISBN).
 * @returns O link reconhecido, ou `null` se não for de um serviço conhecido.
 *
 * @example
 *   parseSharedLink('https://letterboxd.com/film/parasite-2019/')
 *   // → { agents: ['akane'], provider: 'letterboxd', kind: 'film', id: 'parasite-2019', url: '…' }
 */
export function parseSharedLink(text: string): SharedLink | null {
  const raw = (text ?? '').trim()
  if (!raw) return null

  const link = firstUrl(raw)
  if (!link) {
    const isbn = isbnFrom(raw)
    return isbn ? { agents: ['frieren'], provider: 'isbn', kind: 'isbn', id: isbn, url: isbn } : null
  }

  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  const make = (agents: ShareAgent[], provider: string, kind: string, id: string): SharedLink => ({
    agents, provider, kind, id, url: link,
  })

  // Letterboxd: /film/<slug>/ e links curtos boxd.it/<código>
  if (host === 'letterboxd.com' && parts[0] === 'film' && parts[1]) {
    return make(['akane'], 'letterboxd', 'film', parts[1])
  }
  if (host === 'boxd.it' && parts[0]) return make(['akane'], 'letterboxd', 'short', parts[0])

  // IMDb: /title/tt1234567/ — não diz se é filme ou série
  if (host === 'imdb.com' && parts[0] === 'title' && /^tt\d+$/.test(parts[1] ?? '')) {
    return make(['akane', 'mai'], 'imdb', 'title', parts[1])
  }

  // TMDB: /movie/603-the-matrix, /tv/1399-game-of-thrones
  if (host === 'themoviedb.org' && (parts[0] === 'movie' || parts[0] === 'tv')) {
    const id = (parts[1] ?? '').match(/^\d+/)?.[0]
    if (id) return make([parts[0] === 'movie' ? 'akane' : 'mai'], 'tmdb', parts[0], id)
  }

  // MyAnimeList e AniList: anime → Marin, mangá → Frieren
  if ((host === 'myanimelist.net' || host === 'anilist.co') && /^\d+$/.test(parts[1] ?? '')) {
    const provider = host === 'anilist.co' ? 'anilist' : 'mal'
    if (parts[0] === 'anime') return make(['marin'], provider, 'anime', parts[1])
    if (parts[0] === 'manga') return make(['frieren'], provider, 'manga', parts[1])
  }

  // Google Livros: books.google.<tld>/books?id=XXXX (ou /books/about/Titulo.html?id=XXXX)
  if (/^books\.google\./.test(host)) {
    const id = url.searchParams.get('id')
    if (id) return make(['frieren'], 'googlebooks', 'book', id)
  }

  return null
}

/** "parasite-2019" / "Fullmetal_Alchemist" → "parasite 2019" / "Fullmetal Alchemist". */
function humanize(slug: string): string {
  let s = slug
  try {
    s = decodeURIComponent(slug)
  } catch {
    /* % solto: usa como veio */
  }
  return s.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Texto para buscar o item na tela do agente (o título "adivinhado" pelo endereço).
 *
 * Letterboxd, TMDB, MyAnimeList e AniList trazem o nome no endereço; IMDb, Google Livros e os links curtos
 * do Letterboxd só trazem um código (devolve vazio: a tela do agente abre sem busca). ISBN vale por si.
 *
 * @example
 *   shareSearchText(parseSharedLink('https://www.themoviedb.org/movie/603-the-matrix')!) // 'the matrix'
 */
export function shareSearchText(link: SharedLink): string {
  if (link.provider === 'isbn') return link.id
  let parts: string[]
  try {
    parts = new URL(link.url).pathname.split('/').filter(Boolean)
  } catch {
    return ''
  }
  switch (link.provider) {
    case 'letterboxd': return link.kind === 'film' ? humanize(link.id) : ''
    case 'tmdb': return humanize((parts[1] ?? '').replace(/^\d+-?/, ''))
    case 'mal':
    case 'anilist': return humanize(parts[2] ?? '')
    default: return ''
  }
}

/**
 * Deep link que abre a tela do agente já buscando o item compartilhado (`makima://akane/compartilhar/the-matrix`).
 * Cada shell trata `#compartilhar/<busca>` abrindo o formulário de adicionar/registrar. Sem texto para
 * buscar, só abre a tela do agente.
 */
export function shareDeepLink(link: SharedLink, agent: ShareAgent): string {
  const slug = shareSearchText(link)
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug ? `makima://${agent}/compartilhar/${slug}` : `makima://${agent}`
}

/** O que fazer com um texto compartilhado. */
export type ShareAction =
  | { kind: 'open'; link: string }
  | { kind: 'choose'; options: { agent: ShareAgent; label: string; link: string }[] }
  | { kind: 'unknown' }

const AGENT_LABEL: Record<ShareAgent, string> = { akane: 'Filme', mai: 'Série', marin: 'Anime', frieren: 'Livro' }

/**
 * Decide o destino de um texto compartilhado: abre direto (um único agente possível), pergunta
 * (IMDb não diz se é filme ou série) ou desiste (link de um serviço desconhecido).
 */
export function resolveShare(text: string): ShareAction {
  const found = parseSharedLink(text)
  if (!found) return { kind: 'unknown' }
  if (found.agents.length === 1) return { kind: 'open', link: shareDeepLink(found, found.agents[0]) }
  return {
    kind: 'choose',
    options: found.agents.map((agent) => ({ agent, label: AGENT_LABEL[agent], link: shareDeepLink(found, agent) })),
  }
}
