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
  }>,
): Promise<{ status: string; message: string }> {
  // Usa o método PATCH do objeto api para fazer a requisição autenticada.
  // O api.patch já trata credenciais (cookie), headers (Content-Type),
  // JSON serialization e validação de resposta HTTP.
  return api.patch<{ status: string; message: string }>(`/api/books/${bookId}/metadata`, data)
}
