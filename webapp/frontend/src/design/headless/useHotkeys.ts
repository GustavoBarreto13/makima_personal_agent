// useHotkeys — um único hook de atalhos para o app inteiro.
// Atalhos de uma tecla são ignorados quando o foco está num campo de texto; os `global`
// (Ctrl+K, Ctrl+Enter, Esc) funcionam em qualquer lugar. Sequências: 'g h' (g, depois h).

import { useEffect, useRef } from 'react'
import { isTypingTarget, matchShortcut, stepSequence } from '../core/hotkeys'

export interface HotkeyBinding {
  /** 'mod+k' · 'n' · '/' · '?' · 'esc' · 'g h' (sequência). */
  keys: string
  handler: (e: KeyboardEvent) => void
  /** Vale mesmo com foco em campo de texto. */
  global?: boolean
}

export function useHotkeys(bindings: HotkeyBinding[], enabled = true): void {
  const ref = useRef(bindings)
  ref.current = bindings

  useEffect(() => {
    if (!enabled) return
    let seq = { pending: false, at: 0 }

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = isTypingTarget(t?.tagName, !!t?.isContentEditable)
      const list = ref.current

      // Combinações simples
      for (const b of list) {
        if (b.keys.includes(' ')) continue
        if (typing && !b.global) continue
        if (matchShortcut(e, b.keys)) {
          b.handler(e)
          return
        }
      }

      // Sequências "g + letra" (só fora de campos)
      if (typing) return
      const step = stepSequence(seq, e, Date.now())
      seq = step.state
      if (step.completed) {
        const hit = list.find((b) => b.keys.toLowerCase() === `g ${step.completed}`)
        if (hit) hit.handler(e)
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}
