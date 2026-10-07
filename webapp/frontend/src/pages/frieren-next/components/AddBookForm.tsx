// Adicionar livro: buscar no Google Books, escolher a edição e o status inicial. Sem resultado (ou com a busca
// fora do ar), adiciona só pelo título digitado. O erro de livro repetido aparece no próprio formulário.

import { useState } from 'react'
import { Button, Chip, Field, Icon, Img, Input, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { STATUS } from '../lib/status'
import type { BookStatus, GoogleBook } from '../types'

// Os mesmos status iniciais do shell antigo, mais "Na estante" (tenho o livro, ainda não comecei).
const INITIAL: BookStatus[] = ['quero_ler', 'lendo', 'estante', 'wishlist', 'lido']

export function AddBookForm({ initialTitle = '', onClose }: { initialTitle?: string; onClose: () => void }) {
  const frieren = useFrieren()
  const [query, setQuery] = useState(initialTitle)
  const [results, setResults] = useState<GoogleBook[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<GoogleBook | null>(null)
  const [status, setStatus] = useState<BookStatus>('quero_ler')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const search = async () => {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true); setError(''); setSelected(null)
    try {
      setResults(await frierenApi.searchGoogle(q))
    } catch {
      setResults([])
      setError('A busca não respondeu agora. Você pode adicionar pelo título mesmo assim.')
    } finally {
      setSearching(false); setSearched(true)
    }
  }

  const add = async () => {
    const title = (selected?.title ?? query).trim()
    if (!title) { setError('Digite o título do livro.'); return }
    setSaving(true); setError('')
    try {
      // Os metadados da edição escolhida vão junto: o servidor não precisa rebuscar (e não troca de edição).
      await frierenApi.add({
        title,
        status,
        ...(selected ? {
          google_books_id: selected.google_books_id || undefined,
          author: selected.author || undefined,
          total_pages: selected.total_pages ?? undefined,
          isbn: selected.isbn || undefined,
          cover_url: selected.cover_url || undefined,
          description: selected.description || undefined,
          genre: selected.genre || undefined,
          language: selected.language || undefined,
          published_year: selected.published_year ?? undefined,
        } : {}),
      })
      frieren.reload()
      toast(`${title} entrou na biblioteca`, { tone: 'success' })
      onClose()
    } catch (e) {
      // A mensagem do servidor já diz o motivo (ex.: "já está no catálogo").
      setError(e instanceof Error ? e.message.replace(/<[^>]+>/g, '') : 'Não foi possível adicionar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Adicionar livro"
      size="lg"
      dirty={query.trim() !== initialTitle.trim() || !!selected}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="add" disabled={saving || !(selected?.title ?? query).trim()} onClick={() => void add()}>
            {selected ? 'Adicionar' : 'Adicionar pelo título'}
          </Button>
        </>
      }
    >
      <div className="ds-stack">
        <Field label="Título, autor ou ISBN" hint="Enter busca no Google Books.">
          {(a) => (
            <div className="ds-inline fr-searchrow">
              <Input
                {...a}
                value={query}
                autoFocus
                placeholder="Ex.: O Hobbit"
                autoComplete="off"
                onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search() } }}
              />
              <Button icon="search" disabled={searching || !query.trim()} onClick={() => void search()}>{searching ? 'Buscando…' : 'Buscar'}</Button>
            </div>
          )}
        </Field>

        {results.length > 0 && (
          <div className="ds-list" aria-label="Resultados do Google Books">
            {results.map((r) => {
              const on = selected?.google_books_id === r.google_books_id
              return (
                <button key={r.google_books_id || r.title} type="button" className="ds-lrow fr-hit" aria-pressed={on} onClick={() => setSelected(on ? null : r)}>
                  <Img src={r.cover_url} ratio="poster" className="fr-mini" fallback={<Icon name="book" size={16} />} />
                  <span className="ds-t">
                    <b>{r.title}</b>
                    <span>{[r.author, r.published_year, r.total_pages ? `${r.total_pages} págs.` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  {on && <Icon name="check" size={16} label="Escolhido" />}
                </button>
              )
            })}
          </div>
        )}
        {searched && !searching && results.length === 0 && !error && (
          <p className="ds-hint">Nada encontrado no Google Books. Você pode adicionar pelo título mesmo assim.</p>
        )}

        <Field label="Status inicial">
          {() => (
            <div className="ds-inline fr-wrap" role="radiogroup" aria-label="Status inicial">
              {INITIAL.map((s) => (
                <Chip key={s} on={status === s} icon={STATUS[s].icon} role="radio" aria-checked={status === s} onClick={() => setStatus(s)}>{STATUS[s].label}</Chip>
              ))}
            </div>
          )}
        </Field>

        {error && <p className="ds-errmsg" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
