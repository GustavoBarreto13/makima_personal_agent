// Akane · Filmes — shell sobre o AppShell do Design System.
// Guarda a rota por hash (/movies-next#diario), os locais de assistir e as ações comuns (logar, navegar),
// que as telas leem pelo contexto.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { getAgent } from '../../design/core/agents'
import type { CaptureResult } from '../../design/core/capture'
import { todayISO } from '../../design/core/format'
import { toast } from '../../design/headless/toast'
import { usePrefs } from '../../design/headless/usePrefs'
import { AppShell, Button, SegmentedControl, SettingRow, type NavGroup } from '../../design'
import { akaneApi } from './akaneApi'
import { LogForm } from './components/LogForm'
import { AkaneContext, type AkaneCtx, type AkanePrefs, type OpenLog } from './context'
import { canSaveQuickly, draftFromCapture, emptyDraft, pickConfident, type CaptureIssues, type LogDraft } from './lib/log'
import { hashFor, routeFromHash, type Route, type ViewId } from './lib/routes'
import { submitLog } from './lib/submit'
import { Diary } from './screens/Diary'
import { Films, Watchlist } from './screens/Films'
import { Home } from './screens/Home'
import { Soon } from './screens/Soon'
import type { TmdbResult, WatchLocation } from './types'
import './akane.css'

const AGENT = getAgent('akane')

const NAV: NavGroup[] = [
  {
    label: 'Cinemateca',
    items: [
      { id: 'home', label: 'Início', icon: 'home', key: 'h' },
      { id: 'diary', label: 'Diário', icon: 'days', key: 'd' },
      { id: 'films', label: 'Filmes', icon: 'movie', key: 'f' },
      { id: 'watchlist', label: 'Quero ver', icon: 'watchlist', key: 'q' },
    ],
  },
  {
    label: 'Coleção',
    items: [
      { id: 'lists', label: 'Listas', icon: 'list' },
      { id: 'tags', label: 'Etiquetas', icon: 'tag' },
      { id: 'stats', label: 'Estatísticas', icon: 'stats', key: 'e' },
    ],
  },
]

const TITLES: Record<ViewId, string> = {
  home: 'Início', diary: 'Diário', films: 'Filmes', watchlist: 'Quero ver', lists: 'Listas', tags: 'Etiquetas', stats: 'Estatísticas',
}
const SUBTITLES: Record<ViewId, string> = {
  home: 'Sua cinemateca', diary: 'Cada sessão', films: 'O catálogo todo', watchlist: 'Para ver depois', lists: 'Coleções', tags: 'Etiquetas', stats: 'Retrospectiva',
}

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'noir', label: 'Cinema noir' }]

interface LogState { initial: LogDraft; results: TmdbResult[]; issues?: CaptureIssues }

export function AkaneShell() {
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs<AkanePrefs>('akane', { art: AGENT.art ?? 'noir', layout: 'grid' })
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [rev, setRev] = useState(0)
  const [locations, setLocations] = useState<WatchLocation[]>([])
  const [log, setLog] = useState<LogState | null>(null)
  const [syncing, setSyncing] = useState(false)

  const reload = useCallback(() => setRev((n) => n + 1), [])

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Locais de assistir: recarregam a cada gravação (um novo local pode ter nascido). Falhar não trava nada:
  // a linha rápida só deixa de reconhecer "@local" e abre o formulário.
  useEffect(() => {
    let live = true
    akaneApi.watchLocations().then((r) => { if (live) setLocations(r.locations) }).catch(() => { /* sem locais: segue */ })
    return () => { live = false }
  }, [rev])

  const goto = useCallback((to: Route | ViewId) => {
    const next: Route = typeof to === 'string' ? { view: to } : to
    setRoute(next)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}#${hashFor(next)}`)
  }, [])

  const save = useCallback(async (draft: LogDraft) => {
    const result = await submitLog(draft, akaneApi)
    reload()
    toast(result.message, {
      tone: 'success',
      undo: () => { result.undo().then(reload).catch(() => toast('Não foi possível desfazer. Confira no Diário.', { tone: 'error' })) },
    })
  }, [reload])

  const openLog = useCallback((open: OpenLog = {}) => {
    const base = open.draft ?? emptyDraft(today)
    setLog({ initial: open.film ? { ...base, film: open.film, title: open.film.title } : base, results: [] })
  }, [today])

  const quickLog = useCallback((r: CaptureResult, forceForm = false): boolean => {
    const { draft, issues } = draftFromCapture(r, { today, locations })
    if (!draft.title) { toast('Escreva o título do filme.'); return false }
    void (async () => {
      let results: TmdbResult[] = []
      try { results = (await akaneApi.tmdbSearch(draft.title)).results } catch { /* sem TMDB: o formulário deixa buscar de novo */ }
      const sure = pickConfident(draft.title, results)
      const d = sure ? { ...draft, film: sure } : draft
      if (forceForm || !sure || !canSaveQuickly(d, issues, today)) {
        if (issues.place) toast(`Não achei o local “@${issues.place}”. Escolha ou cadastre no formulário.`)
        setLog({ initial: d, results, issues })
        return
      }
      await save(d)
    })().catch((e: unknown) => toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' }))
    return true
  }, [today, locations, save])

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const r = await akaneApi.syncLetterboxd()
      reload()
      toast(`Letterboxd: ${r.created} novos, ${r.updated} atualizados`, { tone: 'success' })
    } catch { toast('Não foi possível sincronizar com o Letterboxd.', { tone: 'error' }) }
    setSyncing(false)
  }, [reload])

  const ctx = useMemo<AkaneCtx>(
    () => ({ rev, reload, today, route, goto, locations, prefs, setPrefs, openLog, save, quickLog }),
    [rev, reload, today, route, goto, locations, prefs, setPrefs, openLog, save, quickLog],
  )

  const SCREENS: Record<ViewId, () => ReactElement> = {
    home: () => <Home />, diary: () => <Diary />, films: () => <Films />, watchlist: () => <Watchlist />,
    lists: () => <Soon title="Listas" />, tags: () => <Soon title="Etiquetas" />, stats: () => <Soon title="Estatísticas" />,
  }
  // Detalhe de filme (#filme/<id>) e lista aberta (#lista/<id>) chegam na próxima etapa.
  const body = route.movieId ? <Soon title="Detalhe do filme" /> : route.listId ? <Soon title="Lista" /> : SCREENS[route.view]()

  return (
    <AkaneContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'akane', name: AGENT.name, subtitle: 'Filmes · Cinemateca', portrait: AGENT.portrait }}
        nav={NAV}
        active={route.movieId ? 'films' : route.listId ? 'lists' : route.view}
        onNavigate={(id) => goto(id as ViewId)}
        mobileTabs={['home', 'diary', 'films']}
        primary={{ label: 'Logar filme', icon: 'add', key: 'n', onClick: () => openLog() }}
        title={route.movieId ? 'Filme' : TITLES[route.view]}
        subtitle={route.movieId ? 'Detalhe' : SUBTITLES[route.view]}
        onGoAgent={(to) => navigate(to)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        commands={[
          { id: 'akane.log', label: 'Logar um filme', icon: 'movie', keywords: 'assisti sessão registrar', run: () => openLog() },
          { id: 'akane.sync', label: 'Sincronizar com o Letterboxd', icon: 'refresh', keywords: 'letterboxd rss importar', run: () => { void sync() } },
        ]}
        preferences={
          <>
            <SettingRow title="Mostrar filmes como" help="Vale para Filmes e Quero ver.">
              <SegmentedControl
                label="Layout de Filmes e Quero ver"
                value={prefs.layout}
                options={[{ value: 'grid', label: 'Pôsteres', icon: 'grid' }, { value: 'list', label: 'Lista', icon: 'list' }]}
                onChange={(layout) => setPrefs({ layout })}
              />
            </SettingRow>
            <SettingRow title="Letterboxd" help="Busca as sessões novas do seu perfil (acontece sozinho todo dia).">
              <Button icon="refresh" disabled={syncing} onClick={() => void sync()}>{syncing ? 'Sincronizando…' : 'Sincronizar agora'}</Button>
            </SettingRow>
          </>
        }
      >
        {body}
        {log && <LogForm key={log.initial.film?.tmdb_id ?? log.initial.title} initial={log.initial} initialResults={log.results} issues={log.issues} onClose={() => setLog(null)} />}
      </AppShell>
    </AkaneContext.Provider>
  )
}
