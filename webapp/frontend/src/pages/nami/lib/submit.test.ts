import { describe, expect, it, vi } from 'vitest'
import { emptyDraft, type EntryDraft, type Source } from './entry'
import { recreateTransaction, submitEntry, updateEntry, type EntryApi } from './submit'
import type { Transaction } from '../types'

const itau: Source = { kind: 'account', id: 'a1', name: 'Itaú' }
const nubank: Source = { kind: 'card', id: 'c1', name: 'Nubank' }
const money = (v: number) => `R$ ${v.toFixed(2)}`

function fakeApi(): EntryApi & { calls: [string, unknown][] } {
  const calls: [string, unknown][] = []
  const rec = (name: string, ret: unknown) => vi.fn(async (...args: unknown[]) => { calls.push([name, args]); return ret })
  return {
    calls,
    createTransaction: rec('createTransaction', { id: 'tx-1' }),
    createInstallment: rec('createInstallment', { group_id: 'g-1' }),
    createTransfer: rec('createTransfer', { transfer_id: 't-1' }),
    updateTransaction: rec('updateTransaction', {}),
    deleteTransaction: rec('deleteTransaction', {}),
    deleteInstallment: rec('deleteInstallment', {}),
    deleteTransfer: rec('deleteTransfer', {}),
  } as never
}

const gasto: EntryDraft = { ...emptyDraft('gasto', itau, '2026-10-02'), name: 'mercado', valor: 50 }

describe('salvar e desfazer', () => {
  it('gasto: cria a transação e o desfazer apaga exatamente essa', async () => {
    const api = fakeApi()
    const r = await submitEntry(gasto, api, money)
    expect(r.message).toBe('Gasto de R$ 50.00: mercado')
    await r.undo()
    expect(api.calls.map((c) => c[0])).toEqual(['createTransaction', 'deleteTransaction'])
    expect(api.calls[1][1]).toEqual(['tx-1'])
  })

  it('entrada tem mensagem própria', async () => {
    const r = await submitEntry({ ...gasto, kind: 'entrada', name: 'salário', valor: 3000 }, fakeApi(), money)
    expect(r.message).toBe('Entrada de R$ 3000.00: salário')
  })

  it('parcelado: cria o grupo e o desfazer apaga o grupo inteiro', async () => {
    const api = fakeApi()
    const r = await submitEntry({ ...gasto, name: 'TV', valor: 1200, installments: 10, source: nubank }, api, money)
    expect(r.message).toBe('TV em 10x de R$ 120.00')
    await r.undo()
    expect(api.calls.map((c) => c[0])).toEqual(['createInstallment', 'deleteInstallment'])
    expect(api.calls[1][1]).toEqual(['g-1'])
  })

  it('transferência e pagamento de fatura: o desfazer apaga o PAR pelo transfer_id', async () => {
    const api = fakeApi()
    const t = { ...emptyDraft('transferencia', itau, '2026-10-02'), valor: 100, destination: { kind: 'account', id: 'a2', name: 'NuConta' } as Source }
    const r1 = await submitEntry(t, api, money)
    expect(r1.message).toBe('Transferência de R$ 100.00: Itaú → NuConta')
    await r1.undo()
    const r2 = await submitEntry({ ...t, destination: nubank, valor: 500 }, api, money)
    expect(r2.message).toBe('Fatura do Nubank: R$ 500.00 pagos com Itaú')
    await r2.undo()
    expect(api.calls.filter((c) => c[0] === 'deleteTransfer').map((c) => c[1])).toEqual([['t-1'], ['t-1']])
  })

  it('rascunho inválido não toca na API', async () => {
    const api = fakeApi()
    await expect(submitEntry({ ...gasto, valor: null }, api, money)).rejects.toThrow('valor')
    expect(api.calls).toEqual([])
  })
})

describe('editar e excluir', () => {
  const tx = { id: 'tx-9', name: 'Mercado', valor: 80, tipo: 'Despesa', categoria: 'Supermercado', conta: 'Nubank', card_id: 'c1', data: '2026-09-30', notes: 'n' } as Transaction

  it('edita e o desfazer restaura os valores antigos, inclusive a origem (cartão)', async () => {
    const api = fakeApi()
    const r = await updateEntry(tx, { ...gasto, name: 'Mercado Extra', valor: 95, source: itau }, api, money)
    expect(r.message).toBe('Lançamento atualizado: Mercado Extra (R$ 95.00)')
    await r.undo()
    const [[, [id1, novo]], [, [id2, antigo]]] = api.calls as [string, [string, Record<string, unknown>]][]
    expect(id1).toBe('tx-9')
    expect(novo).toMatchObject({ valor: 95, conta: 'Itaú' })
    expect(novo).not.toHaveProperty('card_id')
    expect(id2).toBe('tx-9')
    expect(antigo).toMatchObject({ name: 'Mercado', valor: 80, card_id: 'c1', data: '2026-09-30' })
    expect(antigo).not.toHaveProperty('conta')
  })

  it('edição ignora parcelas (editar uma parcela não cria outro parcelamento)', async () => {
    const api = fakeApi()
    await updateEntry(tx, { ...gasto, installments: 5 }, api, money)
    expect(api.calls.map((c) => c[0])).toEqual(['updateTransaction'])
  })

  it('desfazer a exclusão recria o lançamento com a mesma origem e pessoas', async () => {
    const api = fakeApi()
    await recreateTransaction({ ...tx, people: [{ id: 'p1', name: 'Ana' }] }, api)
    expect(api.calls[0][0]).toBe('createTransaction')
    expect(api.calls[0][1]).toEqual([{ name: 'Mercado', valor: 80, tipo: 'Despesa', categoria: 'Supermercado', data: '2026-09-30', notes: 'n', card_id: 'c1', person_ids: ['p1'] }])
  })
})
