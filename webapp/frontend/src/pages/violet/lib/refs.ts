// Agentes que dá para citar no diário com "/" e como abrir cada item no shell dele.
// A lista de aliases vem da API (/refs/providers); aqui ficam só o ícone e o link de cada tipo.

import type { IconName } from '../../../design'

export interface AgentMeta { label: string; icon: IconName; hint: string }

export const AGENT_META: Record<string, AgentMeta> = {
  kaguya: { label: 'Kaguya', icon: 'task', hint: 'tarefas, hábitos e metas' },
  akane: { label: 'Akane', icon: 'movie', hint: 'filmes' },
  frieren: { label: 'Frieren', icon: 'book', hint: 'livros' },
  marin: { label: 'Marin', icon: 'anime', hint: 'animes' },
  mai: { label: 'Mai', icon: 'series', hint: 'séries' },
  yato: { label: 'Yato', icon: 'trip', hint: 'viagens' },
}

/** Ícone por tipo de item (a Kaguya tem três). */
export function refIcon(agent: string, entityType: string): IconName {
  if (agent === 'kaguya') return entityType === 'habit' ? 'habit' : entityType === 'goal' ? 'goal' : 'task'
  return AGENT_META[agent]?.icon ?? 'link'
}

/** Onde o item mora no app (mesmos links que o backend devolve na busca). */
export function refDeepLink(agent: string, entityType: string, entityId: string): string {
  switch (agent) {
    case 'kaguya': return entityType === 'habit' ? '/tasks#habitos' : entityType === 'goal' ? `/tasks#metas/${entityId}` : `/tasks#tarefa/${entityId}`
    case 'akane': return `/movies#filme/${entityId}`
    case 'frieren': return `/books#livro/${entityId}`
    case 'marin': return `/animes#anime/${entityId}`
    case 'mai': return '/series'
    case 'yato': return '/travel'
    default: return '/'
  }
}

/** Separa o que foi digitado depois da "/": o agente (pelo alias) e o termo. */
export function matchAgent(typed: string, providers: { key: string; aliases: string[] }[]): string | null {
  const t = typed.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const hit = providers.find((p) => p.key === t || p.aliases.some((a) => a.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === t))
  return hit?.key ?? null
}
