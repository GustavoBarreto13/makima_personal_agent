// Marin · Animes — shell sobre o AppShell do Design System (spec 074).
// Guarda a rota por hash (/animes#diario, /animes#anime/<id>), o catálogo (que várias telas usam: contagens do
// menu, linha rápida, busca do topo e da paleta Ctrl+K) e as ações comuns (logar episódio, adicionar anime,
// sincronizar com o MyAnimeList, navegar), que as telas leem pelo contexto.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { getAgent } from '../../design/core/agents'
import type { CaptureResult } from '../../design/core/capture'
import { todayISO } from '../../design/core/format'
import { useCommandProvider, type CommandProvider } from '../../design/headless/commands'
import { toast } from '../../design/headless/toast'
import { useHotkeys } from '../../design/headless/useHotkeys'
import { usePrefs } from '../../design/headless/usePrefs'
import { AppShell, Button, Select, SegmentedControl, SettingRow, type NavGroup } from '../../design'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'
import { AddAnimeForm } from './components/AddAnimeForm'
import { LogForm } from './components/LogForm'
import { ScreenBoundary } from './components/ScreenBoundary'
import { DEFAULT_PREFS, MarinContext, type MarinCtx, type MarinPrefs, type OpenLog } from './context'
import { canSaveQuickly, draftFromCapture, emptyDraft, nextEpisode, norm, type LogDraft } from './lib/log'
import { clearLegacyFavorites, legacyFavoriteIds, legacyPrefs } from './lib/legacy'
import { hashFor, routeFromHash, type Route, type ViewId } from './lib/routes'
import { submitLog } from './lib/submit'
import { useLoad } from './lib/useLoad'
import { marinApi } from './marinApi'
import { AnimeDetail } from './screens/AnimeDetail'
import { Catalog, Queue } from './screens/Catalog'
import { Diary } from './screens/Diary'
import { Home } from './screens/Home'
import { ListDetail, Lists } from './screens/Lists'
import { Schedule } from './screens/Schedule'
import { Stats } from './screens/Stats'
import { Tags } from './screens/Tags'
import type { Anime } from './types'
import './marin.css'

const AGENT = getAgent('marin')

const TITLES: Record<ViewId, string> = {
  home: 'Início', catalog: 'Catálogo', queue: 'Quero assistir', diary: 'Diário', schedule: 'Lançamentos', lists: 'Listas', tags: 'Etiquetas', stats: 'Estatísticas',
}
const SUBTITLES: Record<ViewId, string> = {
  home: 'Seu catálogo', catalog: 'Todos os animes', queue: 'A fila de próximos', diary: 'Cada sessão de episódios', schedule: 'Os próximos 14 dias',
  lists: 'Coleções', tags: 'Etiquetas', stats: 'Seu ano em animes',
}

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'neon', label: 'Neon kawaii' }]

// Referência estável enquanto carrega (as telas e coleções dependem dela).
const NO_ANIMES: Anime[] = []

type Dialog = { kind: 'log'; draft: LogDraft } | { kind: 'add'; title: string } | null

export function MarinShell() {
  useDocumentTitle(AGENT_TABS.marin.title, AGENT_TABS.marin.icon)
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs<MarinPrefs>('marin', useMemo(() => legacyPrefs({ ...DEFAULT_PREFS, art: AGENT.art ?? DEFAULT_PREFS.art }), []))
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [rev, setRev] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [topQuery, setTopQuery] = useState('')
  const [syncing, setSyncing] = useState(false)

  const reload = useCallback(() => setRev((n) => n + 1), [])

  // Catálogo: recarrega a cada gravação (rev).
  const { state: animesState, retry: retryAnimes } = useLoad(() => marinApi.list(), [rev])
  const animes = animesState.status === 'ok' ? animesState.data : NO_ANIMES

  // Voltar/avançar do navegador (popstate) e links com #… (hashchange) trocam de tela.
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  // Os favoritos do shell antigo viviam só neste navegador. Na primeira visita com o catálogo carregado, sobem para
  // o servidor (se ele ainda não tem vitrine) e a chave antiga é apagada, para nunca sobrescrever uma escolha nova.
  useEffect(() => {
    if (animesState.status !== 'ok') return
    const ids = legacyFavoriteIds().filter((id) => animesState.data.some((a) => a.id === id))
    if (ids.length === 0) { clearLegacyFavorites(); return }
    let live = true
    marinApi.favorites()
      .then(async (current) => {
        if (current.length === 0) await marinApi.setFavorites(ids)
        clearLegacyFavorites()
        if (live && current.length === 0) reload()
      })
      .catch(() => { /* sem rede agora: a chave antiga fica e a migração tenta na próxima visita */ })
    return () => { live = false }
  }, [animesState, reload])

  // Navegar grava no histórico (pushState): o Voltar do navegador volta para a tela anterior.
  const goto = useCallback((to: Route | ViewId) => {
    const next: Route = typeof to === 'string' ? { view: to } : to
    setRoute(next)
    const url = `${window.location.pathname}#${hashFor(next)}`
    if (window.location.hash !== `#${hashFor(next)}`) window.history.pushState(window.history.state, '', url)
    window.scrollTo?.({ top: 0 })
  }, [])

  const saveLog = useCallback(async (draft: LogDraft) => {
    const anime = animes.find((a) => a.id === draft.animeId)
    if (!anime) throw new Error('Escolha o anime.')
    const result = await submitLog(draft, anime, marinApi)
    reload()
    toast(result.message, {
      tone: 'success',
      undo: () => { result.undo().then(reload).catch(() => toast('Não foi possível desfazer. Confira no Diário.', { tone: 'error' })) },
    })
  }, [animes, reload])

  const openLog = useCallback((open: OpenLog = {}) => {
    if (open.draft) { setDialog({ kind: 'log', draft: open.draft }); return }
    // Sem anime escolhido: sugere o único que está sendo assistido.
    const watching = animes.filter((a) => a.status === 'assistindo')
    const id = open.animeId ?? (watching.length === 1 ? watching[0].id : null)
    const anime = animes.find((a) => a.id === id)
    setDialog({ kind: 'log', draft: emptyDraft(today, id, open.episode ?? (anime ? nextEpisode(anime) : null)) })
  }, [animes, today])

  const openAdd = useCallback((title = '') => setDialog({ kind: 'add', title }), [])

  const quickLog = useCallback((r: CaptureResult, forceForm = false): boolean => {
    const draft = draftFromCapture(r, { today, animes })
    const anime = animes.find((a) => a.id === draft.animeId) ?? null
    // Anime digitado que não está no catálogo: oferece adicionar em vez de abrir um formulário vazio.
    if (!anime && draft.title && !animes.some((a) => norm(a.title).includes(norm(draft.title)))) {
      toast(`“${draft.title}” não está no catálogo.`)
      setDialog({ kind: 'add', title: draft.title })
      return true
    }
    if (forceForm || !canSaveQuickly(draft, anime, today)) {
      setDialog({ kind: 'log', draft })
      return true
    }
    void saveLog(draft).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' }))
    return true
  }, [today, animes, saveLog])

  const syncMal = useCallback(async (full = false) => {
    setSyncing(true)
    try {
      const r = await marinApi.syncMal(full)
      reload()
      const changed = r.created + r.updated
      toast(changed ? `MyAnimeList: ${r.created} novos, ${r.updated} atualizados` : 'MyAnimeList: nada de novo', { tone: r.errors?.length ? 'error' : 'success' })
    } catch { toast('Não foi possível sincronizar com o MyAnimeList.', { tone: 'error' }) }
    setSyncing(false)
  }, [reload])

  const clearTopQuery = useCallback(() => setTopQuery(''), [])

  const ctx = useMemo<MarinCtx>(
    () => ({
      rev, reload, today, route, goto, animes, animesState, retryAnimes, prefs, setPrefs,
      openLog, openAdd, quickLog, saveLog, syncMal, syncing, topQuery, clearTopQuery,
    }),
    [rev, reload, today, route, goto, animes, animesState, retryAnimes, prefs, setPrefs, openLog, openAdd, quickLog, saveLog, syncMal, syncing, topQuery, clearTopQuery],
  )

  // Atalho "A": adicionar anime (como no shell antigo). Atalhos de uma tecla não valem dentro de campos de texto.
  useHotkeys([{ keys: 'a', handler: (e) => { e.preventDefault(); openAdd() } }])

  // Paleta Ctrl+K: busca animes por título (qualquer idioma) ou estúdio e abre a página do anime.
  const provider = useMemo<CommandProvider>(() => ({
    id: 'marin.animes',
    search: (q) => {
      const n = norm(q)
      if (n.length < 2) return []
      return animes
        .filter((a) => [a.title, a.titleEnglish, a.titleJapanese, a.studio].some((x) => norm(x).includes(n)))
        .slice(0, 8)
        .map((a) => ({ id: `anime:${a.id}`, label: a.studio ? `${a.title} · ${a.studio}` : a.title, group: 'Animes', icon: 'anime', run: () => goto({ view: 'catalog', animeId: a.id }) }))
    },
  }), [animes, goto])
  useCommandProvider(provider)

  // Contagens do menu (como o shell antigo mostrava ao lado de cada item).
  const nav: NavGroup[] = [
    {
      label: 'Acervo',
      items: [
        { id: 'home', label: 'Início', icon: 'home', key: 'h' },
        { id: 'catalog', label: 'Catálogo', icon: 'anime', key: 'c', count: animes.length || undefined },
        { id: 'diary', label: 'Diário', icon: 'days', key: 'd' },
        { id: 'queue', label: 'Quero assistir', icon: 'watchlist', key: 'q', count: animes.filter((a) => a.status === 'quero_assistir').length || undefined },
      ],
    },
    {
      label: 'Descobrir',
      items: [
        { id: 'schedule', label: 'Lançamentos', icon: 'airing', key: 'l' },
        { id: 'stats', label: 'Estatísticas', icon: 'stats', key: 'e' },
        { id: 'lists', label: 'Listas', icon: 'list' },
        { id: 'tags', label: 'Etiquetas', icon: 'tag' },
      ],
    },
  ]

  const SCREENS: Record<ViewId, () => ReactElement> = {
    home: () => <Home />, catalog: () => <Catalog />, queue: () => <Queue />, diary: () => <Diary />,
    schedule: () => <Schedule />, lists: () => <Lists />, tags: () => <Tags />, stats: () => <Stats />,
  }
  // Anime aberto (#anime/<id>) e lista aberta (#lista/<id>) ficam na URL; senão vale a tela do menu.
  const body = route.animeId ? <AnimeDetail id={route.animeId} /> : route.listId ? <ListDetail id={route.listId} /> : SCREENS[route.view]()

  return (
    <MarinContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'marin', name: AGENT.name, subtitle: 'Animes · Catálogo', portrait: AGENT.portrait }}
        nav={nav}
        active={route.animeId ? 'catalog' : route.listId ? 'lists' : route.view}
        onNavigate={(id) => goto(id as ViewId)}
        mobileTabs={['home', 'catalog', 'diary']}
        primary={{ label: 'Logar episódio', icon: 'add', key: 'n', onClick: () => openLog() }}
        title={route.animeId ? 'Anime' : route.listId ? 'Lista' : TITLES[route.view]}
        subtitle={route.animeId || route.listId ? 'Detalhe' : SUBTITLES[route.view]}
        // Busca do topo: leva para o Catálogo já filtrado (título, estúdio, gênero ou etiqueta).
        search={{ placeholder: 'Buscar anime…', onSubmit: (q) => { setTopQuery(q); goto('catalog') } }}
        onGoAgent={(to) => navigate(to)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        commands={[
          { id: 'marin.log', label: 'Logar episódio', icon: 'episode', keywords: 'assisti sessão registrar ep', run: () => openLog() },
          { id: 'marin.add', label: 'Adicionar anime', icon: 'add', keywords: 'novo jikan myanimelist cadastrar', run: () => openAdd() },
          { id: 'marin.sync', label: 'Sincronizar com o MyAnimeList', icon: 'refresh', keywords: 'mal sync importar', run: () => { void syncMal(false) } },
          { id: 'marin.schedule', label: 'Ver lançamentos', icon: 'airing', keywords: 'episódios novos agenda calendário', run: () => goto('schedule') },
        ]}
        preferences={
          <>
            <SettingRow title="Mostrar animes como" help="Vale para o Catálogo, o Quero assistir e as Listas.">
              <SegmentedControl
                label="Layout do Catálogo"
                value={prefs.layout}
                options={[{ value: 'grid', label: 'Pôsteres', icon: 'grid' }, { value: 'list', label: 'Lista', icon: 'list' }]}
                onChange={(layout) => setPrefs({ layout })}
              />
            </SettingRow>
            <SettingRow title="Tamanho dos pôsteres" help="A densidade da grade de animes.">
              <SegmentedControl
                label="Tamanho dos pôsteres"
                value={prefs.density}
                options={[{ value: 'large', label: 'Grande' }, { value: 'medium', label: 'Médio' }, { value: 'compact', label: 'Compacto' }]}
                onChange={(density) => setPrefs({ density })}
              />
            </SettingRow>
            <SettingRow title="Ordem inicial do Catálogo" help="Você ainda pode mudar a ordem na própria tela.">
              <Select aria-label="Ordem inicial do Catálogo" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as MarinPrefs['sort'] })}>
                <option value="updated">Atualizado</option>
                <option value="added">Adicionado</option>
                <option value="rating">Nota</option>
                <option value="title">Título</option>
                <option value="progress">Progresso</option>
              </Select>
            </SettingRow>
            <SettingRow title="MyAnimeList" help="Traz as mudanças feitas lá (acontece sozinho a cada 6 horas). O completo reprocessa a lista inteira.">
              <div className="ds-inline">
                <Button icon="refresh" disabled={syncing} onClick={() => void syncMal(false)}>{syncing ? 'Sincronizando…' : 'Sincronizar agora'}</Button>
                <Button variant="ghost" disabled={syncing} onClick={() => void syncMal(true)}>Sync completo</Button>
              </div>
            </SettingRow>
          </>
        }
      >
        <ScreenBoundary resetKey={hashFor(route)} onHome={() => goto('home')}>{body}</ScreenBoundary>
        {dialog?.kind === 'log' && <LogForm key={`${dialog.draft.animeId}-${dialog.draft.title}-${dialog.draft.epStart}`} initial={dialog.draft} onClose={() => setDialog(null)} />}
        {dialog?.kind === 'add' && <AddAnimeForm initialTitle={dialog.title} onClose={() => setDialog(null)} />}
      </AppShell>
    </MarinContext.Provider>
  )
}
