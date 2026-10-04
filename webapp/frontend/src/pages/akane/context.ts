// Estado compartilhado do shell da Akane: rota, locais e as ações que toda tela usa (logar, navegar,
// recarregar). Telas leem daqui em vez de receber 10 props.

import { createContext, useContext } from 'react'
import type { CaptureResult } from '../../design/core/capture'
import type { LogDraft } from './lib/log'
import type { Route, ViewId } from './lib/routes'
import type { TmdbResult, WatchLocation } from './types'

export interface AkanePrefs {
  art: string
  /** Como Filmes e Quero ver mostram os itens. */
  layout: 'grid' | 'list'
  /** Meta de filmes por ano (cartão do Início). Pode faltar em preferências salvas antes da meta existir. */
  yearlyGoal: number
}

/** O que abrir no formulário de logar. */
export interface OpenLog {
  draft?: LogDraft
  /** Filme já escolhido (ex.: "Logar" no detalhe ou no Quero ver). */
  film?: TmdbResult
}

export interface AkaneCtx {
  /** Sobe a cada gravação: telas refazem suas consultas quando muda. */
  rev: number
  reload: () => void
  today: string
  route: Route
  goto: (to: Route | ViewId) => void
  locations: WatchLocation[]
  prefs: AkanePrefs
  setPrefs: (patch: Partial<AkanePrefs>) => void
  openLog: (open?: OpenLog) => void
  /** Grava a sessão com aviso e "Desfazer". Lança erro com mensagem pronta para o usuário. */
  save: (draft: LogDraft) => Promise<void>
  /** Linha rápida: salva direto se reconheceu o filme com certeza; senão abre o formulário preenchido. */
  quickLog: (r: CaptureResult, forceForm?: boolean) => boolean
}

export const AkaneContext = createContext<AkaneCtx | null>(null)

export function useAkane(): AkaneCtx {
  const ctx = useContext(AkaneContext)
  if (!ctx) throw new Error('useAkane só funciona dentro do AkaneShell')
  return ctx
}
