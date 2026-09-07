// ListFilterSheet — painel lateral de facetas da Lista (Rodada 2).
//
// Edita o objeto `filters` compartilhado (useListControls) e sabe converter as
// facetas na DSL de `tools_filters.py` para "Salvar como lista inteligente"
// (reusa kaguyaApi.createFilter + os campos novos assignee/has_children/
// recurring/has_description/my_day + grupos aninhados).

import { useEffect, useState } from 'react'
import type { FilterRules, GtdStatus, Person, Tag } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { DatePicker } from './DatePicker'
import type { DueBucket, FlagKey, StatusFilter, TagMode, UseListControls } from '../lib/listControls'

const STATUS_OPTS: { v: StatusFilter; label: string }[] = [
  { v: 'open', label: 'Abertas' }, { v: 'done', label: 'Concluídas' }, { v: 'all', label: 'Todas' },
]
const PRIO_OPTS = [
  { v: '3', label: 'Alta' }, { v: '2', label: 'Média' }, { v: '1', label: 'Baixa' }, { v: '0', label: 'Sem' },
]
const DUE_OPTS: { v: DueBucket; label: string }[] = [
  { v: 'overdue', label: 'Vencidas' }, { v: 'today', label: 'Hoje' }, { v: 'next7', label: 'Próx. 7 dias' },
  { v: 'nodate', label: 'Sem data' }, { v: 'range', label: 'Intervalo' },
]
const GTD_OPTS: { v: GtdStatus; label: string }[] = [
  { v: 'next_action', label: 'Próxima ação' }, { v: 'waiting', label: 'Aguardando' }, { v: 'someday', label: 'Algum dia' },
]
const FLAG_OPTS: { v: FlagKey; label: string }[] = [
  { v: 'subtasks', label: 'Tem subtarefa' }, { v: 'recurring', label: 'É recorrente' },
  { v: 'description', label: 'Tem descrição' }, { v: 'myday', label: 'No Meu Dia' },
]

interface ListFilterSheetProps {
  controls: UseListControls
  onClose: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ListFilterSheet({ controls, onClose, toast }: ListFilterSheetProps) {
  const f = controls.filters
  const [tags, setTags] = useState<Tag[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    kaguyaApi.listTags().then(setTags).catch(() => { /* silencioso */ })
    kaguyaApi.listPeople().then(setPeople).catch(() => { /* silencioso */ })
  }, [])

  // Fecha no Escape (padrão dos popovers do shell).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleKey = (obj: Record<string, boolean>, k: string) => {
    const next = { ...obj }
    if (next[k]) delete next[k]
    else next[k] = true
    return next
  }

  // ── Salvar como lista inteligente ────────────────────────────────────────────
  const save = async () => {
    const name = window.prompt('Nome da lista inteligente:')?.trim()
    if (!name) return
    setSaving(true)
    try {
      await kaguyaApi.createFilter({ name, rules: filtersToRules(f) as unknown as FilterRules })
      toast(`"${name}" salva em Listas inteligentes.`, 'ok')
      onClose()
    } catch (e) {
      toast((e as Error).message || 'Não foi possível salvar a lista inteligente.', 'err')
    } finally {
      setSaving(false)
    }
  }

  const prioKeys = Object.keys(f.prio).filter(k => f.prio[k])
  const tagKeys = Object.keys(f.tags).filter(k => f.tags[k])
  const peopleKeys = Object.keys(f.people).filter(k => f.people[k])

  return (
    <>
      <div className="kg-fs-scrim" onClick={onClose} />
      <div className="kg-filter-sheet" role="dialog" aria-label="Filtros da lista">
        <div className="kg-fs-head">
          <h3>Filtros da lista</h3>
          <button type="button" onClick={onClose} aria-label="Fechar"><Icon name="x" size={16} /></button>
        </div>

        <div className="kg-fs-body">
          {/* Status */}
          <div className="kg-fs-sec">
            <h4>Status</h4>
            <div className="kg-fs-seg">
              {STATUS_OPTS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  className={`kg-fs-seg-opt${f.status === o.v ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ status: o.v })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prioridade (multi) */}
          <div className="kg-fs-sec">
            <h4>Prioridade</h4>
            <div className="kg-fs-chips">
              {PRIO_OPTS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  className={`kg-fs-chip${f.prio[o.v] ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ prio: toggleKey(f.prio, o.v) })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vencimento */}
          <div className="kg-fs-sec">
            <h4>Vencimento</h4>
            <div className="kg-fs-chips">
              {DUE_OPTS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  className={`kg-fs-chip${f.due === o.v ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ due: f.due === o.v ? null : o.v })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {f.due === 'range' && (
              <div className="kg-fs-range">
                <DatePicker value={f.from} onChange={iso => controls.patchFilters({ from: iso })} placeholder="De" />
                <span style={{ color: 'var(--ink-4)' }}>→</span>
                <DatePicker value={f.to} onChange={iso => controls.patchFilters({ to: iso })} placeholder="Até" />
              </div>
            )}
          </div>

          {/* Etiquetas */}
          <div className="kg-fs-sec">
            <h4>Etiquetas</h4>
            <div className="kg-fs-seg sm">
              {(['has', 'nothas'] as TagMode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`kg-fs-seg-opt${f.tagsMode === m ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ tagsMode: m })}
                >
                  {m === 'has' ? 'tem' : 'não tem'}
                </button>
              ))}
            </div>
            <div className="kg-fs-chips">
              {tags.length === 0 && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Nenhuma etiqueta ainda</span>}
              {tags.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`kg-fs-chip${f.tags[t.name] ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ tags: toggleKey(f.tags, t.name) })}
                >
                  #{t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Responsável */}
          {people.length > 0 && (
            <div className="kg-fs-sec">
              <h4>Responsável</h4>
              <div className="kg-fs-chips">
                {people.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`kg-fs-chip${f.people[p.id] ? ' on' : ''}`}
                    onClick={() => controls.patchFilters({ people: toggleKey(f.people, p.id) })}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Texto */}
          <div className="kg-fs-sec">
            <h4>Texto no título</h4>
            <input
              className="kg-input kg-input-sm"
              placeholder="contém…"
              value={f.text}
              onChange={e => controls.patchFilters({ text: e.target.value })}
            />
          </div>

          {/* Contexto GTD */}
          <div className="kg-fs-sec">
            <h4>Contexto GTD</h4>
            <div className="kg-fs-chips">
              {GTD_OPTS.map(o => (
                <button
                  key={o.v}
                  type="button"
                  className={`kg-fs-chip${f.gtd === o.v ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ gtd: f.gtd === o.v ? null : o.v })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sinalizadores */}
          <div className="kg-fs-sec">
            <h4>Sinalizadores</h4>
            {FLAG_OPTS.map(o => {
              const on = f.flags[o.v]
              return (
                <div
                  key={o.v}
                  className={`kg-fs-check${on ? ' on' : ''}`}
                  onClick={() => controls.patchFilters({ flags: { ...f.flags, [o.v]: !on } })}
                >
                  <span className="kg-fs-box">{on && <Icon name="check" size={10} />}</span>
                  {o.label}
                </div>
              )
            })}
            <div className="kg-fs-note">
              Cada lista guarda seus próprios filtros neste navegador.
              {(prioKeys.length > 1 || tagKeys.length > 0 || peopleKeys.length > 1) &&
                ' “Salvar como lista inteligente” converte tudo em regras (OU em prioridade/responsável, grupos aninhados).'}
            </div>
          </div>
        </div>

        <div className="kg-fs-foot">
          <button type="button" className="kg-btn kg-btn-ghost" onClick={controls.clearFilters}>Limpar tudo</button>
          <button type="button" className="kg-btn kg-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Salvando…' : 'Salvar como lista inteligente'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Facetas → DSL de tools_filters.py ─────────────────────────────────────────

type Cond = { field: string; op: string; value: unknown }
type Group = { combinator: 'and' | 'or'; conditions: (Cond | Group)[] }

function filtersToRules(f: UseListControls['filters']): Group {
  const conditions: (Cond | Group)[] = []

  if (f.status === 'done') conditions.push({ field: 'state', op: 'eq', value: 'completed' })
  else if (f.status === 'open') conditions.push({ field: 'state', op: 'eq', value: 'open' })
  // status 'all' → sem condição de state (o backend não força "só abertas" quando há state,
  // então mandamos 'open' explicitamente para 'open' e nada para 'all' — 'all' cai no default).

  const prio = Object.keys(f.prio).filter(k => f.prio[k])
  if (prio.length === 1) conditions.push({ field: 'priority', op: 'eq', value: Number(prio[0]) })
  else if (prio.length > 1) conditions.push({ combinator: 'or', conditions: prio.map(p => ({ field: 'priority', op: 'eq', value: Number(p) })) })

  if (f.due === 'overdue') conditions.push({ field: 'due_date', op: 'overdue', value: null })
  else if (f.due === 'today') conditions.push({ field: 'due_date', op: 'eq', value: 'today' })
  else if (f.due === 'next7') conditions.push({ field: 'due_date', op: 'within', value: '7d' })
  else if (f.due === 'nodate') conditions.push({ field: 'due_date', op: 'none', value: null })
  else if (f.due === 'range') {
    if (f.from) conditions.push({ field: 'due_date', op: 'after', value: f.from })
    if (f.to) conditions.push({ field: 'due_date', op: 'before', value: f.to })
  }

  Object.keys(f.tags).filter(k => f.tags[k]).forEach(name =>
    conditions.push({ field: 'tag', op: f.tagsMode === 'nothas' ? 'not_has' : 'has', value: name }))

  const people = Object.keys(f.people).filter(k => f.people[k])
  if (people.length === 1) conditions.push({ field: 'assignee', op: 'has', value: people[0] })
  else if (people.length > 1) conditions.push({ combinator: 'or', conditions: people.map(id => ({ field: 'assignee', op: 'has', value: id })) })

  if (f.text.trim()) conditions.push({ field: 'text', op: 'contains', value: f.text.trim() })
  if (f.gtd) conditions.push({ field: 'gtd_status', op: 'eq', value: f.gtd })

  if (f.flags.subtasks) conditions.push({ field: 'has_children', op: 'eq', value: true })
  if (f.flags.recurring) conditions.push({ field: 'recurring', op: 'eq', value: true })
  if (f.flags.description) conditions.push({ field: 'has_description', op: 'eq', value: true })
  if (f.flags.myday) conditions.push({ field: 'my_day', op: 'eq', value: true })

  // create_filter exige ≥1 condição — se nada foi marcado, manda "abertas".
  if (conditions.length === 0) conditions.push({ field: 'state', op: 'eq', value: 'open' })
  return { combinator: 'and', conditions }
}
