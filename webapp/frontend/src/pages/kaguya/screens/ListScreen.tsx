// ListScreen — visão de lista como árvore hierárquica (fatia 025).
//
// Casca fina: gerencia a toolbar (prioridade + ordenação + mostrar concluídas)
// e delega toda a lógica de dados e a árvore para `ListSection`.
//
// Refatorado para permitir reutilização por GroupListScreen (que precisa de uma
// única toolbar para N ListSections). O comportamento visível é idêntico ao anterior.

import { useState, useEffect } from 'react'
import type { Task } from '../types'
import { Icon } from '../ui/Icons'
import { ListSection } from '../components/ListSection'

// ── Tipos internos ────────────────────────────────────────────────────────────

type SortMode = 'manual' | 'due' | 'prio'

const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Manual',
  due:    'Vencimento',
  prio:   'Prioridade',
}

const SORT_CYCLE: SortMode[] = ['manual', 'due', 'prio']

// Ordenação é lembrada POR LISTA em localStorage (o shell não remonta a ListScreen
// ao trocar de lista, só muda o prop projectId — por isso há também um useEffect).
const readSort = (projectId: number): SortMode => {
  try {
    const v = localStorage.getItem(`kg:list:sort:${projectId}`)
    return (SORT_CYCLE as string[]).includes(v ?? '') ? (v as SortMode) : 'manual'
  } catch { return 'manual' }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ListScreenProps {
  projectId: number
  projectName: string
  projectColor?: string | null
  reloadKey: number              // incrementa no shell após salvar modal → re-fetch silencioso
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ListScreen({
  projectId, projectName, projectColor, reloadKey,
  onOpenTask, onNewTask, toast,
}: ListScreenProps) {

  // ── Estado da toolbar ─────────────────────────────────────────────────────

  // prioFilter: nível mínimo de prioridade exibido (0 = todos, 1 = Baixa+, 2 = Média+, 3 = Alta).
  const [prioFilter, setPrioFilter] = useState(0)

  // showCompleted: controla a visibilidade da seção de concluídas na árvore.
  const [showCompleted, setShowCompleted] = useState(false)

  // sortMode: ordenação aplicada em cada nível da árvore — lembrada por lista.
  const [sortMode, setSortMode] = useState<SortMode>(() => readSort(projectId))

  // Ao trocar de lista (projectId muda sem remontar), relê a ordenação salva daquela lista.
  useEffect(() => { setSortMode(readSort(projectId)) }, [projectId])

  // Cicla a ordenação e persiste a escolha na chave da lista atual.
  const cycleSort = () => {
    const next = SORT_CYCLE[(SORT_CYCLE.indexOf(sortMode) + 1) % SORT_CYCLE.length]
    setSortMode(next)
    try { localStorage.setItem(`kg:list:sort:${projectId}`, next) } catch { /* ignore */ }
  }

  // ── Renderização ──────────────────────────────────────────────────────────

  return (
    <div className="kg-page">

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

        {/* Separador visual */}
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
          onClick={cycleSort}
        >
          <Icon name="sort" size={13} />
          {SORT_LABELS[sortMode]}
        </button>
      </div>

      {/* Seção da lista — delega dados, callbacks e renderização ao ListSection */}
      <ListSection
        projectId={projectId}
        projectName={projectName}
        projectColor={projectColor}
        reloadKey={reloadKey}
        prioFilter={prioFilter}
        sortMode={sortMode}
        showCompleted={showCompleted}
        onOpenTask={onOpenTask}
        onNewTask={onNewTask}
        toast={toast}
      />

    </div>
  )
}
