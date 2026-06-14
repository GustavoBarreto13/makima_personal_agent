// Modal para registrar uma sessão de episódios.
// Pode ser pré-preenchido com animeId e ep_start (clique em "▶ Ep N").
// Se não for pré-preenchido, exibe campo de busca para selecionar o anime.
// ⌘↵ submete, Esc fecha.

import { useState, useEffect, useRef, useCallback } from 'react'
import { marinApi } from '../marinApi'
import type { Anime } from '../types'
import { RateInput } from '../components/RateInput'

interface LogWatchModalProps {
  // Se informado, o anime já está pré-selecionado
  animeId?: string
  // Episódio pré-selecionado (ex.: próximo ep do anime)
  defaultEp?: number
  onSubmit: () => void
  onClose: () => void
  onToast: (msg: string) => void
}

/**
 * LogWatchModal — modal para registrar sessão de episódios.
 * Busca anime por nome se não pré-selecionado.
 * RateInput 0–10 MAL (passo 0.5).
 */
export function LogWatchModal({
  animeId: initialAnimeId,
  defaultEp,
  onSubmit,
  onClose,
  onToast,
}: LogWatchModalProps) {
  // Anime selecionado
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(initialAnimeId ?? null)
  const [selectedAnimeTitle, setSelectedAnimeTitle] = useState<string>('')

  // Campos do formulário
  const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  const [epStart, setEpStart] = useState<number>(defaultEp ?? 1)
  const [epEnd, setEpEnd] = useState<number>(defaultEp ?? 1)
  const [watchedDate, setWatchedDate] = useState<string>(today)
  const [rating, setRating] = useState<number>(0)  // 0 = sem nota
  const [notes, setNotes] = useState<string>('')

  // Estado de busca (quando não há anime pré-selecionado)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Anime[]>([])
  const [searching, setSearching] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const notesRef = useRef<HTMLTextAreaElement>(null)

  // Carrega o título do anime pré-selecionado
  useEffect(() => {
    if (!initialAnimeId) return
    marinApi.detail(initialAnimeId)
      .then(res => setSelectedAnimeTitle(res.anime?.title ?? ''))
      .catch(() => {})
  }, [initialAnimeId])

  // Busca animes pelo nome no catálogo local
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => {
      setSearching(true)
      marinApi.list({ status: undefined })
        .then(res => {
          const q = searchQuery.toLowerCase()
          setSearchResults(
            (res.animes ?? [])
              .filter(a => a.title.toLowerCase().includes(q))
              .slice(0, 6)
          )
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 300)  // debounce de 300ms
    return () => clearTimeout(timer)
  }, [searchQuery])

  // ⌘↵ submete o formulário
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [selectedAnimeId, epStart, epEnd, watchedDate, rating, notes])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  async function handleSubmit() {
    if (!selectedAnimeId) {
      onToast('Selecione um anime primeiro.')
      return
    }
    if (epStart < 1 || epEnd < epStart) {
      onToast('Intervalo de episódios inválido.')
      return
    }

    setSubmitting(true)
    try {
      await marinApi.logWatch(selectedAnimeId, {
        ep_start: epStart,
        ep_end: epEnd,
        watched_date: watchedDate,
        rating: rating > 0 ? rating : undefined,
        notes: notes.trim() || undefined,
      })
      onToast('Sessão registrada!')
      onSubmit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao registrar sessão.'
      onToast(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // Scrim clicável fecha o modal
    <div
      className="mr-modal-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal
      aria-label="Registrar sessão"
    >
      <div className="mr-modal mr-log-modal">
        {/* Cabeçalho */}
        <div className="mr-modal-header">
          <h2 className="mr-modal-title">Logar episódios</h2>
          <button className="mr-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="mr-modal-body">
          {/* Seleção de anime (oculta se já pré-selecionado) */}
          {selectedAnimeId ? (
            <div className="mr-log-anime-selected">
              <span className="mr-log-anime-label">Anime:</span>
              <span className="mr-log-anime-title">{selectedAnimeTitle}</span>
              {/* Botão de trocar o anime selecionado */}
              {!initialAnimeId && (
                <button
                  className="mr-btn-ghost"
                  onClick={() => { setSelectedAnimeId(null); setSelectedAnimeTitle('') }}
                >
                  Trocar
                </button>
              )}
            </div>
          ) : (
            <div className="mr-log-search-block">
              <label className="mr-label">Anime</label>
              <input
                type="text"
                className="mr-input"
                placeholder="Buscar no catálogo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {/* Resultados da busca */}
              {(searching || searchResults.length > 0) && (
                <div className="mr-log-search-results">
                  {searching && (
                    <div className="mr-log-search-hint">Buscando...</div>
                  )}
                  {searchResults.map(a => (
                    <button
                      key={a.id}
                      className="mr-log-search-item"
                      onClick={() => {
                        setSelectedAnimeId(a.id)
                        setSelectedAnimeTitle(a.title)
                        setSearchQuery('')
                        setSearchResults([])
                      }}
                    >
                      {a.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Intervalo de episódios */}
          <div className="mr-log-eps-row">
            <div className="mr-log-field">
              <label className="mr-label" htmlFor="log-ep-start">Ep início</label>
              <input
                id="log-ep-start"
                type="number"
                className="mr-input"
                min={1}
                value={epStart}
                onChange={e => {
                  const v = Math.max(1, parseInt(e.target.value) || 1)
                  setEpStart(v)
                  // Garante que ep_end >= ep_start
                  if (epEnd < v) setEpEnd(v)
                }}
              />
            </div>
            <span className="mr-log-eps-sep">até</span>
            <div className="mr-log-field">
              <label className="mr-label" htmlFor="log-ep-end">Ep fim</label>
              <input
                id="log-ep-end"
                type="number"
                className="mr-input"
                min={epStart}
                value={epEnd}
                onChange={e => {
                  const v = Math.max(epStart, parseInt(e.target.value) || epStart)
                  setEpEnd(v)
                }}
              />
            </div>
          </div>

          {/* Quantidade de eps na sessão (leitura) */}
          {epEnd > epStart && (
            <p className="mr-log-eps-count">
              {epEnd - epStart + 1} episódios nessa sessão
            </p>
          )}

          {/* Data */}
          <div className="mr-log-field">
            <label className="mr-label" htmlFor="log-date">Data</label>
            <input
              id="log-date"
              type="date"
              className="mr-input"
              value={watchedDate}
              max={today}  // não pode logar no futuro
              onChange={e => setWatchedDate(e.target.value)}
            />
          </div>

          {/* Nota (RateInput 0–10 MAL, passo 0.5) */}
          <div className="mr-log-field">
            <label className="mr-label">
              Nota{' '}
              <span className="mr-label-hint">(opcional)</span>
            </label>
            <RateInput
              value={rating}
              onChange={setRating}
            />
            {rating > 0 && (
              <span className="mr-log-rating-display" style={{ color: 'var(--star)' }}>
                {rating}/10
              </span>
            )}
          </div>

          {/* Notas textuais */}
          <div className="mr-log-field">
            <label className="mr-label" htmlFor="log-notes">
              Notas{' '}
              <span className="mr-label-hint">(opcional)</span>
            </label>
            <textarea
              id="log-notes"
              ref={notesRef}
              className="mr-textarea"
              rows={3}
              placeholder="O que você achou dessa sessão?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Rodapé com botões */}
        <div className="mr-modal-footer">
          <p className="mr-modal-shortcut">⌘↵ para salvar</p>
          <button className="mr-btn" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="mr-btn mr-btn--primary"
            onClick={handleSubmit}
            disabled={submitting || !selectedAnimeId}
          >
            {submitting ? 'Salvando...' : 'Salvar sessão'}
          </button>
        </div>
      </div>
    </div>
  )
}
