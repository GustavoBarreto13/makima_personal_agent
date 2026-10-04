// Editar uma sessão do diário: data, nota, onde, com quem, etiquetas e resenha.

import { useState } from 'react'
import { Button, DatePicker, Field, Modal, PersonPicker, RateInput, TagInput, Textarea, type PersonOption } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { komiApi } from '../../komi/komiApi'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import type { DiaryEntry } from '../types'
import { PlacePicker } from './PlacePicker'

export function SessionEditor({ entry, onClose }: { entry: DiaryEntry; onClose: () => void }) {
  const akane = useAkane()
  const [date, setDate] = useState(entry.watched_date)
  const [rating, setRating] = useState<number | null>(entry.rating)
  const [review, setReview] = useState(entry.review ?? '')
  const [tags, setTags] = useState(entry.tags)
  const [place, setPlace] = useState<string | null>(entry.watch_location?.id ?? null)
  const [people, setPeople] = useState<PersonOption[]>(entry.companions)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = date !== entry.watched_date || rating !== entry.rating || review !== (entry.review ?? '')
    || JSON.stringify(tags) !== JSON.stringify(entry.tags) || place !== (entry.watch_location?.id ?? null)
    || JSON.stringify(people.map((p) => p.id)) !== JSON.stringify(entry.companions.map((p) => p.id))

  const save = async () => {
    if (!date) { setError('Escolha a data.'); return }
    if (date > akane.today) { setError('A data não pode ser no futuro.'); return }
    setSaving(true)
    try {
      await akaneApi.updateDiaryEntry(entry.id, {
        watched_date: date, ...(rating ? { rating } : {}), review, tags, companion_ids: people.map((p) => p.id), watch_location_id: place,
      })
      akane.reload()
      toast('Sessão atualizada', { tone: 'success' })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Editar sessão · ${entry.movie_title ?? 'Filme'}`}
      dirty={dirty}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Salvar</Button></>}
    >
      <div className="ds-stack">
        <div className="ds-cols2">
          <Field label="Data" error={error?.includes('data') ? error : null}>{(a) => <DatePicker {...a} value={date} onChange={(v) => { setDate(v); setError(null) }} />}</Field>
          <Field label="Nota">{() => <RateInput value={rating ?? 0} onChange={(v) => setRating(v || null)} />}</Field>
        </div>
        <Field label="Onde assisti">
          {(a) => <PlacePicker id={a.id} value={place} onChange={setPlace} known={entry.watch_location ? [entry.watch_location] : []} />}
        </Field>
        <Field label="Com quem">
          {(a) => (
            <PersonPicker
              id={a.id}
              value={people}
              onChange={setPeople}
              search={async (q) => (await komiApi.search(q)).matches.map((m) => ({ id: m.id, name: m.name, hint: m.relationship }))}
              onCreate={async (name) => ({ id: (await komiApi.create({ name })).id, name })}
            />
          )}
        </Field>
        <Field label="Etiquetas">{(a) => <TagInput id={a.id} value={tags} onChange={setTags} />}</Field>
        <Field label="Resenha">{(a) => <Textarea {...a} rows={4} value={review} onChange={(e) => setReview(e.target.value)} />}</Field>
        {error && !error.includes('data') && <p className="ds-errmsg" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
