// KanbanViewModal — criar/editar/excluir uma view de Kanban (spec 024, T015).
// Configura os adornos visíveis (capacity meter, anel de subtarefas, rodapé, chips)
// e as 3 métricas dos slots do rodapé. O filtro da view (FilterRules) é adicionado
// na US3 (T022) — aqui, na edição, o filtro existente é preservado intacto.
// A view built-in "Completa" é imutável: o seletor não abre edição para ela.

import { useState } from 'react'
import type { KanbanView, KanbanViewDisplay, SummaryMetric, FilterField, FilterCondition, FilterCombinator } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

// Campos e operadores do filtro — mesmo DSL das smart-lists (espelha _FIELD_OPS do backend).
const FILTER_FIELDS: { field: FilterField; label: string }[] = [
  { field: 'priority', label: 'Prioridade' },
  { field: 'due_date', label: 'Vencimento' },
  { field: 'tag', label: 'Tag' },
  { field: 'state', label: 'Estado' },
  { field: 'text', label: 'Texto' },
]
const FILTER_OPS: Record<FilterField, { op: string; label: string }[]> = {
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
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Valor inicial coerente para um par (campo, operador).
function defaultFilterValue(field: FilterField, op: string): unknown {
  if (field === 'priority') return 2
  if (field === 'due_date') return op === 'within' ? '7d' : (op === 'overdue' || op === 'none') ? null : todayISO()
  if (field === 'state') return 'open'
  return ''
}

interface KanbanViewModalProps {
  mode: 'create' | 'edit'
  view?: KanbanView
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Adornos com rótulo pt-BR (chave do JSON display.adornos → rótulo).
const ADORNOS: { key: keyof KanbanViewDisplay['adornos']; label: string }[] = [
  { key: 'capacity_meter', label: 'Capacity meter' },
  { key: 'subtask_ring', label: 'Anel de subtarefas' },
  { key: 'summary_footer', label: 'Rodapé-resumo' },
  { key: 'card_chips', label: 'Chips no card' },
]

// Métricas disponíveis para os slots (catálogo da R15) com rótulo pt-BR.
const METRICS: { value: SummaryMetric; label: string }[] = [
  { value: 'abertas', label: 'Tarefas abertas' },
  { value: 'tempo_estimado', label: 'Tempo estimado' },
  { value: 'concluidas', label: 'Concluídas' },
  { value: 'concluidas_hoje', label: 'Concluídas hoje' },
  { value: 'em_andamento', label: 'Em andamento' },
]

const DEFAULT_DISPLAY: KanbanViewDisplay = {
  adornos: { capacity_meter: true, subtask_ring: true, summary_footer: true, card_chips: true },
  slots: ['abertas', 'tempo_estimado', 'em_andamento'],
}

export function KanbanViewModal({ mode, view, onClose, onSaved, toast }: KanbanViewModalProps) {
  const [name, setName] = useState(view?.name ?? '')
  const [adornos, setAdornos] = useState(view?.display.adornos ?? DEFAULT_DISPLAY.adornos)
  // Slots sempre 3 (preenche com o default se a view vier incompleta).
  const [slots, setSlots] = useState<SummaryMetric[]>(
    view?.display.slots?.length === 3 ? view.display.slots : DEFAULT_DISPLAY.slots,
  )
  // Filtro opcional da view (mesmo DSL das smart-lists). hasFilter liga/desliga a seção.
  const [hasFilter, setHasFilter] = useState<boolean>(view?.filter != null)
  const [combinator, setCombinator] = useState<FilterCombinator>(view?.filter?.combinator ?? 'and')
  const [conditions, setConditions] = useState<FilterCondition[]>(
    view?.filter?.conditions?.length ? view.filter.conditions : [{ field: 'priority', op: 'gte', value: 2 }],
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const toggleAdorno = (key: keyof KanbanViewDisplay['adornos']) =>
    setAdornos(a => ({ ...a, [key]: !a[key] }))

  const setSlot = (i: number, value: SummaryMetric) =>
    setSlots(s => s.map((m, idx) => (idx === i ? value : m)))

  // ── Construtor de filtro (mesma lógica do FilterModal das smart-lists) ──────────
  const patchCond = (i: number, patch: Partial<FilterCondition>) =>
    setConditions(cs => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const changeField = (i: number, field: FilterField) =>
    patchCond(i, { field, op: FILTER_OPS[field][0].op, value: defaultFilterValue(field, FILTER_OPS[field][0].op) })
  const changeOp = (i: number, op: string) =>
    patchCond(i, { op, value: defaultFilterValue(conditions[i].field, op) })
  const addCond = () => setConditions(cs => [...cs, { field: 'tag', op: 'has', value: '' }])
  const removeCond = (i: number) => setConditions(cs => cs.filter((_, idx) => idx !== i))

  // Input de VALOR conforme o par (campo, operador).
  const valueInput = (c: FilterCondition, i: number) => {
    if (c.field === 'priority') return (
      <select className="kg-select" value={Number(c.value)} onChange={e => patchCond(i, { value: Number(e.target.value) })}>
        <option value={3}>Alta</option><option value={2}>Média</option><option value={1}>Baixa</option><option value={0}>Nenhuma</option>
      </select>
    )
    if (c.field === 'due_date') {
      if (c.op === 'overdue' || c.op === 'none') return <span style={{ color: 'var(--ink-4)' }}>—</span>
      if (c.op === 'within') {
        const days = Number(String(c.value ?? '7d').replace('d', '')) || 7
        return <input className="kg-input" type="number" min={0} style={{ width: 70 }} value={days} onChange={e => patchCond(i, { value: `${Number(e.target.value) || 0}d` })} />
      }
      return <input className="kg-input" type="date" value={String(c.value ?? todayISO())} onChange={e => patchCond(i, { value: e.target.value })} />
    }
    if (c.field === 'state') return (
      <select className="kg-select" value={String(c.value)} onChange={e => patchCond(i, { value: e.target.value })}>
        <option value="open">Aberta</option><option value="completed">Concluída</option>
      </select>
    )
    return <input className="kg-input" value={String(c.value ?? '')} placeholder={c.field === 'tag' ? 'nome da tag' : 'texto'} onChange={e => patchCond(i, { value: e.target.value })} />
  }

  const save = async () => {
    if (!name.trim()) { toast('Dê um nome à view.', 'err'); return }
    if (hasFilter && conditions.length === 0) { toast('Adicione ao menos uma condição ao filtro.', 'err'); return }
    setSaving(true)
    try {
      const display: KanbanViewDisplay = { adornos, slots: slots.slice(0, 3) as SummaryMetric[] }
      const filter = hasFilter ? { combinator, conditions } : null
      if (mode === 'create') {
        await kaguyaApi.createKanbanView({ name: name.trim(), display, filter })
        toast('View criada.')
      } else if (view) {
        // Com filtro → envia rules; sem filtro → clear_filter remove qualquer filtro anterior.
        await kaguyaApi.updateKanbanView(view.id, hasFilter
          ? { name: name.trim(), display, filter: filter! }
          : { name: name.trim(), display, clear_filter: true })
        toast('View atualizada.')
      }
      onSaved(); onClose()
    } catch (e) {
      toast((e as Error).message || 'Não foi possível salvar a view.', 'err')
    } finally { setSaving(false) }
  }

  const del = async () => {
    if (!view) return
    try { await kaguyaApi.deleteKanbanView(view.id); toast('View excluída.'); onSaved(); onClose() }
    catch (e) { toast((e as Error).message || 'Não foi possível excluir a view.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova view' : 'Editar view'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Nome</span>
            <input className="kg-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Foco, Mínima…" />
          </div>

          {/* Adornos visíveis: toggle por botão (primary = ligado) */}
          <div className="kg-field">
            <span className="kg-field-label">Adornos visíveis</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ADORNOS.map(a => (
                <button
                  key={a.key}
                  className={`kg-btn${adornos[a.key] ? ' kg-btn-primary' : ' kg-btn-ghost'}`}
                  style={{ padding: '6px 10px' }}
                  onClick={() => toggleAdorno(a.key)}
                >
                  {adornos[a.key] ? '✓ ' : ''}{a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Métricas dos 3 slots do rodapé */}
          <div className="kg-field">
            <span className="kg-field-label">Rodapé — 3 métricas</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 1, 2].map(i => (
                <select
                  key={i}
                  className="kg-select"
                  value={slots[i]}
                  onChange={(e) => setSlot(i, e.target.value as SummaryMetric)}
                >
                  {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              ))}
            </div>
          </div>

          {/* Filtro opcional (mesmo DSL das smart-lists) */}
          <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
            <button
              className={`kg-btn${hasFilter ? ' kg-btn-primary' : ' kg-btn-ghost'}`}
              style={{ alignSelf: 'flex-start', padding: '6px 10px' }}
              onClick={() => setHasFilter(f => !f)}
            >
              {hasFilter ? '✓ ' : ''}Filtrar tarefas
            </button>

            {hasFilter && (
              <>
                <div className="kg-segment" style={{ width: 220, marginTop: 8 }}>
                  <button className={`kg-seg-opt${combinator === 'and' ? ' active' : ''}`} onClick={() => setCombinator('and')}>Todas (E)</button>
                  <button className={`kg-seg-opt${combinator === 'or' ? ' active' : ''}`} onClick={() => setCombinator('or')}>Qualquer (OU)</button>
                </div>
                {conditions.map((c, i) => (
                  <div key={i} className="kg-cond-row">
                    <select className="kg-select" value={c.field} onChange={e => changeField(i, e.target.value as FilterField)}>
                      {FILTER_FIELDS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                    </select>
                    <select className="kg-select" value={c.op} onChange={e => changeOp(i, e.target.value)}>
                      {FILTER_OPS[c.field].map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                    </select>
                    {valueInput(c, i)}
                    <button className="kg-icon-btn" onClick={() => removeCond(i)} aria-label="Remover condição"><Icon name="x" size={14} /></button>
                  </div>
                ))}
                <button className="kg-btn kg-btn-ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={addCond}>
                  <Icon name="plus" size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />Adicionar condição
                </button>
              </>
            )}
          </div>

          {/* Exclusão (só em edição de view customizada) */}
          {mode === 'edit' && view && !view.is_builtin && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir view
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">Excluir esta view? Os boards voltam para a "Completa".</span>
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
