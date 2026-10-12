// Violet · Diário — shell sobre o AppShell do Design System (spec 076), estilo de arte "Papel de carta".
// Guarda a rota por hash (/journal#dia/2026-10-12, #carta/7, #refletir…), as preferências e as ações comuns
// (navegar, abrir um link de outro agente, registrar uma emoção), que as telas leem pelo contexto.
// Celular: barra inferior Escrever · Arquivo · Refletir · Mais; o botão flutuante começa um momento novo.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { getAgent } from '../../design/core/agents'
import { todayISO } from '../../design/core/format'
import { useHotkeys } from '../../design/headless/useHotkeys'
import { usePrefs } from '../../design/headless/usePrefs'
import { AppShell, Button, SegmentedControl, SettingRow, Toggle, type NavGroup } from '../../design'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'
import { EmotionForm } from './components/EmotionForm'
import { FontChoice } from './components/FontPicker'
import { ScreenBoundary } from './components/ScreenBoundary'
import { DEFAULT_PREFS, VioletContext, type VioletCtx, type VioletPrefs } from './context'
import { legacyPrefs } from './lib/legacy'
import { hashFor, isInternal, navIdFor, routeFromHash, type CollectionKind, type Route, type ViewId } from './lib/routes'
import { Archive } from './screens/Archive'
import { Collection } from './screens/Collection'
import { Emotions } from './screens/Emotions'
import { Insights } from './screens/Insights'
import { Letters } from './screens/Letters'
import { People, Tags } from './screens/People'
import { Reflect } from './screens/Reflect'
import { Tutor } from './screens/Tutor'
import { Values } from './screens/Values'
import { Write } from './screens/Write'
import './violet.css'

const AGENT = getAgent('violet')
const ART_OPTIONS = [{ value: 'default', label: 'Padrão' }, { value: 'papel', label: 'Papel de carta' }]

const TITLES: Record<ViewId, [string, string]> = {
  write: ['Escrever', 'O dia de hoje'],
  archive: ['Arquivo', 'Todos os dias escritos'],
  reflect: ['Refletir', 'Uns minutos para reler'],
  insights: ['Insights', 'Seu ano no diário'],
  letters: ['Cartas', 'Todas as cartas'],
  emotions: ['Registro emocional', 'O que está acontecendo'],
  values: ['Valores', 'O que realmente importa'],
  people: ['Pessoas', 'Quem aparece no diário'],
  tags: ['Tags', 'Os temas do diário'],
  collection: ['Coleção', 'Momentos marcados'],
  tutor: ['Tutor', 'Inglês com a Kurisu'],
}
const COLLECTION_TITLES: Record<CollectionKind, string> = {
  highlight: 'Destaques', idea: 'Ideias', wisdom: 'Sabedoria', note: 'Notas', dream: 'Sonhos', dreams: 'Sonhos',
}

export function VioletShell() {
  useDocumentTitle(AGENT_TABS.violet.title, AGENT_TABS.violet.icon)
  const navigate = useNavigate()
  const today = useMemo(() => todayISO(), [])
  const [prefs, setPrefs] = usePrefs<VioletPrefs>('violet', useMemo(() => legacyPrefs({ ...DEFAULT_PREFS, art: AGENT.art ?? DEFAULT_PREFS.art }), []))
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash, window.location.search))
  const [rev, setRev] = useState(0)
  const [emotionFor, setEmotionFor] = useState<string | null>(null)

  const reload = useCallback(() => setRev((n) => n + 1), [])

  useEffect(() => {
    const on = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', on)
    window.addEventListener('popstate', on)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on) }
  }, [])

  const goto = useCallback((to: Route | ViewId) => {
    const next: Route = typeof to === 'string' ? { view: to } : to
    setRoute(next)
    const hash = `#${hashFor(next)}`
    if (window.location.hash !== hash) window.history.pushState(window.history.state, '', `${window.location.pathname}${hash}`)
    window.scrollTo?.({ top: 0 })
  }, [])

  const openLink = useCallback((href: string) => {
    if (isInternal(href)) {
      if (href.startsWith('/journal')) { window.location.hash = href.split('#')[1] ?? ''; return }
      navigate(href)
    } else window.open(href, '_blank', 'noopener')
  }, [navigate])

  const openEmotion = useCallback((date?: string) => setEmotionFor(date ?? today), [today])

  /** Novo momento: vai para hoje e abre o editor (o Escrever escuta o evento). */
  const newMoment = useCallback(() => {
    if (!(route.view === 'write' && !route.date)) goto('write')
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('violet:new-moment')), 60)
  }, [route, goto])

  const ctx = useMemo<VioletCtx>(() => ({ today, route, goto, openLink, rev, reload, prefs, setPrefs, openEmotion }),
    [today, route, goto, openLink, rev, reload, prefs, setPrefs, openEmotion])

  useHotkeys([
    { keys: 'l', handler: (e) => { e.preventDefault(); goto({ view: 'letters', newLetter: true }) } },
    { keys: 'm', handler: (e) => { e.preventDefault(); openEmotion() } },
  ])

  const nav: NavGroup[] = [
    {
      label: 'Diário',
      items: [
        { id: 'write', label: 'Escrever', icon: 'edit', key: 'e' },
        { id: 'archive', label: 'Arquivo', icon: 'archive', key: 'a' },
        { id: 'reflect', label: 'Refletir', icon: 'insight', key: 'r' },
        { id: 'insights', label: 'Insights', icon: 'stats', key: 'i' },
      ],
    },
    {
      label: 'Práticas',
      items: [
        { id: 'letters', label: 'Cartas', icon: 'mail', key: 'c' },
        { id: 'emotions', label: 'Registro emocional', icon: 'pulse', key: 'o' },
        { id: 'values', label: 'Valores', icon: 'values', key: 'v' },
        { id: 'tutor', label: 'Tutor', icon: 'school' },
      ],
    },
    {
      label: 'Coleções',
      items: [
        { id: 'people', label: 'Pessoas', icon: 'people', key: 'p' },
        { id: 'tags', label: 'Tags', icon: 'hash', key: 't' },
        { id: 'col-highlight', label: 'Destaques', icon: 'highlight' },
        { id: 'col-dreams', label: 'Sonhos', icon: 'dream' },
        { id: 'col-idea', label: 'Ideias', icon: 'idea' },
        { id: 'col-wisdom', label: 'Sabedoria', icon: 'wisdom' },
        { id: 'col-note', label: 'Notas', icon: 'pin' },
      ],
    },
  ]

  const onNavigate = (id: string) => {
    if (id.startsWith('col-')) goto({ view: 'collection', kind: id.slice(4) as CollectionKind })
    else goto(id as ViewId)
  }

  const date = route.view === 'write' ? route.date ?? today : today
  const SCREENS: Record<ViewId, () => ReactElement> = {
    write: () => <Write key={date} date={date} />,
    archive: () => <Archive />, reflect: () => <Reflect />, insights: () => <Insights />, letters: () => <Letters />,
    emotions: () => <Emotions />, values: () => <Values />, people: () => <People />, tags: () => <Tags />,
    collection: () => <Collection />, tutor: () => <Tutor />,
  }
  const [title, subtitle] = TITLES[route.view]
  const shownTitle = route.view === 'collection' ? (route.ref ? 'Citado no diário' : COLLECTION_TITLES[route.kind ?? 'highlight']) : title

  return (
    <VioletContext.Provider value={ctx}>
      <AppShell
        agent={{ id: 'violet', name: AGENT.name, subtitle: 'Diário · Auto Memory Doll', portrait: AGENT.portrait }}
        nav={nav}
        active={navIdFor(route)}
        onNavigate={onNavigate}
        mobileTabs={['write', 'archive', 'reflect']}
        primary={{ label: 'Novo momento', icon: 'edit', key: 'n', onClick: newMoment }}
        title={shownTitle}
        subtitle={route.view === 'write' && route.date ? 'Um dia do diário' : subtitle}
        // Busca do topo: abre o Arquivo já buscando no texto inteiro (o Arquivo escuta o evento).
        search={{ placeholder: 'Buscar no diário…', onSubmit: (q) => { goto('archive'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('violet:search', { detail: q })), 60) } }}
        onGoAgent={(to) => navigate(to)}
        art={{ value: prefs.art, options: ART_OPTIONS, onChange: (art) => setPrefs({ art }) }}
        artValue={prefs.art}
        commands={[
          { id: 'violet.today', label: 'Escrever hoje', icon: 'edit', keywords: 'diário hoje momento bullet', run: () => goto('write') },
          { id: 'violet.letter', label: 'Nova carta', icon: 'mail', keywords: 'carta escrever para', run: () => goto({ view: 'letters', newLetter: true }) },
          { id: 'violet.emotion', label: 'Registrar emoção', icon: 'pulse', keywords: 'emoção tcc sentimento registro', run: () => openEmotion() },
          { id: 'violet.weekly', label: 'Revisão da semana', icon: 'weekly-review', keywords: 'semana revisão balanço', run: () => goto({ view: 'reflect', week: today }) },
          { id: 'violet.values', label: 'Avaliação dos Valores', icon: 'values', keywords: 'valores áreas vida', run: () => goto('values') },
          { id: 'violet.insights', label: 'Ver insights', icon: 'stats', keywords: 'força estatísticas ano', run: () => goto('insights') },
        ]}
        preferences={
          <>
            <SettingRow title="Fonte padrão" help="Vale para os dias que ainda não têm fonte. Cada dia (e cada carta) pode trocar na hora.">
              <FontChoice value={prefs.font} onChange={(font) => setPrefs({ font })} label="Fonte padrão" />
            </SettingRow>
            <SettingRow title="Meta de escrita" help="Dias por semana. É a régua da força da escrita — dias de folga dentro da meta não pesam.">
              <SegmentedControl label="Meta de dias por semana" value={String(prefs.weeklyTarget)} onChange={(x) => setPrefs({ weeklyTarget: Number(x) })}
                options={['3', '4', '5', '6', '7'].map((n) => ({ value: n, label: n }))} />
            </SettingRow>
            <SettingRow title="Modo foco" help="No Escrever, mostra só a data, o sonho e os momentos (sem Conselho, emoções e cartas).">
              <Toggle label="Modo foco" checked={prefs.focus} onChange={(focus) => setPrefs({ focus })} />
            </SettingRow>
            <SettingRow title="Refletir" help="Escolha as seções e os fixados na engrenagem do próprio Refletir.">
              <Button size="sm" icon="insight" onClick={() => goto('reflect')}>Abrir o Refletir</Button>
            </SettingRow>
          </>
        }
      >
        <ScreenBoundary resetKey={hashFor(route)} onHome={() => goto('write')}>{SCREENS[route.view]()}</ScreenBoundary>
        {emotionFor && <EmotionForm date={emotionFor} onClose={() => setEmotionFor(null)} onSaved={() => reload()} />}
      </AppShell>
    </VioletContext.Provider>
  )
}
