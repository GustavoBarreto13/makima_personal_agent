// Shell principal da seção Akane — cinemateca pessoal de filmes.
// Gerencia navegação interna (state-based, sem poluir a URL), tweaks,
// modal de log de sessão, toast e carregamento de dados globais.

import { useState, useEffect, useCallback } from 'react'
import './akane.css'

// API e tipos
import { akaneApi } from './akaneApi'
import type { AkaneView, Tweaks } from './types'
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

// Modais
import { LogModal } from './modals/LogModal'

// Componentes
import { Toast } from './components/Toast'

// ── Constantes de navegação ──────────────────────────────────────────────────

// Grupos de navegação da sidebar — ordem conforme design guide §3
const NAV_CINEMATECA = [
  { id: 'home',      icon: '⊞', label: 'Início'    },
  { id: 'films',     icon: '◈', label: 'Filmes'    },
  { id: 'diary',     icon: '☾', label: 'Diário'    },
  { id: 'watchlist', icon: '♦', label: 'Quero ver' },
] as const

const NAV_COLECAO = [
  { id: 'lists',   icon: '⊟', label: 'Listas'    },
  { id: 'tags',    icon: '⊕', label: 'Etiquetas' },
  { id: 'rewind',  icon: '↺', label: 'Rewind'    },
  { id: 'stats',   icon: '◎', label: 'Stats'     },
] as const

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
  detail:    'Detalhes',
}

// ── Helpers de tweaks (localStorage) ────────────────────────────────────────

const TWEAKS_KEY = 'akane-tweaks'

function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(TWEAKS_KEY)
    if (!raw) return { ...TWEAK_DEFAULTS }
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
 * Renderiza a sidebar com navegação, o topbar e a tela ativa.
 * Gerencia tweaks, modais e toast.
 */
export function AkaneShell() {
  // ── Navegação interna ──────────────────────────────────────────────────────
  const [view, setView] = useState<AkaneView>('home')
  // ID do filme em detalhe (usado quando view='detail')
  const [detailId, setDetailId] = useState<string | null>(null)
  // Tag ativa (filtro de tag clicada na tela de etiquetas)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // ── Tweaks (localStorage) ─────────────────────────────────────────────────
  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks)

  // Persiste os tweaks sempre que mudam
  useEffect(() => { saveTweaks(tweaks) }, [tweaks])

  // ── Modal de log de sessão ────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false)
  // ID e título pré-preenchidos (quando aberto do detalhe/watchlist)
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

  /** Exibe um toast por 2.5 segundos. */
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  // ── Contadores da sidebar (watchlist) ─────────────────────────────────────
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null)

  useEffect(() => {
    // Busca a contagem da watchlist para o badge da sidebar
    akaneApi.watchlist()
      .then(res => setWatchlistCount(res.movies.length))
      .catch(() => setWatchlistCount(null))
  }, [])

  // ── Navegação para detalhe do filme ──────────────────────────────────────
  const goToDetail = useCallback((id: string) => {
    setDetailId(id)
    setView('detail')
  }, [])

  /** Volta para a tela anterior ao detalhe (filmes por padrão). */
  const goBack = useCallback(() => {
    setView('films')
    setDetailId(null)
  }, [])

  // ── Tela ativa ────────────────────────────────────────────────────────────
  function renderContent() {
    switch (view) {
      case 'home':
        // Tela Início — resumo completo da cinemateca (Onda 4)
        return (
          <HomeScreen
            tweaks={tweaks}
            onSelectMovie={goToDetail}
            onLog={(id, title) => openLog(id, title)}
            onToast={showToast}
          />
        )
      case 'films':
        return (
          <FilmsScreen
            tweaks={tweaks}
            onSelectMovie={goToDetail}
            initialTag={activeTag}
          />
        )
      case 'diary':
        return <DiaryScreen onSelectMovie={goToDetail} />
      case 'watchlist':
        return (
          <WatchlistScreen
            onSelectMovie={goToDetail}
            onLogFilm={(id, title) => openLog(id, title)}
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
        // Tela de listas/coleções temáticas (Onda 5)
        return <ListsScreen onSelectMovie={goToDetail} />
      case 'tags':
        // Tela de etiquetas: clicar na tag navega para FilmsScreen filtrada
        return (
          <TagsScreen
            onSelectTag={(tag) => {
              setActiveTag(tag)
              setView('films')
            }}
          />
        )
      case 'rewind':
        // Tela Rewind — year-in-review cinematográfico (Onda 4)
        return <RewindScreen />
      default:
        return null
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    // Aplica tokens OKLCH do domínio + tema + acento como data-attrs no root
    <div
      className="akane-shell"
      data-theme={tweaks.theme}
      data-accent={tweaks.accent || undefined}
      data-density={tweaks.density}
    >
      <div className="ak-app">

        {/* ══ SIDEBAR ════════════════════════════════════════════════════════ */}
        <aside className="ak-sidebar">
          {/* Marca Akane + avatar */}
          <div className="ak-sidebar-mark">
            {/* Círculo com imagem da Akane + glow do acento */}
            <div className="ak-avatar">
              {/* akane-hero.png deve estar em public/ */}
              <img
                src="/akane.png"
                alt="Akane"
                onError={e => {
                  // Se a imagem não estiver disponível, oculta o elemento
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
            <div>
              <p className="ak-brand-name">Akane</p>
              <p className="ak-brand-sub">Filmes</p>
            </div>
          </div>

          {/* Botão "Logar filme" — CTA principal */}
          <button
            className="ak-log-btn"
            onClick={() => openLog()}
            aria-label="Logar sessão de filme"
          >
            <span>▶</span>
            <span>Logar filme</span>
          </button>

          {/* Navegação */}
          <nav className="ak-nav">
            {/* Grupo Cinemateca */}
            <div className="ak-nav-group">
              <span className="ak-nav-label">Cinemateca</span>
              {NAV_CINEMATECA.map(item => (
                <button
                  key={item.id}
                  className={`ak-nav-item${view === item.id || (view === 'detail' && item.id === 'films') ? ' active' : ''}`}
                  onClick={() => {
                    setView(item.id as AkaneView)
                    // Navegar via sidebar sempre limpa o detalhe — nenhum item da
                    // NAV_CINEMATECA tem id='detail', então o check anterior era sempre true
                    setDetailId(null)
                  }}
                  aria-current={view === item.id ? 'page' : undefined}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {/* Badge de contagem para a watchlist */}
                  {item.id === 'watchlist' && watchlistCount !== null && watchlistCount > 0 && (
                    <span className="ak-nav-badge">{watchlistCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Grupo Coleção */}
            <div className="ak-nav-group">
              <span className="ak-nav-label">Coleção</span>
              {NAV_COLECAO.map(item => (
                <button
                  key={item.id}
                  className={`ak-nav-item${view === item.id ? ' active' : ''}`}
                  onClick={() => { setView(item.id as AkaneView); setDetailId(null) }}
                  aria-current={view === item.id ? 'page' : undefined}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* ── Tweaks rápidos (tema + acento) ──────────────────────── */}
            <div className="ak-nav-group">
              <span className="ak-nav-label">Aparência</span>
              {/* Toggle de tema */}
              <button
                className="ak-nav-item"
                onClick={() => setTweaks(t => ({ ...t, theme: t.theme === 'dark' ? 'light' : 'dark' }))}
                title={tweaks.theme === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>
                  {tweaks.theme === 'dark' ? '☾' : '☼'}
                </span>
                <span>{tweaks.theme === 'dark' ? 'Tema escuro' : 'Tema claro'}</span>
              </button>
              {/* Seletor de acento */}
              <div style={{ padding: '4px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>Acento:</span>
                {[
                  { value: 'teal',   color: 'oklch(0.66 0.115 196)' },
                  { value: '',       color: 'oklch(0.655 0.205 357)' },
                  { value: 'carmim', color: 'oklch(0.605 0.215 22)' },
                  { value: 'ambar',  color: 'oklch(0.74 0.155 66)' },
                ].map(a => (
                  <button
                    key={a.value}
                    onClick={() => setTweaks(t => ({ ...t, accent: a.value as Tweaks['accent'] }))}
                    title={a.value || 'Rosa'}
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: a.color,
                      border: tweaks.accent === a.value ? '2px solid var(--ink)' : '2px solid transparent',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'border 0.12s',
                    }}
                  />
                ))}
              </div>
            </div>
          </nav>

          {/* Footer: voltar à Makima */}
          <div className="ak-sidebar-footer">
            <a
              href="/"
              className="ak-back-btn"
              title="Voltar à página principal"
            >
              <span>←</span>
              <span>Voltar à Makima</span>
            </a>
          </div>
        </aside>

        {/* ══ ÁREA PRINCIPAL ══════════════════════════════════════════════════ */}
        <main className="ak-main">
          {/* Topbar com título da seção atual */}
          <div className="ak-topbar">
            <span className="ak-topbar-title">
              {view === 'detail' && detailId
                ? '← Detalhes do filme'
                : TITLES[view] ?? 'Filmes'
              }
            </span>
          </div>

          {/* Conteúdo com scroll */}
          <div className="ak-content">
            {renderContent()}
          </div>
        </main>

        {/* ══ NEXTBAR (barra de próxima sessão — futura Onda 4) ══════════════ */}
        {/* Por enquanto, exibe a contagem de filmes na watchlist como dica */}
        {watchlistCount !== null && watchlistCount > 0 && view !== 'watchlist' && (
          <div className="ak-nextbar">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              ♦ {watchlistCount} {watchlistCount === 1 ? 'filme' : 'filmes'} na watchlist
            </span>
            <button
              className="ak-btn"
              onClick={() => setView('watchlist')}
              style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }}
            >
              Ver lista →
            </button>
          </div>
        )}
      </div>

      {/* ══ MODAIS E OVERLAYS ══════════════════════════════════════════════ */}

      {/* Modal de log de sessão */}
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
            // Atualiza o contador da watchlist após logar
            akaneApi.watchlist()
              .then(res => setWatchlistCount(res.movies.length))
              .catch(() => {})
          }}
        />
      )}

      {/* Toast de feedback */}
      {toast && <Toast message={toast} />}
    </div>
  )
}

// Placeholder removido — todas as telas das 5 ondas já estão implementadas
