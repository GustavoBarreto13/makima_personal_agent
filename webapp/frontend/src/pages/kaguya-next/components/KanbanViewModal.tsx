// Criar, editar e excluir uma view do Kanban: quais adornos aparecem (medidor de capacidade, anel de subtarefas,
// rodapé, chips do card), as 3 métricas do rodapé e um filtro opcional (a DSL das smart-lists). A view “Completa”
// é de sistema e não tem o botão de excluir.

import { useState } from 'react'
import { Button, Chip, Field, Input, Modal, Select, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import type { FilterRules, KanbanView, KanbanViewDisplay, SummaryMetric } from '../types'
import { FilterBuilder, SMARTLIST_FIELDS, useFilterLookups } from './FilterBuilder'
import { DEFAULT_SLOTS } from './KanbanSummary'

const ADORNOS: { key: keyof KanbanViewDisplay['adornos']; label: string }[] = [
  { key: 'capacity_meter', label: 'Medidor de capacidade' }, { key: 'subtask_ring', label: 'Anel de subtarefas' },
  { key: 'summary_footer', label: 'Rodapé-resumo' }, { key: 'card_chips', label: 'Chips no card' },
]
const METRICS: { value: SummaryMetric; label: string }[] = [
  { value: 'abertas', label: 'Tarefas abertas' }, { value: 'tempo_estimado', label: 'Tempo estimado' }, { value: 'concluidas', label: 'Concluídas' },
  { value: 'concluidas_hoje', label: 'Concluídas hoje' }, { value: 'em_andamento', label: 'Em andamento' },
]
export const DEFAULT_DISPLAY: KanbanViewDisplay = {
  adornos: { capacity_meter: true, subtask_ring: true, summary_footer: true, card_chips: true },
  slots: DEFAULT_SLOTS,
}

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function KanbanViewModal({ view, onClose, onSaved }: { view?: KanbanView; onClose: () => void; onSaved: () => void }) {
  const k = useKaguya()
  const lookups = useFilterLookups()
  const [name, setName] = useState(view?.name ?? '')
  const [adornos, setAdornos] = useState(view?.display.adornos ?? DEFAULT_DISPLAY.adornos)
  const [slots, setSlots] = useState<SummaryMetric[]>(view?.display.slots?.length === 3 ? view.display.slots : DEFAULT_DISPLAY.slots)
  const [hasFilter, setHasFilter] = useState(view?.filter != null)
  const [rules, setRules] = useState<FilterRules>(view?.filter?.conditions?.length ? view.filter : { combinator: 'and', conditions: [{ field: 'priority', op: 'gte', value: 2 }] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à view.'); return }
    if (hasFilter && rules.conditions.length === 0) { setError('Adicione ao menos uma condição ao filtro.'); return }
    setSaving(true)
    try {
      const display: KanbanViewDisplay = { adornos, slots: slots.slice(0, 3) }
      if (!view) await kaguyaApi.createKanbanView({ name: name.trim(), display, filter: hasFilter ? rules : null })
      // Com filtro envia as regras; sem filtro, `clear_filter` remove qualquer filtro anterior.
      else await kaguyaApi.updateKanbanView(view.id, hasFilter ? { name: name.trim(), display, filter: rules } : { name: name.trim(), display, clear_filter: true })
      toast(view ? 'View atualizada.' : 'View criada.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) {
      setError(reason(e, 'Não foi possível salvar a view.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!view) return
    const ok = await confirm({ title: `Excluir a view “${view.name}”?`, body: 'Os quadros que usavam esta view voltam para a “Completa”.', confirmLabel: 'Excluir view', danger: true })
    if (!ok) return
    try { await kaguyaApi.deleteKanbanView(view.id); toast('View excluída.', { tone: 'success' }); onSaved(); onClose() }
    catch (e) { toast(reason(e, 'Não foi possível excluir a view.'), { tone: 'error' }) }
  }

  return (
    <Modal
      title={view ? 'Editar view' : 'Nova view'}
      size="md"
      dirty
      onClose={onClose}
      footer={(
        <>
          {view && !view.is_builtin && <Button variant="danger" icon="delete" onClick={() => void remove()}>Excluir view</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Nome" error={error || undefined}>{(c) => (
        <Input {...c} autoFocus value={name} placeholder="Ex.: Foco, Mínima…" onChange={(e) => { setName(e.target.value); setError('') }} />
      )}</Field>

      <Field label="Adornos visíveis">{() => (
        <div className="kn-chips" role="group" aria-label="Adornos visíveis">
          {ADORNOS.map((a) => (
            <Chip key={a.key} on={adornos[a.key]} aria-pressed={adornos[a.key]} onClick={() => setAdornos((s) => ({ ...s, [a.key]: !s[a.key] }))}>{a.label}</Chip>
          ))}
        </div>
      )}</Field>

      <Field label="Rodapé — 3 métricas">{() => (
        <div className="kn-props">
          {[0, 1, 2].map((i) => (
            <Select key={i} aria-label={`Métrica ${i + 1} do rodapé`} value={slots[i]} onChange={(e) => setSlots((s) => s.map((m, idx) => (idx === i ? (e.target.value as SummaryMetric) : m)))}>
              {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          ))}
        </div>
      )}</Field>

      <Field label="Filtro">{() => (
        <>
          <Chip on={hasFilter} aria-pressed={hasFilter} onClick={() => setHasFilter((f) => !f)}>Filtrar tarefas</Chip>
          {hasFilter && <FilterBuilder value={rules} onChange={setRules} today={k.today} fields={SMARTLIST_FIELDS} projects={k.projects} groups={k.groups} contexts={lookups.contexts} people={lookups.people} />}
        </>
      )}</Field>
    </Modal>
  )
}
