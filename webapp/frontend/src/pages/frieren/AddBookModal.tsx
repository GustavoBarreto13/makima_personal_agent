// Modal de adição de livro — busca na Google Books, escolha de status e cadastro.
// Reaproveita as classes de modal do design system (.modal-scrim, .modal, etc.).
// Esc fecha; clique fora fecha. Erros do backend aparecem inline sem fechar o modal.

import { useState, useEffect, useCallback } from 'react'
import { booksApi } from '../../lib/api'
import type { GoogleBookResult } from '../../lib/api'
import { Icon } from './ui/Icons'

// Payload que o shell recebe para chamar booksApi.addBook
export interface AddBookPayload {
  title: string
  status: string         // valor em português — VALID_STATUSES do backend
  google_books_id?: string
  author?: string
  total_pages?: number
}

interface AddBookModalProps {
  open: boolean
  onClose: () => void
  // Adiciona o livro; pode lançar erro (ex.: duplicado) — o modal trata e exibe
  onAdd: (payload: AddBookPayload) => Promise<void>
}

// Opções de status iniciais (rótulo visível → valor backend em português).
// Só os casos mais comuns de cadastro; o usuário ajusta depois no detalhe.
const STATUS_OPCOES: { label: string; value: string }[] = [
  { label: 'Quero ler',   value: 'quero_ler' },
  { label: 'Lendo agora', value: 'lendo' },
  { label: 'Wishlist',    value: 'wishlist' },
  { label: 'Já li',       value: 'lido' },
]

/**
 * Modal para adicionar um livro ao catálogo.
 * Fluxo: buscar na Google Books → selecionar resultado → escolher status → "Adicionar".
 * Fallback: se não houver resultado, adiciona pelo título digitado manualmente.
 */
export function AddBookModal({ open, onClose, onAdd }: AddBookModalProps) {
  const [query,     setQuery]     = useState('')                        // termo de busca digitado
  const [results,   setResults]   = useState<GoogleBookResult[]>([])    // resultados da Google Books
  const [searching, setSearching] = useState(false)                     // spinner de busca ativa
  const [searched,  setSearched]  = useState(false)                     // já buscou ao menos uma vez?
  const [selected,  setSelected]  = useState<GoogleBookResult | null>(null) // resultado escolhido
  const [status,    setStatus]    = useState('quero_ler')               // status inicial escolhido
  const [saving,    setSaving]    = useState(false)                     // spinner de cadastro
  const [error,     setError]     = useState('')                        // mensagem de erro inline

  // Reseta todo o estado sempre que o modal abre — garante tela em branco a cada abertura
  useEffect(() => {
    if (!open) return
    setQuery(''); setResults([]); setSearching(false); setSearched(false)
    setSelected(null); setStatus('quero_ler'); setSaving(false); setError('')
  }, [open])

  // Dispara a busca na Google Books com o termo digitado
  const doSearch = useCallback(async () => {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true); setError(''); setSelected(null)
    try {
      const res = await booksApi.searchGoogle(q)
      setResults(res.results ?? [])
    } catch {
      // Falha de rede ou HTTP — lista vazia; usuário ainda pode adicionar pelo título
      setResults([])
      setError('Não foi possível buscar agora. Você pode adicionar pelo título mesmo assim.')
    } finally {
      setSearching(false); setSearched(true)
    }
  }, [query, searching])

  // Adiciona o livro: usa o resultado selecionado se houver, senão só o título digitado
  const doAdd = useCallback(async () => {
    if (saving) return
    // Título vem do resultado selecionado ou do campo de busca como fallback manual
    const titulo = selected?.title ?? query.trim()
    if (!titulo) { setError('Digite um título.'); return }
    setSaving(true); setError('')
    try {
      await onAdd({
        title:           titulo,
        status,
        // Passa o ID Google Books para o backend enriquecer os metadados automaticamente
        google_books_id: selected?.google_books_id || undefined,
        author:          selected?.author          || undefined,
        total_pages:     selected?.total_pages     ?? undefined,
      })
      onClose() // só fecha após sucesso — erro mantém o modal aberto
    } catch {
      // O backend retorna HTTP 400 para livro duplicado (fuzzy match) ou status inválido
      setError('Não foi possível adicionar. O livro já pode estar no catálogo.')
    } finally {
      setSaving(false)
    }
  }, [saving, selected, query, status, onAdd, onClose])

  // Atalho de teclado: Esc fecha o modal
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Não renderiza nada quando fechado — evita elementos ocultos no DOM
  if (!open) return null

  // O botão "Adicionar" fica ativo se há resultado selecionado OU título digitado
  const podeAdicionar = !!(selected || query.trim())

  return (
    // Scrim (fundo escurecido com blur) — clique fora do modal fecha
    <div
      className="modal-scrim"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal" role="dialog" aria-label="Adicionar livro">

        {/* Cabeçalho */}
        <div className="modal-head">
          <span className="modal-title">Adicionar livro</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">

          {/* Campo de busca — Enter aciona a busca */}
          <label className="modal-label">Buscar título, autor ou ISBN</label>
          <div className="page-input-row">
            <input
              className="page-input"
              style={{ fontFamily: 'var(--sans)', fontSize: 15 }}
              value={query}
              placeholder="ex.: Duna, Frank Herbert…"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
              autoFocus
            />
            <button className="btn btn-ghost" onClick={doSearch} disabled={searching}>
              <Icon name="search" /> {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          {/* Lista de resultados — só aparece após pelo menos uma busca */}
          {searched && (
            <div className="modal-field">
              {results.length > 0 ? (
                <div className="addbook-results">
                  {results.map(r => (
                    <button
                      key={r.google_books_id || r.title}
                      className={'addbook-result' + (selected?.google_books_id === r.google_books_id ? ' sel' : '')}
                      onClick={() => setSelected(r)}
                    >
                      {/* Capa miniatura — fallback visual quando a API não trouxer imagem */}
                      {r.cover_url
                        ? <img src={r.cover_url} alt="" className="addbook-thumb" />
                        : <div className="addbook-thumb addbook-thumb--empty" />}
                      <div className="addbook-meta">
                        <div className="addbook-title">{r.title}</div>
                        <div className="addbook-sub">
                          {r.author || 'Autor desconhecido'}
                          {r.published_year ? ` · ${r.published_year}` : ''}
                          {r.total_pages    ? ` · ${r.total_pages}p`    : ''}
                        </div>
                      </div>
                      {/* Ícone de seleção — aparece no item ativo */}
                      {selected?.google_books_id === r.google_books_id && (
                        <Icon name="check" style={{ width: 16, height: 16, color: 'var(--teal)', flexShrink: 0 }} />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                // Sem resultados — oferece caminho de adição manual
                <p className="addbook-empty">
                  Nenhum resultado. Você ainda pode adicionar "{query.trim()}" pelo título.
                </p>
              )}
            </div>
          )}

          {/* Seletor de status inicial */}
          <div className="modal-field">
            <label className="modal-label">Adicionar como</label>
            <div className="chips">
              {STATUS_OPCOES.map(o => (
                <button
                  key={o.value}
                  className={'chip' + (status === o.value ? ' active' : '')}
                  onClick={() => setStatus(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mensagem de erro inline (duplicado, título vazio, falha de rede) */}
          {error && <p className="addbook-error">{error}</p>}

          {/* Rodapé com botões de ação */}
          <div className="modal-foot">
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button
              className="btn btn-primary"
              onClick={doAdd}
              disabled={!podeAdicionar || saving}
            >
              <Icon name="plus" /> {saving ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
