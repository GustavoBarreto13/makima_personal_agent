// Regras puras da home: widgets de números, ações rápidas por agente, saudação e hooks de carga.

import { useCallback, useEffect, useState } from 'react'
import type { AgentId } from '../../design/core/agents'
import type { IconName } from '../../design'

export interface WidgetDef {
  id: string
  label: string
  agent: AgentId
  icon: IconName
}

/** Catálogo de widgets de "Seus números" (a ordem aqui é a ordem padrão). */
export const WIDGETS: WidgetDef[] = [
  { id: 'nami_livre', label: 'Livre pra gastar', agent: 'nami', icon: 'money' },
  { id: 'kaguya_hoje', label: 'Tarefas de hoje', agent: 'kaguya', icon: 'task' },
  { id: 'habitos', label: 'Hábitos de hoje', agent: 'kaguya', icon: 'habit' },
  { id: 'violet_dias', label: 'Dias escritos', agent: 'violet', icon: 'journal' },
]

export interface HomePrefs {
  /** Ids dos widgets na ordem escolhida. */
  order: string[]
  /** Ids dos widgets ocultos. */
  hidden: string[]
}

export const DEFAULT_PREFS: HomePrefs = { order: WIDGETS.map((w) => w.id), hidden: [] }

/** Aplica a ordem e as ocultações; ids novos no catálogo entram no fim (nunca somem por prefs antigas). */
export function visibleWidgets(prefs: HomePrefs): WidgetDef[] {
  const byId = new Map(WIDGETS.map((w) => [w.id, w]))
  const ordered = [...prefs.order.filter((id) => byId.has(id)), ...WIDGETS.map((w) => w.id).filter((id) => !prefs.order.includes(id))]
  return ordered.filter((id) => !prefs.hidden.includes(id)).map((id) => byId.get(id)!)
}

/** Move um item para cima (-1) ou para baixo (+1) na ordem completa. */
export function moveWidget(prefs: HomePrefs, id: string, dir: -1 | 1): string[] {
  const all = [...prefs.order.filter((x) => WIDGETS.some((w) => w.id === x)), ...WIDGETS.map((w) => w.id).filter((x) => !prefs.order.includes(x))]
  const i = all.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return all
  ;[all[i], all[j]] = [all[j], all[i]]
  return all
}

/** Ação rápida (+) de cada agente na grade da home. */
export const QUICK_ACTIONS: Partial<Record<AgentId, { label: string; href: string }>> = {
  nami: { label: 'Novo gasto', href: '/nami' },
  kaguya: { label: 'Nova tarefa', href: '/tasks#nova' },
  violet: { label: 'Escrever', href: '/journal' },
  frieren: { label: 'Registrar leitura', href: '/books' },
  komi: { label: 'Nova pessoa', href: '/people' },
  marin: { label: 'Logar episódio', href: '/animes' },
  akane: { label: 'Marcar filme', href: '/movies' },
  mai: { label: 'Logar episódio', href: '/series' },
  yato: { label: 'Nova viagem', href: '/travel' },
}

/** "Boa noite" etc., pela hora LOCAL do navegador (UTC-3 do usuário; nunca UTC puro). */
export function greeting(hour: number): string {
  if (hour < 5) return 'Boa madrugada'
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Data longa em pt-BR a partir das partes locais (evita `new Date('YYYY-MM-DD')`, que vira UTC). */
export function longDate(d: Date): string {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "18 min" / "45 s" restantes do foco. */
export function remaining(sec: number | null): string {
  if (sec == null) return ''
  return sec >= 60 ? `${Math.ceil(sec / 60)} min` : `${sec} s`
}

export function attentionText(n: number): string {
  if (n === 0) return 'Nada pede sua atenção agora'
  return n === 1 ? '1 coisa pede atenção' : `${n} coisas pedem atenção`
}

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T }

/** Carrega dados da tela: carregando, erro (com "tentar de novo") e dados; recarregar não pisca a tela pronta. */
export function useLoad<T>(load: () => Promise<T>): { state: Loaded<T>; retry: () => void; refresh: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let live = true
    load().then((data) => { if (live) setState({ status: 'ok', data }) }).catch(() => { if (live) setState({ status: 'error' }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tries])
  return {
    state,
    retry: useCallback(() => { setState({ status: 'loading' }); setTries((n) => n + 1) }, []),
    // Recarrega sem piscar a tela já pronta (usado depois de salvar algo).
    refresh: useCallback(() => setTries((n) => n + 1), []),
  }
}
