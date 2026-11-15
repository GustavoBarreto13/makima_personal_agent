// Aba "Agentes": grade compacta com retrato, um número vivo e a ação rápida de cada agente.

import { useMemo, useState } from 'react'
import { Button, EmptyState, ErrorState, Icon, LoadingState, Page, Field, Input } from '../../../design'
import { ACTIVE_AGENTS, type AgentInfo } from '../../../design/core/agents'
import { makimaApi } from '../makimaApi'
import { QUICK_ACTIONS, useLoad } from '../lib'
import type { HubSummary } from '../types'

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Agents({ go }: { go: (href: string) => void }) {
  const { state, retry } = useLoad(() => makimaApi.summary())
  const [q, setQ] = useState('')

  const agents = useMemo(() => {
    const n = norm(q.trim())
    if (!n) return ACTIVE_AGENTS
    return ACTIVE_AGENTS.filter((a) => norm(`${a.name} ${a.domain} ${QUICK_ACTIONS[a.id]?.label ?? ''}`).includes(n))
  }, [q])

  // Os números são um complemento: se o resumo falhar, os agentes continuam abrindo normalmente.
  const summary: HubSummary = state.status === 'ok' ? state.data : {}

  return (
    <Page>
      <div className="mk-stack">
        <Field label="Buscar agente ou ação">
          {(c) => <Input {...c} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: finanças, nova tarefa" />}
        </Field>

        {state.status === 'loading' && <LoadingState variant="card" count={6} label="Carregando agentes…" />}
        {state.status === 'error' && <ErrorState title="Não foi possível carregar os números" hint="Os agentes continuam abaixo. Tente de novo para ver os números." onRetry={retry} />}

        {agents.length === 0
          ? <EmptyState icon="search" title="Nenhum agente encontrado" hint="Tente outro nome, como finanças, livros ou pessoas." />
          : (
            <div className="mk-agents">
              {agents.map((a) => <AgentCard key={a.id} agent={a} stat={summary[a.id]?.stat} go={go} />)}
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
      <button type="button" className="mk-agent-h" onClick={() => go(agent.route)} aria-label={`Abrir ${agent.name}`}>
        {agent.portrait ? <img src={agent.portrait} alt="" /> : <span className="mk-ic"><Icon name="person" size={18} /></span>}
        <span><strong>{agent.name}</strong><small>{agent.domain}</small></span>
      </button>
      <div>
        <div className="mk-agent-n">{stat?.v ?? '—'}</div>
        <div className="mk-agent-k">{stat?.k ?? 'sem número agora'}</div>
      </div>
      {quick && <Button size="sm" icon="add" className="mk-agent-add" onClick={() => go(quick.href)}>{quick.label}</Button>}
    </div>
  )
}
