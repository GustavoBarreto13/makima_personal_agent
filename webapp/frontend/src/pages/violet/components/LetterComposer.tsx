// Escrever (ou continuar) uma carta. A fonte é escolhida aqui mesmo, e o texto já aparece nela enquanto você
// escreve. Destinatário em texto livre + pessoas da Komi vinculadas (a carta aparece na página da pessoa).
// Rascunho salva e continua editável; lacrar é para sempre (pede confirmação).

import { useState } from 'react'
import { Button, Field, Input, Modal, PersonPicker, confirm, toast, type PersonOption } from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { fontClass } from '../lib/kinds'
import { createPerson, searchPeople } from '../lib/people'
import { violetApi } from '../violetApi'
import type { Font, Letter } from '../types'
import { FontChoice } from './FontPicker'
import { SmartTextarea } from './SmartTextarea'

export function LetterComposer({ date, letter, defaultFont, onClose, onSaved }: {
  date: string
  letter?: Letter | null
  defaultFont: Font
  onClose: () => void
  onSaved: (letter: Letter | null) => void
}) {
  const [recipient, setRecipient] = useState(letter?.recipient ?? '')
  const [title, setTitle] = useState(letter?.title ?? '')
  const [body, setBody] = useState(letter?.body ?? '')
  const [font, setFont] = useState<Font>(letter?.font ?? defaultFont)
  const [people, setPeople] = useState<PersonOption[]>(letter?.people.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar_url })) ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = recipient !== (letter?.recipient ?? '') || body !== (letter?.body ?? '') || title !== (letter?.title ?? '') || font !== (letter?.font ?? defaultFont)

  async function save(seal = false): Promise<Letter | null> {
    const to = recipient.trim() || people[0]?.name || ''
    if (!to) { setError('Para quem é a carta?'); return null }
    if (!body.trim()) { setError('A carta está vazia.'); return null }
    setSaving(true); setError(null)
    try {
      const fields = { recipient: to, title: title.trim() || null, body, font, person_ids: people.map((p) => p.id) }
      let saved: Letter
      if (letter) saved = (await violetApi.updateLetter(letter.id, fields)).letter
      else {
        const page = await violetApi.ensurePage(date)
        saved = (await violetApi.createLetter({ page_id: page.page.id as number, ...fields })).letter
      }
      if (seal) saved = (await violetApi.sealLetter(saved.id)).letter
      saved = { ...saved, date }
      onSaved(saved)
      toast(seal ? 'Carta lacrada.' : 'Rascunho salvo.', { tone: 'success' })
      return saved
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar a carta.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function seal() {
    const ok = await confirm({
      title: 'Lacrar a carta?',
      body: 'Uma carta lacrada não pode mais ser editada — vira um registro fechado deste dia.',
      confirmLabel: 'Lacrar', cancelLabel: 'Continuar escrevendo',
    })
    if (ok && await save(true)) onClose()
  }

  return (
    <Modal
      title={letter ? 'Continuar carta' : 'Nova carta'}
      onClose={onClose}
      dirty={dirty}
      size="lg"
      footer={
        <div className="vl-row vl-row-end">
          <span className="vl-muted ds-mono">{fmtDateLong(date)}</span>
          <span className="vl-spacer" />
          <Button variant="ghost" icon="seal" disabled={saving} onClick={() => void seal()}>Lacrar</Button>
          <Button variant="primary" icon="check" disabled={saving} onClick={() => void save().then((s) => { if (s) onClose() })}>{saving ? 'Salvando…' : 'Salvar rascunho'}</Button>
        </div>
      }
    >
      {error && <p className="vl-error" role="alert">{error}</p>}
      <div className="vl-letter-form">
        <Field label="Fonte da carta">
          {() => (<FontChoice value={font} onChange={setFont} label="Fonte da carta" />)}
        </Field>
        <Field label="Para" hint="Uma pessoa, você no futuro, uma cidade, um sentimento…">
          {(c) => (<Input {...c} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Para quem é?" autoFocus={!letter} />)}
        </Field>
        <Field label="Pessoas da Komi" hint="A carta aparece na página delas.">
          {() => (<PersonPicker value={people} onChange={setPeople} search={searchPeople} onCreate={createPerson} />)}
        </Field>
        <Field label="Título (opcional)">
          {(c) => (<Input {...c} value={title} onChange={(e) => setTitle(e.target.value)} />)}
        </Field>
        <div className={`vl-letter-paper ${fontClass(font)}`}>
          <span className="vl-letter-salute">{recipient.trim() ? `Para ${recipient.trim()},` : 'Para …,'}</span>
          <SmartTextarea
            className="vl-letter-body"
            value={body}
            onChange={setBody}
            placeholder="Escreva com calma. @ cita uma pessoa, / cita algo de outro agente."
            aria-label="Corpo da carta"
          />
        </div>
      </div>
    </Modal>
  )
}
