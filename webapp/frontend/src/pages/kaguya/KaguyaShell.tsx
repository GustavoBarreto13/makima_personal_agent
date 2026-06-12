// KaguyaShell — raiz do shell de tarefas (guia §1/§5). Orquestra: tweaks
// (tema/acento/densidade/pmark/anim, persistidos), sidebar, navegação interna
// por estado {view, param} (sem React Router), modais, busca e toast.

import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import './kaguya.css'

import type { Sidebar, Task, Tweaks, KaguyaView, Filter } from './types'
import { BUILTIN_TODAY_OVERDUE } from './types'
import { kaguyaApi } from './kaguyaApi'

import { SidebarNav } from './components/SidebarNav'
import { TaskRow } from './components/TaskRow'
import { Toast } from './components/Toast'
import { TweaksPanel } from './TweaksPanel'
import { TaskModal } from './modals/TaskModal'
import { ProjectModal } from './modals/ProjectModal'
import { GroupModal } from './modals/GroupModal'
import { FilterModal } from './modals/FilterModal'
import { TodayScreen } from './screens/TodayScreen'
import { ListScreen } from './screens/ListScreen'
import { KanbanScreen } from './screens/KanbanScreen'
import { TrashScreen } from './screens/TrashScreen'
import { FilterScreen } from './screens/FilterScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { Icon } from './ui/Icons'

// Tweaks padrão (acento azul, claro, confortável, traço, animações ligadas).
const DEFAULT_TWEAKS: Tweaks = { theme: 'light', accent: 'blue', density: 'confortavel', pmark: 'bar', anim: 'on' }

// PALETTE_MAP — sobrescreve os tokens --kg* por acento (guia §2.4). null = default azul (CSS).
const PALETTE_MAP: Record<Tweaks['accent'], Record<string, string> | null> = {
  blue: null,
  pink: { '--kg': 'oklch(0.64 0.21 4)', '--kg-deep': 'oklch(0.55 0.21 6)', '--kg-bright': 'oklch(0.74 0.18 2)', '--kg-tint': 'oklch(0.64 0.21 4 / 0.12)', '--kg-tint-2': 'oklch(0.64 0.21 4 / 0.22)' },
  violet: { '--kg': 'oklch(0.60 0.20 292)', '--kg-deep': 'oklch(0.52 0.20 294)', '--kg-bright': 'oklch(0.70 0.17 290)', '--kg-tint': 'oklch(0.60 0.20 292 / 0.12)', '--kg-tint-2': 'oklch(0.60 0.20 292 / 0.22)' },
  gold: { '--kg': 'oklch(0.74 0.13 85)', '--kg-deep': 'oklch(0.64 0.13 82)', '--kg-bright': 'oklch(0.82 0.12 88)', '--kg-tint': 'oklch(0.74 0.13 85 / 0.14)', '--kg-tint-2': 'oklch(0.74 0.13 85 / 0.24)' },
}

export function KaguyaShell() {
  // ── Tweaks (carregados do localStorage) ──
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    try { return { ...DEFAULT_TWEAKS, ...JSON.parse(localStorage.getItem('kg-tweaks') || '{}') } }
    catch { return DEFAULT_TWEAKS }
  })
  const patchTweaks = (patch: Partial<Tweaks>) => {
    const next = { ...tweaks, ...patch }
    setTweaks(next)
    localStorage.setItem('kg-tweaks', JSON.stringify(next))
  }

  // ── Dados e navegação ──
  const [sidebar, setSidebar] = useState<Sidebar | null>(null)
  const [view, setView] = useState<KaguyaView>('today')
  const [param, setParam] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ── UI ──
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [taskModal, setTaskModal] = useState<{ mode: 'create' | 'edit'; task?: Task; projectId?: number | null } | null>(null)
  const [projectModal, setProjectModal] = useState<{ mode: 'create' | 'edit'; project?: import('./types').Project } | null>(null)
  const [groupModal, setGroupModal] = useState<{ mode: 'create' | 'edit'; group?: import('./types').Group } | null>(null)
  const [filterModal, setFilterModal] = useState<{ mode: 'create' | 'edit'; filter?: Filter } | null>(null)
  const [toast, setToast] = useState<{ msg: string; kind?: 'ok' | 'err' } | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Task[] | null>(null)

  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => setToast({ msg, kind }), [])
  const bump = () => setReloadKey((k) => k + 1)

  // Busca a sidebar (lista, contagens). Re-chamada após mutações estruturais.
  const loadSidebar = useCallback(async () => {
    try { setSidebar(await kaguyaApi.sidebar()) } catch { showToast('Falha ao carregar a sidebar.', 'err') }
  }, [showToast])
  useEffect(() => { loadSidebar() }, [loadSidebar])

  const inboxId = sidebar?.projects.find((p) => p.is_inbox)?.id ?? null

  // Navegação: views que precisam de uma lista caem no Inbox quando sem param.
  const navigate = (v: KaguyaView, p: number | null = null) => {
    setSearchResults(null)
    if ((v === 'list' || v === 'kanban') && p == null) p = inboxId
    setView(v); setParam(p)
  }

  // Atalho de teclado: C = nova tarefa (foco fora de inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); openNewTask() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, param, inboxId])

  const openNewTask = () => setTaskModal({ mode: 'create', projectId: view === 'list' ? param : null })
  const afterSave = () => { loadSidebar(); bump() }

  const runSearch = async () => {
    if (!search.trim()) { setSearchResults(null); return }
    try { setSearchResults(await kaguyaApi.search(search.trim())) } catch { showToast('Falha na busca.', 'err') }
  }

  // Título e nome da lista atual.
  const project = param != null ? sidebar?.projects.find((p) => p.id === param) : undefined
  // Smart-list atual (view='filter'): a built-in tem nome fixo; as salvas vêm da sidebar.
  const currentFilter = view === 'filter' && param != null && param !== BUILTIN_TODAY_OVERDUE
    ? sidebar?.filters.find((f) => f.id === param) : undefined
  const filterName = param === BUILTIN_TODAY_OVERDUE ? 'Hoje + Vencidas' : (currentFilter?.name ?? 'Smart list')
  const titleMap: Record<KaguyaView, string> = {
    today: 'Meu Dia', kanban: project?.name ?? 'Kanban', list: project?.name ?? 'Lista',
    calendar: 'Calendário', eisenhower: 'Eisenhower', habits: 'Hábitos', trash: 'Lixeira',
    filter: filterName,
  }

  // Estilo do root: data-attrs (tema/densidade/pmark/anim) + acento via PALETTE_MAP.
  const animOff = tweaks.anim === 'off'
  const rootStyle: CSSProperties = { ...(PALETTE_MAP[tweaks.accent] ?? {}) } as CSSProperties

  // Conteúdo da área principal.
  const renderMain = () => {
    if (searchResults) {
      return (
        <div className="kg-page">
          <h1 className="kg-page-title"><Icon name="search" size={22} /> Busca</h1>
          <div className="kg-page-sub">{searchResults.length} resultado(s) para "{search}"</div>
          <div className="kg-list">
            {searchResults.map((t) => (
              <TaskRow key={t.id} task={t} showProject onToggle={async (task) => { await kaguyaApi.complete(task.id); runSearch(); bump() }} onOpen={(task) => setTaskModal({ mode: 'edit', task })} onRename={async (task, title) => { await kaguyaApi.updateTask(task.id, { title }); runSearch() }} />
            ))}
          </div>
        </div>
      )
    }
    if (view === 'today') return <TodayScreen projects={sidebar?.projects ?? []} reloadKey={reloadKey} onChanged={loadSidebar} onOpenTask={(t) => setTaskModal({ mode: 'edit', task: t })} toast={showToast} />
    if (view === 'list' && param != null) return <ListScreen projectId={param} projectName={titleMap.list} reloadKey={reloadKey} onOpenTask={(t) => setTaskModal({ mode: 'edit', task: t })} onNewTask={(pid) => setTaskModal({ mode: 'create', projectId: pid })} toast={showToast} />
    if (view === 'kanban' && param != null) return <KanbanScreen projectId={param} projectName={titleMap.kanban} reloadKey={reloadKey} onOpenTask={(t) => setTaskModal({ mode: 'edit', task: t })} onChanged={loadSidebar} toast={showToast} />
    if (view === 'calendar') return <CalendarScreen reloadKey={reloadKey} onOpenTask={(t) => setTaskModal({ mode: 'edit', task: t })} toast={showToast} />
    if (view === 'filter' && param != null) return (
      <FilterScreen
        filterId={param}
        filterName={filterName}
        reloadKey={reloadKey}
        onOpenTask={(t) => setTaskModal({ mode: 'edit', task: t })}
        onEditFilter={currentFilter ? () => setFilterModal({ mode: 'edit', filter: currentFilter }) : undefined}
        toast={showToast}
      />
    )
    if (view === 'trash') return <TrashScreen toast={showToast} />
    // Views ainda não construídas (fases futuras)
    return (
      <div className="kg-page"><div className="kg-empty">
        <div className="kg-empty-title">Em breve</div>
        {view === 'eisenhower' && 'A matriz de Eisenhower chega numa fase futura.'}
        {view === 'habits' && 'Os Hábitos chegam na Fase 4.'}
      </div></div>
    )
  }

  return (
    <div
      className="kg-app"
      data-theme={tweaks.theme}
      data-density={tweaks.density}
      data-pmark={tweaks.pmark}
      data-anim={animOff ? 'off' : 'on'}
      style={rootStyle}
    >
      <div className="kg-shell">
        <SidebarNav
          sidebar={sidebar}
          view={view}
          param={param}
          onNavigate={navigate}
          onNewTask={openNewTask}
          onNewProject={() => setProjectModal({ mode: 'create' })}
          onNewGroup={() => setGroupModal({ mode: 'create' })}
          onEditGroup={(group) => setGroupModal({ mode: 'edit', group })}
          onNewFilter={() => setFilterModal({ mode: 'create' })}
          onOpenTweaks={() => setTweaksOpen(true)}
        />

        <div className="kg-main">
          <div className="kg-topbar">
            <span className="kg-topbar-title">{titleMap[view]}</span>

            {/* alternador Lista ⇄ Kanban quando se está numa lista */}
            {(view === 'list' || view === 'kanban') && param != null && (
              <div className="kg-segment" style={{ width: 180 }}>
                <button className={`kg-seg-opt${view === 'list' ? ' active' : ''}`} onClick={() => navigate('list', param)}>Lista</button>
                <button className={`kg-seg-opt${view === 'kanban' ? ' active' : ''}`} onClick={() => navigate('kanban', param)}>Kanban</button>
              </div>
            )}
            {/* editar a lista atual */}
            {view === 'list' && project && !project.is_inbox && (
              <button className="kg-icon-btn" onClick={() => setProjectModal({ mode: 'edit', project })} aria-label="Editar lista"><Icon name="settings" size={15} /></button>
            )}

            <div className="kg-search">
              <Icon name="search" size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') { setSearch(''); setSearchResults(null) } }}
                placeholder="Buscar tarefas…"
              />
            </div>
          </div>

          <div className="kg-scroll">{renderMain()}</div>
        </div>
      </div>

      {/* Painel de tweaks */}
      {tweaksOpen && <TweaksPanel tweaks={tweaks} onChange={patchTweaks} onClose={() => setTweaksOpen(false)} />}

      {/* Modais */}
      {taskModal && (
        <TaskModal
          mode={taskModal.mode}
          task={taskModal.task}
          projects={sidebar?.projects ?? []}
          defaultProjectId={taskModal.projectId}
          onClose={() => setTaskModal(null)}
          onSaved={afterSave}
          toast={showToast}
        />
      )}
      {projectModal && (
        <ProjectModal
          mode={projectModal.mode}
          project={projectModal.project}
          groups={sidebar?.groups ?? []}
          onClose={() => setProjectModal(null)}
          onSaved={() => { afterSave(); if (projectModal.mode === 'edit') navigate('today') }}
          toast={showToast}
        />
      )}
      {groupModal && (
        <GroupModal
          mode={groupModal.mode}
          group={groupModal.group}
          onClose={() => setGroupModal(null)}
          onSaved={afterSave}
          toast={showToast}
        />
      )}
      {filterModal && (
        <FilterModal
          mode={filterModal.mode}
          filter={filterModal.filter}
          projects={sidebar?.projects ?? []}
          onClose={() => setFilterModal(null)}
          // Após salvar/excluir, recarrega a sidebar (e as views). Se a smart-list aberta
          // foi excluída, volta para "Meu Dia" para não ficar numa view órfã.
          onSaved={() => { afterSave(); if (filterModal.mode === 'edit') navigate('today') }}
          toast={showToast}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  )
}
