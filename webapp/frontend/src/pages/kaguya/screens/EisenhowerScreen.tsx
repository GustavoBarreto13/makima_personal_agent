// EisenhowerScreen — Matriz 2×2 derivada de prioridade × urgência (fatia 017).
// Não cria campo novo: classifica as tarefas abertas existentes em quadrantes
// via isUrgent/isImportant em lib/eisenhower.ts. Drag entre quadrantes atualiza
// priority e/ou due_date via PATCH /api/tasks/{id} (reusa update_task).
//
// DnD via @dnd-kit (migrado do HTML5 nativo):
//   • DragOverlay suave que segue o cursor em vez do ghost fantasma do browser.
//   • PointerSensor com 5px de ativação → clique (<5px) abre a tarefa normalmente.
//   • Optimistic update: o card pula de quadrante IMEDIATAMENTE (sem esperar a rede).
//   • Sem spinner ao soltar: o "Carregando…" só aparece no primeiro carregamento.

import { useEffect, useState, useCallback } from 'react'
import type { Task, Project } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { QUADS, getQuadrant, buildDragPatch, type QuadId } from '../lib/eisenhower'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
// Sensor centralizado (PointerSensor, 5px de ativação) compartilhado com Kanban e Lista.
import { useDndSensors } from '../lib/dnd'

// Ícone de prioridade (consistente com TaskRow/PlanCard).
const PRIO_ICON = ['', '🔵', '🟡', '🔴']

// Formata due_date como "dd/mm" para o chip de data nos cards.
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// ─── DraggableCard ────────────────────────────────────────────────────────────
// Componente interno: envolve o markup "kcard" com os hooks de drag do @dnd-kit.
// Ao manter o markup exatamente igual ao original (mesmo className, data-prio, etc.)
// garantimos que o visual não muda — só o mecanismo de arraste muda.
function DraggableCard({
  task,
  isBeingDragged,
  onOpen,
  projectName,
}: {
  task: Task
  isBeingDragged: boolean
  onOpen: (t: Task) => void
  projectName: string
}) {
  // useDraggable: fornece listeners (events que iniciam o drag), attributes (aria-*)
  // e setNodeRef (diz ao dnd-kit qual elemento DOM é este card).
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      // kcard--dragging: mantida para compatibilidade CSS; agora controlada por isBeingDragged.
      className={`kcard${isBeingDragged ? ' kcard--dragging' : ''}`}
      // data-prio renderiza a barra de prioridade via CSS (mesmo padrão do PlanCard).
      data-prio={task.priority}
      // Enquanto o card está sendo arrastado, o slot original fica semi-transparente.
      style={{ opacity: isBeingDragged ? 0.35 : 1 }}
      // onClick abre a tarefa (clique real, < 5px de deslocamento).
      onClick={() => onOpen(task)}
      // attributes: aria-describedby, role, tabIndex (acessibilidade do dnd-kit).
      // listeners: pointerdown, etc. — disparam o drag somente após 5px de movimento.
      {...attributes}
      {...listeners}
    >
      <div className="kcard-title">{task.title}</div>
      <div className="kcard-meta">
        {task.priority > 0 && (
          <span className="kcard-prio">{PRIO_ICON[task.priority]}</span>
        )}
        {task.due_date && (
          <span className="kcard-date">📅 {fmtDate(task.due_date)}</span>
        )}
        {projectName && (
          <span className="kcard-proj">{projectName}</span>
        )}
      </div>
    </div>
  )
}

// ─── QuadrantDroppable ────────────────────────────────────────────────────────
// Componente interno: torna o quadrante uma zona de soltar (@dnd-kit).
// O id segue o prefixo "quad:<qid>" para que o onDragEnd saiba distinguir
// droppables de quadrante de outros possíveis droppables.
function QuadrantDroppable({
  quad,
  items,
  activeId,
  onOpen,
  projectName,
}: {
  quad: typeof QUADS[number]
  items: Task[]
  activeId: number | null
  onOpen: (t: Task) => void
  projectName: (t: Task) => string
}) {
  // useDroppable: isOver = true quando um card está passando sobre este quadrante.
  const { setNodeRef, isOver } = useDroppable({ id: `quad:${quad.id}` })

  return (
    <div
      ref={setNodeRef}
      // eis-drop-ok: a classe CSS de hover já existia (agora via isOver, não classList manual).
      className={`eis-quad${isOver ? ' eis-drop-ok' : ''}`}
      data-qid={quad.id}
    >
      {/* Cabeçalho do quadrante */}
      <div className="eq-head">
        <span className="eq-mark" style={{ background: quad.color }} />
        <span className="eq-label">{quad.label}</span>
        <span className="eq-count">{items.length}</span>
      </div>
      <div className="eq-sub">{quad.sub}</div>

      {/* Cards arrastáveis */}
      <div className="eq-body">
        {items.length === 0 ? (
          <div className="eq-empty">vazio</div>
        ) : (
          items.map(task => (
            <DraggableCard
              key={task.id}
              task={task}
              isBeingDragged={activeId === task.id}
              onOpen={onOpen}
              projectName={projectName(task)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── EisenhowerScreen ─────────────────────────────────────────────────────────

interface EisenhowerScreenProps {
  projects: Project[]
  reloadKey: number
  onChanged: () => void
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function EisenhowerScreen({ projects, reloadKey, onChanged, onOpenTask, toast }: EisenhowerScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  // loading: só true no 1º carregamento. Soltar um card NÃO ativa o spinner.
  const [loading, setLoading] = useState(true)
  // activeId: id do card em arraste (null = nenhum drag ativo).
  const [activeId, setActiveId] = useState<number | null>(null)

  // Sensor centralizado: PointerSensor com 5px de ativação.
  const sensors = useDndSensors()

  // Carrega (ou recarrega) as tarefas da Eisenhower.
  // O parâmetro `silent` evita piscar o "Carregando…" após um drop:
  //   - false (padrão): mostra o spinner (1º carregamento ou reloadKey).
  //   - true           : re-busca em background, sem alterar `loading`.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await kaguyaApi.eisenhower()
      setTasks(r)
    } catch {
      toast('Falha ao carregar a Eisenhower.', 'err')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [toast])

  // Re-busca quando o reloadKey muda (modal salvo, etc.).
  useEffect(() => { load() }, [load, reloadKey])

  // Agrupa as tarefas pelo quadrante derivado (isUrgent × isImportant).
  const byQuad = (qid: QuadId) =>
    tasks.filter(t => getQuadrant(t) === qid)

  // Nome da lista da tarefa (chip do card).
  const projectName = (task: Task) =>
    projects.find(p => p.id === task.project_id)?.name ?? ''

  // Tarefa que está sendo arrastada (para o DragOverlay seguir o cursor).
  const activeTask = activeId != null ? tasks.find(t => t.id === activeId) ?? null : null

  // ── Handlers de DnD ──────────────────────────────────────────────────────────

  // Início do drag: registra qual card está no cursor.
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }, [])

  // Fim do drag: aplica o optimistic update e persiste via API.
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    // Limpa o estado de drag independente do resultado.
    setActiveId(null)

    // Sem destino válido (solto fora de qualquer quadrante) → cancela.
    if (!over) return

    const taskId = active.id as number
    const task   = tasks.find(t => t.id === taskId)
    if (!task) return

    // O id do droppable tem o formato "quad:<qid>" (definido em QuadrantDroppable).
    // Extraímos o qid e calculamos o patch de priority/due_date.
    const targetQid = (over.id as string).replace('quad:', '') as QuadId
    const patch = buildDragPatch(task, targetQid)

    // Sem mudança (já estava no quadrante certo).
    if (!patch) {
      toast('Já estava aqui.', 'ok')
      return
    }

    // ── Optimistic update ───────────────────────────────────────────────────
    // 1. Salva snapshot para rollback em caso de erro de rede.
    const snapshot = [...tasks]

    // 2. Aplica o patch localmente: o card pula de quadrante IMEDIATAMENTE.
    //    Como getQuadrant() deriva o quadrante de priority e due_date,
    //    atualizar essas chaves já move o card para o quadrante correto na UI.
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))

    const target = QUADS.find(q => q.id === targetQid)!

    try {
      // 3. Persiste no backend (PATCH /api/tasks/{id}).
      await kaguyaApi.updateTask(taskId, patch)
      toast(`Movida para "${target.label}".`)
      // 4. Reload silencioso: sincroniza com o estado real do servidor
      //    sem piscar o "Carregando…" de tela cheia.
      load(true)
      onChanged()
    } catch {
      // 5. Rollback: restaura o estado anterior ao drag caso a API falhe.
      setTasks(snapshot)
      toast('Não foi possível mover a tarefa.', 'err')
    }
  }, [tasks, load, onChanged, toast])

  // ── Render ────────────────────────────────────────────────────────────────────

  // Spinner apenas no 1º carregamento (nunca ao soltar um card).
  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>

  return (
    // DndContext: contexto global de DnD desta tela.
    //   sensors           — PointerSensor com 5px de ativação (lib/dnd.ts).
    //   collisionDetection — closestCorners: usa o centro do droppable mais próximo.
    //   onDragStart / onDragEnd — handlers acima.
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="kg-page kg-eis-page">
        {/* Cabeçalho */}
        <div className="kg-eis-header">
          <div className="kg-eis-title">Matriz de Eisenhower</div>
          <div className="kg-eis-sub">view derivada de prioridade × urgência · arraste para ajustar</div>
        </div>

        {/* Grade 2×2 — cada quadrante é um QuadrantDroppable */}
        <div className="eis-grid">
          {QUADS.map(quad => (
            <QuadrantDroppable
              key={quad.id}
              quad={quad}
              items={byQuad(quad.id)}
              activeId={activeId}
              onOpen={onOpenTask}
              projectName={projectName}
            />
          ))}
        </div>
      </div>

      {/* DragOverlay: cópia do card que segue o cursor durante o drag.
          dropAnimation={null} = sem animação de "retorno" ao soltar,
          igual ao padrão do Kanban.
          O portal do DragOverlay é renderizado fora da árvore DOM do componente,
          por isso o card no overlay aparece acima de TUDO (z-index do dnd-kit). */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="kg-drag-overlay">
            <div className="kcard" data-prio={activeTask.priority}>
              <div className="kcard-title">{activeTask.title}</div>
              <div className="kcard-meta">
                {activeTask.priority > 0 && (
                  <span className="kcard-prio">{PRIO_ICON[activeTask.priority]}</span>
                )}
                {activeTask.due_date && (
                  <span className="kcard-date">📅 {fmtDate(activeTask.due_date)}</span>
                )}
                {projectName(activeTask) && (
                  <span className="kcard-proj">{projectName(activeTask)}</span>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
