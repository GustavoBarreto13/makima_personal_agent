// ListSection — árvore de tarefas de UMA lista, sem toolbar.
//
// Por-lista: busca dos dados, quick-add, agrupamento, filtros de faceta,
// ordenação (4 modos), seleção múltipla + barra de lote, e o TaskTreeAPI completo
// (rename, complete, move, promote, indent, outdent, addChild, addSibling, remove,
// setAssignees, setField, reschedule, duplicate).
//
// A toolbar (agrupar/ordenar/filtrar) vive no pai (ListScreen/GroupListScreen) e
// chega aqui como `controls` (useListControls) — assim GroupListScreen usa UMA
// toolbar para todas as seções. Fatia 025 / Rodada 2.
//
// Silent-reload: spinner só no mount e troca de lista; bumps de reloadKey são
// silenciosos (padrão obrigatório de pages/CLAUDE.md).

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Project, Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskTree, type TaskTreeAPI, type DropZone } from './TaskTree'
import { QuickAdd } from './QuickAdd'
import { flattenTree, avatarColor } from '../lib/tasktree'
import { diffDays, todayISO } from '../lib/dateUtils'
import { passesFilters, type GroupBy, type UseListControls } from '../lib/listControls'
import { Icon } from '../ui/Icons'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ListSectionProps {
  projectId: number
  projectName: string
  projectColor?: string | null
  reloadKey: number
  controls: UseListControls
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Agrupamento (puro) ───────────────────────────────────────────────────────

interface GroupBucket { key: string; label: string; dot: string; roots: Task[] }

function dueBucketKey(t: Task): string {
  if (!t.due_date) return 'nodate'
  if (t.completed_at) return 'later'
  const n = diffDays(t.due_date)
  if (n < 0) return 'overdue'
  if (n === 0) return 'today'
  if (n <= 7) return 'soon'
  return 'later'
}

function partitionByGroup(roots: Task[], groupBy: GroupBy): GroupBucket[] {
  if (groupBy === 'priority') {
    const order = [
      { key: '3', label: 'Alta', dot: 'var(--p-high)' },
      { key: '2', label: 'Média', dot: 'var(--p-med)' },
      { key: '1', label: 'Baixa', dot: 'var(--p-low)' },
      { key: '0', label: 'Sem prioridade', dot: 'var(--line)' },
    ]
    return order
      .map(o => ({ ...o, roots: roots.filter(t => String(t.priority ?? 0) === o.key) }))
      .filter(b => b.roots.length > 0)
  }
  if (groupBy === 'due') {
    const order = [
      { key: 'overdue', label: 'Vencidas', dot: 'var(--p-high)' },
      { key: 'today', label: 'Hoje', dot: 'var(--kg)' },
      { key: 'soon', label: 'Próximos 7 dias', dot: 'var(--p-med)' },
      { key: 'later', label: 'Depois', dot: 'var(--ink-4)' },
      { key: 'nodate', label: 'Sem data', dot: 'var(--line)' },
    ]
    return order
      .map(o => ({ ...o, roots: roots.filter(t => dueBucketKey(t) === o.key) }))
      .filter(b => b.roots.length > 0)
  }
  if (groupBy === 'gtd') {
    const order = [
      { key: 'next_action', label: 'Próxima ação', dot: 'var(--kg)' },
      { key: 'waiting', label: 'Aguardando', dot: 'var(--p-med)' },
      { key: 'someday', label: 'Algum dia', dot: 'var(--ink-4)' },
      { key: '__none', label: 'Sem contexto GTD', dot: 'var(--line)' },
    ]
    return order
      .map(o => ({ ...o, roots: roots.filter(t => (t.gtd_status ?? '__none') === o.key) }))
      .filter(b => b.roots.length > 0)
  }
  if (groupBy === 'tag') {
    const seen = new Map<string, GroupBucket>()
    for (const t of roots) {
      const name = t.tags?.[0]?.name ?? '__none'
      if (!seen.has(name)) {
        seen.set(name, {
          key: name,
          label: name === '__none' ? 'Sem etiqueta' : `#${name}`,
          dot: name === '__none' ? 'var(--line)' : (t.tags?.[0]?.color ?? 'var(--kg)'),
          roots: [],
        })
      }
      seen.get(name)!.roots.push(t)
    }
    return [...seen.values()]
  }
  if (groupBy === 'assignee') {
    const seen = new Map<string, GroupBucket>()
    for (const t of roots) {
      const a = t.assignees?.[0]
      const key = a?.id ?? '__none'
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: a?.name ?? 'Ninguém',
          dot: a ? avatarColor(a.name) : 'var(--line)',
          roots: [],
        })
      }
      seen.get(key)!.roots.push(t)
    }
    return [...seen.values()]
  }
  return [{ key: 'all', label: '', dot: 'transparent', roots }]
}

// ── Barra de lote (seleção múltipla) ─────────────────────────────────────────

interface BatchBarProps {
  count: number
  running: { done: number; total: number } | null
  onDone: () => void
  onToday: () => void
  onPrio: (p: number) => void
  onDelete: () => void
  onClear: () => void
}
function BatchBar({ count, running, onDone, onToday, onPrio, onDelete, onClear }: BatchBarProps) {
  const [prioOpen, setPrioOpen] = useState(false)
  return (
    <div className="kg-batch">
      <span className="kg-batch-n">{count} selecionada{count !== 1 ? 's' : ''}</span>
      <button type="button" onClick={onDone}><Icon name="check" size={13} />Concluir</button>
      <button type="button" onClick={onToday}><Icon name="calendar" size={13} />Hoje</button>
      <span className="kg-batch-anchor">
        <button type="button" onClick={() => setPrioOpen(o => !o)}><Icon name="flag" size={13} />Prioridade</button>
        {prioOpen && (
          <>
            <span className="tree-pop-scrim" onClick={() => setPrioOpen(false)} />
            <div className="tree-pop" style={{ bottom: 'calc(100% + 6px)', top: 'auto', left: 0 }}>
              {[3, 2, 1, 0].map(p => (
                <div key={p} className="tree-pop-opt" onClick={() => { onPrio(p); setPrioOpen(false) }}>
                  <span className={`tree-pop-swatch${p > 0 ? ` p${p}` : ''}`} />
                  {['Nenhuma', 'Baixa', 'Média', 'Alta'][p]}
                </div>
              ))}
            </div>
          </>
        )}
      </span>
      <button type="button" className="danger" onClick={onDelete}><Icon name="trash" size={13} />Excluir</button>
      <button type="button" className="kg-batch-close" onClick={onClear}><Icon name="x" size={14} /></button>
      {running && (
        <span className="kg-batch-prog">
          <i style={{ width: `${Math.round((running.done / Math.max(1, running.total)) * 100)}%` }} />
        </span>
      )}
    </div>
  )
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ListSection({
  projectId, projectName, projectColor,
  reloadKey, controls,
  onOpenTask, onNewTask, toast,
}: ListSectionProps) {

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const firstLoad = useRef(true)

  const flatTasks = useMemo(() => flattenTree(tasks), [tasks])

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

  useEffect(() => {
    const silent = !firstLoad.current
    firstLoad.current = false
    load(silent)
  }, [load, reloadKey])

  useEffect(() => { firstLoad.current = true }, [projectId])

  // ── Facetas de filtro ──────────────────────────────────────────────────────
  const f = controls.filters
  const allRoots = useMemo(() => tasks.filter(t => t.parent_id === null), [tasks])

  const filteredRoots = useMemo(
    () => allRoots.filter(t => passesFilters(t, f, (t.subtasks?.length ?? 0) > 0)),
    [allRoots, f],
  )

  // Subtarefas concluídas ficam ocultas quando o status é "abertas".
  const hideCompletedSubs = f.status === 'open'

  // ── Ordenação (4 modos) ────────────────────────────────────────────────────
  const sorter = useMemo<((a: Task, b: Task) => number) | undefined>(() => {
    switch (controls.sortBy) {
      case 'due':
        return (a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
        }
      case 'priority':
        return (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
      case 'recent':
        return (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')
      default:
        return undefined // manual — ordem do servidor (position)
    }
  }, [controls.sortBy])

  // ── Agrupamento ────────────────────────────────────────────────────────────
  const groups = useMemo(
    () => (controls.groupBy === 'none' ? null : partitionByGroup(filteredRoots, controls.groupBy)),
    [filteredRoots, controls.groupBy],
  )

  const grpKey = `kg:list:groupcollapse:${projectId}`
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(grpKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })
  useEffect(() => {
    try {
      const raw = localStorage.getItem(grpKey)
      setCollapsedGroups(raw ? new Set(JSON.parse(raw) as string[]) : new Set())
    } catch { setCollapsedGroups(new Set()) }
  }, [grpKey])
  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const ns = new Set(prev)
      if (ns.has(key)) ns.delete(key)
      else ns.add(key)
      try { localStorage.setItem(grpKey, JSON.stringify([...ns])) } catch { /* ignore */ }
      return ns
    })
  }

  // Cria uma tarefa já dentro do grupo (atributo do grupo pré-preenchido).
  const addInGroup = useCallback(async (key: string) => {
    const body: Parameters<typeof kaguyaApi.createTask>[0] = { title: '', project_id: projectId }
    if (controls.groupBy === 'priority') body.priority = Number(key)
    else if (controls.groupBy === 'due') {
      if (key === 'today') body.due_date = todayISO()
      else if (key === 'soon') {
        const d = new Date()
        d.setDate(d.getDate() + 3)
        body.due_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
    } else if (controls.groupBy === 'tag' && key !== '__none') body.tags = [key]
    try {
      await kaguyaApi.createTask(body)
      load(true)
    } catch { toast('Não foi possível criar a tarefa.', 'err') }
  }, [controls.groupBy, projectId, load, toast])

  // ── Seleção múltipla ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastSel, setLastSel] = useState<number | null>(null)
  const [batchRun, setBatchRun] = useState<{ done: number; total: number } | null>(null)

  // Limpa a seleção ao trocar de lista.
  useEffect(() => { setSelected(new Set()); setLastSel(null) }, [projectId])

  // Ordem de renderização das raízes visíveis (para o Shift+clique).
  const orderedRootIds = useMemo(() => {
    const rs = sorter ? [...filteredRoots].sort(sorter) : filteredRoots
    return rs.map(t => t.id)
  }, [filteredRoots, sorter])

  const onSelectToggle = useCallback((id: number, shift: boolean) => {
    setSelected(prev => {
      const ns = new Set(prev)
      if (shift && lastSel != null) {
        const a = orderedRootIds.indexOf(lastSel)
        const b = orderedRootIds.indexOf(id)
        if (a > -1 && b > -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          for (let i = lo; i <= hi; i++) ns.add(orderedRootIds[i])
          return ns
        }
      }
      if (ns.has(id)) ns.delete(id)
      else ns.add(id)
      return ns
    })
    setLastSel(id)
  }, [lastSel, orderedRootIds])

  const runBatch = useCallback(async (fn: (id: number) => Promise<unknown>) => {
    const ids = [...selected]
    if (!ids.length) return
    setBatchRun({ done: 0, total: ids.length })
    let done = 0
    for (const id of ids) {
      try { await fn(id) } catch { /* segue a fila */ }
      done += 1
      setBatchRun({ done, total: ids.length })
    }
    setBatchRun(null)
    setSelected(new Set())
    load(true)
  }, [selected, load])

  // ── Helpers de busca ─────────────────────────────────────────────────────────
  const findTask = useCallback((id: number) => flatTasks.find(t => t.id === id), [flatTasks])
  const findSiblings = useCallback((task: Task): Task[] => {
    if (task.parent_id === null) return allRoots
    const parent = findTask(task.parent_id)
    return parent?.subtasks ?? []
  }, [allRoots, findTask])

  // ── TaskTreeAPI ────────────────────────────────────────────────────────────
  const api = useMemo<TaskTreeAPI>(() => ({

    rename: async (task: Task, title: string) => {
      if (!title.trim()) return
      try { await kaguyaApi.updateTask(task.id, { title }); load(true) }
      catch { toast('Falha ao renomear.', 'err') }
    },

    complete: async (task: Task, done: boolean) => {
      try {
        if (!done) {
          await kaguyaApi.reopen(task.id)
        } else {
          const r = await kaguyaApi.complete(task.id)
          if (r.needs_cascade) {
            const ok = window.confirm(`Esta tarefa tem ${r.open_subtasks} subtarefa(s) aberta(s). Concluir todas?`)
            if (!ok) return
            await kaguyaApi.complete(task.id, true)
          }
        }
        load(true)
      } catch { toast('Não foi possível atualizar a tarefa.', 'err') }
    },

    move: async (dragId: number, targetId: number, zone: DropZone) => {
      const target = findTask(targetId)
      if (!target) return
      let new_parent_id: number | null
      let after_id: number | undefined
      let before_id: number | undefined
      if (zone === 'child') {
        new_parent_id = target.id
        const lastChild = (target.subtasks ?? []).slice(-1)[0]
        after_id = lastChild?.id
      } else {
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
      try { await kaguyaApi.moveTask(dragId, { new_parent_id, after_id, before_id }); load(true) }
      catch { toast('Não foi possível mover a tarefa.', 'err') }
    },

    promote: async (task: Task) => {
      try {
        await kaguyaApi.moveTask(task.id, { new_parent_id: null })
        toast('Agora é uma tarefa independente.', 'ok')
        load(true)
      } catch { toast('Não foi possível promover a tarefa.', 'err') }
    },

    setAssignees: async (task: Task, personIds: string[]) => {
      try { await kaguyaApi.updateTask(task.id, { person_ids: personIds }); load(true) }
      catch { toast('Falha ao atualizar responsáveis.', 'err') }
    },

    setField: async (task: Task, patch) => {
      try { await kaguyaApi.updateTask(task.id, patch); load(true) }
      catch { toast('Não foi possível salvar a alteração.', 'err') }
    },

    reschedule: async (task: Task, when: 'today' | 'tomorrow' | 'later') => {
      try { await kaguyaApi.reschedule(task.id, when); load(true) }
      catch { toast('Não foi possível reagendar.', 'err') }
    },

    duplicate: async (task: Task) => {
      try {
        const r = await kaguyaApi.createTask({
          title: `${task.title} (cópia)`,
          project_id: task.project_id,
          parent_id: task.parent_id ?? undefined,
          priority: task.priority,
          type: task.type,
          due_date: task.due_date,
          due_time: task.due_time,
          description: task.description,
          tags: (task.tags ?? []).map(t => t.name),
        })
        if (r.id) {
          await kaguyaApi.reorder(r.id, { after_id: task.id })
          if (task.duration_min) await kaguyaApi.updateTask(r.id, { duration_min: task.duration_min })
        }
        load(true)
      } catch { toast('Não foi possível duplicar a tarefa.', 'err') }
    },

    addSibling: async (task: Task, onCreated: (id: number) => void) => {
      try {
        const siblings = findSiblings(task)
        const idx = siblings.findIndex(t => t.id === task.id)
        const nextSibling = siblings[idx + 1] ?? null
        const result = await kaguyaApi.createTask({
          title: '', project_id: task.project_id, parent_id: task.parent_id ?? undefined,
        })
        if (result.id) {
          await kaguyaApi.reorder(result.id, {
            after_id: task.id,
            ...(nextSibling ? { before_id: nextSibling.id } : {}),
          })
          await load(true)
          onCreated(result.id)
        }
      } catch { toast('Não foi possível criar tarefa.', 'err') }
    },

    remove: async (task: Task) => {
      try { await kaguyaApi.remove(task.id); load(true) }
      catch { toast('Não foi possível remover a tarefa.', 'err') }
    },

    addChild: async (task: Task, onCreated: (id: number) => void, expandParent: () => void) => {
      try {
        const result = await kaguyaApi.createTask({ title: '', project_id: task.project_id, parent_id: task.id })
        if (result.id) {
          expandParent()
          await load(true)
          onCreated(result.id)
        }
      } catch { toast('Não foi possível criar subtarefa.', 'err') }
    },

    indent: async (task: Task) => {
      const siblings = findSiblings(task)
      const idx = siblings.findIndex(t => t.id === task.id)
      const prevSibling = idx > 0 ? siblings[idx - 1] : null
      if (!prevSibling) return
      try { await kaguyaApi.moveTask(task.id, { new_parent_id: prevSibling.id }); load(true) }
      catch { toast('Não foi possível indentar.', 'err') }
    },

    outdent: async (task: Task) => {
      if (task.parent_id === null) return
      const parent = findTask(task.parent_id)
      if (!parent) return
      try {
        await kaguyaApi.moveTask(task.id, { new_parent_id: parent.parent_id, after_id: parent.id })
        load(true)
      } catch { toast('Não foi possível desindentar.', 'err') }
    },

    openTask: (task: Task) => onOpenTask(task),

  }), [findTask, findSiblings, load, onOpenTask, toast])

  // ── Estilo do chip do projeto ─────────────────────────────────────────────────
  const chipBg = projectColor
    ? `${projectColor}29`
    : 'color-mix(in oklch, var(--kg) 16%, transparent)'
  const scopeKey = `list-${projectId}`

  const treeCommon = {
    api,
    sorter,
    hideCompleted: hideCompletedSubs,
    selected,
    onSelectToggle,
  }

  const totalOpen = allRoots.filter(t => !t.completed_at).length

  // ── Renderização ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Quick-add — captura rápida com parser pt-BR, destino = esta lista */}
      <QuickAdd
        projects={[{ id: projectId, name: projectName }] as Project[]}
        defaultProjectId={projectId}
        onCreated={() => load(true)}
        toast={toast}
        placeholder="Captura rápida — ex.: ligar pro banco !alta amanhã 15h"
      />

      {/* Cabeçalho: chip da lista + contagem + botão "Nova tarefa" */}
      <div className="kg-list-header">
        <span className="kg-proj-chip" style={{ background: chipBg }}>
          <span className="kg-proj-dot" style={{ background: projectColor ?? 'var(--kg)' }} />
          {projectName}
        </span>
        <span className="kg-list-subtitle">
          {filteredRoots.length} de {totalOpen} · arraste para aninhar ou reordenar
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

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : allRoots.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Lista vazia</div>
          Crie a primeira tarefa para começar.
        </div>
      ) : filteredRoots.length === 0 ? (
        <div className="kg-empty">Nada por aqui com os filtros atuais.</div>
      ) : groups ? (
        // ── Agrupado ──
        groups.map(g => {
          const isCollapsed = collapsedGroups.has(g.key)
          return (
            <div className="task-group" key={g.key}>
              <div className={`kg-grp${isCollapsed ? ' collapsed' : ''}`} onClick={() => toggleGroup(g.key)}>
                <svg className="kg-grp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
                <span className="kg-grp-dot" style={{ background: g.dot }} />
                <span className="kg-grp-label">{g.label}</span>
                <span className="kg-grp-count">{g.roots.length}</span>
                <span
                  className="kg-grp-add"
                  onClick={e => { e.stopPropagation(); addInGroup(g.key) }}
                >
                  + adicionar aqui
                </span>
              </div>
              {!isCollapsed && (
                <TaskTree
                  {...treeCommon}
                  roots={g.roots}
                  scopeKey={`${scopeKey}-g-${g.key}`}
                />
              )}
            </div>
          )
        })
      ) : (
        // ── Sem grupo ──
        <div className="task-group">
          <TaskTree
            {...treeCommon}
            roots={filteredRoots}
            scopeKey={scopeKey}
            showAddRoot
            onAddRoot={() => onNewTask(projectId)}
          />
        </div>
      )}

      {selected.size > 0 && (
        <BatchBar
          count={selected.size}
          running={batchRun}
          onDone={() => runBatch(id => kaguyaApi.complete(id))}
          onToday={() => runBatch(id => kaguyaApi.reschedule(id, 'today'))}
          onPrio={p => runBatch(id => kaguyaApi.updateTask(id, { priority: p }))}
          onDelete={() => {
            if (window.confirm(`Excluir ${selected.size} tarefa(s)?`)) runBatch(id => kaguyaApi.remove(id))
          }}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}
