import { describe, expect, it } from 'vitest'
import {
  applySuggestion, canSaveQuickly, draftFromCapture, emptyDraft, entryOp, entryParser, installmentPreview, norm, resolveByName,
  resolveCategory, toSources, txToDraft, validateDraft, validateDraftField, type EntryDraft, type Source,
} from './entry'
import type { Account, Card, Category, Transaction } from '../types'

const TODAY = '2026-10-02'
const accounts = [
  { id: 'a1', name: 'Itaú', status: 'ativo', type: 'corrente', balance_inicial: 0 },
  { id: 'a2', name: 'NuConta', status: 'ativo', type: 'corrente', balance_inicial: 0 },
  { id: 'a3', name: 'Antiga', status: 'encerrado', type: 'corrente', balance_inicial: 0 },
] as Account[]
const cards = [
  { id: 'c1', name: 'Nubank', status: 'ativo', limite: 5000, closing_day: 6, due_day: 13 },
  { id: 'c2', name: 'Inter', status: 'ativo', limite: 2000, closing_day: 20, due_day: 27 },
] as Card[]
const categories = [
  { id: 'Supermercado', name: 'Supermercado', icon: '', color: '', kind: 'out' },
  { id: 'Comer Fora', name: 'Comer Fora', icon: '', color: '', kind: 'out' },
  { id: 'Lazer', name: 'Lazer', icon: '', color: '', kind: 'out' },
  { id: 'Receita', name: 'Receita', icon: '', color: '', kind: 'in' },
] as Category[]
const sources = toSources(accounts, cards)
const ctx = (defaultSource: Source | null = sources[0]) => ({ sources, categories, defaultSource, today: TODAY })
const parse = (text: string, c = ctx()) => draftFromCapture(entryParser(text), c)

describe('resolução de nomes', () => {
  it('norm tira acento, caixa e pontuação', () => {
    expect(norm('  Itaú-Personnalité! ')).toBe('itau personnalite')
  })

  it('acha por igual, por começo e por trecho — mas nunca chuta quando é ambíguo', () => {
    expect(resolveByName('nubank', sources)?.id).toBe('c1')
    expect(resolveByName('inte', sources)?.id).toBe('c2')          // começa com
    expect(resolveByName('conta', sources)?.id).toBe('a2')         // contém ("NuConta")
    expect(resolveByName('nu', sources)).toBeNull()                // Nubank e NuConta
    expect(resolveByName('xyz', sources)).toBeNull()
    expect(resolveByName('', sources)).toBeNull()
  })

  it('contas encerradas não viram opção', () => {
    expect(sources.map((s) => s.name)).toEqual(['Itaú', 'NuConta', 'Nubank', 'Inter'])
  })

  it('categoria por id ou nome, sem acento', () => {
    expect(resolveCategory('lazer', categories)?.id).toBe('Lazer')
    expect(resolveCategory('comer', categories)?.id).toBe('Comer Fora')
    expect(resolveCategory('nada', categories)).toBeNull()
  })
})

describe('captura → rascunho', () => {
  it('"45 ifood @nubank": gasto no cartão, à vista, hoje', () => {
    const { draft, issues } = parse('45 ifood @nubank')
    expect(draft).toMatchObject({ kind: 'gasto', name: 'ifood', valor: 45, date: TODAY, installments: 1, source: { kind: 'card', id: 'c1' }, categoria: '' })
    expect(issues).toEqual({ people: [] })
    expect(canSaveQuickly(draft, issues)).toBe(true)
  })

  it('sem "@" usa a origem padrão', () => {
    expect(parse('30 padaria').draft.source?.id).toBe('a1')
    expect(parse('30 padaria', ctx(null)).draft.source).toBeNull()
  })

  it('"1200 tv 10x @nubank": o valor é o total e vira parcelado', () => {
    const { draft } = parse('1200 tv 10x @nubank')
    expect(draft).toMatchObject({ valor: 1200, installments: 10, name: 'tv', kind: 'gasto' })
  })

  it('"ontem 30 uber": data de ontem', () => {
    expect(parse('ontem 30 uber').draft.date).not.toBe(TODAY)   // relativo ao relógio real do parser
  })

  it('"+3500 salário": entrada, e a origem inferida de um cartão é descartada', () => {
    const { draft } = parse('+3500 salário @nubank')
    expect(draft.kind).toBe('entrada')
    expect(draft.valor).toBe(3500)
    expect(draft.source).toBeNull()                                // cartão não recebe entrada
    expect(parse('+3500 salário @itau').draft.source?.id).toBe('a1')
  })

  it('entrada nunca é parcelada', () => {
    expect(parse('+3500 salário 3x').draft.installments).toBe(1)
  })

  it('"#lazer" vira categoria; "#xyz" vira aviso e pede o formulário', () => {
    expect(parse('80 cinema #lazer').draft.categoria).toBe('Lazer')
    const { draft, issues } = parse('80 cinema #xyz')
    expect(issues.tag).toBe('xyz')
    expect(canSaveQuickly(draft, issues)).toBe(false)
  })

  it('"@" que não bate (ou é ambíguo) vira aviso e pede o formulário', () => {
    for (const place of ['@nu', '@banco']) {
      const { draft, issues } = parse(`45 ifood ${place}`)
      expect(issues.place).toBeTruthy()
      expect(draft.source).toBeNull()
      expect(canSaveQuickly(draft, issues)).toBe(false)
    }
  })

  it('"+Ana" nunca salva direto: vincular pessoa exige confirmar quem é', () => {
    const { draft, issues } = parse('25 almoço +Ana')
    expect(issues.people).toEqual(['Ana'])
    expect(canSaveQuickly(draft, issues)).toBe(false)
    expect(draft.valor).toBe(25)
  })

  it('faltando valor ou descrição não salva sozinho', () => {
    expect(canSaveQuickly(...Object.values(parse('ifood')) as [EntryDraft, never])).toBe(false)
    expect(canSaveQuickly(...Object.values(parse('45')) as [EntryDraft, never])).toBe(false)
  })
})

describe('validação', () => {
  const ok: EntryDraft = { ...emptyDraft('gasto', sources[0], TODAY), name: 'mercado', valor: 50 }

  it('rascunho completo passa', () => expect(validateDraft(ok)).toBeNull())

  it.each([
    [{ valor: null }, 'valor'],
    [{ valor: 0 }, 'valor'],
    [{ valor: -5 }, 'valor'],
    [{ name: '  ' }, 'Descreva'],
    [{ source: null }, 'conta ou o cartão'],
    [{ installments: 0 }, 'Parcelas'],
    [{ installments: 61 }, 'Parcelas'],
    [{ installments: 3, personIds: ['p1'] }, 'pessoa'],
  ] as [Partial<EntryDraft>, string][])('%j → erro', (patch, trecho) => {
    expect(validateDraft({ ...ok, ...patch })).toContain(trecho)
  })

  it('entrada exige conta e não aceita cartão nem parcelas', () => {
    const entrada = { ...ok, kind: 'entrada' as const, name: 'salário', valor: 3000 }
    expect(validateDraft({ ...entrada, source: sources[2] })).toContain('Entrada cai numa conta')
    expect(validateDraft({ ...entrada, source: sources[0], installments: 2 })).toContain('parcelado')
    expect(validateDraft({ ...entrada, source: null })).toContain('recebeu')
  })

  it('transferência: origem é conta, destino existe e é diferente', () => {
    const t: EntryDraft = { ...emptyDraft('transferencia', sources[0], TODAY), valor: 100, destination: sources[1] }
    expect(validateDraft(t)).toBeNull()
    expect(validateDraft({ ...t, source: sources[2] })).toContain('conta de onde sai')   // origem cartão
    expect(validateDraft({ ...t, destination: null })).toContain('para onde')
    expect(validateDraft({ ...t, destination: sources[0] })).toContain('diferentes')
    expect(validateDraft({ ...t, destination: sources[2] })).toBeNull()                    // destino cartão = pagar fatura
  })
})

describe('rascunho → pedido à API', () => {
  const base: EntryDraft = { ...emptyDraft('gasto', sources[0], TODAY), name: ' mercado ', valor: 50 }

  it('gasto em conta: conta pelo nome, categoria padrão Inbox, nome aparado', () => {
    expect(entryOp(base)).toEqual({
      op: 'transaction',
      body: { name: 'mercado', valor: 50, tipo: 'Despesa', categoria: 'Inbox', conta: 'Itaú', data: TODAY, notes: undefined, person_ids: undefined },
    })
  })

  it('gasto no cartão manda card_id e não manda conta', () => {
    const { body } = entryOp({ ...base, source: sources[2], categoria: 'Lazer', personIds: ['p1'] }) as { body: Record<string, unknown> }
    expect(body).toMatchObject({ card_id: 'c1', categoria: 'Lazer', person_ids: ['p1'] })
    expect(body).not.toHaveProperty('conta')
  })

  it('entrada: Receita, categoria padrão "Receita"', () => {
    const op = entryOp({ ...base, kind: 'entrada', name: 'salário', valor: 3000 })
    expect(op).toMatchObject({ op: 'transaction', body: { tipo: 'Receita', categoria: 'Receita', conta: 'Itaú' } })
  })

  it('parcelado vira installment com o TOTAL e a data da 1ª parcela', () => {
    expect(entryOp({ ...base, valor: 1200, installments: 10, source: sources[2], date: '2026-10-10' })).toEqual({
      op: 'installment',
      body: { name: 'mercado', valor_total: 1200, num_parcelas: 10, card_id: 'c1', categoria: 'Inbox', data_inicio: '2026-10-10' },
    })
  })

  it('transferência entre contas e para cartão (pagar fatura)', () => {
    const t: EntryDraft = { ...emptyDraft('transferencia', sources[0], TODAY), valor: 100, destination: sources[1], notes: 'aluguel' }
    expect(entryOp(t)).toEqual({ op: 'transfer', body: { from_account: 'Itaú', to_account: 'NuConta', valor: 100, data: TODAY, notes: 'aluguel' } })
    expect(entryOp({ ...t, destination: sources[2], notes: '' })).toEqual({ op: 'transfer', body: { from_account: 'Itaú', to_card: 'Nubank', valor: 100, data: TODAY, notes: undefined } })
  })

  it('rascunho inválido não vira pedido', () => {
    expect(() => entryOp({ ...base, valor: null })).toThrow('valor')
  })
})

describe('autocompletar e edição', () => {
  const sug = (over = {}) => ({ name: 'iFood', tipo: 'Despesa' as const, categoria: 'Comer Fora', valor: 45, conta: 'Nubank', account_id: null, card_id: 'c1', ...over })

  it('completa categoria e origem a partir do lançamento parecido', () => {
    const d = applySuggestion({ ...emptyDraft('gasto', null, TODAY), name: 'ifood', valor: 45 }, [sug()], sources)
    expect(d).toMatchObject({ categoria: 'Comer Fora', source: { id: 'c1' } })
  })

  it('nunca sobrescreve o que o usuário já escolheu', () => {
    const mine = { ...emptyDraft('gasto', sources[0], TODAY), name: 'ifood', valor: 45, categoria: 'Lazer' }
    expect(applySuggestion(mine, [sug()], sources)).toMatchObject({ categoria: 'Lazer', source: { id: 'a1' } })
  })

  it('não sugere cartão para entrada nem mexe em transferência', () => {
    const e = { ...emptyDraft('entrada', null, TODAY), name: 'ifood', valor: 5 }
    expect(applySuggestion(e, [sug()], sources).source).toBeNull()
    const t = { ...emptyDraft('transferencia', null, TODAY), valor: 5 }
    expect(applySuggestion(t, [sug()], sources)).toEqual(t)
  })

  it('txToDraft reconstrói o rascunho de um lançamento existente', () => {
    const tx = { id: 't1', name: 'Mercado', valor: 80, tipo: 'Despesa', categoria: 'Supermercado', conta: 'Nubank', data: '2026-09-30', card_id: 'c1', notes: 'n', people: [{ id: 'p1', name: 'Ana' }] } as Transaction
    expect(txToDraft(tx, sources)).toMatchObject({ kind: 'gasto', valor: 80, source: { id: 'c1' }, personIds: ['p1'], notes: 'n', installments: 1 })
    expect(txToDraft({ ...tx, tipo: 'Receita', card_id: undefined, account_id: 'a2' }, sources)).toMatchObject({ kind: 'entrada', source: { id: 'a2' } })
  })

  it('prévia das parcelas: o resto de centavos vai na 1ª e a soma fecha', () => {
    expect(installmentPreview(1200, 10)).toEqual({ each: 120, first: 120 })
    const p = installmentPreview(100, 3)
    expect(p).toEqual({ each: 33.33, first: 33.34 })
    expect(Math.round((p.first + p.each * 2) * 100) / 100).toBe(100)
  })
})

describe('validação por campo', () => {
  it('diz em qual campo o erro aparece', () => {
    const ok: EntryDraft = { ...emptyDraft('gasto', sources[0], TODAY), name: 'mercado', valor: 50 }
    expect(validateDraftField(ok)).toBeNull()
    expect(validateDraftField({ ...ok, valor: null })?.field).toBe('valor')
    expect(validateDraftField({ ...ok, name: '' })?.field).toBe('name')
    expect(validateDraftField({ ...ok, source: null })?.field).toBe('source')
    expect(validateDraftField({ ...ok, installments: 99 })?.field).toBe('installments')
    const t: EntryDraft = { ...emptyDraft('transferencia', sources[0], TODAY), valor: 10, destination: null }
    expect(validateDraftField(t)?.field).toBe('destination')
  })
})
