// Filtro avulso do quadro: o mesmo construtor completo das smart-lists (todos os campos), aplicado ao quadro na hora, sem
// salvar nada. Dá para limpar e, se ficou bom, guardar como uma View do quadro.

import { useState } from 'react'
import { Button, Field, Input, Modal, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import type { FilterRules } from '../types'
import { DEFAULT_DISPLAY } from './KanbanViewModal'
import { FilterBuilder, SMARTLIST_FIELDS, useFilterLookups } from './FilterBuilder'

const START: FilterRules = { combinator: 'and', conditions: [{ field: 'priority', op: 'gte', value: 2 }] }
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function BoardFilterModal({ current, onApply, onClose, onViewSaved }: {
  current: FilterRules | null
  onApply: (rules: FilterRules | null) => void
  onClose: () => void
  /** Só o quadro de uma lista guarda views; o do grupo não mostra "Guardar como View". */
  onViewSaved?: () => void
}) {
  const k = useKaguya()
  const lookups = useFilterLookups()
  const [rules, setRules] = useState<FilterRules>(current?.conditions?.length ? current : START)
  const [viewName, setViewName] = useState('')
  const [saving, setSaving] = useState(false)

  const apply = () => { onApply(rules.conditions.length ? rules : null); onClose() }
  const saveAsView = async () => {
    if (!viewName.trim()) { toast('Dê um nome à view para salvar.', { tone: 'error' }); return }
    setSaving(true)
    try {
      await kaguyaApi.createKanbanView({ name: viewName.trim(), display: DEFAULT_DISPLAY, filter: rules })
      toast('View salva.', { tone: 'success' })
      onViewSaved?.()
      onApply(null)
      onClose()
    } catch (e) { toast(reason(e, 'Não foi possível salvar a view.'), { tone: 'error' }) } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Filtrar o quadro"
      size="lg"
      onClose={onClose}
      footer={(
        <>
          {current && <Button variant="ghost" onClick={() => { onApply(null); onClose() }}>Limpar filtro</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={rules.conditions.length === 0} onClick={apply}>Aplicar</Button>
        </>
      )}
    >
      <FilterBuilder value={rules} onChange={setRules} today={k.today} fields={SMARTLIST_FIELDS} projects={k.projects} groups={k.groups} contexts={lookups.contexts} people={lookups.people} />
      {onViewSaved && <Field label="Guardar como View" hint="Opcional: cria uma View do quadro com este filtro, para escolher depois no seletor.">{(c) => (
        <span className="kn-quick-i">
          <Input {...c} value={viewName} placeholder="Nome da view" onChange={(e) => setViewName(e.target.value)} />
          <Button icon="add" disabled={saving || !viewName.trim()} onClick={() => void saveAsView()}>Salvar view</Button>
        </span>
      )}</Field>}
    </Modal>
  )
}
