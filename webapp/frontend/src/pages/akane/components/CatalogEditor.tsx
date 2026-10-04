// Editar à mão os dados de catálogo de um filme (título, ano, direção, gêneros, duração, sinopse).
// Nota, curtida, sessões e etiquetas são pessoais e não passam por aqui.

import { useState } from 'react'
import { Button, Field, Input, Modal, NumberInput, TagInput, Textarea } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import type { Movie } from '../types'

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export function CatalogEditor({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const akane = useAkane()
  const [title, setTitle] = useState(movie.title)
  const [year, setYear] = useState(movie.year ? String(movie.year) : '')
  const [runtime, setRuntime] = useState(movie.runtime ? String(movie.runtime) : '')
  const [director, setDirector] = useState(movie.director)
  const [genres, setGenres] = useState(movie.genres)
  const [overview, setOverview] = useState(movie.overview ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const maxYear = Number(akane.today.slice(0, 4)) + 5
  const dirty = title !== movie.title || year !== (movie.year ? String(movie.year) : '') || runtime !== (movie.runtime ? String(movie.runtime) : '')
    || JSON.stringify(director) !== JSON.stringify(movie.director) || JSON.stringify(genres) !== JSON.stringify(movie.genres) || overview !== (movie.overview ?? '')

  const save = async () => {
    const e: Record<string, string> = {}
    const y = num(year)
    const r = num(runtime)
    if (!title.trim()) e.title = 'O título não pode ficar vazio.'
    if (y !== null && (!Number.isInteger(y) || y < 1888 || y > maxYear)) e.year = `Informe um ano entre 1888 e ${maxYear}.`
    if (r !== null && (!Number.isInteger(r) || r <= 0 || r > 1500)) e.runtime = 'Informe a duração em minutos (ex.: 120).'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      await akaneApi.updateCatalog(movie.id, {
        title: title.trim(), ...(y !== null ? { year: y } : {}), ...(r !== null ? { runtime: r } : {}), director, genres, overview,
      })
      akane.reload()
      toast('Dados do filme atualizados', { tone: 'success' })
      onClose()
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Não foi possível salvar.' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Editar dados do filme"
      dirty={dirty}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Salvar</Button></>}
    >
      <div className="ds-stack">
        <Field label="Título" error={errors.title}>{(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <div className="ds-cols2">
          <Field label="Ano" error={errors.year}>{(a) => <NumberInput {...a} value={year} onChange={(e) => setYear(e.target.value)} />}</Field>
          <Field label="Duração (min)" error={errors.runtime}>{(a) => <NumberInput {...a} value={runtime} onChange={(e) => setRuntime(e.target.value)} />}</Field>
        </div>
        <Field label="Direção" hint="Enter para adicionar mais de uma pessoa.">{(a) => <TagInput id={a.id} value={director} onChange={setDirector} />}</Field>
        <Field label="Gêneros">{(a) => <TagInput id={a.id} value={genres} onChange={setGenres} />}</Field>
        <Field label="Sinopse">{(a) => <Textarea {...a} rows={5} value={overview} onChange={(e) => setOverview(e.target.value)} />}</Field>
        {errors.form && <p className="ds-errmsg" role="alert">{errors.form}</p>}
      </div>
    </Modal>
  )
}
