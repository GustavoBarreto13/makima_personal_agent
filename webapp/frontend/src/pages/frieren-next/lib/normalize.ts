// Converte o que o servidor devolve no formato que as telas usam. É a "borda" do app: tudo que pode vir
// `null` (listas, textos, datas) vira um valor seguro aqui, para nenhuma tela quebrar com dado inesperado.

import { isoDate } from '../../../design/core/format'
import type { ApiBook, ApiSession, ApiShelf, Book, Session, Shelf } from '../types'
import { isBookStatus } from './status'

/** Dia local (America/Sao_Paulo no navegador) de um instante ISO do servidor — nunca `slice(0, 10)` (UTC). */
export function localDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : isoDate(new Date(iso))
}

/** Só a parte da data (YYYY-MM-DD) de um campo DATE; vazio vira null. */
const day = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null)

/** "Fantasia, Aventura" → ["Fantasia", "Aventura"] (sem vazios nem espaços nas pontas). */
export function splitList(v: string | null | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export function normalizeBook(b: ApiBook): Book {
  const status = isBookStatus(b.status) ? b.status : 'quero_ler'
  const pages = b.total_pages && b.total_pages > 0 ? b.total_pages : null
  const page = b.current_page ?? 0
  const genres = splitList(b.genre)
  return {
    id: b.id,
    title: b.title || 'Sem título',
    author: b.author ?? '',
    year: b.published_year ?? null,
    pages,
    genre: genres[0] ?? '',
    genres,
    language: b.language ?? '',
    status,
    page,
    // Progresso só quando dá para calcular e há alguma leitura; limitado a 100%.
    progress: pages && page > 0 ? Math.min(1, page / pages) : null,
    started: day(b.date_started),
    finished: day(b.date_finished),
    abandoned: day(b.date_abandoned),
    addedAt: localDay(b.created_at),
    lastRead: day(b.last_read),
    rating: b.rating ?? null,
    review: b.notes ?? '',
    liked: !!b.liked,
    shelves: b.shelves ?? [],
    storeUrl: b.store_url || null,
    price: b.price ?? null,
    coverUrl: b.cover_url || null,
    isbn: b.isbn || null,
  }
}

export function normalizeSession(s: ApiSession): Session {
  const kind = s.type === 'started' || s.type === 'finished' ? s.type : 'progress'
  return {
    id: s.id,
    date: day(s.date) ?? '',
    bookId: s.book_id,
    title: s.title || 'Livro',
    author: s.author ?? '',
    pages: s.pages ?? 0,
    page: s.page ?? 0,
    note: s.note ?? '',
    kind,
  }
}

export function normalizeShelf(s: ApiShelf): Shelf {
  return { id: s.id, name: s.name || 'Estante', description: s.description ?? '', accent: s.accent ?? '', count: s.book_count ?? 0 }
}

/** Cor de uma estante: um matiz (0–360) ou "neutra" (cinza). O banco guarda o texto do shell antigo
 * ("oklch(0.58 0.085 195)": o matiz é o último número e croma quase zero quer dizer cinza), o matiz puro
 * que o shell novo grava ("195") ou "neutral". Sem nada aproveitável, usa `fallback`. */
export function shelfTone(accent: string, fallback: number): { hue: number; neutral: boolean } {
  if (accent.trim() === 'neutral') return { hue: fallback, neutral: true }
  const nums = (accent.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const h = nums.length ? nums[nums.length - 1] : NaN
  // No formato antigo (3 números: luz, croma, matiz) um croma baixo é o cinza da paleta antiga.
  const neutral = nums.length >= 3 && nums[1] < 0.05
  return { hue: Number.isFinite(h) && h >= 0 && h <= 360 ? h : fallback, neutral }
}

/** Garante "https://" num link colado sem protocolo ("amazon.com.br/…"). */
export function normalizeUrl(url: string): string {
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

/** Domínio de um link, para mostrar compacto ("amazon.com.br"). */
export function domainOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
