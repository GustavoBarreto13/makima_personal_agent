// MaiShell — shell principal do módulo Mai Sakurajima (séries de TV).
// Controla: navegação interna, modais globais, tweaks visuais e NextBar.

import { useState, useEffect, useCallback } from 'react'
import type { NavState, MaiView, Tweaks, UpcomingEpisode, MaiStatus } from './types'
import { maiApi } from './maiApi'

// Telas
import { HomeScreen }      from './screens/HomeScreen'
import { CatalogScreen }   from './screens/CatalogScreen'
import { DiaryScreen }     from './screens/DiaryScreen'
import { WatchlistScreen } from './screens/WatchlistScreen'
import { UpcomingScreen }  from './screens/UpcomingScreen'
import { StatsScreen }     from './screens/StatsScreen'
import { DetailScreen }    from './screens/DetailScreen'

// Componentes
import { NextBar }  from './components/NextBar'
import { Toast }    from './components/Toast'
import {
  IconHome, IconGrid, IconBook, IconList,
  IconCalendar, IconBarChart, IconPlus, IconSettings,
} from './components/MaiIcons'

// Modais
import { LogWatchModal } from './modals/LogWatchModal'
import { AddSeriesModal } from './modals/AddSeriesModal'
import { TweaksModal }   from './modals/TweaksModal'

// CSS
import './mai.css'

// Chave do localStorage para persistir preferências visuais
const TWEAKS_KEY = 'mai-tweaks'

/** Lê tweaks salvas no localStorage ou retorna padrões. */
function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(TWEAKS_KEY)
    if (raw) return JSON.parse(raw) as Tweaks
  } catch { /* nada */ }
  return { theme: 'dark', accent: 'periwinkle', density: 'medium' }
}

interface NavItem {
  view: MaiView
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { view: 'home',      icon: <IconHome />,     label: 'Início'    },
  { view: 'catalog',   icon: <IconGrid />,     label: 'Catálogo'  },
  { view: 'diary',     icon: <IconBook />,     label: 'Diário'    },
  { view: 'watchlist', icon: <IconList />,     label: 'Watchlist' },
  { view: 'upcoming',  icon: <IconCalendar />, label: 'Próximos'  },
  { view: 'stats',     icon: <IconBarChart />, label: 'Stats'     },
]

/** MaiShell — raiz do módulo de séries de TV. */
export function MaiShell() {
  // Estado de navegação: qual tela + parâmetro (ex.: series_id)
  const [nav, setNav] = useState<NavState>({ view: 'home', param: null })

  // Tweaks visuais (tema, acento, densidade)
  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks)

  // Próximo episódio para o NextBar
  const [nextEp, setNextEp] = useState<UpcomingEpisode | null>(null)

  // Toast de feedback
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null)

  // Modais abertos
  const [showLog,    setShowLog]    = useState(false)
  const [logPreId,   setLogPreId]   = useState<string | null>(null)
  const [logPreTitle,setLogPreTitle]= useState<string | null>(null)
  const [showAdd,    setShowAdd]    = useState(false)
  const [showTweaks, setShowTweaks] = useState(false)

  // Persiste tweaks no localStorage sempre que mudam
  useEffect(() => {
    try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(tweaks)) } catch { /* nada */ }
  }, [tweaks])

  // Aplica atributos de dados ao shell para o CSS OKLCH reagir
  function handleTweaksChange(t: Tweaks) {
    setTweaks(t)
  }

  // Carrega próximo episódio ao montar
  useEffect(() => {
    maiApi.upcoming()
      .then(res => {
        const eps = (res as any).upcoming as UpcomingEpisode[] ?? []
        setNextEp(eps[0] ?? null)
      })
      .catch(() => setNextEp(null))
  }, [])

  // Navega para uma view e parâmetro
  // Aceita string genérico e converte para MaiView internamente
  function go(view: string, param?: string) {
    setNav({ view: view as MaiView, param: param ?? null })
  }

  // Abre modal de log com série pré-selecionada
  // Parâmetros opcionais para compatibilidade com as screens que chamam sem args
  function openLog(seriesId?: string, title?: string) {
    setLogPreId(seriesId ?? null)
    setLogPreTitle(title ?? null)
    setShowLog(true)
  }

  // Mostra toast com mensagem
  const showToast = useCallback((msg: string) => {
    setToast({ msg, key: Date.now() })
  }, [])

  // Renderiza a tela ativa
  function renderScreen() {
    switch (nav.view) {
      case 'home':
        return (
          <HomeScreen
            onNav={go}
            onOpenLog={openLog}
          />
        )
      case 'catalog':
        return (
          <CatalogScreen
            onNav={go}
            initialStatus={nav.param as MaiStatus | undefined}
          />
        )
      case 'diary':
        return <DiaryScreen onNav={go} onOpenLog={openLog} />
      case 'watchlist':
        return (
          <WatchlistScreen
            onNav={go}
            onOpenAdd={() => setShowAdd(true)}
          />
        )
      case 'upcoming':
        return <UpcomingScreen onNav={go} />
      case 'stats':
        return <StatsScreen />
      case 'detail':
        return nav.param ? (
          <DetailScreen
            seriesId={nav.param}
            onBack={() => go('catalog')}
            onOpenLog={openLog}
            onShowToast={showToast}
          />
        ) : null
      default:
        return null
    }
  }

  return (
    <div
      className="mai-shell"
      data-theme={tweaks.theme}
      data-accent={tweaks.accent}
      data-density={tweaks.density}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="mai-side">
        {/* Brand — clicável para ir ao Início */}
        <div className="side-brand" onClick={() => go('home')} style={{ cursor: 'pointer' }}>
          <div className="brand-mark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22 }}>📺</span>
          </div>
          <div className="brand-text">
            <div className="brand-name">Mai <span className="bunny">🐰</span></div>
            <div className="brand-role">Séries · TV</div>
          </div>
        </div>

        {/* CTA principal — abre modal de registro de sessão */}
        <button className="side-log-btn" onClick={() => openLog()}>
          <span>📺</span>
          <span>Registrar sessão</span>
        </button>

        {/* Itens de navegação */}
        <nav className="side-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.view}
              className={`nav-item${nav.view === item.view ? ' active' : ''}`}
              onClick={() => go(item.view)}
              title={item.label}
            >
              <span className="nav-emoji">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Rodapé da sidebar */}
        <div className="side-foot">
          <div className="side-quote">
            <span className="q-mark">"</span>
            Série boa a gente revê.
            <span className="q-mark">"</span>
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
            onClick={() => setShowAdd(true)}
            title="Adicionar série"
          >
            <IconPlus style={{ width: 14, height: 14 }} />
            Adicionar série
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
            onClick={() => setShowTweaks(true)}
            title="Aparência"
          >
            <IconSettings style={{ width: 14, height: 14 }} />
            Aparência
          </button>
        </div>
      </aside>

      {/* ── Área principal ──────────────────────────────────────────── */}
      <div className="mai-main">
        {/* Topbar */}
        <header className="mai-topbar">
          <div className="topbar-title">
            {NAV_ITEMS.find(i => i.view === nav.view)?.label ?? 'Série'}
          </div>
          <div className="topbar-spacer" />
          <button
            className="topbar-add"
            onClick={() => setShowAdd(true)}
            title="Adicionar série"
          >
            <IconPlus />
          </button>
        </header>

        {/* Conteúdo da tela com scroll */}
        <div className="mai-scroll">
          {renderScreen()}
        </div>
      </div>

      {/* ── NextBar (footbar) — ocupa ambas as colunas ────────────────── */}
      <NextBar
        next={nextEp}
        onClick={nextEp ? () => go('detail', nextEp.series_id) : undefined}
      />

      {/* ── Toast de feedback ─────────────────────────────────────────── */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.msg}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* ── Modais ───────────────────────────────────────────────────── */}
      {showLog && (
        <LogWatchModal
          prefilledSeriesId={logPreId}
          prefilledTitle={logPreTitle}
          onClose={() => { setShowLog(false); setLogPreId(null); setLogPreTitle(null) }}
          onSuccess={showToast}
        />
      )}

      {showAdd && (
        <AddSeriesModal
          onClose={() => setShowAdd(false)}
          onSuccess={msg => { showToast(msg); go('catalog') }}
        />
      )}

      {showTweaks && (
        <TweaksModal
          tweaks={tweaks}
          onChange={handleTweaksChange}
          onClose={() => setShowTweaks(false)}
        />
      )}
    </div>
  )
}
