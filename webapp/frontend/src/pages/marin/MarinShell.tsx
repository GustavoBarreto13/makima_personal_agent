// Shell raiz da Marin — cinemateca de animes.
// Gerencia: sidebar, navegação interna por estado (sem React Router interno),
//           tweaks (tema/acento/densidade/ordenação), modais (log, add, tweaks),
//           toast, sincronização com MAL, NextBar (schedule de próximos eps),
//           busca global na topbar.
//
// Importa marin.css para aplicar os tokens OKLCH dentro de .marin-shell.

import './marin.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Tweaks, ScheduleItem } from './types'

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
import { Toast }    from './components/Toast'
import { Icon }     from './components/Icon'
import { NextBar }  from './components/NextBar'

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

// Mapa acento → valor do data-accent no DOM.
// O CSS define: [data-accent='neon'], [data-accent='sakura'], [data-accent='gold'].
// Rosa-Magenta é o acento BASE (sem data-accent ou data-accent='') — NÃO existe
// [data-accent='magenta'] no CSS, então usar string vazia para cair no base.
const ACCENT_MAP: Record<string, string> = {
  'Neon':         'neon',
  'Rosa-Magenta': '',       // base: rosa-magenta é o padrão sem atributo
  'Sakura':       'sakura',
  'Gold':         'gold',
}

// Mapa densidade → valor do data-density no DOM
const DENSITY_MAP: Record<string, string> = {
  'Grande':   'large',
  'Médio':    'medium',
  'Compacto': 'compact',
}

// Mapa de view → título com emoji para a topbar (fiel ao protótipo app.jsx)
const TITLES: Record<MarinView, string> = {
  home:        '📺 Início',
  catalogo:    '🎌 Catálogo',
  diario:      '📖 Diário',
  watchlist:   '⭐ Quero assistir',
  lancamentos: '📅 Lançamentos',
  stats:       '📊 Estatísticas',
  detalhe:     '🎞️ Anime',
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
 * Formata uma data futura de forma legível em pt-BR.
 * Retorna "Hoje", "Amanhã", "Ontem" ou "Dia, DD Mês" para datas mais distantes.
 *
 * @param dateStr - Data no formato "YYYY-MM-DD"
 * @returns String legível em pt-BR (ex.: "Qua, 18 Jun")
 */
function relFuture(dateStr: string): string {
  // Cria a data às 12h para evitar problemas com fuso horário ao comparar dias
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Diferença em dias (positivo = futuro, negativo = passado)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0)  return 'Hoje'
  if (diff === 1)  return 'Amanhã'
  if (diff === -1) return 'Ontem'
  // Para datas mais longes: "Dia, DD Mês" (ex.: "Qua, 18 Jun")
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
  return `${days[d.getDay()]}, ${d.getDate()} ${month}`
}

/**
 * MarinShell — root shell da Marin.
 * Toda navegação é via estado (view + animeId).
 * Modais abertos via flags de estado (logModal, addOpen, tweaksOpen).
 * NextBar exibe o próximo episódio do schedule, com paginação ‹ ›.
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
    catalogo?: number
  }>({})

  // Schedule de próximos episódios — alimenta a NextBar
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  // Índice atual na paginação da NextBar (‹ ›)
  const [scheduleIdx, setScheduleIdx] = useState(0)

  // Query de busca global da topbar
  const [topbarQuery, setTopbarQuery] = useState('')

  // Ref para o container de scroll (para reset ao navegar)
  const scrollRef = useRef<HTMLDivElement>(null)

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
          // Calcula total do catálogo como soma de todos os status
          const total = Object.values(res.counts as Record<string, number>)
            .reduce((acc: number, n) => acc + (n as number), 0)
          setNavCounts({
            assistindo: res.counts.assistindo ?? 0,
            watchlist:  res.counts.quero_assistir ?? 0,
            catalogo:   total,
          })
        }
      })
      .catch(() => {})
  }, [])

  // Busca o schedule dos próximos 14 dias para alimentar a NextBar
  useEffect(() => {
    marinApi.schedule(14)
      .then(r => {
        if (r.schedule && r.schedule.length > 0) {
          setSchedule(r.schedule)
          setScheduleIdx(0)  // reseta o índice ao carregar
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

  /**
   * Navega para uma nova view.
   * Limpa a busca da topbar ao sair do catálogo.
   * Reseta o scroll do container principal.
   */
  function navigateTo(v: MarinView, id?: string) {
    setView(v)
    if (id) setAnimeId(id)
    else if (v !== 'detalhe') setAnimeId(null)
    // Limpa a busca da topbar ao sair do catálogo
    if (v !== 'catalogo') setTopbarQuery('')
    // Reseta o scroll para o topo (fiel ao design: cada página começa do início)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  function openLogModal(animeIdArg?: string, ep?: number) {
    setLogModal({ open: true, animeId: animeIdArg, ep })
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

  // O nav "Acervo" agrupa as 4 views de catálogo pessoal (fiel ao design do protótipo)
  const navAcervo: { id: MarinView; label: string; icon: string; count?: number }[] = [
    { id: 'home',      label: 'Início',         icon: 'home'     },
    { id: 'catalogo',  label: 'Catálogo',        icon: 'list',    count: navCounts.catalogo },
    { id: 'diario',    label: 'Diário',          icon: 'book'     },
    { id: 'watchlist', label: 'Quero assistir',  icon: 'clock',   count: navCounts.watchlist },
  ]
  // O nav "Descobrir" agrupa lançamentos e stats (fiel ao design do protótipo)
  const navDescobrir: { id: MarinView; label: string; icon: string; count?: number }[] = [
    { id: 'lancamentos', label: 'Lançamentos',  icon: 'calendar', count: schedule.length || undefined },
    { id: 'stats',       label: 'Estatísticas', icon: 'stats'     },
  ]

  // Item do schedule atualmente exibido na NextBar
  const currentScheduleItem = schedule[scheduleIdx]

  return (
    <div
      className="marin-shell"
      data-theme={tweaks.tema === 'Claro' ? 'light' : 'dark'}
      data-accent={ACCENT_MAP[tweaks.acento] ?? 'neon'}
      data-density={DENSITY_MAP[tweaks.densidade] ?? 'medium'}
    >
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="mr-side">
        {/* Identidade da Marin: avatar redondo com anel de acento + nome */}
        <div className="mr-side-identity">
          <div className="mr-side-avatar">
            <img src="/marin.png" alt="Marin" />
          </div>
          <div className="mr-brand-text">
            <p className="mr-side-name">Marin</p>
            {/* "ANIMES" em caps monoespaçado — fiel ao protótipo */}
            <p className="mr-side-sub">ANIMES</p>
          </div>
        </div>

        {/* CTA: "+ Logar episódio" — botão principal destacado */}
        <button
          className="mr-btn mr-btn--primary mr-side-cta"
          onClick={() => openLogModal()}
        >
          <Icon name="plus" />
          <span className="mr-cta-label">Logar episódio</span>
        </button>

        {/* Grupo: Acervo — início, catálogo, diário, watchlist */}
        <nav className="mr-side-nav" aria-label="Acervo">
          <p className="mr-side-group-label">Acervo</p>
          {navAcervo.map(item => (
            <button
              key={item.id}
              className={`mr-side-item${view === item.id || (item.id === 'catalogo' && view === 'detalhe') ? ' mr-side-item--active' : ''}`}
              onClick={() => navigateTo(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon as any} className="mr-side-icon" />
              <span className="mr-side-label">{item.label}</span>
              {/* Contagem de itens — exibe só quando > 0 */}
              {item.count != null && item.count > 0 && (
                <span className="mr-side-badge">{item.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Grupo: Descobrir — lançamentos e estatísticas */}
        <nav className="mr-side-nav" aria-label="Descobrir">
          <p className="mr-side-group-label">Descobrir</p>
          {navDescobrir.map(item => (
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

        {/* Rodapé da sidebar: Sync MAL + Voltar à Makima (com ponto vermelho) */}
        <div className="mr-side-footer">
          {/* Sync MAL — ícone gira enquanto syncing=true */}
          <button
            className="mr-side-action"
            onClick={handleSyncMal}
            disabled={syncing}
            title="Sincronizar com MyAnimeList"
          >
            <Icon name="sync" className={syncing ? 'mr-spinning' : ''} />
            <span className="mr-sync-label">{syncing ? 'Sincronizando...' : 'Sync MAL'}</span>
          </button>

          {/* Configurações — ícone de stats como engrenagem (icon disponível) */}
          <button
            className="mr-side-action"
            onClick={() => setTweaksOpen(true)}
            title="Configurações (tweaks)"
          >
            <Icon name="stats" />
            <span>Configurações</span>
          </button>

          {/* Voltar à Makima — ponto vermelho + ícone + texto (fiel ao protótipo) */}
          <a href="/" className="mr-side-action mr-side-back" title="Voltar à Makima">
            {/* Ponto vermelho indicador — presente no design do protótipo */}
            <span className="mr-side-back-dot" aria-hidden="true" />
            <Icon name="arrow-left" />
            <span>Voltar à Makima</span>
          </a>
        </div>
      </aside>

      {/* ── Área principal ────────────────────────────────────────────────── */}
      <main className="mr-main">
        {/* Topbar: título com emoji + busca global + botão "+" redondo */}
        <div className="mr-topbar">
          {/* Título da view atual com emoji (fiel ao protótipo) */}
          <h1 className="mr-topbar-title">
            {TITLES[view] ?? TITLES.home}
          </h1>

          {/* Campo de busca global — navega para catálogo ao digitar */}
          <input
            className="mr-topbar-search"
            type="search"
            placeholder="Buscar anime, estúdio ou gênero…"
            value={topbarQuery}
            onChange={e => {
              const val = e.target.value
              setTopbarQuery(val)
              // Redireciona para o catálogo ao começar a digitar em outra tela
              if (val && view !== 'catalogo') navigateTo('catalogo')
            }}
            aria-label="Buscar anime, estúdio ou gênero"
          />

          {/* Botão "+" redondo — abre modal de adicionar anime (fiel ao protótipo) */}
          <button
            className="mr-topbar-add"
            onClick={() => setAddOpen(true)}
            title="Adicionar anime (a)"
            aria-label="Adicionar anime"
          >
            <Icon name="plus" />
          </button>
        </div>

        {/* Conteúdo da view ativa — scroll independente do header */}
        <div className="mr-scroll" ref={scrollRef}>
          {view === 'home' && (
            <HomeScreen
              tweaks={tweaks}
              onSelectAnime={id => navigateTo('detalhe', id)}
              onLog={(aid, ep) => openLogModal(aid, ep)}
              onNav={screen => navigateTo(screen as MarinView)}
              onToast={showToast}
            />
          )}

          {view === 'catalogo' && (
            <CatalogScreen
              tweaks={tweaks}
              onSelectAnime={id => navigateTo('detalhe', id)}
              externalQuery={topbarQuery}
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

      {/* ── NextBar — barra fixa de próximo episódio ──────────────────────── */}
      {/* Montada fora do <main> pois é position:fixed (não afeta o layout) */}
      {schedule.length > 0 && currentScheduleItem && (
        <NextBar
          episode={currentScheduleItem}
          animeTitle={currentScheduleItem.anime_title}
          animeId={currentScheduleItem.anime_id}
          animeKey={currentScheduleItem.poster_key}
          animeUrl={currentScheduleItem.poster_url}
          onLog={(id, ep) => openLogModal(id, ep)}
          onNavigate={id => navigateTo('detalhe', id)}
          hasNext={scheduleIdx < schedule.length - 1}
          hasPrev={scheduleIdx > 0}
          onNext={() => setScheduleIdx(i => Math.min(i + 1, schedule.length - 1))}
          onPrev={() => setScheduleIdx(i => Math.max(i - 1, 0))}
        />
      )}

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
