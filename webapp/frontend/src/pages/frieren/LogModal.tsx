// Modal de registro de leitura — permite anotar até qual página o usuário leu,
// adicionar uma nota do dia, marcar o livro como terminado e dar uma avaliação.
// Princípio: abrir, registrar, sair. Teclado-first: Enter salva, Esc fecha.
// Portado do protótipo logmodal.jsx.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Book } from './types'
import { Cover } from './ui/Cover'
import { Icon } from './ui/Icons'

// ── Helper de data local ──────────────────────────────────────────────────────
// Retorna a data de HOJE no formato YYYY-MM-DD usando o horário LOCAL do usuário.
// Não usamos toISOString() porque ele converte para UTC — perto da meia-noite
// poderia retornar o dia errado para usuários no Brasil (UTC-3).
function todayISO(): string {
  const d = new Date()
  // Monta manualmente: ano (4 dígitos), mês (01–12), dia (01–31)
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0') // getMonth() começa em 0
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Formata uma data YYYY-MM-DD em texto amigável em português.
// Exemplos: "Hoje, 9 de junho" · "Ontem, 8 de junho" · "5 de junho de 2026"
function formatDateLabel(dateISO: string): string {
  const today     = todayISO()
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
  })()

  // Formata apenas o dia e mês para uso com o prefixo "Hoje," / "Ontem,"
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
    .format(new Date(dateISO + 'T12:00:00')) // horário fixo evita problemas de fuso

  if (dateISO === today)     return `Hoje, ${dayMonth}`
  if (dateISO === yesterday) return `Ontem, ${dayMonth}`

  // Para datas mais antigas: inclui o ano
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(dateISO + 'T12:00:00'))
}

// Payload enviado ao salvar o registro de leitura
export interface LogPayload {
  bookId: string
  page: number
  note: string
  date: string      // data da sessão no formato YYYY-MM-DD (ex: "2026-06-09")
  finished: boolean
  rating: number | null
}

// Props do modal
interface LogModalProps {
  // Controla se o modal está visível
  open: boolean
  // ID do livro pré-selecionado ao abrir (vindo da barra NowBar ou de outro contexto)
  presetBookId: string | null
  // Lista de TODOS os livros do catálogo — usada tanto nos candidatos quanto na busca
  books: Book[]
  // Fecha o modal sem salvar
  onClose: () => void
  // Salva o registro e retorna Promise (para mostrar toast/spinner)
  onSave: (payload: LogPayload) => Promise<void>
}

// Renderiza o SVG de uma estrela preenchida — usado no seletor de avaliação
function StarShape({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Modal de registro de sessão de leitura.
 * Candidatos à seleção: livros sendo lidos primeiro, depois últimos lidos (top 6),
 * depois quero_ler/wishlist (top 3). Com o campo de busca, qualquer livro do
 * catálogo pode ser selecionado — não só os candidatos.
 */
export function LogModal({ open, presetBookId, books, onClose, onSave }: LogModalProps) {
  // Monta a lista de candidatos padrão: lendo > lidos recentemente > wishlist/owned.
  // Exibida quando o campo de busca está vazio — prioriza livros relevantes.
  const candidates = useMemo(() => {
    // Livros sendo lidos agora — prioridade máxima
    const reading = books.filter(b => b.status === 'reading')
    // Últimos lidos — ordenados por data de término (mais recente primeiro)
    const recent = books
      .filter(b => b.status === 'read')
      .sort((a, b) => (b.finished ?? '').localeCompare(a.finished ?? ''))
      .slice(0, 6)
    // Wishlist e quero_ler — opções secundárias para quem começa um novo livro
    const wish = books.filter(b => b.status === 'wishlist' || b.status === 'owned').slice(0, 3)
    return [...reading, ...recent, ...wish]
  }, [books])

  // ID do livro atualmente selecionado no modal
  const [bookId, setBookId] = useState<string>(presetBookId ?? candidates[0]?.id ?? '')
  // Página atual informada pelo usuário
  const [page, setPage] = useState<number>(0)
  // Nota opcional do dia
  const [note, setNote] = useState('')
  // Data da sessão de leitura no formato YYYY-MM-DD (padrão: hoje)
  const [date, setDate] = useState(todayISO())
  // Controla se o campo de data está expandido (true) ou apenas exibindo o texto amigável (false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  // Se o usuário marcou que terminou o livro
  const [finished, setFinished] = useState(false)
  // Avaliação de 1–5 (só aparece quando finished=true)
  const [rating, setRating] = useState(0)
  // Texto digitado no campo de busca de livro
  const [query, setQuery] = useState('')

  // Referência ao container do carrossel — usada para habilitar scroll via roda do mouse
  const carouselRef = useRef<HTMLDivElement>(null)

  // Livro atualmente selecionado (objeto completo).
  // Busca em TODOS os livros — não só candidatos — porque o usuário pode ter escolhido
  // um livro via busca que está fora da lista de candidatos.
  const book = books.find(b => b.id === bookId) ?? candidates[0]

  // ── Resultados de busca ────────────────────────────────────────────────────
  // Quando o campo de busca tem texto, filtra todo o catálogo por título ou autor.
  // O mesmo padrão usado no Catalog (screens/Catalog.tsx) para consistência.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return books.filter(
      b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    )
  }, [books, query])

  // Lista exibida no carrossel:
  // - Com busca ativa: resultados da pesquisa
  // - Sem busca: candidatos padrão (lendo + recentes + wishlist)
  // Em ambos os casos, garante que o livro atualmente selecionado apareça no início,
  // para que a seleção não "suma" ao limpar a busca ou mudar o filtro.
  const displayList = useMemo(() => {
    const base = query.trim() ? searchResults : candidates
    // Se o livro selecionado não está na lista (ex: foi selecionado via busca e busca foi limpa),
    // adiciona ele no início para que a ✓ continue visível
    const selectedBook = books.find(b => b.id === bookId)
    if (selectedBook && !base.find(b => b.id === bookId)) {
      return [selectedBook, ...base]
    }
    return base
  }, [query, searchResults, candidates, books, bookId])

  // ── Scroll horizontal via roda do mouse no carrossel ──────────────────────
  // O carrossel tem overflow-x: auto, então rola com trackpad/toque.
  // Mas a roda do mouse convencional gera deltaY (vertical), que um container
  // horizontal ignora. Este effect converte deltaY → scrollLeft manualmente.
  // O listener precisa ser { passive: false } para poder chamar preventDefault()
  // (sem isso o body do modal também rolaria junto).
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      // Se a roda tem componente horizontal real (trackpad diagonal), deixa o
      // navegador tratar — só intercepta quando é puramente vertical
      if (e.deltaX !== 0) return
      e.preventDefault()
      // Multiplica por 1 para manter a sensibilidade natural da roda
      el.scrollLeft += e.deltaY
    }

    // passive: false é obrigatório para que preventDefault() funcione
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open]) // re-registra ao abrir/fechar para garantir referência válida

  // Reinicializa o estado sempre que o modal é aberto ou o preset muda
  useEffect(() => {
    if (!open) return
    // Usa o preset se informado, senão o primeiro candidato
    const initial = presetBookId ?? candidates[0]?.id ?? ''
    setBookId(initial)
    // Busca o livro em todos os livros (não só candidatos) para ter os dados corretos
    const bk = books.find(b => b.id === initial)
    // Pré-preenche com a página atual do livro para facilitar o incremento
    setPage(bk?.page ?? 0)
    setNote('')
    // Volta a data para hoje e esconde o seletor a cada abertura
    setDate(todayISO())
    setShowDatePicker(false)
    setFinished(false)
    setRating(0)
    // Limpa a busca ao reabrir o modal
    setQuery('')
  }, [open, presetBookId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao selecionar outro livro no carrossel, atualiza a página e limpa a busca
  // para voltar à lista de candidatos com o livro escolhido já destacado
  const selectBook = useCallback((id: string) => {
    setBookId(id)
    // Busca em todos os livros para ter a página correta independente da origem
    const bk = books.find(b => b.id === id)
    setPage(bk?.page ?? 0)
    setFinished(false)
    // Limpa a busca: retorna ao carrossel padrão com o livro escolhido em destaque
    setQuery('')
  }, [books])

  // Total de páginas do livro selecionado (para calcular percentual e limitar input)
  const total = book?.pages ?? 0

  // Incrementa/decrementa a página respeitando os limites (0 e total)
  const bump = useCallback((n: number) => {
    setPage(p => Math.min(total, Math.max(0, (Number(p) || 0) + n)))
  }, [total])

  // Monta o payload e chama onSave; fecha o modal após salvar
  const doSave = useCallback(async () => {
    if (!bookId) return
    await onSave({
      bookId,
      page:     Number(page) || 0,
      note:     note.trim(),
      date,                                      // data escolhida pelo usuário
      finished,
      rating:   finished && rating ? rating : null,
    })
    onClose()
  }, [bookId, page, note, date, finished, rating, onSave, onClose])

  // Atalhos de teclado: Esc fecha, Ctrl/Cmd+Enter salva
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSave()
    }
    window.addEventListener('keydown', onKey)
    // Limpa o listener ao fechar o modal ou remontar o efeito
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, doSave])

  // Não renderiza nada quando fechado — evita elementos ocultos no DOM
  if (!open) return null

  return (
    // Scrim (fundo semitransparente) — clique fora fecha o modal
    <div
      className="modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Caixa do modal */}
      <div className="modal" role="dialog" aria-label="Registrar leitura">

        {/* Cabeçalho com título e botão de fechar */}
        <div className="modal-head">
          <span className="modal-title">Registrar leitura</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">

          {/* Seleção do livro — campo de busca + carrossel de capas clicáveis */}
          <label className="modal-label">Qual livro?</label>

          {/* Campo de busca — filtra todo o catálogo por título ou autor */}
          <input
            className="book-search"
            type="text"
            placeholder="Buscar por título ou autor…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            // Não recebe autoFocus — o campo de página tem prioridade (fluxo rápido)
          />

          {/* Carrossel de capas — rola com trackpad, toque E roda do mouse (via ref) */}
          <div className="bookpick" ref={carouselRef}>
            {displayList.length > 0 ? (
              displayList.map(b => (
                <div
                  key={b.id}
                  // Classe "sel" destaca o livro selecionado com borda teal
                  className={'pick' + (b.id === bookId ? ' sel' : '')}
                  onClick={() => selectBook(b.id)}
                  title={b.title}
                >
                  <Cover book={b} />
                </div>
              ))
            ) : (
              // Mensagem de vazio quando a busca não encontra nenhum resultado
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 11,
                color: 'var(--ink-4)', padding: '10px 2px',
              }}>
                Nenhum livro encontrado
              </span>
            )}
          </div>

          {/* Campo de página atual */}
          <div className="modal-field">
            <label className="modal-label">Você parou na página…</label>
            <div className="page-input-row">
              {/* Input numérico com foco automático para digitação rápida */}
              <input
                className="page-input"
                type="number"
                min={0}
                max={total}
                value={page}
                onChange={e => setPage(Number(e.target.value))}
                autoFocus
              />
              <span className="page-total">de {total || '?'}</span>
            </div>

            {/* Botões de incremento rápido e percentual em tempo real */}
            <div className="quick-add">
              <button onClick={() => bump(10)}>+10</button>
              <button onClick={() => bump(25)}>+25</button>
              <button onClick={() => bump(50)}>+50</button>
              {/* "terminei" seta a página para o total e marca finished */}
              <button onClick={() => { setPage(total); setFinished(true) }}>terminei</button>
              {/* Percentual calculado em tempo real para o usuário se orientar */}
              {total > 0 && (
                <span style={{
                  marginLeft: 'auto', fontFamily: 'var(--mono)',
                  fontSize: 11, color: 'var(--ink-3)', alignSelf: 'center',
                }}>
                  {Math.round((Number(page) || 0) / total * 100)}%
                </span>
              )}
            </div>
          </div>

          {/* ── Seletor de data da sessão ───────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">Quando você leu?</label>

            {/* Modo compacto: mostra o texto amigável + link para trocar */}
            {!showDatePicker ? (
              <div className="date-display-row">
                {/* Texto formatado: "Hoje, 9 de junho", "Ontem, 8 de junho", etc. */}
                <span className="date-display">{formatDateLabel(date)}</span>
                {/* Botão discreto que expande o seletor de data */}
                <button
                  className="date-change"
                  onClick={() => setShowDatePicker(true)}
                >
                  mudar data
                </button>
              </div>
            ) : (
              // Modo expandido: input de data nativo + botão para voltar ao resumo
              <div className="date-display-row">
                <input
                  className="date-input"
                  type="date"
                  value={date}
                  max={todayISO()}               // impede selecionar datas futuras
                  onChange={e => setDate(e.target.value)}
                />
                {/* Botão para fechar o seletor e mostrar o resumo novamente */}
                <button
                  className="date-change"
                  onClick={() => setShowDatePicker(false)}
                >
                  fechar
                </button>
              </div>
            )}
          </div>

          {/* Nota opcional do dia */}
          <div className="modal-field">
            <label className="modal-label">
              Uma linha sobre hoje{' '}
              <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>
                · opcional
              </span>
            </label>
            <textarea
              className="note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="O que ficou de hoje?"
            />
          </div>

          {/* Checkbox "terminei" + seletor de avaliação (aparece quando marcado) */}
          <div className="modal-field">
            <label style={{
              display: 'flex', alignItems: 'center', gap: 9,
              cursor: 'pointer', fontSize: 13.5, color: 'var(--ink-2)',
            }}>
              <input
                type="checkbox"
                checked={finished}
                onChange={e => setFinished(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
              />
              Terminei este livro
            </label>

            {/* Seletor de estrelas — só aparece quando o livro foi marcado como terminado */}
            {finished && (
              <div style={{ marginTop: 14 }}>
                <label className="modal-label">Sua nota</label>
                <div className="rate-pick">
                  {/* 5 botões de estrela — click define a nota de 1 a 5 */}
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      // Classe "on" pinta a estrela de dourado quando n <= rating
                      className={'star-btn' + (n <= rating ? ' on' : '')}
                      onClick={() => setRating(n)}
                    >
                      <StarShape filled />
                    </button>
                  ))}
                  {/* Botão para limpar a avaliação */}
                  {rating > 0 && (
                    <button className="rate-clear" onClick={() => setRating(0)}>
                      limpar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé com dica de atalho e botões de ação */}
          <div className="modal-foot">
            <span className="hint">
              <kbd>⌘</kbd> <kbd>↵</kbd> para salvar
            </span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={doSave}>
              <Icon name="check" /> Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
