// Salvar, editar e DESFAZER um lançamento. A API entra por parâmetro para dar para testar sem rede.

import { entryOp, type EntryDraft } from './entry'
import type { Transaction } from '../types'

export interface EntryApi {
  createTransaction(body: Record<string, unknown> & { name: string; valor: number; tipo: string; categoria: string }): Promise<{ id: string }>
  createInstallment(body: Record<string, unknown> & { name: string; valor_total: number; num_parcelas: number }): Promise<{ group_id: string }>
  createTransfer(body: { from_account: string; to_account?: string; to_card?: string; valor: number; data?: string; notes?: string }): Promise<{ transfer_id: string }>
  updateTransaction(id: string, body: Record<string, unknown>): Promise<unknown>
  deleteTransaction(id: string): Promise<unknown>
  deleteInstallment(id: string): Promise<unknown>
  deleteTransfer(id: string): Promise<unknown>
}

export interface SubmitResult {
  /** Frase de confirmação para o aviso. */
  message: string
  /** Desfaz exatamente o que foi feito. */
  undo: () => Promise<void>
}

type Money = (v: number) => string

export async function submitEntry(draft: EntryDraft, api: EntryApi, money: Money): Promise<SubmitResult> {
  const op = entryOp(draft)

  if (op.op === 'installment') {
    const { group_id } = await api.createInstallment(op.body)
    const each = Math.round((op.body.valor_total / op.body.num_parcelas) * 100) / 100
    return {
      message: `${op.body.name} em ${op.body.num_parcelas}x de ${money(each)}`,
      undo: async () => { await api.deleteInstallment(group_id) },
    }
  }

  if (op.op === 'transfer') {
    const { transfer_id } = await api.createTransfer(op.body)
    const paying = !!op.body.to_card
    return {
      message: paying
        ? `Fatura do ${op.body.to_card}: ${money(op.body.valor)} pagos com ${op.body.from_account}`
        : `Transferência de ${money(op.body.valor)}: ${op.body.from_account} → ${op.body.to_account}`,
      undo: async () => { await api.deleteTransfer(transfer_id) },
    }
  }

  const { id } = await api.createTransaction(op.body)
  return {
    message: op.body.tipo === 'Receita' ? `Entrada de ${money(op.body.valor)}: ${op.body.name}` : `Gasto de ${money(op.body.valor)}: ${op.body.name}`,
    undo: async () => { await api.deleteTransaction(id) },
  }
}

/** Corpo de PATCH com a origem certa (cartão tem prioridade; senão a conta pelo nome). */
function patchBody(d: { name: string; valor: number; tipo: string; categoria: string; data: string; notes?: string }, origin: { card_id?: string | null; conta?: string }) {
  return { name: d.name, valor: d.valor, tipo: d.tipo, categoria: d.categoria, data: d.data, notes: d.notes || undefined, ...(origin.card_id ? { card_id: origin.card_id } : { conta: origin.conta }) }
}

export async function updateEntry(before: Transaction, draft: EntryDraft, api: EntryApi, money: Money): Promise<SubmitResult> {
  const op = entryOp({ ...draft, installments: 1 })
  if (op.op !== 'transaction') throw new Error('Só dá para editar gasto ou entrada.')
  const { name, valor, tipo, categoria, data, notes } = op.body
  await api.updateTransaction(before.id, patchBody({ name, valor, tipo, categoria, data, notes }, { card_id: op.body.card_id, conta: op.body.conta }))
  return {
    message: `Lançamento atualizado: ${name} (${money(valor)})`,
    undo: async () => {
      await api.updateTransaction(before.id, patchBody(
        { name: before.name, valor: before.valor, tipo: before.tipo, categoria: before.categoria, data: before.data, notes: before.notes },
        { card_id: before.card_id, conta: before.conta },
      ))
    },
  }
}

/** Recria um lançamento apagado (o "Desfazer" da exclusão: o backend só tem exclusão lógica). */
export async function recreateTransaction(tx: Transaction, api: EntryApi): Promise<void> {
  await api.createTransaction({
    name: tx.name, valor: tx.valor, tipo: tx.tipo, categoria: tx.categoria, data: tx.data, notes: tx.notes,
    ...(tx.card_id ? { card_id: tx.card_id } : { conta: tx.conta }),
    person_ids: tx.people?.map((p) => p.id),
  })
}
