// Linha de tarefa (estilo TickTick): checkbox colorido pela prioridade, título, e à direita os sinais (etiquetas, lista,
// vencimento, recorrência, subtarefas, notas, bloqueada/adiada). Hover mostra a alça e o menu "…". Só apresentação:
// quem chama decide o que cada clique faz.

import { useState, type MouseEvent, type ReactNode, type Ref } from 'react'
import { Icon, Menu, cx, type MenuItem } from '../../../design'
import { deferLabel, dueInfo, fmtMinutes, followUpDue, subtaskProgress } from '../lib/taskView'
import type { Task } from '../types'

export interface TaskRowProps {
  task: Task
  today: string
  depth?: number
  /** Selecionada para ação em massa. */
  selected?: boolean
  /** Aberta no painel de detalhe. */
  active?: boolean
  /** Linha com foco do teclado (setas). */
  focused?: boolean
  showProject?: boolean
  showDetails?: boolean
  /** Subtarefas visíveis? (undefined = a tarefa não tem filhas). */
  expanded?: boolean
  onToggleExpand?: () => void
  onToggle: () => void
  onOpen: () => void
  /** Clique com Ctrl/Shift/⌘ seleciona em vez de abrir. */
  onSelect?: (e: MouseEvent) => void
  menu?: MenuItem[]
  /** Arrastar para reordenar/aninhar: a ref da linha, a alça e a zona de soltura sob o ponteiro. */
  rowRef?: Ref<HTMLLIElement>
  grip?: ReactNode
  dropZone?: 'before' | 'after' | 'child' | null
  dragging?: boolean
  /** Ações próprias da tela, logo depois dos sinais (ex.: Hoje/Amanhã nas pendências). */
  trailing?: ReactNode
}

const PRIO_CLASS = ['', 'kn-p1', 'kn-p2', 'kn-p3']

export function TaskRow({
  task, today, depth = 0, selected, active, focused, showProject, showDetails = true, expanded, onToggleExpand,
  onToggle, onOpen, onSelect, menu, trailing, rowRef, grip, dropZone, dragging,
}: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const done = !!task.completed_at
  const due = dueInfo(task, today)
  const prog = subtaskProgress(task)
  const defer = deferLabel(task, today)
  const tags = task.tags ?? []
  const hasNotes = !!task.description?.trim()
  const hasKids = !!task.subtasks?.length

  const click = (e: MouseEvent) => {
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && onSelect) { onSelect(e); return }
    onOpen()
  }

  return (
    <li
      ref={rowRef}
      className={cx('kn-row', done && 'kn-done', selected && 'kn-sel', active && 'kn-active', focused && 'kn-focus', dragging && 'kn-dragging', dropZone && `kn-drop-${dropZone}`)}
      style={{ paddingInlineStart: `calc(var(--ds-space-3) + ${depth} * var(--ds-space-5))` }}
      data-task-id={task.id}
      aria-selected={selected || undefined}
    >
      {grip}
      {hasKids ? (
        <button type="button" className="kn-twist" aria-label={expanded ? 'Recolher subtarefas' : 'Expandir subtarefas'} aria-expanded={expanded} onClick={onToggleExpand}>
          <Icon name={expanded ? 'down' : 'right'} size={14} />
        </button>
      ) : <span className="kn-twist-gap" aria-hidden="true" />}

      <button
        type="button"
        className={cx('kn-check', PRIO_CLASS[task.priority], done && 'kn-checked')}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir “${task.title}”` : `Concluir “${task.title}”`}
        onClick={onToggle}
      >
        {done && <Icon name="check" size={12} strokeWidth={3} />}
      </button>

      <button type="button" className="kn-main" onClick={click}>
        <span className="kn-title">{task.title || <em>Sem título</em>}</span>
        {showDetails && hasNotes && !done && <span className="kn-snippet">{task.description!.replace(/[#>*_`\-[\]]/g, '').trim().slice(0, 90)}</span>}
      </button>

      <span className="kn-signals">
        {task.blocked && <span className="kn-sig kn-warn" title="Bloqueada por outra tarefa"><Icon name="blocked" size={13} label="Bloqueada" /></span>}
        {defer && <span className="kn-sig" title="Adiada"><Icon name="defer" size={13} />{defer}</span>}
        {followUpDue(task, today) && <span className="kn-sig kn-warn" title="Hora de cobrar"><Icon name="follow-up" size={13} />Cobrar</span>}
        {task.gtd_status === 'waiting' && !followUpDue(task, today) && <span className="kn-sig" title="Aguardando"><Icon name="waiting" size={13} /></span>}
        {showDetails && hasNotes && <span className="kn-sig" title="Tem notas"><Icon name="page" size={13} label="Tem notas" /></span>}
        {prog && <span className="kn-sig" title="Subtarefas concluídas"><Icon name="subtasks" size={13} />{prog.done}/{prog.total}</span>}
        {task.recurrence?.active && <span className="kn-sig" title={task.recurrence_text ?? 'Recorrente'}><Icon name="recurring" size={13} label="Recorrente" /></span>}
        {task.duration_min ? <span className="kn-sig" title="Estimativa"><Icon name="timer" size={13} />{fmtMinutes(task.duration_min)}</span> : null}
        {task.my_day_date === today && <span className="kn-sig kn-accent" title="No Meu Dia"><Icon name="sun" size={13} label="No Meu Dia" /></span>}
        {showDetails && tags.slice(0, 2).map((g) => <span key={g.id} className="kn-tag">#{g.name}</span>)}
        {showProject && task.project_name && <span className="kn-proj">{task.project_name}</span>}
        {due.label && <span className={cx('kn-due', `kn-due-${due.tone}`)}>{due.label}</span>}
      </span>

      {trailing}

      {menu && menu.length > 0 && (
        <span className="kn-menu">
          <button type="button" className="kn-more" aria-label={`Ações de “${task.title}”`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <Icon name="more" size={16} />
          </button>
          {menuOpen && <Menu label={`Ações de ${task.title}`} items={menu} onClose={() => setMenuOpen(false)} />}
        </span>
      )}
    </li>
  )
}
