// Datas: o aniversário (campo da pessoa, sempre no topo) e as outras datas importantes — casamento, formatura,
// o que você quiser — cada uma com seu lembrete. Nada disso vira tarefa: aparece no calendário da Kaguya como
// evento e o lembrete chega por ele.

import { useState } from 'react'
import { Button, DatePicker, EmptyState, Field, Icon, IconButton, Input, Modal, Select, Tag, Toggle } from '../../../../design'
import { toast } from '../../../../design/headless/toast'
import { diffDays, fmtDate } from '../../../../design/core/format'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { dayMonth, inLabel, nextOccurrence, remindOrNull, remindText, turningAge } from '../../lib/dates'
import { REMIND_OPTIONS } from '../../lib/personForm'
import type { OtherDate, PersonDetail } from '../../types'

type Saved = Required<OtherDate>

function DateEditor({ personId, item, onClose }: { personId: string; item: Saved | null; onClose: () => void }) {
  const komi = useKomi()
  const start = { label: item?.label ?? '', date: item?.date ?? komi.today, recurring: item?.recurring ?? true, remind: item?.remind_days_before ?? 1 }
  const [d, setD] = useState(start)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!d.label.trim()) { setError('Diga o que é a data.'); return }
    if (/anivers/i.test(d.label)) { setError('O aniversário é um campo da pessoa: edite no topo desta aba.'); return }
    setSaving(true)
    try {
      const body = { label: d.label.trim(), date: d.date, recurring: d.recurring, remind_days_before: d.remind }
      if (item) await komiApi.updateDate(personId, item.id, body); else await komiApi.addDate(personId, body)
      komi.reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); setSaving(false) }
  }
  return (
    <Modal title={item ? 'Editar data' : 'Nova data importante'} size="sm" dirty={JSON.stringify(d) !== JSON.stringify(start)} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void submit()}>Salvar</Button></>}>
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <Field label="O que é?" error={error}>{(a) => <Input {...a} autoFocus value={d.label} placeholder="Casamento, formatura…" onChange={(e) => { setD({ ...d, label: e.target.value }); setError(null) }} />}</Field>
        <Field label="Quando?">{(a) => <DatePicker {...a} value={d.date} onChange={(date) => setD({ ...d, date })} />}</Field>
        <Field label="Repete todo ano">{() => <Toggle checked={d.recurring} label="Repete todo ano" onChange={(recurring) => setD({ ...d, recurring })} />}</Field>
        <Field label="Lembrar">
          {(a) => <Select {...a} value={d.remind} onChange={(e) => setD({ ...d, remind: Number(e.target.value) })}>{REMIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}
        </Field>
      </div>
    </Modal>
  )
}

export function DatesTab({ detail }: { detail: PersonDetail }) {
  const komi = useKomi()
  const p = detail.perfil
  const [editing, setEditing] = useState<Saved | 'new' | null>(null)

  const hasBirthday = !!(p.birth_day && p.birth_month)
  const next = hasBirthday ? nextOccurrence(p.birth_month as number, p.birth_day as number, komi.today) : null
  const age = next ? turningAge(p.birth_year, next) : null

  const remove = async (d: Saved) => {
    try {
      await komiApi.removeDate(p.id, d.id)
      komi.reload()
      toast('Data apagada', {
        tone: 'success',
        undo: () => { komiApi.addDate(p.id, { label: d.label, date: d.date, recurring: d.recurring, remind_days_before: d.remind_days_before ?? -1 }).then(komi.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) },
      })
    } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível apagar.', { tone: 'error' }) }
  }

  return (
    <div className="ds-stack km-tab">
      <section className="ds-card km-birth" aria-label="Aniversário">
        <Icon name="cake" size={22} />
        <div className="km-birth-main">
          <b className="km-name">Aniversário</b>
          {hasBirthday && next ? (
            <span className="km-detail">
              {dayMonth(p.birth_day as number, p.birth_month as number)}{p.birth_year ? ` de ${p.birth_year}` : ''} · {inLabel(diffDays(komi.today, next))}{age ? ` · faz ${age} anos` : ''}
            </span>
          ) : <span className="km-detail">Ainda não cadastrado.</span>}
        </div>
        {hasBirthday && <Tag>{remindText(remindOrNull(p.birthday_remind_days))}</Tag>}
        <Button size="sm" icon="edit" onClick={() => komi.openPerson({ mode: 'edit', id: p.id })}>{hasBirthday ? 'Editar' : 'Cadastrar'}</Button>
      </section>

      <div className="km-lane-head">
        <h3 className="km-lane-t">Outras datas importantes <span className="ds-mono">{detail.datas.length}</span></h3>
        <Button size="sm" icon="add" onClick={() => setEditing('new')}>Adicionar data</Button>
      </div>
      {detail.datas.length === 0 ? (
        <EmptyState icon="calendar" title="Nenhuma outra data" hint="Casamento, formatura, aniversário de namoro… Cada uma lembra você no calendário." action={<Button icon="add" onClick={() => setEditing('new')}>Adicionar data</Button>} />
      ) : (
        <ul className="ds-card km-memlist">
          {detail.datas.map((d) => (
            <li key={d.id} className="km-mem">
              <span className="km-mem-icon" aria-hidden="true"><Icon name="calendar" size={16} /></span>
              <span className="km-mem-main">
                <b className="km-mem-t">{d.label}</b>
                <span className="km-mem-m">{fmtDate(d.date)}{d.recurring ? ' · todo ano' : ''} · {remindText(remindOrNull(d.remind_days_before))}</span>
              </span>
              <IconButton icon="edit" label={`Editar ${d.label}`} size={15} onClick={() => setEditing(d)} />
              <IconButton icon="delete" label={`Apagar ${d.label}`} size={15} onClick={() => void remove(d)} />
            </li>
          ))}
        </ul>
      )}
      {editing && <DateEditor personId={p.id} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
