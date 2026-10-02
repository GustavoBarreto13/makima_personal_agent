// Estado compartilhado do shell da Nami: contas, cartões, categorias e as ações que toda tela usa
// (lançar, pagar, recarregar). Telas leem daqui em vez de receber 10 props.

import { createContext, useContext } from 'react'
import type { CaptureResult } from '../../design/core/capture'
import type { EntryDraft, EntryKind, Source } from './lib/entry'
import type { Account, Card, Category, Transaction } from './types'

export type ViewId = 'home' | 'transactions' | 'cards' | 'recurring' | 'summary' | 'accounts' | 'installments' | 'loans' | 'budgets' | 'shopping'

/** O que abrir no formulário de lançamento. */
export interface OpenEntry {
  kind?: EntryKind
  /** Rascunho já preenchido (ex.: vindo da captura rápida). */
  draft?: EntryDraft
  /** Editar um lançamento existente. */
  edit?: Transaction
}

/** Pedido de pagamento: conta fixa/assinatura (confirmar valor real) ou fatura de cartão. */
export type PayRequest =
  | { kind: 'conta' | 'assinatura'; id: string; name: string; valor: number }
  | { kind: 'fatura'; cardId: string; name: string; valor: number; invoice?: string }

export interface NamiCtx {
  accounts: Account[]
  cards: Card[]
  categories: Category[]
  /** Contas ativas e cartões, no formato das listas de escolha. */
  sources: Source[]
  /** Origem usada quando o lançamento não diz de onde saiu (a última escolhida, senão a 1ª conta). */
  defaultSource: Source | null
  /** Sobe a cada gravação: telas refazem suas consultas quando muda. */
  rev: number
  reload: () => void
  /** Modo privacidade: esconde os valores. */
  hide: boolean
  money: (value: number) => string
  goto: (view: ViewId) => void
  openEntry: (open?: OpenEntry) => void
  openPay: (req: PayRequest) => void
  /** Captura rápida: salva direto se deu para entender tudo; senão abre o formulário preenchido. */
  quickCapture: (r: CaptureResult, forceForm?: boolean) => boolean
  /** Grava um rascunho (ou edita) com aviso e "Desfazer". Lança erro com mensagem pronta para o usuário. */
  save: (draft: EntryDraft, editing?: Transaction | null) => Promise<void>
  /**
   * Exclui com confirmação e "Desfazer". Devolve true só se excluiu (false = o usuário cancelou).
   * Transferência apaga o par; `siblings` ajuda a recriá-lo no Desfazer.
   */
  remove: (tx: Transaction, siblings?: Transaction[]) => Promise<boolean>
}

export const NamiContext = createContext<NamiCtx | null>(null)

export function useNami(): NamiCtx {
  const ctx = useContext(NamiContext)
  if (!ctx) throw new Error('useNami só funciona dentro do NamiShell')
  return ctx
}
