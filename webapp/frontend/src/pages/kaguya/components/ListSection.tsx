// ListSection — árvore de tarefas de UMA lista, sem toolbar.
//
// Extrai de ListScreen tudo que é por-lista: busca dos dados, TaskTreeAPI completo
// (rename, complete, move, promote, indent, outdent, addChild, addSibling, remove,
// setAssignees), cabeçalho-chip com nome da lista + botão "Nova tarefa", árvore
// de abertas e seção colapsável de concluídas.
//
// Os filtros (prioFilter, sortMode, showCompleted) chegam como props — quem controla
// o estado é o pai (ListScreen ou GroupListScreen). Assim a GroupListScreen pode usar
// uma única toolbar para todas as seções simultaneamente.
//
// Silent-reload: spinner só no mount e troca de lista; bumps de reloadKey são
// silenciosos (padrão obrigatório de pages/CLAUDE.md).

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskTree, type TaskTreeAPI, type DropZone } from './TaskTree'
import { flattenTree } from '../lib/tasktree'
import { Icon } from '../ui/Icons'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ListSectionProps {
  // Identificação da lista que esta seção representa.
  projectId: number
  projectName: string
  projectColor?: string | null

  // Bump vindo do shell → reload silencioso (sem spinner).
  reloadKey: number

  // Filtros gerenciados pelo pai (ListScreen ou GroupListScreen).
  prioFilter: number                              // 0=tudo, 1=Baixa+, 2=Média+, 3=Alta
  sortMode: 'manual' | 'due' | 'prio'            // ordenação das tarefas na árvore
  showCompleted: boolean                          // mostra/esconde seção de concluídas

  // Callbacks
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ListSection({
  projectId, projectName, projectColor,
  reloadKey,
  prioFilter, sortMode, showCompleted,
  onOpenTask, onNewTask, toast,
}: ListSectionProps) {

  // `tasks` guarda as raízes (parent_id = null) com subtasks aninhadas.
  // O backend retorna a árvore recursiva via WITH RECURSIVE.
  const [tasks, setTasks] = useState<Task[]>([])

  // loading: true apenas no 1º carregamento ou troca de lista.
  const [loading, setLoading] = useState(true)

  // firstLoad ref: garante spinner só no mount; bumps de reloadKey são silenciosos.
  const firstLoad = useRef(true)

  // flatTasks: todos os nós da árvore (raízes + subs em qualquer profundidade).
  // Necessário para lookups por id nos callbacks da TaskTreeAPI.
  const flatTasks = useMemo(() => flattenTree(tasks), [tasks])

  // ── Carregamento ─────────────────────────────────────────────────────────────

  // Busca a árvore completa da lista (include_completed=true para ter a seção
  // de concluídas sem precisar de um segundo fetch).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const roots = await kaguyaApi.listTasks(projectId, true)
      setTasks(roots)
    } catch {
      toast('Falha ao carregar as tarefas.', 'err')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId, toast])

  // Mount: mostra spinner. Bumps de reloadKey: silencioso.
  useEffect(() => {
    const silent = !firstLoad.current
    firstLoad.current = false
    load(silent)
  }, [load, reloadKey])

  // Ao trocar de lista, o próximo mount será um "primeiro carregamento" (com spinner).
  useEffect(() => {
    firstLoad.current = true
  }, [projectId])

  // ── Raízes abertas e concluídas ──────────────────────────────────────────────

  // Raízes abertas: sem completed_at, com prioridade >= prioFilter.
  const openRoots = tasks.filter(t => !t.completed_at && (t.priority ?? 0) >= prioFilter)

  // Raízes concluídas: exibidas apenas quando showCompleted está ligado.
  const doneRoots = tasks.filter(t => !!t.completed_at)

  // ── Sorter para a árvore ──────────────────────────────────────────────────────

  const sorter = useMemo<((a: Task, b: Task) => number) | undefined>(() => {
    if (sortMode === 'due') {
      // Vencimento crescente; tarefas sem data vão para o final.
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
    // 'manual': sem sorter — a árvore preserva a order do servidor (position).
    return undefined
  }, [sortMode])

  // ── Helpers de busca ─────────────────────────────────────────────────────────

  // Encontra uma tarefa pelo id no array flat (raízes + subs em todos os níveis).
  const findTask = useCallback(
    (id: number) => flatTasks.find(t => t.id === id),
    [flatTasks]
  )

  // Retorna os irmãos de uma tarefa (mesmo parent_id).
  const findSiblings = useCallback((task: Task): Task[] => {
    if (task.parent_id === null) return openRoots
    const parent = findTask(task.parent_id)
    return parent?.subtasks ?? []
  }, [openRoots, findTask])

  // ── TaskTreeAPI ────────────────────────────────────────────────────────────

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

    // Drag-and-drop: move para nova posição (3 zonas: before/after/child).
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
        const siblings = findSiblings(task)
        const idx = siblings.findIndex(t => t.id === task.id)
        const nextSibling = siblings[idx + 1] ?? null

        const result = await kaguyaApi.createTask({
          title: '',
          project_id: task.project_id,
          parent_id: task.parent_id ?? undefined,
        })
        // Posiciona logo após a atual (antes da próxima irmã).
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

    // Remove (soft-delete) uma tarefa — apaga linha-placeholder vazia abandonada.
    remove: async (task: Task) => {
      try {
        await kaguyaApi.remove(task.id)
        load(true)
      } catch { toast('Não foi possível remover a tarefa.', 'err') }
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
      if (!prevSibling) return  // sem irmão acima — não pode indentar
      try {
        await kaguyaApi.moveTask(task.id, { new_parent_id: prevSibling.id })
        load(true)
      } catch { toast('Não foi possível indentar.', 'err') }
    },

    // Desindenta: sobe a tarefa um nível, ficando irmã do seu pai.
    outdent: async (task: Task) => {
      if (task.parent_id === null) return  // já é raiz — sem nível acima
      const parent = findTask(task.parent_id)
      if (!parent) return
      try {
        // Posiciona após o pai na lista do avô.
        await kaguyaApi.moveTask(task.id, {
          new_parent_id: parent.parent_id,
          after_id: parent.id,
        })
        load(true)
      } catch { toast('Não foi possível desindentar.', 'err') }
    },

    // Abre o modal de detalhes da tarefa.
    openTask: (task: Task) => onOpenTask(task),

  }), [findTask, findSiblings, load, onOpenTask, toast])

  // ── Estilo do chip do projeto ─────────────────────────────────────────────────

  // Fundo do chip: cor da lista com 16% de opacidade (hex 29 ≈ 16%), ou tint do accent.
  const chipBg = projectColor
    ? `${projectColor}29`
    : 'color-mix(in oklch, var(--kg) 16%, transparent)'

  // Chave de escopo para o `useCollapsedState` interno do TaskTree.
  // Garantia de que o estado de expansão não vaza entre listas diferentes.
  const scopeKey = `list-${projectId}`

  // ── Renderização ─────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Cabeçalho: chip da lista + contagem de abertas + botão "Nova tarefa" */}
      <div className="kg-list-header">
        <span className="kg-proj-chip" style={{ background: chipBg }}>
          <span className="kg-proj-dot" style={{ background: projectColor ?? 'var(--kg)' }} />
          {projectName}
        </span>
        <span className="kg-list-subtitle">
          {openRoots.length} aberta{openRoots.length !== 1 ? 's' : ''}
          {' · '}arraste para aninhar ou reordenar
        </span>
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

      {/* Corpo: spinner, vazio ou árvore de tarefas */}
      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : openRoots.length === 0 && doneRoots.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Lista vazia</div>
          Crie a primeira tarefa para começar.
        </div>
      ) : (
        <>
          {/* Árvore de tarefas abertas com DnD (3 zonas: before/after/child).
              hideCompleted=!showCompleted: subtarefas concluídas ficam ocultas quando o
              toggle "mostrar concluídas" está desligado (antes elas sempre apareciam). */}
          <div className="task-group">
            <TaskTree
              roots={openRoots}
              api={api}
              scopeKey={scopeKey}
              sorter={sorter}
              hideCompleted={!showCompleted}
              showAddRoot
              onAddRoot={() => onNewTask(projectId)}
            />
          </div>

          {/* Seção de concluídas — colapsável; visibilidade controlada pelo pai */}
          {doneRoots.length > 0 && (
            <>
              {/* O toggle de mostrar/ocultar concluídas fica na toolbar do pai;
                  aqui apenas obedecemos o prop `showCompleted`. */}
              <div
                className="kg-section-toggle"
                style={{ cursor: 'default', pointerEvents: 'none', opacity: 0.7 }}
              >
                <Icon name={showCompleted ? 'chevDown' : 'chevron'} size={13} />
                Concluídas ({doneRoots.length})
              </div>
              {showCompleted && (
                <div className="task-group done-group">
                  {/* sorter: seção de concluídas agora também obedece o critério de ordenação. */}
                  <TaskTree
                    roots={doneRoots}
                    api={api}
                    scopeKey={`${scopeKey}-done`}
                    sorter={sorter}
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
