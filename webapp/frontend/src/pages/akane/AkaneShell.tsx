// Shell principal da seção Akane — cinemateca pessoal de filmes.
// Reformado na "reforma hi-fi" para seguir 1:1 o design handoff (spec 015):
// sidebar 252px (marca + Logar filme + nav com contagens), topbar 56px com
// busca pill, conteúdo com scroll e a barra "Próxima sessão" no rodapé.
// Toda a lógica de dados (akaneApi) foi preservada — só o visual mudou.

import { useState, useEffect, useCallback, useRef } from 'react'
import './akane.css'

// API e tipos
import { akaneApi } from './akaneApi'
import type { AkaneView, Movie, Tweaks } from './types'
import { TWEAK_DEFAULTS } from './types'

// Telas
import { FilmsScreen }      from './screens/FilmsScreen'
import { DiaryScreen }      from './screens/DiaryScreen'
import { WatchlistScreen }  from './screens/WatchlistScreen'
import { StatsScreen }      from './screens/StatsScreen'
import { HomeScreen }       from './screens/HomeScreen'
import { RewindScreen }     from './screens/RewindScreen'
import { ListsScreen }      from './screens/ListsScreen'
import { TagsScreen }       from './screens/TagsScreen'
import { MovieDetailScreen } from './screens/MovieDetailScreen'

// Modais e componentes
import { LogModal } from './modals/LogModal'
import { Toast }    from './components/Toast'
import { NextBar }  from './components/NextBar'
import { TweaksPanel } from './TweaksPanel'
import { Icon, type IconName } from './ui/Icon'

// ── Constantes de navegação ──────────────────────────────────────────────────

// Grupos da sidebar — ordem e ícones do design handoff §4.
// A tela Stats é adição do app real (não existe no protótipo) e entra no
// grupo Coleção com o mesmo tratamento visual.
const NAV_CINEMATECA: { id: AkaneView; icon: IconName; label: string }[] = [
  { id: 'home',      icon: 'inicio',    label: 'Início'    },
  { id: 'films',     icon: 'filmes',    label: 'Filmes'    },
  { id: 'diary',     icon: 'diario',    label: 'Diário'    },
  { id: 'watchlist', icon: 'watchlist', label: 'Quero ver' },
]

const NAV_COLECAO: { id: AkaneView; icon: IconName; label: string }[] = [
  { id: 'lists',  icon: 'listas', label: 'Listas'    },
  { id: 'tags',   icon: 'tags',   label: 'Etiquetas' },
  { id: 'rewind', icon: 'rewind', label: 'Rewind'    },
  { id: 'stats',  icon: 'clock',  label: 'Stats'     },
]

// Mapeamento de view → título do topbar
const TITLES: Record<string, string> = {
  home:      'Início',
  films:     'Filmes',
  diary:     'Diário',
  watchlist: 'Quero ver',
  lists:     'Listas',
  tags:      'Etiquetas',
  rewind:    'Rewind',
  stats:     'Estatísticas',
  detail:    'Filme',
}

// Views que têm conteúdo filtrável localmente — nas demais, digitar navega para "films"
const FILTERABLE_VIEWS = new Set(['films', 'diary', 'watchlist', 'lists', 'tags'])

// ── Helpers de tweaks (localStorage) ────────────────────────────────────────

const TWEAKS_KEY = 'akane-tweaks'

function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(TWEAKS_KEY)
    if (!raw) return { ...TWEAK_DEFAULTS }
    // O spread com os defaults protege contra chaves novas (ex.: postyle)
    // ausentes em preferências salvas antes da reforma
    return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...TWEAK_DEFAULTS }
  }
}

function saveTweaks(t: Tweaks) {
  try {
    localStorage.setItem(TWEAKS_KEY, JSON.stringify(t))
  } catch {}
}

// ── Shell ────────────────────────────────────────────────────────────────────

/**
 * Shell raiz da seção Akane.
 * Renderiza sidebar, topbar, tela ativa, NextBar, LogModal, Toast e Tweaks.
 */
export function AkaneShell() {
  // ── Navegação interna (state-based, a URL não muda) ───────────────────────
  const [view, setView] = useState<AkaneView>('home')
  // ID do filme em detalhe (usado quando view='detail')
  const [detailId, setDetailId] = useState<string | null>(null)
  // Tag ativa (filtro de tag clicada na tela de etiquetas)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // Query da caixa de busca da topbar — contextual à tela ativa
  const [query, setQuery] = useState('')
  // Ref do container de scroll: navegar zera o scrollTop (regra do handoff)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Tweaks (localStorage) ─────────────────────────────────────────────────
  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks)
  useEffect(() => { saveTweaks(tweaks) }, [tweaks])

  /** Atualiza um tweak individual (repassado ao TweaksPanel). */
  const setTweak = useCallback(<K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
    setTweaks(t => ({ ...t, [key]: value }))
  }, [])

  // ── Modal de log de sessão ────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false)
  const [logPrefilledId,    setLogPrefilledId]    = useState<string | null>(null)
  const [logPrefilledTitle, setLogPrefilledTitle] = useState<string | null>(null)

  /** Abre o modal de log — com ou sem filme pré-selecionado. */
  const openLog = useCallback((movieId?: string, title?: string) => {
    setLogPrefilledId(movieId ?? null)
    setLogPrefilledTitle(title ?? null)
    setLogOpen(true)
  }, [])

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)

  /** Exibe um toast por 2.6 segundos (duração do handoff). */
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }, [])

  // ── Sincronização manual com o Letterboxd (spec 051, US3) ─────────────────
  const [syncing, setSyncing] = useState(false)

  const syncLetterboxd = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await akaneApi.syncLetterboxd()
      showToast(`Sincronizado: ${r.created} novos, ${r.updated} atualizados, ${r.skipped} sem mudança.`)
    } catch {
      showToast('Falha ao sincronizar com o Letterboxd.')
    } finally {
      setSyncing(false)
    }
  }, [syncing, showToast])

  // ── Dados globais do shell: watchlist (NextBar) + contagens da nav ────────
  // A watchlist COMPLETA (não só a contagem) alimenta a barra "Próxima sessão".
  const [watchlist, setWatchlist] = useState<Movie[]>([])
  // Contagens dos badges da sidebar (filmes vistos / sessões do diário)
  const [counts, setCounts] = useState<{ films: number; diary: number } | null>(null)

  /** Recarrega watchlist + contagens (chamado no mount e após cada log). */
  const refreshShellData = useCallback(() => {
    akaneApi.watchlist()
      // Respostas antigas ou incompletas não podem quebrar a navegação inteira.
      .then(res => setWatchlist(res.movies ?? []))
      .catch(() => setWatchlist([]))
    akaneApi.home()
      .then(h => setCounts({ films: h.counts.films_watched, diary: h.counts.diary }))
      .catch(() => setCounts(null))
  }, [])

  useEffect(() => { refreshShellData() }, [refreshShellData])

  // ── Navegação ─────────────────────────────────────────────────────────────

  /** Zera o scroll do conteúdo (toda navegação volta ao topo). */
  const resetScroll = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }

  const goToDetail = useCallback((id: string) => {
    setDetailId(id)
    setView('detail')
    setQuery('')
    resetScroll()
  }, [])

  /** Volta para a tela anterior ao detalhe (filmes por padrão). */
  const goBack = useCallback(() => {
    setView('films')
    setDetailId(null)
    setQuery('')
    resetScroll()
  }, [])

  /** Navega para outra view da sidebar, sempre limpando detalhe e busca. */
  const goToView = useCallback((v: AkaneView) => {
    setView(v)
    setDetailId(null)
    setActiveTag(null)
    setQuery('')
    resetScroll()
  }, [])

  // Item da nav destacado: telas "filhas" destacam o pai (regra do handoff)
  const activeNav = view === 'detail' ? 'films' : view

  // ── Tela ativa ────────────────────────────────────────────────────────────
  function renderContent() {
    switch (view) {
      case 'home':
        return (
          <HomeScreen
            tweaks={tweaks}
            onSelectMovie={goToDetail}
            onLog={(id, title) => openLog(id, title)}
            onToast={showToast}
            onOpenLog={() => openLog()}
            onGoToView={goToView}
          />
        )
      case 'films':
        return (
          <FilmsScreen
            tweaks={tweaks}
            onSelectMovie={goToDetail}
            initialTag={activeTag}
            query={query}
          />
        )
      case 'diary':
        return <DiaryScreen onSelectMovie={goToDetail} query={query} />
      case 'watchlist':
        return (
          <WatchlistScreen
            onSelectMovie={goToDetail}
            onLogFilm={(id, title) => openLog(id, title)}
            query={query}
          />
        )
      case 'stats':
        return <StatsScreen />
      case 'detail':
        return detailId ? (
          <MovieDetailScreen
            movieId={detailId}
            onBack={goBack}
            onLog={(id, title) => openLog(id, title)}
            onToast={showToast}
          />
        ) : null
      case 'lists':
        return <ListsScreen onSelectMovie={goToDetail} query={query} />
      case 'tags':
        return (
          <TagsScreen
            onSelectTag={(tag) => {
              setActiveTag(tag)
              setView('films')
              setQuery('')
              resetScroll()
            }}
            query={query}
          />
        )
      case 'rewind':
        return <RewindScreen />
      default:
        return null
    }
  }

  /** Renderiza um item da nav (ícone + label + badge de contagem opcional). */
  const navItem = (item: { id: AkaneView; icon: IconName; label: string }) => {
    // Contagens: filmes vistos, sessões do diário e tamanho da watchlist
    const count =
      item.id === 'films'     ? counts?.films :
      item.id === 'diary'     ? counts?.diary :
      item.id === 'watchlist' ? (watchlist.length || null) :
      null
    return (
      <button
        key={item.id}
        className={'ak-nav-item' + (activeNav === item.id ? ' ak-active' : '')}
        onClick={() => goToView(item.id)}
        aria-current={view === item.id ? 'page' : undefined}
      >
        <Icon name={item.icon} /> <span>{item.label}</span>
        {count != null && count > 0 && <span className="ak-nav-count">{count}</span>}
      </button>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // Tema/acento/densidade/estilo-do-pôster entram como data-attrs no root
    // (o akane.css escopa todos os overrides em .akane-shell[data-*])
    <div
      className="akane-shell"
      data-theme={tweaks.theme}
      data-accent={tweaks.accent || undefined}
      data-density={tweaks.density}
      data-postyle={tweaks.postyle}
    >
      <div className="ak-app" data-footbar={watchlist.length > 0 ? 'on' : 'off'}>

        {/* ══ SIDEBAR ════════════════════════════════════════════════════════ */}
        <aside className="ak-side">
          {/* Marca: retrato da Akane com glow do acento + nome/função */}
          <div className="ak-side-brand">
            <div className="ak-brand-mark">
              <img
                src="/akane-hero.png"
                alt="Akane Kurokawa"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <div className="ak-brand-text">
              <div className="ak-brand-name">Akane</div>
              <div className="ak-brand-role">Filmes</div>
            </div>
          </div>

          {/* CTA principal — sempre visível */}
          <button className="ak-side-log-btn" onClick={() => openLog()} aria-label="Logar sessão de filme">
            <Icon name="plus" /> <span>Logar filme</span>
          </button>

          {/* Navegação em 2 grupos (Cinemateca / Coleção) + ações */}
          <nav className="ak-side-nav">
            <div className="ak-nav-group-label">Cinemateca</div>
            {NAV_CINEMATECA.map(navItem)}

            <div className="ak-nav-group-label">Coleção</div>
            {NAV_COLECAO.map(navItem)}

            {/* Sync manual do Letterboxd — extra do app real, estilizado como
                item da nav para não quebrar o ritmo visual da sidebar */}
            <div className="ak-nav-group-label">Ações</div>
            <button
              className={'ak-nav-item' + (syncing ? ' ak-syncing' : '')}
              onClick={syncLetterboxd}
              disabled={syncing}
              aria-label="Sincronizar com o Letterboxd"
            >
              <Icon name="sync" />
              <span>{syncing ? 'Sincronizando…' : 'Sync Letterboxd'}</span>
            </button>
          </nav>

          {/* Rodapé: voltar ao hub */}
          <div className="ak-side-foot">
            <a className="ak-back-makima" href="/" title="Voltar à página principal">
              <span className="ak-dot" /> Voltar à Makima
            </a>
          </div>
        </aside>

        {/* ══ ÁREA PRINCIPAL ═════════════════════════════════════════════════ */}
        <main className="ak-main">
          {/* Topbar: título da rota + busca pill */}
          <div className="ak-topbar">
            <span className="ak-topbar-title">{TITLES[view] ?? 'Akane'}</span>
            <div className="ak-topbar-spacer" />
            <div className="ak-search">
              <Icon name="search" />
              <input
                value={query}
                placeholder="Buscar título ou diretor…"
                aria-label="Buscar na Akane"
                onChange={e => {
                  const val = e.target.value
                  setQuery(val)
                  // Telas sem lista própria: digitar navega para Filmes filtrado
                  if (val && !FILTERABLE_VIEWS.has(view)) {
                    setView('films')
                    setDetailId(null)
                  }
                }}
              />
            </div>
          </div>

          {/* Conteúdo com scroll */}
          <div className="ak-scroll" ref={scrollRef}>
            {renderContent()}
          </div>
        </main>

        {/* ══ BARRA "PRÓXIMA SESSÃO" ═════════════════════════════════════════ */}
        <NextBar
          watchlist={watchlist}
          onOpenDetail={goToDetail}
          onLog={(id, title) => openLog(id, title)}
        />
      </div>

      {/* ══ MODAIS E OVERLAYS ════════════════════════════════════════════════ */}

      {logOpen && (
        <LogModal
          prefilledMovieId={logPrefilledId}
          prefilledTitle={logPrefilledTitle}
          onClose={() => {
            setLogOpen(false)
            setLogPrefilledId(null)
            setLogPrefilledTitle(null)
          }}
          onSuccess={(msg) => {
            showToast(msg)
            // Logar pode tirar um filme da watchlist e muda as contagens
            refreshShellData()
          }}
        />
      )}

      {toast && <Toast message={toast} />}

      {/* Painel de tweaks flutuante (Tema/Acento/Densidade/Pôster/Ordenação) */}
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} />
    </div>
  )
}
