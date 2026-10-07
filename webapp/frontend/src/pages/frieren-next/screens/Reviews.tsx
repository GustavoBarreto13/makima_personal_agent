// Resenhas: os livros que têm resenha, os terminados por último primeiro (como o shell antigo), com o trecho
// inicial de cada resenha. Agora com busca (também dentro do texto), filtros e ordenação.

import { useMemo, useState } from 'react'
import { useCollection } from '../../../design/headless/useCollection'
import { CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, Page, Stars } from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { byline } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { useFrieren } from '../context'
import { makeReviewsSchema } from '../lib/schemas'
import type { Book } from '../types'

const NOUN: [string, string] = ['resenha', 'resenhas']

function ReviewRow({ book }: { book: Book }) {
  const frieren = useFrieren()
  const open = () => frieren.goto({ view: 'catalog', bookId: book.id })
  return (
    <article className="fr-rev">
      <BookCover title={book.title} src={book.coverUrl} small onOpen={open} />
      <button type="button" className="fr-link fr-rev-main" onClick={open}>
        <span className="fr-rev-head">
          <b className="fr-row-t">{book.title}</b>
          {book.liked && <Icon name="heart" size={13} label="Curti" />}
        </span>
        <span className="fr-row-s">{[byline(book), book.finished ? `terminado em ${fmtDate(book.finished)}` : null].filter(Boolean).join(' · ')}</span>
        {book.rating ? <Stars value={book.rating} /> : null}
        <span className="fr-rev-t">{book.review}</span>
      </button>
    </article>
  )
}

export function Reviews() {
  const frieren = useFrieren()
  const books = useMemo(() => frieren.books.filter((b) => b.review.trim()), [frieren.books])
  const schema = useMemo(() => makeReviewsSchema(books), [books])
  const c = useCollection(schema, books, { today: frieren.today })
  const [filters, setFilters] = useState(false)

  return (
    <Page>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar nas resenhas" />
      <CollectionMeta c={c} noun={NOUN} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderRow={(b) => <ReviewRow key={b.id} book={b} />}
        loading={frieren.booksState.status === 'loading'}
        error={frieren.booksState.status === 'error'}
        onRetry={frieren.retryBooks}
        emptyTitle="Nenhuma resenha com esses filtros"
        firstRun={<EmptyState icon="review" title="Nenhuma resenha ainda" hint="Na página de um livro, escreva o que ele deixou em você. As resenhas aparecem aqui." />}
      />
      {filters && <FilterSheet schema={schema} c={c} items={books} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}
