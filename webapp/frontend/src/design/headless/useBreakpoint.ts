// Breakpoints do padrão — definidos em tokens.json (sm 640 · md 900 · lg 1280).
//   sm  < 640   celular: gaveta + barra inferior + FAB
//   md  640–899 tablet: sidebar em rail de 64px
//   lg  900–1279 desktop
//   xl  >= 1280 desktop largo

import { useEffect, useState, type RefObject } from 'react'
import { BREAKPOINTS } from '../core/tokens.generated'

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl'

export function breakpointOf(width: number): Breakpoint {
  if (width < BREAKPOINTS.sm) return 'sm'
  if (width < BREAKPOINTS.md) return 'md'
  if (width < BREAKPOINTS.lg) return 'lg'
  return 'xl'
}

/** Breakpoint pela largura da janela. */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => (typeof window === 'undefined' ? 'lg' : breakpointOf(window.innerWidth)))
  useEffect(() => {
    const on = () => setBp(breakpointOf(window.innerWidth))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return bp
}

/**
 * Breakpoint pela largura de um elemento (o AppShell responde ao container, não à janela:
 * assim funciona dentro da moldura de celular da página /design e, no futuro, em tablets).
 */
export function useContainerBreakpoint(ref: RefObject<HTMLElement | null>): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('lg')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth
      if (w > 0) setBp(breakpointOf(w))
    })
    ro.observe(el)
    if (el.clientWidth > 0) setBp(breakpointOf(el.clientWidth))
    return () => ro.disconnect()
  }, [ref])
  return bp
}

/** O usuário pediu menos movimento? */
export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return r
}
