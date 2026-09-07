// TaskTree — árvore de tarefas com N níveis de profundidade.
// Drag-and-drop via @dnd-kit (mesmo do Kanban/Meu Dia): PointerSensor 5px + DragOverlay
// que segue o cursor. 3 zonas por linha: before (y<28%), child (meio), after (y>72%),
// computadas do Y do ponteiro vs o retângulo da linha-alvo — mesma semântica de antes,
// só o mecanismo mudou (adeus HTML5 nativo).
// Indentação de 22px por nível, guias verticais 1.5px + cotovelo por subtarefa,
// colapso persistido em localStorage.
//
// Fatia 025 / Rodada 2 (redesign da Lista): prioridade num único marcador com tokens
// --p-*, meta vira barra de chips-controle (data/tag/estimativa editáveis inline via
// popover), TODAS as tags, data relativa pt-BR, hierarquia tarefa×subtarefa mais forte,
// e as ações de hover viram um único menu "⋯" (mata o overlay que tapava a meta).
// Compartilhado por ListScreen e GroupListScreen (ambos via ListSection) — mesmo visual.

import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import type { Task, Tag } from '../types'
import { Icon } from '../ui/Icons'
import { subProgress, buildBreadcrumb, flattenTree } from '../lib/tasktree'
import { dueLabel, dueClass, fmtEst, toISO, addDays, todayISO } from '../lib/dateUtils'
import { useDndSensors } from '../lib/dnd'
import { AvatarStack, AssigneePicker } from './People'
import { MiniCalendar } from './MiniCalendar'
import { kaguyaApi } from '../kaguyaApi'

// Zona de drop dentro de uma linha da árvore (determinada pela posição Y do mouse)
export type DropZone = 'before' | 'child' | 'after'

// Estado do drop ativo (qual linha + qual zona)
interface DropState {
  id: number      // id da tarefa-alvo
  zone: DropZone  // qual zona dentro dessa linha
}

// ─── Interface de callbacks (API da árvore) ────────────────────────────────────
// O ListScreen/GroupListScreen define estas funções e passa para o TaskTree.

export interface TaskTreeAPI {
  // Salva o novo título de uma tarefa (chamado no blur/Enter/Tab).
  rename(task: Task, title: string): void
  // Marca como concluída ou reabre.
  complete(task: Task, done: boolean): void
  // Drag-and-drop: move a tarefa `dragId` para a posição indicada pela zona.
  move(dragId: number, targetId: number, zone: DropZone): void
  // Sobe uma subtarefa para tarefa-raiz ("Tornar independente").
  promote(task: Task): void
  // Atualiza o conjunto de responsáveis (substitui — não adiciona).
  setAssignees(task: Task, personIds: string[]): void
  // Edição inline de um campo qualquer via PATCH parcial (prioridade, data, tags, estimativa…).
  setField(task: Task, patch: Partial<{
    priority: number
    due_date: string | null
    due_time: string | null
    duration_min: number | null
    tags: string[]
  }>): void
  // Atalho de reagendamento (Hoje / Amanhã / Semana que vem).
  reschedule(task: Task, when: 'today' | 'tomorrow' | 'later'): void
  // Duplica a tarefa (cópia rasa, mesmo pai).
  duplicate(task: Task): void
  // Cria um irmão abaixo de `task` e chama `onCreated(newId)` com o id criado.
  addSibling(task: Task, onCreated: (id: number) => void): void
  // Cria um filho de `task`, chama `onCreated(newId)` e `expandParent()` para garantir visibilidade.
  addChild(task: Task, onCreated: (id: number) => void, expandParent: () => void): void
  // Remove (soft-delete) uma tarefa. Usado para apagar linha-placeholder vazia abandonada.
  remove(task: Task): void
  // Indenta (faz filha do irmão anterior — se existir).
  indent(task: Task): void
  // Desindenta (sobe um nível — se tiver pai).
  outdent(task: Task): void
  // Abre o modal de detalhes da tarefa.
  openTask(task: Task): void
}

// ─── Prioridade ────────────────────────────────────────────────────────────────
// Um único marcador ambiente: a barra lateral 3px (::before de .tree-row), agora
// com os tokens semânticos --p-* (antes: cores oklch paralelas aos tokens).
const PRIO_BAR: Record<number, string> = {
  0: 'transparent',
  1: 'var(--p-low)',
  2: 'var(--p-med)',
  3: 'var(--p-high)',
}
// Tint da prioridade — usado só no modo data-pmark='fill' (fundo da linha inteira).
const PRIO_TINT: Record<number, string> = {
  0: 'transparent',
  1: 'var(--p-low-t)',
  2: 'var(--p-med-t)',
  3: 'var(--p-high-t)',
}
const PRIO_LABELS = ['Nenhuma', 'Baixa', 'Média', 'Alta']

// Opções de estimativa (minutos) oferecidas no popover do chip de duração.
const EST_OPTIONS = [0, 15, 30, 45, 60, 90, 120, 180, 240]

// ─── Popovers de campo (prioridade / estimativa / tags / data) ────────────────

interface PopShellProps {
  className?: string
  onClose: () => void
  children: React.ReactNode
}
function PopShell({ className, onClose, children }: PopShellProps) {
  return (
    <>
      <span className="tree-pop-scrim" onClick={e => { e.stopPropagation(); onClose() }} />
      <div className={`tree-pop ${className ?? ''}`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </>
  )
}

function PriorityPop({ current, onPick, onClose }: {
  current: number; onPick: (p: number) => void; onClose: () => void
}) {
  return (
    <PopShell className="right" onClose={onClose}>
      {[0, 1, 2, 3].map(p => (
        <div
          key={p}
          className={`tree-pop-opt${p === current ? ' on' : ''}`}
          onClick={() => { onPick(p); onClose() }}
        >
          <span className={`tree-pop-swatch${p > 0 ? ` p${p}` : ''}`} />
          {PRIO_LABELS[p]}
        </div>
      ))}
    </PopShell>
  )
}

function EstimatePop({ current, onPick, onClose }: {
  current: number | null; onPick: (min: number) => void; onClose: () => void
}) {
  return (
    <PopShell className="tail" onClose={onClose}>
      {EST_OPTIONS.map(min => (
        <div
          key={min}
          className={`tree-pop-opt${(current ?? 0) === min ? ' on' : ''}`}
          onClick={() => { onPick(min); onClose() }}
        >
          {min === 0 ? 'Sem estimativa' : fmtEst(min)}
        </div>
      ))}
    </PopShell>
  )
}

function TagPop({ current, onToggle, onClose }: {
  current: Tag[]; onToggle: (names: string[]) => void; onClose: () => void
}) {
  const [all, setAll] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const currentNames = current.map(t => t.name)

  useEffect(() => {
    let alive = true
    kaguyaApi.listTags()
      .then(tags => { if (alive) setAll(tags) })
      .catch(() => { /* silencioso — popover fica vazio */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const flip = (name: string) => {
    const has = currentNames.includes(name)
    onToggle(has ? currentNames.filter(n => n !== name) : [...currentNames, name])
  }

  return (
    <PopShell className="tail" onClose={onClose}>
      {loading && <div className="tree-pop-head">Carregando…</div>}
      {!loading && all.length === 0 && <div className="tree-pop-head">Nenhuma etiqueta ainda</div>}
      {all.map(tag => {
        const on = currentNames.includes(tag.name)
        return (
          <div key={tag.id} className={`tree-pop-opt${on ? ' on' : ''}`} onClick={() => flip(tag.name)}>
            <span className="tree-pop-check">{on && <Icon name="check" size={10} />}</span>
            #{tag.name}
          </div>
        )
      })}
    </PopShell>
  )
}

function DatePop({ value, onPick, onClear, onClose }: {
  value: string | null
  onPick: (iso: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const [anchor, setAnchor] = useState<Date>(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      if (y && m) return new Date(y, m - 1, 1)
    }
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  return (
    <PopShell className="tail date" onClose={onClose}>
      <MiniCalendar
        anchor={anchor}
        selected={value ?? ''}
        onSelect={iso => { onPick(iso); onClose() }}
        onNavMonth={delta => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + delta, 1))}
      />
      <div className="tree-pop-quick">
        <button type="button" onClick={() => { onPick(todayISO()); onClose() }}>Hoje</button>
        <button type="button" onClick={() => { onPick(toISO(addDays(new Date(), 1))); onClose() }}>Amanhã</button>
        <button type="button" onClick={() => { onPick(toISO(addDays(new Date(), 7))); onClose() }}>Semana que vem</button>
        {value && <button type="button" onClick={() => { onClear(); onClose() }}>Limpar</button>}
      </div>
    </PopShell>
  )
}

function RowMenu({ task, api, onClose, setEditingId }: {
  task: Task; api: TaskTreeAPI; onClose: () => void; setEditingId: (id: number | null) => void
}) {
  const act = (fn: () => void) => { fn(); onClose() }
  return (
    <PopShell className="tail" onClose={onClose}>
      <div
        className="tree-pop-opt"
        onClick={() => act(() => api.addChild(task, id => setEditingId(id), () => {}))}
      >
        <Icon name="plus" size={14} />Adicionar subtarefa
      </div>
      {task.parent_id !== null && (
        <div className="tree-pop-opt" onClick={() => act(() => api.promote(task))}>
          <Icon name="arrowUpRight" size={14} />Tornar independente
        </div>
      )}
      <div className="tree-pop-opt" onClick={() => act(() => api.duplicate(task))}>
        <Icon name="copy" size={14} />Duplicar
      </div>
      <div className="tree-pop-sep" />
      <div className="tree-pop-head">Reagendar</div>
      <div className="tree-pop-opt" onClick={() => act(() => api.reschedule(task, 'today'))}>Hoje</div>
      <div className="tree-pop-opt" onClick={() => act(() => api.reschedule(task, 'tomorrow'))}>Amanhã</div>
      <div className="tree-pop-opt" onClick={() => act(() => api.reschedule(task, 'later'))}>Semana que vem</div>
      <div className="tree-pop-sep" />
      <div className="tree-pop-opt" onClick={() => act(() => api.openTask(task))}>
        <Icon name="edit" size={14} />Abrir
      </div>
      <div className="tree-pop-opt danger" onClick={() => act(() => api.remove(task))}>
        <Icon name="trash" size={14} />Excluir
      </div>
    </PopShell>
  )
}

// ─── TreeRow — uma linha da árvore ────────────────────────────────────────────

type OpenPop = 'prio' | 'est' | 'tag' | 'date' | 'menu' | null

interface TreeRowProps {
  task: Task
  depth: number          // profundidade: 0 = raiz, 1 = filho, etc.
  hasKids: boolean       // tem filhos visíveis?
  collapsed: boolean     // está colapsado?
  onToggleCollapse: (id: number, next?: boolean) => void
  api: TaskTreeAPI
  allTasks: Task[]
  editingId: number | null
  setEditingId: (id: number | null) => void
  dragId: number | null
  drop: DropState | null
  // Seleção múltipla (opcional — só a Lista passa) — fatia 025 / R2.
  isSelected: boolean
  onSelectToggle?: (id: number, shift: boolean) => void
  // Navegação por teclado (opcional).
  isFocused: boolean
  onFocus: (id: number) => void
}

function TreeRow({
  task, depth, hasKids, collapsed,
  onToggleCollapse, api, allTasks,
  editingId, setEditingId,
  dragId, drop,
  isSelected, onSelectToggle,
  isFocused, onFocus,
}: TreeRowProps) {
  const [val, setVal] = useState(task.title)
  const [popping, setPopping] = useState(false)
  const [pop, setPop] = useState<OpenPop>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)
  const editing = editingId === task.id
  const done = task.completed_at !== null
  const prog = subProgress(task)
  const tags = task.tags ?? []
  const assignees = task.assignees ?? []

  useEffect(() => {
    if (editing && inputRef.current) {
      committedRef.current = false
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => { setVal(task.title) }, [task.title])

  const commit = useCallback((): string => {
    if (committedRef.current) return ''
    committedRef.current = true
    const v = val.trim()
    if (!v) {
      if (!task.title) api.remove(task)
      setEditingId(null)
      return ''
    }
    if (v !== task.title) api.rename(task, v)
    setEditingId(null)
    return v
  }, [val, task, api, setEditingId])

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = val.trim()
      commit()
      if (v) api.addSibling(task, id => setEditingId(id))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setVal(task.title)
      setEditingId(null)
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      const v = val.trim()
      if (v && v !== task.title) api.rename(task, v)
      api.indent(task)
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      const v = val.trim()
      if (v && v !== task.title) api.rename(task, v)
      api.outdent(task)
    }
  }, [val, task, api, commit, setEditingId])

  const toggle = useCallback(() => {
    if (done) { api.complete(task, false); return }
    setPopping(true)
    setTimeout(() => { setPopping(false); api.complete(task, true) }, 160)
  }, [done, task, api])

  // ── Drag & Drop (@dnd-kit) ────────────────────────────────────────────────
  // A linha inteira é alvo de drop; só a alça (grip) inicia o arraste.
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id })
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id: task.id })
  const rowRef = useCallback((el: HTMLDivElement | null) => { setDropRef(el); setDragRef(el) }, [setDropRef, setDragRef])

  const isDrop = drop?.id === task.id
  const dropClass = isDrop ? ` drop-${drop!.zone}` : ''
  const rowClass =
    `tree-row${done ? ' done' : ''}` +
    `${depth > 0 ? ' is-child' : ''}${hasKids ? ' is-parent' : ''}` +
    `${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}` +
    `${isDragging || dragId === task.id ? ' dragging' : ''}${dropClass}`

  // Fecha o popover aberto sem borbulhar para o onClick da linha (abre o modal).
  // Também foca o container .tree para que a navegação por teclado passe a valer.
  const rowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onFocus(task.id)
    ;(e.currentTarget.closest('.tree') as HTMLElement | null)?.focus({ preventScroll: true })
    if (!editing && !pop) api.openTask(task)
  }

  return (
    <div
      ref={rowRef}
      className={rowClass}
      data-rowid={task.id}
      data-prio={task.priority}
      style={{
        '--depth': depth,
        '--pr-color': PRIO_BAR[task.priority] ?? 'transparent',
        '--pr-tint': PRIO_TINT[task.priority] ?? 'transparent',
      } as React.CSSProperties}
      onClick={rowClick}
    >
      {/* Guias verticais + cotovelo da subtarefa */}
      <span className="tree-guides" aria-hidden="true">
        {Array.from({ length: depth }).map((_, i) => (
          <i key={i} style={{ left: 13 + i * 22 }} />
        ))}
        {depth > 0 && <span className="tree-elbow" style={{ left: 13 + (depth - 1) * 22 }} />}
      </span>

      <span
        className="tree-indent"
        style={{ width: depth * 22 }}
        title={depth >= 2 ? buildBreadcrumb(task, allTasks) : undefined}
      />

      {/* Seletor de multi-seleção — só quando a Lista habilita (aparece no hover / selMode) */}
      {onSelectToggle && (
        <button
          type="button"
          className={`tree-sel${isSelected ? ' on' : ''}`}
          onClick={e => { e.stopPropagation(); onSelectToggle(task.id, (e as React.MouseEvent).shiftKey) }}
          aria-label={isSelected ? 'Desmarcar' : 'Selecionar'}
          title="Selecionar (X)"
        >
          {isSelected && <Icon name="check" size={11} />}
        </button>
      )}

      {/* Alça de drag — só ela inicia o arraste (@dnd-kit listeners) */}
      <span
        className="tree-grip"
        title="Arrastar"
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        <Icon name="grip" size={14} />
      </span>

      {/* Caret de colapso */}
      {hasKids
        ? (
          <button
            className={`tree-caret${collapsed ? ' collapsed' : ''}`}
            onClick={e => { e.stopPropagation(); onToggleCollapse(task.id) }}
            aria-label={collapsed ? 'Expandir' : 'Recolher'}
          >
            <Icon name="chevDown" size={14} />
          </button>
        )
        : <span className="tree-caret ghost" />}

      {/* Checkbox com animação pop */}
      <button
        className={`kg-check tree-check${done ? ' done' : ''}${popping ? ' popping' : ''}`}
        onClick={e => { e.stopPropagation(); toggle() }}
        aria-label={done ? 'Reabrir' : 'Concluir'}
      >
        {done && <Icon name="check" size={11} />}
      </button>

      {/* Marcador de prioridade — agora clicável (abre o seletor) */}
      <button
        className="tree-prio"
        title={`Prioridade: ${PRIO_LABELS[task.priority]}`}
        onClick={e => { e.stopPropagation(); setPop(pop === 'prio' ? null : 'prio') }}
      />
      {pop === 'prio' && (
        <PriorityPop
          current={task.priority}
          onPick={p => api.setField(task, { priority: p })}
          onClose={() => setPop(null)}
        />
      )}

      {/* Corpo: título + glifos */}
      <div className="tk-body" onClick={e => { if (!editing) e.stopPropagation() }}>
        <div className="tk-title-row">
          {task.type !== 'task' && (
            <Icon name={task.type === 'event' ? 'cal' : 'loop'} size={13} className="tk-type" />
          )}

          {editing
            ? (
              <input
                ref={inputRef}
                className="tk-title-input"
                value={val}
                onClick={e => e.stopPropagation()}
                onChange={e => setVal(e.target.value)}
                onBlur={commit}
                onKeyDown={onKey}
                placeholder="Nova tarefa…"
              />
            )
            : (
              <span
                className="tk-title"
                onClick={e => { e.stopPropagation(); setEditingId(task.id) }}
                title={task.title || 'Sem título'}
              >
                {task.title || <span className="tk-untitled">Sem título</span>}
              </span>
            )}

          {hasKids && (
            <span
              className="tree-count"
              onClick={e => { e.stopPropagation(); onToggleCollapse(task.id) }}
            >
              {prog.done}/{prog.total}
            </span>
          )}

          {task.recurrence?.active && (
            <span className="tk-flagmini" title={task.recurrence_text ?? 'Recorrente'}>
              <Icon name="loop" size={12} />
            </span>
          )}

          {task.description && task.description.trim() && (
            <span className="tk-flagmini" title="Tem descrição">
              <Icon name="note" size={12} />
            </span>
          )}
        </div>
      </div>

      {/* Meta: TODAS as tags, estimativa e data — cada uma editável inline */}
      <div className="tk-meta" onClick={e => e.stopPropagation()}>
        {assignees.length > 0 && <AvatarStack assignees={assignees} size={18} max={3} />}

        {tags.length > 0
          ? (
            <button
              className="tk-chip-btn"
              title="Editar etiquetas"
              onClick={e => { e.stopPropagation(); setPop(pop === 'tag' ? null : 'tag') }}
            >
              {tags.slice(0, 3).map(t => (
                <span key={t.id} className="tk-tag-chip" style={{ background: t.color ?? undefined }}>
                  {t.name}
                </span>
              ))}
              {tags.length > 3 && <span className="tk-tag-chip">+{tags.length - 3}</span>}
            </button>
          )
          : (
            <span
              className="tk-chip-ghost"
              onClick={e => { e.stopPropagation(); setPop(pop === 'tag' ? null : 'tag') }}
            >
              + etiqueta
            </span>
          )}
        {pop === 'tag' && (
          <TagPop
            current={tags}
            onToggle={names => api.setField(task, { tags: names })}
            onClose={() => setPop(null)}
          />
        )}

        {task.duration_min
          ? (
            <button
              className="tk-chip-btn tk-est-chip"
              title="Editar estimativa"
              onClick={e => { e.stopPropagation(); setPop(pop === 'est' ? null : 'est') }}
            >
              <Icon name="timer" size={11} />{fmtEst(task.duration_min)}
            </button>
          )
          : (
            <span
              className="tk-chip-ghost"
              onClick={e => { e.stopPropagation(); setPop(pop === 'est' ? null : 'est') }}
            >
              + estimativa
            </span>
          )}
        {pop === 'est' && (
          <EstimatePop
            current={task.duration_min}
            onPick={min => api.setField(task, { duration_min: min || null })}
            onClose={() => setPop(null)}
          />
        )}

        {task.due_date
          ? (
            <button
              className={`tk-chip-btn tk-date-chip${done ? '' : ` ${dueClass(task.due_date, done)}`}`}
              title="Editar vencimento"
              onClick={e => { e.stopPropagation(); setPop(pop === 'date' ? null : 'date') }}
            >
              {dueLabel(task.due_date)}
              {task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''}
            </button>
          )
          : (
            <span
              className="tk-chip-ghost"
              onClick={e => { e.stopPropagation(); setPop(pop === 'date' ? null : 'date') }}
            >
              + data
            </span>
          )}
        {pop === 'date' && (
          <DatePop
            value={task.due_date}
            onPick={iso => api.setField(task, { due_date: iso })}
            onClear={() => api.setField(task, { due_date: null })}
            onClose={() => setPop(null)}
          />
        )}
      </div>

      {/* Cauda: responsáveis + menu "⋯" (só no hover) */}
      <div className="tree-tail" onClick={e => e.stopPropagation()}>
        <span className={`tree-assignee${assignees.length > 0 ? ' has' : ''}`}>
          <AssigneePicker
            selected={assignees.map(a => a.id)}
            onChange={ids => api.setAssignees(task, ids)}
          />
        </span>
        <button
          type="button"
          className={`tree-more${pop === 'menu' ? ' open' : ''}`}
          title="Mais ações"
          onClick={e => { e.stopPropagation(); setPop(pop === 'menu' ? null : 'menu') }}
        >
          <Icon name="dots" size={15} />
        </button>
        {pop === 'menu' && (
          <RowMenu task={task} api={api} setEditingId={setEditingId} onClose={() => setPop(null)} />
        )}
      </div>
    </div>
  )
}

// ─── TaskTree — raiz da árvore recursiva ─────────────────────────────────────

export interface TaskTreeProps {
  roots: Task[]
  sorter?: (a: Task, b: Task) => number
  hideCompleted?: boolean
  api: TaskTreeAPI
  scopeKey: string
  showAddRoot?: boolean
  onAddRoot?: () => void
  // Seleção múltipla — a Lista passa; outras superfícies (Meu Dia) não.
  selected?: Set<number>
  onSelectToggle?: (id: number, shift: boolean) => void
}

export function TaskTree({
  roots, api, scopeKey, showAddRoot, onAddRoot, sorter, hideCompleted,
  selected, onSelectToggle,
}: TaskTreeProps) {
  const allTasks = useMemo(() => flattenTree(roots), [roots])

  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`kg:collapsed:${scopeKey}`)
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set()
    } catch { return new Set() }
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)

  // ── @dnd-kit: sensores + rastreio do Y do ponteiro (para as 3 zonas) ───────
  const sensors = useDndSensors()
  const pointerY = useRef(0)
  const trackPointer = useCallback((e: PointerEvent) => { pointerY.current = e.clientY }, [])

  const zoneFor = useCallback((targetId: number): DropZone => {
    const el = document.querySelector(`.tree-row[data-rowid="${targetId}"]`)
    if (!el) return 'after'
    const r = el.getBoundingClientRect()
    const rel = (pointerY.current - r.top) / r.height
    if (rel < 0.28) return 'before'
    if (rel > 0.72) return 'after'
    return 'child'
  }, [])

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDragId(Number(e.active.id))
    setDrop(null)
    window.addEventListener('pointermove', trackPointer)
  }, [trackPointer])

  const onDragOver = useCallback((e: DragOverEvent) => {
    const overId = e.over ? Number(e.over.id) : null
    if (overId == null || overId === Number(e.active.id)) { setDrop(null); return }
    const zone = zoneFor(overId)
    setDrop(prev => (prev && prev.id === overId && prev.zone === zone ? prev : { id: overId, zone }))
  }, [zoneFor])

  const endDrag = useCallback(() => {
    window.removeEventListener('pointermove', trackPointer)
    setDragId(null)
    setDrop(null)
  }, [trackPointer])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const overId = e.over ? Number(e.over.id) : null
    if (overId != null && overId !== Number(e.active.id) && drop && drop.id === overId) {
      api.move(Number(e.active.id), overId, drop.zone)
    }
    endDrag()
  }, [drop, api, endDrag])

  useEffect(() => () => { window.removeEventListener('pointermove', trackPointer) }, [trackPointer])

  const draggedTask = dragId != null ? allTasks.find(t => t.id === dragId) : undefined

  const toggleCollapse = useCallback((id: number, next?: boolean) => {
    setCollapsed(prev => {
      const ns = new Set(prev)
      const shouldCollapse = next === undefined ? !ns.has(id) : next === false ? false : true
      if (shouldCollapse) ns.add(id)
      else ns.delete(id)
      try { localStorage.setItem(`kg:collapsed:${scopeKey}`, JSON.stringify(Array.from(ns))) } catch {}
      return ns
    })
  }, [scopeKey])

  const expandAll = useCallback((ids: number[]) => {
    setCollapsed(prev => {
      const ns = new Set(prev)
      for (const id of ids) ns.delete(id)
      try { localStorage.setItem(`kg:collapsed:${scopeKey}`, JSON.stringify(Array.from(ns))) } catch {}
      return ns
    })
  }, [scopeKey])

  const collapseAll = useCallback((ids: number[]) => {
    setCollapsed(prev => {
      const ns = new Set(prev)
      for (const id of ids) ns.add(id)
      try { localStorage.setItem(`kg:collapsed:${scopeKey}`, JSON.stringify(Array.from(ns))) } catch {}
      return ns
    })
  }, [scopeKey])

  const collectParentIds = useCallback((tasks: Task[]): number[] => {
    const ids: number[] = []
    function walk(ts: Task[]) {
      for (const t of ts) {
        if (t.subtasks && t.subtasks.length > 0) {
          ids.push(t.id)
          walk(t.subtasks)
        }
      }
    }
    walk(tasks)
    return ids
  }, [])

  const renderNode = useCallback((t: Task, depth: number): React.ReactNode => {
    const rawKids = t.subtasks ?? []
    const sortedKids = sorter ? [...rawKids].sort(sorter) : rawKids
    const kids = hideCompleted ? sortedKids.filter(k => !k.completed_at) : sortedKids
    const hasKids = kids.length > 0
    const isCollapsed = collapsed.has(t.id)

    return (
      <Fragment key={t.id}>
        <TreeRow
          task={t}
          depth={depth}
          hasKids={hasKids}
          collapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          api={api}
          allTasks={allTasks}
          editingId={editingId}
          setEditingId={setEditingId}
          dragId={dragId}
          drop={drop}
          isSelected={!!selected?.has(t.id)}
          onSelectToggle={onSelectToggle}
          isFocused={focusId === t.id}
          onFocus={setFocusId}
        />
        {hasKids && !isCollapsed && kids.map(k => renderNode(k, depth + 1))}
      </Fragment>
    )
  }, [collapsed, toggleCollapse, api, allTasks, editingId, dragId, drop, sorter, hideCompleted, selected, onSelectToggle, focusId])

  const parentIds = collectParentIds(roots)
  const allCollapsed = parentIds.length > 0 && parentIds.every(id => collapsed.has(id))

  // ── Navegação por teclado (ordem de renderização visível) ──────────────────
  const visibleIds = useMemo(() => {
    const out: number[] = []
    const walk = (list: Task[]) => {
      const sorted = sorter ? [...list].sort(sorter) : list
      const vis = hideCompleted ? sorted.filter(t => !t.completed_at) : sorted
      for (const t of vis) {
        out.push(t.id)
        if (!collapsed.has(t.id)) {
          const kids = hideCompleted ? (t.subtasks ?? []).filter(k => !k.completed_at) : (t.subtasks ?? [])
          if (kids.length) walk(kids)
        }
      }
    }
    walk(roots)
    return out
  }, [roots, sorter, hideCompleted, collapsed])

  const onTreeKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ignora quando a digitação está num campo (edição inline, busca de popover…).
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (!visibleIds.length) return
    const cur = focusId != null ? visibleIds.indexOf(focusId) : -1
    const at = (i: number) => allTasks.find(t => t.id === visibleIds[i])

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusId(visibleIds[Math.min(visibleIds.length - 1, cur + 1)] ?? visibleIds[0])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusId(visibleIds[Math.max(0, cur < 0 ? 0 : cur - 1)])
    } else if (focusId == null) {
      return
    } else if (e.key === ' ') {
      e.preventDefault()
      const t = at(cur); if (t) api.complete(t, t.completed_at === null)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      setEditingId(focusId)
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault()
      onSelectToggle?.(focusId, e.shiftKey)
    } else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '0') {
      const t = at(cur); if (t) api.setField(t, { priority: Number(e.key) })
    } else if (e.key === 't' || e.key === 'T') {
      const t = at(cur); if (t) api.reschedule(t, 'today')
    } else if (e.key === 'a' || e.key === 'A') {
      const t = at(cur); if (t) api.reschedule(t, 'tomorrow')
    } else if (e.key === 'Delete') {
      const t = at(cur); if (t && window.confirm('Excluir esta tarefa?')) api.remove(t)
    } else if (e.key === 'Escape') {
      setFocusId(null)
    }
  }, [visibleIds, focusId, allTasks, api, onSelectToggle])

  return (
    <div
      className={`tree${dragId ? ' dragging-active' : ''}${selected && selected.size > 0 ? ' selmode' : ''}`}
      tabIndex={0}
      onKeyDown={onTreeKey}
    >
      {parentIds.length > 0 && (
        <div className="tree-expand-toggle">
          <button
            type="button"
            className="tree-act-flat"
            onClick={() => allCollapsed ? expandAll(parentIds) : collapseAll(parentIds)}
          >
            <Icon name={allCollapsed ? 'chevDown' : 'chevUp'} size={13} />
            {allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        {(() => {
          const sortedRoots = sorter ? [...roots].sort(sorter) : roots
          const visibleRoots = hideCompleted ? sortedRoots.filter(r => !r.completed_at) : sortedRoots
          return visibleRoots.map(r => renderNode(r, 0))
        })()}

        <DragOverlay dropAnimation={null}>
          {draggedTask && (
            <div className="tree-drag-ghost">
              <Icon name="grip" size={14} />
              <span>{draggedTask.title || 'Sem título'}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showAddRoot && (
        <button type="button" className="tree-addroot" onClick={onAddRoot}>
          <Icon name="plus" size={14} />
          Adicionar tarefa
        </button>
      )}
    </div>
  )
}
