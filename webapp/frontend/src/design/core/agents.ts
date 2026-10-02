// Registro dos agentes (fonte: src/design/agents.json). Alimenta AgentScope, AgentSwitcher e AppShell.

import data from '../agents.json'

export type AgentId =
  | 'makima' | 'nami' | 'kaguya' | 'frieren' | 'akane' | 'marin' | 'mai' | 'komi' | 'violet' | 'yato' | 'kurisu' | 'lucy'

export interface AgentInfo {
  id: AgentId
  name: string
  domain: string
  hue: number
  chroma: number
  route: string
  portrait: string | null
  favicon: string | null
  status: 'active' | 'soon'
  /** Estilo de arte escolhido pelo usuário; null = ainda não perguntado. */
  art: string | null
}

export const AGENTS: AgentInfo[] = data.agents as AgentInfo[]

export const ACTIVE_AGENTS: AgentInfo[] = AGENTS.filter((a) => a.status === 'active' && a.id !== 'makima')
export const SOON_AGENTS: AgentInfo[] = AGENTS.filter((a) => a.status === 'soon')

export function getAgent(id: AgentId): AgentInfo {
  const a = AGENTS.find((x) => x.id === id)
  if (!a) throw new Error(`Agente desconhecido: ${id}`)
  return a
}
