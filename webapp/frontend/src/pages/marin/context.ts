// Estado compartilhado do shell da Marin: rota, catálogo, preferências e as ações que toda tela usa
// (logar episódio, adicionar anime, navegar, recarregar). As telas leem daqui em vez de receber 10 props.

import { createContext, useContext } from 'react'
import type { CaptureResult } from '../../design/core/capture'
import type { LogDraft } from './lib/log'
import type { Route, ViewId } from './lib/routes'
import type { AnimeSort } from './lib/schemas'
import type { Loaded } from './lib/useLoad'
import type { Anime } from './types'

export interface MarinPrefs {
  art: string
  /** Como o Catálogo e o Quero ver mostram os animes. */
  layout: 'grid' | 'list'
  /** Tamanho dos pôsteres na grade (o "Densidade" do shell antigo). */
  density: 'large' | 'medium' | 'compact'
  /** Ordenação inicial do Catálogo (o "Ordenação padrão" do shell antigo). */
  sort: AnimeSort
}

export const DEFAULT_PREFS: MarinPrefs = { art: 'neon', layout: 'grid', density: 'medium', sort: 'updated' }

/** O que abrir no formulário de logar episódio. */
export interface OpenLog {
  /** Anime já escolhido (ex.: "Logar" no detalhe ou "Começar" na fila). */
  animeId?: string
  /** Episódio já preenchido (ex.: o "log" de uma linha da lista de episódios). */
  episode?: number
  draft?: LogDraft
}

export interface MarinCtx {
  /** Sobe a cada gravação: telas refazem suas consultas quando muda. */
  rev: number
  reload: () => void
  today: string
  route: Route
  goto: (to: Route | ViewId) => void
  /** O catálogo inteiro (vazio enquanto carrega) e o estado da carga. */
  animes: Anime[]
  animesState: Loaded<Anime[]>
  retryAnimes: () => void
  prefs: MarinPrefs
  setPrefs: (patch: Partial<MarinPrefs>) => void
  openLog: (open?: OpenLog) => void
  openAdd: (title?: string) => void
  /** Linha rápida: salva direto se reconheceu o anime e o episódio; senão abre o formulário preenchido. */
  quickLog: (r: CaptureResult, forceForm?: boolean) => boolean
  /** Grava o rascunho com aviso e "Desfazer". Lança erro com mensagem pronta para o usuário. */
  saveLog: (draft: LogDraft) => Promise<void>
  /** Sincroniza com o MyAnimeList (delta ou completo) e avisa o resultado. */
  syncMal: (full?: boolean) => Promise<void>
  syncing: boolean
  /** Busca digitada no topo da página, que o Catálogo aplica ao abrir. */
  topQuery: string
  clearTopQuery: () => void
}

export const MarinContext = createContext<MarinCtx | null>(null)

export function useMarin(): MarinCtx {
  const ctx = useContext(MarinContext)
  if (!ctx) throw new Error('useMarin só funciona dentro do MarinShell')
  return ctx
}
