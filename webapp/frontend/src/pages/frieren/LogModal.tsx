// Modal de registro de leitura — permite anotar até qual página o usuário leu,
// adicionar uma nota do dia, marcar o livro como terminado e dar uma avaliação.
// Princípio: abrir, registrar, sair. Teclado-first: Enter salva, Esc fecha.
// Portado do protótipo logmodal.jsx.

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { Book } from './types'
import { Cover } from './ui/Cover'
import { Icon } from './ui/Icons'

// Payload enviado ao salvar o registro de leitura
export interface LogPayload {
  bookId: string
  page: number
  note: string
  finished: boolean
  rating: number | null
}

// Props do modal
interface LogModalProps {
  // Controla se o modal está visível
  open: boolean
  // ID do livro pré-selecionado ao abrir (vindo da barra NowBar ou de outro contexto)
  presetBookId: string | null
  // Lista de todos os livros disponíveis para seleção
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
 * depois quero_ler/wishlist (top 3).
 */
export function LogModal({ open, presetBookId, books, onClose, onSave }: LogModalProps) {
  // Monta a lista de candidatos: lendo > lidos recentemente > wishlist/owned
  // useMemo evita recalcular a cada render quando books não muda
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
  // Se o usuário marcou que terminou o livro
  const [finished, setFinished] = useState(false)
  // Avaliação de 1–5 (só aparece quando finished=true)
  const [rating, setRating] = useState(0)

  // Livro atualmente selecionado (objeto completo)
  const book = candidates.find(b => b.id === bookId) ?? candidates[0]

  // Reinicializa o estado sempre que o modal é aberto ou o preset muda
  useEffect(() => {
    if (!open) return
    // Usa o preset se informado, senão o primeiro candidato
    const initial = presetBookId ?? candidates[0]?.id ?? ''
    setBookId(initial)
    const bk = candidates.find(b => b.id === initial)
    // Pré-preenche com a página atual do livro para facilitar o incremento
    setPage(bk?.page ?? 0)
    setNote('')
    setFinished(false)
    setRating(0)
  }, [open, presetBookId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao selecionar outro livro, atualiza a página para a última registrada daquele livro
  const selectBook = useCallback((id: string) => {
    setBookId(id)
    const bk = candidates.find(b => b.id === id)
    setPage(bk?.page ?? 0)
    setFinished(false)
  }, [candidates])

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
      page: Number(page) || 0,
      note: note.trim(),
      finished,
      rating: finished && rating ? rating : null,
    })
    onClose()
  }, [bookId, page, note, finished, rating, onSave, onClose])

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

          {/* Seleção do livro — miniaturas de capa clicáveis */}
          <label className="modal-label">Qual livro?</label>
          <div className="bookpick">
            {candidates.map(b => (
              <div
                key={b.id}
                // Classe "sel" destaca o livro selecionado com borda teal
                className={'pick' + (b.id === bookId ? ' sel' : '')}
                onClick={() => selectBook(b.id)}
                title={b.title}
              >
                <Cover book={b} />
              </div>
            ))}
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
