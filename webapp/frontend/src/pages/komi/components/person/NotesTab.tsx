// Anotações: presentes, do que gosta, do que não gosta e notas. Quem é "ambos" tem Pessoal e Trabalho separados.
// A IA só SUGERE (a partir da memória): a sugestão fica num bloco à parte, com a fonte, e só vira anotação se você
// aceitar (podendo editar antes). Descartada, não volta a ser sugerida.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, ErrorState, Field, Icon, IconButton, LoadingState, Modal, SegmentedControl, Select, Tag, Textarea } from '../../../../design'
import { toast } from '../../../../design/headless/toast'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { NOTE, NOTE_ORDER, RECORD_SPACE } from '../../lib/kinds'
import { useLoad } from '../../lib/useLoad'
import type { NoteKind, PersonNote, PersonRow, RecordSpace } from '../../types'

function NoteEditor({ note, person, onClose, onSave, title }: { note: { text: string; kind: NoteKind; context: RecordSpace }; person: PersonRow; onClose: () => void; onSave: (n: { text: string; kind: NoteKind; context: RecordSpace }) => Promise<void>; title: string }) {
  const [d, setD] = useState(note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!d.text.trim()) { setError('Escreva a anotação.'); return }
    setSaving(true)
    try { await onSave({ ...d, text: d.text.trim() }); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); setSaving(false) }
  }
  return (
    <Modal
      title={title}
      size="sm"
      dirty={JSON.stringify(d) !== JSON.stringify(note)}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void submit()}>Salvar</Button></>}
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <Field label="Tipo">
          {(a) => <Select {...a} value={d.kind} onChange={(e) => { setD({ ...d, kind: e.target.value as NoteKind }); setError(null) }}>{NOTE_ORDER.map((k) => <option key={k} value={k}>{NOTE[k].label}</option>)}</Select>}
        </Field>
        <Field label="Anotação" error={error} hint={NOTE[d.kind].hint}>
          {(a) => <Textarea {...a} rows={3} autoFocus value={d.text} onChange={(e) => { setD({ ...d, text: e.target.value }); setError(null) }} />}
        </Field>
        {person.context === 'both' && (
          <Field label="É de…">
            {() => <SegmentedControl<RecordSpace> label="Espaço da anotação" value={d.context} options={[{ value: 'personal', label: 'Pessoal', icon: 'personal' }, { value: 'work', label: 'Trabalho', icon: 'work' }]} onChange={(context) => setD({ ...d, context })} />}
          </Field>
        )}
      </div>
    </Modal>
  )
}

function Group({ kind, notes, onEdit, onRemove }: { kind: NoteKind; notes: PersonNote[]; onEdit: (n: PersonNote) => void; onRemove: (n: PersonNote) => void }) {
  if (!notes.length) return null
  return (
    <div className="km-notegroup">
      <h4 className="km-label"><Icon name={NOTE[kind].icon} size={13} /> {NOTE[kind].plural}</h4>
      <ul className="km-notes">
        {notes.map((n) => (
          <li key={n.id} className="km-note">
            <span className="km-note-text">{n.text}{n.source === 'ia' && <> <Tag pr>IA</Tag></>}</span>
            <IconButton icon="edit" label="Editar anotação" size={15} onClick={() => onEdit(n)} />
            <IconButton icon="delete" label="Apagar anotação" size={15} onClick={() => onRemove(n)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function NotesTab({ person }: { person: PersonRow }) {
  const komi = useKomi()
  const navigate = useNavigate()
  const { state, retry } = useLoad(() => komiApi.notes(person.id), [person.id, komi.rev])
  const [editing, setEditing] = useState<{ kind: 'new' } | { kind: 'edit'; note: PersonNote } | { kind: 'accept'; note: PersonNote } | null>(null)

  const all = useMemo(() => (state.status === 'ok' ? state.data : []), [state])
  const active = all.filter((n) => n.status === 'ativa')
  const suggested = all.filter((n) => n.status === 'sugerida')
  const defaultSpace: RecordSpace = person.context === 'both' ? (komi.prefs.space === 'work' ? 'work' : 'personal') : person.context

  const remove = async (n: PersonNote) => {
    try {
      await komiApi.removeNote(n.id)
      komi.reload()
      toast('Anotação apagada', { tone: 'success', undo: () => { komiApi.restoreNote(n.id).then(komi.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
    } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível apagar.', { tone: 'error' }) }
  }
  const dismiss = async (n: PersonNote) => {
    try { await komiApi.dismissNote(n.id); komi.reload(); toast('Sugestão descartada — não volta a ser sugerida') } catch { toast('Não foi possível descartar.', { tone: 'error' }) }
  }

  if (state.status === 'loading') return <LoadingState variant="row" count={3} />
  if (state.status === 'error') return <ErrorState onRetry={retry} />

  const spaces: (RecordSpace | null)[] = person.context === 'both' ? ['personal', 'work'] : [null]

  return (
    <div className="ds-stack km-tab">
      <div><Button variant="primary" size="sm" icon="add" onClick={() => setEditing({ kind: 'new' })}>Nova anotação</Button></div>

      {suggested.length > 0 && (
        <section className="ds-card km-suggest" aria-label="Sugestões da IA">
          <h3 className="km-lane-t"><Icon name="sparkles" size={15} /> Sugestões da IA <span className="ds-mono">{suggested.length}</span></h3>
          <p className="ds-hint">Saíram da memória da pessoa. Só viram anotação se você aceitar.</p>
          <ul className="km-notes">
            {suggested.map((n) => (
              <li key={n.id} className="km-note km-note-sug">
                <span className="km-note-text">
                  <Tag>{NOTE[n.kind].label}</Tag> {n.text}
                  {person.context === 'both' && <> <Tag pr>{RECORD_SPACE[n.context]}</Tag></>}
                  {n.source_refs.slice(0, 2).map((r, i) => (
                    <button key={i} type="button" className="km-cite km-cite-wide" onClick={() => r.deep_link && navigate(r.deep_link)}>{r.title}</button>
                  ))}
                </span>
                <Button size="sm" icon="check" onClick={() => { komiApi.acceptNote(n.id).then(() => { komi.reload(); toast('Anotação aceita', { tone: 'success' }) }).catch(() => toast('Não foi possível aceitar.', { tone: 'error' })) }}>Aceitar</Button>
                <IconButton icon="edit" label="Editar e aceitar" size={15} onClick={() => setEditing({ kind: 'accept', note: n })} />
                <IconButton icon="close" label="Descartar sugestão" size={15} onClick={() => void dismiss(n)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 && suggested.length === 0 ? (
        <EmptyState icon="gift" title="Nenhuma anotação ainda" hint="Guarde ideias de presente, do que ela gosta e do que não gosta. Dá para pedir à IA que sugira a partir da memória." action={<Button icon="add" onClick={() => setEditing({ kind: 'new' })}>Nova anotação</Button>} />
      ) : (
        spaces.map((space) => {
          const mine = active.filter((n) => space === null || n.context === space)
          if (space !== null && mine.length === 0) return null
          return (
            <section key={space ?? 'one'} className="km-lane">
              {space && <h3 className="km-lane-t">{RECORD_SPACE[space]} <span className="ds-mono">{mine.length}</span></h3>}
              {NOTE_ORDER.map((k) => <Group key={k} kind={k} notes={mine.filter((n) => n.kind === k)} onEdit={(n) => setEditing({ kind: 'edit', note: n })} onRemove={(n) => void remove(n)} />)}
            </section>
          )
        })
      )}

      {editing?.kind === 'new' && (
        <NoteEditor title="Nova anotação" note={{ text: '', kind: 'nota', context: defaultSpace }} person={person} onClose={() => setEditing(null)}
          onSave={async (n) => { await komiApi.addNote(person.id, n); komi.reload() }} />
      )}
      {editing?.kind === 'edit' && (
        <NoteEditor title="Editar anotação" note={{ text: editing.note.text, kind: editing.note.kind, context: editing.note.context }} person={person} onClose={() => setEditing(null)}
          onSave={async (n) => { await komiApi.updateNote(editing.note.id, n); komi.reload() }} />
      )}
      {editing?.kind === 'accept' && (
        <NoteEditor title="Editar e aceitar sugestão" note={{ text: editing.note.text, kind: editing.note.kind, context: editing.note.context }} person={person} onClose={() => setEditing(null)}
          onSave={async (n) => { await komiApi.acceptNote(editing.note.id, { text: n.text, kind: n.kind }); komi.reload(); toast('Anotação aceita', { tone: 'success' }) }} />
      )}
    </div>
  )
}
