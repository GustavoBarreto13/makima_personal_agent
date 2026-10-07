// Card (grade) e linha (lista) de livro: capa, título, autor, ano, nota, coração e o progresso de quem está lendo.

import { hueFromName, Icon, MediaCard, ProgressBar, StatusChip } from '../../../design'
import { useFrieren } from '../context'
import { STATUS } from '../lib/status'
import type { Book } from '../types'

/** "Frank Herbert · 1965" (o que houver). */
export const byline = (b: Book): string => [b.author, b.year].filter(Boolean).join(' · ')

export function BookCard({ book, index, showStatus = true }: { book: Book; index?: number; showStatus?: boolean }) {
  const frieren = useFrieren()
  const tone = STATUS[book.status].tone
  return (
    <MediaCard
      title={book.title}
      subtitle={byline(book) || undefined}
      image={book.coverUrl}
      icon="book"
      hue={hueFromName(book.title)}
      // Nota só para quem já terminou (nota de livro em andamento não existe).
      rating={book.status === 'lido' ? book.rating : undefined}
      cover="poster"
      status={showStatus && tone && tone !== 'done' ? tone : undefined}
      badge={book.liked ? <Icon name="heart" size={14} label="Curti" /> : undefined}
      meta={book.status === 'lendo' && book.progress !== null ? <ProgressBar value={book.progress * 100} label={`${Math.round(book.progress * 100)}% lido`} /> : undefined}
      metaRight={book.status === 'lendo' && book.pages ? <span className="ds-mono">p. {book.page}/{book.pages}</span> : undefined}
      index={index}
      onOpen={() => frieren.goto({ view: 'catalog', bookId: book.id })}
    />
  )
}

/** Linha da lista (modo "lista" da Biblioteca e do Quero ler). */
export function BookRow({ book }: { book: Book }) {
  const frieren = useFrieren()
  const meta = [byline(book), book.pages ? `${book.pages} págs.` : null].filter(Boolean).join(' · ')
  const tone = STATUS[book.status].tone
  return (
    <button type="button" className="ds-lrow" onClick={() => frieren.goto({ view: 'catalog', bookId: book.id })}>
      <span className="ds-lead"><Icon name={STATUS[book.status].icon} size={18} /></span>
      <span className="ds-t"><b>{book.title}</b>{meta && <span>{meta}</span>}</span>
      {tone && tone !== 'done' && <StatusChip status={tone} label={STATUS[book.status].label} />}
      {book.status === 'lendo' && book.progress !== null && <span className="ds-num">{Math.round(book.progress * 100)}%</span>}
      {book.liked && <Icon name="heart" size={14} label="Curti" />}
      {book.status === 'lido' && book.rating ? <span className="ds-num">{book.rating.toFixed(1)}</span> : null}
      <Icon name="right" size={16} />
    </button>
  )
}
