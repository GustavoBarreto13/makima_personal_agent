// Página de gerenciamento de livros — integração com o agente Frieren.
// Exibe todos os livros com filtros por status (barra de toggles).
// O primeiro toggle "Todos" mostra todos os livros agrupados por status.
// Cada status tem seu toggle próprio para filtrar a lista.
// Wishlist exibe badge de preço e link para o anúncio na loja.

import { useEffect, useState } from 'react'
import { useNavigate }         from 'react-router-dom'
import { api }                 from '../lib/api'

// ── Interfaces ──────────────────────────────────────────────────────────────

interface Book {
  id:             string
  title:          string
  author:         string | null
  status:         string
  total_pages:    number | null
  current_page:   number | null
  cover_url:      string | null
  rating:         number | null
  date_started:   string | null
  date_finished:  string | null
  genre:          string | null
  published_year: number | null
  store_url:      string | null   // URL do anúncio na loja (wishlist)
  price:          number | null   // Preço na loja (wishlist)
}

interface GoogleBookResult {
  google_books_id: string
  title:           string
  author:          string
  total_pages:     number | null
  cover_url:       string | null
  published_year:  number | null
  isbn:            string | null
}

interface BooksResponse   { status: string; books:   Book[]             }
interface SearchResponse  { status: string; results: GoogleBookResult[] }
interface MutationResponse { status: string }

interface AddForm {
  title: string; author: string; total_pages: string
  status: string; google_books_id: string
}

const EMPTY_ADD_FORM: AddForm = {
  title: '', author: '', total_pages: '', status: 'quero_ler', google_books_id: '',
}

// ── Constantes visuais ───────────────────────────────────────────────────────

// Tipo do filtro: null = "Todos" (sem filtro), string = status específico
type StatusFilter = null | string

// Definição dos botões de filtro na barra de toggles
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: null,         label: 'Todos' },
  { id: 'lendo',      label: '📖 Lendo' },
  { id: 'lido',       label: '✅ Lido' },
  { id: 'estante',    label: '🏠 Estante' },
  { id: 'quero_ler',  label: '📚 Quero Ler' },
  { id: 'wishlist',   label: '🛒 Wishlist' },
  { id: 'pausado',    label: '⏸️ Pausado' },
  { id: 'abandonado', label: '❌ Abandonado' },
]

// Ordem de exibição dos grupos quando o filtro "Todos" está ativo
const STATUS_ORDER = ['lendo', 'estante', 'quero_ler', 'wishlist', 'pausado', 'lido', 'abandonado']

// Rótulos para os cabeçalhos de grupo (modo "Todos")
const STATUS_LABEL: Record<string, string> = {
  lendo:      '📖 LENDO',
  lido:       '✅ LIDO',
  quero_ler:  '📚 QUERO LER',
  estante:    '🏠 ESTANTE',
  wishlist:   '🛒 WISHLIST',
  pausado:    '⏸️ PAUSADO',
  abandonado: '❌ ABANDONADO',
}

// Cores dos badges de status em cada card
const STATUS_BADGE: Record<string, string> = {
  lendo:      'bg-blue-900 text-blue-300',
  lido:       'bg-green-900 text-green-300',
  quero_ler:  'bg-purple-900 text-purple-300',
  estante:    'bg-amber-900 text-amber-300',
  wishlist:   'bg-indigo-900 text-indigo-300',
  pausado:    'bg-yellow-900 text-yellow-300',
  abandonado: 'bg-gray-700 text-t3',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderStars(rating: number | null): string {
  if (!rating) return '☆☆☆☆☆'
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

function calcProgress(current: number | null, total: number | null): number {
  if (!current || !total || total === 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

// ── Componente BookCard ───────────────────────────────────────────────────────

/**
 * Card de livro reutilizável.
 * Para livros wishlist, exibe o preço e o link para o anúncio na loja.
 */
function BookCard({ book, onClick }: { book: Book; onClick: () => void }) {
  // Formata o preço para exibição: "R$ 49,90"
  const priceLabel = book.price != null
    ? `R$ ${book.price.toFixed(2).replace('.', ',')}`
    : null

  return (
    <div
      onClick={onClick}
      className="bg-bg-card border border-border-base rounded-xl p-4 flex items-center gap-4 hover:border-border-light cursor-pointer transition-colors"
    >
      {/* Capa do livro */}
      {book.cover_url ? (
        <img
          src={book.cover_url}
          alt={`Capa de ${book.title}`}
          className="w-12 h-16 object-cover rounded flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-16 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
          <span className="text-t4 text-xs">📖</span>
        </div>
      )}

      {/* Informações do livro */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-t1 font-medium text-sm truncate">{book.title}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
            STATUS_BADGE[book.status] ?? 'bg-gray-700 text-t3'
          }`}>
            {book.status.replace('_', ' ')}
          </span>
        </div>

        {book.author && (
          <p className="text-t3 text-xs mt-0.5 truncate">{book.author}</p>
        )}

        {/* Barra de progresso — só para livros em leitura */}
        {book.status === 'lendo' && (
          <div className="mt-2 space-y-1">
            <div className="bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${calcProgress(book.current_page, book.total_pages)}%` }}
              />
            </div>
            <p className="text-t4 text-xs">
              {book.current_page ?? 0} / {book.total_pages ?? '?'} páginas
              {' '}({calcProgress(book.current_page, book.total_pages)}%)
            </p>
          </div>
        )}

        {/* Estrelas — só para livros lidos */}
        {book.status === 'lido' && (
          <p className="text-yellow-400 text-sm mt-1" title={`Avaliação: ${book.rating ?? 'sem nota'}`}>
            {renderStars(book.rating)}
          </p>
        )}

        {/* Preço e link da loja — só para wishlist */}
        {book.status === 'wishlist' && (priceLabel || book.store_url) && (
          <div className="flex items-center gap-3 mt-1.5">
            {/* Badge de preço em verde */}
            {priceLabel && (
              <span className="text-green-400 text-xs font-semibold">{priceLabel}</span>
            )}
            {/* Link para o anúncio — stopPropagation para não navegar ao detalhe */}
            {book.store_url && (
              <a
                href={book.store_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-indigo-400 hover:text-indigo-300 text-xs underline transition-colors"
              >
                🔗 Ver anúncio
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Books() {
  const navigate = useNavigate()

  const [books,   setBooks]   = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Filtro ativo: null = Todos, string = status específico
  const [filter, setFilter] = useState<StatusFilter>(null)

  // Modal de adição
  const [modalOpen,   setModalOpen]   = useState(false)
  const [modalStep,   setModalStep]   = useState<'search' | 'form'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GoogleBookResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addForm,   setAddForm]   = useState<AddForm>(EMPTY_ADD_FORM)
  const [addError,  setAddError]  = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { loadBooks() }, [])

  function loadBooks() {
    setLoading(true)
    setError(null)
    api.get<BooksResponse>('/api/books')
      .then((res) => setBooks(res.books))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const res = await api.get<SearchResponse>(
        `/api/books/search-google?q=${encodeURIComponent(searchQuery)}`
      )
      setSearchResults(res.results)
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  function selectSearchResult(result: GoogleBookResult) {
    setAddForm({
      title: result.title, author: result.author,
      total_pages: result.total_pages != null ? String(result.total_pages) : '',
      status: 'quero_ler', google_books_id: result.google_books_id,
    })
    setAddError(null)
    setModalStep('form')
  }

  async function handleSave() {
    setAddError(null)
    setSaving(true)
    try {
      await api.post<MutationResponse>('/api/books', {
        title:           addForm.title,
        author:          addForm.author || undefined,
        total_pages:     addForm.total_pages ? parseInt(addForm.total_pages, 10) : undefined,
        status:          addForm.status,
        google_books_id: addForm.google_books_id || undefined,
      })
      closeModal()
      loadBooks()
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function openModal() {
    setModalStep('search'); setSearchQuery(''); setSearchResults([])
    setAddForm(EMPTY_ADD_FORM); setAddError(null); setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false); setSearchQuery(''); setSearchResults([])
    setAddForm(EMPTY_ADD_FORM); setAddError(null)
  }
  function skipToManualForm() { setAddForm(EMPTY_ADD_FORM); setAddError(null); setModalStep('form') }
  function backToSearch()     { setModalStep('search'); setAddError(null) }
  function handleFormChange(field: keyof AddForm, value: string) {
    setAddForm((prev) => ({ ...prev, [field]: value }))
  }

  // ── Lógica de filtro e agrupamento ──────────────────────────────────────────

  // Lista exibida: filtrada pelo status ativo ou todos
  const displayed = filter ? books.filter((b) => b.status === filter) : books

  // Quando "Todos", agrupa por status na ordem definida
  const grouped = STATUS_ORDER
    .map((s) => ({ status: s, label: STATUS_LABEL[s], items: displayed.filter((b) => b.status === s) }))
    .filter((g) => g.items.length > 0)

  // ── Renderização ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-t1">Livros</h1>
        <button
          onClick={openModal}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-t1 text-sm font-medium rounded-lg transition-colors"
        >
          Adicionar Livro
        </button>
      </div>

      {/* Barra de filtros scrollável */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map((f) => {
          // Calcula quantos livros existem neste filtro para o badge de contagem
          const count = f.id === null ? books.length : books.filter((b) => b.status === f.id).length
          const isActive = filter === f.id
          return (
            <button
              key={String(f.id)}
              onClick={() => setFilter(isActive && f.id !== null ? null : f.id)}
              className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-blue-600 text-t1'
                  : 'bg-bg-elevated text-t3 hover:bg-gray-700'
              }`}
            >
              {f.label}
              {/* Badge de contagem — só aparece se houver livros */}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-blue-500 text-t1' : 'bg-gray-700 text-t3'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Estado de carregamento */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-border-light border-t-t3 rounded-full animate-spin" />
        </div>
      )}

      {/* Erro */}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Vazio global */}
      {!loading && !error && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-t4">
          <span className="text-4xl mb-3">📚</span>
          <p className="text-sm">Nenhum livro cadastrado ainda.</p>
          <p className="text-sm">Clique em "Adicionar Livro" para começar.</p>
        </div>
      )}

      {/* ── Conteúdo: agrupado (Todos) ou lista plana (filtro ativo) ── */}
      {!loading && !error && books.length > 0 && (

        // Filtro ativo: lista plana
        filter ? (
          <>
            {displayed.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-t4">
                <span className="text-4xl mb-3">📖</span>
                <p className="text-sm">Nenhum livro com este status.</p>
              </div>
            )}
            <div className="space-y-2">
              {displayed.map((book) => (
                <BookCard key={book.id} book={book} onClick={() => navigate(`/books/${book.id}`)} />
              ))}
            </div>
          </>
        ) : (
          // Sem filtro: agrupado por status
          <>
            {grouped.length === 0 && (
              <p className="text-t4 text-sm text-center py-6">Nenhum livro cadastrado.</p>
            )}
            {grouped.map((group) => (
              <div key={group.status} className="space-y-3">
                <h2 className="text-xs font-semibold text-t3 tracking-widest uppercase">
                  {group.label}
                </h2>
                <div className="space-y-2">
                  {group.items.map((book) => (
                    <BookCard key={book.id} book={book} onClick={() => navigate(`/books/${book.id}`)} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )
      )}

      {/* ── Modal Adicionar Livro ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-bg-card border border-border-base rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Passo 1: Busca no Google Books */}
            {modalStep === 'search' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-t1">Adicionar Livro</h2>
                  <button onClick={closeModal} className="text-t3 hover:text-t1 text-xl leading-none">×</button>
                </div>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Título ou autor..."
                    className="flex-1 bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-t1 text-sm font-medium rounded-lg transition-colors"
                  >
                    {searching ? '...' : 'Buscar'}
                  </button>
                </div>

                {addError && <p className="text-red-400 text-sm mb-3">{addError}</p>}

                {searching && (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-border-light border-t-t3 rounded-full animate-spin" />
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {searchResults.map((result) => (
                      <div key={result.google_books_id} className="flex items-center gap-3 bg-bg-elevated rounded-lg p-3">
                        {result.cover_url ? (
                          <img src={result.cover_url} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-14 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                            <span className="text-t4 text-xs">📖</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-t1 text-sm font-medium truncate">{result.title}</p>
                          <p className="text-t3 text-xs truncate">{result.author}</p>
                          <p className="text-t4 text-xs mt-0.5">
                            {result.published_year && `${result.published_year} · `}
                            {result.total_pages ? `${result.total_pages} pgs` : 'Páginas desconhecidas'}
                          </p>
                        </div>
                        <button
                          onClick={() => selectSearchResult(result)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex-shrink-0 transition-colors"
                        >
                          Selecionar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!searching && searchQuery && searchResults.length === 0 && (
                  <p className="text-t4 text-sm text-center py-4">Nenhum resultado encontrado.</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-border-base mt-2">
                  <button onClick={skipToManualForm} className="text-sm text-t3 hover:text-t1 transition-colors">
                    Adicionar manualmente
                  </button>
                  <button onClick={closeModal} className="text-sm text-t3 hover:text-t1 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Passo 2: Confirmar / editar dados */}
            {modalStep === 'form' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-t1">Confirmar Livro</h2>
                  <button onClick={closeModal} className="text-t3 hover:text-t1 text-xl leading-none">×</button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-t3 mb-1">Título *</label>
                    <input
                      type="text" value={addForm.title}
                      onChange={(e) => handleFormChange('title', e.target.value)}
                      className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: Duna"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-t3 mb-1">Autor</label>
                    <input
                      type="text" value={addForm.author}
                      onChange={(e) => handleFormChange('author', e.target.value)}
                      className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: Frank Herbert"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-t3 mb-1">Total de páginas</label>
                    <input
                      type="number" min="1" value={addForm.total_pages}
                      onChange={(e) => handleFormChange('total_pages', e.target.value)}
                      className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: 412"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-t3 mb-1">Status</label>
                    <select
                      value={addForm.status}
                      onChange={(e) => handleFormChange('status', e.target.value)}
                      className="w-full bg-bg-elevated text-t1 border border-border-base rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="quero_ler">📚 Quero Ler</option>
                      <option value="estante">🏠 Estante</option>
                      <option value="wishlist">🛒 Wishlist</option>
                      <option value="lendo">📖 Lendo</option>
                      <option value="pausado">⏸️ Pausado</option>
                      <option value="lido">✅ Lido</option>
                      <option value="abandonado">❌ Abandonado</option>
                    </select>
                  </div>
                  <input type="hidden" value={addForm.google_books_id} />
                </div>

                {addError && <p className="mt-3 text-red-400 text-sm">{addError}</p>}

                <div className="flex items-center justify-between mt-5 pt-4 border-t border-border-base">
                  <button onClick={backToSearch} className="text-sm text-t3 hover:text-t1 transition-colors">
                    ← Voltar
                  </button>
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="px-4 py-2 text-sm text-t3 hover:text-t1 transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !addForm.title.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-t1 text-sm font-medium rounded-lg transition-colors"
                    >
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
