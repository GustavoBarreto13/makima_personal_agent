// Makima · Hoje — home do app, sobre o AppShell do Design System.
// Três abas (#hoje, #conversar, #agentes): o painel do dia, o chat com a Makima (Hermes) e a grade de agentes.
// Rota `/` (sidebar do DS no desktop, barra inferior no celular). Os números vêm de /api/hub/today e
// /api/hub/summary, cada bloco isolado. O título da aba Hoje é a saudação e o subtítulo a data de hoje.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { AppShell, type NavGroup } from '../../design'
import { ACTIVE_AGENTS, getAgent } from '../../design/core/agents'
import { usePrefs } from '../../design/headless/usePrefs'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'
import { FOCUS_CAPTURE_EVENT } from './components/UniversalCapture'
import { WidgetRows } from './components/WidgetRows'
import { useNow } from './hooks'
import { DEFAULT_PREFS, greeting, longDate, type HomePrefs } from './lib'
import { Agents } from './screens/Agents'
import { Chat } from './screens/Chat'
import { Today } from './screens/Today'
import { useGlobalSearch } from './useGlobalSearch'
import './makima.css'

type View = 'today' | 'chat' | 'agents'

const AGENT = getAgent('makima')
const HASH: Record<View, string> = { today: 'hoje', chat: 'conversar', agents: 'agentes' }
const STATIC_TITLES: Record<Exclude<View, 'today'>, { title: string; subtitle: string }> = {
  chat: { title: 'Conversar', subtitle: 'Fale com a Makima' },
  agents: { title: 'Agentes', subtitle: 'Quem cuida de quê' },
}

function viewFromHash(hash: string): View {
  const h = hash.replace('#', '')
  return h === HASH.agents ? 'agents' : h === HASH.chat ? 'chat' : 'today'
}

export function MakimaShell() {
  useDocumentTitle(AGENT_TABS.makima.title, AGENT_TABS.makima.icon)
  const navigate = useNavigate()
  const now = useNow()
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash))
  const [prefs, setPrefs] = usePrefs<HomePrefs>('makima', DEFAULT_PREFS)

  // Voltar/avançar do navegador e links com #… trocam de aba.
  useEffect(() => {
    const onHash = () => setView(viewFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  const goView = useCallback((v: View) => {
    setView(v)
    const hash = `#${HASH[v]}`
    if (window.location.hash !== hash) window.history.pushState(window.history.state, '', `${window.location.pathname}${hash}`)
    window.scrollTo?.({ top: 0 })
  }, [])

  // href de um agente (rota SPA, com ou sem #hash).
  const go = useCallback((href: string) => navigate(href), [navigate])
  // Ctrl+K também acha tarefas, pessoas, livros, filmes… de todos os agentes.
  useGlobalSearch(go)

  const nav: NavGroup[] = [{
    label: 'Makima',
    items: [
      { id: 'today', label: 'Hoje', icon: 'sun', key: 'h' },
      { id: 'chat', label: 'Conversar', icon: 'journal', key: 'c' },
      { id: 'agents', label: 'Agentes', icon: 'apps', key: 'a' },
    ],
  }]

  // Ctrl+K: abrir qualquer agente (e, pela busca global, itens de todos eles).
  const commands = useMemo(
    () => ACTIVE_AGENTS.map((a) => ({
      id: `makima.open.${a.id}`, label: `Abrir ${a.name}`, icon: 'apps' as const, keywords: `${a.domain} agente ${a.name}`, run: () => navigate(a.route),
    })),
    [navigate],
  )

  // "Registrar" leva à captura: volta para o Hoje (se preciso) e o campo rola até o centro e ganha foco.
  const registrar = useCallback(() => {
    goView('today')
    setTimeout(() => window.dispatchEvent(new Event(FOCUS_CAPTURE_EVENT)), 60)
  }, [goView])

  const heading = view === 'today' ? { title: greeting(now.getHours()), subtitle: longDate(now) } : STATIC_TITLES[view]

  return (
    <AppShell
      agent={{ id: 'makima', name: AGENT.name, subtitle: 'Centro de controle', portrait: AGENT.portrait }}
      nav={nav}
      active={view}
      onNavigate={(id) => goView(id as View)}
      mobileTabs={['today', 'chat', 'agents']}
      primary={{ label: 'Registrar', icon: 'add', key: 'n', onClick: registrar }}
      title={heading.title}
      subtitle={heading.subtitle}
      onGoAgent={(to) => navigate(to)}
      commands={commands}
      preferences={<WidgetRows prefs={prefs} setPrefs={setPrefs} />}
    >
      {view === 'today' ? <Today prefs={prefs} setPrefs={setPrefs} go={go} /> : view === 'chat' ? <Chat go={go} /> : <Agents go={go} />}
    </AppShell>
  )
}
