// Shell principal do Violet · Diário — gerencia sidebar, topbar e roteamento interno.
// Espelha o padrão do FrierenShell: estado interno {view, param} no lugar de React Router.
// Importa violet.css que contém todos os tokens OKLCH isolados em .vl-app.

import { useState, useEffect, useRef } from 'react'
import './violet.css'
import { violetApi } from '../../lib/api'
// Helper de data local: evita o bug de UTC onde bullets após 21h ficam no dia seguinte
import { todayLocalISO } from './dateUtils'
import type { VioletPrefs, VioletRoute } from './types'
import { DEFAULT_PREFS } from './types'
import { Icon } from './ui/Icon'
import { TweaksPanel } from './TweaksPanel'

// Telas
import { Write } from './screens/Write'
import { WriteFooter } from './screens/WriteFooter'
import { JournalScreen } from './screens/Journal'
import { Collection } from './screens/Collection'
import { Tags } from './screens/Tags'
import { People } from './screens/People'
import { Insights } from './screens/Insights'
import { Reflect } from './screens/Reflect'

// ── Paletas de acento (5 vars CSS por tema) ──────────────────────────────────
const ACCENT_PALETTES: Record<string, Record<string, string>> = {
  sapphire: {
    '--accent':        'oklch(0.55 0.135 250)',
    '--accent-deep':   'oklch(0.45 0.135 252)',
    '--accent-bright': 'oklch(0.70 0.130 246)',
    '--accent-tint':   'oklch(0.55 0.135 250 / 0.10)',
    '--accent-tint-2': 'oklch(0.55 0.135 250 / 0.16)',
  },
  gold: {
    '--accent':        'oklch(0.625 0.105 78)',
    '--accent-deep':   'oklch(0.585 0.098 72)',
    '--accent-bright': 'oklch(0.70 0.105 78)',
    '--accent-tint':   'oklch(0.625 0.105 78 / 0.10)',
    '--accent-tint-2': 'oklch(0.625 0.105 78 / 0.16)',
  },
  emerald: {
    '--accent':        'oklch(0.585 0.105 165)',
    '--accent-deep':   'oklch(0.52 0.105 165)',
    '--accent-bright': 'oklch(0.65 0.105 165)',
    '--accent-tint':   'oklch(0.585 0.105 165 / 0.10)',
    '--accent-tint-2': 'oklch(0.585 0.105 165 / 0.16)',
  },
  garnet: {
    '--accent':        'oklch(0.535 0.165 18)',
    '--accent-deep':   'oklch(0.45 0.165 18)',
    '--accent-bright': 'oklch(0.60 0.165 18)',
    '--accent-tint':   'oklch(0.535 0.165 18 / 0.10)',
    '--accent-tint-2': 'oklch(0.535 0.165 18 / 0.16)',
  },
}

// Lê as preferências salvas no localStorage, com fallback para os defaults
function loadTweaks(): VioletPrefs {
  try {
    const raw = localStorage.getItem('vl-tweaks')
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch { /* ignora JSON malformado */ }
  return DEFAULT_PREFS
}

// Aplica os tweaks no elemento .vl-app via atributos e CSS vars
function applyTweaks(el: HTMLElement, prefs: VioletPrefs) {
  el.setAttribute('data-theme', prefs.theme)

  const palette = ACCENT_PALETTES[prefs.accent] ?? ACCENT_PALETTES.sapphire
  for (const [prop, val] of Object.entries(palette)) {
    el.style.setProperty(prop, val)
  }

  el.classList.toggle('modo-foco',   prefs.mode === 'focus')
  el.classList.toggle('modo-amplo',  prefs.mode === 'wide')
  el.classList.toggle('tipo-tecnica', prefs.typography === 'technical')
}

export function VioletShell() {
  const [route, setRoute] = useState<VioletRoute>({ view: 'write', param: null })
  const [tweaks, setTweaks] = useState<VioletPrefs>(loadTweaks)
  const [showTweaks, setShowTweaks] = useState(false)
  const [query, setQuery] = useState('')
  // Lista de datas das entries para navegação no WriteFooter
  const [entryDates, setEntryDates] = useState<string[]>([])
  // Contadores de coleção para a sidebar
  const [counts, setCounts] = useState<Record<string, number>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<HTMLDivElement>(null)

  // Aplica tweaks no .vl-app ao montar e a cada mudança
  useEffect(() => {
    if (appRef.current) applyTweaks(appRef.current, tweaks)
  }, [tweaks])

  // Carrega datas das entries para navegação
  useEffect(() => {
    violetApi.entries().then((list: unknown[]) => {
      const dates = (list as Array<{ date: string }>).map(e => e.date).reverse()
      setEntryDates(dates)
    }).catch(() => {})
  }, [])

  // Carrega contadores para a sidebar
  useEffect(() => {
    Promise.allSettled([
      violetApi.collection('highlight'),
      violetApi.collection('dream'),
      violetApi.collection('idea'),
      violetApi.collection('wisdom'),
      violetApi.collection('note'),
      violetApi.dreams(),
      violetApi.mentions('tag'),
      violetApi.mentions('person'),
    ]).then(([hl, _dr, id, wi, no, dms, tags, ppl]) => {
      setCounts({
        highlights: hl.status === 'fulfilled' ? (hl.value as unknown[]).length : 0,
        dreams:     dms.status === 'fulfilled' ? (dms.value as unknown[]).length : 0,
        ideas:      id.status === 'fulfilled' ? (id.value as unknown[]).length : 0,
        wisdom:     wi.status === 'fulfilled' ? (wi.value as unknown[]).length : 0,
        notes:      no.status === 'fulfilled' ? (no.value as unknown[]).length : 0,
        tags:       tags.status === 'fulfilled' ? (tags.value as unknown[]).length : 0,
        people:     ppl.status === 'fulfilled' ? (ppl.value as unknown[]).length : 0,
      })
    })
  }, [])

  // Navega para uma view, resetando scroll
  function navigate(view: string, param: string | null = null) {
    setRoute({ view, param })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function handleTweaks(t: VioletPrefs) {
    setTweaks(t)
    localStorage.setItem('vl-tweaks', JSON.stringify(t))
  }

  // Índice da entry ativa (para Write + WriteFooter)
  const entryIdx = route.param
    ? entryDates.indexOf(route.param)
    : entryDates.length - 1

  // Renderiza a tela ativa com base na rota
  function renderView() {
    switch (route.view) {
      case 'write':
        return (
          <Write
            date={route.param ?? entryDates[entryDates.length - 1] ?? todayLocalISO()}
            entryIdx={entryIdx}
            navigate={navigate}
          />
        )
      case 'journal':
        return <JournalScreen query={query} navigate={navigate} />
      case 'reflect':
        return <Reflect navigate={navigate} />
      case 'insights':
        // Feature 009: Insights agora recebe navigate para poder abrir dias no Write
        return <Insights navigate={navigate} />
      case 'dreams':
        return <Collection kind="dreams" navigate={navigate} />
      case 'highlights':
        return <Collection kind="highlights" navigate={navigate} />
      case 'ideas':
        return <Collection kind="ideas" navigate={navigate} />
      case 'wisdom':
        return <Collection kind="wisdom" navigate={navigate} />
      case 'notes':
        return <Collection kind="notes" navigate={navigate} />
      case 'tags':
        return <Tags navigate={navigate} />
      case 'people':
        return <People navigate={navigate} />
      default:
        return null
    }
  }

  // Títulos das views para a topbar
  const TITLES: Record<string, string> = {
    write: 'Escrever', journal: 'Arquivo', reflect: 'Refletir',
    insights: 'Insights', dreams: 'Sonhos', highlights: 'Destaques',
    ideas: 'Ideias', wisdom: 'Sabedoria', notes: 'Notas', tags: 'Tags', people: 'Pessoas',
  }

  return (
    <div className="vl-app" ref={appRef}>
      {/* ── Sidebar ── */}
      <aside className="vl-side">
        <div className="side-brand">
          <div className="brand-mark">
            <img src="/violet.png" alt="Violet" />
          </div>
          <div className="brand-text">
            <div className="brand-name">Violet</div>
            <div className="brand-role">Auto Memory Doll</div>
          </div>
        </div>

        <button className="side-write-btn" onClick={() => navigate('write')}>
          <Icon name="write" size={16} />
          <span>Escrever hoje</span>
        </button>

        <nav className="side-nav">
          {/* Grupo 1: navegação principal */}
          {([
            { view: 'write',    icon: 'write',    label: 'Escrever' },
            { view: 'journal',  icon: 'journal',  label: 'Arquivo' },
            { view: 'reflect',  icon: 'reflect',  label: 'Refletir' },
            { view: 'insights', icon: 'insights', label: 'Insights' },
          ] as const).map(item => (
            <button
              key={item.view}
              className={`nav-item ${route.view === item.view ? 'active' : ''}`}
              onClick={() => navigate(item.view)}
            >
              <span className="nav-chip"><Icon name={item.icon} size={15} /></span>
              <span>{item.label}</span>
            </button>
          ))}

          <div className="nav-divider" />

          {/* Grupo 2: coleções com contadores */}
          {([
            { view: 'dreams',     icon: 'moon',    label: 'Sonhos',    key: 'dreams' },
            { view: 'highlights', icon: 'heart',   label: 'Destaques', key: 'highlights' },
            { view: 'tags',       icon: 'hash',    label: 'Tags',      key: 'tags' },
            { view: 'people',     icon: 'at',      label: 'Pessoas',   key: 'people' },
            { view: 'notes',      icon: 'pin',     label: 'Notas',     key: 'notes' },
            { view: 'wisdom',     icon: 'gem',     label: 'Sabedoria', key: 'wisdom' },
            { view: 'ideas',      icon: 'bulb',    label: 'Ideias',    key: 'ideas' },
          ] as const).map(item => (
            <button
              key={item.view}
              className={`nav-item ${route.view === item.view ? 'active' : ''}`}
              onClick={() => navigate(item.view)}
            >
              <span className="nav-chip"><Icon name={item.icon} size={15} /></span>
              <span>{item.label}</span>
              {counts[item.key] ? <span className="nav-count">{counts[item.key]}</span> : null}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button className="back-makima" onClick={() => window.location.href = '/'}>
            <span className="dot" />
            <span>Voltar à Makima</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="vl-main">
        <div className="vl-topbar">
          <span className="topbar-title">{TITLES[route.view] ?? 'Diário'}</span>
          <span className="topbar-spacer" />
          {route.view === 'journal' && (
            <div className="search">
              <Icon name="search" size={15} />
              <input
                placeholder="Buscar entradas..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          )}
          <button className="icon-btn" onClick={() => setShowTweaks(true)} title="Personalizar">
            <Icon name="sliders" size={16} />
          </button>
        </div>

        <div className="vl-scroll" ref={scrollRef}>
          {renderView()}
        </div>

        {route.view === 'write' && (
          <WriteFooter
            entryIdx={entryIdx < 0 ? entryDates.length - 1 : entryIdx}
            totalEntries={entryDates.length}
            onNav={(action) => {
              if (action === 'first')  navigate('write', entryDates[0] ?? null)
              if (action === 'prev')   navigate('write', entryDates[Math.max(0, (entryIdx < 0 ? entryDates.length - 1 : entryIdx) - 1)] ?? null)
              if (action === 'next')   navigate('write', entryDates[Math.min(entryDates.length - 1, (entryIdx < 0 ? entryDates.length - 1 : entryIdx) + 1)] ?? null)
              if (action === 'latest') navigate('write', entryDates[entryDates.length - 1] ?? null)
              if (action === 'today')  navigate('write', null)
              if (action === 'list')   navigate('journal')
            }}
            // Data atualmente exibida — o picker do calendário abre posicionado nela
            currentDate={route.param ?? entryDates[entryDates.length - 1] ?? todayLocalISO()}
            onPickDate={(date) => {
              // Navega para a data escolhida (cria a entrada sob demanda via get_or_create_page)
              navigate('write', date)
              // Recarrega a lista de datas para incluir a nova entrada na navegação ‹ ›.
              // Sem esse reload, a data recém-criada não aparece em entryDates até F5.
              violetApi.entries().then((list: unknown[]) => {
                const dates = (list as Array<{ date: string }>).map(e => e.date).reverse()
                setEntryDates(dates)
              }).catch(() => {})
            }}
          />
        )}
      </main>

      {showTweaks && (
        <TweaksPanel tweaks={tweaks} onTweaks={handleTweaks} onClose={() => setShowTweaks(false)} />
      )}
    </div>
  )
}
