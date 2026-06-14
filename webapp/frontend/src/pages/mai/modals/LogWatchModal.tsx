// LogWatchModal — modal para registrar uma sessão de episódios.
// Campos: série alvo, data, temporada, ep_start, ep_end, nota, review.

import { useState, useEffect } from 'react'
import type { Series } from '../types'
import { maiApi } from '../maiApi'
import { RateInput } from '../components/Stars'
import { IconX } from '../components/MaiIcons'

interface Props {
  /** Se passado, pré-seleciona a série no modal. */
  prefilledSeriesId?: string | null
  prefilledTitle?: string | null
  onClose: () => void
  onSuccess: (msg: string) => void
}

/** LogWatchModal — modal de registro de sessão de episódios. */
export function LogWatchModal({ prefilledSeriesId, prefilledTitle, onClose, onSuccess }: Props) {
  // Dados do formulário
  const [seriesId,   setSeriesId]   = useState(prefilledSeriesId ?? '')
  const [seriesTitle,setSeriesTitle]= useState(prefilledTitle ?? '')
  const [date,       setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [season,     setSeason]     = useState<string>('')
  const [epStart,    setEpStart]    = useState<string>('')
  const [epEnd,      setEpEnd]      = useState<string>('')
  const [rating,     setRating]     = useState<number | null>(null)
  const [review,     setReview]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Busca de séries (quando não há pré-seleção)
  const [searchQ,   setSearchQ]   = useState('')
  const [options,   setOptions]   = useState<Series[]>([])
  const [searching, setSearching] = useState(false)

  // Busca séries no catálogo quando o usuário digita
  useEffect(() => {
    if (prefilledSeriesId || searchQ.trim().length < 2) {
      setOptions([])
      return
    }
    setSearching(true)
    maiApi.list()
      .then(res => {
        const all = (res as any).series as Series[]
        const q = searchQ.toLowerCase()
        setOptions(all.filter(s => s.title.toLowerCase().includes(q)).slice(0, 8))
      })
      .catch(() => setOptions([]))
      .finally(() => setSearching(false))
  }, [searchQ, prefilledSeriesId])

  function selectSeries(s: Series) {
    setSeriesId(s.id)
    setSeriesTitle(s.title)
    setOptions([])
    setSearchQ('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!seriesId) { setError('Selecione uma série'); return }

    setSaving(true)
    setError(null)

    try {
      await maiApi.logWatch(seriesId, {
        watched_date:   date,
        season_number:  season  ? parseInt(season)  : undefined,
        ep_start:       epStart ? parseInt(epStart) : undefined,
        ep_end:         epEnd   ? parseInt(epEnd)   : undefined,
        rating:         rating ?? undefined,
        review:         review || undefined,
      })

      const epsLabel = epStart
        ? `T${season} E${epStart}${epEnd && epEnd !== epStart ? `–${epEnd}` : ''}`
        : 'sessão'
      onSuccess(`${epsLabel} de "${seriesTitle}" registrada! 📺`)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar sessão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">📺 Registrar sessão</div>
          <button className="modal-x" onClick={onClose}><IconX /></button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {/* Série alvo */}
          {prefilledSeriesId ? (
            <div className="modal-field">
              <label className="modal-label">Série</label>
              <div className="log-target">
                <div className="lt-meta">
                  <div className="lt-title">{seriesTitle}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="modal-field">
              <label className="modal-label">Série</label>
              {seriesId ? (
                <div className="log-target" onClick={() => { setSeriesId(''); setSeriesTitle('') }} style={{ cursor: 'pointer' }}>
                  <div className="lt-meta"><div className="lt-title">{seriesTitle}</div></div>
                  <div className="lt-check"><IconX /></div>
                </div>
              ) : (
                <div>
                  <div className="series-search-bar">
                    <span>🔍</span>
                    <input
                      placeholder="Buscar série no catálogo…"
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      autoFocus
                    />
                    {searching && <div className="fs-spin" />}
                  </div>
                  {options.length > 0 && (
                    <div className="series-search-results">
                      {options.map(s => (
                        <div key={s.id} className="fs-result" onClick={() => selectSeries(s)}>
                          <div className="fs-meta">
                            <div className="fs-title">{s.title}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data */}
          <div className="modal-field">
            <label className="modal-label">Data da sessão</label>
            <input
              type="date"
              className="date-input"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          {/* Temporada + episódios */}
          <div className="modal-field">
            <label className="modal-label">
              Episódios <span className="ml-hint">(opcional)</span>
            </label>
            <div className="ep-range">
              <div>
                <input
                  type="number"
                  className="num-input"
                  placeholder="Temporada"
                  min={1}
                  value={season}
                  onChange={e => setSeason(e.target.value)}
                />
                <div className="field-cap">Temporada</div>
              </div>
              <div>
                <input
                  type="number"
                  className="num-input"
                  placeholder="Ep inicial"
                  min={1}
                  value={epStart}
                  onChange={e => setEpStart(e.target.value)}
                />
                <div className="field-cap">Ep inicial</div>
              </div>
              <div>
                <input
                  type="number"
                  className="num-input"
                  placeholder="Ep final"
                  min={1}
                  value={epEnd}
                  onChange={e => setEpEnd(e.target.value)}
                />
                <div className="field-cap">Ep final</div>
              </div>
            </div>
          </div>

          {/* Avaliação */}
          <div className="modal-field">
            <label className="modal-label">Avaliação</label>
            <RateInput value={rating} onChange={setRating} />
          </div>

          {/* Review */}
          <div className="modal-field">
            <label className="modal-label">
              Impressões <span className="ml-hint">(opcional)</span>
            </label>
            <textarea
              className="note-input"
              placeholder="O que achou desta sessão…"
              value={review}
              onChange={e => setReview(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--st-abandonada)', fontSize: 13, marginTop: 8 }}>
              ❌ {error}
            </div>
          )}

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <div className="grow" />
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : '📺 Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
