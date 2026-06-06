// Página de gerenciamento de livros — integração com o agente Frieren.
// Exibe os livros agrupados por status (lendo, quero_ler, pausado, lido, abandonado),
// com capa, progresso de leitura e estrelas de avaliação.
// Permite adicionar novos livros buscando no Google Books ou preenchendo manualmente.

import { useEffect, useState } from 'react'          // Hooks do React: estado e efeito colateral
import { useNavigate }         from 'react-router-dom' // Hook para navegar entre páginas
import { api }                 from '../lib/api'        // Wrapper de fetch autenticado com cookie

// ── Interfaces de dados ────────────────────────────────────────────────────────────────────────

// Representa um livro salvo no banco de dados (retornado por GET /api/books)
interface Book {
  id:             string          // Identificador único do livro (UUID)
  title:          string          // Título do livro
  author:         string | null   // Nome do autor (pode ser null se não informado)
  status:         string          // Estado de leitura: 'lendo' | 'quero_ler' | 'pausado' | 'lido' | 'abandonado'
  total_pages:    number | null   // Total de páginas do livro (null = desconhecido)
  current_page:   number | null   // Página atual do leitor (null = ainda não começou)
  cover_url:      string | null   // URL da capa do livro (null = sem capa disponível)
  rating:         number | null   // Avaliação de 1 a 5 (null = ainda não avaliado)
  date_started:   string | null   // Data que começou a ler (formato YYYY-MM-DD)
  date_finished:  string | null   // Data que terminou de ler (formato YYYY-MM-DD)
  genre:          string | null   // Gênero literário (ex: "Ficção científica")
  published_year: number | null   // Ano de publicação original
}

// Representa um resultado da busca no Google Books (retornado por GET /api/books/search-google)
interface GoogleBookResult {
  google_books_id: string          // ID único no catálogo do Google Books
  title:           string          // Título encontrado
  author:          string          // Autor(es) do livro
  total_pages:     number | null   // Número de páginas (pode ser null se não cadastrado)
  cover_url:       string | null   // URL da capa fornecida pelo Google Books
  published_year:  number | null   // Ano de publicação (pode ser null)
  isbn:            string | null   // Código ISBN do livro
}

// Resposta do endpoint GET /api/books
interface BooksResponse {
  status: string   // 'ok' quando a chamada teve sucesso
  books:  Book[]   // Lista de livros do usuário
}

// Resposta do endpoint GET /api/books/search-google
interface SearchResponse {
  status:  string              // 'ok' quando a busca teve sucesso
  results: GoogleBookResult[]  // Lista de resultados encontrados
}

// Resposta genérica de operações de escrita (POST)
interface MutationResponse {
  status: string  // 'ok' quando a operação foi bem-sucedida
}

// ── Tipos do formulário de adição ─────────────────────────────────────────────────────────────

// Dados do formulário de adicionar um livro
// Todos os campos são strings para compatibilidade com inputs HTML
interface AddForm {
  title:           string  // Título do livro
  author:          string  // Autor do livro
  total_pages:     string  // Número de páginas como string (input number retorna string)
  status:          string  // Status inicial de leitura
  google_books_id: string  // ID do Google Books (vazio se adição manual)
}

// Formulário vazio — usado para resetar após salvar ou cancelar
const EMPTY_ADD_FORM: AddForm = {
  title:           '',
  author:          '',
  total_pages:     '',
  status:          'quero_ler', // Status padrão: livros novos entram na fila de leitura
  google_books_id: '',
}

// ── Constantes de agrupamento ──────────────────────────────────────────────────────────────────

// Define a ordem de exibição dos grupos de status
// Livros "lendo" aparecem primeiro, pois são a prioridade atual do leitor
const STATUS_ORDER = ['lendo', 'quero_ler', 'pausado', 'lido', 'abandonado']

// Rótulos visuais com emoji para cada status
const STATUS_LABEL: Record<string, string> = {
  lendo:      '📖 LENDO',
  quero_ler:  '📚 QUERO LER',
  pausado:    '⏸️ PAUSADO',
  lido:       '✅ LIDO',
  abandonado: '❌ ABANDONADO',
}

// Classes Tailwind para o badge de status de cada livro
// Cada status tem uma cor diferente para diferenciar visualmente
const STATUS_BADGE: Record<string, string> = {
  lendo:      'bg-blue-900 text-blue-300',
  lido:       'bg-green-900 text-green-300',
  quero_ler:  'bg-purple-900 text-purple-300',
  pausado:    'bg-yellow-900 text-yellow-300',
  abandonado: 'bg-gray-700 text-gray-400',
}

// ── Funções auxiliares ─────────────────────────────────────────────────────────────────────────

/**
 * Renderiza estrelas de avaliação de 1 a 5.
 * Estrelas preenchidas (★) indicam nota; vazias (☆) completam até 5.
 *
 * Args:
 *   rating - Nota de 1 a 5, ou null se o livro ainda não foi avaliado.
 *
 * Returns:
 *   String com 5 caracteres de estrela (★ ou ☆).
 */
function renderStars(rating: number | null): string {
  // Se não há avaliação, retorna 5 estrelas vazias
  if (!rating) return '☆☆☆☆☆'
  // Constrói a string: estrelas cheias até a nota, depois vazias
  const full  = '★'.repeat(rating)
  const empty = '☆'.repeat(5 - rating)
  return full + empty
}

/**
 * Calcula o percentual de progresso de leitura.
 * Usado para renderizar a barra de progresso de livros em andamento.
 *
 * Args:
 *   current - Página atual do leitor.
 *   total   - Total de páginas do livro.
 *
 * Returns:
 *   Número entre 0 e 100 representando o percentual, ou 0 se os dados não estiverem disponíveis.
 */
function calcProgress(current: number | null, total: number | null): number {
  // Se não temos dados suficientes, progresso é zero
  if (!current || !total || total === 0) return 0
  // Garante que o resultado não ultrapasse 100% (por segurança)
  return Math.min(100, Math.round((current / total) * 100))
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de livros: lista agrupada por status, com modal de adição em dois passos.
 * Integra com o agente Frieren via rotas /api/books.
 *
 * Returns:
 *   JSX com lista de livros agrupada, cards clicáveis e modal de adição.
 */
export default function Books() {
  // Hook de navegação — usado para ir ao detalhe de um livro ao clicar no card
  const navigate = useNavigate()

  // ── Estado principal ──

  // Lista de livros carregada do backend
  const [books, setBooks] = useState<Book[]>([])

  // Indica se a lista ainda está sendo carregada (exibe spinner)
  const [loading, setLoading] = useState(true)

  // Mensagem de erro ao carregar a lista (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // ── Estado do modal ──

  // Controla se o modal "Adicionar Livro" está visível
  const [modalOpen, setModalOpen] = useState(false)

  // Passo atual do modal:
  //   'search' → usuário busca no Google Books
  //   'form'   → usuário confirma/edita os dados e salva
  const [modalStep, setModalStep] = useState<'search' | 'form'>('search')

  // ── Estado da busca no Google Books ──

  // Texto digitado no campo de busca
  const [searchQuery, setSearchQuery] = useState('')

  // Resultados retornados pela API de busca
  const [searchResults, setSearchResults] = useState<GoogleBookResult[]>([])

  // Indica se a busca está em andamento (exibe indicador de loading)
  const [searching, setSearching] = useState(false)

  // ── Estado do formulário de adição ──

  // Dados do formulário de adicionar livro (pré-preenchidos ao selecionar da busca)
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM)

  // Mensagem de erro do formulário de adição (null = sem erro)
  const [addError, setAddError] = useState<string | null>(null)

  // Indica se o formulário está sendo submetido (desabilita o botão Salvar)
  const [saving, setSaving] = useState(false)

  // ── Carregamento inicial ──
  // useEffect com array vazio [] executa apenas uma vez, quando o componente é montado na tela.
  // Isso garante que a lista de livros seja carregada automaticamente ao abrir a página.
  useEffect(() => {
    loadBooks()
  }, [])

  // ── Funções de dados ──

  /**
   * Busca a lista de livros do backend e atualiza o estado.
   * Chamada ao montar o componente e após cada adição bem-sucedida.
   */
  function loadBooks() {
    setLoading(true)
    setError(null)
    api.get<BooksResponse>('/api/books')
      .then((res) => setBooks(res.books))           // Salva a lista recebida no estado
      .catch((err: Error) => setError(err.message))  // Exibe mensagem de erro se falhar
      .finally(() => setLoading(false))              // Remove o spinner independente do resultado
  }

  /**
   * Busca livros no Google Books com o texto digitado.
   * Chama GET /api/books/search-google?q=<searchQuery>.
   */
  async function handleSearch() {
    // Não faz a busca se o campo estiver vazio
    if (!searchQuery.trim()) return

    setSearching(true)
    setSearchResults([]) // Limpa resultados anteriores antes de buscar

    try {
      // Encoda o query para evitar problemas com caracteres especiais na URL
      const res = await api.get<SearchResponse>(
        `/api/books/search-google?q=${encodeURIComponent(searchQuery)}`
      )
      setSearchResults(res.results)
    } catch (err) {
      // Exibe o erro diretamente no campo addError para o usuário ver
      setAddError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  /**
   * Pré-preenche o formulário com os dados de um resultado da busca e avança para o Passo 2.
   * Chamada quando o usuário clica em "Selecionar" em um resultado do Google Books.
   *
   * Args:
   *   result - O resultado do Google Books selecionado pelo usuário.
   */
  function selectSearchResult(result: GoogleBookResult) {
    setAddForm({
      title:           result.title,
      author:          result.author,
      total_pages:     result.total_pages != null ? String(result.total_pages) : '',
      status:          'quero_ler',       // Padrão ao adicionar: entra na fila de leitura
      google_books_id: result.google_books_id,
    })
    setAddError(null)
    setModalStep('form') // Avança para a tela de confirmação/edição dos dados
  }

  /**
   * Submete o formulário de adição: chama POST /api/books com os dados preenchidos.
   * Fecha o modal e recarrega a lista em caso de sucesso.
   */
  async function handleSave() {
    setAddError(null)
    setSaving(true)

    try {
      // Monta o payload enviado ao backend.
      // total_pages é convertido de string para número (ou null se vazio).
      await api.post<MutationResponse>('/api/books', {
        title:           addForm.title,
        author:          addForm.author || undefined,   // Omite se vazio (campo opcional)
        total_pages:     addForm.total_pages ? parseInt(addForm.total_pages, 10) : undefined,
        status:          addForm.status,
        google_books_id: addForm.google_books_id || undefined, // Omite se adição manual
      })
      // Adição bem-sucedida: fecha o modal e atualiza a lista de livros
      closeModal()
      loadBooks()
    } catch (err) {
      // Exibe o erro no modal para o usuário poder corrigir e tentar novamente
      setAddError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Funções do modal ──

  /**
   * Abre o modal de adição, resetando todo o estado para o passo inicial de busca.
   */
  function openModal() {
    setModalStep('search')        // Sempre começa no passo de busca
    setSearchQuery('')            // Limpa o campo de busca anterior
    setSearchResults([])          // Limpa resultados anteriores
    setAddForm(EMPTY_ADD_FORM)    // Reseta o formulário
    setAddError(null)             // Limpa mensagens de erro
    setModalOpen(true)
  }

  /**
   * Fecha o modal e limpa todo o estado relacionado a ele.
   */
  function closeModal() {
    setModalOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setAddForm(EMPTY_ADD_FORM)
    setAddError(null)
  }

  /**
   * Permite pular a etapa de busca e ir direto ao formulário manual.
   * Útil para adicionar um livro que não aparece nos resultados do Google Books.
   */
  function skipToManualForm() {
    setAddForm(EMPTY_ADD_FORM) // Garante formulário vazio para preenchimento manual
    setAddError(null)
    setModalStep('form')
  }

  /**
   * Volta ao passo de busca a partir do formulário.
   * Permite refazer a busca se o usuário escolheu o livro errado.
   */
  function backToSearch() {
    setModalStep('search')
    setAddError(null)
  }

  /**
   * Atualiza um campo específico do formulário de adição quando o usuário digita.
   *
   * Args:
   *   field - Nome do campo a atualizar.
   *   value - Novo valor digitado pelo usuário.
   */
  function handleFormChange(field: keyof AddForm, value: string) {
    // Usa o padrão spread (...prev) para atualizar só o campo alterado,
    // preservando os demais campos do formulário
    setAddForm((prev) => ({ ...prev, [field]: value }))
  }

  // ── Agrupamento de livros por status ──

  // Agrupa os livros segundo a ordem definida em STATUS_ORDER.
  // Grupos sem livros são filtrados (não aparecem na tela).
  const grouped = STATUS_ORDER
    .map((s) => ({
      status: s,
      label:  STATUS_LABEL[s],                      // Rótulo com emoji para o cabeçalho do grupo
      items:  books.filter((b) => b.status === s),  // Filtra apenas os livros deste status
    }))
    .filter((g) => g.items.length > 0) // Remove grupos vazios para não poluir a interface

  // ── Renderização ──

  return (
    // Container principal da página — espaço vertical entre seções
    <div className="space-y-6">

      {/* ── Cabeçalho da página ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Livros</h1>
        {/* Botão para abrir o modal de adição */}
        <button
          onClick={openModal}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Adicionar Livro
        </button>
      </div>

      {/* ── Estado de carregamento ── */}
      {/* Exibe um spinner animado enquanto a lista está sendo carregada do backend */}
      {loading && (
        <div className="flex justify-center py-12">
          {/* Círculo com borda parcial que gira — técnica comum para spinners em Tailwind */}
          <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* ── Mensagem de erro ao carregar ── */}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {/* ── Estado vazio: nenhum livro cadastrado ── */}
      {!loading && !error && books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <span className="text-4xl mb-3">📚</span>
          <p className="text-sm">Nenhum livro cadastrado ainda.</p>
          <p className="text-sm">Clique em "Adicionar Livro" para começar.</p>
        </div>
      )}

      {/* ── Lista de livros agrupada por status ── */}
      {/* Só renderiza quando o carregamento terminou, sem erros e com livros */}
      {!loading && !error && grouped.map((group) => (
        <div key={group.status} className="space-y-3">

          {/* Cabeçalho do grupo — ex: "📖 LENDO" */}
          <h2 className="text-xs font-semibold text-gray-400 tracking-widest uppercase">
            {group.label}
          </h2>

          {/* Lista de cards de livros deste grupo */}
          <div className="space-y-2">
            {group.items.map((book) => (
              // Card do livro — clicável, navega para a página de detalhe
              <div
                key={book.id}
                onClick={() => navigate(`/books/${book.id}`)}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-gray-600 cursor-pointer transition-colors"
              >

                {/* ── Capa do livro ── */}
                {book.cover_url ? (
                  // Exibe a capa real se a URL estiver disponível
                  <img
                    src={book.cover_url}
                    alt={`Capa de ${book.title}`}
                    className="w-12 h-16 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  // Placeholder cinza quando não há capa disponível
                  // flex-shrink-0 evita que o placeholder encolha com textos longos
                  <div className="w-12 h-16 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-500 text-xs">📖</span>
                  </div>
                )}

                {/* ── Informações do livro ── */}
                <div className="flex-1 min-w-0">
                  {/* min-w-0 é necessário para que o texto truncate funcione corretamente em flex */}

                  {/* Título e badge de status na mesma linha */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Título truncado para não quebrar o layout em títulos longos */}
                    <span className="text-white font-medium text-sm truncate">
                      {book.title}
                    </span>
                    {/* Badge colorido indicando o status de leitura */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                      STATUS_BADGE[book.status] ?? 'bg-gray-700 text-gray-400'
                    }`}>
                      {book.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Nome do autor */}
                  {book.author && (
                    <p className="text-gray-400 text-xs mt-0.5 truncate">
                      {book.author}
                    </p>
                  )}

                  {/* ── Barra de progresso — apenas para livros em andamento ── */}
                  {book.status === 'lendo' && (
                    <div className="mt-2 space-y-1">
                      {/* Trilha cinza da barra; a barra azul interna representa o progresso */}
                      <div className="bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${calcProgress(book.current_page, book.total_pages)}%` }}
                        />
                      </div>
                      {/* Texto auxiliar com página atual e total */}
                      <p className="text-gray-500 text-xs">
                        {book.current_page ?? 0} / {book.total_pages ?? '?'} páginas
                        {' '}({calcProgress(book.current_page, book.total_pages)}%)
                      </p>
                    </div>
                  )}

                  {/* ── Estrelas de avaliação — apenas para livros lidos ── */}
                  {book.status === 'lido' && (
                    <p className="text-yellow-400 text-sm mt-1" title={`Avaliação: ${book.rating ?? 'sem nota'}`}>
                      {renderStars(book.rating)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Modal "Adicionar Livro" ── */}
      {modalOpen && (
        // Overlay escuro sobre toda a tela.
        // Clicar fora do modal (no overlay) fecha o modal — comportamento esperado pelo usuário.
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          {/* Caixa do modal propriamente dita.
              stopPropagation impede que o clique dentro do modal propague para o overlay
              e feche o modal acidentalmente. */}
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >

            {/* ──────────────────────────────────────────────────────────────
                PASSO 1: Busca no Google Books
                O usuário digita um título/autor e vê os resultados.
                Cada resultado tem um botão "Selecionar" que avança para o Passo 2.
            ────────────────────────────────────────────────────────────── */}
            {modalStep === 'search' && (
              <div>
                {/* Título e botão de fechar */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Adicionar Livro</h2>
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
                    aria-label="Fechar modal"
                  >
                    ×
                  </button>
                </div>

                {/* Campo de busca + botão */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    // Permitir buscar pressionando Enter, além do botão
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Título ou autor..."
                    className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {searching ? '...' : 'Buscar'}
                  </button>
                </div>

                {/* Mensagem de erro da busca */}
                {addError && (
                  <p className="text-red-400 text-sm mb-3">{addError}</p>
                )}

                {/* Indicador de busca em andamento */}
                {searching && (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                  </div>
                )}

                {/* Lista de resultados retornados pelo Google Books */}
                {!searching && searchResults.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {searchResults.map((result) => (
                      <div
                        key={result.google_books_id}
                        className="flex items-center gap-3 bg-gray-800 rounded-lg p-3"
                      >
                        {/* Capa miniatura do resultado */}
                        {result.cover_url ? (
                          <img
                            src={result.cover_url}
                            alt={`Capa de ${result.title}`}
                            className="w-10 h-14 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          // Placeholder se não houver capa no Google Books
                          <div className="w-10 h-14 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                            <span className="text-gray-500 text-xs">📖</span>
                          </div>
                        )}

                        {/* Informações do resultado */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{result.title}</p>
                          <p className="text-gray-400 text-xs truncate">{result.author}</p>
                          {/* Informações secundárias: ano e número de páginas */}
                          <p className="text-gray-500 text-xs mt-0.5">
                            {result.published_year && `${result.published_year} · `}
                            {result.total_pages ? `${result.total_pages} pgs` : 'Páginas desconhecidas'}
                          </p>
                        </div>

                        {/* Botão de selecionar este resultado */}
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

                {/* Mensagem quando a busca não retornou resultados */}
                {!searching && searchQuery && searchResults.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">
                    Nenhum resultado encontrado.
                  </p>
                )}

                {/* Rodapé do Passo 1: opção de adicionar manualmente e botão cancelar */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-800 mt-2">
                  <button
                    onClick={skipToManualForm}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Adicionar manualmente
                  </button>
                  <button
                    onClick={closeModal}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* ──────────────────────────────────────────────────────────────
                PASSO 2: Confirmar / editar dados e salvar
                O formulário pode estar pré-preenchido (vindo da busca) ou vazio (manual).
            ────────────────────────────────────────────────────────────── */}
            {modalStep === 'form' && (
              <div>
                {/* Título do passo com botão de fechar */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Confirmar Livro</h2>
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
                    aria-label="Fechar modal"
                  >
                    ×
                  </button>
                </div>

                {/* Campos do formulário */}
                <div className="space-y-3">

                  {/* Campo: Título */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Título *</label>
                    <input
                      type="text"
                      value={addForm.title}
                      onChange={(e) => handleFormChange('title', e.target.value)}
                      className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: Duna"
                    />
                  </div>

                  {/* Campo: Autor */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Autor</label>
                    <input
                      type="text"
                      value={addForm.author}
                      onChange={(e) => handleFormChange('author', e.target.value)}
                      className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: Frank Herbert"
                    />
                  </div>

                  {/* Campo: Total de páginas */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Total de páginas</label>
                    <input
                      type="number"
                      min="1"
                      value={addForm.total_pages}
                      onChange={(e) => handleFormChange('total_pages', e.target.value)}
                      className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: 412"
                    />
                  </div>

                  {/* Campo: Status inicial de leitura */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Status</label>
                    <select
                      value={addForm.status}
                      onChange={(e) => handleFormChange('status', e.target.value)}
                      className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    >
                      {/* Opções de status disponíveis no sistema */}
                      <option value="quero_ler">Quero Ler</option>
                      <option value="lendo">Lendo</option>
                      <option value="pausado">Pausado</option>
                      <option value="lido">Lido</option>
                      <option value="abandonado">Abandonado</option>
                    </select>
                  </div>

                  {/* Campo oculto: ID do Google Books (não exibido, mas enviado no POST)
                      Vazio quando o livro foi adicionado manualmente. */}
                  <input
                    type="hidden"
                    value={addForm.google_books_id}
                  />

                </div>

                {/* Mensagem de erro do formulário de adição */}
                {addError && (
                  <p className="mt-3 text-red-400 text-sm">{addError}</p>
                )}

                {/* Botões de ação do Passo 2 */}
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-800">
                  {/* Voltar para a busca — permite corrigir a seleção */}
                  <button
                    onClick={backToSearch}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    ← Voltar
                  </button>

                  {/* Botões direitos: cancelar e salvar */}
                  <div className="flex gap-3">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !addForm.title.trim()} // Não salva sem título
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {/* Texto muda enquanto está salvando para dar feedback ao usuário */}
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
