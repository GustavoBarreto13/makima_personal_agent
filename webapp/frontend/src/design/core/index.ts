// core/ — lógica pura do Design System (sem React, sem DOM). Reaproveitável num app nativo.
// Regra de dependência: ui → headless → core. O core nunca importa react, window, document nem localStorage.

export * from './ports'
export * from './format'
export * from './hotkeys'
export * from './theme'
export * from './agents'
export * from './collection'
export * from './capture'
export * from './stats'
export * from './markdown'
export { BREAKPOINTS, CHART_COLORS } from './tokens.generated'
