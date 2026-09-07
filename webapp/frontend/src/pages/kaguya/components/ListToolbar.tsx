// ListToolbar — barra "Agrupar / Ordenar / Filtros" compartilhada por todas as
// visões de lista (ListScreen e GroupListScreen). Abaixo dos botões, a tira de
// filtros ativos (chip removível por faceta + "Limpar tudo").
//
// Fatia 025 / Rodada 2.

import { useState } from 'react'
import { Icon } from '../ui/Icons'
import type { GroupBy, SortBy, UseListControls } from '../lib/listControls'

const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Nenhum', priority: 'Prioridade', due: 'Vencimento',
  tag: 'Etiqueta', assignee: 'Responsável', gtd: 'Contexto GTD',
}
const SORT_LABELS: Record<SortBy, string> = {
  manual: 'Manual', due: 'Vencimento', priority: 'Prioridade', recent: 'Recentes',
}

const DUE_LABEL: Record<string, string> = {
  overdue: 'Vencidas', today: 'Hoje', next7: 'Próx. 7 dias', nodate: 'Sem data', range: 'Intervalo',
}
const PRIO_LABEL: Record<string, string> = { '3': 'alta', '2': 'média', '1': 'baixa', '0': 'sem' }
const GTD_LABEL: Record<string, string> = { next_action: 'Próxima ação', waiting: 'Aguardando', someday: 'Algum dia' }
const FLAG_LABEL: Record<string, string> = {
  subtasks: 'tem subtarefa', recurring: 'recorrente', description: 'tem descrição', myday: 'no Meu Dia',
}

interface ListToolbarProps {
  controls: UseListControls
  onOpenFilters: () => void
}

export function ListToolbar({ controls, onOpenFilters }: ListToolbarProps) {
  const [menu, setMenu] = useState<'group' | 'sort' | null>(null)
  const close = () => setMenu(null)

  const f = controls.filters
  const chips: { label: string; clear: () => void }[] = []
  if (f.status !== 'open') chips.push({ label: `Status: ${f.status === 'done' ? 'concluídas' : 'todas'}`, clear: () => controls.patchFilters({ status: 'open' }) })
  Object.keys(f.prio).filter(k => f.prio[k]).forEach(k => chips.push({
    label: `Prioridade ${PRIO_LABEL[k]}`,
    clear: () => { const p = { ...f.prio }; delete p[k]; controls.patchFilters({ prio: p }) },
  }))
  if (f.due) chips.push({ label: DUE_LABEL[f.due], clear: () => controls.patchFilters({ due: null }) })
  Object.keys(f.tags).filter(k => f.tags[k]).forEach(k => chips.push({
    label: `${f.tagsMode === 'nothas' ? 'sem #' : '#'}${k}`,
    clear: () => { const t = { ...f.tags }; delete t[k]; controls.patchFilters({ tags: t }) },
  }))
  Object.keys(f.people).filter(k => f.people[k]).forEach(k => chips.push({
    label: 'Responsável', clear: () => { const p = { ...f.people }; delete p[k]; controls.patchFilters({ people: p }) },
  }))
  if (f.text.trim()) chips.push({ label: `"${f.text.trim()}"`, clear: () => controls.patchFilters({ text: '' }) })
  if (f.gtd) chips.push({ label: GTD_LABEL[f.gtd], clear: () => controls.patchFilters({ gtd: null }) })
  Object.keys(f.flags).filter(k => (f.flags as Record<string, boolean>)[k]).forEach(k => chips.push({
    label: FLAG_LABEL[k],
    clear: () => controls.patchFilters({ flags: { ...f.flags, [k]: false } }),
  }))

  return (
    <>
      <div className="kg-toolbar">
        {/* Agrupar */}
        <div className="kg-tb-anchor">
          <button
            type="button"
            className={`kg-toolbar-chip${controls.groupBy !== 'none' ? ' active' : ''}`}
            onClick={() => setMenu(menu === 'group' ? null : 'group')}
          >
            <Icon name="list" size={13} />
            Agrupar: {GROUP_LABELS[controls.groupBy]}
          </button>
          {menu === 'group' && (
            <>
              <span className="kg-tb-scrim" onClick={close} />
              <div className="kg-tb-menu">
                {(Object.keys(GROUP_LABELS) as GroupBy[]).map(g => (
                  <div
                    key={g}
                    className={`kg-tb-menu-item${controls.groupBy === g ? ' on' : ''}`}
                    onClick={() => { controls.setGroupBy(g); close() }}
                  >
                    {GROUP_LABELS[g]}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Ordenar */}
        <div className="kg-tb-anchor">
          <button
            type="button"
            className="kg-toolbar-chip"
            onClick={() => setMenu(menu === 'sort' ? null : 'sort')}
          >
            <Icon name="sort" size={13} />
            Ordenar: {SORT_LABELS[controls.sortBy]}
          </button>
          {menu === 'sort' && (
            <>
              <span className="kg-tb-scrim" onClick={close} />
              <div className="kg-tb-menu">
                {(Object.keys(SORT_LABELS) as SortBy[]).map(s => {
                  const disabled = s === 'manual' && controls.groupBy !== 'none'
                  return (
                    <div
                      key={s}
                      className={`kg-tb-menu-item${controls.sortBy === s ? ' on' : ''}${disabled ? ' disabled' : ''}`}
                      onClick={() => { if (!disabled) { controls.setSortBy(s); close() } }}
                    >
                      {SORT_LABELS[s]}
                      {disabled && <span className="kg-tb-menu-hint">só sem grupo</span>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Filtros */}
        <button
          type="button"
          className={`kg-toolbar-chip kg-toolbar-sort${controls.hasActiveFilters ? ' active' : ''}`}
          onClick={onOpenFilters}
        >
          <Icon name="filter" size={13} />
          Filtros{controls.hasActiveFilters ? ' •' : ''}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="kg-fchips">
          {chips.map((c, i) => (
            <span key={i} className="kg-fchip">
              {c.label}
              <button type="button" onClick={c.clear} aria-label="Remover filtro">
                <Icon name="x" size={9} />
              </button>
            </span>
          ))}
          <button type="button" className="kg-fchip-clear" onClick={controls.clearFilters}>
            Limpar tudo
          </button>
        </div>
      )}
    </>
  )
}
