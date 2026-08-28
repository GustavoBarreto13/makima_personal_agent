/**
 * YatoShell.tsx — Yato · Viagens (fatia 066)
 *
 * Shell root: sidebar (marca + viagem ativa + nav + frase) · topbar (busca +
 * seletor de viagem ativa + progresso do protocolo) · conteúdo roteado
 * internamente · footbar (próxima pendência + tweaks). Modais globais.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NavState, Tweaks, Trip, CheckKey, Period, MobilityCheck, DossierResponse, CheckSource } from './types'
import { yatoApi } from './yatoApi'
import { todayLocalISO, daysBetween, fmtRange, money } from './dateUtils'

import { HomeScreen } from './screens/HomeScreen'
import { TripsScreen } from './screens/TripsScreen'
import { TripDetailScreen } from './screens/TripDetailScreen'
import { MobilityScreen } from './screens/MobilityScreen'
import { BudgetScreen } from './screens/BudgetScreen'
import { ChecklistScreen } from './screens/ChecklistScreen'

import { Icon } from './components/Icon'
import { ReadinessMeter, checkedCount } from './components/ReadinessMeter'
import { Toast } from './ui/Toast'
import { TweaksPanel } from './TweaksPanel'

import { NewTripModal, type NewTripForm } from './modals/NewTripModal'
import { NewItemModal, type NewItemForm } from './modals/NewItemModal'
import { LogExpenseModal, type LogExpenseForm } from './modals/LogExpenseModal'
import { ProtocolWizard } from './modals/ProtocolWizard'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'

import './yato.css'

const TWEAKS_KEY = 'yato-tweaks'

const DEFAULT_TWEAKS: Tweaks = {
  tema: 'Escuro', acento: 'Azul-cachecol', densidade: 'Médio', textura: true, ordenacao: 'Data de ida',
}

const ACCENT_MAP: Record<Tweaks['acento'], string | undefined> = {
  'Azul-cachecol': undefined, 'Ouro': 'ouro', 'Carmim': 'carmim', 'Musgo': 'musgo',
}
const DENSITY_MAP: Record<Tweaks['densidade'], string> = { 'Grande': 'large', 'Médio': 'medium', 'Compacto': 'compact' }

function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(TWEAKS_KEY)
    if (raw) return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) }
  } catch { /* nada */ }
  return DEFAULT_TWEAKS
}

interface NavItem { id: NavState['view']; label: string; icon: string }
const NAV: NavItem[] = [
  { id: 'home', label: 'Início', icon: 'inicio' },
  { id: 'trips', label: 'Viagens', icon: 'mochila' },
  { id: 'trip', label: 'Roteiro', icon: 'rota' },
  { id: 'mobility', label: 'Mobilidade', icon: 'carimbo' },
  { id: 'budget', label: 'Orçamento', icon: 'cifrao' },
  { id: 'checklist', label: 'Checklist', icon: 'lista' },
]
const TITLES: Record<NavState['view'], string> = {
  home: 'Início', trips: 'Viagens', trip: 'Roteiro', mobility: 'Dossiê de mobilidade',
  budget: 'Orçamento', checklist: 'Checklist',
}

export function YatoShell() {
  useDocumentTitle(AGENT_TABS.yato.title, AGENT_TABS.yato.icon)

  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks)
  const [nav, setNav] = useState<NavState>({ view: 'home', param: null })
  const [trips, setTrips] = useState<Trip[]>([])
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [activeDossierChecks, setActiveDossierChecks] = useState<MobilityCheck[] | null>(null)
  const [nextPendingLabel, setNextPendingLabel] = useState<string | null>(null)
  const [checklistOpenCount, setChecklistOpenCount] = useState(0)
  const [itineraryCount, setItineraryCount] = useState(0)
  const [expensesTotal, setExpensesTotal] = useState(0)

  const [showTweaks, setShowTweaks] = useState(false)
  const [newTripOpen, setNewTripOpen] = useState(false)
  const [newItem, setNewItem] = useState<{ tripId: string; day: string; period: Period } | null>(null)
  const [logExpOpen, setLogExpOpen] = useState(false)
  const [wizard, setWizard] = useState<{ uf: string; city: string; key: CheckKey } | null>(null)
  const [wizardDossier, setWizardDossier] = useState<DossierResponse | null>(null)

  useEffect(() => {
    if (!wizard) { setWizardDossier(null); return }
    yatoApi.getDossier(wizard.uf, wizard.city).then(setWizardDossier).catch(() => setWizardDossier(null))
  }, [wizard?.uf, wizard?.city])

  const bump = useCallback(() => setReloadKey(k => k + 1), [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
  }, [])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  const navigate = useCallback((view: string, param?: string) => {
    setNav({ view: view as NavState['view'], param: param ?? null })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    if (view !== 'trips') setQuery('')
  }, [])

  // Usado por telas que podem levar a uma viagem específica (Home/Trips) — ao
  // navegar para 'trip' com um param, essa viagem também vira a "ativa" (sidebar,
  // topbar, orçamento, checklist), evitando que o modal de novo item use os
  // dias de uma viagem diferente da que está sendo vista.
  const navigateToTrip = useCallback((view: string, param?: string) => {
    if (view === 'trip' && param) setActiveTripId(param)
    navigate(view, param)
  }, [navigate])

  // ── Carrega viagens e resolve a viagem ativa ──────────────────────────────
  useEffect(() => {
    yatoApi.listTrips({ sort: 'upcoming', limit: 200 }).then(res => {
      setTrips(res.trips)
      setActiveTripId(prev => {
        if (prev && res.trips.some(t => t.id === prev)) return prev
        const ongoing = res.trips.find(t => t.status === 'confirmada' || t.status === 'em_curso')
        return ongoing?.id ?? res.trips[0]?.id ?? null
      })
    }).catch(() => setTrips([]))
  }, [reloadKey])

  const activeTrip = trips.find(t => t.id === activeTripId) || null

  // ── Dados agregados p/ sidebar/topbar/footbar (dossiê, checklist, roteiro) ─
  useEffect(() => {
    if (!activeTrip) {
      setActiveDossierChecks(null); setNextPendingLabel(null); setChecklistOpenCount(0); setItineraryCount(0); setExpensesTotal(0)
      return
    }
    yatoApi.getDossier(activeTrip.state_uf, activeTrip.city).then(res => setActiveDossierChecks(res.checks)).catch(() => setActiveDossierChecks(null))
    yatoApi.listItinerary(activeTrip.id).then(res => setItineraryCount(res.days.reduce((a, d) => a + d.items.length, 0))).catch(() => setItineraryCount(0))
    yatoApi.listChecklist(activeTrip.id, false).then(res => { setNextPendingLabel(res.items[0]?.label ?? null); setChecklistOpenCount(res.items.length) })
      .catch(() => { setNextPendingLabel(null); setChecklistOpenCount(0) })
    yatoApi.getBudget(activeTrip.id).then(res => setExpensesTotal(res.total_actual)).catch(() => setExpensesTotal(0))
  }, [activeTrip?.id, reloadKey])

  // ── Mutações ───────────────────────────────────────────────────────────────
  const saveTrip = async (f: NewTripForm) => {
    const trip = await yatoApi.createTrip({
      title: f.title || null, city: f.city.trim(), state_uf: f.uf,
      start_date: f.start, end_date: f.end, profile: f.profile,
    })
    setNewTripOpen(false)
    setActiveTripId(trip.id)
    bump()
    navigate('trip', trip.id)
    showToast('Viagem criada — cinco ienes bem gastos.')
  }

  const saveItem = async (f: NewItemForm) => {
    if (!newItem) return
    await yatoApi.addItineraryItem(newItem.tripId, {
      day_date: f.day, period: f.period, start_time: f.time || null, title: f.title,
      address: f.addr || null, transport_mode: f.mode,
      cost_estimate: f.cost === '' ? null : Number(f.cost),
    })
    setNewItem(null)
    showToast('Item no roteiro.')
    bump()
  }

  const saveExpense = async (f: LogExpenseForm) => {
    if (!activeTrip) return
    await yatoApi.logExpense(activeTrip.id, { category: f.cat, amount: Number(f.v), description: f.desc, account: f.account, date: f.date })
    setLogExpOpen(false)
    showToast('Gasto registrado e espelhado nas finanças.')
    bump()
  }

  const saveCheck = async (uf: string, city: string, key: CheckKey, verdict: 'confirmado' | 'ausente' | 'inconclusivo', evidence: string, source: CheckSource) => {
    await yatoApi.upsertCheck(uf, city, key, { verdict, source, evidence: evidence || null })
    showToast('Passo carimbado: ' + verdict + '.')
    bump()
  }
  const skipCheck = () => {
    showToast('Pulado — fica pendente, não fica errado.')
  }

  // ── data-* no shell (tweaks) ────────────────────────────────────────────
  const shellProps: Record<string, string> = {
    'data-theme': tweaks.tema === 'Claro' ? 'light' : 'dark',
    'data-density': DENSITY_MAP[tweaks.densidade],
    'data-texture': tweaks.textura ? 'on' : 'off',
  }
  const accent = ACCENT_MAP[tweaks.acento]
  if (accent) shellProps['data-accent'] = accent

  const cd = activeTrip ? daysBetween(todayLocalISO(), activeTrip.start_date) : null

  const renderScreen = () => {
    switch (nav.view) {
      case 'trips':
        return <TripsScreen trips={trips} query={query} sort={tweaks.ordenacao} onNav={navigateToTrip} onNewTrip={() => setNewTripOpen(true)} />
      case 'trip': {
        const tripId = nav.param || activeTripId
        if (!tripId) return <div className="page"><p className="dim">Nenhuma viagem selecionada.</p></div>
        return (
          <TripDetailScreen
            tripId={tripId}
            onNav={navigate}
            onAddItem={(tid, day, period) => setNewItem({ tripId: tid, day, period })}
            onShowToast={showToast}
            reloadKey={reloadKey}
            onChanged={bump}
          />
        )
      }
      case 'mobility':
        return (
          <MobilityScreen
            activeTrip={activeTrip}
            reloadKey={reloadKey}
            onCheck={(uf, city, key) => setWizard({ uf, city, key })}
            onStart={(uf, city) => setWizard({ uf, city, key: 'porte_cidade' })}
          />
        )
      case 'budget':
        return activeTrip
          ? <BudgetScreen trip={activeTrip} onLogExpense={() => setLogExpOpen(true)} reloadKey={reloadKey} onChanged={bump} />
          : <div className="page"><p className="dim">Nenhuma viagem ativa.</p></div>
      case 'checklist':
        return activeTrip
          ? <ChecklistScreen trip={activeTrip} onShowToast={showToast} reloadKey={reloadKey} onChanged={bump} />
          : <div className="page"><p className="dim">Nenhuma viagem ativa.</p></div>
      default:
        return (
          <HomeScreen
            activeTrip={activeTrip}
            otherTrips={trips.filter(t => t.id !== activeTripId).slice(0, 6)}
            onNav={navigateToTrip}
            onNewTrip={() => setNewTripOpen(true)}
          />
        )
    }
  }

  return (
    <div className="yato-shell" {...shellProps}>
      <div className="yato-tex" />

      {/* ── Sidebar ── */}
      <aside className="yato-side">
        <div className="side-brand">
          <div className="brand-mark"><img src="/yato.png" alt="Yato" /></div>
          <div className="brand-text">
            <div className="brand-name">🎒 Yato</div>
            <div className="brand-role">viagens</div>
          </div>
        </div>

        {activeTrip && (
          <button className="side-trip" onClick={() => navigate('trip', activeTrip.id)}>
            <div className="st-label">viagem ativa</div>
            <div className="st-city">{activeTrip.city}/{activeTrip.state_uf}</div>
            <div className="st-dates">{fmtRange(activeTrip.start_date, activeTrip.end_date)}</div>
            <div className="st-count">{cd != null ? (cd > 0 ? `faltam ${cd} dias` : cd === 0 ? 'é hoje' : 'já rolou') : ''}</div>
          </button>
        )}

        <nav className="side-nav">
          {NAV.map(n => {
            const count = n.id === 'trips' ? trips.length
              : n.id === 'trip' ? itineraryCount
              : n.id === 'mobility' ? (activeDossierChecks ? activeDossierChecks.filter(c => c.verdict === 'pendente').length : undefined)
              : n.id === 'checklist' ? checklistOpenCount
              : undefined
            return (
              <button key={n.id} className={'nav-item' + (nav.view === n.id ? ' active' : '')}
                      onClick={() => navigate(n.id, n.id === 'trip' ? (activeTripId ?? undefined) : undefined)}>
                <Icon name={n.icon} /> <span className="nav-label">{n.label}</span>
                {count != null && <span className="nav-count">{count}</span>}
              </button>
            )
          })}
        </nav>

        <div className="side-foot">
          <p className="side-quote">"Só saio de casa quando sei como volto."</p>
          <button className="side-new" onClick={() => setNewTripOpen(true)}><Icon name="plus" /> <span>Nova viagem</span></button>
          <a className="back-makima" href="/"><span className="dot" /> Voltar à Makima</a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="yato-main">
        <div className="yato-topbar">
          <span className="topbar-title">{TITLES[nav.view]}</span>
          <div className="search">
            <Icon name="search" />
            <input value={query} placeholder="Buscar viagem, cidade…"
                   onChange={e => { setQuery(e.target.value); if (e.target.value && nav.view !== 'trips') navigate('trips') }} />
          </div>
          <div className="trip-select">
            {trips.length > 0 && (
              <select value={activeTripId ?? ''} onChange={e => setActiveTripId(e.target.value)}>
                {trips.map(t => <option key={t.id} value={t.id}>{t.city}/{t.state_uf}</option>)}
              </select>
            )}
            <button className="topbar-prot" onClick={() => navigate('mobility')} title="abrir dossiê de mobilidade">
              <ReadinessMeter checks={activeDossierChecks} />
              {checkedCount(activeDossierChecks)}/7 checados
            </button>
          </div>
        </div>
        <div className="yato-scroll" ref={scrollRef}>{renderScreen()}</div>
      </main>

      {/* ── Footbar ── */}
      <div className="footbar">
        <button className="fb-pend" onClick={() => navigate('checklist')}>
          <span className="fb-box" />
          {nextPendingLabel ? <>{nextPendingLabel} · {activeTrip?.city}</> : 'checklist zerado — pode embarcar'}
        </button>
        <span className="fb-right">{itineraryCount} itens · {money(expensesTotal)} gastos</span>
        <button className="btn btn-sm" style={{ padding: '4px 8px' }} title="preferências" onClick={() => setShowTweaks(true)}>
          <Icon name="gear" style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* ── Modais ── */}
      <NewTripModal open={newTripOpen} onClose={() => setNewTripOpen(false)} onSave={saveTrip} />
      <NewItemModal
        open={!!newItem}
        trip={activeTrip}
        preset={newItem ? { day: newItem.day, period: newItem.period } : null}
        onClose={() => setNewItem(null)}
        onSave={saveItem}
      />
      <LogExpenseModal open={logExpOpen} onClose={() => setLogExpOpen(false)} onSave={saveExpense} />
      <ProtocolWizard
        open={!!wizard}
        dossier={wizardDossier}
        startKey={wizard?.key ?? null}
        onClose={() => setWizard(null)}
        onSave={(key, verdict, evidence, source) => {
          if (!wizard) return
          saveCheck(wizard.uf, wizard.city, key, verdict, evidence, source)
          yatoApi.getDossier(wizard.uf, wizard.city).then(setWizardDossier).catch(() => {})
        }}
        onSkip={skipCheck}
      />
      <Toast message={toast} />
      <TweaksPanel open={showTweaks} tweaks={tweaks} onChange={t => { setTweaks(t); try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(t)) } catch { /* nada */ } }} onClose={() => setShowTweaks(false)} />
    </div>
  )
}
