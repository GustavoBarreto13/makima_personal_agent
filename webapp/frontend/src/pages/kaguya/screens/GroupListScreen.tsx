// GroupListScreen — visão de Lista do grupo: uma seção por lista-filha.
//
// Exibe as tarefas de TODAS as listas do grupo como seções empilhadas.
// Cada seção é um `ListSection` independente (busca própria, DnD próprio).
// Uma única toolbar no topo controla o filtro e a ordenação de todas as seções
// simultaneamente — assim "filtros e ordenação" são idênticos aos da ListScreen.
//
// Não há lógica de drag cross-lista: o DnD de aninhar/reordenar funciona apenas
// dentro de cada lista (igual à ListScreen individual), porque o `TaskTreeAPI`
// de cada `ListSection` envia o `project_id` correto ao chamar moveTask/reorder.

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

// Ordenação lembrada POR GRUPO (uma preferência para o board de lista do grupo inteiro).
const readSort = (groupId: number): SortMode => {
  try {
    const v = localStorage.getItem(`kg:grouplist:sort:${groupId}`)
    return (SORT_CYCLE as string[]).includes(v ?? '') ? (v as SortMode) : 'manual'
  } catch { return 'manual' }
}

// ── Props ─────────────────────────────────────────────────────────────────────

// Descrição mínima de uma lista-filha do grupo (vem do sidebar já carregado no shell).
export interface GroupListItem {
  id: number
  name: string
  color: string | null
  icon: string | null
}

export interface GroupListScreenProps {
  groupId: number               // id do grupo (usado no cabeçalho e como chave de escopo)
  groupName: string             // nome do grupo para exibir no cabeçalho
  lists: GroupListItem[]        // listas-filhas do grupo (filtradas e ordenadas pelo shell)
  reloadKey: number             // bump do shell → reload silencioso em todas as seções
  onOpenTask: (task: Task) => void
  onNewTask: (projectId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function GroupListScreen({
  groupId, groupName, lists,
  reloadKey, onOpenTask, onNewTask, toast,
}: GroupListScreenProps) {

  // ── Estado da toolbar (único para todas as seções) ────────────────────────

  // prioFilter: nível mínimo de prioridade (0=tudo, 1=Baixa+, 2=Média+, 3=Alta).
  const [prioFilter, setPrioFilter] = useState(0)

  // showCompleted: visibilidade da seção de concluídas em TODAS as listas.
  const [showCompleted, setShowCompleted] = useState(false)

  // sortMode: ordenação aplicada em TODAS as listas — lembrada por grupo.
  const [sortMode, setSortMode] = useState<SortMode>(() => readSort(groupId))

  // Ao trocar de grupo (groupId muda sem remontar), relê a ordenação salva daquele grupo.
  useEffect(() => { setSortMode(readSort(groupId)) }, [groupId])

  // Cicla a ordenação e persiste a escolha na chave do grupo atual.
  const cycleSort = () => {
    const next = SORT_CYCLE[(SORT_CYCLE.indexOf(sortMode) + 1) % SORT_CYCLE.length]
    setSortMode(next)
    try { localStorage.setItem(`kg:grouplist:sort:${groupId}`, next) } catch { /* ignore */ }
  }

  // ── Estado vazio: grupo sem listas ────────────────────────────────────────

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

  // ── Renderização ──────────────────────────────────────────────────────────

  return (
    <div className="kg-page">

      {/* Cabeçalho: ícone de lista + nome do grupo */}
      <h1 className="kg-page-title">
        <Icon name="list" size={22} /> {groupName}
      </h1>

      {/* Sub-linha: lista das listas-filhas separadas por · */}
      <div className="kg-page-sub" style={{ marginBottom: 4 }}>
        {lists.map((l, i) => (
          <span key={l.id}>
            {l.icon ? `${l.icon} ` : ''}{l.name}
            {i < lists.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </div>

      {/* Toolbar única: controla prioridade + concluídas + ordenação de todas as seções */}
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

        {/* Toggle: mostrar/ocultar concluídas em todas as seções */}
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

      {/* Uma seção por lista-filha do grupo, empilhadas verticalmente.
          Cada seção tem sua própria busca de dados, spinner e DnD internal.
          Os filtros (prioFilter, sortMode, showCompleted) são compartilhados. */}
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
            prioFilter={prioFilter}
            sortMode={sortMode}
            showCompleted={showCompleted}
            onOpenTask={onOpenTask}
            onNewTask={onNewTask}
            toast={toast}
          />
        </div>
      ))}

    </div>
  )
}
