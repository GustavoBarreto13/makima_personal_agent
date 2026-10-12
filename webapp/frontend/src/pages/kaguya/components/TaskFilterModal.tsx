// O modal de Filtros da Kaguya — o mesmo na Lista, no Quadro, na Matriz e no Calendário. Duas partes que se somam:
//  1) filtros rápidos (Tipo, Lista e Grupo com “só estas / todas menos estas”, prioridade, vencimento, etiquetas, GTD, local,
//     interruptores): instantâneos, no cliente, com chips dos ativos;
//  2) regras avançadas (E/OU): o construtor completo das smart-lists, que o servidor avalia e devolve os ids que casam.
// Nas telas de uma lista só, o filtro de Lista (e o de Grupo) nem existe: quem decide é o esquema (`makeTasksSchema`).

import { useState } from 'react'
import { Button, Field, FilterFacets, Input, Modal, toast } from '../../../design'
import { pluralize } from '../../../design/core/format'
import type { CollectionSchema } from '../../../design/core/collection'
import type { UseCollection } from '../../../design/headless/useCollection'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import type { FilterRules, Task } from '../types'
import { FilterBuilder, SMARTLIST_FIELDS, useFilterLookups } from './FilterBuilder'
import { DEFAULT_DISPLAY } from './KanbanViewModal'

const EMPTY: FilterRules = { combinator: 'and', conditions: [] }
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

interface Props {
  schema: CollectionSchema<Task>
  c: UseCollection<Task>
  /** Todas as tarefas da tela (as opções de etiquetas vêm daqui). */
  items: Task[]
  /** Regras avançadas em vigor. */
  rules: FilterRules | null
  onRules: (next: FilterRules | null) => void
  /** Limpa os filtros rápidos e as regras. */
  onClear: () => void
  onClose: () => void
  /** Só o quadro de uma lista guarda views: com isto, a seção avançada oferece “Guardar como View”. */
  onViewSaved?: () => void
  noun?: [string, string]
}

export function TaskFilterModal({ schema, c, items, rules, onRules, onClear, onClose, onViewSaved, noun = ['tarefa', 'tarefas'] }: Props) {
  const k = useKaguya()
  const lookups = useFilterLookups()
  const [draft, setDraft] = useState<FilterRules>(rules ?? EMPTY)
  const [viewName, setViewName] = useState('')
  const [saving, setSaving] = useState(false)

  const saveAsView = async () => {
    if (!viewName.trim()) { toast('Dê um nome à view para salvar.', { tone: 'error' }); return }
    setSaving(true)
    try {
      await kaguyaApi.createKanbanView({ name: viewName.trim(), display: DEFAULT_DISPLAY, filter: draft })
      toast('View salva.', { tone: 'success' })
      onViewSaved?.()
      onRules(null)
      onClose()
    } catch (e) { toast(reason(e, 'Não foi possível salvar a view.'), { tone: 'error' }) } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Filtros"
      size="lg"
      onClose={onClose}
      footer={(
        <>
          <Button onClick={() => { onClear(); setDraft(EMPTY) }}>Limpar</Button>
          <Button variant="primary" onClick={onClose}>Ver {pluralize(c.result.count, noun[0], noun[1])}</Button>
        </>
      )}
    >
      <div className="kn-fm">
        <FilterFacets schema={schema} c={c} items={items} />
        <section className="kn-fm-adv" aria-labelledby="kn-fm-adv-h">
          <h3 className="kn-h3" id="kn-fm-adv-h">Regras avançadas (E/OU)</h3>
          <p className="ds-hint">Combine condições com “Todas (E)” ou “Qualquer (OU)”: estimativa, adiada, cobrar em, responsável, datas exatas… Elas se somam aos filtros acima.</p>
          <FilterBuilder value={draft} onChange={setDraft} today={k.today} fields={SMARTLIST_FIELDS} projects={k.projects} groups={k.groups} contexts={lookups.contexts} people={lookups.people} />
          <div className="kn-fm-actions">
            <Button variant="primary" disabled={draft.conditions.length === 0} onClick={() => onRules(draft)}>{rules ? 'Atualizar regras' : 'Aplicar regras'}</Button>
            {rules && <Button variant="ghost" onClick={() => { onRules(null); setDraft(EMPTY) }}>Limpar regras</Button>}
            {rules && <span className="ds-hint">{rules.conditions.length} {rules.conditions.length === 1 ? 'regra aplicada' : 'regras aplicadas'}</span>}
          </div>
          {onViewSaved && (
            <Field label="Guardar como View" hint="Opcional: cria uma View do quadro com estas regras, para escolher depois no seletor.">{(f) => (
              <span className="kn-quick-i">
                <Input {...f} value={viewName} placeholder="Nome da view" onChange={(e) => setViewName(e.target.value)} />
                <Button icon="add" disabled={saving || !viewName.trim() || draft.conditions.length === 0} onClick={() => void saveAsView()}>Salvar view</Button>
              </span>
            )}</Field>
          )}
        </section>
      </div>
    </Modal>
  )
}
