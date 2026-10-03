import { describe, expect, it } from 'vitest'
import { VIEW_HASH, viewFromHash } from './routes'

describe('rotas por hash', () => {
  it('cada tela volta para si mesma', () => {
    for (const [view, hash] of Object.entries(VIEW_HASH)) expect(viewFromHash(`#${hash}`)).toBe(view)
  })

  it('atalhos antigos continuam funcionando', () => {
    expect(viewFromHash('#dashboard')).toBe('home')
    expect(viewFromHash('#transacoes')).toBe('transactions')
    expect(viewFromHash('#assinaturas')).toBe('recurring')
    expect(viewFromHash('#contas-fixas')).toBe('recurring')
    expect(viewFromHash('#financiamentos')).toBe('loans')
    expect(viewFromHash('#cartoes')).toBe('cards')
  })

  it('hash vazio ou desconhecido cai no início', () => {
    expect(viewFromHash('')).toBe('home')
    expect(viewFromHash('#nada')).toBe('home')
    expect(viewFromHash('#CARTOES')).toBe('cards')
  })
})
