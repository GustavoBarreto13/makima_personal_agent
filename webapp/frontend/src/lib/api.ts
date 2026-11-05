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
 * Base da API. Vazia no site (mesma origem do servidor: `/api/...` funciona direto).
 * No app Android o `dist/` roda do próprio aparelho, então as chamadas precisam do endereço
 * absoluto do servidor — definido no build por `VITE_API_BASE_URL` (ex.: https://makima.exemplo.com).
 */
let apiBase = normalizeBase(import.meta.env?.VITE_API_BASE_URL)

/** Tira espaços e a barra final ("https://x.com/" → "https://x.com"). */
function normalizeBase(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

/** Troca a base da API em tempo de execução (o app nativo e os testes usam). */
export function setApiBase(url: string): void {
  apiBase = normalizeBase(url)
}

/**
 * Monta a URL final de uma rota do backend.
 * Caminhos relativos ("/api/...") ganham a base; URLs absolutas passam intactas.
 * Use também para `src` de imagens servidas pelo backend (ex.: `/uploads/...`) no app.
 *
 * @example apiUrl('/api/hub/summary') // site: '/api/hub/summary' · app: 'https://x.com/api/hub/summary'
 */
export function apiUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${apiBase}${path}`
}

/** Quem fornece o token de acesso do app (bearer). No site fica sem provedor e vale o cookie. */
type TokenProvider = () => string | null | Promise<string | null>
let tokenProvider: TokenProvider | null = null

/**
 * Registra a função que devolve o token de acesso atual (o app nativo a define no início).
 * Pode ser assíncrona: é o lugar certo para renovar o token expirado antes de cada chamada.
 * Passe `null` para voltar ao modo cookie.
 */
export function setAuthTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider
}

/**
 * `fetch` do projeto: aplica a base da API, envia o cookie de sessão e, se houver token do app,
 * o cabeçalho `Authorization: Bearer`. Todo acesso ao backend deve passar por aqui
 * (inclusive uploads multipart, que o `api.post` — só JSON — não cobre).
 *
 * @param path - Rota do backend (ex.: '/api/finances/uploads/icon')
 * @param init - Opções do fetch (método, corpo, cabeçalhos…)
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = tokenProvider ? await tokenProvider() : null
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(apiUrl(path), { ...init, headers, credentials: 'include' })
}

/**
 * Erro de uma resposta HTTP malsucedida. Carrega o `status` para quem precisa distinguir
 * "sessão inválida" (401/403) de "servidor/rede fora do ar" (sem status, ou 5xx).
 */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Extrai a mensagem de erro de uma resposta HTTP malsucedida.
 *
 * O backend (FastAPI) devolve erros como JSON {"detail": "mensagem"}. Esta
 * função lê esse `detail` para que o usuário veja a mensagem amigável do
 * servidor (ex.: "Data inválida. Use MM-DD..."), em vez de um genérico
 * "HTTP 400". Cai para "HTTP <status>" se o corpo não for o JSON esperado.
 *
 * @param res - Resposta fetch com res.ok === false
 * @returns Error com a mensagem mais informativa disponível
 */
async function errorFromResponse(res: Response): Promise<ApiError> {
  try {
    const data: any = await res.json()
    // FastAPI usa a chave "detail"; aceita também um corpo string direto
    const msg =
      typeof data?.detail === 'string'
        ? data.detail
        : typeof data === 'string'
          ? data
          : null
    if (msg) return new ApiError(msg, res.status)
  } catch {
    // corpo vazio ou não-JSON — usa o fallback genérico abaixo
  }
  return new ApiError(`HTTP ${res.status}`, res.status)
}

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
    const res = await authFetch(path)

    // Se o servidor retornou um erro (4xx, 5xx), lança uma exceção com o código HTTP
    if (!res.ok) throw await errorFromResponse(res)

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
    const res = await authFetch(path, {
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
    if (!res.ok) throw await errorFromResponse(res)

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
    const res = await authFetch(path, {
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
    if (!res.ok) throw await errorFromResponse(res)

    // Deserializa e retorna o JSON da resposta como o tipo T informado
    return res.json() as Promise<T>
  },

  /**
   * Faz uma requisição PUT autenticada com corpo JSON.
   * Usado para substituir/atualizar um recurso existente por inteiro (ex: salvar um formulário completo).
   *
   * @param path - Caminho da rota no backend (ex: '/api/tasks/goals/123')
   * @param body - Objeto que será convertido para JSON e enviado no corpo
   * @returns Promise com o corpo da resposta deserializado como tipo T
   * @throws Error se a resposta HTTP não for 2xx
   */
  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await authFetch(path, {
      method: 'PUT',
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
    if (!res.ok) throw await errorFromResponse(res)

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
    const res = await authFetch(path, {
      method: 'DELETE',
      // Envia o cookie de sessão junto com a requisição
      credentials: 'include',
      // DELETE não envia corpo — o recurso a deletar é identificado pela URL
    })

    // Se o servidor retornou um erro (4xx, 5xx), lança uma exceção com o código HTTP
    if (!res.ok) throw await errorFromResponse(res)

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
