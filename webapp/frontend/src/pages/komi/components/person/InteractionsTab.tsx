// Interações: o registro dos contatos com a pessoa (encontro, mensagem, ligação, vídeo), do mais recente ao mais
// antigo, agrupados por mês. Registrar abre o mesmo formulário da linha rápida; editar muda tipo, dia e nota;
// apagar tem Desfazer.

import { useMemo, useState } from 'react'
import { Button, DatePicker, EmptyState, ErrorState, Field, Icon, IconButton, LoadingState, Modal, SegmentedControl, Tag, Textarea } from '../../../../design'
import { toast } from '../../../../design/headless/toast'
import { fmtDate, fmtMonthYear } from '../../../../design/core/format'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { INTERACTION, INTERACTION_ORDER, RECORD_SPACE } from '../../lib/kinds'
import { useLoad } from '../../lib/useLoad'
import type { Interaction, InteractionKind, PersonRow, RecordSpace } from '../../types'

function InteractionEditor({ item, person, onClose }: { item: Interaction; person: PersonRow; onClose: () => void }) {
  const komi = useKomi()
  const start = { kind: item.kind, date: item.date, note: item.note ?? '', context: item.context }
  const [d, setD] = useState(start)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (d.date > komi.today) { setError('O contato precisa ser de hoje ou de antes.'); return }
    setSaving(true)
    try {
      await komiApi.updateInteraction(item.id, { kind: d.kind, happened_at: d.date, note: d.note.trim(), context: d.context })
      komi.reload()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); setSaving(false) }
  }
  return (
    <Modal title="Editar contato" size="sm" dirty={JSON.stringify(d) !== JSON.stringify(start)} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void submit()}>Salvar</Button></>}>
      <div className="ds-stack">
        <Field label="Como foi?">
          {() => <SegmentedControl<InteractionKind> label="Tipo de contato" value={d.kind} options={INTERACTION_ORDER.map((k) => ({ value: k, label: INTERACTION[k].label, icon: INTERACTION[k].icon }))} onChange={(kind) => setD({ ...d, kind })} />}
        </Field>
        <Field label="Quando?" error={error}>{(a) => <DatePicker {...a} value={d.date} onChange={(date) => { setD({ ...d, date }); setError(null) }} />}</Field>
        {person.context === 'both' && (
          <Field label="Foi de…">
            {() => <SegmentedControl<RecordSpace> label="Espaço do contato" value={d.context} options={[{ value: 'personal', label: 'Pessoal', icon: 'personal' }, { value: 'work', label: 'Trabalho', icon: 'work' }]} onChange={(context) => setD({ ...d, context })} />}
          </Field>
        )}
        <Field label="Uma linha sobre">{(a) => <Textarea {...a} rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />}</Field>
      </div>
    </Modal>
  )
}

export function InteractionsTab({ person }: { person: PersonRow }) {
  const komi = useKomi()
  const { state, retry } = useLoad(() => komiApi.interactions(person.id, 200), [person.id, komi.rev])
  const [editing, setEditing] = useState<Interaction | null>(null)

  const groups = useMemo(() => {
    if (state.status !== 'ok') return []
    const by = new Map<string, Interaction[]>()
    for (const i of state.data) by.set(i.date.slice(0, 7), [...(by.get(i.date.slice(0, 7)) ?? []), i])
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [state])

  const remove = async (i: Interaction) => {
    try {
      await komiApi.removeInteraction(i.id)
      komi.reload()
      toast('Contato apagado', { tone: 'success', undo: () => { komiApi.restoreInteraction(i.id).then(komi.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
    } catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível apagar.', { tone: 'error' }) }
  }

  if (state.status === 'loading') return <LoadingState variant="row" count={4} />
  if (state.status === 'error') return <ErrorState onRetry={retry} />

  const register = () => komi.openContact({ personId: person.id, typedName: '', kind: 'encontro', date: komi.today, note: '', context: null })

  return (
    <div className="ds-stack km-tab">
      <div><Button variant="primary" size="sm" icon="phone" onClick={register}>Registrar contato</Button></div>
      {groups.length === 0 ? (
        <EmptyState icon="phone" title="Nenhum contato registrado" hint={`Registre quando você falar com ${person.name}. Dá para escrever só “+${person.nickname || person.name} café ontem” na linha rápida do Início.`} action={<Button icon="phone" onClick={register}>Registrar contato</Button>} />
      ) : (
        groups.map(([month, list]) => (
          <section key={month} className="km-lane">
            <h3 className="km-lane-t">{fmtMonthYear(`${month}-01`)} <span className="ds-mono">{list.length}</span></h3>
            <ul className="ds-card km-memlist">
              {list.map((i) => (
                <li key={i.id} className="km-mem">
                  <span className="km-mem-icon" aria-hidden="true"><Icon name={INTERACTION[i.kind].icon} size={16} /></span>
                  <span className="km-mem-main">
                    <b className="km-mem-t">{INTERACTION[i.kind].label}</b>
                    {i.note && <span className="km-mem-s">{i.note}</span>}
                    <span className="km-mem-m">{fmtDate(i.date)}{person.context === 'both' && <> <Tag pr>{RECORD_SPACE[i.context]}</Tag></>}</span>
                  </span>
                  <IconButton icon="edit" label="Editar contato" size={15} onClick={() => setEditing(i)} />
                  <IconButton icon="delete" label="Apagar contato" size={15} onClick={() => void remove(i)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {editing && <InteractionEditor item={editing} person={person} onClose={() => setEditing(null)} />}
    </div>
  )
}
