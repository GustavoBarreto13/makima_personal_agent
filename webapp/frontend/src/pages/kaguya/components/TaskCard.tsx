// TaskCard — card glass do Kanban "Vidro" (spec 024, R9–R13).
// Portado do handoff (design_handoff_kaguya_kanban/source/components.jsx → TaskCard):
// barra de prioridade no topo (respeita o tweak data-pmark), título, linha de meta
// (data relativa · estimativa · projeto) e indicador à direita (check de concluído
// OU anel de progresso de subtarefas). Puramente visual — o drag fica no
// SortableTaskCard (@dnd-kit); este componente não tem draggable nativo.

import type { Task } from '../types'
import { Icon } from '../ui/Icons'
import { ProgressRing } from './ProgressRing'
import { todayLocalISO } from '../../violet/dateUtils'

interface TaskCardProps {
  task: Task
  onOpen: (task: Task) => void
  // Nome/cor da lista (board é por-lista; o chip de projeto reusa o acento como dot).
  projectName?: string
  // Adornos controlados pela view ativa (US2). Default = tudo ligado (view "Completa").
  showChips?: boolean
  showRing?: boolean
}

// Cor do lacre de prioridade por nível (0 nenhuma · 1 baixa · 2 média · 3 alta).
const PRIO_COLOR = ['transparent', 'var(--p-low)', 'var(--p-med)', 'var(--p-high)']
const PRIO_TINT  = ['transparent', 'var(--p-low-t)', 'var(--p-med-t)', 'var(--p-high-t)']

// Formata estimativa em minutos → "20min" / "1.5h" / "3h" (mesma regra do handoff fmtEst).
function fmtEst(min: number): string {
  if (min < 60) return `${min}min`
  const h = min / 60
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

// Converte "YYYY-MM-DD" numa Date LOCAL (meia-noite local), evitando o salto de fuso
// do `new Date("YYYY-MM-DD")` (que parseia como UTC). Convenção UTC-3 do CLAUDE.md.
function parseLocalISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Diferença em dias civis (alvo - hoje), usando datas locais.
function diffDays(iso: string): number {
  const today = parseLocalISO(todayLocalISO())
  const target = parseLocalISO(iso)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Rótulo relativo pt-BR da data de vencimento (Hoje / Ontem / Amanhã / N dias atrás /
// dia-da-semana próximo / DD/MM). Espelha o dueLabel() do handoff (data.js).
function dueLabel(iso: string): string {
  const n = diffDays(iso)
  if (n === 0) return 'Hoje'
  if (n === -1) return 'Ontem'
  if (n === 1) return 'Amanhã'
  if (n < -1 && n >= -7) return `${-n} dias atrás`
  if (n > 1 && n <= 6) return WEEKDAYS[parseLocalISO(iso).getDay()]
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// Classe de urgência do chip de data: overdue (vencida) / today / soon (≤2 dias) / ''.
function dueClass(iso: string, done: boolean): string {
  if (done) return ''
  const n = diffDays(iso)
  if (n < 0) return 'overdue'
  if (n === 0) return 'today'
  if (n <= 2) return 'soon'
  return ''
}

export function TaskCard({
  task,
  onOpen,
  projectName,
  showChips = true,
  showRing = true,
}: TaskCardProps) {
  const done = task.completed_at != null
  const prio = task.priority ?? 0
  const subs = task.subtasks ?? []
  const subDone = subs.filter(s => s.completed_at != null).length
  const dateCls = task.due_date ? dueClass(task.due_date, done) : ''

  return (
    <div
      className={`kcard${done ? ' done' : ''}`}
      data-prio={prio}
      style={{ '--pr-color': PRIO_COLOR[prio], '--pr-tint': PRIO_TINT[prio] } as React.CSSProperties}
      onClick={() => onOpen(task)}
    >
      {/* dot de prioridade (só visível sob data-pmark='dot'; a barra ::before é o default) */}
      <span className="kcard-prio-dot" />

      <div className="kcard-body">
        <div className="kcard-title">{task.title}</div>
        {showChips && (task.due_date || (task.duration_min && !done) || projectName) && (
          <div className="kcard-meta">
            {task.due_date && (
              <span className={`kcard-date${dateCls ? ' ' + dateCls : ''}`}>
                <Icon name="calendar" size={11} />
                {dueLabel(task.due_date)}{task.due_time ? ` · ${task.due_time}` : ''}
              </span>
            )}
            {task.duration_min != null && !done && (
              <span className="kcard-est">{fmtEst(task.duration_min)}</span>
            )}
            {projectName && (
              <span className="kcard-proj">
                <i style={{ background: 'var(--kg)' }} />
                <span>{projectName}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Indicador à direita (mutuamente exclusivo): check concluído OU anel de subtarefas. */}
      {done ? (
        <span className="kcard-done"><Icon name="check" size={11} /></span>
      ) : showRing && subs.length > 0 ? (
        <div className="kcard-ring">
          <ProgressRing pct={subDone / subs.length} />
          <span className="kr-lbl">{subDone}/{subs.length}</span>
        </div>
      ) : null}
    </div>
  )
}
