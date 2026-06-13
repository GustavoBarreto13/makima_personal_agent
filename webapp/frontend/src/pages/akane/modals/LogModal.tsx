// Modal para logar uma sessão de visualização.
// Modo 1: filme pré-selecionado (chamado do botão "Logar" na watchlist/detalhe).
// Modo 2: busca no catálogo local ou TMDB para adicionar + logar.
// Campos: data, nota (meia-estrela), review, tags, rewatch (auto-inferido).

import { useState, useEffect, useRef } from 'react'
import { akaneApi } from '../akaneApi'

// ── Tipos internos do modal ───────────────────────────────────────────────────

/** Resultado de uma busca (catálogo local ou TMDB). */
interface SearchResult {
  /** ID no catálogo local (se o filme já está no banco). */
  localId?: string
  /** ID TMDB (para adicionar ao catálogo se ainda não está). */
  tmdbId?: number
  title: string
  year: number | null
  posterUrl: string | null
  /** Se TRUE, o filme já está no catálogo local — não precisa criar. */
  inCatalog: boolean
}

interface LogModalProps {
  /** ID do filme pré-selecionado (se chamado do detalhe/watchlist). Null = modo busca. */
  prefilledMovieId?: string | null
  /** Título pré-preenchido (exibido antes da busca confirmar). */
  prefilledTitle?: string | null
  onClose: () => void
  onSuccess: (message: string) => void
}

/**
 * Modal de registro de sessão.
 */
export function LogModal({ prefilledMovieId, prefilledTitle, onClose, onSuccess }: LogModalProps) {
  // ── Estado do filme selecionado ────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(prefilledMovieId ?? null)
  const [selectedTitle, setSelectedTitle] = useState<string>(prefilledTitle ?? '')

  // ── Estado de busca ────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Campos do formulário ───────────────────────────────────────────────────
  const [watchedDate, setWatchedDate] = useState(() => {
    // Data padrão = hoje (formato YYYY-MM-DD)
    return new Date().toISOString().slice(0, 10)
  })
  const [rating, setRating] = useState<number | null>(null)
  const [review, setReview] = useState('')
  const [tags, setTags] = useState('')   // Etiquetas separadas por vírgula

  // ── Estado de envio ────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce da busca no TMDB (480ms) para não disparar a cada tecla
  useEffect(() => {
    if (!query.trim() || prefilledMovieId) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        // Busca no TMDB pelo texto
        const res = await akaneApi.tmdbSearch(query)
        setResults(
          res.results.map(r => ({
            tmdbId:    r.tmdb_id,
            title:     r.title,
            year:      r.year,
            posterUrl: r.poster_url,
            inCatalog: false,   // A busca TMDB não sabe se está no catálogo; assumimos que não
          }))
        )
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 480)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, prefilledMovieId])

  /** Seleciona um resultado de busca e adiciona ao catálogo se necessário. */
  const selectResult = async (result: SearchResult) => {
    setResults([])
    setQuery('')
    setSelectedTitle(result.title)

    if (result.localId) {
      // Filme já está no catálogo — usa o ID local
      setSelectedId(result.localId)
    } else if (result.tmdbId) {
      // Filme não está no catálogo — adiciona primeiro
      setSubmitting(true)
      try {
        const added = await akaneApi.add({ tmdb_id: result.tmdbId, status: 'watchlist' })
        setSelectedId(String((added as { id?: string }).id ?? ''))
      } catch {
        setError('Não foi possível adicionar o filme ao catálogo.')
      } finally {
        setSubmitting(false)
      }
    }
  }

  /** Envia o formulário de log de sessão. */
  const submit = async () => {
    if (!selectedId) {
      setError('Selecione um filme primeiro.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // Divide as etiquetas por vírgula e limpa espaços
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)

      await akaneApi.logWatch(selectedId, {
        watched_date: watchedDate,
        rating,
        review: review || null,
        tags: tagList.length > 0 ? tagList : undefined,
        source: 'manual',
      })

      onSuccess(`Sessão de "${selectedTitle}" logada!`)
      onClose()
    } catch (e: unknown) {
      const errMsg = (e instanceof Error) ? e.message : 'Erro ao salvar a sessão.'
      setError(errMsg)
    } finally {
      setSubmitting(false)
    }
  }

  // Fecha ao pressionar Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    // Backdrop escuro com blur
    <div className="ak-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ak-modal" role="dialog" aria-modal="true" aria-label="Logar sessão">

        {/* ── Cabeçalho ─────────────────────────────────────────────── */}
        <div className="ak-modal-header">
          <span className="ak-modal-title">
            {selectedTitle ? `▶ ${selectedTitle}` : 'Logar sessão'}
          </span>
          <button
            className="ak-btn"
            onClick={onClose}
            style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* ── Corpo ─────────────────────────────────────────────────── */}
        <div className="ak-modal-body">

          {/* ── Campo de busca (só exibido se não há filme pré-selecionado) */}
          {!prefilledMovieId && !selectedId && (
            <div style={{ position: 'relative' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-4)', display: 'block', marginBottom: 5 }}>
                Buscar filme
              </label>
              <input
                type="text"
                className="ak-input"
                placeholder="Título do filme..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />

              {/* Dropdown de resultados */}
              {(searching || results.length > 0) && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--card)', border: '1px solid var(--line)',
                  borderRadius: 'var(--r-md)', marginTop: 4,
                  boxShadow: 'var(--shadow-md)', overflow: 'hidden',
                }}>
                  {searching ? (
                    <div style={{ padding: '12px 16px', color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      Buscando…
                    </div>
                  ) : (
                    results.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => selectResult(r)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', padding: '8px 12px',
                          background: 'none', border: 'none',
                          borderBottom: '1px solid var(--line-2)',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'background 0.12s',
                          color: 'var(--ink)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--rose-tint)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        {/* Miniatura do pôster */}
                        {r.posterUrl ? (
                          <img
                            src={r.posterUrl}
                            alt=""
                            style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: 28, height: 42, background: 'var(--card-2)', borderRadius: 3, flexShrink: 0 }} />
                        )}
                        {/* Título e ano */}
                        <div>
                          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink)' }}>
                            {r.title}
                          </p>
                          {r.year && (
                            <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>
                              {r.year}
                            </p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Campo de data ─────────────────────────────────────── */}
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-4)', display: 'block', marginBottom: 5 }}>
              Data assistida
            </label>
            <input
              type="date"
              className="ak-input"
              value={watchedDate}
              onChange={e => setWatchedDate(e.target.value)}
            />
          </div>

          {/* ── Nota (RateInput de meia-estrela) ─────────────────────── */}
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-4)', display: 'block', marginBottom: 8 }}>
              Nota {rating !== null ? `(${rating.toFixed(1)})` : '(opcional)'}
            </label>
            <StarRateInput rating={rating} onChange={setRating} />
          </div>

          {/* ── Review ────────────────────────────────────────────── */}
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-4)', display: 'block', marginBottom: 5 }}>
              Review (opcional)
            </label>
            <textarea
              className="ak-input"
              value={review}
              onChange={e => setReview(e.target.value)}
              rows={3}
              placeholder="O que você achou?"
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* ── Etiquetas ─────────────────────────────────────────── */}
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--ink-4)', display: 'block', marginBottom: 5 }}>
              Etiquetas (opcional, separadas por vírgula)
            </label>
            <input
              type="text"
              className="ak-input"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="drama, noite, re-assistido"
            />
          </div>

          {/* ── Mensagem de erro ──────────────────────────────────── */}
          {error && (
            <p style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'oklch(0.6 0.2 18)' }}>
              ⚠ {error}
            </p>
          )}
        </div>

        {/* ── Rodapé com botões ─────────────────────────────────────── */}
        <div className="ak-modal-footer">
          <button className="ak-btn" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="ak-btn ak-btn-primary"
            onClick={submit}
            disabled={submitting || (!selectedId && !prefilledMovieId)}
          >
            {submitting ? 'Salvando…' : 'Logar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Input de nota por estrelas (meia-estrela) ─────────────────────────────────

interface StarRateInputProps {
  rating: number | null
  onChange: (r: number | null) => void
}

/**
 * Seletor de nota interativo (5 estrelas, meia-estrela = 0.5).
 * A nota é determinada pela posição X do cursor sobre as estrelas.
 */
function StarRateInput({ rating, onChange }: StarRateInputProps) {
  const [hover, setHover] = useState<number | null>(null)

  const display = hover ?? rating   // Exibe hover enquanto o mouse está sobre o input

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{ display: 'flex', gap: 2, cursor: 'pointer' }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const full  = i + 1
          const half  = i + 0.5

          return (
            <span
              key={i}
              style={{ position: 'relative', display: 'inline-block', width: 24, height: 24 }}
            >
              {/* Metade esquerda — meia-estrela */}
              <span
                style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', zIndex: 1 }}
                onMouseEnter={() => setHover(half)}
                onClick={() => onChange(rating === half ? null : half)}   // Clicar na nota ativa limpa
              />
              {/* Metade direita — estrela cheia */}
              <span
                style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%', zIndex: 1 }}
                onMouseEnter={() => setHover(full)}
                onClick={() => onChange(rating === full ? null : full)}
              />
              {/* SVG visual da estrela */}
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill={
                  display !== null && display >= full
                    ? 'var(--gold)'
                    : display !== null && display >= half
                    ? 'url(#half-fill)'
                    : 'none'
                }
                stroke="var(--gold)"
                strokeWidth={1.5}
              >
                {display !== null && display >= half && display < full && (
                  <defs>
                    <linearGradient id="half-fill" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="50%" stopColor="var(--gold)" />
                      <stop offset="50%" stopColor="transparent" />
                    </linearGradient>
                  </defs>
                )}
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
            </span>
          )
        })}
      </div>

      {/* Botão para limpar a nota */}
      {rating !== null && (
        <button
          onClick={() => onChange(null)}
          style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)',
            background: 'none', border: 'none', cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Limpar
        </button>
      )}
    </div>
  )
}
