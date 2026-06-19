// TaskTree — árvore de tarefas com N níveis de profundidade.
// Usa HTML5 nativo drag-and-drop com 3 zonas: before (y<28%), child (meio), after (y>72%).
// Indentação de 22px por nível, guias verticais 1px, colapso persistido em localStorage.
// Design idêntico ao protótipo em design_handoff_kaguya_lista_arvore/kaguya/tasktree.jsx.

import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react'
import type { Task } from '../types'
import { Icon } from '../ui/Icons'
import { subProgress, buildBreadcrumb, flattenTree } from '../lib/tasktree'
import { AvatarStack, AssigneePicker } from './People'

// Zona de drop dentro de uma linha da árvore (determinada pela posição Y do mouse)
export type DropZone = 'before' | 'child' | 'after'

// Estado do drop ativo (qual linha + qual zona)
interface DropState {
  id: number      // id da tarefa-alvo
  zone: DropZone  // qual zona dentro dessa linha
}

// ─── Interface de callbacks (API da árvore) ────────────────────────────────────
// O ListScreen define estas funções e passa para o TaskTree.
// Manter callbacks simples permite reuso do componente em TodayScreen/FilterScreen.

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
  // Cria um irmão abaixo de `task` e chama `onCreated(newId)` com o id criado.
  addSibling(task: Task, onCreated: (id: number) => void): void
  // Cria um filho de `task`, chama `onCreated(newId)` e `expandParent()` para garantir visibilidade.
  addChild(task: Task, onCreated: (id: number) => void, expandParent: () => void): void
  // Indenta (faz filha do irmão anterior — se existir).
  indent(task: Task): void
  // Desindenta (sobe um nível — se tiver pai).
  outdent(task: Task): void
  // Abre o modal de detalhes da tarefa.
  openTask(task: Task): void
}

// ─── Prioridade ────────────────────────────────────────────────────────────────
// Cores OKLCH para a barra de prioridade (::before da .tree-row e prio-dot).
const PRIO_COLORS: Record<number, { bar: string; tint: string }> = {
  0: { bar: 'transparent', tint: 'transparent' },
  1: { bar: 'oklch(0.65 0.17 240)', tint: 'oklch(0.65 0.17 240 / 0.06)' },  // baixa — azul
  2: { bar: 'oklch(0.70 0.18 85)',  tint: 'oklch(0.70 0.18 85 / 0.06)' },   // média — âmbar
  3: { bar: 'oklch(0.58 0.22 22)',  tint: 'oklch(0.58 0.22 22 / 0.08)' },   // alta — vermelho
}

// ─── TreeRow — uma linha da árvore (recursiva, mas renderizada pelo pai) ─────

interface TreeRowProps {
  task: Task
  depth: number          // profundidade: 0 = raiz, 1 = filho, etc.
  hasKids: boolean       // tem filhos visíveis?
  collapsed: boolean     // está colapsado?
  onToggleCollapse: (id: number, next?: boolean) => void
  api: TaskTreeAPI
  // Array flat de todos os nós (para buildBreadcrumb no tooltip — T045)
  allTasks: Task[]
  // Estado global de DnD e edição (compartilhado pela TaskTree inteira)
  editingId: number | null
  setEditingId: (id: number | null) => void
  dragId: number | null
  setDragId: (id: number | null) => void
  drop: DropState | null
  setDrop: (d: DropState | null) => void
}

function TreeRow({
  task, depth, hasKids, collapsed,
  onToggleCollapse, api, allTasks,
  editingId, setEditingId,
  dragId, setDragId, drop, setDrop,
}: TreeRowProps) {
  // Texto do campo de edição (espelha task.title enquanto não está editando)
  const [val, setVal] = useState(task.title)
  // Animação do checkbox: "pop" ao completar
  const [popping, setPopping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = editingId === task.id
  const done = task.completed_at !== null
  const pr = PRIO_COLORS[task.priority] ?? PRIO_COLORS[0]
  const prog = subProgress(task)

  // Foca o input ao entrar em modo de edição
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // Sincroniza o valor local quando o título da tarefa muda (ex: reload silencioso)
  useEffect(() => { setVal(task.title) }, [task.title])

  // Salva o título e sai do modo de edição
  const commit = useCallback(() => {
    const v = val.trim()
    // Linha nova vazia → cancela e remove se não havia título original
    if (!v) {
      if (!task.title) api.rename(task, '')  // backend vai ignorar ou apagar
      setEditingId(null)
      return
    }
    if (v !== task.title) api.rename(task, v)
    setEditingId(null)
  }, [val, task, api, setEditingId])

  // Teclado dentro do input de edição
  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      // Cria irmão abaixo e começa a editar
      api.addSibling(task, id => setEditingId(id))
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

  // Checkbox: pequena animação "pop" antes de completar
  const toggle = useCallback(() => {
    if (done) {
      api.complete(task, false)
      return
    }
    setPopping(true)
    // Dispara a animação (160ms) antes de chamar a API
    setTimeout(() => {
      setPopping(false)
      api.complete(task, true)
    }, 160)
  }, [done, task, api])

  // ── Drag & Drop (HTML5 nativo — zona pela posição Y do mouse) ──────────────

  // Calcula qual zona o mouse está dentro da linha atual
  const computeZone = (e: React.DragEvent): DropZone => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (y < 0.28) return 'before'
    if (y > 0.72) return 'after'
    return 'child'
  }

  const onDragOver = (e: React.DragEvent) => {
    // Não reagir ao arraste do próprio elemento
    if (!dragId || dragId === task.id) return
    e.preventDefault()
    const zone = computeZone(e)
    // Evita re-render se a zona não mudou
    if (!drop || drop.id !== task.id || drop.zone !== zone) {
      setDrop({ id: task.id, zone })
    }
  }

  const onDrop = (e: React.DragEvent) => {
    if (!dragId) return
    e.preventDefault()
    e.stopPropagation()
    const zone = computeZone(e)
    api.move(dragId, task.id, zone)
    setDrop(null)
    setDragId(null)
  }

  const isDrop = drop?.id === task.id
  const dropClass = isDrop ? ` drop-${drop!.zone}` : ''

  return (
    <div
      className={`tree-row${done ? ' done' : ''}${dragId === task.id ? ' dragging' : ''}${dropClass}`}
      data-prio={task.priority}
      style={{
        // Variáveis CSS usadas pela barra de prioridade (::before) e pelo dot
        '--depth': depth,
        '--pr-color': pr.bar,
        '--pr-tint': pr.tint,
      } as React.CSSProperties}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => { if (!editing) api.openTask(task) }}
    >
      {/* Guias verticais de indentação — 1 linha por nível de profundidade */}
      <span className="tree-guides" aria-hidden="true">
        {Array.from({ length: depth }).map((_, i) => (
          <i key={i} style={{ left: 13 + i * 22 }} />
        ))}
      </span>

      {/* Espaçador de indentação: empurra o conteúdo 22px por nível.
          Quando depth ≥ 2, exibe o caminho completo da mãe como tooltip (T045). */}
      <span
        className="tree-indent"
        style={{ width: depth * 22 }}
        title={depth >= 2 ? buildBreadcrumb(task, allTasks) : undefined}
      />

      {/* Alça de drag (6 pontos) — draggable, não clica na linha */}
      <span
        className="tree-grip"
        title="Arrastar"
        draggable
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onDragStart={e => {
          setDragId(task.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(task.id))
        }}
        onDragEnd={() => { setDragId(null); setDrop(null) }}
      >
        <Icon name="grip" size={14} />
      </span>

      {/* Caret de colapso — aparece só quando há filhos; fantasma quando não */}
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
        style={{ width: 17, height: 17 }}
      >
        {done && <Icon name="check" size={11} />}
      </button>

      {/* Ponto de prioridade — colorido conforme data-prio */}
      <span className="prio-dot" />

      {/* Corpo da linha: título + subnota */}
      <div className="tk-body" onClick={e => { if (!editing) e.stopPropagation() }}>
        <div className="tk-title-row">
          {/* Tipo especial (event, birthday) */}
          {task.type !== 'task' && (
            <Icon
              name={task.type === 'event' ? 'cal' : 'loop'}
              size={13}
              className="tk-type"
            />
          )}

          {/* Título — editável inline ao clicar */}
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

          {/* Contador de progresso de filhos — clique alterna colapso */}
          {hasKids && (
            <span
              className="tree-count"
              onClick={e => { e.stopPropagation(); onToggleCollapse(task.id) }}
            >
              {prog.done}/{prog.total}
            </span>
          )}

          {/* Ícone de recorrência */}
          {task.recurrence?.active && (
            <span className="tk-flagmini" title={task.recurrence_text ?? 'Recorrente'}>
              <Icon name="loop" size={12} />
            </span>
          )}
        </div>

        {/* Subnota (description primeiro parágrafo) */}
        {task.description && (
          <span className="tk-subnote">
            {task.description.split('\n')[0].slice(0, 80)}
          </span>
        )}
      </div>

      {/* Meta: avatares, 1ª tag, data de vencimento, flag de prioridade */}
      <div className="tk-meta" onClick={e => e.stopPropagation()}>
        {task.assignees && task.assignees.length > 0 && (
          <AvatarStack assignees={task.assignees} size={18} max={3} />
        )}
        {task.tags?.[0] && (
          <span className="tk-tag-chip" style={{ background: task.tags[0].color ?? undefined }}>
            {task.tags[0].name}
          </span>
        )}
        {task.due_date && (
          <span className={`tk-date-chip${task.completed_at ? '' : _isDue(task.due_date) ? ' overdue' : ''}`}>
            {_fmtDate(task.due_date)}
            {task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''}
          </span>
        )}
        {task.priority > 0 && (
          <span className="tk-prio-flag" style={{ color: pr.bar }} title={['', 'Baixa', 'Média', 'Alta'][task.priority]}>
            <Icon name="flag" size={12} />
          </span>
        )}
      </div>

      {/* Ações de hover (sempre renderizadas, visíveis por CSS) */}
      <div className="tree-actions" onClick={e => e.stopPropagation()}>
        {/* Seletor de responsáveis */}
        <AssigneePicker
          selected={(task.assignees ?? []).map(a => a.id)}
          onChange={ids => api.setAssignees(task, ids)}
        />

        {/* Adicionar subtarefa */}
        <button
          type="button"
          className="tree-act"
          title="Adicionar subtarefa"
          onClick={() => api.addChild(task, id => setEditingId(id), () => onToggleCollapse(task.id, false))}
        >
          <Icon name="plus" size={14} />
        </button>

        {/* Tornar tarefa independente (só subtarefas) */}
        {task.parent_id !== null && (
          <button
            type="button"
            className="tree-act"
            title="Tornar independente"
            onClick={() => api.promote(task)}
          >
            <Icon name="arrowUpRight" size={14} />
          </button>
        )}

        {/* Abrir modal de detalhes */}
        <button
          type="button"
          className="tree-act"
          title="Abrir"
          onClick={() => api.openTask(task)}
        >
          <Icon name="edit" size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

// Verifica se a data de vencimento já passou (local, sem UTC)
function _isDue(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const today = new Date()
  return new Date(y, m - 1, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

// Formata "YYYY-MM-DD" → "DD/MM" (sem o ano atual)
function _fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const thisYear = new Date().getFullYear()
  return y === thisYear ? `${d}/${m}` : `${d}/${m}/${y}`
}

// ─── TaskTree — raiz da árvore recursiva ─────────────────────────────────────

export interface TaskTreeProps {
  // Tarefas-raiz (parent_id === null) com subtasks já aninhadas (resposta do backend)
  roots: Task[]
  // Ordenação opcional aplicada em cada nível da árvore (fatia 025 / US7).
  // undefined = manual (preserva a ordem do servidor por position).
  sorter?: (a: Task, b: Task) => number
  // API de mutações (definida pelo ListScreen)
  api: TaskTreeAPI
  // Chave de escopo para persistência do colapso em localStorage (ex: "list-42")
  scopeKey: string
  // Se verdadeiro, mostra o campo "+ Adicionar tarefa" no final da árvore
  showAddRoot?: boolean
  // Chamado quando o usuário clica em "+ Adicionar tarefa"
  onAddRoot?: () => void
}

export function TaskTree({ roots, api, scopeKey, showAddRoot, onAddRoot, sorter }: TaskTreeProps) {
  // Array flat de todos os nós (para buildBreadcrumb no tooltip — T045).
  // Recalculado quando roots muda (useMemo garante sem re-renders extras).
  const allTasks = useMemo(() => flattenTree(roots), [roots])

  // IDs dos nós colapsados (persistido por lista em localStorage)
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`kg:collapsed:${scopeKey}`)
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set()
    } catch { return new Set() }
  })

  // ID da tarefa em modo de edição inline (null = nenhuma)
  const [editingId, setEditingId] = useState<number | null>(null)

  // ID da tarefa sendo arrastada (null = sem drag ativo)
  const [dragId, setDragId] = useState<number | null>(null)

  // Alvo atual do drop (qual linha + qual zona)
  const [drop, setDrop] = useState<DropState | null>(null)

  // Alterna colapso de um nó e persiste no localStorage
  const toggleCollapse = useCallback((id: number, next?: boolean) => {
    setCollapsed(prev => {
      const ns = new Set(prev)
      const shouldCollapse = next === undefined ? !ns.has(id) : next === false ? false : true
      if (shouldCollapse) {
        ns.add(id)
      } else {
        ns.delete(id)
      }
      try { localStorage.setItem(`kg:collapsed:${scopeKey}`, JSON.stringify(Array.from(ns))) } catch {}
      return ns
    })
  }, [scopeKey])

  // Expande todos os nós com filhos (chamado pelo botão "Expandir tudo" do grupo)
  const expandAll = useCallback((ids: number[]) => {
    setCollapsed(prev => {
      const ns = new Set(prev)
      for (const id of ids) ns.delete(id)
      try { localStorage.setItem(`kg:collapsed:${scopeKey}`, JSON.stringify(Array.from(ns))) } catch {}
      return ns
    })
  }, [scopeKey])

  // Colapsa todos os nós com filhos
  const collapseAll = useCallback((ids: number[]) => {
    setCollapsed(prev => {
      const ns = new Set(prev)
      for (const id of ids) ns.add(id)
      try { localStorage.setItem(`kg:collapsed:${scopeKey}`, JSON.stringify(Array.from(ns))) } catch {}
      return ns
    })
  }, [scopeKey])

  // Coleta todos os IDs que têm filhos (para expandAll/collapseAll)
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

  // Limpa o drop state quando o mouse sai da árvore inteira
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDrop(null)
    }
  }, [])

  // Renderiza um nó e seus filhos recursivamente.
  // Quando `sorter` está definido, re-ordena os filhos antes de renderizar.
  const renderNode = useCallback((t: Task, depth: number): React.ReactNode => {
    const rawKids = t.subtasks ?? []
    // Aplica ordenação se fornecida; caso contrário mantém a ordem do servidor (position).
    const kids = sorter ? [...rawKids].sort(sorter) : rawKids
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
          setDragId={setDragId}
          drop={drop}
          setDrop={setDrop}
        />
        {/* Filhos só aparecem se o nó não estiver colapsado */}
        {hasKids && !isCollapsed && kids.map(k => renderNode(k, depth + 1))}
      </Fragment>
    )
  }, [collapsed, toggleCollapse, api, allTasks, editingId, dragId, drop, sorter])

  const parentIds = collectParentIds(roots)
  const allCollapsed = parentIds.length > 0 && parentIds.every(id => collapsed.has(id))

  return (
    <div className={`tree${dragId ? ' dragging-active' : ''}`} onDragLeave={onDragLeave}>
      {/* Botão expandir/recolher tudo — aparece só quando há nós pais */}
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

      {/* Nós da árvore */}
      {roots.map(r => renderNode(r, 0))}

      {/* Botão "+ Adicionar tarefa" no final do grupo */}
      {showAddRoot && (
        <button
          type="button"
          className="tree-addroot"
          onClick={onAddRoot}
        >
          <Icon name="plus" size={14} />
          Adicionar tarefa
        </button>
      )}
    </div>
  )
}

