// ui/ — componentes web do Design System (os únicos que um app nativo reescreveria).
// Regra de dependência: ui → headless → core. Componentes daqui NUNCA chamam a rede nem importam *Api de domínio.

export * from './Icon'
export * from './icons'
export * from './primitives'
export * from './rating'
export * from './form'
export * from './overlay'
export * from './feedback'
export * from './item'
export * from './collection'
export * from './stats'
export * from './capture'
export * from './palette'
export * from './shell'
export * from './table'
