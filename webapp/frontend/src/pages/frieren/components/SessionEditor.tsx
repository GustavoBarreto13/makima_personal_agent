// Editar uma sessão de leitura: onde parou (página, capítulo ou volume, conforme o livro), dia e a nota do dia
// (o EditLogModal do shell antigo). O servidor recalcula o avanço a partir da posição nova.

import { useState } from 'react'
import { Button, DatePicker, Field, Modal, NumberInput, Textarea } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { stoppedLabel } from '../lib/units'
import type { Session } from '../types'

export function SessionEditor({ session, onClose }: { session: Session; onClose: () => void }) {
  const frieren = useFrieren()
  const [page, setPage] = useState<number | null>(session.page)
  const [date, setDate] = useState(session.date)
  const [note, setNote] = useState(session.note)
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Posição em que a sessão começou: page_end − avanço da sessão.
  const onde = stoppedLabel(session.unit)
  const start = session.page - session.pages
  const dirty = page !== session.page || date !== session.date || note !== session.note

  const submit = async () => {
    if (page === null || !Number.isInteger(page)) { setError({ field: 'page', message: 'Informe onde você parou.' }); return }
    if (page < start) { setError({ field: 'page', message: `A sessão começou ${onde} ${start}.` }); return }
    if (!date) { setError({ field: 'date', message: 'Escolha o dia.' }); return }
    if (date > frieren.today) { setError({ field: 'date', message: 'A data não pode ser no futuro.' }); return }
    setSaving(true)
    try {
      await frierenApi.updateSession(session.bookId, session.id, { current_page: page, session_notes: note.trim(), log_date: date })
      frieren.reload()
      toast('Sessão atualizada', { tone: 'success' })
      onClose()
    } catch (e) {
      setError({ field: 'form', message: e instanceof Error ? e.message : 'Não foi possível salvar.' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Editar sessão · ${session.title}`}
      dirty={dirty}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving} onClick={() => void submit()}>Salvar</Button></>}
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <div className="ds-cols2">
          <Field label={`Parou ${onde}`} error={error?.field === 'page' ? error.message : null} hint={`Começou ${onde} ${start}.`}>
            {(a) => <NumberInput {...a} min={start} value={page ?? ''} onChange={(e) => { setPage(e.target.value === '' ? null : Math.round(Number(e.target.value))); setError(null) }} />}
          </Field>
          <Field label="Dia" error={error?.field === 'date' ? error.message : null}>
            {(a) => <DatePicker {...a} value={date} onChange={(v) => { setDate(v); setError(null) }} />}
          </Field>
        </div>
        <Field label="Nota do dia" hint="Deixe vazio para apagar.">
          {(a) => <Textarea {...a} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
