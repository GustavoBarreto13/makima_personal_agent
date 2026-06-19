// ListScreen — visão de lista como árvore hierárquica (fatia 025).
// Substitui o flat-list + @dnd-kit sortable pelo TaskTree com DnD 3 zonas.
// Silent-reload: spinner só no mount/troca de lista; re-fetch após mutações é silencioso.
// Subtarefas podem ter N níveis de profundidade via parent_id recursivo (cap 12).

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskTree, type TaskTreeAPI, type DropZone } from '../components/TaskTree'
import { flattenTree } from '../lib/tasktree'
import { Icon } from '../ui/Icons'

interface ListScreenProps {
  projectId: number
  projectName: string
  projectColor?: string | null
  reloadKey: number              // incrementa no shell após salvar modal → re-fetch silencioso
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ListScreen({
  projectId, projectName, projectColor, reloadKey,
  onOpenTask, onNewTask, toast,
}: ListScreenProps) {
  // `tasks` guarda as raízes (parent_id = null) com subtasks já aninhadas.
  // O backend retorna a árvore via WITH RECURSIVE em list_tasks.
  const [tasks, setTasks] = useState<Task[]>([])
  // loading: true apenas no 1º carregamento ou troca de lista.
  const [loading, setLoading] = useState(true)
  // showCompleted: mostra/esconde a seção de tarefas concluídas.
  const [showCompleted, setShowCompleted] = useState(false)
  // firstLoad ref: garante spinner só no mount; bumps de reloadKey são silenciosos.
  const firstLoad = useRef(true)

  // ── Toolbar (US7) ──────────────────────────────────────────────────────────
  // prioFilter: nível mínimo de prioridade exibido (0 = todos, 1 = Baixa+, 2 = Média+, 3 = Alta).
  const [prioFilter, setPrioFilter] = useState(0)
  // sortMode: ordenação aplicada em cada nível da árvore.
  type SortMode = 'manual' | 'due' | 'prio'
  const SORT_LABELS: Record<SortMode, string> = { manual: 'Manual', due: 'Vencimento', prio: 'Prioridade' }
  const SORT_CYCLE: SortMode[] = ['manual', 'due', 'prio']
  const [sortMode, setSortMode] = useState<SortMode>('manual')

  // flatTasks: array de TODOS os nós (raízes + subs em qualquer profundidade).
  // Usado para lookup por id (indent/outdent/buildBreadcrumb).
  const flatTasks = useMemo(() => flattenTree(tasks), [tasks])

  // Busca a árvore completa de tarefas da lista.
  // `silent = true` → não pisca spinner (usado após mutações).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // include_completed=true para poder exibir a seção de concluídas sem re-fetch.
      const roots = await kaguyaApi.listTasks(projectId, true)
      setTasks(roots)
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

  // Reseta o firstLoad ao trocar de lista (próximo mount será "primeiro carregamento").
  useEffect(() => {
    firstLoad.current = true
  }, [projectId])

  // ── Raízes abertas e concluídas ──────────────────────────────────────────────
  // Filtro de prioridade: só mostra tarefas com prioridade >= prioFilter.
  const openRoots = tasks.filter(t => !t.completed_at && (t.priority ?? 0) >= prioFilter)
  const doneRoots = tasks.filter(t => !!t.completed_at)

  // ── Sorter para a árvore (Manual = undefined = ordem do servidor) ──────────
  const sorter = useMemo<((a: Task, b: Task) => number) | undefined>(() => {
    if (sortMode === 'due') {
      // Tarefas sem data vão para o final.
      return (a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
      }
    }
    if (sortMode === 'prio') {
      // Maior prioridade primeiro (3→2→1→0).
      return (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    }
    // 'manual': preserva a ordem do servidor (position).
    return undefined
  }, [sortMode])

  // ── Encontra uma tarefa pelo id no flat array ─────────────────────────────────
  const findTask = useCallback((id: number) => flatTasks.find(t => t.id === id), [flatTasks])

  // ── Encontra os irmãos de uma tarefa (mesmo parent_id no mesmo nível) ──────────
  const findSiblings = useCallback((task: Task): Task[] => {
    if (task.parent_id === null) return openRoots
    const parent = findTask(task.parent_id)
    return parent?.subtasks ?? []
  }, [openRoots, findTask])

  // ── TaskTreeAPI — callbacks passados para o TaskTree ────────────────────────

  const api = useMemo<TaskTreeAPI>(() => ({

    // Salva o novo título de uma tarefa.
    rename: async (task: Task, title: string) => {
      if (!title.trim()) return
      try {
        await kaguyaApi.updateTask(task.id, { title })
        load(true)
      } catch { toast('Falha ao renomear.', 'err') }
    },

    // Marca como concluída ou reabre; lida com o pedido de cascata para subtarefas.
    complete: async (task: Task, done: boolean) => {
      try {
        if (!done) {
          await kaguyaApi.reopen(task.id)
        } else {
          const r = await kaguyaApi.complete(task.id)
          if (r.needs_cascade) {
            const ok = window.confirm(
              `Esta tarefa tem ${r.open_subtasks} subtarefa(s) aberta(s). Concluir todas?`
            )
            if (!ok) return
            await kaguyaApi.complete(task.id, true)
          }
        }
        load(true)
      } catch { toast('Não foi possível atualizar a tarefa.', 'err') }
    },

    // Drag-and-drop: move a tarefa para nova posição (3 zonas).
    move: async (dragId: number, targetId: number, zone: DropZone) => {
      const target = findTask(targetId)
      if (!target) return

      // Calcula new_parent_id, after_id e before_id conforme a zona.
      let new_parent_id: number | null
      let after_id: number | undefined
      let before_id: number | undefined

      if (zone === 'child') {
        // Zona "child": torna-se último filho do alvo.
        new_parent_id = target.id
        const lastChild = (target.subtasks ?? []).slice(-1)[0]
        after_id = lastChild?.id
      } else {
        // Zonas "before" / "after": mesmo nível do alvo.
        new_parent_id = target.parent_id
        const siblings = findSiblings(target)
        const idx = siblings.findIndex(t => t.id === target.id)
        if (zone === 'before') {
          before_id = target.id
          after_id = siblings[idx - 1]?.id
        } else {
          after_id = target.id
          before_id = siblings[idx + 1]?.id
        }
      }

      try {
        await kaguyaApi.moveTask(dragId, { new_parent_id, after_id, before_id })
        load(true)
      } catch { toast('Não foi possível mover a tarefa.', 'err') }
    },

    // Promove uma subtarefa para tarefa-raiz independente.
    promote: async (task: Task) => {
      try {
        await kaguyaApi.moveTask(task.id, { new_parent_id: null })
        toast('Agora é uma tarefa independente.', 'ok')
        load(true)
      } catch { toast('Não foi possível promover a tarefa.', 'err') }
    },

    // Atualiza o conjunto de responsáveis (substitui — não adiciona).
    setAssignees: async (task: Task, personIds: string[]) => {
      try {
        await kaguyaApi.updateTask(task.id, { person_ids: personIds })
        load(true)
      } catch { toast('Falha ao atualizar responsáveis.', 'err') }
    },

    // Cria uma irmã imediatamente abaixo da tarefa e começa a editar.
    addSibling: async (task: Task, onCreated: (id: number) => void) => {
      try {
        // Descobre a próxima irmã para posicionar a nova tarefa entre elas via reorder.
        const siblings = findSiblings(task)
        const idx = siblings.findIndex(t => t.id === task.id)
        const nextSibling = siblings[idx + 1] ?? null

        const result = await kaguyaApi.createTask({
          title: '',
          project_id: task.project_id,
          parent_id: task.parent_id ?? undefined,
        })
        // Posiciona a nova tarefa logo após a atual (antes da próxima irmã).
        if (result.id) {
          await kaguyaApi.reorder(result.id, {
            after_id: task.id,
            ...(nextSibling ? { before_id: nextSibling.id } : {}),
          })
        }
        if (result.id) {
          await load(true)
          onCreated(result.id)
        }
      } catch { toast('Não foi possível criar tarefa.', 'err') }
    },

    // Cria um filho da tarefa, expande a mãe e começa a editar o filho.
    addChild: async (task: Task, onCreated: (id: number) => void, expandParent: () => void) => {
      try {
        const result = await kaguyaApi.createTask({
          title: '',
          project_id: task.project_id,
          parent_id: task.id,
        })
        if (result.id) {
          expandParent()
          await load(true)
          onCreated(result.id)
        }
      } catch { toast('Não foi possível criar subtarefa.', 'err') }
    },

    // Indenta: torna a tarefa filha do irmão imediatamente acima.
    indent: async (task: Task) => {
      const siblings = findSiblings(task)
      const idx = siblings.findIndex(t => t.id === task.id)
      const prevSibling = idx > 0 ? siblings[idx - 1] : null
      if (!prevSibling) return  // não há irmão acima — não pode indentar
      try {
        await kaguyaApi.moveTask(task.id, { new_parent_id: prevSibling.id })
        load(true)
      } catch { toast('Não foi possível indentar.', 'err') }
    },

    // Desindenta: sobe a tarefa um nível, ficando irmã do seu pai.
    outdent: async (task: Task) => {
      if (task.parent_id === null) return  // já é raiz — não há nível acima
      const parent = findTask(task.parent_id)
      if (!parent) return
      try {
        // Posiciona após o pai na lista do avô
        await kaguyaApi.moveTask(task.id, {
          new_parent_id: parent.parent_id,
          after_id: parent.id,
        })
        load(true)
      } catch { toast('Não foi possível desindentar.', 'err') }
    },

    // Abre o modal de detalhes.
    openTask: (task: Task) => onOpenTask(task),

  }), [findTask, findSiblings, load, onOpenTask, toast])

  // ── Cor do chip do projeto ──────────────────────────────────────────────────
  const chipBg = projectColor
    ? `${projectColor}29`  // cor com 16% de opacidade (hex 29 ≈ 16%)
    : 'color-mix(in oklch, var(--kg) 16%, transparent)'

  // ── Chave de escopo para useCollapsedState dentro de TaskTree ──────────────
  const scopeKey = `list-${projectId}`

  return (
    <div className="kg-page">
      {/* Cabeçalho: chip do projeto + contagem de abertas */}
      <div className="kg-list-header">
        <span className="kg-proj-chip" style={{ background: chipBg }}>
          <span className="kg-proj-dot" style={{ background: projectColor ?? 'var(--kg)' }} />
          {projectName}
        </span>
        <span className="kg-list-subtitle">
          {openRoots.length} aberta{openRoots.length !== 1 ? 's' : ''} · arraste para aninhar ou reordenar
        </span>

        {/* Botão Nova Tarefa */}
        <button
          type="button"
          className="kg-btn kg-btn-ghost"
          style={{ marginLeft: 'auto' }}
          onClick={() => onNewTask(projectId)}
          title="Nova tarefa (C)"
        >
          <Icon name="plus" size={14} />
          Nova tarefa
        </button>
      </div>

      {/* Toolbar — filtros de prioridade, toggle Concluídas, ordenação */}
      <div className="kg-toolbar">
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
              className={`kg-toolbar-chip${prioFilter === v ? ' active' : ''}`}
              onClick={() => setPrioFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Separador */}
        <div className="kg-toolbar-sep" />

        {/* Toggle: mostrar/ocultar concluídas */}
        <button
          type="button"
          className={`kg-toolbar-chip${showCompleted ? ' active' : ''}`}
          onClick={() => setShowCompleted(v => !v)}
        >
          {showCompleted ? 'Ocultar concluídas' : 'Mostrar concluídas'}
        </button>

        {/* Botão de ordenação: cicla entre Manual / Vencimento / Prioridade */}
        <button
          type="button"
          className="kg-toolbar-chip kg-toolbar-sort"
          title={`Ordenação: ${SORT_LABELS[sortMode]}`}
          onClick={() => {
            const idx = SORT_CYCLE.indexOf(sortMode)
            setSortMode(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length])
          }}
        >
          <Icon name="sort" size={13} />
          {SORT_LABELS[sortMode]}
        </button>
      </div>

      {loading ? (
        // Spinner: só no 1º carregamento ou troca de lista
        <div className="kg-empty">Carregando…</div>
      ) : openRoots.length === 0 && doneRoots.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Lista vazia</div>
          Crie a primeira tarefa para começar.
        </div>
      ) : (
        <>
          {/* Grupo principal — árvore de tarefas abertas */}
          <div className="task-group">
            <TaskTree
              roots={openRoots}
              api={api}
              scopeKey={scopeKey}
              sorter={sorter}
              showAddRoot
              onAddRoot={() => onNewTask(projectId)}
            />
          </div>

          {/* Seção de concluídas — colapsável, sem drag */}
          {doneRoots.length > 0 && (
            <>
              <button
                type="button"
                className="kg-section-toggle"
                onClick={() => setShowCompleted(v => !v)}
              >
                <Icon name={showCompleted ? 'chevDown' : 'chevron'} size={13} />
                Concluídas ({doneRoots.length})
              </button>
              {showCompleted && (
                <div className="task-group done-group">
                  <TaskTree
                    roots={doneRoots}
                    api={api}
                    scopeKey={`${scopeKey}-done`}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
