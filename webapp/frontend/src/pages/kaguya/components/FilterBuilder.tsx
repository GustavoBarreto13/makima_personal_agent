// Construtor de filtro (a DSL das smart-lists): combinador E/OU + condições {campo, operador, valor}. Usado pela view
// do Kanban (poucos campos) e pela smart-list (todos). Os operadores espelham `_FIELD_OPS` do backend; o valor muda de
// tipo conforme o campo (prioridade, data, lista, etiqueta, estado, sim/não…).

import { Button, Chip, DatePicker, IconButton, Input, Select, SegmentedControl } from '../../../design'
import { kaguyaApi } from '../api'
import { safe, useLoad } from '../lib/useLoad'
import type { FilterCombinator, FilterCondition, FilterField, FilterRules, Group, Project, TaskContext } from '../types'
import { TYPE_OPTIONS } from '../lib/schemas'

interface FieldDef { field: FilterField; label: string }

/** Os campos que a view do Kanban oferece. */
export const KANBAN_FIELDS: FieldDef[] = [
  { field: 'priority', label: 'Prioridade' }, { field: 'due_date', label: 'Vencimento' }, { field: 'tag', label: 'Etiqueta' },
  { field: 'state', label: 'Estado' }, { field: 'text', label: 'Texto' },
]
/** Todos os campos de uma smart-list. */
export const SMARTLIST_FIELDS: FieldDef[] = [
  ...KANBAN_FIELDS,
  { field: 'type', label: 'Tipo' }, { field: 'project_id', label: 'Lista' }, { field: 'group_id', label: 'Grupo' }, { field: 'space', label: 'Espaço' },
  { field: 'gtd_status', label: 'Status GTD' }, { field: 'context_id', label: 'Onde (@)' },
  { field: 'duration_min', label: 'Estimativa' }, { field: 'start_date', label: 'Adiada até' }, { field: 'follow_up_date', label: 'Cobrar em' },
  { field: 'completed_at', label: 'Concluída em' },
  { field: 'my_day', label: 'No Meu Dia' }, { field: 'recurring', label: 'Recorrente' }, { field: 'blocked', label: 'Bloqueada' },
  { field: 'has_children', label: 'Tem subtarefas' }, { field: 'has_description', label: 'Tem notas' },
  { field: 'assignee', label: 'Responsável' }, { field: 'waiting_person', label: 'Aguardando resposta de' },
]
export const FILTER_FIELDS = KANBAN_FIELDS

const BOOL_OPS = [{ op: 'eq', label: 'é' }]
const DATE_OPS = [
  { op: 'within', label: 'dentro de' }, { op: 'before', label: 'antes de' }, { op: 'after', label: 'depois de' }, { op: 'eq', label: 'na data' }, { op: 'none', label: 'sem data' },
]
const OPS: Record<FilterField, { op: string; label: string }[]> = {
  priority: [{ op: 'gte', label: '≥' }, { op: 'eq', label: '=' }, { op: 'lte', label: '≤' }],
  due_date: [{ op: 'within', label: 'dentro de' }, { op: 'overdue', label: 'vencidas' }, { op: 'before', label: 'antes de' }, { op: 'after', label: 'depois de' }, { op: 'eq', label: 'na data' }, { op: 'none', label: 'sem data' }],
  tag: [{ op: 'has', label: 'tem' }, { op: 'not_has', label: 'não tem' }],
  project_id: [{ op: 'in', label: 'é uma de' }, { op: 'not_in', label: 'não é nenhuma de' }],
  group_id: [{ op: 'in', label: 'é um de' }, { op: 'not_in', label: 'não é nenhum de' }],
  type: [{ op: 'in', label: 'é' }, { op: 'not_in', label: 'não é' }],
  state: [{ op: 'eq', label: 'é' }],
  text: [{ op: 'contains', label: 'contém' }],
  gtd_status: [{ op: 'eq', label: 'é' }, { op: 'none', label: 'não classificada' }],
  context_id: [{ op: 'eq', label: 'é' }, { op: 'none', label: 'sem local' }],
  space: [{ op: 'eq', label: 'é' }],
  duration_min: [{ op: 'gte', label: '≥' }, { op: 'lte', label: '≤' }, { op: 'eq', label: '=' }, { op: 'none', label: 'sem estimativa' }],
  start_date: [{ op: 'deferred', label: 'adiadas (ainda não começaram)' }, { op: 'before', label: 'antes de' }, { op: 'after', label: 'depois de' }, { op: 'eq', label: 'na data' }, { op: 'none', label: 'sem data' }],
  follow_up_date: DATE_OPS,
  completed_at: [{ op: 'within', label: 'nos últimos' }, { op: 'before', label: 'antes de' }, { op: 'after', label: 'depois de' }, { op: 'eq', label: 'na data' }],
  my_day: BOOL_OPS, recurring: BOOL_OPS, blocked: BOOL_OPS, has_children: BOOL_OPS, has_description: BOOL_OPS,
  assignee: [{ op: 'has', label: 'tem' }, { op: 'not_has', label: 'não tem' }],
  waiting_person: [{ op: 'has', label: 'tem' }, { op: 'not_has', label: 'não tem' }],
}

/** Campos cujo valor é uma lista (escolhida por chips, abaixo do campo e do operador). */
const MULTI_FIELDS: FilterField[] = ['project_id', 'group_id', 'type']
const BOOLEAN_FIELDS: FilterField[] = ['my_day', 'recurring', 'blocked', 'has_children', 'has_description']
const NO_VALUE_OPS = new Set(['overdue', 'none', 'deferred'])
const GTD = [{ v: 'next_action', l: 'Próxima ação' }, { v: 'waiting', l: 'Aguardando' }, { v: 'someday', l: 'Algum dia' }]

/** Valor inicial coerente para um par (campo, operador). */
export function defaultValue(field: FilterField, op: string, today: string): unknown {
  if (NO_VALUE_OPS.has(op)) return null
  if (BOOLEAN_FIELDS.includes(field)) return true
  switch (field) {
    case 'priority': return 2
    case 'state': return 'open'
    case 'space': return 'work'
    case 'gtd_status': return 'next_action'
    case 'duration_min': return 15
    case 'project_id': case 'group_id': case 'type': return []
    case 'context_id': return null
    case 'due_date': case 'follow_up_date': case 'completed_at': return op === 'within' ? '7d' : today
    case 'start_date': return today
    default: return ''
  }
}

/** Seleção múltipla por chips (listas, grupos, tipos): o valor da condição é uma lista de ids/valores. */
function MultiPick({ label, value, options, onChange }: { label: string; value: unknown; options: { value: string | number; label: string }[]; onChange: (next: (string | number)[]) => void }) {
  const cur = (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]) as (string | number)[]
  const toggle = (v: string | number) => onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
  return (
    <div className="kn-fb-multi" role="group" aria-label={label}>
      {options.map((o) => <Chip key={o.value} on={cur.includes(o.value)} aria-pressed={cur.includes(o.value)} onClick={() => toggle(o.value)}>{o.label}</Chip>)}
    </div>
  )
}

interface Props {
  value: FilterRules
  onChange: (next: FilterRules) => void
  today: string
  fields?: FieldDef[]
  projects?: Project[]
  groups?: Group[]
  contexts?: TaskContext[]
  /** Pessoas da Komi (campos Responsável e Aguardando resposta de). */
  people?: { id: string; name: string }[]
}

export function FilterBuilder({ value, onChange, today, fields = KANBAN_FIELDS, projects = [], groups = [], contexts = [], people = [] }: Props) {
  const set = (conditions: FilterCondition[]) => onChange({ ...value, conditions })
  const patch = (i: number, p: Partial<FilterCondition>) => set(value.conditions.map((c, idx) => (idx === i ? { ...c, ...p } : c)))
  const changeField = (i: number, field: FilterField) => patch(i, { field, op: OPS[field][0].op, value: defaultValue(field, OPS[field][0].op, today) })
  const changeOp = (i: number, op: string) => patch(i, { op, value: defaultValue(value.conditions[i].field, op, today) })

  const valueInput = (c: FilterCondition, i: number) => {
    const label = `Valor da condição ${i + 1}`
    if (NO_VALUE_OPS.has(c.op)) return <span className="ds-hint">—</span>
    if (BOOLEAN_FIELDS.includes(c.field)) {
      return (
        <Select aria-label={label} value={String(c.value !== false)} onChange={(e) => patch(i, { value: e.target.value === 'true' })}>
          <option value="true">Sim</option><option value="false">Não</option>
        </Select>
      )
    }
    switch (c.field) {
      case 'priority': return (
        <Select aria-label={label} value={Number(c.value)} onChange={(e) => patch(i, { value: Number(e.target.value) })}>
          <option value={3}>Alta</option><option value={2}>Média</option><option value={1}>Baixa</option><option value={0}>Nenhuma</option>
        </Select>
      )
      case 'state': return (
        <Select aria-label={label} value={String(c.value)} onChange={(e) => patch(i, { value: e.target.value })}>
          <option value="open">Aberta</option><option value="completed">Concluída</option>
        </Select>
      )
      case 'space': return (
        <Select aria-label={label} value={String(c.value)} onChange={(e) => patch(i, { value: e.target.value })}>
          <option value="work">Trabalho</option><option value="personal">Pessoal</option>
        </Select>
      )
      case 'gtd_status': return (
        <Select aria-label={label} value={String(c.value)} onChange={(e) => patch(i, { value: e.target.value })}>
          {GTD.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
        </Select>
      )
      case 'project_id': return <MultiPick label={label} value={c.value} options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => patch(i, { value: v })} />
      case 'group_id': return <MultiPick label={label} value={c.value} options={groups.map((g) => ({ value: g.id, label: g.name }))} onChange={(v) => patch(i, { value: v })} />
      case 'type': return <MultiPick label={label} value={c.value} options={TYPE_OPTIONS} onChange={(v) => patch(i, { value: v })} />
      case 'context_id': return (
        <Select aria-label={label} value={String(c.value ?? '')} onChange={(e) => patch(i, { value: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Escolher local…</option>{contexts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      )
      case 'assignee': case 'waiting_person': return (
        <Select aria-label={label} value={String(c.value ?? '')} onChange={(e) => patch(i, { value: e.target.value })}>
          <option value="">Escolher pessoa…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )
      case 'duration_min': return <Input aria-label="Minutos" type="number" min={0} value={Number(c.value) || 0} onChange={(e) => patch(i, { value: Math.max(0, Number(e.target.value) || 0) })} />
      case 'due_date': case 'follow_up_date': case 'completed_at': case 'start_date':
        if (c.op === 'within') {
          const days = Number(String(c.value ?? '7d').replace('d', '')) || 7
          return <Input aria-label="Dias" type="number" min={0} value={days} onChange={(e) => patch(i, { value: `${Math.max(0, Number(e.target.value) || 0)}d` })} />
        }
        return <DatePicker value={String(c.value ?? today)} onChange={(iso) => patch(i, { value: iso })} />
      default: return <Input aria-label={label} value={String(c.value ?? '')} placeholder={c.field === 'tag' ? 'nome da etiqueta' : 'texto'} onChange={(e) => patch(i, { value: e.target.value })} />
    }
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
        <div key={i} className={`kn-fb-row${MULTI_FIELDS.includes(c.field) ? ' kn-fb-row-multi' : ''}`}>
          <Select aria-label={`Campo da condição ${i + 1}`} value={c.field} onChange={(e) => changeField(i, e.target.value as FilterField)}>
            {fields.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
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

/** O que os seletores de valor do construtor precisam além das listas e grupos: os locais e as pessoas (Komi). */
export function useFilterLookups() {
  const contexts = useLoad<TaskContext[]>(() => safe(() => kaguyaApi.listContexts(), []), [])
  const people = useLoad<{ id: string; name: string }[]>(() => safe(() => kaguyaApi.listPeople().then((all) => all.map((p) => ({ id: p.id, name: p.name }))), []), [])
  return {
    contexts: contexts.state.status === 'ok' ? contexts.state.data : [],
    people: people.state.status === 'ok' ? people.state.data : [],
  }
}
