// Shell raiz da Marin — cinemateca de animes.
// Gerencia: sidebar, navegação interna por estado (sem React Router interno),
//           tweaks (tema/acento/densidade/ordenação), modais (log, add, tweaks),
//           toast, sincronização com MAL.
//
// Importa marin.css para aplicar os tokens OKLCH dentro de .marin-shell.

import './marin.css'
import { useState, useEffect, useCallback } from 'react'
import type { Tweaks } from './types'

// Telas
import { HomeScreen }     from './screens/HomeScreen'
import { CatalogScreen }  from './screens/CatalogScreen'
import { DiaryScreen }    from './screens/DiaryScreen'
import { WatchlistScreen } from './screens/WatchlistScreen'
import { ScheduleScreen } from './screens/ScheduleScreen'
import { StatsScreen }    from './screens/StatsScreen'
import { AnimeDetail }    from './AnimeDetail'

// Modais
import { LogWatchModal } from './modals/LogWatchModal'
import { AddAnimeModal } from './modals/AddAnimeModal'
import { MarinTweaks }   from './modals/MarinTweaks'

// Componentes
import { Toast } from './components/Toast'
import { Icon }  from './components/Icon'

// API
import { marinApi } from './marinApi'

// Tipo das views disponíveis
type MarinView = 'home' | 'catalogo' | 'diario' | 'watchlist' | 'lancamentos' | 'stats' | 'detalhe'

// Defaults de tweaks (carregados do localStorage ou esses valores)
const DEFAULT_TWEAKS: Tweaks = {
  tema: 'Escuro',
  acento: 'Neon',
  densidade: 'Médio',
  ordenacao: 'Atualizado',
}

// Mapa acento → valor do data-accent no DOM
const ACCENT_MAP: Record<string, string> = {
  'Neon':         'neon',
  'Rosa-Magenta': 'magenta',
  'Sakura':       'sakura',
  'Gold':         'gold',
}

// Mapa densidade → valor do data-density no DOM
const DENSITY_MAP: Record<string, string> = {
  'Grande':   'large',
  'Médio':    'medium',
  'Compacto': 'compact',
}

/**
 * Lê os tweaks do localStorage; retorna os defaults se inválido/ausente.
 */
function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem('mr-tweaks')
    if (!raw) return DEFAULT_TWEAKS
    return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_TWEAKS
  }
}

/**
 * MarinShell — root shell da Marin.
 * Toda navegação é via estado (view + animeId).
 * Modais abertos via flags de estado (logModal, addOpen, tweaksOpen).
 */
export function MarinShell() {
  // Estado de navegação
  const [view, setView] = useState<MarinView>('home')
  const [animeId, setAnimeId] = useState<string | null>(null)  // para a view 'detalhe'

  // Tweaks persistidos no localStorage
  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks)

  // Modais
  const [logModal, setLogModal] = useState<{
    open: boolean
    animeId?: string
    ep?: number
  }>({ open: false })
  const [addOpen, setAddOpen] = useState(false)
  const [tweaksOpen, setTweaksOpen] = useState(false)

  // Toast
  const [toast, setToast] = useState<string>('')

  // Sincronização com MAL
  const [syncing, setSyncing] = useState(false)

  // Contagens para os itens de nav (carregadas uma vez)
  const [navCounts, setNavCounts] = useState<{
    assistindo?: number
    watchlist?: number
  }>({})

  // Aplica tweaks como data-attrs no elemento do shell (CSS seleciona via data-*)
  useEffect(() => {
    const el = document.querySelector('.marin-shell')
    if (!el) return
    el.setAttribute('data-theme',   tweaks.tema === 'Claro' ? 'light' : 'dark')
    el.setAttribute('data-accent',  ACCENT_MAP[tweaks.acento] ?? 'neon')
    el.setAttribute('data-density', DENSITY_MAP[tweaks.densidade] ?? 'medium')
  }, [tweaks])

  // Busca contagens de nav ao montar (uma única vez)
  useEffect(() => {
    marinApi.home()
      .then((res: any) => {
        if (res?.counts) {
          setNavCounts({
            assistindo: res.counts.assistindo ?? 0,
            watchlist:  res.counts.quero_assistir ?? 0,
          })
        }
      })
      .catch(() => {})
  }, [])

  // Atalho de teclado: 'a' abre AddAnimeModal
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'a') setAddOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [handleGlobalKey])

  function navigateTo(v: MarinView, id?: string) {
    setView(v)
    if (id) setAnimeId(id)
    else if (v !== 'detalhe') setAnimeId(null)
  }

  function openLogModal(animeId?: string, ep?: number) {
    setLogModal({ open: true, animeId, ep })
  }

  function showToast(msg: string) {
    setToast(msg)
  }

  async function handleSyncMal() {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await marinApi.syncMal(false)
      const r = res as any
      showToast(
        r?.added > 0 || r?.updated > 0
          ? `MAL sync: ${r.added ?? 0} adicionado(s), ${r.updated ?? 0} atualizado(s)`
          : 'MAL sync: nada de novo'
      )
    } catch {
      showToast('Erro ao sincronizar com o MAL.')
    } finally {
      setSyncing(false)
    }
  }

  // Items do nav — grupos "Acervo" e "Descobrir"
  const navAcervo: { id: MarinView; label: string; icon: string; count?: number }[] = [
    { id: 'home',      label: 'Início',     icon: 'home'     },
    { id: 'catalogo',  label: 'Catálogo',   icon: 'list'     },
    { id: 'diario',    label: 'Diário',     icon: 'book'     },
    { id: 'watchlist', label: 'Watchlist',  icon: 'clock',   count: navCounts.watchlist },
    { id: 'lancamentos', label: 'Lançamentos', icon: 'calendar' },
  ]
  const navDescobrir: { id: MarinView; label: string; icon: string }[] = [
    { id: 'stats', label: 'Estatísticas', icon: 'stats' },
  ]

  return (
    <div
      className="marin-shell"
      data-theme={tweaks.tema === 'Claro' ? 'light' : 'dark'}
      data-accent={ACCENT_MAP[tweaks.acento] ?? 'neon'}
      data-density={DENSITY_MAP[tweaks.densidade] ?? 'medium'}
    >
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="mr-side">
        {/* Identidade da Marin */}
        <div className="mr-side-identity">
          <div className="mr-side-avatar">
            <img src="/marin.png" alt="Marin" />
          </div>
          <div>
            <p className="mr-side-name">Marin</p>
            <p className="mr-side-sub">Catálogo de Animes</p>
          </div>
        </div>

        {/* CTA: logar episódio */}
        <button
          className="mr-btn mr-btn--primary mr-side-cta"
          onClick={() => openLogModal()}
        >
          <Icon name="play" /> Logar ep
        </button>

        {/* Grupo: Acervo */}
        <nav className="mr-side-nav" aria-label="Acervo">
          <p className="mr-side-group-label">Acervo</p>
          {navAcervo.map(item => (
            <button
              key={item.id}
              className={`mr-side-item${view === item.id ? ' mr-side-item--active' : ''}`}
              onClick={() => navigateTo(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon as any} className="mr-side-icon" />
              <span className="mr-side-label">{item.label}</span>
              {item.count != null && item.count > 0 && (
                <span className="mr-side-badge">{item.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Grupo: Descobrir */}
        <nav className="mr-side-nav" aria-label="Descobrir">
          <p className="mr-side-group-label">Analisar</p>
          {navDescobrir.map(item => (
            <button
              key={item.id}
              className={`mr-side-item${view === item.id ? ' mr-side-item--active' : ''}`}
              onClick={() => navigateTo(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon as any} className="mr-side-icon" />
              <span className="mr-side-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Ações do rodapé da sidebar */}
        <div className="mr-side-footer">
          {/* Sync MAL */}
          <button
            className="mr-side-action"
            onClick={handleSyncMal}
            disabled={syncing}
            title="Sincronizar com MyAnimeList"
          >
            <Icon name="sync" className={syncing ? 'mr-spinning' : ''} />
            <span>{syncing ? 'Sincronizando...' : 'Sync MAL'}</span>
          </button>

          {/* Adicionar anime */}
          <button
            className="mr-side-action"
            onClick={() => setAddOpen(true)}
            title="Adicionar anime (a)"
          >
            <Icon name="plus" />
            <span>Adicionar</span>
          </button>

          {/* Configurações */}
          <button
            className="mr-side-action"
            onClick={() => setTweaksOpen(true)}
            title="Configurações"
          >
            <Icon name="stats" />
            <span>Configurações</span>
          </button>

          {/* Link de volta à Makima */}
          <a href="/" className="mr-side-action mr-side-back" title="Voltar à Makima">
            <Icon name="arrow-left" />
            <span>Makima</span>
          </a>
        </div>
      </aside>

      {/* ── Área principal ────────────────────────────────────────────────── */}
      <main className="mr-main">
        {/* Topbar com título da view atual + botão de adicionar */}
        <div className="mr-topbar">
          <h1 className="mr-topbar-title">
            {view === 'home'        ? 'Início'       :
             view === 'catalogo'    ? 'Catálogo'     :
             view === 'diario'      ? 'Diário'       :
             view === 'watchlist'   ? 'Watchlist'    :
             view === 'lancamentos' ? 'Lançamentos'  :
             view === 'stats'       ? 'Estatísticas' :
             view === 'detalhe'     ? 'Detalhe'      : ''}
          </h1>
          <button
            className="mr-btn mr-btn--primary"
            onClick={() => setAddOpen(true)}
            title="Adicionar anime"
          >
            + Anime
          </button>
        </div>

        {/* Conteúdo da view ativa */}
        <div className="mr-scroll">
          {view === 'home' && (
            <HomeScreen
              tweaks={tweaks}
              onSelectAnime={id => navigateTo('detalhe', id)}
              onLog={(animeId, ep) => openLogModal(animeId, ep)}
              onNav={screen => navigateTo(screen as MarinView)}
              onToast={showToast}
            />
          )}

          {view === 'catalogo' && (
            <CatalogScreen
              tweaks={tweaks}
              onSelectAnime={id => navigateTo('detalhe', id)}
            />
          )}

          {view === 'diario' && (
            <DiaryScreen
              onSelectAnime={id => navigateTo('detalhe', id)}
              onLog={() => openLogModal()}
            />
          )}

          {view === 'watchlist' && (
            <WatchlistScreen
              onSelectAnime={id => navigateTo('detalhe', id)}
              onStartAnime={id => openLogModal(id, 1)}
              onToast={showToast}
            />
          )}

          {view === 'lancamentos' && (
            <ScheduleScreen
              onSelectAnime={id => navigateTo('detalhe', id)}
            />
          )}

          {view === 'stats' && (
            <StatsScreen />
          )}

          {view === 'detalhe' && animeId && (
            <AnimeDetail
              animeId={animeId}
              onBack={() => navigateTo('catalogo')}
              onLog={(id, ep) => openLogModal(id, ep)}
              onToast={showToast}
            />
          )}
        </div>
      </main>

      {/* ── Modais ────────────────────────────────────────────────────────── */}
      {logModal.open && (
        <LogWatchModal
          animeId={logModal.animeId}
          defaultEp={logModal.ep}
          onSubmit={() => {
            setLogModal({ open: false })
            // Se está no detalhe, a tela se auto-atualiza no próximo acesso
          }}
          onClose={() => setLogModal({ open: false })}
          onToast={showToast}
        />
      )}

      {addOpen && (
        <AddAnimeModal
          onAdded={id => {
            setAddOpen(false)
            navigateTo('detalhe', id)
          }}
          onClose={() => setAddOpen(false)}
          onToast={showToast}
        />
      )}

      {tweaksOpen && (
        <MarinTweaks
          tweaks={tweaks}
          onChange={setTweaks}
          onClose={() => setTweaksOpen(false)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <Toast
          message={toast}
          onDismiss={() => setToast('')}
        />
      )}
    </div>
  )
}
