// ListScreen — a view lista de uma "Lista" (guia §4.1). Tarefas por posição,
// subtarefas aninhadas, conclusão (com confirmação de cascata), edição inline,
// drag-and-drop para reordenar e seção colapsável de concluídas.
// Fatia 018: atalhos de teclado (Space/X = completa, Enter = edita inline) com
// focusIdx local (sem estado global — regra de pages/CLAUDE.md).

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskRow } from '../components/TaskRow'
import { Icon } from '../ui/Icons'

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
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  // focusIdx: índice da tarefa aberta em foco (navegável por ↑↓, atalhos Space/X/Enter).
  // Estado LOCAL — sem estado global (regra de pages/CLAUDE.md — fatia 018).
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  // Ref para o container da lista (para não propagar atalhos além desta tela).
  const listContainerRef = useRef<HTMLDivElement>(null)

  // Busca as tarefas da lista (inclui concluídas para a seção colapsável).
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTasks(await kaguyaApi.listTasks(projectId, true))
    } catch {
      toast('Falha ao carregar as tarefas.', 'err')
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  // Re-busca quando a lista muda ou quando o shell sinaliza (reloadKey).
  useEffect(() => { load() }, [load, reloadKey])

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

  // Drag-and-drop: solta a tarefa arrastada ANTES da tarefa-alvo (posição esparsa).
  const onDrop = async (targetId: number) => {
    if (dragId == null || dragId === targetId) { setDragId(null); return }
    try { await kaguyaApi.reorder(dragId, { before_id: targetId }); await load() }
    catch { toast('Falha ao reordenar.', 'err') }
    finally { setDragId(null) }
  }

  const open = tasks.filter((t) => !t.completed_at)
  const done = tasks.filter((t) => t.completed_at)

  return (
    <div className="kg-page" ref={listContainerRef}>
      <h1 className="kg-page-title">{projectName}</h1>
      <div className="kg-page-sub">{open.length} aberta(s)</div>

      <button className="kg-btn kg-btn-primary" style={{ marginBottom: 16 }} onClick={() => onNewTask(projectId)}>
        <Icon name="plus" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Nova tarefa
      </button>

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : open.length === 0 && done.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Lista vazia</div>
          Crie a primeira tarefa para começar.
        </div>
      ) : (
        <div className="kg-list">
          {open.map((t, i) => (
            // wrapper arrastável: define a tarefa em movimento, trata o drop e exibe foco
            <div
              key={t.id}
              className={focusIdx === i ? 'kg-list-row--focused' : undefined}
              draggable
              onDragStart={() => setDragId(t.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(t.id)}
              onClick={() => setFocusIdx(i)}   // clique também define o foco
            >
              <TaskRow task={t} onToggle={toggle} onOpen={onOpenTask} onRename={rename} />
            </div>
          ))}
        </div>
      )}

      {/* seção colapsável de concluídas */}
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
