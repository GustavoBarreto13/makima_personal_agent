// AddSeriesModal — busca TMDB e adiciona série ao catálogo.
// Fluxo: buscar → selecionar resultado → escolher status → confirmar.

import { useState, useEffect, useRef } from 'react'
import type { MaiStatus } from '../types'
import { maiApi } from '../maiApi'
import { IconX, IconSearch, IconTv, IconPlus } from '../components/MaiIcons'

interface TmdbResult {
  tmdb_id: number
  title: string
  title_original: string
  first_air_date: string | null
  overview: string | null
  poster_url: string | null
  network: string | null
}

interface Props {
  onClose: () => void
  onSuccess: (msg: string) => void
}

const STATUS_OPTIONS: { value: MaiStatus; label: string }[] = [
  { value: 'quero_assistir', label: 'Quero assistir' },
  { value: 'assistindo',     label: 'Assistindo agora' },
  { value: 'concluida',      label: 'Já assisti' },
  { value: 'pausada',        label: 'Pausada' },
  { value: 'abandonada',     label: 'Abandonada' },
]

/** AddSeriesModal — busca série no TMDB e adiciona ao catálogo. */
export function AddSeriesModal({ onClose, onSuccess }: Props) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<TmdbResult[]>([])
  const [searching,setSearching]= useState(false)
  const [selected, setSelected] = useState<TmdbResult | null>(null)
  const [status,   setStatus]   = useState<MaiStatus>('quero_assistir')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Busca TMDB com debounce de 500ms para não disparar uma req a cada tecla
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      maiApi.search(query)
        .then(res => setResults((res as any).results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await maiApi.add({
        tmdb_id: selected.tmdb_id,
        title:   selected.title,
        status,
      })
      onSuccess(`"${selected.title}" adicionada ao catálogo! 📺`)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Erro ao adicionar série')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fs-modal">
        <div className="modal-head">
          <div className="modal-title">📺 Adicionar série</div>
          <button className="modal-x" onClick={onClose}><IconX /></button>
        </div>

        <div className="modal-body">
          {/* ── Campo de busca ──────────────────────────────────────────── */}
          <div className="fs-search-row">
            <div className="series-search-bar">
              <IconSearch style={{ opacity: 0.5, flexShrink: 0 }} />
              <input
                placeholder="Buscar série no TMDB…"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null) }}
                autoFocus
              />
              {searching && <div className="fs-spin" />}
            </div>
          </div>

          {/* ── Série selecionada ────────────────────────────────────────── */}
          {selected ? (
            <div className="fs-selected">
              {/* Preview do resultado selecionado */}
              <div className="fs-result fs-result-selected">
                <div className="fs-poster-thumb">
                  {selected.poster_url ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${selected.poster_url}`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : (
                    <div className="fs-poster-fallback"><IconTv /></div>
                  )}
                </div>
                <div className="fs-meta">
                  <div className="fs-title">{selected.title}</div>
                  {selected.title_original && selected.title_original !== selected.title && (
                    <div className="fs-orig">{selected.title_original}</div>
                  )}
                  <div className="fs-year">
                    {selected.first_air_date ? new Date(selected.first_air_date + 'T00:00:00').getFullYear() : '—'}
                    {selected.network && ` · ${selected.network}`}
                  </div>
                  {selected.overview && (
                    <div className="fs-overview">{selected.overview.slice(0, 140)}{selected.overview.length > 140 ? '…' : ''}</div>
                  )}
                </div>
                <button
                  className="fs-deselect"
                  onClick={() => setSelected(null)}
                  title="Escolher outra"
                >
                  <IconX />
                </button>
              </div>

              {/* Escolha de status */}
              <div className="modal-field" style={{ marginTop: 20 }}>
                <label className="modal-label">Status inicial</label>
                <div className="status-pills">
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      className={`status-pill${status === o.value ? ' active' : ''}`}
                      onClick={() => setStatus(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ color: 'var(--st-abandonada)', fontSize: 13, marginTop: 8 }}>
                  ❌ {error}
                </div>
              )}

              <div className="modal-foot" style={{ marginTop: 20 }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                <div className="grow" />
                <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                  {saving ? 'Adicionando…' : <><IconPlus /> Adicionar ao catálogo</>}
                </button>
              </div>
            </div>
          ) : (
            /* ── Lista de resultados ─────────────────────────────────── */
            <>
              {results.length === 0 && !searching && query.trim().length >= 2 && (
                <div className="fs-empty">Nenhuma série encontrada para "{query}".</div>
              )}

              {results.length === 0 && query.trim().length < 2 && (
                <div className="fs-hint">
                  <div className="fs-hint-ico">📺</div>
                  <div>Digite o título para buscar no TMDB</div>
                </div>
              )}

              <div className="fs-results-list">
                {results.map(r => (
                  <div key={r.tmdb_id} className="fs-result" onClick={() => setSelected(r)}>
                    <div className="fs-poster-thumb">
                      {r.poster_url ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${r.poster_url}`}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                        />
                      ) : (
                        <div className="fs-poster-fallback"><IconTv /></div>
                      )}
                    </div>
                    <div className="fs-meta">
                      <div className="fs-title">{r.title}</div>
                      {r.title_original && r.title_original !== r.title && (
                        <div className="fs-orig">{r.title_original}</div>
                      )}
                      <div className="fs-year">
                        {r.first_air_date ? new Date(r.first_air_date + 'T00:00:00').getFullYear() : '—'}
                        {r.network && ` · ${r.network}`}
                      </div>
                    </div>
                    <button className="btn btn-primary fs-add-btn" onClick={e => { e.stopPropagation(); setSelected(r) }}>
                      <IconPlus />
                    </button>
                  </div>
                ))}
              </div>

              {results.length > 0 && (
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
