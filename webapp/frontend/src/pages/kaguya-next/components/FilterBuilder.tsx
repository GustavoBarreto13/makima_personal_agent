// Construtor de filtro (a DSL das smart-lists): combinador E/OU + condições {campo, operador, valor}. Usado pela view
// do Kanban e pela smart-list — os operadores espelham `_FIELD_OPS` do backend.

import { Button, DatePicker, IconButton, Input, Select, SegmentedControl } from '../../../design'
import type { FilterCombinator, FilterCondition, FilterField, FilterRules } from '../types'

export const FILTER_FIELDS: { field: FilterField; label: string }[] = [
  { field: 'priority', label: 'Prioridade' }, { field: 'due_date', label: 'Vencimento' }, { field: 'tag', label: 'Etiqueta' },
  { field: 'state', label: 'Estado' }, { field: 'text', label: 'Texto' },
]

const OPS: Record<FilterField, { op: string; label: string }[]> = {
  priority: [{ op: 'gte', label: '≥' }, { op: 'eq', label: '=' }, { op: 'lte', label: '≤' }],
  due_date: [
    { op: 'within', label: 'dentro de' }, { op: 'overdue', label: 'vencidas' }, { op: 'before', label: 'antes de' },
    { op: 'after', label: 'depois de' }, { op: 'eq', label: 'na data' }, { op: 'none', label: 'sem data' },
  ],
  tag: [{ op: 'has', label: 'tem' }, { op: 'not_has', label: 'não tem' }],
  project_id: [{ op: 'in', label: 'é' }, { op: 'not_in', label: 'não é' }],
  state: [{ op: 'eq', label: 'é' }],
  text: [{ op: 'contains', label: 'contém' }],
  gtd_status: [{ op: 'eq', label: 'é' }, { op: 'none', label: 'não classificada' }],
  context_id: [{ op: 'eq', label: 'é' }, { op: 'none', label: 'sem contexto' }],
}

/** Valor inicial coerente para um par (campo, operador). */
export function defaultValue(field: FilterField, op: string, today: string): unknown {
  if (field === 'priority') return 2
  if (field === 'due_date') return op === 'within' ? '7d' : op === 'overdue' || op === 'none' ? null : today
  if (field === 'state') return 'open'
  return ''
}

export function FilterBuilder({ value, onChange, today }: { value: FilterRules; onChange: (next: FilterRules) => void; today: string }) {
  const set = (conditions: FilterCondition[]) => onChange({ ...value, conditions })
  const patch = (i: number, p: Partial<FilterCondition>) => set(value.conditions.map((c, idx) => (idx === i ? { ...c, ...p } : c)))
  const changeField = (i: number, field: FilterField) => patch(i, { field, op: OPS[field][0].op, value: defaultValue(field, OPS[field][0].op, today) })
  const changeOp = (i: number, op: string) => patch(i, { op, value: defaultValue(value.conditions[i].field, op, today) })

  const valueInput = (c: FilterCondition, i: number) => {
    const label = `Valor da condição ${i + 1}`
    if (c.field === 'priority') return (
      <Select aria-label={label} value={Number(c.value)} onChange={(e) => patch(i, { value: Number(e.target.value) })}>
        <option value={3}>Alta</option><option value={2}>Média</option><option value={1}>Baixa</option><option value={0}>Nenhuma</option>
      </Select>
    )
    if (c.field === 'due_date') {
      if (c.op === 'overdue' || c.op === 'none') return <span className="ds-hint">—</span>
      if (c.op === 'within') {
        const days = Number(String(c.value ?? '7d').replace('d', '')) || 7
        return <Input aria-label="Dias" type="number" min={0} value={days} onChange={(e) => patch(i, { value: `${Math.max(0, Number(e.target.value) || 0)}d` })} />
      }
      return <DatePicker value={String(c.value ?? today)} onChange={(iso) => patch(i, { value: iso })} />
    }
    if (c.field === 'state') return (
      <Select aria-label={label} value={String(c.value)} onChange={(e) => patch(i, { value: e.target.value })}>
        <option value="open">Aberta</option><option value="completed">Concluída</option>
      </Select>
    )
    return <Input aria-label={label} value={String(c.value ?? '')} placeholder={c.field === 'tag' ? 'nome da etiqueta' : 'texto'} onChange={(e) => patch(i, { value: e.target.value })} />
  }

  return (
    <div className="kn-fb">
      <SegmentedControl<FilterCombinator>
        label="Combinar condições"
        value={value.combinator}
        onChange={(combinator) => onChange({ ...value, combinator })}
        options={[{ value: 'and', label: 'Todas (E)' }, { value: 'or', label: 'Qualquer (OU)' }]}
      />
      {value.conditions.map((c, i) => (
        <div key={i} className="kn-fb-row">
          <Select aria-label={`Campo da condição ${i + 1}`} value={c.field} onChange={(e) => changeField(i, e.target.value as FilterField)}>
            {FILTER_FIELDS.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
          </Select>
          <Select aria-label={`Operador da condição ${i + 1}`} value={c.op} onChange={(e) => changeOp(i, e.target.value)}>
            {OPS[c.field].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
          </Select>
          {valueInput(c, i)}
          <IconButton icon="close" label={`Remover condição ${i + 1}`} onClick={() => set(value.conditions.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <Button size="sm" icon="add" onClick={() => set([...value.conditions, { field: 'tag', op: 'has', value: '' }])}>Adicionar condição</Button>
    </div>
  )
}
