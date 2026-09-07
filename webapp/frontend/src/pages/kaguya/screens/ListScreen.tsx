// ListScreen — visão de lista como árvore hierárquica (fatia 025 / Rodada 2).
//
// Casca fina: instancia os controles compartilhados (agrupar / ordenar / filtrar
// por faceta, lembrados por lista) e delega dados + árvore ao `ListSection`.
// Mesmo conjunto de controles do GroupListScreen — a diferença é só o escopo.

import { useState } from 'react'
import type { Task } from '../types'
import { ListSection } from '../components/ListSection'
import { ListToolbar } from '../components/ListToolbar'
import { ListFilterSheet } from '../components/ListFilterSheet'
import { useListControls } from '../lib/listControls'

interface ListScreenProps {
  projectId: number
  projectName: string
  projectColor?: string | null
  reloadKey: number
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ListScreen({
  projectId, projectName, projectColor, reloadKey,
  onOpenTask, onNewTask, toast,
}: ListScreenProps) {
  const controls = useListControls(`list-${projectId}`)
  const [filtersOpen, setFiltersOpen] = useState(false)

  return (
    <div className="kg-page">
      <ListToolbar controls={controls} onOpenFilters={() => setFiltersOpen(true)} />

      <ListSection
        projectId={projectId}
        projectName={projectName}
        projectColor={projectColor}
        reloadKey={reloadKey}
        controls={controls}
        onOpenTask={onOpenTask}
        onNewTask={onNewTask}
        toast={toast}
      />

      {filtersOpen && (
        <ListFilterSheet controls={controls} onClose={() => setFiltersOpen(false)} toast={toast} />
      )}
    </div>
  )
}
