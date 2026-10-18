// Contraste do estilo de arte "Caderno de bilhetes" (src/design/art/bilhetes.css) — Komi, spec 077.
// O audit:design não cobre estilos de arte; este script refaz as misturas do CSS (color-mix em oklab,
// como o navegador) e mede os pares de texto/fundo com a fórmula WCAG, nos temas claro e escuro.
//
// Uso (em webapp/frontend):  node ../../specs/077-komi-ds/contrast-bilhetes.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DS = join(here, '..', '..', 'webapp', 'frontend', 'src', 'design')
const tokens = JSON.parse(readFileSync(join(DS, 'tokens.json'), 'utf8'))
const violet = JSON.parse(readFileSync(join(DS, 'agents.json'), 'utf8')).agents.find((a) => a.id === 'komi')

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

let worstText = Infinity
for (const theme of ['light', 'dark']) {
  const C = (k) => toLab(parseOklch(tokens.color[theme][k]))
  const accL = +tokens.accent[theme].l, deepL = +tokens.accent[theme]['l-deep']
  const accent = toLab({ L: accL, C: violet.chroma, H: violet.hue, a: 1 })
  const deep = toLab({ L: deepL, C: violet.chroma, H: violet.hue, a: 1 })
  const tint2a = theme === 'light' ? 0.2 : 0.26
  const paper = C('paper'), cardBase = C('card'), ink1 = C('ink-1'), star = C('star')

  // superfícies do estilo (mesmos percentuais de bilhetes.css)
  const card = mix(cardBase, star, 0.03)
  const paper2 = mix(paper, accent, 0.05)
  const surf = {
    paper,
    card,
    'paper-2': paper2,
    'card-2': mix(cardBase, star, 0.08),
    mist: mix(paper, accent, 0.09),
    // o traço da quadrícula (8% claro / 6% escuro de acento) por cima do papel — pior caso para quem lê sobre a grade
    grade: over({ ...accent, a: theme === 'light' ? 0.08 : 0.06 }, paper2).reduce((acc, c, i) => { acc[i] = c; return acc }, []),
  }
  // tintas (ink-2/3/4 = ink-1 misturada com o papel original, como em bilhetes.css)
  const inks = {
    'ink-1': ink1,
    'ink-2': mix(ink1, paper, 0.14),
    'ink-3': mix(ink1, paper, 0.24),
    'ink-4': mix(ink1, paper, 0.32),
  }
  console.log(`\n── ${theme} ──`)
  for (const [sn, s] of Object.entries(surf)) {
    const bg = Array.isArray(s) ? s : solid(s)
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
  // hero: início do gradiente (card com 8% de dourado no claro / 5% no escuro) e, por cima, o centro do brilho
  // lilás (accent-tint-2) — a região mais tingida; título (ink-1) e eyebrow (accent-deep) precisam ler ali.
  const heroStart = mix(cardBase, star, theme === 'light' ? 0.08 : 0.05)
  const tintA = theme === 'light' ? tint2a : 0.16
  const heroTop = over({ ...accent, a: tintA }, heroStart)
  for (const [nome, bg] of [['início', solid(heroStart)], ['brilho', heroTop]]) {
    const t = ratio(ink1, bg), e = ratio(deep, bg)
    worstText = Math.min(worstText, t, e)
    console.log(`hero ${nome.padEnd(6)} título ${t.toFixed(1)} · eyebrow ${e.toFixed(1)}`)
  }
}
console.log(`\npior par de texto (tinta): ${worstText.toFixed(1)}:1 (mínimo 4.5)`)
if (worstText < 4.5) process.exitCode = 1
