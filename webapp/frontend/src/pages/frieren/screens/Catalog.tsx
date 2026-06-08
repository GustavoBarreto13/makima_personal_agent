// Tela de catálogo (Biblioteca) — exibe todos os livros com filtros por status
// e ordenação. Permite navegar para o detalhe de cada livro.

import { useState, useMemo } from 'react'
import type { Book, Tweaks } from '../types'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'

// Tipos de filtro de status disponíveis na toolbar
type FilterType = 'todos' | 'reading' | 'read' | 'owned' | 'wishlist'

// Definição dos chips de filtro com ID e rótulo exibido
const STATUS_FILTERS: { id: FilterType; label: string }[] = [
  { id: 'todos',    label: 'Todos' },
  { id: 'reading',  label: 'Lendo' },
  { id: 'read',     label: 'Lidos' },
  { id: 'owned',    label: 'Quero ler' },
  { id: 'wishlist', label: 'Wishlist' },
]

// Props recebidas da FrierenShell
interface CatalogProps {
  books: Book[]
  navigate: (view: string, param?: string | null) => void
  // Critério de ordenação atual (vem do tweak "ordenacao")
  sort: Tweaks['ordenacao']
  // Texto de busca atual
  query: string
  // Filtro inicial — permite abrir o catálogo já filtrado (ex.: vindo de "Lendo agora")
  initialFilter?: FilterType | null
}

// Ordena a lista de livros conforme o critério escolhido
function sortBooks(books: Book[], sort: string): Book[] {
  switch (sort) {
    case 'Avaliação':
      // Livros com maior nota primeiro; sem nota ficam por último
      return [...books].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))

    case 'Título':
      // Ordem alfabética pelo título em português
      return [...books].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))

    case 'Autor':
      // Ordem alfabética pelo nome do autor em português
      return [...books].sort((a, b) => a.author.localeCompare(b.author, 'pt-BR'))

    case 'Progresso':
      // Livros com maior progresso (% lido) primeiro
      return [...books].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))

    default:
      // Padrão: mais recentes primeiro (data de término ou início)
      return [...books].sort((a, b) => {
        const da = a.finished ?? a.started ?? ''
        const db = b.finished ?? b.started ?? ''
        return db.localeCompare(da)
      })
  }
}

// Componente principal do catálogo
export function Catalog({ books, navigate, sort, query, initialFilter }: CatalogProps) {
  // Estado do filtro de status — começa com o valor inicial passado ou "todos"
  const [filter, setFilter] = useState<FilterType>(initialFilter ?? 'todos')

  // Lista filtrada e ordenada — recalcula só quando books/filter/query/sort mudam
  const filtered = useMemo(() => {
    // Filtra por status, se não for "todos"
    let list = filter === 'todos' ? books : books.filter(b => b.status === filter)

    // Filtra pelo texto de busca no título ou autor
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(
        b =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q)
      )
    }

    // Aplica a ordenação escolhida
    return sortBooks(list, sort)
  }, [books, filter, query, sort])

  return (
    <div className="page">

      {/* ── CABEÇALHO ── */}
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Biblioteca</h2>
        <span className="section-sub">{books.length} títulos no acervo</span>
      </div>

      {/* ── TOOLBAR: filtros + contagem de resultados ── */}
      <div className="cat-toolbar">
        {/* Chips de filtro de status */}
        <div className="chips">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              className={'chip' + (filter === f.id ? ' active' : '')}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Espaçador flexível empurra a contagem para a direita */}
        <div className="toolbar-spacer" />

        {/* Contagem e critério de ordenação atual */}
        <span className="result-count">
          {filtered.length} {filtered.length === 1 ? 'livro' : 'livros'} · ordenado por{' '}
          {sort.toLowerCase()}
        </span>
      </div>

      {/* ── GRADE DE CAPAS ── */}
      {/* Cada item: capa com badge de status + título + autor + nota ou progresso */}
      <div className="cover-grid">
        {filtered.map(b => (
          // Item da grade — clique navega para o detalhe do livro
          <a
            key={b.id}
            className="cover-link"
            onClick={() => navigate('detalhe', b.id)}
            style={{ cursor: 'pointer', textDecoration: 'none' }}
          >
            {/* Capa com badge de status visível */}
            <Cover book={b} badge />

            {/* Metadados abaixo da capa */}
            <div className="cover-meta">
              <div className="cm-title">{b.title}</div>
              <div className="cm-author">{b.author}</div>
              <div className="cm-row">
                {/* Exibe nota se disponível, ou progresso se estiver lendo, ou status */}
                {b.rating != null ? (
                  <Stars value={b.rating} />
                ) : b.status === 'reading' ? (
                  <span className="result-count" style={{ color: 'var(--teal-deep)' }}>
                    {b.progress != null ? Math.round(b.progress * 100) : 0}% lido
                  </span>
                ) : b.status === 'wishlist' ? (
                  <span className="result-count">na wishlist</span>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Estado vazio — exibido quando nenhum livro corresponde ao filtro/busca */}
      {filtered.length === 0 && (
        <p style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>
          Nada encontrado{query ? ` para "${query}"` : ''}.
        </p>
      )}
    </div>
  )
}
