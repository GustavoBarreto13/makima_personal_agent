// Estado compartilhado do shell da Violet: rota, preferências, "hoje" e as ações comuns (navegar, recarregar,
// abrir uma carta/um registro emocional novos). As telas leem daqui em vez de receber várias props.

import { createContext, useContext } from 'react'
import type { Route, ViewId } from './lib/routes'
import type { Font } from './types'

/** Seções do Refletir (a ordem é a do stream). */
export const REFLECT_SECTIONS = [
  { id: 'weekly', label: 'Revisão da semana' },
  { id: 'prompt', label: 'Pergunta do dia' },
  { id: 'gem', label: 'Gema do dia' },
  { id: 'idea', label: 'Ideia do dia' },
  { id: 'focus', label: 'Foco (metas da Kaguya)' },
  { id: 'yesterday', label: 'Ontem' },
  { id: 'week', label: 'Esta semana' },
  { id: 'pins', label: 'Fixados (30 dias)' },
  { id: 'yearAgo', label: 'Um ano atrás' },
  { id: 'memory', label: 'Memory lane' },
] as const
export type ReflectSection = (typeof REFLECT_SECTIONS)[number]['id']

export interface VioletPrefs {
  art: string
  /** Fonte padrão dos dias (cada dia pode trocar). */
  font: Font
  /** Meta de dias escritos por semana — régua da força (mesmo motor dos hábitos da Kaguya). */
  weeklyTarget: number
  /** Escrever em modo foco: esconde o Conselho, as emoções e as cartas do dia, só os bullets. */
  focus: boolean
  /** Seções do Refletir escondidas. */
  hiddenSections: ReflectSection[]
  /** Fixados no Refletir: `tag:<x>` ou `person:<id>`. */
  pins: string[]
}

export const DEFAULT_PREFS: VioletPrefs = { art: 'papel', font: 'normal', weeklyTarget: 5, focus: false, hiddenSections: [], pins: [] }

export interface VioletCtx {
  today: string
  route: Route
  goto: (to: Route | ViewId) => void
  /** Abre um link de outro agente (deep_link) ou de fora. */
  openLink: (href: string) => void
  /** Sobe a cada gravação que outras telas precisam ver (contagens do menu, Arquivo). */
  rev: number
  reload: () => void
  prefs: VioletPrefs
  setPrefs: (patch: Partial<VioletPrefs>) => void
  /** Registro emocional novo (formulário guiado), por padrão em hoje. */
  openEmotion: (date?: string) => void
}

export const VioletContext = createContext<VioletCtx | null>(null)

export function useViolet(): VioletCtx {
  const ctx = useContext(VioletContext)
  if (!ctx) throw new Error('useViolet só funciona dentro do VioletShell')
  return ctx
}
