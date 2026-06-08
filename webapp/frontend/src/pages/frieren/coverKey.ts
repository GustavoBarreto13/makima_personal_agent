// Deriva uma chave de paleta de capa tipográfica a partir do ID do livro.
// Determinístico: o mesmo ID sempre gera a mesma paleta.

import type { CoverKey } from './types'

// Lista de todas as chaves de paleta disponíveis
const COVER_KEYS: CoverKey[] = [
  'sand', 'teal', 'slate', 'sage', 'rose',
  'plum', 'indigo', 'clay', 'fog', 'forest', 'ink', 'amber',
]

// Paletas de cor para cada chave — portadas do protótipo
// bg: cor de fundo da capa; ink: cor do texto; edge: cor da borda lateral
export const COVER_PALETTES: Record<CoverKey, { bg: string; ink: string; edge: string }> = {
  sand:   { bg: 'oklch(0.74 0.072 80)',  ink: 'oklch(0.27 0.04 60)',  edge: 'oklch(0.84 0.06 84)' },
  teal:   { bg: 'oklch(0.50 0.072 200)', ink: 'oklch(0.95 0.02 200)', edge: 'oklch(0.66 0.07 196)' },
  slate:  { bg: 'oklch(0.43 0.035 250)', ink: 'oklch(0.93 0.015 250)', edge: 'oklch(0.58 0.04 250)' },
  sage:   { bg: 'oklch(0.62 0.055 150)', ink: 'oklch(0.24 0.04 150)', edge: 'oklch(0.76 0.05 150)' },
  rose:   { bg: 'oklch(0.58 0.085 18)',  ink: 'oklch(0.96 0.02 30)',  edge: 'oklch(0.72 0.08 22)' },
  plum:   { bg: 'oklch(0.42 0.075 320)', ink: 'oklch(0.94 0.02 320)', edge: 'oklch(0.58 0.07 320)' },
  indigo: { bg: 'oklch(0.40 0.082 270)', ink: 'oklch(0.93 0.02 270)', edge: 'oklch(0.56 0.08 268)' },
  clay:   { bg: 'oklch(0.56 0.085 45)',  ink: 'oklch(0.97 0.02 60)',  edge: 'oklch(0.70 0.08 48)' },
  fog:    { bg: 'oklch(0.80 0.018 230)', ink: 'oklch(0.34 0.03 250)', edge: 'oklch(0.88 0.015 230)' },
  forest: { bg: 'oklch(0.38 0.055 165)', ink: 'oklch(0.92 0.03 150)', edge: 'oklch(0.54 0.06 160)' },
  ink:    { bg: 'oklch(0.30 0.018 250)', ink: 'oklch(0.90 0.015 250)', edge: 'oklch(0.46 0.02 250)' },
  amber:  { bg: 'oklch(0.66 0.105 65)',  ink: 'oklch(0.26 0.05 50)',  edge: 'oklch(0.80 0.09 68)' },
}

// Algoritmo de hash djb2 — rápido, estável e sem dependências externas.
// Recebe uma string e retorna um número inteiro não-negativo (uint32).
function hash(str: string): number {
  let h = 5381
  // Itera caractere por caractere, combinando o hash acumulado com o código do caractere
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)  // h * 33 XOR charCode
    h = h >>> 0  // converte para uint32 para evitar overflow de inteiro
  }
  return h
}

// Retorna a chave de paleta correspondente ao ID do livro.
// Sempre determinístico: o mesmo ID produz a mesma CoverKey.
export function coverKeyFromId(id: string): CoverKey {
  return COVER_KEYS[hash(id) % COVER_KEYS.length]
}
