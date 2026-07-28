// Modal "Editar filme" — edição manual dos campos de catálogo (spec 050, US5/FR-008).
// Título, ano, diretor, gêneros, duração e sinopse. Campos pessoais (nota, coração,
// status, anotações) já são editáveis por outros controles da tela e não entram aqui.

import { useState } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie } from '../types'

interface EditMovieModalProps {
  movie: Movie
  onClose: () => void
  onToast: (msg: string) => void
  /** Chamado com o filme atualizado retornado pela API. */
  onSaved: (movie: Movie) => void
}

export function EditMovieModal({ movie, onClose, onToast, onSaved }: EditMovieModalProps) {
  const [title, setTitle] = useState(movie.title)
  const [year, setYear] = useState(movie.year != null ? String(movie.year) : '')
  const [director, setDirector] = useState(movie.director.join(', '))
  const [genres, setGenres] = useState(movie.genres.join(', '))
  const [runtime, setRuntime] = useState(movie.runtime != null ? String(movie.runtime) : '')
  const [overview, setOverview] = useState(movie.overview ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await akaneApi.updateCatalog(movie.id, {
        title: title.trim(),
        year: year.trim() ? Number(year.trim()) : undefined,
        director: director.split(',').map(d => d.trim()).filter(Boolean),
        genres: genres.split(',').map(g => g.trim()).filter(Boolean),
        runtime: runtime.trim() ? Number(runtime.trim()) : undefined,
        overview: overview.trim() || undefined,
      })
      onSaved(res.movie)
      onToast('Filme atualizado.')
      onClose()
    } catch {
      onToast('Erro ao salvar as alterações.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 460,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink)' }}>
            Editar filme
          </h3>
          <button className="ak-btn" onClick={onClose} style={{ fontSize: 14, padding: '3px 8px' }}>
            ✕
          </button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>Título</span>
          <input className="ak-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>Ano</span>
            <input className="ak-input" type="number" value={year} onChange={e => setYear(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>Duração (min)</span>
            <input className="ak-input" type="number" value={runtime} onChange={e => setRuntime(e.target.value)} />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>Diretor(es) — separados por vírgula</span>
          <input className="ak-input" value={director} onChange={e => setDirector(e.target.value)} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>Gêneros — separados por vírgula</span>
          <input className="ak-input" value={genres} onChange={e => setGenres(e.target.value)} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase' }}>Sinopse</span>
          <textarea
            className="ak-input"
            rows={4}
            value={overview}
            onChange={e => setOverview(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="ak-btn ak-btn-primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="ak-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
