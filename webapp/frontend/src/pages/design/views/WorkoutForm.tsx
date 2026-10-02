// Formulário completo de treino (modal; vira bottom sheet no celular). Abre pelo "Mais detalhes" da
// captura rápida (Shift+Enter) já preenchido, ou pelo botão Editar do detalhe.

import { useState } from 'react'
import type { CaptureResult } from '../../../design/core/capture'
import { todayISO } from '../../../design/core/format'
import { useHotkeys } from '../../../design/headless/useHotkeys'
import { Button, DatePicker, Field, Input, Modal, NumberInput, RateInput, SegmentedControl, Select, TagInput, Textarea } from '../../../design'
import { guessType, PLACES, type Workout, type WorkoutType } from '../demoData'

interface Draft {
  title: string
  type: WorkoutType
  date: string
  mins: number
  place: string
  rating: number
  tags: string[]
  notes: string
}

function initial(w: Workout | null, prefill: CaptureResult | null): Draft {
  if (w) return { title: w.title, type: w.type, date: w.date, mins: w.mins, place: w.place, rating: w.rating, tags: [...w.tags], notes: '' }
  const f = prefill?.fields
  return {
    title: f?.title ?? '', type: prefill ? guessType(prefill) : 'Força', date: f?.dueDate ?? todayISO(), mins: f?.duration ?? 45,
    place: f?.place ?? PLACES[0], rating: f?.rating ?? 0, tags: f?.tags ?? [], notes: '',
  }
}

export function WorkoutForm({ workout, prefill, onClose, onSave }: { workout: Workout | null; prefill: CaptureResult | null; onClose: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(() => initial(workout, prefill))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((cur) => ({ ...cur, [k]: v })); setDirty(true); if (k === 'title') setError(null) }

  const save = () => {
    if (d.title.trim().length < 3) { setError('Informe um título com pelo menos 3 letras.'); return }
    setDirty(false)
    onSave({ ...d, title: d.title.trim() })
  }
  // Ctrl+Enter salva, mesmo com o foco num campo.
  useHotkeys([{ keys: 'mod+enter', global: true, handler: (e) => { e.preventDefault(); save() } }])

  return (
    <Modal
      title={workout ? 'Editar treino' : 'Registrar treino'}
      onClose={onClose}
      dirty={dirty}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{workout ? 'Salvar alterações' : 'Salvar treino'}</Button></>}
    >
      <Field label="Título" error={error}>
        {(a) => <Input {...a} data-autofocus="" value={d.title} placeholder="Ex.: Pernas pesadas" autoComplete="off" onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <div className="ds-field">
        <span className="ds-lbl-f">Tipo</span>
        <SegmentedControl label="Tipo" value={d.type} onChange={(t) => set('type', t)} options={(['Força', 'Corrida', 'HIIT', 'Mobilidade'] as WorkoutType[]).map((t) => ({ value: t, label: t }))} />
      </div>
      <div className="ds-cols2" style={{ gap: 12 }}>
        <Field label="Data">{(a) => <DatePicker {...a} value={d.date} onChange={(v) => set('date', v)} />}</Field>
        <Field label="Duração (min)">{(a) => <NumberInput {...a} min={5} max={300} step={5} value={d.mins} onChange={(e) => set('mins', Number(e.target.value))} />}</Field>
      </div>
      <Field label="Local">{(a) => <Select {...a} value={d.place} onChange={(e) => set('place', e.target.value)}>{PLACES.map((p) => <option key={p}>{p}</option>)}</Select>}</Field>
      <div className="ds-field"><span className="ds-lbl-f">Nota</span><RateInput value={d.rating} onChange={(v) => set('rating', v)} /></div>
      <Field label="Etiquetas">{(a) => <TagInput id={a.id} value={d.tags} onChange={(t) => set('tags', t)} />}</Field>
      <Field label="Notas">{(a) => <Textarea {...a} value={d.notes} placeholder="Como foi o treino?" onChange={(e) => set('notes', e.target.value)} />}</Field>
    </Modal>
  )
}

export type { Draft as WorkoutDraft }
