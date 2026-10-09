// Kaguya · Tarefas — shell sobre o AppShell do Design System (spec 075).
// Guarda a rota por hash (/tasks-next#lista/12/t/88), o espaço global (Tudo/Trabalho/Pessoal), os dados da sidebar e as
// ações comuns (abrir a tarefa no painel, concluir com "Desfazer", nova tarefa), que as telas leem pelo contexto.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { getAgent } from '../../design/core/agents'
import { todayISO } from '../../design/core/format'
import { useCommandProvider, type CommandProvider } from '../../design/headless/commands'
import { usePrefs } from '../../design/headless/usePrefs'
import { AppShell, Chip, SegmentedControl, SettingRow, Toggle, toast, type NavGroup } from '../../design'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'
import { kaguyaApi, type Space } from './api'
import { NewTaskModal } from './components/QuickAddBar'
import { ScheduleSettings } from './components/ScheduleSettings'
import { ScreenBoundary } from './components/ScreenBoundary'
import { SearchModal } from './components/SearchModal'
import { TaskDetailPanel } from './components/TaskDetailPanel'
import { DEFAULT_PREFS, KaguyaContext, type KaguyaCtx, type KaguyaPrefs, type NewTaskDefaults } from './context'
import * as act from './lib/actions'
import { DEFAULT_MOBILE_TABS, FIXED_NAV, buildNav, navIdToRoute, routeToNavId, titleFor, type SpaceChoice } from './lib/nav'
import { hashFor, routeFromHash, withTask, type Route } from './lib/routes'
import { useLoad } from './lib/useLoad'
import { DateScreen, FilterScreen, GroupListScreen, GtdScreen, ListScreen } from './screens/ListScreens'
import { Pending } from './screens/Pending'
import { Archived, Logbook, Tags, Templates, Trash } from './screens/Records'
import { Stats } from './screens/Stats'
import { FocusCancelModal, FocusStartModal, FocusWidget } from './components/FocusSession'
import { Eisenhower } from './screens/Eisenhower'
import { Focus } from './screens/Focus'
import { Habits } from './screens/Habits'
import { GroupBoardScreen, KanbanScreen } from './screens/Kanban'
import { Today } from './screens/Today'
import type { Filter, FocusSession, Group, Project, Sidebar, Task } from './types'
import './kaguya-next.css'

const AGENT = getAgent('kaguya')

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'shuchiin', label: 'Shuchiin aristocrático' }]
const NO_PROJECTS: Project[] = []
const NO_GROUPS: Group[] = []
const NO_FILTERS: Filter[] = []
const NO_TASKS: Task[] = []

type Dialog =
  | { kind: 'new'; defaults?: NewTaskDefaults } | { kind: 'search'; q: string } | { kind: 'focus'; task?: Task; habitId?: number } | { kind: 'focus-cancel' } | null

const SPACE_OPTIONS: { value: SpaceChoice; label: string; icon: 'apps' | 'work' | 'personal' }[] = [
  { value: 'all', label: 'Tudo', icon: 'apps' }, { value: 'work', label: 'Trabalho', icon: 'work' }, { value: 'personal', label: 'Pessoal', icon: 'personal' },
]

/** Telas ainda não migradas (viram `Pending` até a fase de cada uma). */
const PENDING: Record<string, string> = {
  calendar: 'O calendário',
  goals: 'Metas', experiments: 'Experimentos',
}

export function KaguyaNextShell() {
  useDocumentTitle(AGENT_TABS.kaguya.title, AGENT_TABS.kaguya.icon)
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs<KaguyaPrefs>('kaguya', { ...DEFAULT_PREFS, art: AGENT.art ?? DEFAULT_PREFS.art })
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [rev, setRev] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const reload = useCallback(() => setRev((n) => n + 1), [])
  const space: Space | undefined = prefs.space === 'all' ? undefined : prefs.space

  const { state: sidebarState, retry: retrySidebar } = useLoad(() => kaguyaApi.sidebar(), [rev])
  const sidebar: Sidebar | null = sidebarState.status === 'ok' ? sidebarState.data : null
  const projects = sidebar?.projects ?? NO_PROJECTS
  const groups = sidebar?.groups ?? NO_GROUPS
  const filters = sidebar?.filters ?? NO_FILTERS
  const { state: countsState } = useLoad(() => kaguyaApi.viewCounts(space), [rev, space])
  // Índice local das tarefas abertas: alimenta a paleta (Ctrl+K), que busca de forma síncrona.
  const { state: indexState } = useLoad(() => kaguyaApi.viewTasks('all', space), [rev, space])
  const index = indexState.status === 'ok' ? indexState.data : NO_TASKS

  const projectNames = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])
  const inboxId = projects.find((p) => p.is_inbox)?.id

  // Voltar/avançar do navegador (popstate) e links com #… (hashchange) trocam de tela.
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash) }
  }, [])

  // Navegar grava no histórico (pushState): o Voltar volta à tela anterior.
  const goto = useCallback((to: Route) => {
    setRoute(to)
    const h = `#${hashFor(to)}`
    if (window.location.hash !== h) window.history.pushState(window.history.state, '', `${window.location.pathname}${h}`)
  }, [])
  const openTask = useCallback((id: number | undefined) => goto(withTask(route, id)), [goto, route])

  // Foco (Pomodoro): a sessão ativa vive no servidor; aqui só se lê (ao montar, ao iniciar e a cada 30s, para pegar
  // a que o servidor fechou por abandono). O relógio do widget deriva de `started_at`, nunca do zero.
  const [activeFocus, setActiveFocus] = useState<FocusSession | null>(null)
  const loadActiveFocus = useCallback(async () => {
    try { setActiveFocus(await kaguyaApi.focus.active()) } catch { /* o widget só some */ }
  }, [])
  useEffect(() => { void loadActiveFocus() }, [loadActiveFocus])
  useEffect(() => {
    if (!activeFocus) return
    const id = setInterval(() => { void loadActiveFocus() }, 30000)
    return () => clearInterval(id)
  }, [activeFocus, loadActiveFocus])
  const startFocus = useCallback((target: { task?: Task; habitId?: number }) => setDialog({ kind: 'focus', ...target }), [])
  const finishFocus = async () => {
    if (!activeFocus) return
    try {
      const r = await kaguyaApi.focus.finish(activeFocus.id)
      setActiveFocus(null)
      reload()
      toast(r.session?.habit_checked_in ? 'Sessão concluída — check-in do hábito registrado.' : 'Sessão concluída.', { tone: 'success' })
    } catch (e) { toast(e instanceof Error && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível concluir a sessão.', { tone: 'error' }) }
  }

  const toggleComplete = useCallback((t: Task) => act.toggleComplete({ reload }, t), [reload])
  const newTask = useCallback((defaults?: NewTaskDefaults) => setDialog({ kind: 'new', defaults }), [])

  const ctx = useMemo<KaguyaCtx>(() => ({
    rev, reload, today, route, goto, openTask, prefs, setPrefs, space, projects, groups, filters, sidebarState, retrySidebar,
    projectNames, inboxId, newTask, startFocus, toggleComplete,
  }), [rev, reload, today, route, goto, openTask, prefs, setPrefs, space, projects, groups, filters, sidebarState, retrySidebar, projectNames, inboxId, newTask, startFocus, toggleComplete])

  // Paleta Ctrl+K: busca tarefas abertas no índice local e ABRE a escolhida (Enter nunca cria — o bug do shell antigo).
  const provider = useMemo<CommandProvider>(() => ({
    id: 'kaguya.tasks',
    search: (q) => {
      const n = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      if (n.length < 2) return []
      return index
        .filter((t) => `${t.title} ${t.project_name ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(n))
        .slice(0, 8)
        .map((t) => ({ id: `task:${t.id}`, label: t.project_name ? `${t.title} · ${t.project_name}` : t.title, group: 'Tarefas', icon: 'task', run: () => openTask(t.id) }))
    },
  }), [index, openTask])
  useCommandProvider(provider)

  const nav: NavGroup[] = useMemo(() => buildNav({
    projects, groups, filters, counts: countsState.status === 'ok' ? countsState.data : null,
    space: prefs.space, hidden: prefs.hiddenNav, pinned: prefs.pinnedNav,
  }), [projects, groups, filters, countsState, prefs.space, prefs.hiddenNav, prefs.pinnedNav])

  const screen = ((): ReactElement => {
    switch (route.view) {
      case 'today': return <Today />
      case 'list': return route.id !== undefined ? <ListScreen id={route.id} /> : <Today />
      case 'date': return <DateScreen dateKey={(route.key ?? 'all') as Parameters<typeof DateScreen>[0]['dateKey']} />
      case 'gtd': return <GtdScreen gtdKey={route.key ?? 'next-actions'} />
      case 'filter': return route.id !== undefined ? <FilterScreen id={route.id} /> : <Today />
      case 'kanban': return route.id !== undefined ? <KanbanScreen projectId={route.id} /> : <Today />
      case 'group-list': return route.id !== undefined ? <GroupListScreen id={route.id} /> : <Today />
      case 'group': return route.id !== undefined ? <GroupBoardScreen groupId={route.id} /> : <Today />
      case 'eisenhower': return <Eisenhower />
      case 'focus': return <Focus />
      case 'habits': return <Habits />
      case 'stats': return <Stats />
      case 'logbook': return <Logbook />
      case 'trash': return <Trash />
      case 'archived': return <Archived />
      case 'templates': return <Templates />
      case 'tags': return <Tags />
      default: return <Pending name={PENDING[route.view] ?? 'Esta tela'} />
    }
  })()

  const togglePref = (list: 'hiddenNav' | 'pinnedNav', id: string) => {
    const cur = prefs[list]
    setPrefs({ [list]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<KaguyaPrefs>)
  }
  const panelOpen = route.taskId !== undefined

  return (
    <KaguyaContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'kaguya', name: AGENT.name, subtitle: 'Tarefas · Agenda', portrait: AGENT.portrait }}
        nav={nav}
        active={routeToNavId(route)}
        onNavigate={(id) => goto(navIdToRoute(id))}
        mobileTabs={prefs.mobileTabs.length ? prefs.mobileTabs : DEFAULT_MOBILE_TABS}
        primary={{ label: 'Nova tarefa', icon: 'add', key: 'n', onClick: () => newTask({ projectId: route.view === 'list' ? route.id : undefined }) }}
        title={titleFor(route, projects, groups, filters)}
        subtitle={prefs.space === 'all' ? undefined : prefs.space === 'work' ? 'Espaço: Trabalho' : 'Espaço: Pessoal'}
        search={{ placeholder: 'Buscar tarefas…', onSubmit: (q) => setDialog({ kind: 'search', q }) }}
        onGoAgent={(to) => navigate(to)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        topbarExtra={
          <SegmentedControl
            label="Espaço"
            value={prefs.space}
            options={SPACE_OPTIONS}
            onChange={(v) => setPrefs({ space: v })}
          />
        }
        commands={[
          { id: 'kaguya.new', label: 'Nova tarefa', icon: 'add', keywords: 'criar adicionar tarefa', run: () => newTask() },
          { id: 'kaguya.focus', label: 'Iniciar foco', icon: 'timer', keywords: 'pomodoro concentrar', run: () => startFocus({}) },
          { id: 'kaguya.today', label: 'Ir para o Meu Dia', icon: 'sun', run: () => goto({ view: 'today' }) },
          { id: 'kaguya.search', label: 'Buscar tarefas (inclui concluídas)', icon: 'search', keywords: 'procurar', run: () => setDialog({ kind: 'search', q: '' }) },
          { id: 'kaguya.space.work', label: 'Espaço: só Trabalho', icon: 'work', run: () => setPrefs({ space: 'work' }) },
          { id: 'kaguya.space.personal', label: 'Espaço: só Pessoal', icon: 'personal', run: () => setPrefs({ space: 'personal' }) },
          { id: 'kaguya.space.all', label: 'Espaço: Tudo', icon: 'apps', run: () => setPrefs({ space: 'all' }) },
        ]}
        preferences={
          <>
            <SettingRow title="Espaço" help="Filtra TODAS as telas: o que é de Trabalho e o que é Pessoal. O espaço de uma lista vem da própria lista (ou do grupo dela).">
              <SegmentedControl label="Espaço" value={prefs.space} options={SPACE_OPTIONS} onChange={(v) => setPrefs({ space: v })} />
            </SettingRow>
            <SettingRow title="Meu Dia" help="Com “Tudo”, divide em Trabalho e Pessoal ou mostra numa lista só.">
              <SegmentedControl label="Layout do Meu Dia" value={prefs.daySplit} options={[{ value: 'split', label: 'Dividido' }, { value: 'single', label: 'Único' }]} onChange={(v) => setPrefs({ daySplit: v })} />
            </SettingRow>
            <SettingRow title="Concluídas no fim da lista"><Toggle checked={prefs.showCompleted} onChange={(v) => setPrefs({ showCompleted: v })} label="Mostrar concluídas" /></SettingRow>
            <SettingRow title="Detalhes na linha" help="Notas e etiquetas ao lado do título."><Toggle checked={prefs.showDetails} onChange={(v) => setPrefs({ showDetails: v })} label="Mostrar detalhes" /></SettingRow>
            <SettingRow title="Menu lateral" help="Esconda o que não usa ou fixe no topo. Vale para o desktop e para o celular.">
              <div className="kn-navprefs">
                {FIXED_NAV.map((s) => (
                  <div key={s.section}>
                    <b className="kn-h3">{s.section}</b>
                    <div className="kn-chips">
                      {s.items.map((i) => (
                        <span key={i.id} className="kn-navpref">
                          <Chip on={!prefs.hiddenNav.includes(i.id)} aria-pressed={!prefs.hiddenNav.includes(i.id)} onClick={() => togglePref('hiddenNav', i.id)}>{i.label}</Chip>
                          <Chip on={prefs.pinnedNav.includes(i.id)} icon="pin" aria-pressed={prefs.pinnedNav.includes(i.id)} aria-label={`Fixar ${i.label}`} onClick={() => togglePref('pinnedNav', i.id)} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SettingRow>
            <SettingRow title="Agenda" help="Expediente, almoço e sono definem seu tempo livre (do trabalho e geral). O digest só fala de trabalho nos dias de trabalho.">
              <ScheduleSettings />
            </SettingRow>
          </>
        }
      >
        <div className={`kn-split${panelOpen ? ' kn-with-panel' : ''}`}>
          <div className="kn-main-col">
            <ScreenBoundary resetKey={hashFor(withTask(route, undefined))} onHome={() => goto({ view: 'today' })}>{screen}</ScreenBoundary>
          </div>
          {panelOpen && route.taskId !== undefined && (
            <ScreenBoundary resetKey={String(route.taskId)} onHome={() => openTask(undefined)}>
              <TaskDetailPanel key={route.taskId} taskId={route.taskId} onClose={() => openTask(undefined)} />
            </ScreenBoundary>
          )}
        </div>
        {dialog?.kind === 'new' && <NewTaskModal defaults={dialog.defaults} onClose={() => setDialog(null)} />}
        {dialog?.kind === 'focus' && <FocusStartModal task={dialog.task} habitId={dialog.habitId} onClose={() => setDialog(null)} onStarted={() => { void loadActiveFocus() }} />}
        {dialog?.kind === 'focus-cancel' && activeFocus && (
          <FocusCancelModal
            sessionId={activeFocus.id}
            elapsedMin={Math.max(0, Math.floor((Date.now() - new Date(activeFocus.started_at).getTime()) / 60000))}
            onClose={() => setDialog(null)}
            onCancelled={() => { setActiveFocus(null); reload() }}
          />
        )}
        {activeFocus && <FocusWidget session={activeFocus} onFinish={() => void finishFocus()} onCancel={() => setDialog({ kind: 'focus-cancel' })} />}
        {dialog?.kind === 'search' && <SearchModal initial={dialog.q} onClose={() => setDialog(null)} />}
      </AppShell>
    </KaguyaContext.Provider>
  )
}

