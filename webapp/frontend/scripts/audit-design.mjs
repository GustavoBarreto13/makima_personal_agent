// CLI da auditoria do Design System.
//   node scripts/audit-design.mjs              tokens em dia + lint + contraste + conformidade (falha com exit 1)
//   node scripts/audit-design.mjs --report     também grava webapp/docs/DESIGN_CONFORMANCE.md
//   node scripts/audit-design.mjs --contrast   imprime todos os pares de contraste
//   node scripts/audit-design.mjs --only lint  só o lint estático (usado pelo hook e por lint:design)

import { checkTokensFresh, contrastViolations, renderReport, runConformance, runContrast, runLint, writeReport } from './lib/design-audit.mjs'

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const want = (n) => !only || only === n

const sections = []
const lint = want('lint') ? runLint() : []
if (want('lint')) sections.push(['Lint estático (design/ e páginas migradas)', lint])
if (want('tokens')) sections.push(['Tokens em dia com tokens.json', checkTokensFresh()])
const contrastRows = want('contrast') ? runContrast() : []
if (want('contrast')) sections.push(['Contraste WCAG AA (agente × tema)', contrastViolations(contrastRows)])
const conf = want('conformance') ? runConformance() : { violations: [], matrix: [] }
if (want('conformance')) sections.push(['Conformidade do manifesto × código', conf.violations])

if (args.includes('--contrast')) {
  for (const r of contrastRows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.theme.padEnd(5)} ${r.agent.padEnd(8)} ${String(r.ratio).padStart(6)}:1 (min ${r.min})  ${r.pair}`)
}

let failed = 0
for (const [title, list] of sections) {
  if (!list.length) { console.log(`✔ ${title}`); continue }
  failed += list.length
  console.log(`✘ ${title}: ${list.length}`)
  for (const v of list.slice(0, 60)) console.log(`    ${v.file}:${v.line}  [${v.rule}] ${v.message}`)
  if (list.length > 60) console.log(`    … e mais ${list.length - 60}`)
}

if (args.includes('--report')) {
  const full = {
    lint: runLint(),
    rows: runContrast(),
    matrix: runConformance().matrix,
  }
  const out = writeReport(renderReport(full.matrix, full.lint, full.rows))
  console.log(`relatório gravado em ${out}`)
}

if (failed) {
  console.log(`\naudit:design FALHOU (${failed} violações)`)
  process.exit(1)
}
console.log('\naudit:design passou')
