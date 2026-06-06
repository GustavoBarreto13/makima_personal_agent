// Página de detalhe de um livro — integração com o agente Frieren.
// Exibe informações completas do livro (capa, status, progresso, avaliação),
// permite registrar sessões de leitura, concluir o livro, mudar o status
// e visualiza o histórico cronológico de todas as sessões registradas.
// Também oferece edição inline de todos os metadados do livro.

import { useEffect, useState } from 'react'          // Hooks do React: estado e efeito colateral
import { useParams, useNavigate } from 'react-router-dom' // Hooks para pegar o ID da URL e navegar

import { api, updateBookMetadata } from '../lib/api'  // Wrapper de fetch autenticado + função de edição

// ── Interfaces de dados ────────────────────────────────────────────────────────────────────────

// Representa um livro completo retornado por GET /api/books/:id
interface Book {
  id:             string          // Identificador único do livro (UUID)
  title:          string          // Título do livro
  author:         string | null   // Nome do autor (null se não informado)
  status:         string          // Estado de leitura: 'lendo' | 'quero_ler' | 'pausado' | 'lido' | 'abandonado'
  total_pages:    number | null   // Total de páginas (null = desconhecido)
  current_page:   number | null   // Página atual do leitor (null = ainda não começou)
  cover_url:      string | null   // URL da capa (null = sem capa)
  rating:         number | null   // Avaliação de 1 a 5 (null = não avaliado)
  date_started:   string | null   // Data de início da leitura (YYYY-MM-DD)
  date_finished:  string | null   // Data de conclusão (YYYY-MM-DD)
  genre:          string | null   // Gênero literário
  published_year: number | null   // Ano de publicação original
  isbn:           string | null   // Código ISBN do livro
  language:       string | null   // Idioma do livro (null se não informado)
  description:    string | null   // Sinopse/descrição do livro (null se não informada)
  notes:          string | null   // Notas pessoais do leitor (null se não há notas)
}

// Representa uma sessão de leitura no histórico
// Cada entrada corresponde a uma vez que o usuário registrou progresso no livro
interface ReadingLog {
  date:          string        // Data da sessão (YYYY-MM-DD)
  page_start:    number        // Página onde a sessão começou
  page_end:      number        // Página onde a sessão terminou
  pages_read:    number        // Total de páginas lidas nesta sessão
  session_notes: string | null // Anotações opcionais do leitor sobre a sessão
}

// Resposta do endpoint GET /api/books/:id
interface BookResponse {
  status: string  // 'ok' quando a chamada teve sucesso
  book:   Book    // Dados completos do livro
}

// Resposta do endpoint GET /api/books/:id/history
interface HistoryResponse {
  status: string       // 'ok' quando a chamada teve sucesso
  logs:   ReadingLog[] // Lista de sessões em ordem cronológica
}

// Resposta genérica de operações de escrita (POST/PATCH)
interface MutationResponse {
  status: string  // 'ok' quando a operação foi bem-sucedida
}

// ── Constantes visuais ─────────────────────────────────────────────────────────────────────────

// Classes Tailwind para o badge de cada status — mesmas cores usadas em Books.tsx
// para manter consistência visual entre as páginas
const STATUS_BADGE: Record<string, string> = {
  lendo:      'bg-blue-900 text-blue-300',
  lido:       'bg-green-900 text-green-300',
  quero_ler:  'bg-purple-900 text-purple-300',
  pausado:    'bg-yellow-900 text-yellow-300',
  abandonado: 'bg-gray-700 text-gray-400',
}

// ── Funções auxiliares ─────────────────────────────────────────────────────────────────────────

/**
 * Retorna a data de hoje no formato YYYY-MM-DD.
 * Usada como valor padrão nos campos de data dos formulários.
 *
 * Returns:
 *   String no formato "YYYY-MM-DD".
 *
 * Example:
 *   >>> todayISO()
 *   "2026-06-06"
 */
function todayISO(): string {
  // toISOString() retorna "2026-06-06T00:00:00.000Z" — pegamos só a parte da data
  return new Date().toISOString().split('T')[0]
}

/**
 * Formata uma data ISO (YYYY-MM-DD) para o padrão brasileiro (DD/MM/YYYY).
 * Faz o split por string para evitar erros de fuso horário que surgem com new Date().
 *
 * Args:
 *   iso - Data no formato "YYYY-MM-DD".
 *
 * Returns:
 *   String no formato "DD/MM/YYYY", ou traço "-" se a data for nula/vazia.
 *
 * Example:
 *   >>> formatDate("2026-05-01")
 *   "01/05/2026"
 */
function formatDate(iso: string | null): string {
  // Se não há data disponível, exibe um traço como placeholder
  if (!iso) return '-'
  // Separa os componentes da data para reordenar no formato brasileiro
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

/**
 * Calcula o percentual de progresso de leitura.
 *
 * Args:
 *   current - Página atual do leitor.
 *   total   - Total de páginas do livro.
 *
 * Returns:
 *   Número entre 0 e 100, ou 0 se os dados não estiverem disponíveis.
 */
function calcProgress(current: number | null, total: number | null): number {
  // Se qualquer dado estiver faltando ou total for zero, retorna zero para evitar divisão por zero
  if (!current || !total || total === 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

/**
 * Renderiza estrelas de avaliação (1 a 5).
 * Estrelas preenchidas (★) representam a nota; vazias (☆) completam até 5.
 *
 * Args:
 *   rating - Nota de 1 a 5, ou null se não avaliado.
 *
 * Returns:
 *   String com 5 caracteres de estrela.
 */
function renderStars(rating: number | null): string {
  if (!rating) return '☆☆☆☆☆'
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

// ── Componente principal ───────────────────────────────────────────────────────────────────────

/**
 * Página de detalhe de um livro com card informativo, painel de ações e timeline de sessões.
 * O ID do livro é lido da URL via useParams.
 *
 * Returns:
 *   JSX com todas as seções da página de detalhe.
 */
export default function BookDetail() {
  // Extrai o parâmetro :id da URL (ex: /books/abc-123 → id = "abc-123")
  const { id } = useParams<{ id: string }>()

  // Hook de navegação — usado para voltar à lista de livros
  const navigate = useNavigate()

  // ── Estado principal ──

  // Dados completos do livro (null enquanto não carregado)
  const [book, setBook] = useState<Book | null>(null)

  // Indica se o livro está sendo carregado do backend
  const [loading, setLoading] = useState(true)

  // Mensagem de erro ao carregar o livro (null = sem erro)
  const [error, setError] = useState<string | null>(null)

  // ── Estado do histórico de leitura ──

  // Lista de sessões de leitura registradas
  const [logs, setLogs] = useState<ReadingLog[]>([])

  // Indica se o histórico está sendo carregado
  const [loadingHistory, setLoadingHistory] = useState(true)

  // ── Estado do painel "Registrar Leitura" ──

  // Página atual que o usuário quer registrar (como string para compatibilidade com input)
  const [logPage, setLogPage] = useState('')

  // Notas opcionais da sessão de leitura
  const [logNotes, setLogNotes] = useState('')

  // Data da sessão — padrão: hoje
  const [logDate, setLogDate] = useState(todayISO())

  // Indica se o POST de log está sendo enviado (desabilita botão Salvar)
  const [savingLog, setSavingLog] = useState(false)

  // Mensagem de erro do formulário de leitura (null = sem erro)
  const [logError, setLogError] = useState<string | null>(null)

  // ── Estado do painel "Concluir Livro" ──

  // Avaliação de 1 a 5 (como string para compatibilidade com input)
  const [finishRating, setFinishRating] = useState('')

  // Notas finais sobre o livro
  const [finishNotes, setFinishNotes] = useState('')

  // Data de conclusão — padrão: hoje
  const [finishDate, setFinishDate] = useState(todayISO())

  // Indica se o POST de conclusão está sendo enviado
  const [savingFinish, setSavingFinish] = useState(false)

  // Mensagem de erro do formulário de conclusão (null = sem erro)
  const [finishError, setFinishError] = useState<string | null>(null)

  // ── Estado do painel "Mudar Status" ──

  // Novo status selecionado pelo usuário no select
  const [newStatus, setNewStatus] = useState('lendo')

  // Indica se o PATCH de status está sendo enviado
  const [savingStatus, setSavingStatus] = useState(false)

  // Mensagem de erro do formulário de status (null = sem erro)
  const [statusError, setStatusError] = useState<string | null>(null)

  // ── Estado do card informativo ──

  // Controla se a sinopse está expandida ou colapsada no card de visualização.
  // Textos longos (>200 chars) são truncados em 4 linhas por padrão.
  const [descExpanded, setDescExpanded] = useState(false)

  // Controla se o formulário de edição está visível no lugar das informações do livro
  const [isEditing, setIsEditing] = useState(false)

  // Dados do formulário de edição — pré-populados com os valores atuais do livro.
  // Armazenamos como strings para facilitar o bind com os inputs HTML.
  const [formData, setFormData] = useState({
    title:          '',
    author:         '',
    cover_url:      '',
    total_pages:    '',  // número armazenado como string para compatibilidade com <input>
    genre:          '',
    published_year: '',  // número armazenado como string para compatibilidade com <input>
    isbn:           '',
    language:       '',
    description:    '',
    notes:          '',
  })

  // Indica se o PATCH de metadados está sendo enviado (desabilita o botão Salvar)
  const [saving, setSaving] = useState(false)

  // Mensagem de erro do formulário de edição (null = sem erro)
  const [editError, setEditError] = useState<string | null>(null)

  // ── Carregamento inicial ──
  // useEffect executa ao montar o componente.
  // Carrega o livro e o histórico simultaneamente para não bloquear a interface.
  useEffect(() => {
    loadBook()
    loadHistory()
  }, [id]) // Re-executa sempre que o ID mudar (ex: navegação entre livros)

  // ── Funções de dados ──

  /**
   * Busca os dados completos do livro pelo ID e atualiza o estado.
   * Chamada ao montar o componente e após qualquer operação de escrita bem-sucedida.
   */
  function loadBook() {
    setLoading(true)
    setError(null)
    api.get<BookResponse>(`/api/books/${id}`)
      .then((res) => {
        setBook(res.book)
        // Sincroniza o select de status com o valor atual do livro
        setNewStatus(res.book.status)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Busca o histórico de sessões de leitura e atualiza o estado.
   * Chamada junto com loadBook ao montar e após registrar uma sessão.
   */
  function loadHistory() {
    setLoadingHistory(true)
    api.get<HistoryResponse>(`/api/books/${id}/history`)
      .then((res) => setLogs(res.logs))
      .catch(() => setLogs([])) // Falha silenciosa — lista vazia em caso de erro
      .finally(() => setLoadingHistory(false))
  }

  /**
   * Registra uma sessão de leitura via POST /api/books/:id/log.
   * Após sucesso, recarrega os dados do livro e o histórico.
   */
  async function handleSaveLog() {
    setLogError(null)
    setSavingLog(true)
    try {
      // Envia a página atual, as notas e a data da sessão
      await api.post<MutationResponse>(`/api/books/${id}/log`, {
        current_page:  parseInt(logPage, 10), // Converte string → número inteiro
        session_notes: logNotes || undefined,  // Omite se vazio (campo opcional)
        log_date:      logDate,
      })
      // Sucesso: limpa o formulário e recarrega tudo para refletir o novo progresso
      setLogPage('')
      setLogNotes('')
      setLogDate(todayISO())
      loadBook()
      loadHistory()
    } catch (err) {
      // Exibe o erro abaixo do formulário para o usuário corrigir
      setLogError((err as Error).message)
    } finally {
      setSavingLog(false)
    }
  }

  /**
   * Marca o livro como concluído via POST /api/books/:id/finish.
   * Permite informar a avaliação, notas finais e data de conclusão.
   */
  async function handleSaveFinish() {
    setFinishError(null)
    setSavingFinish(true)
    try {
      await api.post<MutationResponse>(`/api/books/${id}/finish`, {
        rating:        finishRating ? parseFloat(finishRating) : undefined, // Null se não informado
        notes:         finishNotes || undefined,                            // Omite se vazio
        date_finished: finishDate,
      })
      // Sucesso: limpa os campos e recarrega o livro para mostrar o novo status "lido"
      setFinishRating('')
      setFinishNotes('')
      setFinishDate(todayISO())
      loadBook()
      loadHistory()
    } catch (err) {
      setFinishError((err as Error).message)
    } finally {
      setSavingFinish(false)
    }
  }

  /**
   * Altera o status do livro via PATCH /api/books/:id/status.
   * Usado quando o leitor pausa, abandona ou retoma a leitura.
   */
  async function handleSaveStatus() {
    setStatusError(null)
    setSavingStatus(true)
    try {
      await api.patch<MutationResponse>(`/api/books/${id}/status`, {
        status: newStatus,
      })
      // Recarrega o livro para atualizar o badge de status exibido na página
      loadBook()
    } catch (err) {
      setStatusError((err as Error).message)
    } finally {
      setSavingStatus(false)
    }
  }

  /**
   * Abre o formulário de edição pré-populando os campos com os dados atuais do livro.
   * Converte números para string porque os inputs HTML trabalham com strings.
   *
   * Args:
   *   b - Dados atuais do livro usados como valores iniciais do formulário.
   */
  function openEditForm(b: Book) {
    // Preenche cada campo do formulário com o valor atual do livro (ou string vazia se null)
    setFormData({
      title:          b.title ?? '',
      author:         b.author ?? '',
      cover_url:      b.cover_url ?? '',
      total_pages:    b.total_pages != null ? String(b.total_pages) : '',
      genre:          b.genre ?? '',
      published_year: b.published_year != null ? String(b.published_year) : '',
      isbn:           b.isbn ?? '',
      language:       b.language ?? '',
      description:    b.description ?? '',
      notes:          b.notes ?? '',
    })
    // Limpa qualquer erro anterior e ativa o modo de edição
    setEditError(null)
    setIsEditing(true)
  }

  /**
   * Fecha o formulário de edição sem salvar, descartando todas as alterações.
   */
  function cancelEdit() {
    setIsEditing(false)
    setEditError(null)
  }

  /**
   * Envia os metadados editados ao backend via PATCH /api/books/:id/metadata.
   * Após sucesso, recarrega o livro para refletir as alterações no card e sai do modo de edição.
   */
  async function handleSaveMetadata() {
    setSaving(true)
    setEditError(null)
    try {
      // Monta o payload convertendo strings de volta para os tipos corretos.
      // Campos de número vazios são omitidos (undefined) para não sobrescrever com null inválido.
      await updateBookMetadata(id!, {
        title:          formData.title          || undefined,
        author:         formData.author         || undefined,
        cover_url:      formData.cover_url      || undefined,
        // Converte string → número inteiro; omite se vazio ou não numérico
        total_pages:    formData.total_pages    ? parseInt(formData.total_pages, 10)    : undefined,
        genre:          formData.genre          || undefined,
        published_year: formData.published_year ? parseInt(formData.published_year, 10) : undefined,
        isbn:           formData.isbn           || undefined,
        language:       formData.language       || undefined,
        description:    formData.description    || undefined,
        notes:          formData.notes          || undefined,
      })
      // Sucesso: recarrega o livro para exibir os novos dados e fecha o formulário
      loadBook()
      setIsEditing(false)
    } catch (err) {
      // Exibe a mensagem de erro abaixo do formulário para o usuário corrigir
      setEditError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Renderização: estado de carregamento ──

  // Spinner centralizado enquanto o livro ainda não foi carregado
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        {/* Círculo animado com borda parcial — padrão de spinner em Tailwind */}
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  // Mensagem de erro quando o livro não pôde ser carregado (ex: ID inválido, sem permissão)
  if (error) {
    return (
      <div className="space-y-4">
        {/* Botão de volta para não prender o usuário na tela de erro */}
        <button
          onClick={() => navigate('/books')}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Voltar
        </button>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  // Se o livro ainda não carregou mas também não há erro, não renderiza nada
  // (este estado é transitório e raramente visível ao usuário)
  if (!book) return null

  // Calcula o progresso de leitura para usar na barra e no texto auxiliar
  const progress = calcProgress(book.current_page, book.total_pages)

  // Determina se a sinopse é longa o suficiente para exibir o botão "Ver mais / Ver menos"
  // O limite de 200 caracteres é arbitrário — define o que consideramos "texto longo"
  const descIsLong = (book.description?.length ?? 0) > 200

  // ── Renderização principal ──

  return (
    // Container principal com espaçamento vertical entre as seções da página
    <div className="space-y-6">

      {/* ── Seção 1: Cabeçalho ── */}
      <div className="flex items-center gap-4">
        {/* Botão de voltar: navega para a lista de livros sem recarregar a página */}
        <button
          onClick={() => navigate('/books')}
          className="text-sm text-gray-400 hover:text-white transition-colors flex-shrink-0"
        >
          ← Voltar
        </button>
        {/* Título da página */}
        <h1 className="text-2xl font-bold text-white">Detalhe do Livro</h1>
      </div>

      {/* ── Seção 2: Card do livro ── */}
      {/* position: relative permite posicionar o botão de editar em absolute dentro do card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 relative">

        {/* ── Botão Editar — posicionado no canto superior direito do card ── */}
        {/* Só exibe quando não estamos em modo de edição */}
        {!isEditing && (
          <button
            onClick={() => openEditForm(book)}
            className="absolute top-4 right-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-3 py-1 rounded-md transition-colors"
            title="Editar metadados do livro"
          >
            ✏️ Editar
          </button>
        )}

        {/* ── Modo de visualização: exibe as informações do livro ── */}
        {!isEditing && (
          // Layout flex: capa à esquerda, informações à direita
          <div className="flex gap-6">

            {/* Capa do livro */}
            {book.cover_url ? (
              // Exibe a capa real se a URL estiver disponível
              <img
                src={book.cover_url}
                alt={`Capa de ${book.title}`}
                className="w-24 h-32 object-cover rounded-lg flex-shrink-0"
              />
            ) : (
              // Placeholder cinza quando não há imagem de capa disponível
              <div className="w-24 h-32 bg-gray-700 rounded-lg flex-shrink-0 flex items-center justify-center">
                <span className="text-gray-500 text-2xl">📖</span>
              </div>
            )}

            {/* Informações do livro */}
            <div className="flex-1 min-w-0 space-y-2">

              {/* Título e badge de status na mesma linha */}
              <div className="flex items-start gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-white leading-tight">{book.title}</h2>
                {/* Badge colorido com o status atual do livro */}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 mt-0.5 ${
                  STATUS_BADGE[book.status] ?? 'bg-gray-700 text-gray-400'
                }`}>
                  {/* Troca underscore por espaço para exibição: "quero_ler" → "quero ler" */}
                  {book.status.replace('_', ' ')}
                </span>
              </div>

              {/* Nome do autor */}
              {book.author && (
                <p className="text-gray-400 text-sm">{book.author}</p>
              )}

              {/* Metadados secundários: gênero, ano, ISBN e idioma */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {book.genre          && <span>{book.genre}</span>}
                {book.published_year && <span>{book.published_year}</span>}
                {book.isbn           && <span>ISBN: {book.isbn}</span>}
                {/* Idioma: exibido junto com os outros metadados quando disponível */}
                {book.language       && <span>🌐 {book.language}</span>}
              </div>

              {/* Datas de início e conclusão */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {book.date_started  && <span>Iniciado: {formatDate(book.date_started)}</span>}
                {book.date_finished && <span>Concluído: {formatDate(book.date_finished)}</span>}
              </div>

              {/* ── Barra de progresso — exibida apenas quando o livro está sendo lido ── */}
              {book.status === 'lendo' && (
                <div className="mt-2 space-y-1">
                  {/* Trilha cinza da barra; a barra azul interna representa o progresso atual */}
                  <div className="bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {/* Texto auxiliar mostrando página atual, total e percentual */}
                  <p className="text-gray-500 text-xs">
                    Página {book.current_page ?? 0} de {book.total_pages ?? '?'} ({progress}%)
                  </p>
                </div>
              )}

              {/* ── Estrelas de avaliação — exibidas apenas para livros concluídos ── */}
              {book.status === 'lido' && (
                <p
                  className="text-yellow-400 text-lg mt-1"
                  title={`Avaliação: ${book.rating ?? 'sem nota'}`}
                >
                  {renderStars(book.rating)}
                </p>
              )}

              {/* ── Sinopse do livro ── */}
              {/* Exibida apenas se o livro tiver descrição cadastrada */}
              {book.description && (
                <div className="mt-3 space-y-1">
                  {/*
                    Quando descExpanded é false e o texto é longo, aplicamos `line-clamp-4`
                    para truncar em 4 linhas e mostrar "..." no final.
                    Quando expandido (ou texto curto), exibimos tudo.
                  */}
                  <p className={`text-gray-300 text-sm leading-relaxed ${
                    !descExpanded && descIsLong ? 'line-clamp-4' : ''
                  }`}>
                    {book.description}
                  </p>
                  {/* Botão "Ver mais / Ver menos" — só aparece se o texto for longo */}
                  {descIsLong && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors"
                    >
                      {descExpanded ? 'Ver menos ▲' : 'Ver mais ▼'}
                    </button>
                  )}
                </div>
              )}

              {/* ── Notas pessoais do leitor ── */}
              {/* Exibidas apenas se o usuário tiver escrito notas pessoais */}
              {book.notes && (
                <div className="mt-2 border-l-2 border-gray-700 pl-3">
                  {/* Rótulo pequeno indicando que o texto abaixo são notas do leitor */}
                  <p className="text-gray-500 text-xs mb-0.5">📝 Minhas notas:</p>
                  <p className="text-gray-400 text-sm italic">{book.notes}</p>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── Modo de edição: formulário inline para editar metadados ── */}
        {isEditing && (
          <div className="space-y-4">

            {/* Cabeçalho do formulário */}
            <h3 className="text-white font-semibold text-base mb-2">Editar Metadados</h3>

            {/* Grid de dois campos por linha — responsivo (1 col no mobile, 2 no desktop) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Campo: Título */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Título</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Título do livro"
                />
              </div>

              {/* Campo: Autor */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Autor</label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Nome do autor"
                />
              </div>

              {/* Campo: URL da Capa (ocupa a linha inteira para poder mostrar o preview) */}
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">URL da Capa</label>
                <input
                  type="text"
                  value={formData.cover_url}
                  onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="https://..."
                />
                {/* Preview da capa — exibido apenas se a URL estiver preenchida */}
                {formData.cover_url && (
                  <img
                    src={formData.cover_url}
                    alt="Preview da capa"
                    className="mt-2 w-12 h-16 object-cover rounded"
                    // Se a imagem falhar ao carregar, esconde o elemento para não quebrar o layout
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
              </div>

              {/* Campo: Total de Páginas */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Total de Páginas</label>
                <input
                  type="number"
                  min="1"
                  value={formData.total_pages}
                  onChange={(e) => setFormData({ ...formData, total_pages: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: 320"
                />
              </div>

              {/* Campo: Gênero */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Gênero</label>
                <input
                  type="text"
                  value={formData.genre}
                  onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Ficção científica"
                />
              </div>

              {/* Campo: Ano de Publicação */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ano de Publicação</label>
                <input
                  type="number"
                  min="0"
                  max="2100"
                  value={formData.published_year}
                  onChange={(e) => setFormData({ ...formData, published_year: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: 1984"
                />
              </div>

              {/* Campo: ISBN */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">ISBN</label>
                <input
                  type="text"
                  value={formData.isbn}
                  onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: 978-3-16-148410-0"
                />
              </div>

              {/* Campo: Idioma */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Idioma</label>
                <input
                  type="text"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Português, English"
                />
              </div>

              {/* Campo: Sinopse (textarea — ocupa a linha inteira por ser texto longo) */}
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Sinopse</label>
                <textarea
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Descrição ou sinopse do livro..."
                />
              </div>

              {/* Campo: Notas Pessoais (textarea — ocupa a linha inteira por ser texto longo) */}
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Notas pessoais</label>
                <textarea
                  rows={4}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Suas anotações pessoais sobre o livro..."
                />
              </div>

            </div>

            {/* Mensagem de erro do formulário de edição */}
            {editError && (
              <p className="text-red-400 text-sm">{editError}</p>
            )}

            {/* Botões de ação do formulário */}
            <div className="flex gap-3">
              {/* Botão Salvar — azul, desabilitado enquanto envia */}
              <button
                onClick={handleSaveMetadata}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {/* Spinner inline mostrado enquanto a requisição está em andamento */}
                {saving && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>

              {/* Botão Cancelar — cinza, descarta as alterações e sai do modo de edição */}
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>

          </div>
        )}

      </div>

      {/* ── Seção 3: Painel de ações ── */}
      {/* Grid responsivo: 1 coluna no mobile, 3 colunas a partir de md (768px) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── Card de ação 1: Registrar Leitura ── */}
        {/* Permite atualizar a página atual e adicionar notas da sessão */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Registrar Leitura</h3>

          {/* Campo: página atual atingida nesta sessão */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Página atual</label>
            <input
              type="number"
              min="0"
              max={book.total_pages ?? undefined} // Limita ao total de páginas se conhecido
              value={logPage}
              onChange={(e) => setLogPage(e.target.value)}
              placeholder={`Até ${book.total_pages ?? '?'}`}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Campo: anotações opcionais sobre a sessão de leitura */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notas (opcional)</label>
            <textarea
              rows={2}
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="Como foi a leitura hoje?"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Campo: data da sessão — padrão é hoje */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Data</label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Mensagem de erro específica deste formulário */}
          {logError && (
            <p className="text-red-400 text-sm">{logError}</p>
          )}

          {/* Botão de salvar — desabilitado enquanto o POST está em andamento ou sem página */}
          <button
            onClick={handleSaveLog}
            disabled={savingLog || !logPage}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            {savingLog ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

        {/* ── Card de ação 2: Concluir Livro ── */}
        {/* Marca o livro como "lido" com avaliação e notas finais */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Concluir Livro</h3>

          {/* Campo: avaliação de 1 a 5 — o leitor indica o quanto gostou do livro */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Avaliação (1–5)</label>
            <input
              type="number"
              min="1"
              max="5"
              step="0.5"   // Permite meias estrelas (ex: 4.5)
              value={finishRating}
              onChange={(e) => setFinishRating(e.target.value)}
              placeholder="Ex: 4.5"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Campo: notas finais sobre o livro inteiro */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notas finais (opcional)</label>
            <textarea
              rows={2}
              value={finishNotes}
              onChange={(e) => setFinishNotes(e.target.value)}
              placeholder="Sua opinião sobre o livro..."
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Campo: data de conclusão — padrão é hoje */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Data de conclusão</label>
            <input
              type="date"
              value={finishDate}
              onChange={(e) => setFinishDate(e.target.value)}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Mensagem de erro específica deste formulário */}
          {finishError && (
            <p className="text-red-400 text-sm">{finishError}</p>
          )}

          {/* Botão de salvar — desabilitado enquanto o POST está em andamento */}
          <button
            onClick={handleSaveFinish}
            disabled={savingFinish}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            {savingFinish ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

        {/* ── Card de ação 3: Mudar Status ── */}
        {/* Permite ao usuário alterar o estado do livro (ex: pausar, abandonar, retomar) */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Mudar Status</h3>

          {/* Select com todos os estados possíveis — pré-selecionado com o status atual */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Novo status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              {/* Os 5 estados possíveis do ciclo de leitura */}
              <option value="quero_ler">Quero Ler</option>
              <option value="lendo">Lendo</option>
              <option value="pausado">Pausado</option>
              <option value="lido">Lido</option>
              <option value="abandonado">Abandonado</option>
            </select>
          </div>

          {/* Mensagem de erro específica deste formulário */}
          {statusError && (
            <p className="text-red-400 text-sm">{statusError}</p>
          )}

          {/* Botão de salvar — desabilitado enquanto o PATCH está em andamento */}
          <button
            onClick={handleSaveStatus}
            disabled={savingStatus}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            {savingStatus ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ── Seção 4: Timeline de sessões de leitura ── */}
      <div className="space-y-3">

        {/* Cabeçalho da seção */}
        <h2 className="text-sm font-semibold text-gray-400 tracking-widest uppercase">
          Histórico de Sessões
        </h2>

        {/* Spinner enquanto o histórico está sendo carregado */}
        {loadingHistory && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Estado vazio: nenhuma sessão registrada ainda */}
        {!loadingHistory && logs.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-6">
            Nenhuma sessão registrada ainda.
          </p>
        )}

        {/* Lista cronológica de sessões */}
        {!loadingHistory && logs.map((log, index) => (
          // Cada item representa uma sessão de leitura
          // Usamos index como key pois as sessões não têm ID próprio
          <div
            key={index}
            className="bg-gray-900 border border-gray-800 rounded-lg p-3"
          >
            {/* Linha superior: data e quantidade de páginas lidas */}
            <div className="flex items-center justify-between mb-1">
              {/* Data da sessão no formato brasileiro */}
              <span className="text-white text-sm font-medium">
                {formatDate(log.date)}
              </span>
              {/* Total de páginas lidas em destaque — informação mais importante para o leitor */}
              <span className="text-blue-400 text-sm font-medium">
                +{log.pages_read} páginas
              </span>
            </div>

            {/* Range de páginas: mostra de onde até onde o leitor chegou nesta sessão */}
            <p className="text-gray-500 text-xs">
              Páginas {log.page_start} → {log.page_end}
            </p>

            {/* Notas da sessão — exibidas apenas se o usuário escreveu algo */}
            {log.session_notes && (
              <p className="text-gray-400 text-xs mt-1 italic">
                "{log.session_notes}"
              </p>
            )}
          </div>
        ))}
      </div>

    </div>
  )
}
