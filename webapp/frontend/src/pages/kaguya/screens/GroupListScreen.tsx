// GroupListScreen — visão de Lista do grupo: uma seção por lista-filha.
//
// Exibe as tarefas de TODAS as listas do grupo como seções empilhadas. Uma única
// toolbar (agrupar / ordenar / filtrar por faceta) no topo controla todas as
// seções simultaneamente — idêntica à da ListScreen individual, só com escopo
// por grupo. Fatia 025 / Rodada 2.
//
// Não há drag cross-lista: o DnD de aninhar/reordenar funciona só dentro de cada
// lista (o `TaskTreeAPI` de cada `ListSection` envia o `project_id` correto).

import { useState } from 'react'
import type { Task } from '../types'
import { Icon } from '../ui/Icons'
import { ListSection } from '../components/ListSection'
import { ListToolbar } from '../components/ListToolbar'
import { ListFilterSheet } from '../components/ListFilterSheet'
import { useListControls } from '../lib/listControls'

// Descrição mínima de uma lista-filha do grupo (vem do sidebar já carregado no shell).
export interface GroupListItem {
  id: number
  name: string
  color: string | null
  icon: string | null
}

export interface GroupListScreenProps {
  groupId: number
  groupName: string
  lists: GroupListItem[]
  reloadKey: number
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function GroupListScreen({
  groupId, groupName, lists,
  reloadKey, onOpenTask, onNewTask, toast,
}: GroupListScreenProps) {
  const controls = useListControls(`grouplist-${groupId}`)
  const [filtersOpen, setFiltersOpen] = useState(false)

  if (lists.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-page-title">
          <Icon name="list" size={22} /> {groupName}
        </h1>
        <div className="kg-empty">
          <div className="kg-empty-title">Grupo vazio</div>
          Adicione listas a este grupo pela sidebar para ver as tarefas aqui.
        </div>
      </div>
    )
  }

  return (
    <div className="kg-page">
      <h1 className="kg-page-title">
        <Icon name="list" size={22} /> {groupName}
      </h1>

      <div className="kg-page-sub" style={{ marginBottom: 4 }}>
        {lists.map((l, i) => (
          <span key={l.id}>
            {l.icon ? `${l.icon} ` : ''}{l.name}
            {i < lists.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </div>

      <ListToolbar controls={controls} onOpenFilters={() => setFiltersOpen(true)} />

      {lists.map((list, idx) => (
        <div
          key={list.id}
          style={idx > 0 ? { marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)' } : undefined}
        >
          <ListSection
            projectId={list.id}
            projectName={list.name}
            projectColor={list.color}
            reloadKey={reloadKey}
            controls={controls}
            onOpenTask={onOpenTask}
            onNewTask={onNewTask}
            toast={toast}
          />
        </div>
      ))}

      {filtersOpen && (
        <ListFilterSheet controls={controls} onClose={() => setFiltersOpen(false)} toast={toast} />
      )}
    </div>
  )
}
