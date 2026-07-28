// Modal "Logar filme" — reescrito hi-fi conforme o handoff §8.1: a BUSCA é o
// caminho principal (quase todo filme logado é novo), com um card "log-target"
// mostrando qual filme vai para o diário, e um <details> recolhível "Ou escolha
// um que já está na sua base" como atalho secundário para rewatches.
//
// Fluxo real preservado: busca no TMDB de verdade (akaneApi.tmdbSearch),
// adiciona ao catálogo se necessário (akaneApi.add) e grava a sessão
// (akaneApi.logWatch). Atalhos: ⌘↵ loga, Esc fecha.

import { useState, useEffect, useRef, useCallback } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie } from '../types'
import { todayLocalISO } from '../dateUtils'
import { Icon } from '../ui/Icon'
import { Heart } from '../ui/Heart'
import { Poster } from '../components/Poster'
import { RateInput } from '../components/RateInput'

/** Resultado de busca no TMDB — já indica se o filme está no catálogo local. */
interface SearchResult {
  localId?: string
  tmdbId?: number
  title: string
  year: number | null
  posterUrl: string | null
  director: string[]
  inCatalog: boolean
}

interface LogModalProps {
  /** ID do filme pré-selecionado (chamado do detalhe/watchlist). Null = modo busca. */
  prefilledMovieId?: string | null
  /** Título pré-preenchido (exibido antes da busca confirmar). */
  prefilledTitle?: string | null
  onClose: () => void
  onSuccess: (message: string) => void
}

/** Modal de registro de sessão — busca-primária. */
export function LogModal({ prefilledMovieId, prefilledTitle, onClose, onSuccess }: LogModalProps) {
  // ── Filme-alvo do log ──────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(prefilledMovieId ?? null)
  const [selectedTitle, setSelectedTitle] = useState<string>(prefilledTitle ?? '')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null)
  const [selectedPalette, setSelectedPalette] = useState<string>('noir')

  // ── Busca (caminho principal) ─────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Atalho secundário: filmes já na base (watchlist + recentes vistos) ─────
  const [picks, setPicks] = useState<Movie[]>([])

  // ── Campos do formulário ───────────────────────────────────────────────────
  const [watchedDate, setWatchedDate] = useState(todayLocalISO)
  const [rating, setRating] = useState(0)
  const [liked, setLiked] = useState(false)
  const [rewatch, setRewatch] = useState(false)
  const [note, setNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carrega os candidatos do seletor secundário (watchlist + até 8 vistos recentes)
  useEffect(() => {
    Promise.all([
      akaneApi.watchlist().catch(() => ({ movies: [] as Movie[] })),
      akaneApi.list({ status: 'watched', sort: 'recent' }).catch(() => ({ movies: [] as Movie[] })),
    ]).then(([w, recent]) => {
      setPicks([...w.movies, ...recent.movies.slice(0, 8)])
    })
  }, [])

  // Se veio pré-preenchido, busca os dados do filme para exibir no log-target
  useEffect(() => {
    if (!prefilledMovieId) return
    akaneApi.detail(prefilledMovieId).then(res => {
      setSelectedTitle(res.movie.title)
      setSelectedYear(res.movie.year)
      setSelectedPoster(res.movie.poster_url)
      setSelectedPalette(res.movie.poster_palette)
      setRewatch(res.movie.status === 'watched')
    }).catch(() => {})
  }, [prefilledMovieId])

  // Debounce da busca no TMDB (480ms, igual ao handoff)
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await akaneApi.tmdbSearch(query)
        setResults(res.results.map(r => ({
          localId: r.local_id ?? undefined,
          tmdbId: r.tmdb_id,
          title: r.title,
          year: r.year,
          posterUrl: r.poster_url,
          director: r.director,
          inCatalog: r.in_catalog,
        })))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 480)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  /** "Logar este" — adiciona ao catálogo (se preciso) e define como alvo. */
  const addResult = async (r: SearchResult) => {
    setQuery(''); setResults([])
    setSelectedTitle(r.title); setSelectedYear(r.year); setSelectedPoster(r.posterUrl)
    setRewatch(false)
    if (r.localId) {
      setSelectedId(r.localId)
      return
    }
    setSubmitting(true)
    try {
      const added = await akaneApi.add({ tmdb_id: r.tmdbId, title: r.title, status: 'watchlist' })
      setSelectedId(String((added as { id?: string }).id ?? ''))
    } catch {
      setError('Não foi possível adicionar o filme ao catálogo.')
    } finally {
      setSubmitting(false)
    }
  }

  /** Escolher um filme do seletor secundário (já está na base). */
  const selectPick = (m: Movie) => {
    setSelectedId(m.id)
    setSelectedTitle(m.title)
    setSelectedYear(m.year)
    setSelectedPoster(m.poster_url)
    setSelectedPalette(m.poster_palette)
    setRewatch(m.status === 'watched')
  }

  const doSave = useCallback(async () => {
    if (!selectedId || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await akaneApi.logWatch(selectedId, {
        watched_date: watchedDate,
        rating: rating || null,
        review: note.trim() || null,
        rewatch,
        source: 'manual',
      })
      // "Curtir" na sessão vira like no filme (o handoff trata os dois como um marcador só)
      if (liked) await akaneApi.like(selectedId, true).catch(() => {})
      onSuccess(rewatch ? 'Revisão logada no diário' : `Sessão de "${selectedTitle}" logada`)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar a sessão.')
      setSubmitting(false)
    }
  }, [selectedId, submitting, watchedDate, rating, note, rewatch, liked, selectedTitle, onSuccess, onClose])

  // Esc fecha, ⌘↵/Ctrl+↵ salva
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, doSave])

  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label="Logar filme">
        <div className="modal-head">
          <span className="modal-title">Logar filme</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">

          {/* ── Busca (caminho principal) — só quando não há filme pré-selecionado ── */}
          {!prefilledMovieId && (
            <>
              <label className="modal-label">Qual filme? <span className="ml-hint">· busque pelo nome, diretor ou ano</span></label>
              <div className="film-search primary">
                <div className="film-search-bar">
                  <Icon name="search" />
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                         placeholder="Ex.: Oldboy, Wong Kar-wai, 1997…" />
                  {searching && <span className="fs-spin" />}
                </div>
                {query.trim() && (
                  <div className="film-search-results">
                    {searching && <div className="fs-status">Buscando no TMDB…</div>}
                    {!searching && results.length === 0 && (
                      <div className="fs-status">Nada encontrado para "{query.trim()}". <span className="fs-hint">Tente o título original.</span></div>
                    )}
                    {!searching && results.map((r, i) => (
                      <div key={i} className="fs-result" onClick={() => addResult(r)}>
                        <div className="fs-poster">
                          <Poster title={r.title} posterUrl={r.posterUrl} palette="noir" />
                        </div>
                        <div className="fs-meta">
                          <div className="fs-title">{r.title} <span className="fs-year">{r.year}</span></div>
                          {r.director.length > 0 && <div className="fs-sub">{r.director.join(', ')}</div>}
                        </div>
                        <span className="fs-add"><Icon name={r.inCatalog ? 'check' : 'plus'} /> {r.inCatalog ? 'Logar este' : 'Logar este'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Alvo do log ── */}
          {selectedId && (
            <div className="log-target">
              <div className="lt-poster">
                <Poster title={selectedTitle} posterUrl={selectedPoster} palette={selectedPalette} />
              </div>
              <div className="lt-meta">
                <div className="lt-title">{selectedTitle} {selectedYear && <span>{selectedYear}</span>}</div>
                <div className="lt-sub">vai para o seu diário</div>
              </div>
              <span className="lt-check"><Icon name="check" /></span>
            </div>
          )}

          {/* ── Seletor secundário recolhível ── */}
          {!prefilledMovieId && picks.length > 0 && (
            <details className="pick-fold">
              <summary>Ou escolha um que já está na sua base</summary>
              <div className="filmpick">
                {picks.map(m => (
                  <div key={m.id} className={'pick' + (m.id === selectedId ? ' sel' : '')}
                       onClick={() => selectPick(m)} title={m.title}>
                    <Poster title={m.title} posterUrl={m.poster_url} palette={m.poster_palette} />
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* ── Data + nota ── */}
          <div className="modal-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="modal-label">Quando você viu?</label>
              <input className="date-input" type="date" value={watchedDate} max={todayLocalISO()}
                     onChange={e => setWatchedDate(e.target.value)} />
            </div>
            <div>
              <label className="modal-label">Sua nota</label>
              <RateInput value={rating} onChange={setRating} />
            </div>
          </div>

          {/* ── Marcadores ── */}
          <div className="modal-field">
            <label className="modal-label">Marcadores</label>
            <div className="toggle-row">
              <button className={'toggle-pill like' + (liked ? ' on' : '')} onClick={() => setLiked(v => !v)}>
                <Heart filled={liked} /> Curtir
              </button>
              <button className={'toggle-pill rw' + (rewatch ? ' on' : '')} onClick={() => setRewatch(v => !v)}>
                <Icon name="rewatch" /> Revisão
              </button>
            </div>
          </div>

          {/* ── Anotação ── */}
          <div className="modal-field">
            <label className="modal-label">Anotação <span className="ml-hint">· opcional</span></label>
            <textarea className="note-input" value={note} onChange={e => setNote(e.target.value)}
                      placeholder="O que ficou desse filme?" />
          </div>

          {error && <p className="detail-empty" style={{ color: 'var(--heart)' }}>{error}</p>}

          <div className="modal-foot">
            <span className="hint"><kbd>⌘</kbd> <kbd>↵</kbd> para logar</span>
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button className="btn btn-primary" onClick={doSave} disabled={submitting || !selectedId}>
              <Icon name="check" /> {submitting ? 'Salvando…' : 'Logar filme'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
