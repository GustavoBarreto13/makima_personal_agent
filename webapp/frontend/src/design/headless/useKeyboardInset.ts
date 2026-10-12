// useKeyboardInset — quanto o teclado virtual cobre do fim da tela (px), para barras fixas embaixo ficarem acima dele.
// No Chrome Android o viewport `interactive-widget=resizes-content` (index.html) já encolhe a página e o valor fica 0;
// no iOS Safari o teclado só encolhe o `visualViewport`, e é a diferença que este hook devolve. Sem `visualViewport`
// (jsdom, navegadores antigos) devolve 0. A lógica pura fica em `keyboardInset` (testável sem DOM).

import { useEffect, useState } from 'react'

/** Altura coberta pelo teclado: a janela de layout menos a parte visível (e o quanto ela rolou para cima). */
export function keyboardInset(innerHeight: number, viewportHeight: number, offsetTop: number): number {
  const covered = innerHeight - (viewportHeight + offsetTop)
  // Barra de endereço que some e arredondamentos dão poucos px — só conta teclado de verdade.
  return covered > 80 ? Math.round(covered) : 0
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const on = () => setInset(keyboardInset(window.innerHeight, vv.height, vv.offsetTop))
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [])
  return inset
}
