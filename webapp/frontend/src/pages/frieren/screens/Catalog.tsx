// Tela de catálogo (Biblioteca) — mostra TODOS os livros agrupados por status
// (Lendo → Quero ler → Wishlist → Lidos), com filtro por status e ordenação.
// O filtro e a ordenação são controlados pelo shell (persistidos nos tweaks).

import { useMemo } from 'react'
import type { Book, BookStatus, BookFilter, SortKey } from '../types'
import { SORT_OPTIONS } from '../types'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'

// Chips de filtro de status disponíveis na toolbar
const STATUS_FILTERS: { id: BookFilter; label: string }[] = [
  { id: 'todos',    label: 'Todos' },
  { id: 'reading',  label: 'Lendo' },
  { id: 'owned',    label: 'Quero ler' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'read',     label: 'Lidos' },
]

// Ordem e rótulos dos grupos de status (espelha a prioridade do backend)
const STATUS_GROUPS: { status: BookStatus; label: string }[] = [
  { status: 'reading',  label: 'Lendo' },
  { status: 'owned',    label: 'Quero ler' },
  { status: 'wishlist', label: 'Wishlist' },
  { status: 'read',     label: 'Lidos' },
]

// Props recebidas da FrierenShell
interface CatalogProps {
  books: Book[]
  navigate: (view: string, param?: string | null) => void
  // Texto de busca atual
  query: string
  // Filtro de status atual (controlado/persistido pelo shell)
  filter: BookFilter
  onFilterChange: (filter: BookFilter) => void
  // Critério de ordenação atual (controlado/persistido pelo shell)
  sort: SortKey
  onSortChange: (sort: SortKey) => void
}

// Ordena a lista de livros conforme o critério escolhido
function sortBooks(books: Book[], sort: SortKey): Book[] {
  switch (sort) {
    case 'Adicionado':
      // Cadastrados mais recentemente primeiro (created_at, string ISO ordenável)
      return [...books].sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))

    case 'Avaliação':
      // Maior nota primeiro; sem nota fica por último
      return [...books].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))

    case 'Título':
      return [...books].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))

    case 'Autor':
      return [...books].sort((a, b) => a.author.localeCompare(b.author, 'pt-BR'))

    case 'Progresso':
      // Maior progresso (% lido) primeiro
      return [...books].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))

    case 'Páginas':
      // Do mais longo ao mais curto
      return [...books].sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0))

    default:
      // 'Recentes' — atividade recente (data de término ou início)
      return [...books].sort((a, b) => {
        const da = a.finished ?? a.started ?? ''
        const db = b.finished ?? b.started ?? ''
        return db.localeCompare(da)
      })
  }
}

// Card de capa reutilizado nas grades (grupo ou filtro único)
function BookCard({ b, navigate }: { b: Book; navigate: CatalogProps['navigate'] }) {
  return (
    <a
      className="cover-link"
      onClick={() => navigate('detalhe', b.id)}
      style={{ cursor: 'pointer', textDecoration: 'none' }}
    >
      <Cover book={b} badge />
      <div className="cover-meta">
        <div className="cm-title">{b.title}</div>
        <div className="cm-author">{b.author}</div>
        <div className="cm-row">
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
  )
}

// Componente principal do catálogo
export function Catalog({ books, navigate, query, filter, onFilterChange, sort, onSortChange }: CatalogProps) {
  // Aplica busca + ordenação (o agrupamento por status vem depois)
  const filtered = useMemo(() => {
    let list = books

    // Busca por título ou autor
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(
        b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
      )
    }

    return sortBooks(list, sort)
  }, [books, query, sort])

  // Grupos a exibir: quando o filtro é "todos", todos os status; senão só o escolhido.
  // Cada grupo já vem ordenado (a lista `filtered` está ordenada).
  const groups = useMemo(() => {
    return STATUS_GROUPS
      .filter(g => filter === 'todos' || filter === g.status)
      .map(g => ({ ...g, books: filtered.filter(b => b.status === g.status) }))
      .filter(g => g.books.length > 0)
  }, [filtered, filter])

  // Total exibido (soma dos grupos) — para a contagem da toolbar
  const totalShown = groups.reduce((n, g) => n + g.books.length, 0)

  return (
    <div className="page">

      {/* ── CABEÇALHO ── */}
      <div className="section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Biblioteca</h2>
        <span className="section-sub">{books.length} títulos no acervo</span>
      </div>

      {/* ── TOOLBAR: filtros + ordenação ── */}
      <div className="cat-toolbar">
        {/* Chips de filtro de status */}
        <div className="chips">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              className={'chip' + (filter === f.id ? ' active' : '')}
              onClick={() => onFilterChange(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="toolbar-spacer" />

        {/* Contagem + seletor de ordenação */}
        <span className="result-count">
          {totalShown} {totalShown === 1 ? 'livro' : 'livros'}
        </span>
        <select
          className="cat-sort"
          value={sort}
          onChange={e => onSortChange(e.target.value as SortKey)}
          aria-label="Ordenar por"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── GRUPOS POR STATUS ── */}
      {/* Com filtro "todos": cada status vira uma seção com cabeçalho.
          Com um filtro específico: mostra só aquele grupo (sem cabeçalho). */}
      {groups.map(g => (
        <div className="cat-group" key={g.status}>
          {filter === 'todos' && (
            <div className="cat-group-title">
              {g.label} <span className="cat-group-count">{g.books.length}</span>
            </div>
          )}
          <div className="cover-grid">
            {g.books.map(b => (
              <BookCard key={b.id} b={b} navigate={navigate} />
            ))}
          </div>
        </div>
      ))}

      {/* Estado vazio — nenhum livro corresponde ao filtro/busca */}
      {totalShown === 0 && (
        <p style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>
          Nada encontrado{query ? ` para "${query}"` : ''}.
        </p>
      )}
    </div>
  )
}
