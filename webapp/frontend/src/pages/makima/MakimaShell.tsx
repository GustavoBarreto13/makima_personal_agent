// Makima · Hoje — home do app, sobre o AppShell do Design System.
// Três abas (#hoje, #conversar, #agentes): o painel do dia, o chat com a Makima (Hermes) e a grade de agentes. Rota `/` (tela com a sidebar do DS,
// barra inferior no celular). Os números vêm de /api/hub/today e /api/hub/summary, cada bloco isolado.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../design'
import { AppShell, IconButton, SettingRow, Toggle, type NavGroup } from '../../design'
import { ACTIVE_AGENTS, getAgent } from '../../design/core/agents'
import { usePrefs } from '../../design/headless/usePrefs'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AGENT_TABS } from '../../lib/agentTabs'
import { DEFAULT_PREFS, moveWidget, visibleWidgets, WIDGETS, type HomePrefs } from './lib'
import { FOCUS_CAPTURE_EVENT } from './components/UniversalCapture'
import { Agents } from './screens/Agents'
import { Chat } from './screens/Chat'
import { Today } from './screens/Today'
import { useGlobalSearch } from './useGlobalSearch'
import './makima.css'

type View = 'today' | 'chat' | 'agents'

const AGENT = getAgent('makima')
const HASH: Record<View, string> = { today: 'hoje', chat: 'conversar', agents: 'agentes' }
const TITLES: Record<View, { title: string; subtitle: string }> = {
  today: { title: 'Hoje', subtitle: 'O que importa agora' },
  chat: { title: 'Conversar', subtitle: 'Fale com a Makima' },
  agents: { title: 'Agentes', subtitle: 'Cada parte da sua vida tem uma responsável' },
}

function viewFromHash(hash: string): View {
  const h = hash.replace('#', '')
  return h === HASH.agents ? 'agents' : h === HASH.chat ? 'chat' : 'today'
}

export function MakimaShell() {
  useDocumentTitle(AGENT_TABS.makima.title, AGENT_TABS.makima.icon)
  const navigate = useNavigate()
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

  // Ctrl+K: abrir qualquer agente (a busca em todos os dados vem na fase seguinte).
  const commands = useMemo(
    () => ACTIVE_AGENTS.map((a) => ({
      id: `makima.open.${a.id}`, label: `Abrir ${a.name}`, icon: 'apps' as const, keywords: `${a.domain} agente ${a.name}`, run: () => navigate(a.route),
    })),
    [navigate],
  )

  const shown = new Set(visibleWidgets(prefs).map((w) => w.id))
  const ordered = [...prefs.order.filter((id) => WIDGETS.some((w) => w.id === id)), ...WIDGETS.map((w) => w.id).filter((id) => !prefs.order.includes(id))]

  const toggleWidget = (id: string, on: boolean) =>
    setPrefs({ hidden: on ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden.filter((x) => x !== id), id] })

  return (
    <AppShell
      agent={{ id: 'makima', name: AGENT.name, subtitle: 'Centro de controle', portrait: AGENT.portrait }}
      nav={nav}
      active={view}
      onNavigate={(id) => goView(id as View)}
      mobileTabs={['today', 'chat', 'agents']}
      primary={{
        label: 'Registrar', icon: 'add', key: 'n',
        onClick: () => { goView('today'); setTimeout(() => window.dispatchEvent(new Event(FOCUS_CAPTURE_EVENT)), 0) },
      }}
      title={TITLES[view].title}
      subtitle={TITLES[view].subtitle}
      onGoAgent={(to) => navigate(to)}
      commands={commands}
      preferences={
        <>
          {ordered.map((id, i) => {
            const w = WIDGETS.find((x) => x.id === id)!
            return (
              <SettingRow key={id} title={w.label} help="Aparece em Seus números, na aba Hoje.">
                <div className="mk-wedit">
                  <IconButton icon="up" label={`Subir ${w.label}`} size={16} disabled={i === 0} onClick={() => setPrefs({ order: moveWidget(prefs, id, -1) })} />
                  <IconButton icon="down" label={`Descer ${w.label}`} size={16} disabled={i === ordered.length - 1} onClick={() => setPrefs({ order: moveWidget(prefs, id, 1) })} />
                  <Toggle label={`Mostrar ${w.label}`} checked={shown.has(id)} onChange={(on) => toggleWidget(id, on)} />
                </div>
              </SettingRow>
            )
          })}
        </>
      }
    >
      {view === 'today' ? <Today prefs={prefs} go={go} /> : view === 'chat' ? <Chat go={go} /> : <Agents go={go} />}
    </AppShell>
  )
}
