// Matriz de Eisenhower: 2×2 derivada de prioridade × urgência. Não cria campo: arrastar para outro quadrante ajusta a
// prioridade e/ou o vencimento (com “Desfazer”). Melhorias sobre o shell antigo: concluir pelo checkbox, filtrar por lista
// e respeitar o espaço Trabalho/Pessoal. O card pula de quadrante antes da resposta (otimista) e volta se a rede falhar.

import { DndContext, DragOverlay, closestCorners, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { EmptyState, ErrorState, Icon, LoadingState, Page, Select, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { ProjectOptions } from '../components/ProjectOptions'
import { useKaguya } from '../context'
import { buildDragPatch, getQuadrant, QUADS, undoPatch, type Quad, type QuadId } from '../lib/eisenhower'
import { useDndSensors } from '../lib/dnd'
import { dueInfo } from '../lib/taskView'
import type { Task } from '../types'

const PRIO_CLASS = ['', 'kn-p1', 'kn-p2', 'kn-p3']
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

function Card({ task, projectName, dragging, onOpen, onToggle }: { task: Task; projectName: string; dragging?: boolean; onOpen: (t: Task) => void; onToggle: (t: Task) => void }) {
  const k = useKaguya()
  const due = task.due_date ? dueInfo(task, k.today) : null
  return (
    <div className="kn-kcard kn-ecard" data-prio={task.priority} style={{ '--kn-pr': ['transparent', 'var(--ds-info)', 'var(--ds-warn)', 'var(--ds-danger)'][task.priority] ?? 'transparent', opacity: dragging ? 0.35 : 1 } as CSSProperties}>
      <button
        type="button"
        className={`kn-check ${PRIO_CLASS[task.priority] ?? ''}`}
        role="checkbox"
        aria-checked={false}
        aria-label={`Concluir “${task.title}”`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggle(task) }}
      />
      <button type="button" className="kn-kbody kn-ebody" onClick={() => onOpen(task)}>
        <span className="kn-ktitle">{task.title}</span>
        <span className="kn-kmeta">
          {due && <span className={`kn-kdate kn-due kn-due-${due.tone}`}><Icon name="calendar" size={11} />{due.label}</span>}
          {projectName && <span className="kn-kproj"><i /><span>{projectName}</span></span>}
        </span>
      </button>
    </div>
  )
}

function Draggable({ task, activeId, ...rest }: { task: Task; activeId: number | null; projectName: string; onOpen: (t: Task) => void; onToggle: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return <div ref={setNodeRef} {...attributes} {...listeners}><Card task={task} dragging={activeId === task.id} {...rest} /></div>
}

function Quadrant({ quad, items, activeId, projectName, onOpen, onToggle }: { quad: Quad; items: Task[]; activeId: number | null; projectName: (t: Task) => string; onOpen: (t: Task) => void; onToggle: (t: Task) => void }) {
  // O quadrante inteiro é o alvo: `isOver` realça enquanto um card passa por cima.
  const { setNodeRef, isOver } = useDroppable({ id: `quad:${quad.id}` })
  return (
    <section ref={setNodeRef} className={`kn-quad${isOver ? ' kn-over' : ''}`} aria-label={quad.label}>
      <header className="kn-quad-h">
        <i className="kn-quad-mark" style={{ background: quad.color }} />
        <b>{quad.label}</b>
        <span className="ds-num kn-quad-n">{items.length}</span>
      </header>
      <p className="ds-hint">{quad.sub}</p>
      <div className="kn-quad-b">
        {items.length === 0
          ? <p className="ds-hint kn-quad-empty">Vazio</p>
          : items.map((t) => <Draggable key={t.id} task={t} activeId={activeId} projectName={projectName(t)} onOpen={onOpen} onToggle={onToggle} />)}
      </div>
    </section>
  )
}

export function Eisenhower() {
  const k = useKaguya()
  const [tasks, setTasks] = useState<Task[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading')
  const [activeId, setActiveId] = useState<number | null>(null)
  const [listId, setListId] = useState('')
  const sensors = useDndSensors()
  const loadedRev = useRef(-1)
  const revRef = useRef(k.rev)
  revRef.current = k.rev

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setStatus('loading')
    loadedRev.current = revRef.current
    try { setTasks(await kaguyaApi.eisenhower(k.space)); setStatus('ok') } catch { if (!silent) setStatus('error') }
  }, [k.space])
  useEffect(() => { void load(false) }, [load])
  useEffect(() => { if (status === 'ok' && loadedRev.current !== k.rev) void load(true) }, [status, k.rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => (listId ? tasks.filter((t) => t.project_id === Number(listId)) : tasks), [tasks, listId])
  const projectName = (t: Task) => k.projectNames[t.project_id] ?? ''
  const activeTask = tasks.find((t) => t.id === activeId)

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const task = tasks.find((t) => t.id === active.id)
    const target = String(over.id).replace('quad:', '') as QuadId
    const quad = QUADS.find((q) => q.id === target)
    if (!task || !quad) return
    const patch = buildDragPatch(task, target, k.today)
    if (!patch) { toast('A tarefa já estava neste quadrante.'); return }
    const snapshot = tasks
    const original = { priority: task.priority, due_date: task.due_date }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    try {
      await kaguyaApi.updateTask(task.id, patch)
      toast(`“${task.title}” foi para “${quad.label}”.`, {
        tone: 'success',
        undo: () => { void kaguyaApi.updateTask(task.id, undoPatch(original, patch)).then(k.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) },
      })
      k.reload()
    } catch (err) {
      setTasks(snapshot)
      toast(reason(err, 'Não foi possível mover a tarefa.'), { tone: 'error' })
    }
  }

  if (status === 'loading') return <Page wide><LoadingState variant="card" count={4} /></Page>
  if (status === 'error') return <Page wide><ErrorState onRetry={() => void load(false)} /></Page>

  return (
    <Page wide className="kn-page">
      <div className="kn-quick">
        <Select aria-label="Filtrar por lista" value={listId} onChange={(e) => setListId(e.target.value)}>
          <option value="">Todas as listas</option>
          <ProjectOptions projects={k.projects} groups={k.groups} />
        </Select>
        <p className="ds-hint">Derivada de prioridade × urgência (vence em até 2 dias). Arraste para ajustar.</p>
      </div>
      {tasks.length === 0 ? (
        <EmptyState icon="grid" title="Nada para priorizar" hint="Quando houver tarefas abertas com prioridade ou data, elas aparecem distribuídas nos quatro quadrantes." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as number)} onDragEnd={(e) => void onDragEnd(e)}>
          <div className="kn-quads">
            {QUADS.map((q) => (
              <Quadrant
                key={q.id}
                quad={q}
                items={visible.filter((t) => getQuadrant(t, k.today) === q.id)}
                activeId={activeId}
                projectName={projectName}
                onOpen={(t) => k.openTask(t.id)}
                onToggle={(t) => void k.toggleComplete(t)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask ? <div className="kn-koverlay"><Card task={activeTask} projectName={projectName(activeTask)} onOpen={() => {}} onToggle={() => {}} /></div> : null}
          </DragOverlay>
        </DndContext>
      )}
    </Page>
  )
}
