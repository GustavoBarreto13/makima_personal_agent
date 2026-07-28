// Modal "Editar filme" — edição manual dos campos de catálogo (spec 050, US5/FR-008).
// Reestilizado no padrão .modal-* do design handoff (só visual — mesma lógica).
// Título, ano, diretor, gêneros, duração e sinopse. Campos pessoais (nota, coração,
// status, anotações) já são editáveis por outros controles da tela e não entram aqui.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie } from '../types'
import { Icon } from '../ui/Icon'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label="Editar filme">
        <div className="modal-head">
          <span className="modal-title">Editar filme</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Título</label>
            <input className="text-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="modal-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="modal-label">Ano</label>
              <input className="text-input" type="number" value={year} onChange={e => setYear(e.target.value)} />
            </div>
            <div>
              <label className="modal-label">Duração (min)</label>
              <input className="text-input" type="number" value={runtime} onChange={e => setRuntime(e.target.value)} />
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Diretor(es) <span className="ml-hint">· separados por vírgula</span></label>
            <input className="text-input" value={director} onChange={e => setDirector(e.target.value)} />
          </div>

          <div className="modal-field">
            <label className="modal-label">Gêneros <span className="ml-hint">· separados por vírgula</span></label>
            <input className="text-input" value={genres} onChange={e => setGenres(e.target.value)} />
          </div>

          <div className="modal-field">
            <label className="modal-label">Sinopse</label>
            <textarea className="note-input" rows={4} value={overview} onChange={e => setOverview(e.target.value)} />
          </div>

          <div className="modal-foot">
            <div className="grow" />
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
              <Icon name="check" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
