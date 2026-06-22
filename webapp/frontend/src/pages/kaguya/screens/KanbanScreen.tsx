// KanbanScreen — board de uma "Lista" (guia §4.2). Colunas configuráveis,
// cards arrastáveis entre colunas e reordenáveis dentro delas.
//
// DnD via @dnd-kit (não HTML5 nativo):
//   • Sem onDragOver com setState — o principal causador de re-render a cada pixel.
//   • Overlay suave que segue o cursor (DragOverlay).
//   • Animação de abertura de espaço (SortableContext + verticalListSortingStrategy).
//   • Optimistic update: o card se move na tela imediatamente, antes da resposta da API.
//   • Reordenação dentro da coluna: usa o endpoint /position (antes sem uso).
//   • Sem spinner a cada drop: spinner só no carregamento inicial.

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Task, Column, KanbanView, KanbanViewDisplay } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskCard } from '../components/TaskCard'
import { SortableTaskCard } from '../components/SortableTaskCard'
import { SummaryFooter } from '../components/SummaryFooter'
import { KanbanViewModal } from '../components/KanbanViewModal'
import { ColumnModal } from '../modals/ColumnModal'
import { AddTaskModal } from '../modals/AddTaskModal'
import { Icon } from '../ui/Icons'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
// Sensor e helper de posição centralizados — evita duplicar em cada tela de DnD.
import { useDndSensors, midPosition } from '../lib/dnd'

// ── Props ────────────────────────────────────────────────────────────────────

interface KanbanScreenProps {
  projectId: number
  projectName: string
  reloadKey: number
  onOpenTask: (task: Task) => void
  onChanged: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
  // Outras listas que já têm board — usadas no seletor "copiar de outro board"
  // do estado vazio. Lista vazia = opção de cópia não aparece.
  boards: { id: number; name: string; icon: string | null }[]
}

// ── Componente de coluna ──────────────────────────────────────────────────────
// Extraído para componente separado porque useSortable/useDroppable são hooks
// e precisam ser chamados dentro de um componente React.

// Estimativa formatada (min → "20min"/"1.5h"/"3h") para a sub-linha + capacity meter.
function fmtEst(min: number): string {
  if (min < 60) return `${min}min`
  const h = min / 60
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

interface KanbanColumnProps {
  col: Column
  cards: Task[]            // já filtrados + ordenados por position
  activeId: number | null  // id do card sendo arrastado (para opacidade do slot)
  isOver: boolean          // true quando o cursor está sobre esta coluna durante drag
  projectName: string      // nome da lista (chip de projeto dos cards)
  showCapacity: boolean    // adorno da view ativa: capacity meter (R6)
  showChips: boolean       // adorno da view ativa: chips no card (R11)
  showRing: boolean        // adorno da view ativa: anel de subtarefas (R12)
  onOpen: (task: Task) => void
  onAddTask: (col: Column) => void
  onEditColumn: (col: Column) => void
}

function KanbanColumn({ col, cards, activeId, isOver, projectName, showCapacity, showChips, showRing, onOpen, onAddTask, onEditColumn }: KanbanColumnProps) {
  // useDroppable torna o corpo da coluna uma área de drop para o dnd-kit.
  // Captura drops em colunas vazias (sem cards) e abaixo de todos os cards.
  // O id no formato "col:<id>" diferencia a coluna de um id de card.
  const { setNodeRef } = useDroppable({ id: `col:${col.id}` })

  // Soma das estimativas (duration_min) dos cards — insumo da sub-linha e do capacity meter.
  const colEst = cards.reduce((s, t) => s + (t.duration_min ?? 0), 0)
  // Segmentos "ligados": 240min (4h) preenche os 5 (R6). Oculto na coluna concluído.
  const segOn = col.is_done_column ? 0 : Math.round(Math.min(colEst / 240, 1) * 5)
  // Cor do dot/segmentos: coluna concluído = esmeralda; demais = accent ativo (Q-B/R-6).
  const accent = col.is_done_column ? 'var(--done)' : 'var(--kg)'

  return (
    <div
      className={`kcol${isOver ? ' is-over' : ''}`}
      style={{ '--kc-color': accent } as React.CSSProperties}
    >
      {/* Cabeçalho "Vidro": numeral grande, nome + sub-linha, toggle de concluído, capacity meter */}
      <div className="kcol-head">
        <div className="kc-row1">
          <span className="kc-num">{cards.length}</span>
          <div className="kc-namewrap">
            <span className="kc-name">
              <span className="kc-dot" style={{ background: accent }} />{col.name}
            </span>
            <span className="kc-sub">
              {col.is_done_column ? 'concluídas' : colEst > 0 ? `Σ ${fmtEst(colEst)}` : 'sem estimativa'}
            </span>
          </div>
          {/* Engrenagem: abre o modal de editar coluna (renomear + concluído + excluir) */}
          <button
            className="kc-settings"
            title="Editar coluna"
            onClick={() => onEditColumn(col)}
          >
            <Icon name="settings" size={14} />
          </button>
        </div>
        {!col.is_done_column && showCapacity && (
          <div className="kcol-cap">
            {[0, 1, 2, 3, 4].map(i => <i key={i} className={i < segOn ? 'on' : ''} />)}
          </div>
        )}
      </div>

      {/* Corpo: droppable + cards sortáveis (@dnd-kit) */}
      <div ref={setNodeRef} className="kcol-body">
        <SortableContext items={cards.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {cards.map(t => (
            <SortableTaskCard
              key={t.id}
              task={t}
              onOpen={onOpen}
              isBeingDragged={activeId === t.id}
              projectName={projectName}
              showChips={showChips}
              showRing={showRing}
            />
          ))}
        </SortableContext>
      </div>

      {/* Botão "+ Adicionar tarefa" (irmão do corpo, como no handoff); oculto na coluna concluído */}
      {!col.is_done_column && (
        <button className="kcol-add" onClick={() => onAddTask(col)}>
          <Icon name="plus" size={13} /> Adicionar tarefa
        </button>
      )}
    </div>
  )
}

// ── Tela principal ────────────────────────────────────────────────────────────

export function KanbanScreen({
  projectId,
  projectName,
  reloadKey,
  onOpenTask,
  onChanged,
  toast,
  boards,
}: KanbanScreenProps) {
  const [columns, setColumns]   = useState<Column[]>([])
  const [tasks, setTasks]       = useState<Task[]>([])
  // firstLoad: true = mostra o spinner. Fica false após o primeiro load bem-sucedido
  // e nunca volta para true — drops e reloads silenciosos não mostram o spinner.
  const [firstLoad, setFirstLoad] = useState(true)

  // activeId: id do card sendo arrastado (alimenta o DragOverlay e o slot transparente).
  const [activeId, setActiveId]   = useState<number | null>(null)
  // overColId: coluna atualmente sob o cursor durante drag (para realce visual).
  // Atualizado pelo onDragOver do DndContext (dispara só quando o alvo muda, não
  // a cada pixel — muito mais eficiente que o setHoverCol nativo anterior).
  const [overColId, setOverColId] = useState<number | null>(null)

  // ── Views de Kanban (spec 024) ────────────────────────────────────────────────
  // views: catálogo global; activeViewId: view ativa nesta lista (lembrada em localStorage);
  // viewModal: criar/editar uma view.
  const [views, setViews] = useState<KanbanView[]>([])
  const [activeViewId, setActiveViewId] = useState<number | null>(null)
  const [viewModal, setViewModal] = useState<{ mode: 'create' | 'edit'; view?: KanbanView } | null>(null)

  // Estados para a ação "copiar colunas de outro board" (visível no estado vazio).
  // copySource: id da lista-fonte selecionada no seletor; copying: feedback de loading.
  const [copySource, setCopySource] = useState<number | null>(null)
  const [copying, setCopying] = useState(false)

  // Modais de coluna (criar/editar/excluir) e de adicionar tarefa — substituem os window.prompt.
  const [columnModal, setColumnModal] = useState<{ mode: 'create' | 'edit'; column?: Column } | null>(null)
  const [addTaskCol, setAddTaskCol] = useState<Column | null>(null)

  // Chave de persistência da view ativa POR LISTA (R7/R25): cada board reabre na última.
  const lsKey = `kaguya:kanban:active-view:${projectId}`

  // Carrega o catálogo de views (global) e resolve a ativa desta lista:
  // localStorage > built-in "Completa" > primeira. View órfã no localStorage cai na "Completa".
  const loadViews = useCallback(async () => {
    try {
      const vs = await kaguyaApi.listKanbanViews()
      setViews(vs)
      const stored = Number(localStorage.getItem(`kaguya:kanban:active-view:${projectId}`))
      const found = vs.find(v => v.id === stored)
      const builtin = vs.find(v => v.is_builtin)
      setActiveViewId(found ? stored : (builtin?.id ?? vs[0]?.id ?? null))
    } catch {
      // Views são opcionais: se falhar, o board renderiza no default "tudo ligado".
      setViews([])
      setActiveViewId(null)
    }
  }, [projectId])

  useEffect(() => { loadViews() }, [loadViews])

  // Troca a view ativa e persiste a escolha para esta lista.
  const selectView = (id: number) => {
    setActiveViewId(id)
    localStorage.setItem(lsKey, String(id))
  }

  // Quando a view ativa muda (após o load inicial), recarrega as tarefas aplicando o
  // filtro da view (ou sem filtro). Silencioso — sem spinner. Os contadores de coluna,
  // capacity meter e slots do rodapé recalculam sobre este conjunto (A11).
  useEffect(() => {
    if (firstLoad) return
    let cancelled = false
    ;(async () => {
      const v = views.find(x => x.id === activeViewId)
      try {
        const ts = v?.filter
          ? await kaguyaApi.kanbanViewBoard(v.id, projectId)
          : await kaguyaApi.listTasks(projectId, false)
        if (!cancelled) setTasks(ts)
      } catch {
        // Mantém o conjunto atual se a carga filtrada falhar.
      }
    })()
    return () => { cancelled = true }
  }, [activeViewId, views, projectId, firstLoad])

  // ── Carregamento ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      // Busca colunas e tarefas em paralelo para minimizar latência.
      const [cols, ts] = await Promise.all([
        kaguyaApi.listColumns(projectId),
        kaguyaApi.listTasks(projectId, false),
      ])
      setColumns(cols.sort((a, b) => a.position - b.position))
      setTasks(ts)
    } catch {
      toast('Falha ao carregar o board.', 'err')
    } finally {
      // Após a primeira carga, firstLoad vira false e fica assim.
      // Chamadas subsequentes (drops, addTask, etc.) não tocam em firstLoad,
      // então o board nunca pisca "Carregando…" em mutações.
      setFirstLoad(false)
    }
  }, [projectId, toast])

  // Carga inicial + troca de lista: `load` é recriado quando projectId muda, então este
  // efeito dispara no mount e ao trocar de lista — aí sim mostra o spinner.
  useEffect(() => {
    setFirstLoad(true)
    load()
  }, [load])

  // reloadKey muda quando uma tarefa é editada no modal/shell (afterSave → bump). Aqui
  // recarregamos o board de forma SILENCIOSA (sem mexer em firstLoad → sem flash
  // "Carregando…"), respeitando o filtro da view ativa. Pula o mount (o efeito acima
  // já fez a 1ª carga); não reage a projectId (gatilho exclusivo: reloadKey).
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    let cancelled = false
    ;(async () => {
      try {
        const v = views.find(x => x.id === activeViewId)
        const [cols, ts] = await Promise.all([
          kaguyaApi.listColumns(projectId),
          v?.filter ? kaguyaApi.kanbanViewBoard(v.id, projectId) : kaguyaApi.listTasks(projectId, false),
        ])
        if (!cancelled) {
          setColumns(cols.sort((a, b) => a.position - b.position))
          setTasks(ts)
        }
      } catch {
        // Silencioso: mantém o board atual se a recarga falhar.
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gatilho exclusivo: reloadKey
  }, [reloadKey])

  // ── Sensores @dnd-kit ─────────────────────────────────────────────────────────
  // Reutiliza o hook centralizado de lib/dnd.ts (PointerSensor, 5px de ativação).
  // Clique curto (< 5px) → dispara onOpen; arraste (≥ 5px) → inicia DnD.
  const sensors = useDndSensors()

  // ── Handlers de drag ──────────────────────────────────────────────────────────

  // Início do drag: registra qual card está sendo arrastado.
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }, [])

  // Durante o drag: atualiza qual coluna está realçada.
  // O dnd-kit dispara onDragOver apenas quando o ALVO muda (não a cada pixel
  // como o evento nativo), então isso é eficiente — sem re-render cascata.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (!over) {
      setOverColId(null)
      return
    }
    // Se o alvo é o droppable de uma coluna vazia ("col:<id>"), extrai o id.
    // Senão, é um card — busca a coluna desse card.
    if (typeof over.id === 'string' && over.id.startsWith('col:')) {
      setOverColId(parseInt(over.id.replace('col:', ''), 10))
    } else {
      const overTask = tasks.find(t => t.id === (over.id as number))
      setOverColId(overTask?.column_id ?? null)
    }
  }, [tasks])

  // Fim do drag: calcula onde o card foi solto, aplica optimistic update
  // e comita as mudanças via API em background.
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    // Limpa estado visual de drag (overlay some, realce da coluna some).
    setActiveId(null)
    setOverColId(null)

    // Sem destino válido → cancela o drag sem alterar nada.
    if (!over) return

    const taskId = active.id as number
    const task   = tasks.find(t => t.id === taskId)
    if (!task) return

    // ── 1. Determinar coluna de destino ─────────────────────────────────────
    // "col:<n>" = droppable da coluna (coluna vazia ou abaixo dos cards).
    // Número = id de um card — usa a coluna desse card.
    let targetColId: number
    if (typeof over.id === 'string' && over.id.startsWith('col:')) {
      targetColId = parseInt(over.id.replace('col:', ''), 10)
    } else {
      const overTask = tasks.find(t => t.id === (over.id as number))
      if (!overTask) return
      // Tarefas órfãs (column_id null) estão na 1ª coluna; usa o id dela como destino.
      targetColId = overTask.column_id ?? (columns[0]?.id ?? 0)
    }

    const targetCol = columns.find(c => c.id === targetColId)
    if (!targetCol) return

    // ── 2. Calcular vizinhos after_id / before_id para reorder ──────────────
    // Cards da coluna alvo (excluindo o arrastado), ordenados por position.
    const overCardId: number | null = typeof over.id === 'number' ? (over.id as number) : null

    const targetCards = tasks
      .filter(t => t.id !== taskId && t.column_id === targetColId)
      .sort((a, b) => a.position - b.position)

    let afterId:  number | undefined
    let beforeId: number | undefined

    if (overCardId !== null && overCardId !== taskId) {
      // Solto sobre um card: determina inserção antes ou depois pelo centro vertical.
      // Compara o centro do card arrastado com o centro do card de destino.
      // - activeCenter < overCenter → ainda está na metade superior → inserir ANTES
      // - activeCenter ≥ overCenter → já passou da metade → inserir DEPOIS
      const activeRect = event.active.rect.current.translated
      const overRect   = over.rect
      const activeCenter = (activeRect?.top ?? 0) + (activeRect?.height ?? 0) / 2
      const overCenter   = overRect.top + overRect.height / 2
      const insertBefore = activeCenter < overCenter

      const overIdx = targetCards.findIndex(t => t.id === overCardId)
      if (overIdx >= 0) {
        if (insertBefore) {
          // Inserir antes do overCard: afterId = card anterior, beforeId = overCard.
          afterId  = overIdx > 0 ? targetCards[overIdx - 1].id : undefined
          beforeId = targetCards[overIdx].id
        } else {
          // Inserir depois do overCard: afterId = overCard, beforeId = próximo.
          afterId  = targetCards[overIdx].id
          beforeId = overIdx + 1 < targetCards.length ? targetCards[overIdx + 1].id : undefined
        }
      } else {
        // overCard não encontrado na lista → solta no fim da coluna.
        afterId = targetCards[targetCards.length - 1]?.id
      }
    } else {
      // Solto no droppable da coluna (sem card específico) → fim da coluna.
      afterId = targetCards[targetCards.length - 1]?.id
    }

    // ── 3. Snapshot para rollback em caso de erro da API ────────────────────
    const snapshot = [...tasks]

    // ── 4. Optimistic update: move o card no estado imediatamente ───────────
    // O card aparece no destino sem esperar a rede, dando sensação de
    // responsividade instantânea. A position local é uma estimativa — o backend
    // confirma a position real no reload silencioso após o sucesso da API.
    const afterCard  = afterId  ? tasks.find(t => t.id === afterId)  : null
    const beforeCard = beforeId ? tasks.find(t => t.id === beforeId) : null
    const localPos   = midPosition(afterCard, beforeCard)

    setTasks(prev =>
      prev.map(t => t.id === taskId ? { ...t, column_id: targetColId, position: localPos } : t)
    )

    // ── 5. Chamadas de rede (background) ────────────────────────────────────
    try {
      if (targetCol.is_done_column) {
        // Solto na coluna "concluído" → completa a tarefa.
        // Se houver subtarefas abertas, o backend informa (needs_cascade) e
        // pedimos confirmação antes de completar em cascata.
        const r = await kaguyaApi.complete(taskId)
        if (r.needs_cascade) {
          if (!window.confirm(`Concluir ${r.open_subtasks} subtarefa(s) também?`)) {
            // Usuário cancelou a cascata → reverte o card para a posição original.
            setTasks(snapshot)
            return
          }
          await kaguyaApi.complete(taskId, true)
        }
      } else {
        // Solto em coluna comum:
        // a) Se mudou de coluna, atualiza o column_id via PATCH.
        if (task.column_id !== targetColId) {
          await kaguyaApi.updateTask(taskId, { column_id: targetColId })
        }
        // b) Reordena na posição correta dentro da coluna de destino.
        //    Este endpoint existia mas não era chamado pelo Kanban — agora sim.
        await kaguyaApi.reorder(taskId, { after_id: afterId, before_id: beforeId })
      }

      // Reload silencioso (sem spinner) para sincronizar as positions reais
      // que o backend calculou (o optimistic usou estimativas locais).
      // Carga das tarefas respeita a view ativa (filtrada se a view tiver filtro).
      const activeView = views.find(x => x.id === activeViewId)
      const [cols, ts] = await Promise.all([
        kaguyaApi.listColumns(projectId),
        activeView?.filter
          ? kaguyaApi.kanbanViewBoard(activeView.id, projectId)
          : kaguyaApi.listTasks(projectId, false),
      ])
      setColumns(cols.sort((a, b) => a.position - b.position))
      setTasks(ts)
      onChanged() // atualiza a sidebar (contadores de tarefas, etc.)
    } catch {
      // Erro de rede: reverte para o estado antes do drag.
      setTasks(snapshot)
      toast('Falha ao mover o card.', 'err')
    }
  }, [tasks, columns, projectId, onChanged, toast, views, activeViewId])

  // ── Ações de coluna ───────────────────────────────────────────────────────────

  // Copia as colunas de outro board para esta lista (operação no estado vazio).
  // Após sucesso, recarrega o board (agora terá colunas) e avisa o shell via onChanged.
  const copyFrom = async (sourceId: number) => {
    setCopying(true)
    try {
      const r = await kaguyaApi.copyColumns(projectId, sourceId)
      if (r.status === 'error') { toast(r.message ?? 'Não foi possível copiar as colunas.', 'err'); return }
      toast('Colunas copiadas.')
      onChanged()   // atualiza has_board na sidebar
      load()        // recarrega o board com as novas colunas
    } catch {
      toast('Não foi possível copiar as colunas.', 'err')
    } finally {
      setCopying(false)
    }
  }

  // Abre o modal de criar coluna (substitui o window.prompt).
  const addColumn = () => setColumnModal({ mode: 'create' })

  // Abre o modal leve de adicionar tarefa numa coluna (substitui o window.prompt).
  const addTask = (col: Column) => setAddTaskCol(col)

  // ── Renderização ──────────────────────────────────────────────────────────────

  // Spinner apenas no carregamento inicial (firstLoad = true).
  // Mutações e reloads silenciosos não acionam este estado.
  if (firstLoad) return (
    <div className="kg-page">
      <div className="kg-empty">Carregando…</div>
    </div>
  )

  // Sem colunas → convite para criar a primeira (ativa o Kanban).
  // ATENÇÃO: o ColumnModal PRECISA ser renderizado aqui também — este ramo faz early return,
  // então o modal do return principal jamais é montado. Sem isso, clicar em "+ Criar coluna"
  // atualiza o estado mas o modal nunca aparece.
  if (columns.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-page-title"><Icon name="board" size={22} /> {projectName}</h1>
        <div className="kg-empty">
          <div className="kg-empty-title">Sem board ainda</div>
          Crie a primeira coluna para ativar o Kanban desta lista.
          {/* Botão principal: criar colunas do zero, uma a uma */}
          <div style={{ marginTop: 14 }}>
            <button className="kg-btn kg-btn-primary" onClick={addColumn}>+ Criar coluna do zero</button>
          </div>
          {/* Opção de cópia: só aparece se existir pelo menos outro board na instância */}
          {boards.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="kg-field-label">ou copiar de</span>
              <select
                className="kg-select"
                style={{ width: 'auto', minWidth: 160 }}
                value={copySource ?? ''}
                disabled={copying}
                onChange={e => setCopySource(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Escolher board…</option>
                {/* Lista todos os outros boards disponíveis (filtragem feita pelo shell) */}
                {boards.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.icon ? `${b.icon} ` : ''}{b.name}
                  </option>
                ))}
              </select>
              <button
                className="kg-btn"
                disabled={copySource == null || copying}
                onClick={() => copySource != null && copyFrom(copySource)}
              >
                {copying ? 'Copiando…' : 'Copiar'}
              </button>
            </div>
          )}
        </div>

        {/* Modal de criar coluna — necessário aqui porque este early return nunca
            alcança o ColumnModal do return principal abaixo. */}
        {columnModal && (
          <ColumnModal
            mode={columnModal.mode}
            column={columnModal.column}
            projectId={projectId}
            onClose={() => setColumnModal(null)}
            onSaved={load}
            toast={toast}
          />
        )}
      </div>
    )
  }

  // Card ativo: usado pelo DragOverlay para renderizar o "fantasma" que segue o cursor.
  const activeTask = tasks.find(t => t.id === activeId)

  // View ativa → configuração de exibição. Sem view (ou falha ao carregar) cai no
  // default "tudo ligado" (equivale à built-in "Completa") — o board nunca quebra.
  const activeView = views.find(v => v.id === activeViewId) ?? null
  const display: KanbanViewDisplay = activeView?.display ?? {
    adornos: { capacity_meter: true, subtask_ring: true, summary_footer: true, card_chips: true },
    slots: ['abertas', 'tempo_estimado', 'em_andamento'],
  }

  // Conjunto de ids das colunas que EXISTEM neste board — usado no filtro de cards abaixo.
  // Garante que cards com column_id "órfão por divergência" (não-nulo mas sem coluna
  // correspondente nesta lista) apareçam na 1ª coluna em vez de ficarem invisíveis.
  const colIds = new Set(columns.map(c => c.id))

  return (
    <div className="kg-page" style={{ maxWidth: 1320 }}>
      <h1 className="kg-page-title"><Icon name="board" size={22} /> {projectName}</h1>
      <div className="kg-page-sub">arraste entre colunas · soltar em Concluído completa</div>

      {/* Seletor de views (spec 024): troca adornos/slots; a escolha é lembrada por lista */}
      {views.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0' }}>
          <span className="kg-field-label" style={{ marginRight: 2 }}>View</span>
          <select
            className="kg-select"
            style={{ width: 'auto', minWidth: 150 }}
            value={activeViewId ?? ''}
            onChange={e => selectView(Number(e.target.value))}
          >
            {views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button
            className="kg-btn kg-btn-ghost"
            disabled={!activeView}
            title="Editar view"
            onClick={() => activeView && setViewModal({ mode: 'edit', view: activeView })}
          >
            <Icon name="settings" size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Editar
          </button>
          <button className="kg-btn kg-btn-ghost" onClick={() => setViewModal({ mode: 'create' })}>
            <Icon name="plus" size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />View
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Board "Vidro": container com gradiente, fileira de colunas e rodapé-resumo */}
        <div className="kg-board">
          <div className="kcols">
            {columns.map((col, idx) => {
              // Cards desta coluna, ordenados por position para exibição correta.
              // A 1ª coluna também acolhe tarefas órfãs (column_id null) para que
              // nenhuma tarefa suma do board ao trocar de coluna ou ao abrir o Kanban
              // em uma lista que já tinha tarefas sem coluna.
              const isFirst = idx === 0
              const cards = tasks
                .filter(t =>
                  // Pertence normalmente a esta coluna.
                  t.column_id === col.id ||
                  // 1ª coluna captura dois tipos de órfãos:
                  //   • column_id null  → tarefa criada numa lista sem board
                  //   • column_id com id que não existe neste board → card de outra lista
                  //     ou coluna deletada que ficou com id stale no estado local
                  (isFirst && (t.column_id == null || !colIds.has(t.column_id)))
                )
                .sort((a, b) => a.position - b.position)

              return (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  cards={cards}
                  activeId={activeId}
                  isOver={overColId === col.id}
                  projectName={projectName}
                  showCapacity={display.adornos.capacity_meter}
                  showChips={display.adornos.card_chips}
                  showRing={display.adornos.subtask_ring}
                  onOpen={onOpenTask}
                  onAddTask={addTask}
                  onEditColumn={(c) => setColumnModal({ mode: 'edit', column: c })}
                />
              )
            })}

            {/* Botão para adicionar nova coluna ao board (feature do board por-lista) */}
            <button
              className="kg-btn"
              style={{ height: 44, flexShrink: 0, alignSelf: 'flex-start', marginTop: 22 }}
              onClick={addColumn}
            >
              <Icon name="plus" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Coluna
            </button>
          </div>

          {/* Rodapé-resumo (adorno + métricas dos slots vêm da view ativa) */}
          {display.adornos.summary_footer && (
            <SummaryFooter tasks={tasks} columns={columns} slots={display.slots} />
          )}
        </div>

        {/* DragOverlay: card "levantado" que segue o cursor durante o drag.
            Renderizado num portal no topo do DOM — não sofre clipping da coluna.
            Sem backdrop-filter (perf R20): o blur fica só nas colunas estáticas. */}
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="kg-drag-overlay">
              <TaskCard task={activeTask} onOpen={() => {}} projectName={projectName} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal de criar/editar view (spec 024) */}
      {viewModal && (
        <KanbanViewModal
          mode={viewModal.mode}
          view={viewModal.view}
          onClose={() => setViewModal(null)}
          onSaved={loadViews}
          toast={toast}
        />
      )}

      {/* Modal de criar/editar/excluir coluna */}
      {columnModal && (
        <ColumnModal
          mode={columnModal.mode}
          column={columnModal.column}
          projectId={projectId}
          onClose={() => setColumnModal(null)}
          onSaved={load}
          toast={toast}
        />
      )}

      {/* Modal leve de adicionar tarefa na coluna */}
      {addTaskCol && (
        <AddTaskModal
          column={addTaskCol}
          projectId={projectId}
          onClose={() => setAddTaskCol(null)}
          onCreated={() => { load(); onChanged() }}
          toast={toast}
        />
      )}
    </div>
  )
}

// ── Utilitários ───────────────────────────────────────────────────────────────
// midPosition foi centralizado em lib/dnd.ts (compartilhado com Lista e Eisenhower).
// O import está no topo do arquivo.
