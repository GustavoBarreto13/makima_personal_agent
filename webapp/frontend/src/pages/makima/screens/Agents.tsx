// Aba "Agentes": grade compacta com retrato, um número vivo e a ação rápida de cada agente.
// Sem campo de busca: são poucos cartões, e a busca de verdade (todos os dados) é o ícone da barra do topo / Ctrl+K.

import { Button, ErrorState, Icon, LoadingState, Page } from '../../../design'
import { ACTIVE_AGENTS, type AgentInfo } from '../../../design/core/agents'
import { makimaApi } from '../makimaApi'
import { QUICK_ACTIONS, useLoad } from '../lib'
import type { HubSummary } from '../types'

export function Agents({ go }: { go: (href: string) => void }) {
  const { state, retry } = useLoad(() => makimaApi.summary())
  // Os números são um complemento: se o resumo falhar, os agentes continuam abrindo normalmente.
  const summary: HubSummary = state.status === 'ok' ? state.data : {}

  return (
    <Page>
      <div className="mk-stack">
        {state.status === 'error' && <ErrorState title="Não foi possível carregar os números" hint="Os agentes continuam abaixo. Tente de novo para ver os números." onRetry={retry} />}
        {state.status === 'loading'
          ? <LoadingState variant="card" count={6} label="Carregando agentes…" />
          : (
            <div className="mk-agents">
              {ACTIVE_AGENTS.map((a) => <AgentCard key={a.id} agent={a} stat={summary[a.id]?.stat} go={go} />)}
            </div>
          )}
      </div>
    </Page>
  )
}

function AgentCard({ agent, stat, go }: { agent: AgentInfo; stat?: { v: string; k: string }; go: (href: string) => void }) {
  const quick = QUICK_ACTIONS[agent.id]
  return (
    <div className="mk-agent" data-agent={agent.id}>
      <button type="button" className="mk-agent-main" onClick={() => go(agent.route)} aria-label={`Abrir ${agent.name}`}>
        <span className="mk-agent-h">
          {agent.portrait ? <img src={agent.portrait} alt="" /> : <span className="mk-ic"><Icon name="person" size={18} /></span>}
          <span><strong>{agent.name}</strong><small>{agent.domain}</small></span>
        </span>
        {stat && (
          <span className="mk-agent-s">
            <span className="mk-agent-n">{stat.v}</span>
            <span className="mk-agent-k">{stat.k}</span>
          </span>
        )}
      </button>
      {quick && <Button size="sm" icon="add" className="mk-agent-add" onClick={() => go(quick.href)} aria-label={`${quick.long}: ${agent.name}`}>{quick.label}</Button>}
    </div>
  )
}
