// Registrar (ou editar) algo que você queria dizer e não disse. Pensado para ser rápido, de baixo para cima
// na cabeça: para quem → o que ficou preso → por que não disse (um toque). O "o que te impede" é opcional.
// Ao editar um já registrado, aparece também o desfecho: guardado, acabei falando, deixei ir.

import { useState } from 'react'
import { Button, Field, Input, Modal, PersonPicker, Textarea, toast, type PersonOption } from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { createPerson, searchPeople } from '../lib/people'
import { REASONS, STATUSES } from '../lib/unsaid'
import { violetApi } from '../violetApi'
import type { Unsaid, UnsaidReason, UnsaidStatus } from '../types'
import { SmartTextarea } from './SmartTextarea'

export function UnsaidComposer({ date, item, initialPerson, onClose, onSaved }: {
  date: string
  item?: Unsaid | null
  /** Pessoa já escolhida (veio da página dela). */
  initialPerson?: PersonOption | null
  onClose: () => void
  /** `null` quando ficou só na fila do aparelho (sem internet). */
  onSaved: (item: Unsaid | null) => void
}) {
  const [people, setPeople] = useState<PersonOption[]>(
    item?.people.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar_url })) ?? (initialPerson ? [initialPerson] : []),
  )
  const [recipient, setRecipient] = useState(item && !item.people.length ? item.recipient : '')
  const [body, setBody] = useState(item?.body ?? '')
  const [reason, setReason] = useState<UnsaidReason | null>(item?.reason ?? null)
  const [why, setWhy] = useState(item?.why ?? '')
  const [showWhy, setShowWhy] = useState(!!item?.why)
  const [status, setStatus] = useState<UnsaidStatus>(item?.status ?? 'kept')
  const [note, setNote] = useState(item?.outcome_note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = !!body || !!recipient || people.length > 0 || !!reason

  async function save() {
    const to = people[0]?.name ?? recipient.trim()
    if (!to) { setError('Para quem você queria dizer?'); return }
    if (!body.trim()) { setError('Escreva o que ficou preso.'); return }
    if (!reason) { setError('Escolha por que você não disse.'); return }
    setSaving(true); setError(null)
    try {
      const fields = { recipient: to, body, reason, why: why.trim() || null, person_ids: people.map((p) => p.id) }
      let saved: Unsaid | null = null
      if (item) {
        saved = (await violetApi.updateUnsaid(item.id, fields)).unsaid
        if (status !== item.status || (status !== 'kept' && note !== (item.outcome_note ?? ''))) {
          saved = (await violetApi.resolveUnsaid(item.id, status, note)).unsaid
        }
      } else {
        const w = await violetApi.createUnsaid({ date, ...fields })
        saved = w.queued ? null : w.data.unsaid
      }
      onSaved(saved ? { ...saved, date } : null)
      if (saved) toast('Guardado. Isso já saiu de você.', { tone: 'success' })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={item ? 'Não dito' : 'O que você não disse'}
      onClose={onClose}
      dirty={dirty}
      size="lg"
      footer={
        <div className="vl-row vl-row-end">
          <span className="vl-muted ds-mono">{fmtDateLong(item?.date ?? date)}</span>
          <span className="vl-spacer" />
          <Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      }
    >
      {error && <p className="vl-error" role="alert">{error}</p>}
      <div className="vl-letter-form">
        <Field label="Pra quem?" hint="Escolha da Komi ou escreva um nome.">
          {() => (<PersonPicker value={people} onChange={setPeople} search={searchPeople} onCreate={createPerson} />)}
        </Field>
        {!people.length && (
          <Field label="Ou o nome">
            {(c) => (<Input {...c} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Quem é?" />)}
          </Field>
        )}
        <div className="vl-letter-paper vl-unsaid-paper">
          <span className="vl-letter-salute">{(people[0]?.name ?? recipient.trim()) ? `Pra ${people[0]?.name ?? recipient.trim()},` : 'Pra …,'}</span>
          <SmartTextarea
            className="vl-letter-body"
            value={body}
            onChange={setBody}
            placeholder="Fala aqui o que ficou preso na garganta… ninguém vai ler."
            aria-label="O que você queria dizer"
            autoFocus={!item}
          />
        </div>
        <Field label="Por que você não disse?">
          {() => (
            <div className="vl-reasons" role="radiogroup" aria-label="Por que você não disse">
              {REASONS.map((r) => (
                <button key={r.value} type="button" role="radio" aria-checked={reason === r.value}
                  className={`vl-reason${reason === r.value ? ' vl-on' : ''}`} onClick={() => setReason(r.value)}>
                  <b>{r.label}</b><small>{r.hint}</small>
                </button>
              ))}
            </div>
          )}
        </Field>
        {showWhy ? (
          <Field label="O que te impede? (opcional)">
            {(c) => (<Textarea {...c} rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />)}
          </Field>
        ) : (
          <button type="button" className="vl-linklike" onClick={() => setShowWhy(true)}>+ contar o que me impede</button>
        )}
        {item && (
          <Field label="Como está isso hoje?">
            {() => (
              <div className="vl-reasons" role="radiogroup" aria-label="Desfecho">
                {STATUSES.map((s) => (
                  <button key={s.value} type="button" role="radio" aria-checked={status === s.value}
                    className={`vl-reason${status === s.value ? ' vl-on' : ''}`} onClick={() => setStatus(s.value)}>
                    <b>{s.label}</b>
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        {item && status !== 'kept' && (
          <Field label="Como foi? (opcional)">
            {(c) => (<Textarea {...c} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />)}
          </Field>
        )}
      </div>
    </Modal>
  )
}
