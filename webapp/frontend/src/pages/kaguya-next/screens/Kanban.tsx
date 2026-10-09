// Kanban da lista e quadro do grupo. SÓ A PELE mudou: a estrutura é a do shell antigo — barra de views, barra de
// filtro, colunas com contador/capacidade/“+ Adicionar tarefa”, cards arrastáveis (@dnd-kit), coluna de concluídas
// que conclui ao soltar, rodapé-resumo e, no grupo, colunas unificadas por nome com o balde “Sem coluna”.
//
// Arrastar: atualização otimista (o card muda de lugar antes da resposta); em erro volta ao estado anterior.
// Recarga silenciosa depois de gravar: o quadro nunca pisca “Carregando…” numa mutação.

import {
  DndContext, DragOverlay, closestCorners, useDroppable,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, ErrorState, Icon, IconButton, LoadingState, Page, Select, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { ColumnModal } from '../components/ColumnModal'
import { KanbanCard, KanbanSortableCard } from '../components/KanbanCard'
import { KanbanSummary, DEFAULT_SLOTS } from '../components/KanbanSummary'
import { KanbanToolbar } from '../components/KanbanToolbar'
import { DEFAULT_DISPLAY, KanbanViewModal } from '../components/KanbanViewModal'
import { ProjectOptions } from '../components/ProjectOptions'
import { useKaguya } from '../context'
import { midPosition, useDndSensors } from '../lib/dnd'
import { applyKanbanFilters, KANBAN_DEFAULTS, type KanbanFilters } from '../lib/kanbanFilter'
import { fmtMinutes } from '../lib/taskView'
import type { Column, GroupBoard, GroupBoardColumn, KanbanView, Task } from '../types'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)
const sortCols = (cols: Column[]) => [...cols].sort((a, b) => a.position - b.position)
const viewKey = (projectId: number) => `kaguya:kanban:active-view:${projectId}`

/** Concluir ao soltar na coluna de concluídas. Com subtarefas abertas o servidor pede confirmação da cascata. */
async function completeOnDrop(taskId: number): Promise<boolean> {
  const r = await kaguyaApi.complete(taskId)
  if (!r.needs_cascade) return true
  const ok = await confirm({ title: `Concluir ${r.open_subtasks} subtarefa(s) também?`, confirmLabel: 'Concluir todas' })
  if (!ok) return false
  await kaguyaApi.complete(taskId, true)
  return true
}

interface ColumnProps {
  id: string
  name: string
  count: number
  sub: string
  done: boolean
  isOver: boolean
  /** Segmentos “ligados” do medidor (0–5); `null` esconde o medidor. */
  capacity: number | null
  cards: Task[]
  activeId: number | null
  cardProps: (t: Task) => { projectName?: string; showChips?: boolean; showRing?: boolean }
  onOpen: (t: Task) => void
  onAdd?: () => void
  onEdit?: () => void
}

function KanbanColumn({ id, name, count, sub, done, isOver, capacity, cards, activeId, cardProps, onOpen, onAdd, onEdit }: ColumnProps) {
  // O corpo é um alvo de soltura: pega colunas vazias e o espaço abaixo dos cards.
  const { setNodeRef } = useDroppable({ id })
  return (
    <section className={`kn-kcol${isOver ? ' kn-over' : ''}${done ? ' kn-kcol-done' : ''}`} aria-label={name}>
      <header className="kn-khead">
        <div className="kn-krow">
          <span className="kn-knum ds-num">{count}</span>
          <div className="kn-kname"><b><i className="kn-kdot" />{name}</b><span className="ds-mono">{sub}</span></div>
          {onEdit && <IconButton icon="prefs" label={`Editar a coluna ${name}`} size={14} onClick={onEdit} />}
        </div>
        {capacity !== null && !done && (
          <div className="kn-kcap" role="img" aria-label={`Capacidade da coluna: ${capacity} de 5`}>{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < capacity ? 'kn-on' : ''} />)}</div>
        )}
      </header>
      <div ref={setNodeRef} className="kn-kbodycol">
        <SortableContext items={cards.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {cards.map((t) => <KanbanSortableCard key={t.id} task={t} onOpen={onOpen} isBeingDragged={activeId === t.id} {...cardProps(t)} />)}
        </SortableContext>
      </div>
      {onAdd && !done && <button type="button" className="kn-kadd" onClick={onAdd}><Icon name="add" size={13} />Adicionar tarefa</button>}
    </section>
  )
}

/** O que cada board entrega ao “levantar” o card que segue o cursor. */
function Overlay({ task, projectName }: { task: Task | undefined; projectName?: string }) {
  return (
    <DragOverlay dropAnimation={null}>
      {task ? <div className="kn-koverlay"><KanbanCard task={task} onOpen={() => {}} projectName={projectName} /></div> : null}
    </DragOverlay>
  )
}

// ── Kanban de uma lista ───────────────────────────────────────────────────────

export function KanbanScreen({ projectId }: { projectId: number }) {
  const k = useKaguya()
  const project = k.projects.find((p) => p.id === projectId)
  const projectName = project?.name ?? 'Quadro'
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading')
  const [views, setViews] = useState<KanbanView[]>([])
  const [activeViewId, setActiveViewId] = useState<number | null>(null)
  const [viewModal, setViewModal] = useState<{ view?: KanbanView } | null>(null)
  const [columnModal, setColumnModal] = useState<{ column?: Column } | null>(null)
  const [filters, setFilters] = useState<KanbanFilters>(KANBAN_DEFAULTS)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<number | null>(null)
  const [copySource, setCopySource] = useState('')
  const [copying, setCopying] = useState(false)
  const sensors = useDndSensors()
  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const display = activeView?.display ?? DEFAULT_DISPLAY
  // As concluídas entram no quadro: a coluna de concluídas mostra o que já foi feito (o backend a trata como “concluída”).
  const fetchTasks = useCallback((v: KanbanView | null) => (v?.filter ? kaguyaApi.kanbanViewBoard(v.id, projectId) : kaguyaApi.listTasks(projectId, true)), [projectId])

  // As views são opcionais: sem elas o quadro usa “tudo ligado”. A ativa é lembrada por lista.
  const loadViews = useCallback(async () => {
    try {
      const vs = await kaguyaApi.listKanbanViews()
      setViews(vs)
      let stored = NaN
      try { stored = Number(localStorage.getItem(viewKey(projectId))) } catch { /* sem armazenamento: cai na “Completa” */ }
      setActiveViewId(vs.find((v) => v.id === stored)?.id ?? vs.find((v) => v.is_builtin)?.id ?? vs[0]?.id ?? null)
    } catch { setViews([]); setActiveViewId(null) }
  }, [projectId])

  const load = useCallback(async (silent: boolean, view: KanbanView | null) => {
    if (!silent) setStatus('loading')
    loadedKey.current = keyRef.current(view)
    try {
      const [cols, ts] = await Promise.all([kaguyaApi.listColumns(projectId), fetchTasks(view)])
      setColumns(sortCols(cols))
      setTasks(ts)
      setStatus('ok')
    } catch { if (!silent) setStatus('error') }
  }, [projectId, fetchTasks])

  useEffect(() => { setFilters(KANBAN_DEFAULTS); void loadViews() }, [loadViews])
  const viewRef = useRef<KanbanView | null>(null)
  viewRef.current = activeView
  // O que a última carga usou (view + filtro + revisão): evita recarregar à toa e pega a view que chegou depois dos dados.
  const loadedKey = useRef('')
  const keyFor = (v: KanbanView | null) => `${v?.id ?? ''}|${JSON.stringify(v?.filter ?? null)}|${k.rev}`
  const keyRef = useRef(keyFor)
  keyRef.current = keyFor
  // Troca de lista: carga com “Carregando…”. Troca de view ou gravação (rev): silenciosa.
  useEffect(() => { void load(false, viewRef.current) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Só depois da primeira carga, e só se a view/filtro/revisão mudou desde a última (não duplica a consulta nem esconde o erro).
  useEffect(() => { if (status === 'ok' && loadedKey.current !== keyFor(activeView)) void load(true, activeView) }, [status, activeViewId, views, k.rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectView = (id: number) => {
    setActiveViewId(id)
    try { localStorage.setItem(viewKey(projectId), String(id)) } catch { /* a escolha só não é lembrada */ }
  }

  const colIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns])

  const colOf = (overId: string | number): number | null => {
    if (typeof overId === 'string') return overId.startsWith('col:') ? Number(overId.slice(4)) : null
    const t = tasks.find((x) => x.id === overId)
    return t ? (t.column_id != null && colIds.has(t.column_id) ? t.column_id : columns[0]?.id ?? null) : null
  }

  const onDragOver = (e: DragOverEvent) => setOverCol(e.over ? colOf(e.over.id) : null)

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null); setOverCol(null)
    if (!over) return
    const taskId = active.id as number
    const task = tasks.find((t) => t.id === taskId)
    const targetColId = colOf(over.id)
    const targetCol = columns.find((c) => c.id === targetColId)
    if (!task || !targetCol) return

    // Vizinhos na coluna de destino (sem o card arrastado): decidem a posição.
    const targetCards = tasks.filter((t) => t.id !== taskId && (t.column_id === targetCol.id || (targetCol.id === columns[0]?.id && (t.column_id == null || !colIds.has(t.column_id))))).sort((a, b) => a.position - b.position)
    let afterId: number | undefined
    let beforeId: number | undefined
    if (typeof over.id === 'number' && over.id !== taskId) {
      const a = active.rect.current.translated
      const insertBefore = (a?.top ?? 0) + (a?.height ?? 0) / 2 < over.rect.top + over.rect.height / 2
      const i = targetCards.findIndex((t) => t.id === over.id)
      if (i >= 0) {
        if (insertBefore) { afterId = i > 0 ? targetCards[i - 1].id : undefined; beforeId = targetCards[i].id }
        else { afterId = targetCards[i].id; beforeId = i + 1 < targetCards.length ? targetCards[i + 1].id : undefined }
      } else afterId = targetCards[targetCards.length - 1]?.id
    } else afterId = targetCards[targetCards.length - 1]?.id

    const snapshot = tasks
    const pos = midPosition(afterId ? tasks.find((t) => t.id === afterId) : null, beforeId ? tasks.find((t) => t.id === beforeId) : null)
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, column_id: targetCol.id, position: pos } : t)))
    try {
      if (targetCol.is_done_column) {
        if (!(await completeOnDrop(taskId))) { setTasks(snapshot); return }
      } else {
        if (task.column_id !== targetCol.id) await kaguyaApi.updateTask(taskId, { column_id: targetCol.id })
        await kaguyaApi.reorder(taskId, { after_id: afterId, before_id: beforeId })
      }
      // Recarrega para trazer as posições reais que o servidor calculou (a local era uma estimativa).
      k.reload()
    } catch (err) {
      setTasks(snapshot)
      toast(reason(err, 'Não foi possível mover o card.'), { tone: 'error' })
    }
  }

  const copyFrom = async () => {
    setCopying(true)
    try {
      const r = await kaguyaApi.copyColumns(projectId, Number(copySource))
      if (r.status === 'error') { toast(r.message ?? 'Não foi possível copiar as colunas.', { tone: 'error' }); return }
      toast('Colunas copiadas.', { tone: 'success' })
      k.reload()
    } catch (err) { toast(reason(err, 'Não foi possível copiar as colunas.'), { tone: 'error' }) } finally { setCopying(false) }
  }

  if (status === 'loading') return <Page full><LoadingState variant="card" count={3} /></Page>
  if (status === 'error') return <Page full><ErrorState onRetry={() => void load(false, activeView)} /></Page>

  const copyable = k.projects.filter((p) => p.has_board && p.id !== projectId)
  const modals = (
    <>
      {viewModal && <KanbanViewModal view={viewModal.view} onClose={() => setViewModal(null)} onSaved={() => { void loadViews() }} />}
      {columnModal && <ColumnModal column={columnModal.column} projectId={projectId} onClose={() => setColumnModal(null)} onSaved={() => { k.reload() }} />}
    </>
  )

  if (columns.length === 0) {
    return (
      <Page full className="kn-page">
        <EmptyState
          icon="kanban"
          title="Sem quadro ainda"
          hint="Crie a primeira coluna para ativar o Kanban desta lista."
          action={(
            <div className="kn-kempty">
              <Button variant="primary" icon="add" onClick={() => setColumnModal({})}>Criar coluna do zero</Button>
              {copyable.length > 0 && (
                <div className="kn-quick">
                  <Select aria-label="Copiar colunas de" value={copySource} disabled={copying} onChange={(e) => setCopySource(e.target.value)}>
                    <option value="">Copiar colunas de…</option>
                    <ProjectOptions projects={copyable} groups={k.groups} />
                  </Select>
                  <Button disabled={!copySource || copying} onClick={() => void copyFrom()}>{copying ? 'Copiando…' : 'Copiar'}</Button>
                </div>
              )}
            </div>
          )}
        />
        {modals}
      </Page>
    )
  }

  const firstId = columns[0].id
  const activeTask = tasks.find((t) => t.id === activeId)
  const cardProps = () => ({ projectName, showChips: display.adornos.card_chips, showRing: display.adornos.subtask_ring })

  return (
    <Page full className="kn-page">
      <h2 className="kn-kpage-t"><Icon name="kanban" size={22} />{projectName}</h2>
      <p className="kn-kpage-sub">Arraste entre colunas · soltar em concluídas conclui a tarefa.</p>
      <div className="kn-kviews" role="group" aria-label="Views do quadro">
        {views.length > 0 && (
          <>
            <label htmlFor="kn-view-sel">View</label>
            <Select id="kn-view-sel" value={activeViewId ?? ''} onChange={(e) => selectView(Number(e.target.value))}>
              {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Button size="sm" icon="prefs" disabled={!activeView} onClick={() => activeView && setViewModal({ view: activeView })}>Editar</Button>
            <Button size="sm" icon="add" onClick={() => setViewModal({})}>View</Button>
          </>
        )}
        <Button size="sm" icon="list" onClick={() => k.goto({ view: 'list', id: projectId })}>Ver como lista</Button>
      </div>
      <KanbanToolbar filters={filters} onChange={setFilters} />

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as number)} onDragOver={onDragOver} onDragEnd={(e) => void onDragEnd(e)}>
        <div className="kn-board">
          <div className="kn-kcols">
            {columns.map((col) => {
              // A primeira coluna acolhe as órfãs (sem coluna, ou com uma coluna que não existe mais aqui): nada some do quadro.
              // Concluída só aparece na coluna de concluídas: as contagens das outras são de abertas, como no quadro antigo.
              const raw = tasks.filter((t) => (col.is_done_column || t.completed_at == null) && (t.column_id === col.id || (col.id === firstId && (t.column_id == null || !colIds.has(t.column_id)))))
              const cards = applyKanbanFilters(raw, filters)
              const est = cards.reduce((s, t) => s + (t.duration_min ?? 0), 0)
              return (
                <KanbanColumn
                  key={col.id}
                  id={`col:${col.id}`}
                  name={col.name}
                  count={cards.length}
                  sub={col.is_done_column ? 'concluídas' : est > 0 ? `Σ ${fmtMinutes(est)}` : 'sem estimativa'}
                  done={col.is_done_column}
                  isOver={overCol === col.id}
                  capacity={display.adornos.capacity_meter ? Math.round(Math.min(est / 240, 1) * 5) : null}
                  cards={cards}
                  activeId={activeId}
                  cardProps={cardProps}
                  onOpen={(t) => k.openTask(t.id)}
                  onAdd={() => k.newTask({ projectId, columnId: col.id })}
                  onEdit={() => setColumnModal({ column: col })}
                />
              )
            })}
            <Button className="kn-kaddcol" icon="add" onClick={() => setColumnModal({})}>Coluna</Button>
          </div>
          {display.adornos.summary_footer && <KanbanSummary tasks={tasks} columns={columns} slots={display.slots ?? DEFAULT_SLOTS} today={k.today} />}
        </div>
        <Overlay task={activeTask} projectName={projectName} />
      </DndContext>
      {modals}
    </Page>
  )
}

// ── Quadro de um grupo (colunas unificadas por nome) ──────────────────────────

export function GroupBoardScreen({ groupId }: { groupId: number }) {
  const k = useKaguya()
  const [board, setBoard] = useState<GroupBoard | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading')
  const [filters, setFilters] = useState<KanbanFilters>(KANBAN_DEFAULTS)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const sensors = useDndSensors()

  const loadedRev = useRef(-1)
  const revRef = useRef(k.rev)
  revRef.current = k.rev
  const load = useCallback(async (silent: boolean) => {
    if (!silent) setStatus('loading')
    loadedRev.current = revRef.current
    try { setBoard(await kaguyaApi.groupBoard(groupId)); setStatus('ok') } catch { if (!silent) setStatus('error') }
  }, [groupId])
  useEffect(() => { setFilters(KANBAN_DEFAULTS); void load(false) }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status === 'ok' && loadedRev.current !== k.rev) void load(true) }, [status, k.rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const listName = useCallback((pid: number) => board?.lists.find((l) => l.id === pid)?.name ?? '', [board])
  const keyOfColumn = (columnId: number | null): string | null => (columnId == null || !board ? null : board.columns.find((c) => c.members.some((m) => m.column_id === columnId))?.key ?? null)
  const keyOf = (overId: string | number): string | null => {
    if (typeof overId === 'string') return overId.startsWith('gcol:') ? overId.slice(5) : null
    return keyOfColumn(board?.tasks.find((t) => t.id === overId)?.column_id ?? null)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null); setOverKey(null)
    if (!over || !board) return
    const taskId = active.id as number
    const task = board.tasks.find((t) => t.id === taskId)
    const targetKey = keyOf(over.id)
    const target = board.columns.find((c) => c.key === targetKey)
    if (!task || !target || keyOfColumn(task.column_id ?? null) === targetKey) return
    // A coluna unificada tem um membro por lista: o card vai para a coluna da PRÓPRIA lista dele.
    const member = target.members.find((m) => m.project_id === task.project_id)
    if (!member) { toast(`A lista “${listName(task.project_id)}” não tem a coluna “${target.name}”.`, { tone: 'error' }); return }
    const snapshot = board
    setBoard({ ...board, tasks: board.tasks.map((t) => (t.id === taskId ? { ...t, column_id: member.column_id } : t)) })
    try {
      if (target.is_done) { if (!(await completeOnDrop(taskId))) { setBoard(snapshot); return } }
      else await kaguyaApi.updateTask(taskId, { column_id: member.column_id })
      k.reload()
    } catch (err) { setBoard(snapshot); toast(reason(err, 'Não foi possível mover o card.'), { tone: 'error' }) }
  }

  if (status === 'loading') return <Page full><LoadingState variant="card" count={3} /></Page>
  if (status === 'error' || !board) return <Page full><ErrorState onRetry={() => void load(false)} /></Page>
  if (board.lists.length === 0) return <Page full><EmptyState icon="folder" title="Grupo vazio" hint="Adicione listas a este grupo pela barra lateral para ver o quadro." /></Page>
  if (board.columns.length === 0) return <Page full><EmptyState icon="kanban" title="Nenhuma lista tem quadro Kanban" hint="Crie colunas em pelo menos uma lista do grupo para ativar este quadro." /></Page>

  const known = new Set(board.columns.flatMap((c) => c.members.map((m) => m.column_id)))
  const without = applyKanbanFilters(board.tasks.filter((t) => t.parent_id == null && (t.column_id == null || !known.has(t.column_id))), filters)
  const groupTitle = k.groups.find((g) => g.id === groupId)?.name ?? 'Grupo'
  const activeTask = board.tasks.find((t) => t.id === activeId)
  const cardProps = (t: Task) => ({ projectName: listName(t.project_id), showChips: true, showRing: true })
  const addTo = (col: GroupBoardColumn) => k.newTask({ targets: col.members.map((m) => ({ projectId: m.project_id, columnId: m.column_id, listName: listName(m.project_id) })) })

  return (
    <Page full className="kn-page">
      <h2 className="kn-kpage-t"><Icon name="kanban" size={22} />{groupTitle}</h2>
      <p className="kn-kpage-sub">{board.lists.map((l) => l.name).join(' · ')}</p>
      <div className="kn-kviews">
        <Button size="sm" icon="list" onClick={() => k.goto({ view: 'group-list', id: groupId })}>Ver como lista</Button>
      </div>
      <KanbanToolbar filters={filters} onChange={setFilters} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as number)}
        onDragOver={(e: DragOverEvent) => setOverKey(e.over ? keyOf(e.over.id) : null)}
        onDragEnd={(e) => void onDragEnd(e)}
      >
        <div className="kn-board">
          <div className="kn-kcols">
            {board.columns.map((col) => {
              const ids = new Set(col.members.map((m) => m.column_id))
              const cards = applyKanbanFilters(board.tasks.filter((t) => t.parent_id == null && t.column_id != null && ids.has(t.column_id)), filters)
              return (
                <KanbanColumn
                  key={col.key}
                  id={`gcol:${col.key}`}
                  name={col.name}
                  count={cards.length}
                  sub={col.is_done ? 'concluídas' : `${col.members.length} lista(s)`}
                  done={col.is_done}
                  isOver={overKey === col.key}
                  capacity={null}
                  cards={cards}
                  activeId={activeId}
                  cardProps={cardProps}
                  onOpen={(t) => k.openTask(t.id)}
                  onAdd={() => addTo(col)}
                />
              )
            })}
            {/* Tarefas de listas sem quadro: só leitura (não é alvo de soltura). */}
            {without.length > 0 && (
              <section className="kn-kcol kn-kcol-ro" aria-label="Sem coluna">
                <header className="kn-khead"><div className="kn-krow"><span className="kn-knum ds-num">{without.length}</span><div className="kn-kname"><b>Sem coluna</b><span className="ds-mono">listas sem quadro</span></div></div></header>
                <div className="kn-kbodycol">{without.map((t) => <KanbanCard key={t.id} task={t} onOpen={(x) => k.openTask(x.id)} {...cardProps(t)} />)}</div>
              </section>
            )}
          </div>
        </div>
        <Overlay task={activeTask} projectName={activeTask ? listName(activeTask.project_id) : undefined} />
      </DndContext>
    </Page>
  )
}

