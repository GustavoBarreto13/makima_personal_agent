// Comportamento de camadas sobrepostas (modal, sheet, popover): fechar com Esc, clicar fora, prender o foco.

import { useEffect, useRef, type RefObject } from 'react'

/** Fecha com Esc e com mousedown fora do elemento. */
export function useDismissable(ref: RefObject<HTMLElement | null>, onDismiss: () => void, enabled = true, ignore?: RefObject<HTMLElement | null>): void {
  const cb = useRef(onDismiss)
  cb.current = onDismiss
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cb.current()
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || ignore?.current?.contains(t)) return
      cb.current()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [ref, enabled, ignore])
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Prende o Tab dentro do elemento, foca o primeiro campo e devolve o foco ao fechar. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const root = ref.current
    if (!enabled || !root) return
    const previous = document.activeElement as HTMLElement | null
    const visible = (el: HTMLElement) => !el.hidden && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'
    const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible)
    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0]
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = items()
      if (!list.length) return
      const a = list[0]
      const z = list[list.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [ref, enabled])
}
