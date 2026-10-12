import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from '../context'
import { legacyPrefs } from './legacy'

function memory(initial: Record<string, string>) {
  const data = { ...initial }
  return { data, getItem: (k: string) => data[k] ?? null, removeItem: (k: string) => { delete data[k] } }
}

describe('preferências do shell antigo', () => {
  it('modo foco e tipografia técnica viram foco e Roteiro; a chave antiga some', () => {
    const s = memory({ 'vl-tweaks': JSON.stringify({ theme: 'dark', accent: 'gold', mode: 'focus', typography: 'technical' }) })
    expect(legacyPrefs(DEFAULT_PREFS, s)).toEqual({ ...DEFAULT_PREFS, focus: true, font: 'roteiro' })
    expect(s.data['vl-tweaks']).toBeUndefined()
  })
  it('sem nada salvo ou com lixo, fica o padrão', () => {
    expect(legacyPrefs(DEFAULT_PREFS, memory({}))).toEqual(DEFAULT_PREFS)
    expect(legacyPrefs(DEFAULT_PREFS, memory({ 'vl-tweaks': '{oops' }))).toEqual(DEFAULT_PREFS)
  })
})
