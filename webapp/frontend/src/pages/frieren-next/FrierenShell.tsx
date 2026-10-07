// Frieren · Livros — shell sobre o AppShell do Design System (spec 073).
// Guarda a rota por hash (/books#diario, /books#livro/<id>), o catálogo e as estantes (que várias telas usam:
// contagens do menu, linha rápida, busca do topo e da paleta Ctrl+K) e as ações comuns (registrar leitura,
// adicionar livro, navegar), que as telas leem pelo contexto.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { getAgent } from '../../design/core/agents'
import type { CaptureResult } from '../../design/core/capture'
import { todayISO } from '../../design/core/format'
import { useCommandProvider, type CommandProvider } from '../../design/headless/commands'
import { toast } from '../../design/headless/toast'
import { usePrefs } from '../../design/headless/usePrefs'
import { AppShell, NumberInput, SegmentedControl, SettingRow, type NavGroup } from '../../design'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'
import { AddBookForm } from './components/AddBookForm'
import { LogForm } from './components/LogForm'
import { ScreenBoundary } from './components/ScreenBoundary'
import { DEFAULT_PREFS, FrierenContext, type FrierenCtx, type FrierenPrefs, type OpenLog } from './context'
import { frierenApi } from './frierenApi'
import { canSaveQuickly, draftFromCapture, emptyDraft, norm, type LogDraft } from './lib/log'
import { hashFor, routeFromHash, type Route, type ViewId } from './lib/routes'
import { TO_READ } from './lib/status'
import { submitLog } from './lib/submit'
import { useLoad } from './lib/useLoad'
import { BookDetail } from './screens/BookDetail'
import { Diary } from './screens/Diary'
import { Home } from './screens/Home'
import { Library, ToRead, Wishlist } from './screens/Library'
import { Reviews } from './screens/Reviews'
import { ShelfView, Shelves } from './screens/Shelves'
import { Stats } from './screens/Stats'
import type { Book, Shelf } from './types'
import './frieren.css'

const AGENT = getAgent('frieren')

const TITLES: Record<ViewId, string> = {
  home: 'Início', catalog: 'Biblioteca', toread: 'Quero ler', wishlist: 'Wishlist', diary: 'Diário',
  shelves: 'Estantes', reviews: 'Resenhas', stats: 'Estatísticas',
}
const SUBTITLES: Record<ViewId, string> = {
  home: 'Sua biblioteca', catalog: 'Todos os livros', toread: 'A pilha de próximos', wishlist: 'Para comprar',
  diary: 'Cada sessão de leitura', shelves: 'Coleções', reviews: 'O que ficou de cada livro', stats: 'Seu ano em leitura',
}

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'elfica', label: 'Biblioteca élfica' }]

// Referências estáveis enquanto carrega (as telas e coleções dependem delas).
const NO_BOOKS: Book[] = []
const NO_SHELVES: Shelf[] = []

type Dialog = { kind: 'log'; draft: LogDraft } | { kind: 'add'; title: string } | null

/** Preferências do shell antigo ("fr-tweaks" no navegador) viram o ponto de partida das novas, para quem já
 *  tinha escolhido densidade e estilo do topo não perder a escolha. Só vale enquanto não há preferência nova
 *  salva (o usePrefs usa estes valores apenas como padrão). Exportada para teste. */
export function legacyPrefs(base: FrierenPrefs, storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()): FrierenPrefs {
  try {
    const raw = storage?.getItem('fr-tweaks')
    if (!raw) return base
    const old = JSON.parse(raw) as { densidade?: string; layoutInicio?: string }
    const density = ({ Grande: 'large', 'Médio': 'medium', Compacto: 'compact' } as const)[old.densidade as 'Grande'] ?? base.density
    const heroLayout = ({ 'Cinemático': 'cinematic', Editorial: 'editorial', Galeria: 'gallery' } as const)[old.layoutInicio as 'Editorial'] ?? base.heroLayout
    return { ...base, density, heroLayout }
  } catch {
    return base
  }
}

function safeLocalStorage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

export function FrierenShell() {
  useDocumentTitle(AGENT_TABS.frieren.title, AGENT_TABS.frieren.icon)
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs<FrierenPrefs>('frieren', useMemo(() => legacyPrefs({ ...DEFAULT_PREFS, art: AGENT.art ?? DEFAULT_PREFS.art }), []))
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [rev, setRev] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [topQuery, setTopQuery] = useState('')

  const reload = useCallback(() => setRev((n) => n + 1), [])

  // Catálogo e estantes: recarregam a cada gravação (rev). Estantes falharem não trava nada.
  const { state: booksState, retry: retryBooks } = useLoad(() => frierenApi.list(), [rev])
  const books = booksState.status === 'ok' ? booksState.data : NO_BOOKS
  const { state: shelvesState } = useLoad(() => frierenApi.shelves(), [rev])
  const shelves = shelvesState.status === 'ok' ? shelvesState.data : NO_SHELVES

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

  // Navegar grava no histórico (pushState): o Voltar do navegador volta para a tela anterior.
  const goto = useCallback((to: Route | ViewId) => {
    const next: Route = typeof to === 'string' ? { view: to } : to
    setRoute(next)
    const url = `${window.location.pathname}#${hashFor(next)}`
    if (window.location.hash !== `#${hashFor(next)}`) window.history.pushState(window.history.state, '', url)
    window.scrollTo?.({ top: 0 })
  }, [])

  const saveLog = useCallback(async (draft: LogDraft) => {
    const book = books.find((b) => b.id === draft.bookId)
    if (!book) throw new Error('Escolha o livro.')
    const result = await submitLog(draft, book, frierenApi)
    reload()
    toast(result.message, {
      tone: 'success',
      undo: () => { result.undo().then(reload).catch(() => toast('Não foi possível desfazer. Confira no Diário.', { tone: 'error' })) },
    })
  }, [books, reload])

  const openLog = useCallback((open: OpenLog = {}) => {
    if (open.draft) { setDialog({ kind: 'log', draft: open.draft }); return }
    // Sem livro escolhido: sugere o que está sendo lido (o primeiro da lista de candidatos do formulário).
    const reading = books.filter((b) => b.status === 'lendo')
    const id = open.bookId ?? (reading.length === 1 ? reading[0].id : null)
    const book = books.find((b) => b.id === id)
    setDialog({ kind: 'log', draft: emptyDraft(today, id, book ? book.page : null) })
  }, [books, today])

  const openAdd = useCallback((title = '') => setDialog({ kind: 'add', title }), [])

  const quickLog = useCallback((r: CaptureResult, forceForm = false): boolean => {
    const draft = draftFromCapture(r, { today, books })
    const book = books.find((b) => b.id === draft.bookId) ?? null
    // Livro digitado que não está na biblioteca: oferece adicionar em vez de abrir um formulário vazio.
    if (!book && draft.title && !books.some((b) => norm(b.title).includes(norm(draft.title)))) {
      toast(`“${draft.title}” não está na biblioteca.`)
      setDialog({ kind: 'add', title: draft.title })
      return true
    }
    if (forceForm || !canSaveQuickly(draft, book, today)) {
      setDialog({ kind: 'log', draft })
      return true
    }
    void saveLog(draft).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' }))
    return true
  }, [today, books, saveLog])

  const clearTopQuery = useCallback(() => setTopQuery(''), [])

  const ctx = useMemo<FrierenCtx>(
    () => ({
      rev, reload, today, route, goto, books, booksState, retryBooks, shelves, prefs, setPrefs,
      openLog, openAdd, quickLog, saveLog, topQuery, clearTopQuery,
    }),
    [rev, reload, today, route, goto, books, booksState, retryBooks, shelves, prefs, setPrefs, openLog, openAdd, quickLog, saveLog, topQuery, clearTopQuery],
  )

  // Paleta Ctrl+K: busca livros por título ou autor e abre a página do livro (substitui a busca do topo
  // do shell antigo, que só filtrava a Biblioteca).
  const provider = useMemo<CommandProvider>(() => ({
    id: 'frieren.books',
    search: (q) => {
      const n = norm(q)
      if (n.length < 2) return []
      return books
        .filter((b) => norm(b.title).includes(n) || norm(b.author).includes(n))
        .slice(0, 8)
        .map((b) => ({ id: `book:${b.id}`, label: b.author ? `${b.title} · ${b.author}` : b.title, group: 'Livros', icon: 'book', run: () => goto({ view: 'catalog', bookId: b.id }) }))
    },
  }), [books, goto])
  useCommandProvider(provider)

  // Contagens do menu (como o shell antigo mostrava ao lado de cada item).
  const count = (pred: (b: Book) => boolean) => (books.length ? books.filter(pred).length || undefined : undefined)
  const nav: NavGroup[] = [
    {
      label: 'Biblioteca',
      items: [
        { id: 'home', label: 'Início', icon: 'home', key: 'h' },
        { id: 'catalog', label: 'Biblioteca', icon: 'library', key: 'b', count: books.length || undefined },
        { id: 'toread', label: 'Quero ler', icon: 'watchlist', key: 'q', count: count((b) => TO_READ.includes(b.status)) },
        { id: 'wishlist', label: 'Wishlist', icon: 'store', key: 'w', count: count((b) => b.status === 'wishlist') },
        { id: 'diary', label: 'Diário', icon: 'days', key: 'd' },
      ],
    },
    {
      label: 'Coleção',
      items: [
        { id: 'shelves', label: 'Estantes', icon: 'shelf', key: 's', count: shelves.length || undefined },
        { id: 'reviews', label: 'Resenhas', icon: 'review', count: count((b) => !!b.review.trim()) },
        { id: 'stats', label: 'Estatísticas', icon: 'stats', key: 'e' },
      ],
    },
  ]

  const SCREENS: Record<ViewId, () => ReactElement> = {
    home: () => <Home />, catalog: () => <Library />, toread: () => <ToRead />, wishlist: () => <Wishlist />,
    diary: () => <Diary />, shelves: () => <Shelves />, reviews: () => <Reviews />, stats: () => <Stats />,
  }
  // Livro aberto (#livro/<id>) e estante aberta (#estante/<id>) ficam na URL; senão vale a tela do menu.
  const body = route.bookId ? <BookDetail id={route.bookId} /> : route.shelfId ? <ShelfView id={route.shelfId} /> : SCREENS[route.view]()

  return (
    <FrierenContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'frieren', name: AGENT.name, subtitle: 'Livros · Biblioteca', portrait: AGENT.portrait }}
        nav={nav}
        active={route.bookId ? 'catalog' : route.shelfId ? 'shelves' : route.view}
        onNavigate={(id) => goto(id as ViewId)}
        mobileTabs={['home', 'catalog', 'diary']}
        primary={{ label: 'Registrar leitura', icon: 'add', key: 'n', onClick: () => openLog() }}
        title={route.bookId ? 'Livro' : route.shelfId ? 'Estante' : TITLES[route.view]}
        subtitle={route.bookId || route.shelfId ? 'Detalhe' : SUBTITLES[route.view]}
        // Busca do topo: leva para a Biblioteca já filtrada (como no shell antigo).
        search={{ placeholder: 'Buscar livro…', onSubmit: (q) => { setTopQuery(q); goto('catalog') } }}
        onGoAgent={(to) => navigate(to)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        commands={[
          { id: 'frieren.log', label: 'Registrar leitura', icon: 'book', keywords: 'li página sessão progresso', run: () => openLog() },
          { id: 'frieren.add', label: 'Adicionar livro', icon: 'add', keywords: 'novo google books cadastrar', run: () => openAdd() },
          { id: 'frieren.shelf', label: 'Ver estantes', icon: 'shelf', keywords: 'coleção lista', run: () => goto('shelves') },
        ]}
        preferences={
          <>
            <SettingRow title="Mostrar livros como" help="Vale para a Biblioteca e o Quero ler.">
              <SegmentedControl
                label="Layout da Biblioteca"
                value={prefs.layout}
                options={[{ value: 'grid', label: 'Capas', icon: 'grid' }, { value: 'list', label: 'Lista', icon: 'list' }]}
                onChange={(layout) => setPrefs({ layout })}
              />
            </SettingRow>
            <SettingRow title="Tamanho das capas" help="A densidade da grade de livros.">
              <SegmentedControl
                label="Tamanho das capas"
                value={prefs.density}
                options={[{ value: 'large', label: 'Grande' }, { value: 'medium', label: 'Médio' }, { value: 'compact', label: 'Compacto' }]}
                onChange={(density) => setPrefs({ density })}
              />
            </SettingRow>
            <SettingRow title="Topo do Início" help="Cinemático: retrato da Frieren. Editorial: compacto. Galeria: a capa do livro atual.">
              <SegmentedControl
                label="Estilo do topo do Início"
                value={prefs.heroLayout}
                options={[{ value: 'cinematic', label: 'Cinemático' }, { value: 'editorial', label: 'Editorial' }, { value: 'gallery', label: 'Galeria' }]}
                onChange={(heroLayout) => setPrefs({ heroLayout })}
              />
            </SettingRow>
            <SettingRow title="Meta de livros por ano" help="Aparece no Início e nas Estatísticas.">
              <NumberInput
                aria-label="Meta de livros por ano"
                min={1}
                max={500}
                value={prefs.yearlyGoal > 0 ? prefs.yearlyGoal : DEFAULT_PREFS.yearlyGoal}
                onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 1 && n <= 500) setPrefs({ yearlyGoal: n }) }}
              />
            </SettingRow>
          </>
        }
      >
        <ScreenBoundary resetKey={hashFor(route)} onHome={() => goto('home')}>{body}</ScreenBoundary>
        {dialog?.kind === 'log' && <LogForm key={`${dialog.draft.bookId}-${dialog.draft.title}`} initial={dialog.draft} onClose={() => setDialog(null)} />}
        {dialog?.kind === 'add' && <AddBookForm initialTitle={dialog.title} onClose={() => setDialog(null)} />}
      </AppShell>
    </FrierenContext.Provider>
  )
}
