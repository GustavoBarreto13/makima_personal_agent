/**
 * Wrapper tipado para chamadas à API do backend Makima.
 *
 * Todas as requisições incluem `credentials: 'include'` para que o navegador
 * envie automaticamente o cookie de sessão `makima_session` em cada chamada.
 * Sem isso, os cookies não seriam enviados em requisições fetch por padrão.
 *
 * Usage:
 *   import { api } from '@/lib/api'
 *   const user = await api.get<{ email: string; name: string }>('/auth/me')
 */

/**
 * Objeto principal de chamadas à API.
 * Encapsula `fetch` com configurações padrão de autenticação via cookie.
 */
export const api = {
  /**
   * Faz uma requisição GET autenticada.
   *
   * @param path - Caminho da rota no backend (ex: '/auth/me')
   * @returns Promise com o corpo da resposta deserializado como tipo T
   * @throws Error se a resposta HTTP não for 2xx
   */
  get: async <T>(path: string): Promise<T> => {
    // credentials: 'include' instrui o navegador a enviar os cookies de sessão.
    // Sem isso, o cookie makima_session seria ignorado e todas as rotas protegidas
    // retornariam 401.
    const res = await fetch(path, { credentials: 'include' })

    // Se o servidor retornou um erro (4xx, 5xx), lança uma exceção com o código HTTP
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // Deserializa e retorna o JSON da resposta como o tipo T informado
    return res.json() as Promise<T>
  },

  /**
   * Faz uma requisição POST autenticada com corpo JSON.
   *
   * @param path - Caminho da rota no backend (ex: '/api/transacoes')
   * @param body - Dados a enviar no corpo da requisição (serão convertidos para JSON)
   * @returns Promise com o corpo da resposta deserializado como tipo T
   * @throws Error se a resposta HTTP não for 2xx
   */
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        // Informa ao servidor que o corpo da requisição é JSON
        'Content-Type': 'application/json',
      },
      // Envia o cookie de sessão junto com a requisição
      credentials: 'include',
      // Converte o objeto JavaScript em string JSON para o corpo HTTP
      body: JSON.stringify(body),
    })

    // Se o servidor retornou um erro (4xx, 5xx), lança uma exceção com o código HTTP
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // Deserializa e retorna o JSON da resposta como o tipo T informado
    return res.json() as Promise<T>
  },

  /**
   * Faz uma requisição PATCH autenticada com corpo JSON.
   * Usado para atualizações parciais de recursos existentes (ex: alterar status de assinatura).
   *
   * @param path - Caminho da rota no backend (ex: '/api/finances/subscriptions/123')
   * @param body - Campos a atualizar (serão convertidos para JSON)
   * @returns Promise com o corpo da resposta deserializado como tipo T
   * @throws Error se a resposta HTTP não for 2xx
   */
  patch: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(path, {
      method: 'PATCH',
      headers: {
        // Informa ao servidor que o corpo da requisição é JSON
        'Content-Type': 'application/json',
      },
      // Envia o cookie de sessão junto com a requisição
      credentials: 'include',
      // Converte o objeto JavaScript em string JSON para o corpo HTTP
      body: JSON.stringify(body),
    })

    // Se o servidor retornou um erro (4xx, 5xx), lança uma exceção com o código HTTP
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // Deserializa e retorna o JSON da resposta como o tipo T informado
    return res.json() as Promise<T>
  },

  /**
   * Faz uma requisição DELETE autenticada.
   * Usado para remover recursos no backend (ex: deletar uma transação).
   * Não envia corpo — apenas o identificador do recurso fica na URL.
   *
   * @param path - Caminho da rota no backend com o ID do recurso (ex: '/api/finances/transactions/456')
   * @returns Promise com o corpo da resposta deserializado como tipo T
   * @throws Error se a resposta HTTP não for 2xx
   */
  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<T>
  },

  del: async <T>(path: string): Promise<T> => {
    const res = await fetch(path, {
      method: 'DELETE',
      // Envia o cookie de sessão junto com a requisição
      credentials: 'include',
      // DELETE não envia corpo — o recurso a deletar é identificado pela URL
    })

    // Se o servidor retornou um erro (4xx, 5xx), lança uma exceção com o código HTTP
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    // 204 No Content: o servidor confirmou a deleção mas não retorna corpo JSON.
    // Tentar chamar res.json() aqui causaria erro de parse; retornamos objeto vazio.
    if (res.status === 204) return {} as T

    // Deserializa e retorna o JSON da resposta como o tipo T informado
    return res.json() as Promise<T>
  },
}

/**
 * Atualiza os metadados de um livro no backend.
 *
 * Envia uma requisição PATCH para o endpoint `/api/books/{bookId}/metadata`
 * com os campos a atualizar. Apenas os campos fornecidos serão atualizados;
 * os demais mantêm seus valores anteriores.
 *
 * @param bookId - Identificador único do livro (UUID)
 * @param data - Objeto com os campos de metadado a atualizar (todos opcionais)
 * @returns Promise com `{ status: "ok", message: string }` em caso de sucesso
 * @throws Error se a resposta HTTP não for 2xx
 *
 * Example:
 *   >>> await updateBookMetadata("abc123", { title: "Novo Título", cover_url: "https://..." })
 *   { status: "ok", message: "✅ Livro atualizado com sucesso." }
 */
export async function updateBookMetadata(
  bookId: string,
  data: Partial<{
    title: string
    author: string
    cover_url: string
    total_pages: number
    genre: string
    published_year: number
    isbn: string
    language: string
    description: string
    notes: string          // Notas pessoais do leitor sobre o livro
    store_url: string      // URL do anúncio na loja (Amazon, Estante Virtual, etc.)
    price: number          // Preço visto na loja (wishlist)
  }>,
): Promise<{ status: string; message: string }> {
  // Usa o método PATCH do objeto api para fazer a requisição autenticada.
  // O api.patch já trata credenciais (cookie), headers (Content-Type),
  // JSON serialization e validação de resposta HTTP.
  return api.patch<{ status: string; message: string }>(`/api/books/${bookId}/metadata`, data)
}

// ── Violet · Diário — API client ─────────────────────────────────────────

/**
 * Objeto com todos os métodos da API do diário (Violet).
 * Espelha o padrão do booksApi — centraliza os endpoints em um único lugar.
 */
export const violetApi = {
  /** Busca ou cria a page de uma data; retorna {page, bullets} */
  page: (date: string) =>
    api.get<{ page: Record<string, unknown>; bullets: unknown[] }>(`/api/journal/page?date=${date}`),

  /** Upsert de um bullet */
  upsertBullet: (body: { page_id: number; position: number; content: string; kind?: string }) =>
    api.post<{ status: string; bullet: Record<string, unknown> }>('/api/journal/bullets', body),

  /** Deleta um bullet pelo ID */
  deleteBullet: (id: number) =>
    api.del<{ status: string }>(`/api/journal/bullets/${id}`),

  /** Atualiza o campo dream de uma page */
  setDream: (page_id: number, dream: string) =>
    api.put<{ status: string }>('/api/journal/page/dream', { page_id, dream }),

  /** Heatmap de palavras por dia para o ano */
  heatmap: (year: number) =>
    api.get<Record<string, number>>(`/api/journal/heatmap?year=${year}`),

  /** Lista @pessoas ou #tags com contagem */
  mentions: (kind: 'person' | 'tag') =>
    api.get<{ value: string; count: number }[]>(`/api/journal/mentions?kind=${kind}`),

  /** Bullets que mencionam uma pessoa ou tag */
  filter: (kind: 'person' | 'tag', value: string) =>
    api.get<unknown[]>(`/api/journal/filter?kind=${kind}&value=${encodeURIComponent(value)}`),

  /** Busca full-text */
  search: (q: string) =>
    api.get<unknown[]>(`/api/journal/search?q=${encodeURIComponent(q)}`),

  /** Bullets de uma coleção (highlight/dream/idea/wisdom/note) */
  collection: (kind: string) =>
    api.get<unknown[]>(`/api/journal/collection/${kind}`),

  /** Entries com campo dream não nulo */
  dreams: () =>
    api.get<unknown[]>('/api/journal/dreams'),

  /** Estatísticas agregadas do ano */
  stats: (year: number) =>
    api.get<Record<string, unknown>>(`/api/journal/stats?year=${year}`),

  /** Entries resumidas para o arquivo (Journal screen) */
  entries: (q = '') =>
    api.get<unknown[]>(`/api/journal/entries${q ? `?q=${encodeURIComponent(q)}` : ''}`),
}

// ── Tipos da seção Frieren ─────────────────────────────────────────────────

// Formato exato que o backend retorna para cada livro na listagem
export interface ApiBook {
  id: string
  title: string
  author: string
  total_pages: number | null
  status: string               // valor português: lendo, lido, quero_ler, etc.
  cover_url: string | null
  date_started: string | null  // ISO date YYYY-MM-DD
  date_finished: string | null
  current_page: number | null  // MAX(page_end) do último log de leitura
  rating: number | null
  genre: string | null
  isbn: string | null
  published_year: number | null
  shelves: string[]
  notes: string | null         // só presente no endpoint de detalhe do livro
  store_url: string | null     // só presente no endpoint de detalhe do livro
}

// Formato de uma estante retornada pelo backend
export interface ApiShelf {
  id: string
  name: string
  description: string
  accent: string
  book_count: number
}

// Entrada do histórico de atividade de leitura
export interface ApiActivityEntry {
  id: string
  date: string
  book_id: string
  title: string
  author: string
  type: string
  pages: number | null
  page: number | null
  note: string | null
  rating: number | null
}

// Um dia no heatmap de leitura (páginas lidas por data)
export interface ApiHeatmapDay { date: string; pages: number }

// Resultado de busca na Google Books API (retornado por GET /api/books/search-google).
// Espelha exatamente o dict montado por _fetch_google_books no backend (tools.py:331).
export interface GoogleBookResult {
  google_books_id: string
  title: string
  author: string
  total_pages: number | null
  isbn: string | null
  cover_url: string | null
  description: string
  genre: string
  language: string
  published_year: number | null
}

// ── Funções tipadas da API de livros ─────────────────────────────────────────

/**
 * Objeto com todos os métodos da API de livros (Frieren).
 * Centraliza os endpoints em um único lugar para facilitar manutenção.
 */
export const booksApi = {
  /** Lista todos os livros com estantes, página atual e metadados básicos */
  list: () =>
    api.get<{ books: ApiBook[] }>('/api/books'),

  /** Retorna os detalhes completos de um livro específico pelo ID */
  get: (id: string) =>
    api.get<ApiBook>(`/api/books/${id}`),

  /** Retorna as últimas N entradas do histórico de leitura */
  activity: (limit = 50) =>
    api.get<{ activity: ApiActivityEntry[] }>(`/api/books/activity?limit=${limit}`),

  /** Retorna o heatmap de páginas lidas por dia. Se year não informado, usa o ano atual */
  heatmap: (year?: number) =>
    api.get<{ heatmap: ApiHeatmapDay[] }>(`/api/books/heatmap${year ? `?year=${year}` : ''}`),

  /** Lista todas as estantes do usuário */
  shelves: () =>
    api.get<{ shelves: ApiShelf[] }>('/api/books/shelves'),

  /** Cria uma nova estante */
  createShelf: (body: { name: string; description?: string; accent?: string }) =>
    api.post<{ id: string }>('/api/books/shelves', body),

  /** Atualiza nome, descrição ou cor de uma estante */
  updateShelf: (id: string, body: { name?: string; description?: string; accent?: string }) =>
    api.patch<{ status: string }>(`/api/books/shelves/${id}`, body),

  /** Remove uma estante pelo ID */
  deleteShelf: (id: string) =>
    api.del<Record<string, never>>(`/api/books/shelves/${id}`),

  /** Adiciona um livro a uma estante */
  addToShelf: (shelfId: string, bookId: string) =>
    api.post<Record<string, never>>(`/api/books/shelves/${shelfId}/books/${bookId}`, {}),

  /** Remove um livro de uma estante */
  removeFromShelf: (shelfId: string, bookId: string) =>
    api.del<Record<string, never>>(`/api/books/shelves/${shelfId}/books/${bookId}`),

  /** Registra uma sessão de leitura.
   *  Os nomes dos campos batem exatamente com o LogReadingBody do backend:
   *  current_page (obrigatório), session_notes e log_date (opcionais). */
  logReading: (
    bookId: string,
    body: { current_page: number; session_notes?: string; log_date?: string },
  ) =>
    api.post<{ status: string; message: string }>(`/api/books/${bookId}/log`, body),

  /** Marca um livro como lido, com avaliação e data de conclusão opcionais.
   *  Usa o endpoint POST /api/books/{id}/finish que já existe no backend. */
  finish: (
    bookId: string,
    body: { rating?: number; notes?: string; date_finished?: string; date_started?: string },
  ) =>
    api.post<{ status: string; message: string }>(`/api/books/${bookId}/finish`, body),

  /** Atualiza o status de um livro (ex: "lendo" → "lido") */
  updateStatus: (bookId: string, status: string) =>
    api.patch<{ status: string; message: string }>(`/api/books/${bookId}/status`, { status }),

  /** Atualiza metadados pessoais: URL da loja, notas e avaliação */
  updateMetadata: (bookId: string, data: Partial<{ store_url: string; notes: string; rating: number }>) =>
    api.patch<{ status: string; message: string }>(`/api/books/${bookId}/metadata`, data),

  /** Busca livros na Google Books API por título, autor ou ISBN (até 8 resultados) */
  searchGoogle: (q: string) =>
    api.get<{ status: string; results: GoogleBookResult[] }>(
      `/api/books/search-google?q=${encodeURIComponent(q)}`,
    ),

  /** Adiciona um livro ao catálogo. status deve ser em português (padrão "quero_ler").
   *  Enriquece metadados via Google Books API se google_books_id for fornecido. */
  addBook: (body: {
    title: string
    status?: string
    google_books_id?: string
    author?: string
    total_pages?: number
  }) =>
    api.post<{ status: string; message: string }>('/api/books', body),

  /** Remove um livro do catálogo (soft delete — marca deleted=TRUE no banco) */
  deleteBook: (bookId: string) =>
    api.del<{ status: string; message: string }>(`/api/books/${bookId}`),
}
