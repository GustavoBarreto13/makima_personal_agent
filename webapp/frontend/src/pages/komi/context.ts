// Estado compartilhado do shell da Komi: rota, pessoas, relacionamentos, espaço escolhido, preferências e as
// ações que toda tela usa (cadastrar, registrar contato, navegar, recarregar). As telas leem daqui.

import { createContext, useContext } from 'react'
import type { CaptureResult } from '../../design/core/capture'
import type { ContactDraft } from './lib/capture'
import type { Route, ViewId } from './lib/routes'
import type { Loaded } from './lib/useLoad'
import type { Category, PersonRow, SpaceFilter } from './types'

export interface KomiPrefs {
  art: string
  /** Como a tela Pessoas mostra o grupo: cartões ou lista. */
  layout: 'grid' | 'list'
  /** Espaço escolhido no topo (lembrado): tudo, só pessoal ou só trabalho. */
  space: SpaceFilter
  /** Sem contato há quantos dias vira sugestão de reconexão no Início. */
  reconnectDays: number
}

export const DEFAULT_PREFS: KomiPrefs = { art: 'bilhetes', layout: 'grid', space: 'all', reconnectDays: 30 }

/** O que abrir no formulário de pessoa. */
export type PersonFormOpen = { mode: 'create'; name?: string } | { mode: 'edit'; id: string }

export interface KomiCtx {
  /** Sobe a cada gravação: telas refazem suas consultas quando muda. */
  rev: number
  reload: () => void
  today: string
  route: Route
  goto: (to: Route | ViewId) => void
  /** Todas as pessoas (vazio enquanto carrega) e o estado da carga. */
  people: PersonRow[]
  peopleState: Loaded<PersonRow[]>
  retryPeople: () => void
  /** Só as do espaço escolhido no topo. */
  visible: PersonRow[]
  categories: Category[]
  reloadCategories: () => void
  prefs: KomiPrefs
  setPrefs: (patch: Partial<KomiPrefs>) => void
  openPerson: (open?: PersonFormOpen) => void
  openContact: (draft?: ContactDraft) => void
  /** Linha rápida: salva direto quando achou a pessoa; senão abre o formulário preenchido. */
  quickContact: (r: CaptureResult, forceForm?: boolean) => boolean
  /** Grava o contato com aviso e "Desfazer". Lança erro com mensagem pronta para o usuário. */
  saveContact: (draft: ContactDraft) => Promise<void>
  /** Busca digitada no topo da página, que a tela Pessoas aplica ao abrir. */
  topQuery: string
  clearTopQuery: () => void
}

export const KomiContext = createContext<KomiCtx | null>(null)

export function useKomi(): KomiCtx {
  const ctx = useContext(KomiContext)
  if (!ctx) throw new Error('useKomi só funciona dentro do KomiShell')
  return ctx
}
