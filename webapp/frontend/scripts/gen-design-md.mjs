// Gera o DESIGN.md (raiz do repo) e o sidecar .impeccable/design.json que a skill Impeccable lê,
// a partir das fontes únicas do Design System:
//   src/design/tokens.json + src/design/agents.json  → frontmatter YAML (tokens normativos)
//   src/design/DESIGN.body.md                        → corpo em prosa (princípios, regras)
//
// Uso:
//   node scripts/gen-design-md.mjs           grava os arquivos
//   node scripts/gen-design-md.mjs --check   falha (exit 1) se algum estiver defasado
//
// Por quê: o Impeccable lê DESIGN.md para saber qual é o visual "oficial". Gerando daqui, o
// DESIGN.md nunca diverge do tokens.json (que é a fonte única). Não edite o DESIGN.md à mão.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')
const dsDir = join(root, 'src', 'design')
const check = process.argv.includes('--check')

const t = JSON.parse(readFileSync(join(dsDir, 'tokens.json'), 'utf8'))
const body = readFileSync(join(dsDir, 'DESIGN.body.md'), 'utf8').trimEnd()

// Acento padrão (Makima): matiz/croma do tokens + luminosidade do tema.
const accent = (theme) =>
  `oklch(${t.accent[theme].l} ${t.accent.default.c} ${t.accent.default.h})`
const accentDeep = (theme) =>
  `oklch(${t.accent[theme]['l-deep']} ${t.accent.default.c} ${t.accent.default.h})`

// Só tokens de cor "puros" (sem sombra/vidro/scrim, que não são cores sólidas).
const SOLID = ['paper', 'paper-2', 'card', 'card-2', 'mist', 'ink-1', 'ink-2', 'ink-3', 'ink-4',
  'line', 'line-2', 'danger', 'warn', 'info', 'success', 'star', 'star-deep']

const yamlStr = (v) => JSON.stringify(String(v))
const lines = []
lines.push('---', 'name: Makima', 'description: "Design System Makima: vidro sobre fundo ambiente, tom por agente, estrutura única."', 'colors:')
lines.push(`  accent: ${yamlStr(accent('light'))}`)
lines.push(`  accent-deep: ${yamlStr(accentDeep('light'))}`)
for (const k of SOLID) lines.push(`  ${k}: ${yamlStr(t.color.light[k])}`)
lines.push(`  accent-dark: ${yamlStr(accent('dark'))}`)
for (const k of SOLID) lines.push(`  ${k}-dark: ${yamlStr(t.color.dark[k])}`)

const fam = (name) => yamlStr(t.font[name])
lines.push('typography:')
const type = (key, family, size, weight, extra = {}) => {
  lines.push(`  ${key}:`, `    fontFamily: ${family}`, `    fontSize: ${yamlStr(size)}`, `    fontWeight: ${weight}`)
  for (const [k, v] of Object.entries(extra)) lines.push(`    ${k}: ${yamlStr(v)}`)
}
type('display', fam('display'), t.text.display, 800, { letterSpacing: '-0.02em' })
type('title', fam('display'), t.text['2xl'], 800, { letterSpacing: '-0.01em' })
type('headline', fam('display'), t.text.xl, 800)
type('body', fam('sans'), t.text.md, 400, { lineHeight: '1.5' })
type('label', fam('mono'), t.text.xs, 500, { letterSpacing: '0.06em' })

lines.push('rounded:')
for (const [k, v] of Object.entries(t.radius)) lines.push(`  ${k}: ${yamlStr(v)}`)
lines.push('spacing:')
for (const [k, v] of Object.entries(t.space)) lines.push(`  s${k}: ${yamlStr(v)}`)

lines.push('components:',
  '  button-primary:', '    backgroundColor: "{colors.accent}"', '    textColor: "{colors.paper}"', '    rounded: "{rounded.sm}"', '    padding: "10px 16px"',
  '  button-primary-hover:', '    backgroundColor: "{colors.accent-deep}"',
  '  card:', '    backgroundColor: "{colors.card}"', '    textColor: "{colors.ink-1}"', '    rounded: "{rounded.md}"', '    padding: "16px"',
  '  input:', '    backgroundColor: "{colors.card}"', '    textColor: "{colors.ink-1}"', '    rounded: "{rounded.sm}"', '    padding: "10px 12px"',
  '---')

const designMd =
  `<!-- GERADO por webapp/frontend/scripts/gen-design-md.mjs a partir de tokens.json + DESIGN.body.md.\n` +
  `     Não edite à mão: altere a fonte e rode \`npm run tokens\` em webapp/frontend. -->\n` +
  lines.join('\n') + '\n\n' + body + '\n'

// Sidecar: o que o frontmatter não comporta (sombras, movimento, breakpoints, narrativa).
const sidecar = {
  schemaVersion: 2,
  title: 'Design System: Makima',
  extensions: {
    shadows: ['shadow-sm', 'shadow-md', 'shadow-lg', 'glass-shadow'].map((n) => ({
      name: n, value: t.color.light[n], purpose: n === 'glass-shadow' ? 'Painéis de vidro sobre o fundo ambiente.' : 'Superfícies sólidas sobre o vidro.',
    })),
    motion: Object.entries(t.motion).map(([name, value]) => ({ name, value, purpose: 'Catálogo fechado em src/design/motion.css.' })),
    breakpoints: Object.entries(t.breakpoint).map(([name, v]) => ({ name, value: `${v}px` })),
  },
  components: [],
  narrative: {
    northStar: 'O Ateliê de Vidro',
    overview: 'Vidro sobre fundo ambiente; cor de identidade por agente; uma estrutura para todos. Ver DESIGN.md.',
    keyCharacteristics: ['Uma ação primária por contexto', 'Vidro nunca sobre vidro', '4 estados em toda tela'],
    rules: [{ name: 'The Token Only Rule', body: 'Nenhuma cor, raio ou fonte literal em tela: sempre --ds-*.', section: 'colors' }],
    dos: ['Do usar tokens --ds-* e componentes de design/'],
    donts: ['Don\'t criar visual fora do Design System'],
  },
}
const sidecarJson = JSON.stringify(sidecar, null, 2) + '\n'

const targets = [
  [join(repoRoot, 'DESIGN.md'), designMd],
  [join(repoRoot, '.impeccable', 'design.json'), sidecarJson],
]
let stale = false
for (const [path, content] of targets) {
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) { console.error(`defasado: ${path}`); stale = true }
  } else {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    console.log(`gravado: ${path}`)
  }
}
if (stale) process.exit(1)
