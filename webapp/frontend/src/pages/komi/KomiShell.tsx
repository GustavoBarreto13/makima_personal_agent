// Komi · Pessoas — shell sobre o AppShell do Design System (spec 077).
// Guarda a rota por hash (/people#pessoas, /people#pessoa/<id>), as pessoas e os relacionamentos (que várias telas
// usam: contagens do menu, linha rápida, busca do topo e da paleta Ctrl+K), o espaço escolhido (Tudo · Pessoal ·
// Trabalho) e as ações comuns (cadastrar, registrar contato, navegar), que as telas leem pelo contexto.

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
import { CategoryEditor } from './components/CategoryEditor'
import { ContactForm } from './components/ContactForm'
import { PersonForm } from './components/PersonForm'
import { ScreenBoundary } from './components/ScreenBoundary'
import { DEFAULT_PREFS, KomiContext, type KomiCtx, type KomiPrefs, type PersonFormOpen } from './context'
import { komiApi } from './komiApi'
import { canSaveQuickly, draftFromCapture, emptyContact, type ContactDraft } from './lib/capture'
import { RECORD_SPACE } from './lib/kinds'
import { inSpace, namesOf, norm } from './lib/people'
import { hashFor, routeFromHash, type Route, type ViewId } from './lib/routes'
import { useLoad } from './lib/useLoad'
import { Dates } from './screens/Dates'
import { Home } from './screens/Home'
import { PersonDetailScreen } from './screens/PersonDetail'
import { People } from './screens/People'
import { Stats } from './screens/Stats'
import type { Category, PersonRow, RecordSpace, SpaceFilter } from './types'
import './komi.css'

const AGENT = getAgent('komi')

const TITLES: Record<ViewId, string> = { home: 'Início', people: 'Pessoas', dates: 'Datas', stats: 'Estatísticas' }
const SUBTITLES: Record<ViewId, string> = {
  home: 'Quem importa', people: 'Todo mundo que você conhece', dates: 'Aniversários e datas importantes', stats: 'Seu ano em contatos',
}

const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'bilhetes', label: 'Caderno de bilhetes' }]

// Referências estáveis enquanto carrega (as telas e coleções dependem delas).
const NO_PEOPLE: PersonRow[] = []
const NO_CATEGORIES: Category[] = []

type Dialog = { kind: 'person'; open: PersonFormOpen } | { kind: 'contact'; draft: ContactDraft } | null

const SPACE_OPTIONS: { value: SpaceFilter; label: string; icon: 'apps' | 'personal' | 'work' }[] = [
  { value: 'all', label: 'Tudo', icon: 'apps' }, { value: 'personal', label: 'Pessoal', icon: 'personal' }, { value: 'work', label: 'Trabalho', icon: 'work' },
]

export function KomiShell() {
  useDocumentTitle(AGENT_TABS.komi.title, AGENT_TABS.komi.icon)
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs<KomiPrefs>('komi', useMemo(() => ({ ...DEFAULT_PREFS, art: AGENT.art ?? DEFAULT_PREFS.art }), []))
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  const [rev, setRev] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [topQuery, setTopQuery] = useState('')

  const reload = useCallback(() => setRev((n) => n + 1), [])

  // Pessoas e relacionamentos recarregam a cada gravação (rev). Os relacionamentos falharem não trava nada.
  const { state: peopleState, retry: retryPeople } = useLoad(() => komiApi.overview(), [rev])
  const people = peopleState.status === 'ok' ? peopleState.data : NO_PEOPLE
  const [catRev, setCatRev] = useState(0)
  const { state: categoriesState } = useLoad(() => komiApi.categories(), [rev, catRev])
  const categories = categoriesState.status === 'ok' ? categoriesState.data : NO_CATEGORIES
  const reloadCategories = useCallback(() => setCatRev((n) => n + 1), [])

  const space = prefs.space
  const visible = useMemo(() => people.filter((p) => inSpace(p, space)), [people, space])

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

  const saveContact = useCallback(async (draft: ContactDraft) => {
    const person = people.find((p) => p.id === draft.personId)
    if (!person) throw new Error('Escolha com quem foi o contato.')
    const context: RecordSpace = person.context === 'both' ? draft.context ?? 'personal' : person.context
    const r = await komiApi.addInteraction(person.id, { kind: draft.kind, happened_at: draft.date, note: draft.note.trim() || undefined, context })
    reload()
    toast(`Contato com ${person.name} registrado${person.context === 'both' ? ` (${RECORD_SPACE[context].toLowerCase()})` : ''}`, {
      tone: 'success',
      undo: () => { komiApi.removeInteraction(r.id).then(reload).catch(() => toast('Não foi possível desfazer. Confira na aba Interações.', { tone: 'error' })) },
    })
  }, [people, reload])

  const defaultContext: RecordSpace | null = space === 'all' ? null : space

  const openPerson = useCallback((open: PersonFormOpen = { mode: 'create' }) => setDialog({ kind: 'person', open }), [])
  const openContact = useCallback((draft?: ContactDraft) => setDialog({ kind: 'contact', draft: draft ?? emptyContact(today, null, defaultContext) }), [today, defaultContext])

  const quickContact = useCallback((r: CaptureResult, forceForm = false): boolean => {
    const draft = draftFromCapture(r, { today, people: visible.length ? visible : people, defaultContext })
    if (forceForm || !canSaveQuickly(draft, today)) {
      setDialog({ kind: 'contact', draft })
      return true
    }
    void saveContact(draft).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' }))
    return true
  }, [today, visible, people, defaultContext, saveContact])

  const clearTopQuery = useCallback(() => setTopQuery(''), [])

  const ctx = useMemo<KomiCtx>(
    () => ({
      rev, reload, today, route, goto, people, peopleState, retryPeople, visible, categories, reloadCategories, prefs, setPrefs,
      openPerson, openContact, quickContact, saveContact, topQuery, clearTopQuery,
    }),
    [rev, reload, today, route, goto, people, peopleState, retryPeople, visible, categories, reloadCategories, prefs, setPrefs, openPerson, openContact, quickContact, saveContact, topQuery, clearTopQuery],
  )

  // Paleta Ctrl+K: busca pessoas por qualquer um dos nomes e abre o perfil.
  const provider = useMemo<CommandProvider>(() => ({
    id: 'komi.people',
    search: (q) => {
      const n = norm(q)
      if (n.length < 2) return []
      return people
        .filter((p) => namesOf(p).some((x) => norm(x).includes(n)))
        .slice(0, 8)
        .map((p) => ({ id: `person:${p.id}`, label: p.nickname && norm(p.nickname) !== norm(p.name) ? `${p.name} · ${p.nickname}` : p.name, group: 'Pessoas', icon: 'person', run: () => goto({ view: 'people', personId: p.id }) }))
    },
  }), [people, goto])
  useCommandProvider(provider)

  // Contagens do menu: quantas pessoas há em cada relacionamento (dentro do espaço escolhido).
  const countBy = (slug: string) => visible.filter((p) => p.category === slug).length || undefined
  const nav: NavGroup[] = [
    {
      label: 'Pessoas',
      items: [
        { id: 'home', label: 'Início', icon: 'home', key: 'h' },
        { id: 'people', label: 'Todas as pessoas', icon: 'people', key: 'p', count: visible.length || undefined },
        { id: 'dates', label: 'Datas', icon: 'days', key: 'd' },
        { id: 'stats', label: 'Estatísticas', icon: 'stats', key: 'e' },
      ],
    },
    ...(categories.length
      ? [{
          label: 'Relacionamentos',
          items: categories.map((c) => ({ id: `cat:${c.slug}`, label: c.label, icon: (c.icon || 'person') as 'person', count: countBy(c.slug) })),
        }]
      : []),
  ]

  const SCREENS: Record<ViewId, () => ReactElement> = { home: () => <Home />, people: () => <People />, dates: () => <Dates />, stats: () => <Stats /> }
  // Pessoa aberta (#pessoa/<id>) fica na URL; senão vale a tela do menu.
  const body = route.personId ? <PersonDetailScreen id={route.personId} tab={route.tab} /> : SCREENS[route.view]()
  const active = route.personId ? 'people' : route.view === 'people' && route.category ? `cat:${route.category}` : route.view

  return (
    <KomiContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'komi', name: AGENT.name, subtitle: 'Pessoas · Contatos', portrait: AGENT.portrait }}
        nav={nav}
        active={active}
        onNavigate={(id) => (id.startsWith('cat:') ? goto({ view: 'people', category: id.slice(4) }) : goto(id as ViewId))}
        mobileTabs={['home', 'people', 'dates']}
        primary={{ label: 'Nova pessoa', icon: 'add', key: 'n', onClick: () => openPerson() }}
        title={route.personId ? 'Pessoa' : TITLES[route.view]}
        subtitle={route.personId ? 'Perfil' : SUBTITLES[route.view]}
        // Busca do topo: leva para a tela Pessoas já filtrada.
        search={{ placeholder: 'Buscar pessoa…', onSubmit: (q) => { setTopQuery(q); goto('people') } }}
        onGoAgent={(to) => navigate(to)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        topbarExtra={
          <SegmentedControl<SpaceFilter>
            label="Espaço: tudo, pessoal ou trabalho"
            value={space}
            options={SPACE_OPTIONS}
            onChange={(v) => setPrefs({ space: v })}
          />
        }
        commands={[
          { id: 'komi.contact', label: 'Registrar contato', icon: 'phone', keywords: 'falei conversei encontro ligação mensagem interação', run: () => openContact() },
          { id: 'komi.new', label: 'Nova pessoa', icon: 'add', keywords: 'cadastrar adicionar contato', run: () => openPerson() },
          { id: 'komi.dates', label: 'Ver datas', icon: 'days', keywords: 'aniversário lembrete', run: () => goto('dates') },
          { id: 'komi.space.all', label: 'Mostrar tudo (pessoal e trabalho)', icon: 'apps', keywords: 'espaço filtro', run: () => setPrefs({ space: 'all' }) },
          { id: 'komi.space.work', label: 'Mostrar só trabalho', icon: 'work', keywords: 'espaço filtro', run: () => setPrefs({ space: 'work' }) },
          { id: 'komi.space.personal', label: 'Mostrar só pessoal', icon: 'personal', keywords: 'espaço filtro', run: () => setPrefs({ space: 'personal' }) },
        ]}
        preferences={
          <>
            <SettingRow title="Mostrar pessoas como" help="Vale para a tela Pessoas.">
              <SegmentedControl
                label="Layout das pessoas"
                value={prefs.layout}
                options={[{ value: 'grid', label: 'Cartões', icon: 'grid' }, { value: 'list', label: 'Lista', icon: 'list' }]}
                onChange={(layout) => setPrefs({ layout })}
              />
            </SettingRow>
            <SettingRow title="Sugerir reconexão após" help="Dias sem contato para a pessoa aparecer no Início.">
              <NumberInput
                aria-label="Dias sem contato para sugerir reconexão"
                min={7}
                max={365}
                value={prefs.reconnectDays}
                onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 7 && n <= 365) setPrefs({ reconnectDays: n }) }}
              />
            </SettingRow>
            <CategoryEditor categories={categories} onChanged={() => { reloadCategories(); reload() }} />
          </>
        }
      >
        <ScreenBoundary resetKey={hashFor(route)} onHome={() => goto('home')}>{body}</ScreenBoundary>
        {dialog?.kind === 'person' && <PersonForm open={dialog.open} onClose={() => setDialog(null)} />}
        {dialog?.kind === 'contact' && <ContactForm key={`${dialog.draft.personId}-${dialog.draft.typedName}`} initial={dialog.draft} onClose={() => setDialog(null)} />}
      </AppShell>
    </KomiContext.Provider>
  )
}
