// Design System Makima — ponto de entrada.
//   core/      lógica pura (TypeScript, sem React/DOM) — reaproveitável num app nativo
//   headless/  hooks React sem estilo
//   ui/        componentes web (CSS em design.css, prefixo .ds-*, tokens --ds-*)
// Telas novas usam ESTA pasta. Não crie tokens, raios, fontes, ícones, modais, toasts ou botões locais.
// Guia completo: webapp/docs/DESIGN_SYSTEM.md · referência viva: rota /design.

import './design.css'

export * from './core'
export * from './core/dataviz'
export * from './headless'
export * from './ui'
export { CONFORMANCE, type PageConformance } from './conformance'
