// Estado compartilhado do shell da Frieren: rota, catálogo, estantes, preferências e as ações que toda tela
// usa (registrar leitura, adicionar livro, navegar, recarregar). As telas leem daqui em vez de receber 10 props.

import { createContext, useContext } from 'react'
import type { CaptureResult } from '../../design/core/capture'
import type { LogDraft } from './lib/log'
import type { Route, ViewId } from './lib/routes'
import type { Loaded } from './lib/useLoad'
import type { Book, Shelf } from './types'

export interface FrierenPrefs {
  art: string
  /** Como a Biblioteca e o Quero ler mostram os livros. */
  layout: 'grid' | 'list'
  /** Tamanho das capas na grade (o "Densidade" do shell antigo). */
  density: 'large' | 'medium' | 'compact'
  /** Estilo do topo do Início (o "Hero layout" do shell antigo):
   *  cinematic = retrato da Frieren · editorial = compacto · gallery = a capa do livro atual no lugar do retrato. */
  heroLayout: 'cinematic' | 'editorial' | 'gallery'
  /** Meta de livros por ano (cartão do Início e Estatísticas). */
  yearlyGoal: number
}

export const DEFAULT_PREFS: FrierenPrefs = { art: 'elfica', layout: 'grid', density: 'medium', heroLayout: 'cinematic', yearlyGoal: 24 }

/** O que abrir no formulário de registrar leitura. */
export interface OpenLog {
  /** Livro já escolhido (ex.: "Registrar" no detalhe ou "Começar a ler" na pilha). */
  bookId?: string
  draft?: LogDraft
}

export interface FrierenCtx {
  /** Sobe a cada gravação: telas refazem suas consultas quando muda. */
  rev: number
  reload: () => void
  today: string
  route: Route
  goto: (to: Route | ViewId) => void
  /** O catálogo inteiro (vazio enquanto carrega) e o estado da carga. */
  books: Book[]
  booksState: Loaded<Book[]>
  retryBooks: () => void
  shelves: Shelf[]
  prefs: FrierenPrefs
  setPrefs: (patch: Partial<FrierenPrefs>) => void
  openLog: (open?: OpenLog) => void
  openAdd: (title?: string) => void
  /** Linha rápida: salva direto se reconheceu o livro e o progresso; senão abre o formulário preenchido. */
  quickLog: (r: CaptureResult, forceForm?: boolean) => boolean
  /** Grava o rascunho com aviso e "Desfazer". Lança erro com mensagem pronta para o usuário. */
  saveLog: (draft: LogDraft) => Promise<void>
  /** Busca digitada no topo da página, que a Biblioteca aplica ao abrir. */
  topQuery: string
  clearTopQuery: () => void
}

export const FrierenContext = createContext<FrierenCtx | null>(null)

export function useFrieren(): FrierenCtx {
  const ctx = useContext(FrierenContext)
  if (!ctx) throw new Error('useFrieren só funciona dentro do FrierenShell')
  return ctx
}
