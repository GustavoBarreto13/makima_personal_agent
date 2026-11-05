// Barra de status do Android (hora, bateria): acompanha o tema claro/escuro do Design System.
// A cor por agente não é aplicada: no Android 15+ o app desenha por baixo da barra (edge-to-edge)
// e a cor de fundo escolhida pelo app é ignorada.

import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from './nativeAuth'

/**
 * Ajusta os ícones da barra de status ao tema atual.
 *
 * @param dark - `true` no tema escuro (ícones claros); `false` no claro (ícones escuros).
 */
export async function applyStatusBar(dark: boolean): Promise<void> {
  if (!isNativeApp()) return
  try {
    // Style.Dark = "tema escuro do app" → ícones claros; Style.Light → ícones escuros.
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    // Cor de fundo igual à do app (o que estiver pintado no <body>), onde o Android ainda respeita.
    const bg = getComputedStyle(document.body).backgroundColor
    const m = bg.match(/\d+/g)
    if (m && m.length >= 3) {
      const hex = '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
      await StatusBar.setBackgroundColor({ color: hex })
    }
  } catch {
    /* plugin indisponível: a barra fica como está */
  }
}
