// KanbanToolbar — barra de filtro/ordenação compartilhada entre os dois boards Kanban.
//
// Renderizada no KanbanScreen (por-lista) e no GroupBoardScreen (de grupo),
// produzindo a mesma UX nos dois: chips de prioridade + botão de ordenação cíclica.
//
// Intencionalmente sem estado próprio: recebe `filters` e emite `onChange` para
// que o pai gerencie o estado — facilita resetar ao trocar de lista/grupo.
//
// Reutiliza as classes CSS já existentes da ListScreen (`.kg-toolbar`,
// `.kg-toolbar-chip`, `.kg-toolbar-group`, `.kg-toolbar-sep`, `.kg-toolbar-sort`)
// para zero CSS novo.

import type { KanbanFilters } from '../lib/kanbanFilter'
import { SORT_LABELS, SORT_CYCLE, KANBAN_DEFAULTS } from '../lib/kanbanFilter'
import { Icon } from '../ui/Icons'

// ── Props ─────────────────────────────────────────────────────────────────────

interface KanbanToolbarProps {
  // Estado atual dos filtros (controlado pelo pai).
  filters: KanbanFilters
  // Callback disparado quando o usuário muda qualquer filtro.
  onChange: (next: KanbanFilters) => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function KanbanToolbar({ filters, onChange }: KanbanToolbarProps) {

  // Troca o filtro de prioridade mínima.
  const setPrio = (prio: number) => onChange({ ...filters, prio })

  // Cicla para o próximo modo de ordenação na lista SORT_CYCLE.
  const cycleSort = () => {
    const idx = SORT_CYCLE.indexOf(filters.sort)
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
    onChange({ ...filters, sort: next })
  }

  // Indica se algum filtro está ativo (diferente dos defaults) — pode ser usado
  // para realçar visualmente a barra no futuro.
  const isActive = filters.prio !== KANBAN_DEFAULTS.prio || filters.sort !== KANBAN_DEFAULTS.sort

  return (
    // Reutiliza `.kg-toolbar` da ListScreen — mesmo espaçamento e separadores.
    <div className="kg-toolbar" style={isActive ? { opacity: 1 } : undefined}>

      {/* Chips de prioridade: Tudo / Baixa+ / Média+ / Alta */}
      <div className="kg-toolbar-group">
        {[
          { v: 0, label: 'Tudo' },
          { v: 1, label: 'Baixa+' },
          { v: 2, label: 'Média+' },
          { v: 3, label: 'Alta' },
        ].map(({ v, label }) => (
          <button
            key={v}
            type="button"
            className={`kg-toolbar-chip${filters.prio === v ? ' active' : ''}`}
            onClick={() => setPrio(v)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Separador visual entre grupos de filtros */}
      <div className="kg-toolbar-sep" />

      {/* Botão de ordenação: cicla Manual → Vencimento → Prioridade */}
      <button
        type="button"
        className={`kg-toolbar-chip kg-toolbar-sort${filters.sort !== 'manual' ? ' active' : ''}`}
        title={`Ordenação: ${SORT_LABELS[filters.sort]}`}
        onClick={cycleSort}
      >
        <Icon name="sort" size={13} />
        {SORT_LABELS[filters.sort]}
      </button>
    </div>
  )
}
