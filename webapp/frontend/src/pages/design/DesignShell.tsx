// /design — referência viva do Design System Makima, com um agente FICTÍCIO (Hayate, treinos).
// Tudo aqui usa só src/design/. Nada vem do backend. Serve para ver o padrão (e testá-lo) antes de
// migrar um agente real. Escolha de estilo de arte, tema e celular ficam à mão.

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { createWorkouts, demoNavToast, TYPE_META, workoutFromCapture, type Workout } from './demoData'
import { fmtRelative, todayISO } from '../../design/core/format'
import type { CaptureResult } from '../../design/core/capture'
import { confirm } from '../../design/headless/confirm'
import { toast } from '../../design/headless/toast'
import { usePrefs } from '../../design/headless/usePrefs'
import { useCommandProvider, type CommandProvider } from '../../design/headless/commands'
import { AppShell, SegmentedControl, SettingRow, Toggle, type NavGroup } from '../../design'
import { ComponentsView } from './views/Components'
import { HomeView } from './views/Home'
import { StatsView } from './views/Stats'
import { WorkoutForm, type WorkoutDraft } from './views/WorkoutForm'
import { WorkoutsView } from './views/Workouts'
import './design-page.css'

type View = 'home' | 'workouts' | 'stats' | 'comp'

const NAV: NavGroup[] = [
  { label: 'Treinos', items: [{ id: 'home', label: 'Início', icon: 'home', key: 'h' }, { id: 'workouts', label: 'Treinos', icon: 'workout', key: 't' }, { id: 'stats', label: 'Estatísticas', icon: 'stats', key: 'e' }] },
  { label: 'Biblioteca do padrão', items: [{ id: 'comp', label: 'Componentes', icon: 'apps' }] },
]

const TITLES: Record<View, string> = { home: 'Início', workouts: 'Treinos', stats: 'Estatísticas', comp: 'Componentes' }

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'caderno', label: 'Caderno' }, { value: 'nautica', label: 'Carta náutica' }]

export function DesignShell() {
  const today = useMemo(() => todayISO(), [])
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState<Workout[]>(() => createWorkouts(today))
  const [view, setView] = useState<View>('home')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [tab, setTab] = useState('overview')
  const [form, setForm] = useState<{ id: number | null; prefill: CaptureResult | null } | null>(null)
  const [query, setQuery] = useState<{ q: string; nonce: number } | null>(null)
  const [art, setArt] = useState('default')
  const [phone, setPhone] = useState(false)
  const [prefs, setPrefs] = usePrefs('hayate', { pr: true, kcal: false })

  const go = useCallback((v: string) => { setView(v as View); setDetailId(null) }, [])
  const open = useCallback((id: number) => { setView('workouts'); setDetailId(id); setTab('overview') }, [])

  const add = useCallback((w: Workout) => {
    setWorkouts((cur) => [w, ...cur].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))
    toast(`Treino registrado: ${w.title}`, { undo: () => setWorkouts((cur) => cur.filter((x) => x.id !== w.id)) })
  }, [])

  const capture = useCallback((r: CaptureResult): boolean => { add(workoutFromCapture(r, today)); return true }, [add, today])
  const expand = useCallback((r: CaptureResult) => setForm({ id: null, prefill: r }), [])

  const save = (d: WorkoutDraft) => {
    if (form?.id) {
      setWorkouts((cur) => cur.map((w) => (w.id === form.id ? { ...w, title: d.title, type: d.type, date: d.date, mins: d.mins, place: d.place, rating: d.rating, tags: d.tags, status: d.date > today ? 'planned' : 'done' } : w)))
      toast('Treino atualizado')
    } else {
      const w = workoutFromCapture({ text: '', segments: [], tokens: [], fields: { title: d.title, place: d.place, people: [], tags: d.tags, priority: null, dueDate: d.date, dueTime: null, recur: null, rating: d.rating || null, amount: null, progress: null, sets: null, load: null, distance: null, duration: d.mins, installments: null, income: false } }, today)
      add({ ...w, type: d.type })
    }
    setForm(null)
  }

  const remove = async (w: Workout) => {
    if (!(await confirm({ title: 'Excluir este treino?', body: 'Ele sai do histórico e das estatísticas. Você poderá desfazer logo depois.', confirmLabel: 'Excluir', danger: true }))) return
    const index = workouts.indexOf(w)
    setWorkouts((cur) => cur.filter((x) => x.id !== w.id))
    setDetailId(null)
    toast('Treino excluído', { undo: () => setWorkouts((cur) => { const n = [...cur]; n.splice(index, 0, w); return n }) })
  }

  // Busca de treinos na paleta (Ctrl+K): cada shell registra o seu provedor.
  const provider = useMemo<CommandProvider>(() => ({
    id: 'design:search',
    search: (q) => workouts.filter((w) => `${w.title} ${w.place} ${w.type}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5)
      .map((w) => ({ id: String(w.id), label: `${w.title} · ${fmtRelative(w.date, today)}`, group: 'Treinos', icon: TYPE_META[w.type].icon, run: () => open(w.id) })),
  }), [workouts, today, open])
  useCommandProvider(provider)

  const content = view === 'home'
    ? <HomeView workouts={workouts} today={today} onOpen={open} onGoStats={() => go('stats')} onGoList={() => go('workouts')} onCapture={capture} onExpand={expand} />
    : view === 'stats'
      ? <StatsView workouts={workouts} today={today} onOpen={open} />
      : view === 'comp'
        ? <ComponentsView workouts={workouts} onNew={() => setForm({ id: null, prefill: null })} />
        : null

  const title = view === 'workouts' && detailId !== null ? workouts.find((w) => w.id === detailId)?.title ?? 'Treino' : TITLES[view]
  const subtitle = view === 'workouts' ? `${workouts.filter((w) => w.status === 'done').length} registrados` : view === 'home' ? new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : view === 'stats' ? 'Retrospectiva' : 'Biblioteca do padrão'
  const editing = form?.id ? workouts.find((w) => w.id === form.id) ?? null : null

  return (
    <div className="dp-root">
      <div className="dp-bar">
        <div className="dp-title"><b>Padrão Makima</b><span>Referência viva, com um agente fictício (Hayate, treinos). Tudo é clicável.</span></div>
        <div className="dp-bar-right">
          <SegmentedControl label="Tamanho da tela" value={phone ? 'phone' : 'desk'} onChange={(v) => setPhone(v === 'phone')} options={[{ value: 'desk', label: 'Computador', icon: 'desktop' }, { value: 'phone', label: 'Celular', icon: 'phone' }]} />
          <button type="button" className="ds-btn ds-ghost ds-sm" onClick={() => navigate('/')}>Sair</button>
        </div>
      </div>
      <div className="dp-stage">
        <div className={`dp-frame${phone ? ' dp-phone' : ''}`}>
          <AppShell
            embedded
            agent={{ id: 'hayate', name: 'Hayate', subtitle: 'Treinos · Corpo', hue: 300, chroma: 0.17, portrait: null }}
            extraAgents={[{ id: 'hayate', name: 'Hayate', domain: 'Treinos (exemplo)', hue: 300, route: '/design' }]}
            nav={NAV}
            active={view}
            onNavigate={go}
            primary={{ label: 'Registrar treino', icon: 'add', key: 'n', onClick: () => setForm({ id: null, prefill: null }) }}
            title={title}
            subtitle={subtitle}
            search={{ placeholder: 'Buscar treinos…', onSubmit: (q) => { setView('workouts'); setDetailId(null); setQuery({ q, nonce: Date.now() }) } }}
            onGoAgent={(route, agent) => (route === '/design' ? toast('Você já está no Hayate (exemplo)') : demoNavToast(agent?.name ?? 'Makima', route))}
            art={{ value: art, options: ART_OPTIONS, onChange: setArt }}
            artValue={art}
            preferences={
              <>
                <SettingRow title="Destacar recordes" help="Selo PR nos cartões e listas."><Toggle label="Destacar recordes" checked={prefs.pr} onChange={(pr) => setPrefs({ pr })} /></SettingRow>
                <SettingRow title="Mostrar energia (kcal)"><Toggle label="Mostrar kcal" checked={prefs.kcal} onChange={(kcal) => setPrefs({ kcal })} /></SettingRow>
              </>
            }
          >
            {view === 'workouts'
              ? <WorkoutsView workouts={workouts} today={today} detailId={detailId} tab={tab} onTab={setTab} onOpen={open} onBack={() => setDetailId(null)} onNew={() => setForm({ id: null, prefill: null })} onEdit={(w) => setForm({ id: w.id, prefill: null })} onDelete={remove} onStart={() => toast('Cronômetro iniciado (exemplo)')} showPR={prefs.pr} showKcal={prefs.kcal} externalQuery={query} />
              : content}
            {form && <WorkoutForm key={form.id ?? 'new'} workout={editing} prefill={form.prefill} onClose={() => setForm(null)} onSave={save} />}
          </AppShell>
        </div>
      </div>
    </div>
  )
}

