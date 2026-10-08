// Contraste do estilo de arte "Neon kawaii" (src/design/art/neon.css).
// O audit:design não cobre estilos de arte; este script refaz as misturas do CSS (color-mix em oklab,
// como o navegador) e mede os pares de texto/fundo com a fórmula WCAG, nos temas claro e escuro.
//
// Uso (em webapp/frontend):  node ../../specs/074-marin-ds/contrast-neon.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DS = join(here, '..', '..', 'webapp', 'frontend', 'src', 'design')
const tokens = JSON.parse(readFileSync(join(DS, 'tokens.json'), 'utf8'))
const marin = JSON.parse(readFileSync(join(DS, 'agents.json'), 'utf8')).agents.find((a) => a.id === 'marin')

// ── conversões de cor (oklch → oklab → sRGB linear) ──────────────────────────
const parseOklch = (s) => {
  const m = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/)
  if (!m) throw new Error(`cor não reconhecida: ${s}`)
  return { L: +m[1], C: +m[2], H: +m[3], a: m[4] ? +m[4] : 1 }
}
const toLab = ({ L, C, H, a }) => ({ L, A: C * Math.cos((H * Math.PI) / 180), B: C * Math.sin((H * Math.PI) / 180), a })
const WHITE = { L: 1, A: 0, B: 0, a: 1 }
const labToLinear = ({ L, A, B }) => {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)))
}
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** color-mix(in oklab, a, b p%) com alfa pré-multiplicado — o "p" é a fração de b. */
const mix = (a, b, p) => {
  const pa = 1 - p, alpha = a.a * pa + b.a * p
  if (alpha === 0) return { L: 0, A: 0, B: 0, a: 0 }
  const ch = (k) => (a[k] * a.a * pa + b[k] * b.a * p) / alpha
  return { L: ch('L'), A: ch('A'), B: ch('B'), a: alpha }
}

/** Pinta uma cor com alfa sobre um fundo opaco (em sRGB gamma, como o navegador compõe). */
const over = (fg, bg) => {
  const f = labToLinear(fg).map(toGamma), b = labToLinear(bg).map(toGamma)
  return f.map((c, i) => c * fg.a + b[i] * (1 - fg.a))
}
const lum = (rgbGamma) => {
  const [r, g, b] = rgbGamma.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Razão WCAG entre uma tinta opaca e um fundo já composto (sRGB gamma). */
const ratio = (fg, bgGamma) => {
  const la = lum(labToLinear(fg).map(toGamma)), lb = lum(bgGamma)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const solid = (lab) => labToLinear(lab).map(toGamma)

// O rosa nasce do acento girando o matiz em 145 graus (relative color no CSS)
const PINK_SHIFT = 145

let worstText = Infinity
let worstHero = Infinity
for (const theme of ['light', 'dark']) {
  const C = (k) => toLab(parseOklch(tokens.color[theme][k]))
  const accL = +tokens.accent[theme].l, deepL = +tokens.accent[theme]['l-deep']
  const accent = toLab({ L: accL, C: marin.chroma, H: marin.hue, a: 1 })
  const pink = toLab({ L: accL, C: marin.chroma, H: (marin.hue + PINK_SHIFT) % 360, a: 1 })
  const deep = toLab({ L: deepL, C: marin.chroma, H: marin.hue, a: 1 })
  const tint2a = theme === 'light' ? 0.2 : 0.26
  const paper = C('paper'), card = C('card'), ink1 = C('ink-1')

  // superfícies do estilo (mesmos percentuais de neon.css)
  const surf = {
    paper, card,
    'paper-2': mix(mix(paper, accent, 0.04), pink, 0.06),
    'card-2': mix(card, pink, 0.05),
    mist: mix(mix(paper, accent, 0.05), pink, 0.12),
  }
  const inks = {
    'ink-1': ink1,
    'ink-2': mix(ink1, paper, 0.14),
    'ink-3': mix(ink1, paper, 0.21),
    'ink-4': mix(ink1, paper, 0.28),
  }
  console.log(`\n── ${theme} ──`)
  for (const [sn, s] of Object.entries(surf)) {
    const bg = solid(s)
    const row = Object.entries(inks).map(([n, ink]) => {
      const r = ratio(ink, bg)
      worstText = Math.min(worstText, r)
      return `${n} ${r.toFixed(1)}`
    })
    const rd = ratio(deep, bg)
    worstText = Math.min(worstText, rd)
    row.push(`accent-deep ${rd.toFixed(1)}`)
    console.log(`${sn.padEnd(8)} ${row.join(' · ')}`)
  }
  // hero: as duas regiões mais tingidas do gradiente sobre o início (mist) — a luz rosa atrás do
  // retrato (20% no claro, 26% no escuro) e a névoa ciano no canto (accent-tint-2 / accent-tint)
  const pinkA = theme === 'light' ? 0.26 : 0.26
  const cyanA = theme === 'light' ? tint2a : 0.16
  for (const [name, tintLab, a] of [['luz rosa', pink, pinkA], ['névoa ciano', accent, cyanA]]) {
    const heroBg = over({ ...tintLab, a }, surf.mist)
    // eyebrow do hero = accent-deep 70% + ink-1 30% (neon.css)
    const eyebrow = mix(deep, ink1, 0.3)
    const t = ratio(ink1, heroBg), e = ratio(eyebrow, heroBg)
    worstHero = Math.min(worstHero, t, e)
    console.log(`hero ${name.padEnd(11)} título ${t.toFixed(1)} · eyebrow ${e.toFixed(1)}`)
  }
}
console.log(`\npior par de texto (tinta e accent-deep): ${worstText.toFixed(1)}:1 (mínimo 4.5)`)
console.log(`pior par no hero: ${worstHero.toFixed(1)}:1 (mínimo 4.5)`)
if (worstText < 4.5 || worstHero < 4.5) process.exitCode = 1
