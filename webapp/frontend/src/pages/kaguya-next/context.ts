// Estado compartilhado do shell da Kaguya: rota, espaço, dados da sidebar e as ações que toda tela usa (abrir a
// tarefa no painel, concluir com "Desfazer", recarregar). As telas leem daqui em vez de receber dezenas de props.

import { createContext, useContext } from 'react'
import type { Space } from './api'
import type { SpaceChoice } from './lib/nav'
import type { Route } from './lib/routes'
import type { Loaded } from './lib/useLoad'
import type { Filter, Group, Project, Task } from './types'

export interface KaguyaPrefs {
  art: string
  /** Espaço global: filtra TODAS as telas (Tudo / Trabalho / Pessoal). */
  space: SpaceChoice
  /** Meu Dia: duas colunas (trabalho | pessoal) ou uma só. */
  daySplit: 'split' | 'single'
  /** Mostrar as concluídas no fim de cada lista. */
  showCompleted: boolean
  /** Linha da tarefa: mostra notas e etiquetas (detalhes) ou só o título. */
  showDetails: boolean
  /** Itens do menu escondidos e fixados no topo (ids de lib/nav). */
  hiddenNav: string[]
  pinnedNav: string[]
  /** Até 3 itens da barra inferior do celular. */
  mobileTabs: string[]
}

export const DEFAULT_PREFS: KaguyaPrefs = {
  art: 'shuchiin', space: 'all', daySplit: 'split', showCompleted: true, showDetails: true,
  hiddenNav: [], pinnedNav: [], mobileTabs: [],
}

/** Alvo possível de uma tarefa nova no quadro do grupo: uma lista-membro e a coluna dela. */
export interface NewTaskTarget { projectId: number; columnId: number; listName: string }

/** Valores iniciais do formulário “Nova tarefa”. `columnId` cria direto numa coluna; `targets` restringe a lista. */
export interface NewTaskDefaults { projectId?: number; due?: string; title?: string; columnId?: number; targets?: NewTaskTarget[] }

export interface KaguyaCtx {
  /** Sobe a cada gravação: telas refazem suas consultas quando muda. */
  rev: number
  reload: () => void
  today: string
  route: Route
  goto: (to: Route) => void
  /** Abre (ou fecha, com undefined) a tarefa no painel de detalhe, mantendo a tela. */
  openTask: (id: number | undefined) => void
  prefs: KaguyaPrefs
  setPrefs: (patch: Partial<KaguyaPrefs>) => void
  /** O espaço como parâmetro de API (`undefined` = tudo). */
  space: Space | undefined
  projects: Project[]
  groups: Group[]
  filters: Filter[]
  sidebarState: Loaded<unknown>
  retrySidebar: () => void
  /** Nome da lista por id (visões que cruzam listas). */
  projectNames: Record<number, string>
  inboxId: number | undefined
  /** Abre o formulário de nova tarefa (opcionalmente já preenchido). */
  newTask: (defaults?: NewTaskDefaults) => void
  /** Abre o formulário de foco (opcionalmente travado numa tarefa ou num hábito). */
  startFocus: (target: { task?: Task; habitId?: number }) => void
  /** Conclui/reabre com aviso e "Desfazer". Confirma antes quando há subtarefas abertas. */
  toggleComplete: (task: Task) => Promise<void>
}

export const KaguyaContext = createContext<KaguyaCtx | null>(null)

export function useKaguya(): KaguyaCtx {
  const ctx = useContext(KaguyaContext)
  if (!ctx) throw new Error('useKaguya só funciona dentro do KaguyaNextShell')
  return ctx
}
