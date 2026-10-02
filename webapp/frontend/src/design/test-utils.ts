// Utilitários dos testes de componente (jsdom): polyfills que o jsdom não traz.

/** matchMedia simulado. `dark` controla prefers-color-scheme: dark. */
export function mockMatchMedia(dark = false): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? dark : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

/** Polyfills de layout: o jsdom não calcula tamanhos. */
let mockedWidth = 1200

/** Largura (px) que o jsdom devolve para clientWidth: 1200 = desktop; 390 = celular. */
export function setMockWidth(px: number): void {
  mockedWidth = px
}

export function mockLayoutApis(): void {
  Element.prototype.scrollIntoView = () => {}
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => mockedWidth })
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
}

/** Remove ids gerados (useId/Math.random) para comparar a ESTRUTURA do DOM entre renders. */
export function stripIds(html: string): string {
  return html.replace(/\s(id|for|aria-describedby|aria-controls|aria-labelledby)="[^"]*"/g, '')
}
