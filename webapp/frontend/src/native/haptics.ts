// Vibração leve ao concluir/errar algo. No site não faz nada.

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNativeApp } from './nativeAuth'
import { setToastToneListener, type ToastTone } from '../design/headless/toast'

/** Vibra conforme o resultado. Nunca lança (aparelho sem vibrador só ignora). */
export async function haptic(kind: 'success' | 'error' | 'light'): Promise<void> {
  if (!isNativeApp()) return
  try {
    if (kind === 'light') await Haptics.impact({ style: ImpactStyle.Light })
    else await Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Error })
  } catch {
    /* sem vibrador: tudo bem */
  }
}

/** Liga a vibração aos toasts: sucesso e erro vibram, aviso neutro não. Chamado uma vez em main.tsx. */
export function initHaptics(): void {
  if (!isNativeApp()) return
  setToastToneListener((tone: ToastTone) => {
    if (tone === 'success' || tone === 'error') void haptic(tone)
  })
}
