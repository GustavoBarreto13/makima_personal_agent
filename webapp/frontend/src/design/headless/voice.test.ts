// Porta de entrada por voz (headless/voice.ts): registrar e remover o provedor.

import { afterEach, describe, expect, it } from 'vitest'
import { getVoiceProvider, setVoiceProvider } from './voice'

describe('setVoiceProvider', () => {
  afterEach(() => setVoiceProvider(null))

  it('começa sem provedor (site: sem botão de microfone)', () => {
    expect(getVoiceProvider()).toBeNull()
  })

  it('registra e remove', async () => {
    setVoiceProvider(async () => 'pagar luz amanhã 180')
    expect(await getVoiceProvider()!()).toBe('pagar luz amanhã 180')
    setVoiceProvider(null)
    expect(getVoiceProvider()).toBeNull()
  })
})
