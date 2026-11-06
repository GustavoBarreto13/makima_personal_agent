import { describe, expect, it } from 'vitest'
import { LEAD_OPTIONS, leadOptionsFor, leadToSelect, selectToLead } from './reminder'

describe('antecedência do aviso', () => {
  it('padrão ida e volta: null ⇄ ""', () => {
    expect(leadToSelect(null)).toBe('')
    expect(leadToSelect(undefined)).toBe('')
    expect(selectToLead('')).toBeNull()
  })

  it('"Na hora" (0) e "Sem aviso" (-1) não se confundem com o padrão', () => {
    expect(leadToSelect(0)).toBe('0')
    expect(leadToSelect(-1)).toBe('-1')
    expect(selectToLead('0')).toBe(0)
    expect(selectToLead('-1')).toBe(-1)
  })

  it('cada opção converte de ida e volta', () => {
    for (const o of LEAD_OPTIONS) expect(leadToSelect(selectToLead(o.value))).toBe(o.value)
  })

  it('valor de fora da lista (ex.: 45 min vindo do Telegram) aparece como opção extra', () => {
    const ultima = (n: number) => { const o = leadOptionsFor(n); return o[o.length - 1] }
    expect(ultima(45)).toEqual({ value: '45', label: '45 min antes' })
    expect(ultima(180).label).toBe('3 horas antes')
    expect(ultima(2880).label).toBe('2 dias antes')
  })

  it('valor conhecido não duplica opção', () => {
    expect(leadOptionsFor(30)).toBe(LEAD_OPTIONS)
    expect(leadOptionsFor(null)).toBe(LEAD_OPTIONS)
  })
})
