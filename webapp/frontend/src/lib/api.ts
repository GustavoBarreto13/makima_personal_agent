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
}
