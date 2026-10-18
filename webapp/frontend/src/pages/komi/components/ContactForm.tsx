// Formulário de registrar contato (o "Mais detalhes" da linha rápida): quem, como foi (encontro, mensagem,
// ligação, vídeo), quando, em que espaço (só pergunta se a pessoa é de trabalho e pessoal) e uma linha.

import { useMemo, useState } from 'react'
import { Button, DatePicker, Field, Modal, PersonPicker, SegmentedControl, Textarea, type PersonOption } from '../../../design'
import { useKomi } from '../context'
import type { ContactDraft } from '../lib/capture'
import { INTERACTION, INTERACTION_ORDER } from '../lib/kinds'
import { namesOf, norm, nameDetail } from '../lib/people'
import type { InteractionKind, PersonRow, RecordSpace } from '../types'

const asOption = (p: PersonRow): PersonOption => ({ id: p.id, name: p.name, hint: nameDetail(p) || undefined, avatar: p.avatar_url })

export function ContactForm({ initial, onClose }: { initial: ContactDraft; onClose: () => void }) {
  const komi = useKomi()
  const [d, setD] = useState<ContactDraft>(initial)
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const person = komi.people.find((p) => p.id === d.personId) ?? null
  const set = (patch: Partial<ContactDraft>) => { setD((cur) => ({ ...cur, ...patch })); setError(null) }
  const err = (field: string) => (error?.field === field ? error.message : null)
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)

  // Busca local (as pessoas já estão carregadas): por qualquer um dos nomes, só dentro do espaço escolhido no topo.
  const search = useMemo(() => (q: string): PersonOption[] => {
    const n = norm(q)
    return komi.people
      .filter((p) => namesOf(p).some((x) => norm(x).includes(n)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 8)
      .map(asOption)
  }, [komi.people])

  const submit = async () => {
    if (!person) { setError({ field: 'person', message: 'Escolha com quem foi o contato.' }); return }
    if (d.date > komi.today) { setError({ field: 'date', message: 'O contato precisa ser de hoje ou de antes.' }); return }
    setSaving(true)
    try {
      await komi.saveContact({ ...d, context: person.context === 'both' ? d.context ?? (komi.prefs.space === 'work' ? 'work' : 'personal') : person.context })
      onClose()
    } catch (e) {
      setError({ field: 'form', message: e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Registrar contato"
      size="md"
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving} onClick={() => void submit()}>Salvar</Button>
        </>
      }
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <Field label="Com quem?" error={err('person')} hint={!person && d.typedName ? `Não achei “${d.typedName}”. Busque pelo nome, apelido ou nome completo.` : undefined}>
          {(a) => (
            <PersonPicker
              id={a.id}
              value={person ? [asOption(person)] : []}
              // Escolha única: o último que entrou é quem vale.
              onChange={(list) => set({ personId: list[list.length - 1]?.id ?? null })}
              search={search}
            />
          )}
        </Field>

        <Field label="Como foi?">
          {() => (
            <SegmentedControl<InteractionKind>
              label="Tipo de contato"
              value={d.kind}
              options={INTERACTION_ORDER.map((k) => ({ value: k, label: INTERACTION[k].label, icon: INTERACTION[k].icon }))}
              onChange={(kind) => set({ kind })}
            />
          )}
        </Field>

        <div className="ds-cols2">
          <Field label="Quando?" error={err('date')}>{(a) => <DatePicker {...a} value={d.date} onChange={(date) => set({ date })} />}</Field>
          {person?.context === 'both' && (
            <Field label="Foi de…" hint="A pessoa é de trabalho e pessoal.">
              {() => (
                <SegmentedControl<RecordSpace>
                  label="Espaço do contato"
                  value={d.context ?? (komi.prefs.space === 'work' ? 'work' : 'personal')}
                  options={[{ value: 'personal', label: 'Pessoal', icon: 'personal' }, { value: 'work', label: 'Trabalho', icon: 'work' }]}
                  onChange={(context) => set({ context })}
                />
              )}
            </Field>
          )}
        </div>

        <Field label="Uma linha sobre" hint="Opcional.">
          {(a) => <Textarea {...a} rows={2} value={d.note} placeholder="Do que vocês falaram?" onChange={(e) => set({ note: e.target.value })} />}
        </Field>

        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
