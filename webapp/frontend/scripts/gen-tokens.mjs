// Gera os arquivos derivados do Design System a partir das fontes únicas:
//   src/design/tokens.json  → src/design/tokens.css  + src/design/core/tokens.generated.ts
//   src/design/agents.json  → src/design/accents.css
//
// Uso:
//   node scripts/gen-tokens.mjs           grava os arquivos
//   node scripts/gen-tokens.mjs --check   falha (exit 1) se algum arquivo estiver defasado
//
// A regra "tokens.css é gerado de tokens.json" é verificada pelo audit:design.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dsDir = join(root, 'src', 'design')
const check = process.argv.includes('--check')

const tokens = JSON.parse(readFileSync(join(dsDir, 'tokens.json'), 'utf8'))
const agents = JSON.parse(readFileSync(join(dsDir, 'agents.json'), 'utf8')).agents

const decl = (name, value) => `  --ds-${name}: ${value};`
const block = (selector, lines) => `${selector} {\n${lines.join('\n')}\n}\n`
const colorLines = (map) => Object.entries(map).map(([k, v]) => decl(k, v))
const chartLines = (arr) => arr.map((c, i) => decl(`chart-${i + 1}`, c))

// ── tokens.css ───────────────────────────────────────────────────────────────
const t = tokens
const light = t.accent.light
const dark = t.accent.dark

const base = [
  decl('font-display', t.font.display),
  decl('font-sans', t.font.sans),
  decl('font-mono', t.font.mono),
  // Entradas do acento. [data-agent] sobrescreve h, c e ladj.
  decl('accent-h', t.accent.default.h),
  decl('accent-c', t.accent.default.c),
  decl('accent-ladj', '0'),
  decl('accent-l', light.l),
  decl('accent-l-deep', light['l-deep']),
  decl('accent-l-bright', light['l-bright']),
  decl('accent-tint-a', '0.12'),
  decl('accent-tint-2-a', '0.2'),
  decl('on-accent', light.on),
  ...colorLines(t.color.light),
  ...Object.entries(t.radius).map(([k, v]) => decl(`r-${k}`, v)),
  ...Object.entries(t.space).map(([k, v]) => decl(`space-${k}`, v)),
  ...Object.entries(t.text).map(([k, v]) => decl(`text-${k}`, v)),
  ...Object.entries(t.motion).map(([k, v]) => decl(k, v)),
  ...Object.entries(t.z).map(([k, v]) => decl(`z-${k}`, v)),
  ...Object.entries(t.width).map(([k, v]) => decl(`w-${k}`, v)),
  decl('blur', t.blur.default),
  decl('blur-soft', t.blur.soft),
  decl('icon-stroke', t.icon.stroke),
  decl('icon-sm', t.icon.sm),
  decl('icon-md', t.icon.md),
  decl('icon-lg', t.icon.lg),
  ...Object.entries(t.density.comfy).map(([k, v]) => decl(k, v)),
  ...chartLines(t.chart.light),
  decl('chart-positive', t.chart.positive.light),
  decl('chart-negative', t.chart.negative.light),
  // Fundo ambiente: dois blobs (acento e magenta) sobre degradê névoa → papel.
  decl('ambient', 'radial-gradient(120% 90% at 12% 0%, var(--ds-accent-tint), transparent 46%), radial-gradient(120% 90% at 92% 8%, oklch(0.62 0.15 340 / 0.09), transparent 44%), linear-gradient(160deg, var(--ds-mist), var(--ds-paper) 60%)'),
  decl('texture', 'linear-gradient(transparent, transparent)'),
  '  color-scheme: light;',
]

// Tokens derivados do acento. Declarados também em [data-agent] para recalcular com o h/c do agente
// (uma custom property com var() é resolvida onde é declarada e herdada já resolvida).
const accentDerived = [
  decl('accent', 'oklch(calc(var(--ds-accent-l) + var(--ds-accent-ladj)) var(--ds-accent-c) var(--ds-accent-h))'),
  decl('accent-deep', 'oklch(calc(var(--ds-accent-l-deep) + var(--ds-accent-ladj)) var(--ds-accent-c) var(--ds-accent-h))'),
  decl('accent-bright', 'oklch(calc(var(--ds-accent-l-bright) + var(--ds-accent-ladj)) var(--ds-accent-c) var(--ds-accent-h))'),
  decl('accent-tint', 'oklch(var(--ds-accent-l) var(--ds-accent-c) var(--ds-accent-h) / var(--ds-accent-tint-a))'),
  decl('accent-tint-2', 'oklch(var(--ds-accent-l) var(--ds-accent-c) var(--ds-accent-h) / var(--ds-accent-tint-2-a))'),
]

const darkLines = [
  decl('accent-l', dark.l),
  decl('accent-l-deep', dark['l-deep']),
  decl('accent-l-bright', dark['l-bright']),
  decl('accent-tint-a', '0.16'),
  decl('accent-tint-2-a', '0.26'),
  decl('on-accent', 'oklch(0.18 0.01 320)'),
  ...colorLines(t.color.dark),
  ...chartLines(t.chart.dark),
  decl('chart-positive', t.chart.positive.dark),
  decl('chart-negative', t.chart.negative.dark),
  '  color-scheme: dark;',
]

const densityCompact = Object.entries(t.density.compact).map(([k, v]) => decl(k, v))

const header = `/* GERADO por scripts/gen-tokens.mjs a partir de src/design/tokens.json. NÃO EDITE.
   Para mudar um token: edite tokens.json e rode \`npm run tokens\`. */\n`

const fontImport =
  "@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@600;700;800&display=swap');\n\n"

const tokensCss =
  fontImport + header + '\n' +
  block(':root', base) + '\n' +
  block(':root,\n[data-agent]', accentDerived) + '\n' +
  '@media (prefers-color-scheme: dark) {\n' +
  block('  :root:not([data-ds-theme="light"])', darkLines.map((l) => '  ' + l)).replace(/^/gm, '') + '}\n\n' +
  block(':root[data-ds-theme="dark"]', darkLines) + '\n' +
  block('[data-ds-density="compact"]', densityCompact)

// ── accents.css ──────────────────────────────────────────────────────────────
const accentsCss =
  header + '/* Cor de identidade de cada agente. Uso: <AgentScope agent="nami"> ou data-agent="nami". */\n\n' +
  agents
    .map((a) => {
      const lines = [`  --ds-accent-h: ${a.hue};`, `  --ds-accent-c: ${a.chroma};`]
      if (a.lAdj) lines.push(`  --ds-accent-ladj: ${a.lAdj};`)
      return `[data-agent="${a.id}"] {\n${lines.join('\n')}\n}\n`
    })
    .join('\n')

// ── tokens.generated.ts (para o core/, sem CSS) ──────────────────────────────
const generatedTs = `// GERADO por scripts/gen-tokens.mjs a partir de src/design/tokens.json. NÃO EDITE.
// Valores dos tokens que a lógica (core/) precisa conhecer sem tocar no DOM.

export const BREAKPOINTS = ${JSON.stringify(t.breakpoint)} as const

export const CHART_COLORS = ${JSON.stringify({ light: t.chart.light, dark: t.chart.dark })} as const
`

const outputs = [
  [join(dsDir, 'tokens.css'), tokensCss],
  [join(dsDir, 'accents.css'), accentsCss],
  [join(dsDir, 'core', 'tokens.generated.ts'), generatedTs],
]

let stale = 0
for (const [file, content] of outputs) {
  const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/
/g, '
') : null
  if (check) {
    if (current !== content) {
      console.error(`DEFASADO: ${file.replace(root, '.')} (rode: npm run tokens)`)
      stale++
    }
  } else if (current !== content) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    console.log(`gerado ${file.replace(root, '.')}`)
  }
}
if (check) {
  if (stale) process.exit(1)
  console.log('tokens: ok (arquivos em dia com tokens.json e agents.json)')
}
