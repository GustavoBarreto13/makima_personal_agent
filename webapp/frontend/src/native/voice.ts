// Entrada por voz no app: abre o reconhecimento de voz do Android (a janela "Fale agora" do sistema) e devolve o
// texto falado para a captura rápida (design/headless/voice.ts). Não precisa de permissão de microfone: quem ouve
// é o próprio sistema. No site isto nunca é registrado, e o botão do microfone não aparece.

import { registerPlugin } from '@capacitor/core'
import { setVoiceProvider } from '../design/headless/voice'
import { isNativeApp } from './nativeAuth'

interface VoiceInputPlugin {
  /** Abre o reconhecimento de voz. `text` vem vazio se o usuário cancelou. */
  listen(options: { prompt?: string }): Promise<{ text: string }>
}

const VoiceInput = registerPlugin<VoiceInputPlugin>('VoiceInput')

/** Liga o botão de microfone da captura rápida (só no app). */
export function initVoice(): void {
  if (!isNativeApp()) return
  setVoiceProvider(async () => {
    try {
      const { text } = await VoiceInput.listen({ prompt: 'Fale agora' })
      return text ?? ''
    } catch (e) {
      // Sem reconhecimento de voz no aparelho (ou build antigo sem o plugin).
      throw new Error(e instanceof Error && e.message ? e.message : 'Reconhecimento de voz indisponível neste aparelho.')
    }
  })
}
