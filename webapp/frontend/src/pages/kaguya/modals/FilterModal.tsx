// FilterModal — criar/editar/excluir uma smart-list (filtro salvo) — fatia 013 / P2.
// Construtor de regras: combinador (and/or) + linhas de condição {campo, operador, valor}.
// O valor muda de tipo conforme o campo (prioridade, data, tag, lista, estado, texto).
// Ao salvar, as linhas viram o objeto `rules` da DSL que o backend traduz em WHERE.

import { useState } from 'react'
import type { Project, Filter, FilterField, FilterCondition, FilterCombinator } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface FilterModalProps {
  mode: 'create' | 'edit'
  filter?: Filter
  projects: Project[]
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Campos disponíveis (rótulos em pt-BR). Espelha _FIELD_OPS de tools_filters.py.
const FIELDS: { field: FilterField; label: string }[] = [
  { field: 'priority', label: 'Prioridade' },
  { field: 'due_date', label: 'Vencimento' },
  { field: 'tag', label: 'Tag' },
  { field: 'project_id', label: 'Lista' },
  { field: 'state', label: 'Estado' },
  { field: 'text', label: 'Texto' },
]

// Operadores por campo (valor técnico → rótulo).
const OPS: Record<FilterField, { op: string; label: string }[]> = {
  priority: [{ op: 'gte', label: '≥' }, { op: 'eq', label: '=' }, { op: 'lte', label: '≤' }],
  due_date: [
    { op: 'within', label: 'dentro de' }, { op: 'overdue', label: 'vencidas' },
    { op: 'before', label: 'antes de' }, { op: 'after', label: 'depois de' },
    { op: 'eq', label: 'na data' }, { op: 'none', label: 'sem data' },
  ],
  tag: [{ op: 'has', label: 'tem' }, { op: 'not_has', label: 'não tem' }],
  project_id: [{ op: 'in', label: 'é' }, { op: 'not_in', label: 'não é' }],
  state: [{ op: 'eq', label: 'é' }],
  text: [{ op: 'contains', label: 'contém' }],
}

// Emojis sugeridos para a smart-list (atalho; pode digitar outro).
const ICONS = ['🔎', '⭐', '🔥', '⏰', '🎯', '🛒', '🏠', '💼', '🧠', '⚡']

// Data de hoje em "AAAA-MM-DD" (default dos operadores de data com valor).
const today = () => new Date().toISOString().slice(0, 10)

// Primeiro operador de um campo (usado ao trocar o campo).
const firstOp = (field: FilterField) => OPS[field][0].op

// Valor inicial coerente para um par (campo, operador).
function defaultValue(field: FilterField, op: string, projects: Project[]): unknown {
  if (field === 'priority') return 2
  if (field === 'due_date') {
    if (op === 'within') return '7d'
    if (op === 'overdue' || op === 'none') return null
    return today()
  }
  if (field === 'project_id') {
    const first = projects.find((p) => !p.is_inbox) ?? projects[0]
    return first ? [first.id] : []
  }
  if (field === 'state') return 'open'
  return ''  // tag, text
}

export function FilterModal({ mode, filter, projects, onClose, onSaved, toast }: FilterModalProps) {
  const [name, setName] = useState(filter?.name ?? '')
  const [icon, setIcon] = useState(filter?.icon ?? '')
  const [combinator, setCombinator] = useState<FilterCombinator>(filter?.rules?.combinator ?? 'and')
  // As condições começam do filtro existente (edição) ou com uma linha em branco (criação).
  const [conditions, setConditions] = useState<FilterCondition[]>(
    filter?.rules?.conditions?.length ? filter.rules.conditions : [{ field: 'priority', op: 'gte', value: 2 }],
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  // Atualiza uma condição pelo índice (patch parcial dos campos da linha).
  const patchCond = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  // Trocar o CAMPO reinicia operador e valor (cada campo tem operadores/valor próprios).
  const changeField = (i: number, field: FilterField) => {
    const op = firstOp(field)
    patchCond(i, { field, op, value: defaultValue(field, op, projects) })
  }
  // Trocar o OPERADOR pode mudar o tipo do valor (ex.: within usa "7d"; overdue não usa valor).
  const changeOp = (i: number, op: string) => {
    const field = conditions[i].field
    patchCond(i, { op, value: defaultValue(field, op, projects) })
  }

  const addCond = () => setConditions((cs) => [...cs, { field: 'tag', op: 'has', value: '' }])
  const removeCond = (i: number) => setConditions((cs) => cs.filter((_, idx) => idx !== i))

  // Renderiza o input de VALOR conforme o par (campo, operador).
  const valueInput = (c: FilterCondition, i: number) => {
    if (c.field === 'priority') {
      return (
        <select className="kg-select" value={Number(c.value)} onChange={(e) => patchCond(i, { value: Number(e.target.value) })}>
          <option value={3}>Alta</option>
          <option value={2}>Média</option>
          <option value={1}>Baixa</option>
          <option value={0}>Nenhuma</option>
        </select>
      )
    }
    if (c.field === 'due_date') {
      if (c.op === 'overdue' || c.op === 'none') return <span className="kg-cond-novalue">—</span>
      if (c.op === 'within') {
        // Valor "Nd": editamos só o número e remontamos a string.
        const days = Number(String(c.value ?? '7d').replace('d', '')) || 7
        return (
          <span className="kg-cond-days">
            <input className="kg-input" type="number" min={0} style={{ width: 64 }}
              value={days} onChange={(e) => patchCond(i, { value: `${Number(e.target.value) || 0}d` })} />
            dia(s)
          </span>
        )
      }
      return <input className="kg-input" type="date" value={String(c.value ?? today())} onChange={(e) => patchCond(i, { value: e.target.value })} />
    }
    if (c.field === 'project_id') {
      const current = Array.isArray(c.value) && c.value.length ? Number(c.value[0]) : ''
      return (
        <select className="kg-select" value={current} onChange={(e) => patchCond(i, { value: [Number(e.target.value)] })}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )
    }
    if (c.field === 'state') {
      return (
        <select className="kg-select" value={String(c.value)} onChange={(e) => patchCond(i, { value: e.target.value })}>
          <option value="open">Aberta</option>
          <option value="completed">Concluída</option>
        </select>
      )
    }
    // tag / text → texto livre
    return (
      <input className="kg-input" value={String(c.value ?? '')} placeholder={c.field === 'tag' ? 'nome da tag' : 'texto'}
        onChange={(e) => patchCond(i, { value: e.target.value })} />
    )
  }

  const save = async () => {
    if (!name.trim()) { toast('Dê um nome à smart-list.', 'err'); return }
    if (conditions.length === 0) { toast('Adicione ao menos uma condição.', 'err'); return }
    setSaving(true)
    try {
      const rules = { combinator, conditions }
      if (mode === 'create') { await kaguyaApi.createFilter({ name: name.trim(), rules, icon: icon || null }); toast('Smart-list criada.') }
      else if (filter) { await kaguyaApi.updateFilter(filter.id, { name: name.trim(), rules, icon: icon || null }); toast('Smart-list atualizada.') }
      onSaved(); onClose()
    } catch (e) {
      toast((e as Error).message || 'Não foi possível salvar a smart-list.', 'err')
    } finally { setSaving(false) }
  }

  const del = async () => {
    if (!filter) return
    try { await kaguyaApi.deleteFilter(filter.id); toast('Smart-list excluída.'); onSaved(); onClose() }
    catch { toast('Não foi possível excluir a smart-list.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova smart-list' : 'Editar smart-list'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Nome</span>
            <input className="kg-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Urgentes da semana" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Ícone</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ICONS.map((e) => (
                <button key={e} className={`kg-btn${icon === e ? ' kg-btn-primary' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setIcon(e)}>{e}</button>
              ))}
            </div>
          </div>

          {/* Combinador: casa TODAS (and) ou QUALQUER (or) condição. */}
          <div className="kg-field">
            <span className="kg-field-label">Casar</span>
            <div className="kg-segment" style={{ width: 220 }}>
              <button className={`kg-seg-opt${combinator === 'and' ? ' active' : ''}`} onClick={() => setCombinator('and')}>Todas (E)</button>
              <button className={`kg-seg-opt${combinator === 'or' ? ' active' : ''}`} onClick={() => setCombinator('or')}>Qualquer (OU)</button>
            </div>
          </div>

          {/* Condições */}
          <div className="kg-field">
            <span className="kg-field-label">Condições</span>
            {conditions.map((c, i) => (
              <div key={i} className="kg-cond-row">
                <select className="kg-select" value={c.field} onChange={(e) => changeField(i, e.target.value as FilterField)}>
                  {FIELDS.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                </select>
                <select className="kg-select" value={c.op} onChange={(e) => changeOp(i, e.target.value)}>
                  {OPS[c.field].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                {valueInput(c, i)}
                <button className="kg-icon-btn" onClick={() => removeCond(i)} aria-label="Remover condição"><Icon name="x" size={14} /></button>
              </div>
            ))}
            <button className="kg-btn kg-btn-ghost" style={{ marginTop: 8 }} onClick={addCond}>
              <Icon name="plus" size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />Adicionar condição
            </button>
          </div>

          {/* Exclusão (só em edição) */}
          {mode === 'edit' && filter && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir smart-list
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">Excluir esta smart-list? Nenhuma tarefa é afetada.</span>
                  <button className="kg-btn kg-btn-danger" onClick={del}>Sim, excluir</button>
                  <button className="kg-btn kg-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="kg-btn kg-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
