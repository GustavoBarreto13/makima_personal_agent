// Entrada por voz: o Design System não sabe COMO ouvir (isso é do aparelho), só aceita um "provedor".
//
// O app Android registra um provedor (native/voice.ts) que abre o reconhecimento de voz do sistema; o site não
// registra nenhum, e então a <QuickCapture> nem desenha o botão do microfone. Mesmo padrão do
// `setToastToneListener`: o design/ nunca importa Capacitor.

import { useSyncExternalStore } from 'react'

/** Escuta o usuário e devolve o texto falado ('' se ele cancelou). Rejeita se o reconhecimento não estiver disponível. */
export type VoiceProvider = () => Promise<string>

let provider: VoiceProvider | null = null
const listeners = new Set<() => void>()

/** Registra (ou, com `null`, remove) quem sabe ouvir. */
export function setVoiceProvider(fn: VoiceProvider | null): void {
  provider = fn
  listeners.forEach((l) => l())
}

/** Quem está registrado agora (`null` = sem entrada por voz). */
export function getVoiceProvider(): VoiceProvider | null {
  return provider
}

/** Hook: o provedor atual; re-renderiza quando ele é registrado. */
export function useVoiceProvider(): VoiceProvider | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getVoiceProvider,
    getVoiceProvider,
  )
}
