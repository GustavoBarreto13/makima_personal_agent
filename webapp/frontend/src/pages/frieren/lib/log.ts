// Registrar leitura: o que a linha rápida ("Duna p. 240 ontem", "Hobbit terminei ★4.5") entende e como vira
// um rascunho. Lógica pura (sem React nem rede): a decisão de salvar direto ou abrir o formulário é daqui.

import { createCaptureParser, type CaptureResult } from '../../../design/core/capture'
import type { Book } from '../types'

/** Página (`p. 240`), nota (`★4.5`) e data no passado (`ontem`, `sexta`, `12/09`). */
export const logParser = createCaptureParser({ rules: ['progress', 'rating', 'date'], dateDirection: 'past' })

export interface LogDraft {
  /** Livro escolhido (null = ainda não escolhido). */
  bookId: string | null
  /** O que foi digitado como título (para achar o livro). */
  title: string
  /** Página onde parou. null = não informou (só vale se terminou). */
  page: number | null
  date: string
  note: string
  /** Marcou que terminou o livro. */
  finished: boolean
  /** Nota de 0.5 a 5 (só usada quando terminou). */
  rating: number | null
}

export const emptyDraft = (today: string, bookId: string | null = null, page: number | null = null): LogDraft => ({
  bookId, title: '', page, date: today, note: '', finished: false, rating: null,
})

/** Minúsculas, sem acento e sem pontuação: "O Hobbit" e "o hobbit" são o mesmo título. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

// Palavras que, no fim da linha, querem dizer "terminei o livro" (saem do título).
const FINISH_WORDS = new Set(['terminei', 'terminado', 'acabei', 'fim', 'lido'])

/** Separa "terminei" do fim do título digitado. */
export function splitFinish(title: string): { title: string; finished: boolean } {
  const words = title.trim().split(/\s+/)
  const last = norm(words[words.length - 1] ?? '')
  if (words.length > 0 && FINISH_WORDS.has(last)) return { title: words.slice(0, -1).join(' '), finished: true }
  return { title: title.trim(), finished: false }
}

/** Livros na ordem em que o formulário sugere: lendo, pausados, os da pilha e, por fim, o resto. */
export function candidates(books: Book[]): Book[] {
  const rank: Record<string, number> = { lendo: 0, pausado: 1, estante: 2, quero_ler: 3, wishlist: 4, lido: 5, abandonado: 6 }
  return [...books].sort((a, b) => rank[a.status] - rank[b.status] || (b.lastRead ?? '').localeCompare(a.lastRead ?? ''))
}

/** O livro "certo" para o título digitado, só quando não há dúvida.
 *  - Sem título: o único livro que está sendo lido (como o agente do Telegram faz).
 *  - Título igual (sem acento/maiúscula): se só um livro tem esse título.
 *  - Começo do título ("Duna" → "Duna: Messias"): se só um livro começa assim.
 *  Qualquer empate → null (o formulário pergunta). */
export function pickBook(title: string, books: Book[]): Book | null {
  const t = norm(title)
  if (!t) {
    const reading = books.filter((b) => b.status === 'lendo')
    return reading.length === 1 ? reading[0] : null
  }
  const exact = books.filter((b) => norm(b.title) === t)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const starts = books.filter((b) => norm(b.title).startsWith(t))
  return starts.length === 1 ? starts[0] : null
}

/** Livros cujo título ou autor contém o texto (para a busca do formulário). */
export function searchBooks(q: string, books: Book[]): Book[] {
  const n = norm(q)
  if (!n) return candidates(books)
  return candidates(books).filter((b) => norm(b.title).includes(n) || norm(b.author).includes(n))
}

export function draftFromCapture(r: CaptureResult, ctx: { today: string; books: Book[] }): LogDraft {
  const f = r.fields
  const { title, finished } = splitFinish(f.title)
  const book = pickBook(title, ctx.books)
  // "p. 240" é a página onde parou; num intervalo ("p. 200-240") vale o fim.
  let page = f.progress && f.progress.unit === 'page' ? f.progress.to : null
  // "terminei" sem página: a página final é o total do livro (quando conhecido).
  if (finished && page === null && book?.pages) page = book.pages
  return {
    ...emptyDraft(ctx.today),
    bookId: book?.id ?? null,
    title,
    page,
    date: f.dueDate ?? ctx.today,
    finished,
    rating: finished ? f.rating : null,
  }
}

/** Mensagem de erro do campo certo, ou null se dá para salvar. */
export function validateDraft(d: LogDraft, book: Book | null, today: string): { field: 'book' | 'page' | 'date' | 'rating'; message: string } | null {
  if (!d.bookId || !book) return { field: 'book', message: 'Escolha o livro.' }
  if (!d.date) return { field: 'date', message: 'Escolha o dia da leitura.' }
  if (d.date > today) return { field: 'date', message: 'A data não pode ser no futuro.' }
  if (d.page !== null) {
    if (!Number.isInteger(d.page) || d.page < 0) return { field: 'page', message: 'A página precisa ser um número inteiro.' }
    if (book.pages && d.page > book.pages) return { field: 'page', message: `O livro tem ${book.pages} páginas.` }
  }
  const advances = d.page !== null && d.page > book.page
  // Sem página nova e sem terminar, não há nada para registrar (o servidor recusaria "nenhum progresso").
  if (!advances && !d.finished) {
    return { field: 'page', message: book.page > 0 ? `Você já estava na página ${book.page}. Informe uma página maior.` : 'Informe a página onde parou.' }
  }
  if (d.rating !== null && (d.rating < 0.5 || d.rating > 5 || Math.round(d.rating * 2) !== d.rating * 2)) {
    return { field: 'rating', message: 'A nota vai de meia a cinco estrelas.' }
  }
  return null
}

/** Salva direto só quando a linha deixou tudo claro (livro reconhecido e algo novo para registrar). */
export function canSaveQuickly(d: LogDraft, book: Book | null, today: string): boolean {
  return validateDraft(d, book, today) === null
}
