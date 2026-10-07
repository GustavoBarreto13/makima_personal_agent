// Biblioteca (os 7 status), Quero ler (estante + quero ler + pausados) e Wishlist (para comprar): o mesmo
// catálogo com esquemas diferentes. Grade de capas ou lista; busca, filtros, agrupar e as 7 ordenações.

import { useEffect, useMemo, useState } from 'react'
import { useCollection } from '../../../design/headless/useCollection'
import { toast } from '../../../design/headless/toast'
import {
  Button, CollectionBody, CollectionMeta, CollectionToolbar, EmptyState, FilterSheet, Icon, IconButton, Input, Page, StatusChip,
} from '../../../design'
import { fmtMoney } from '../../../design/core/format'
import { BookCard, BookRow, byline } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { domainOf, normalizeUrl } from '../lib/normalize'
import { makeLibrarySchema, makeToReadSchema, makeWishlistSchema, withStatusOrder } from '../lib/schemas'
import { STATUS, TO_READ } from '../lib/status'
import type { Book } from '../types'

const NOUN: [string, string] = ['livro', 'livros']

/** Classe da densidade da grade (tamanho das capas), vinda das Preferências. */
const densityClass = (d: string) => `fr-dens-${d}`

export function Library() {
  const frieren = useFrieren()
  const books = frieren.books
  const schema = useMemo(() => makeLibrarySchema(books), [books])
  const raw = useCollection(schema, books, { today: frieren.today })
  const c = withStatusOrder(raw)
  const [filters, setFilters] = useState(false)
  const layout = frieren.prefs.layout

  // Busca digitada no topo da página: aplica aqui e limpa (para não reaplicar ao voltar).
  const { topQuery, clearTopQuery } = frieren
  const { setQ } = raw
  useEffect(() => {
    if (topQuery) { setQ(topQuery); clearTopQuery() }
  }, [topQuery, clearTopQuery, setQ])

  return (
    <Page wide className={densityClass(frieren.prefs.density)}>
      <CollectionToolbar
        schema={schema}
        c={c}
        onOpenFilters={() => setFilters(true)}
        view={layout}
        onView={(v) => frieren.setPrefs({ layout: v })}
        searchPlaceholder="Buscar por título, autor ou gênero"
      />
      <CollectionMeta c={c} noun={NOUN} />
      <CollectionBody
        c={c}
        view={layout}
        gridClass="ds-grid-poster"
        renderCard={(b, i) => <BookCard key={b.id} book={b} index={i} />}
        renderRow={(b) => <BookRow key={b.id} book={b} />}
        loading={frieren.booksState.status === 'loading'}
        error={frieren.booksState.status === 'error'}
        onRetry={frieren.retryBooks}
        emptyTitle="Nenhum livro com esses filtros"
        firstRun={
          <EmptyState
            icon="library"
            title="A biblioteca está vazia"
            hint="Adicione o livro que você está lendo ou um que quer ler."
            action={<Button variant="primary" icon="add" onClick={() => frieren.openAdd()}>Adicionar livro</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={books} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}

/** Linha da pilha "Quero ler": capa, título, status e o atalho de começar (abre o registro com o livro escolhido). */
function ToReadRow({ book }: { book: Book }) {
  const frieren = useFrieren()
  const tone = STATUS[book.status].tone
  return (
    <div className="fr-row">
      <BookCover title={book.title} src={book.coverUrl} small onOpen={() => frieren.goto({ view: 'catalog', bookId: book.id })} />
      <button type="button" className="fr-link fr-row-main" onClick={() => frieren.goto({ view: 'catalog', bookId: book.id })}>
        <b className="fr-row-t">{book.title}</b>
        <span className="fr-row-s">{[byline(book), book.genre, book.pages ? `${book.pages} págs.` : null].filter(Boolean).join(' · ')}</span>
      </button>
      {tone && <StatusChip status={tone} label={STATUS[book.status].label} />}
      <Button variant="primary" size="sm" icon="book" onClick={() => frieren.openLog({ bookId: book.id })}>
        {book.status === 'pausado' ? 'Retomar' : 'Começar a ler'}
      </Button>
    </div>
  )
}

export function ToRead() {
  const frieren = useFrieren()
  const books = useMemo(() => frieren.books.filter((b) => TO_READ.includes(b.status)), [frieren.books])
  const schema = useMemo(() => makeToReadSchema(books), [books])
  const c = withStatusOrder(useCollection(schema, books, { today: frieren.today }))
  const [filters, setFilters] = useState(false)
  const layout = frieren.prefs.layout

  return (
    <Page wide className={densityClass(frieren.prefs.density)}>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} view={layout} onView={(v) => frieren.setPrefs({ layout: v })} searchPlaceholder="Buscar na pilha" />
      <CollectionMeta c={c} noun={['livro na pilha', 'livros na pilha']} />
      <CollectionBody
        c={c}
        view={layout}
        gridClass="ds-grid-poster"
        renderCard={(b, i) => <BookCard key={b.id} book={b} index={i} />}
        renderRow={(b) => <ToReadRow key={b.id} book={b} />}
        loading={frieren.booksState.status === 'loading'}
        error={frieren.booksState.status === 'error'}
        onRetry={frieren.retryBooks}
        emptyTitle="Nada na pilha com esses filtros"
        firstRun={
          <EmptyState
            icon="watchlist"
            title="A pilha está vazia"
            hint="Livros que você tem na estante, quer ler ou pausou aparecem aqui, prontos para começar."
            action={<Button icon="add" onClick={() => frieren.openAdd()}>Adicionar livro</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={books} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}

/** Link da loja de um livro da wishlist: adicionar, abrir, editar e apagar, na própria linha. */
function StoreLink({ book }: { book: Book }) {
  const frieren = useFrieren()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(book.storeUrl ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const url = draft.trim()
    setSaving(true)
    try {
      // Vazio apaga de verdade (o shell antigo mandava "nada" e o link antigo continuava no banco).
      await frierenApi.updateMetadata(book.id, url ? { store_url: normalizeUrl(url) } : { clear: ['store_url'] })
      frieren.reload()
      toast(url ? 'Link da loja salvo' : 'Link removido', { tone: 'success' })
      setEditing(false)
    } catch {
      toast('Não foi possível salvar o link.', { tone: 'error' })
    }
    setSaving(false)
  }

  if (editing) {
    return (
      <div className="ds-inline fr-linkedit">
        <Input
          aria-label={`Link da loja de ${book.title}`}
          placeholder="amazon.com.br/… ou cole qualquer link"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void save() }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
          }}
        />
        <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>Salvar</Button>
        <IconButton icon="close" label="Cancelar" size={16} onClick={() => setEditing(false)} />
      </div>
    )
  }
  if (book.storeUrl) {
    return (
      <div className="ds-inline fr-linkset">
        <a className="fr-store" href={normalizeUrl(book.storeUrl)} target="_blank" rel="noopener noreferrer">
          <Icon name="store" size={14} /> {domainOf(book.storeUrl)} <Icon name="forward" size={13} label="Abrir a loja" />
        </a>
        <IconButton icon="edit" label={`Editar link de ${book.title}`} size={15} onClick={() => { setDraft(book.storeUrl ?? ''); setEditing(true) }} />
      </div>
    )
  }
  return <Button size="sm" variant="ghost" icon="link" onClick={() => { setDraft(''); setEditing(true) }}>Link da loja</Button>
}

function WishlistRow({ book }: { book: Book }) {
  const frieren = useFrieren()
  return (
    <div className="fr-row">
      <BookCover title={book.title} src={book.coverUrl} small onOpen={() => frieren.goto({ view: 'catalog', bookId: book.id })} />
      <button type="button" className="fr-link fr-row-main" onClick={() => frieren.goto({ view: 'catalog', bookId: book.id })}>
        <b className="fr-row-t">{book.title}</b>
        <span className="fr-row-s">{[byline(book), book.genre].filter(Boolean).join(' · ')}</span>
      </button>
      {book.price != null && <span className="ds-num">{fmtMoney(book.price)}</span>}
      <StoreLink book={book} />
      <Button size="sm" icon="book" onClick={() => frieren.openLog({ bookId: book.id })}>Começar a ler</Button>
    </div>
  )
}

export function Wishlist() {
  const frieren = useFrieren()
  const books = useMemo(() => frieren.books.filter((b) => b.status === 'wishlist'), [frieren.books])
  const schema = useMemo(() => makeWishlistSchema(books), [books])
  const c = useCollection(schema, books, { today: frieren.today })
  const [filters, setFilters] = useState(false)

  return (
    <Page wide>
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar na wishlist" />
      <CollectionMeta c={c} noun={['livro pra comprar', 'livros pra comprar']} />
      <CollectionBody
        c={c}
        view="list"
        renderCard={() => null}
        renderRow={(b) => <WishlistRow key={b.id} book={b} />}
        loading={frieren.booksState.status === 'loading'}
        error={frieren.booksState.status === 'error'}
        onRetry={frieren.retryBooks}
        emptyTitle="Nada na wishlist com esses filtros"
        firstRun={
          <EmptyState
            icon="store"
            title="A wishlist está vazia"
            hint="Guarde aqui os livros que você quer comprar, com o link da loja."
            action={<Button icon="add" onClick={() => frieren.openAdd()}>Adicionar livro</Button>}
          />
        }
      />
      {filters && <FilterSheet schema={schema} c={c} items={books} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}
