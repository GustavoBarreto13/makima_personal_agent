// ListScreen — a view lista de uma "Lista" (guia §4.1). Tarefas por posição,
// subtarefas aninhadas, conclusão (com confirmação de cascata), edição inline,
// drag-and-drop para reordenar e seção colapsável de concluídas.
// Fatia 018: atalhos de teclado (Space/X = completa, Enter = edita inline) com
// focusIdx local (sem estado global — regra de pages/CLAUDE.md).
//
// DnD via @dnd-kit (migrado do HTML5 nativo):
//   • SortableTaskRow: cada linha da lista é sortable (animação de deslize).
//   • DragOverlay suave que segue o cursor.
//   • Optimistic update: a linha reordena IMEDIATAMENTE, sem esperar a API.
//   • Sem spinner ao reordenar: setLoading(true) só no 1º carregamento.

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskRow } from '../components/TaskRow'
import { SortableTaskRow } from '../components/SortableTaskRow'
import { Icon } from '../ui/Icons'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
// Sensor e helper de posição centralizados (PointerSensor 5px, midPosition).
import { useDndSensors, midPosition } from '../lib/dnd'

interface ListScreenProps {
  projectId: number
  projectName: string
  reloadKey: number              // muda → força re-fetch (após salvar no modal)
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ListScreen({ projectId, projectName, reloadKey, onOpenTask, onNewTask, toast }: ListScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  // loading: só true no 1º carregamento. Reordenar NÃO ativa o spinner.
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  // focusIdx: índice da tarefa aberta em foco (navegável por ↑↓, atalhos Space/X/Enter).
  // Estado LOCAL — sem estado global (regra de pages/CLAUDE.md — fatia 018).
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  // activeId: id da linha em arraste (null = nenhum drag ativo).
  const [activeId, setActiveId] = useState<number | null>(null)
  // Ref para o container da lista (para não propagar atalhos além desta tela).
  const listContainerRef = useRef<HTMLDivElement>(null)

  // Sensor centralizado: PointerSensor com 5px de ativação.
  const sensors = useDndSensors()

  // firstLoad: verdadeiro apenas no mount (ou quando a lista muda via projectId).
  // Garante spinner só no carregamento inicial, nunca após reordenação ou modal.
  const firstLoad = useRef(true)

  // Busca as tarefas da lista (inclui concluídas para a seção colapsável).
  // O parâmetro `silent` evita piscar o "Carregando…":
  //   - false: mostra o spinner (só no mount ou troca de lista).
  //   - true : re-busca em background (após reordenação ou modal).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setTasks(await kaguyaApi.listTasks(projectId, true))
    } catch {
      toast('Falha ao carregar as tarefas.', 'err')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId, toast])

  // Spinner só no mount e na troca de lista; bumps de reloadKey são silenciosos.
  useEffect(() => {
    const silent = !firstLoad.current
    firstLoad.current = false
    load(silent)
  }, [load, reloadKey])

  // Conclui/reabre uma tarefa. Em pai com subtarefas abertas, confirma a cascata.
  const toggle = async (task: Task) => {
    try {
      if (task.completed_at) {
        await kaguyaApi.reopen(task.id)
      } else {
        const r = await kaguyaApi.complete(task.id)
        if (r.needs_cascade) {
          const ok = window.confirm(`Esta tarefa tem ${r.open_subtasks} subtarefa(s) aberta(s). Concluir todas?`)
          if (!ok) return
          await kaguyaApi.complete(task.id, true)
        }
      }
      await load()
    } catch { toast('Não foi possível atualizar a tarefa.', 'err') }
  }

  const rename = async (task: Task, title: string) => {
    try { await kaguyaApi.updateTask(task.id, { title }); await load() }
    catch { toast('Falha ao renomear.', 'err') }
  }

  // Reseta o foco ao trocar de lista (projectId muda).
  useEffect(() => { setFocusIdx(null) }, [projectId])

  // ── Atalhos de teclado locais (fatia 018 — SC-003) ───────────────────────
  // Space / X  → completa ou reabre a tarefa em foco.
  // Enter      → abre o TaskModal da tarefa em foco.
  // ↑ / ↓      → move o foco entre as tarefas abertas.
  // Guarda: não dispara quando o foco está num input/textarea/contenteditable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Guarda SC-003: atalhos de letra não disparam dentro de campos de texto.
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return
      // ⌘K/Ctrl+K gerenciado pelo KaguyaShell — não tratar aqui.
      if ((e.metaKey || e.ctrlKey)) return

      const open = tasks.filter(t => !t.completed_at)
      if (open.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx(i => i == null ? 0 : Math.min(open.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx(i => i == null ? 0 : Math.max(0, i - 1))
      } else if ((e.key === ' ' || e.key === 'x' || e.key === 'X') && focusIdx != null) {
        e.preventDefault()
        toggle(open[focusIdx])
      } else if (e.key === 'Enter' && focusIdx != null) {
        e.preventDefault()
        onOpenTask(open[focusIdx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, focusIdx])

  // Divide tarefas em abertas (arrastáveis) e concluídas (lista estática).
  const open = tasks.filter((t) => !t.completed_at)
  const done = tasks.filter((t) => t.completed_at)

  // Tarefa ativa no drag (para o DragOverlay seguir o cursor).
  const activeTask = activeId != null ? open.find(t => t.id === activeId) ?? null : null

  // ── Handlers de DnD ──────────────────────────────────────────────────────────

  // Início do drag: registra qual linha está no cursor.
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }, [])

  // Fim do drag: aplica o optimistic update de posição e persiste via API.
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event

    // Limpa o estado de drag.
    setActiveId(null)

    // Sem destino (solto fora da lista) ou sem movimento → cancela.
    if (!over || active.id === over.id) return

    const draggedId = active.id as number
    const overId    = over.id    as number

    // Índices atual e destino dentro das tarefas abertas.
    const oldIndex = open.findIndex(t => t.id === draggedId)
    const newIndex = open.findIndex(t => t.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    // ── Optimistic update ───────────────────────────────────────────────────
    // 1. Salva snapshot para rollback em caso de erro de rede.
    const snapshot = [...tasks]

    // 2. Reordena as tarefas abertas localmente via arrayMove do @dnd-kit/sortable.
    //    arrayMove retorna um novo array com o item movido para o newIndex.
    const reordered = arrayMove([...open], oldIndex, newIndex)

    // 3. Calcula a position local temporária para a UI (usa midPosition de lib/dnd.ts).
    //    A position real será gravada pelo backend após o reload silencioso.
    const afterCard  = reordered[newIndex - 1] ?? null   // item imediatamente acima
    const beforeCard = reordered[newIndex + 1] ?? null   // item imediatamente abaixo
    const localPos   = midPosition(afterCard, beforeCard)

    // 4. Monta o novo array de tarefas: abertas reordenadas + concluídas intactas.
    //    Aplica a position local na tarefa movida para que a UI reflita a ordem.
    const newTasks = [
      ...reordered.map(t => t.id === draggedId ? { ...t, position: localPos } : t),
      ...done,
    ]
    setTasks(newTasks)

    // 5. Determina after_id e before_id para o endpoint /position do backend.
    //    Passar os dois vizinhos é mais preciso que só o before_id (comportamento anterior).
    const afterId  = reordered[newIndex - 1]?.id
    const beforeId = reordered[newIndex + 1]?.id

    try {
      // 6. Persiste no backend (POST /api/tasks/{id}/position).
      await kaguyaApi.reorder(draggedId, { after_id: afterId, before_id: beforeId })
      // 7. Reload silencioso: sincroniza com o estado real (posições normalizadas)
      //    sem piscar o "Carregando…" de tela cheia.
      load(true)
    } catch {
      // 8. Rollback: restaura o estado anterior ao drag caso a API falhe.
      setTasks(snapshot)
      toast('Falha ao reordenar.', 'err')
    }
  }, [tasks, open, done, load, toast])

  return (
    <div className="kg-page" ref={listContainerRef}>
      <h1 className="kg-page-title">{projectName}</h1>
      <div className="kg-page-sub">{open.length} aberta(s)</div>

      <button className="kg-btn kg-btn-primary" style={{ marginBottom: 16 }} onClick={() => onNewTask(projectId)}>
        <Icon name="plus" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Nova tarefa
      </button>

      {loading ? (
        // Spinner de carregamento inicial — nunca aparece após uma reordenação.
        <div className="kg-empty">Carregando…</div>
      ) : open.length === 0 && done.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Lista vazia</div>
          Crie a primeira tarefa para começar.
        </div>
      ) : (
        // DndContext: contexto de DnD para a lista de tarefas abertas.
        //   closestCenter: detecta qual item está mais próximo do centro do cursor.
        //   onDragStart / onDragEnd: handlers acima.
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* SortableContext: lista os ids arrastáveis e define a animação de deslize. */}
          <SortableContext
            items={open.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="kg-list">
              {open.map((t, i) => (
                // SortableTaskRow: wrapper que adiciona drag handle @dnd-kit ao TaskRow.
                // Preserva a classe de foco, o onClick e o TaskRow original.
                <SortableTaskRow
                  key={t.id}
                  task={t}
                  focusIdx={i}
                  isFocused={focusIdx === i}
                  onFocus={setFocusIdx}
                  onToggle={toggle}
                  onOpen={onOpenTask}
                  onRename={rename}
                  isBeingDragged={activeId === t.id}
                />
              ))}
            </div>
          </SortableContext>

          {/* DragOverlay: cópia da linha que segue o cursor durante o drag.
              dropAnimation={null} = sem animação de "retorno" ao soltar. */}
          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <div className="kg-drag-overlay">
                <TaskRow
                  task={activeTask}
                  onToggle={toggle}
                  onOpen={onOpenTask}
                  onRename={rename}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Seção colapsável de concluídas (sem arraste — comportamento atual) */}
      {done.length > 0 && (
        <>
          <button className="kg-section-toggle" onClick={() => setShowCompleted((v) => !v)}>
            <Icon name={showCompleted ? 'chevronDown' : 'chevron'} size={13} />
            Concluídas ({done.length})
          </button>
          {showCompleted && (
            <div className="kg-list">
              {done.map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} onOpen={onOpenTask} onRename={rename} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
