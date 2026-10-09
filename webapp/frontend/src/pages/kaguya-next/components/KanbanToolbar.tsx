// Barra de filtro e ordenação dos dois boards (lista e grupo): chips de prioridade mínima + um botão que cicla a
// ordenação (Manual → Vencimento → Prioridade). Sem estado próprio — o pai guarda e zera ao trocar de board.

import { Chip, Icon } from '../../../design'
import { KANBAN_DEFAULTS, SORT_CYCLE, SORT_LABELS, type KanbanFilters } from '../lib/kanbanFilter'

const PRIOS = [{ v: 0, label: 'Tudo' }, { v: 1, label: 'Baixa+' }, { v: 2, label: 'Média+' }, { v: 3, label: 'Alta' }]

export function KanbanToolbar({ filters, onChange }: { filters: KanbanFilters; onChange: (next: KanbanFilters) => void }) {
  const cycleSort = () => onChange({ ...filters, sort: SORT_CYCLE[(SORT_CYCLE.indexOf(filters.sort) + 1) % SORT_CYCLE.length] })
  const dirty = filters.prio !== KANBAN_DEFAULTS.prio || filters.sort !== KANBAN_DEFAULTS.sort
  return (
    <div className="kn-ktool" role="toolbar" aria-label="Filtro e ordenação do quadro">
      <div className="kn-chips" role="group" aria-label="Prioridade mínima">
        {PRIOS.map(({ v, label }) => (
          <Chip key={v} on={filters.prio === v} aria-pressed={filters.prio === v} onClick={() => onChange({ ...filters, prio: v })}>{label}</Chip>
        ))}
      </div>
      <Chip on={filters.sort !== 'manual'} title={`Ordenação: ${SORT_LABELS[filters.sort]} (clique para trocar)`} onClick={cycleSort}>
        <Icon name="sort" size={13} />{SORT_LABELS[filters.sort]}
      </Chip>
      {dirty && <button type="button" className="kn-klink" onClick={() => onChange(KANBAN_DEFAULTS)}>Limpar</button>}
    </div>
  )
}
