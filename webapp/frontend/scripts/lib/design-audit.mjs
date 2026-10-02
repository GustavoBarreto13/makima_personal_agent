// Auditoria do Design System: lint estático, contraste WCAG, conformidade do manifesto e relatório.
// Usado pelo CLI (scripts/audit-design.mjs) e pelos testes (src/design/audit.test.ts).
// Funções puras sempre que possível: lintSource(relPath, content, ctx) não toca no disco.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DS = join(ROOT, 'src', 'design')
const norm = (p) => p.split(sep).join('/')

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))
export const loadTokens = () => readJSON(join(DS, 'tokens.json'))
export const loadAgents = () => readJSON(join(DS, 'agents.json')).agents
export const loadConformance = () => readJSON(join(DS, 'conformance.json'))

// ── arquivos ─────────────────────────────────────────────────────────────────

export function walk(dir, exts = ['.ts', '.tsx', '.css']) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (name !== 'node_modules') out.push(...walk(p, exts)) }
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

// ── lint ─────────────────────────────────────────────────────────────────────

/** @typedef {{file:string,line:number,rule:string,message:string}} Violation */

const GENERATED = new Set(['src/design/tokens.css', 'src/design/accents.css', 'src/design/core/tokens.generated.ts'])
const ALLOWED_SYMBOLS = new Set(['⌘', '★', '▲', '▼', '■', '↑', '↓', '←', '→', '✓', '×', '·', '…'])

/** Classifica o arquivo para decidir quais regras valem. */
export function classify(rel, pageFiles = new Set()) {
  if (GENERATED.has(rel) || rel.endsWith('.json')) return null
  if (/\.test\.(ts|tsx)$/.test(rel)) return null
  if (rel.startsWith('src/design/core/')) return 'core'
  if (rel.startsWith('src/design/headless/')) return 'headless'
  if (rel.startsWith('src/design/art/') && rel.endsWith('.css')) return 'art'
  if (rel.startsWith('src/design/ui/')) return rel.endsWith('components.css') ? 'components-css' : 'ui'
  if (rel.startsWith('src/design/')) return rel.endsWith('motion.css') ? 'motion-css' : 'design'
  if (pageFiles.has(rel)) return 'page'
  return null
}

const isComment = (line) => /^\s*(\/\/|\*|\/\*|<!--)/.test(line)

const LAYOUT_PROPS = /^(display|grid[\w-]*|flex[\w-]*|position|width|height|min-|max-|margin[\w-]*|padding[\w-]*|gap|order|z-index|top|left|right|bottom|inset)/

/**
 * Regras estáticas. `kind` vem de classify().
 * @returns {Violation[]}
 */
export function lintSource(rel, content, kind) {
  /** @type {Violation[]} */
  const v = []
  if (!kind) return v
  const isCss = rel.endsWith('.css')
  const lines = content.split('\n')
  const add = (i, rule, message) => v.push({ file: rel, line: i + 1, rule, message })

  lines.forEach((raw, i) => {
    if (isComment(raw)) return
    // remove comentário de fim de linha em TS/TSX (não toca em URLs "//" dentro de strings simples)
    const line = isCss ? raw.replace(/\/\*.*?\*\//g, '') : raw.replace(/\s\/\/\s.*$/, '')

    // cores literais
    if (/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{5})?\b/.test(line.replace(/&#\d+;/g, ''))) add(i, 'no-literal-color', 'cor #hex literal: use um token --ds-*')
    if (/\b(rgba?|hsla?)\(/.test(line)) add(i, 'no-literal-color', 'rgb()/hsl() literal: use um token --ds-*')
    if (/oklch\(\s*[\d.]/.test(line) && kind !== 'components-css' && kind !== 'motion-css') add(i, 'no-literal-color', 'oklch() literal fora de tokens.css/components.css: use um token --ds-*')

    if (!isCss) {
      if (/type=["'{]*\s*["']?(date|time|datetime-local)\b/.test(line)) add(i, 'no-native-date', '<input type="date|time"> é proibido: use DatePicker/TimePicker')
      if (/\bwindow\.(alert|confirm|prompt)\s*\(|(^|[^.\w])alert\s*\(|(^|[^.\w])prompt\s*\(/.test(line)) add(i, 'no-native-dialog', 'alert/confirm/prompt nativos são proibidos: use useToast/useConfirm')
      if (/new Date\(\s*['"`][^'"`]*\d{4}-\d{2}-\d{2}/.test(line) || /new Date\([^)]*\+\s*['"`]T00:00/.test(line)) add(i, 'no-utc-date', "new Date('YYYY-MM-DD') interpreta como UTC e erra o dia: use parseISODate")
      if (/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(line)) add(i, 'no-utc-date', 'toISOString().slice(0,10) é UTC: use isoDate/todayISO')
      if (/zIndex:\s*(\d+)/.test(line) && Number(RegExp.$1) > 3) add(i, 'no-literal-z', 'z-index literal: use var(--ds-z-*)')
      if (kind !== 'core' && /\p{Extended_Pictographic}/u.test(line)) {
        const bad = [...line].filter((ch) => /\p{Extended_Pictographic}/u.test(ch) && !ALLOWED_SYMBOLS.has(ch))
        if (bad.length) add(i, 'no-emoji-ui', `emoji "${bad[0]}" como ícone de UI: use <Icon name="…" />`)
      }
    } else {
      const z = /z-index\s*:\s*(\d+)/.exec(line)
      if (z && Number(z[1]) > 3) add(i, 'no-literal-z', 'z-index literal > 3: use var(--ds-z-*)')
      if (/@keyframes/.test(line) && kind !== 'motion-css') add(i, 'keyframes-in-motion', '@keyframes só em motion.css (catálogo fechado de animações)')
    }
  })

  // regras por camada
  const src = lines.map((l, i) => [l, i])
  const each = (pred, rule, msg) => src.forEach(([l, i]) => { if (!isComment(l) && pred(l)) add(i, rule, msg) })

  if (kind === 'core') {
    each((l) => /from ['"]react/.test(l), 'core-pure', 'core/ não pode importar react')
    each((l) => /\b(window|document|localStorage|sessionStorage|navigator)\b/.test(l.replace(/\/\/.*$/, '').replace(/(['"`]).*?\1/g, '')), 'core-pure', 'core/ não pode tocar em DOM/storage: use as portas (Storage/Clock)')
    each((l) => /from ['"]\.\.\/(headless|ui)/.test(l), 'layering', 'core/ não importa headless/ nem ui/')
  }
  if (kind === 'headless') each((l) => /from ['"]\.\.\/ui/.test(l), 'layering', 'headless/ não importa ui/')
  if (kind === 'ui' || kind === 'headless') {
    each((l) => /\bfetch\(/.test(l), 'no-network-in-design', 'o design/ nunca chama a rede: a tela liga a API')
    each((l) => /from ['"][^'"]*(lib\/api|[A-Za-z]Api)['"]/.test(l), 'no-network-in-design', 'o design/ não importa *Api de domínio')
  }
  if (kind === 'ui' || kind === 'headless' || kind === 'design') {
    each((l) => /from ['"][^'"]*pages\//.test(l), 'layering', 'design/ não importa de pages/')
  }
  if (kind === 'page') {
    each((l) => /from ['"][^'"]*\/(Icons?|[A-Za-z]*Icons)['"]/.test(l) && !/design/.test(l), 'icons-from-design', 'ícones só de design/: apague o arquivo de ícones local')
  }
  if (kind === 'art') {
    // um estilo de arte só declara custom properties --ds-* visuais (nada de layout)
    src.forEach(([l, i]) => {
      if (isComment(l)) return
      const m = /^\s*([a-z-]+)\s*:/.exec(l)
      if (!m) return
      if (m[1].startsWith('--ds-')) return
      add(i, 'art-no-layout', LAYOUT_PROPS.test(m[1]) ? `estilo de arte não pode declarar layout (${m[1]})` : `estilo de arte só declara --ds-* (${m[1]})`)
    })
  }
  return v
}

/** Arquivos das páginas que já aderiram (status != legacy). */
export function pageFilesFor(conf) {
  const set = new Set()
  for (const [, p] of Object.entries(conf.pages)) {
    if (p.status === 'legacy') continue
    for (const f of walk(join(ROOT, p.dir))) set.add(norm(relative(ROOT, f)))
  }
  return set
}

export function runLint() {
  const conf = loadConformance()
  const pages = pageFilesFor(conf)
  /** @type {Violation[]} */
  const out = []
  const files = [...walk(DS), ...[...pages].map((p) => join(ROOT, p))]
  for (const f of new Set(files)) {
    const rel = norm(relative(ROOT, f))
    // páginas: o CSS de demonstração (design-page.css) é do /design e segue as mesmas regras
    const kind = classify(rel, pages)
    if (!kind) continue
    out.push(...lintSource(rel, readFileSync(f, 'utf8'), kind))
  }
  // base.css precisa garantir foco visível global
  const base = readFileSync(join(DS, 'base.css'), 'utf8')
  if (!/:focus-visible/.test(base)) out.push({ file: 'src/design/base.css', line: 1, rule: 'focus-visible', message: 'falta o :focus-visible global' })
  return out
}

// ── tokens em dia ────────────────────────────────────────────────────────────

export function checkTokensFresh() {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen-tokens.mjs'), '--check'], { encoding: 'utf8' })
  return r.status === 0 ? [] : [{ file: 'src/design/tokens.css', line: 1, rule: 'tokens-fresh', message: (r.stderr || r.stdout || 'tokens defasados (rode: npm run tokens)').trim() }]
}

// ── contraste WCAG ───────────────────────────────────────────────────────────

const clamp01 = (x) => Math.min(1, Math.max(0, x))

/** oklch → sRGB linear (clamp) */
function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return [
    clamp01(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Cor → { rgb: [gamma r,g,b], a }. Aceita oklch(L C H [/ A]) e #hex. */
export function parseColor(str, vars = {}) {
  const s = String(str).trim().replace(/var\(--ds-([\w-]+)\)/g, (_, n) => vars[n] ?? '0')
  let m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(s)
  if (m) {
    const lin = oklchToLinear(+m[1], +m[2], +m[3])
    return { rgb: lin.map(toGamma), a: m[4] === undefined ? 1 : +m[4] }
  }
  m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), a: 1 }
  }
  throw new Error(`cor não reconhecida: ${str}`)
}

/** Composita `fg` (com alfa) sobre `bg` opaco, em espaço gamma como o navegador. */
const over = (fg, bg) => ({ rgb: fg.rgb.map((c, i) => c * fg.a + bg.rgb[i] * (1 - fg.a)), a: 1 })
const luminance = (c) => { const [r, g, b] = c.rgb.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Todos os pares texto/fundo do padrão, por agente × tema. */
export function runContrast() {
  const t = loadTokens()
  const agents = loadAgents()
  /** @type {{theme:string,agent:string,pair:string,ratio:number,min:number,ok:boolean}[]} */
  const rows = []
  for (const theme of ['light', 'dark']) {
    const C = t.color[theme]
    const A = t.accent[theme]
    const col = (name) => parseColor(C[name])
    const paper = col('paper'), card = col('card'), card2 = col('card-2')
    const tintAlpha = theme === 'light' ? 0.12 : 0.16
    for (const agent of agents) {
      const l = (k) => +A[k]
      const acc = (lv) => ({ rgb: oklchToLinear(lv + (agent.lAdj || 0), agent.chroma, agent.hue).map(toGamma), a: 1 })
      const accent = acc(l('l')), deep = acc(l('l-deep'))
      const tint = over({ ...acc(l('l')), a: tintAlpha }, card)
      const on = A.on.startsWith('oklch') ? parseColor(A.on.replace('var(--ds-accent-h)', '0')) : parseColor(A.on)
      // contraste mínimo: texto 4.5, elementos gráficos 3
      const add = (pair, fg, bg, min) => { const ratio = contrast(fg, bg); rows.push({ theme, agent: agent.id, pair, ratio: Math.round(ratio * 100) / 100, min, ok: ratio >= min }) }
      add('texto do botão (on-accent) sobre accent', on, accent, 4.5)
      add('accent-deep sobre card (nav ativo, links)', deep, card, 4.5)
      add('accent-deep sobre paper', deep, paper, 4.5)
      add('accent-deep sobre accent-tint (item ativo)', deep, tint, 4.5)
      add('accent sobre paper (barras, anel de foco)', accent, paper, 3)
      add('accent sobre card (foco, controles)', accent, card, 3)
      // hero: texto branco sobre o gradiente (início do gradiente, o trecho mais claro)
      const heroStart = { rgb: oklchToLinear(0.5, Math.min(0.2, agent.chroma + 0.03), agent.hue).map(toGamma), a: 1 }
      add('texto branco sobre o hero (início do gradiente)', parseColor('#fff'), heroStart, 4.5)
    }
    // pares que não dependem do agente
    const add = (pair, fg, bg, min) => { const ratio = contrast(fg, bg); rows.push({ theme, agent: '*', pair, ratio: Math.round(ratio * 100) / 100, min, ok: ratio >= min }) }
    for (const ink of ['ink-1', 'ink-2', 'ink-3', 'ink-4']) {
      add(`${ink} sobre paper`, col(ink), paper, 4.5)
      add(`${ink} sobre card`, col(ink), card, 4.5)
      add(`${ink} sobre card-2`, col(ink), card2, 4.5)
    }
    for (const s of ['success', 'warn', 'info', 'danger']) {
      add(`${s} sobre card`, col(s), card, 4.5)
      add(`${s} sobre ${s}-tint (chip de status)`, col(s), over(col(`${s}-tint`), card), 4.5)
    }
    add('on-danger sobre danger (botão perigo)', col('on-danger'), col('danger'), 4.5)
    add('star-deep sobre card (nota)', col('star-deep'), card, 4.5)
    add('star sobre card (estrelas)', col('star'), card, 1.8)
    add('card sobre ink-1 (toast)', card, col('ink-1'), 4.5)
    t.chart[theme].forEach((c, i) => add(`gráfico categórico ${i + 1} sobre card`, parseColor(c), card, 3))
    add('gráfico positivo sobre card', parseColor(t.chart.positive[theme]), card, 3)
    add('gráfico negativo sobre card', parseColor(t.chart.negative[theme]), card, 3)
  }
  return rows
}

export const contrastViolations = (rows = runContrast()) =>
  rows.filter((r) => !r.ok).map((r) => ({ file: 'src/design/tokens.json', line: 1, rule: 'contrast-aa', message: `${r.theme} · ${r.agent} · ${r.pair}: ${r.ratio}:1 (mínimo ${r.min}:1)` }))

// ── conformidade do manifesto contra o código ────────────────────────────────

const grepDir = (dir, re) => walk(join(ROOT, dir), ['.ts', '.tsx']).some((f) => re.test(readFileSync(f, 'utf8')))

/** Confere UMA página declarada `conformant` contra o código. `required` = métricas mínimas de stats do domínio. */
export function checkPage(id, p, required = []) {
  /** @type {Violation[]} */
  const violations = []
  const bad = (rule, message) => violations.push({ file: p.shell, line: 1, rule, message: `${id}: ${message}` })
  if (p.status !== 'conformant') return violations
  if (!existsSync(join(ROOT, p.shell))) bad('manifest-shell', `shell inexistente (${p.shell})`)
  if (p.art === null) bad('manifest-art', 'direção de arte ainda não perguntada (art = null)')
  for (const k of ['appShell', 'hero', 'theme', 'icons', 'stats', 'detail', 'prefs', 'hotkeys', 'mobile']) {
    const val = k === 'stats' ? p.stats.page : p[k]
    if (!val) bad('manifest-item', `item "${k}" não adotado, mas a página está "conformant"`)
  }
  if (p.collections.length === 0) bad('manifest-item', 'declare as coleções (useCollection) ou deixe a página como "migrating"')
  if (!grepDir(p.dir, /<AppShell\b/)) bad('code-appshell', 'não renderiza <AppShell>')
  if (p.hero && !grepDir(p.dir, /<Hero\b/)) bad('code-hero', 'a tela Início não usa <Hero>')
  for (const scope of p.collections) {
    const esc = scope.replace(/[.*+?^${}()|[\]\\:/]/g, '\\$&')
    if (!grepDir(p.dir, new RegExp("scope:\\s*['\"`]" + esc + "['\"`]"))) bad('code-collection', `esquema "${scope}" não encontrado`)
  }
  if (p.collections.length && !grepDir(p.dir, /\buseCollection\(/)) bad('code-collection', 'nenhum useCollection()')
  if (p.quickCapture && !grepDir(p.dir, /<QuickCapture\b/)) bad('code-capture', 'declara captura rápida mas não usa <QuickCapture>')
  if (p.stats.page && !grepDir(p.dir, /<StatsPage\b/)) bad('code-stats', 'não usa <StatsPage>')
  if (p.detail && !grepDir(p.dir, /<DetailPage\b/)) bad('code-detail', 'não usa <DetailPage>')
  if (p.prefs && !grepDir(p.dir, /\bpreferences=/)) bad('code-prefs', 'não passa as preferências do agente ao AppShell')
  const missing = required.filter((m) => !p.stats.metrics.includes(m))
  if (missing.length) bad('stats-metrics', `faltam métricas mínimas de estatísticas: ${missing.join(', ')}`)
  if (existsSync(join(ROOT, p.dir))) {
    for (const f of walk(join(ROOT, p.dir), ['.ts', '.tsx'])) {
      const name = f.split(sep).pop()
      if (/^(Toast|Tweaks)\w*\.tsx$/.test(name) || /(^|[A-Za-z])Icons?\.tsx$/.test(name)) bad('local-component', `${name} duplica componente do padrão (Toast/Tweaks/Icon): apague`)
    }
  }
  return violations
}

/** Confere todas as páginas. Devolve violações e a matriz do relatório. */
export function runConformance() {
  const conf = loadConformance()
  /** @type {Violation[]} */
  const violations = []
  const matrix = []
  for (const [id, p] of Object.entries(conf.pages)) {
    const cells = {
      appShell: p.appShell, hero: p.hero, theme: p.theme, icons: p.icons, collections: p.collections.length > 0, quickCapture: !!p.quickCapture,
      stats: p.stats.page, detail: p.detail, prefs: p.prefs, hotkeys: p.hotkeys, mobile: p.mobile,
    }
    matrix.push({ id, status: p.status, art: p.art, cells, collections: p.collections, metrics: p.stats.metrics.length })
    violations.push(...checkPage(id, p, conf.statsRequired[id] ?? []))
  }
  return { violations, matrix }
}

// ── relatório ────────────────────────────────────────────────────────────────

const mark = (status, v) => (v ? (status === 'conformant' ? '✅' : '🟡') : '⬜')

export function renderReport(matrix, lint, contrastRows, extra = []) {
  const head = ['Agente', 'Status', 'Arte', 'Shell', 'Hero', 'Tema', 'Ícones', 'Coleções', 'Captura', 'Stats', 'Detalhe', 'Prefs', 'Atalhos', 'Celular']
  const rows = matrix.map((m) => [
    m.id, m.status, m.art ?? '—',
    ...['appShell', 'hero', 'theme', 'icons', 'collections', 'quickCapture', 'stats', 'detail', 'prefs', 'hotkeys', 'mobile'].map((k) => mark(m.status, m.cells[k])),
  ])
  const table = [head, head.map(() => '---'), ...rows].map((r) => `| ${r.join(' | ')} |`).join('\n')
  const byRule = {}
  for (const v of lint) byRule[v.rule] = (byRule[v.rule] || 0) + 1
  const failing = contrastRows.filter((r) => !r.ok).length
  const counts = Object.entries(byRule).map(([r, n]) => `- \`${r}\`: ${n}`).join('\n') || '- nenhuma violação'
  return `# Conformidade com o Design System

> Gerado por \`npm run audit:design -- --report\` (webapp/frontend). **Não edite à mão.**
> Fonte: \`src/design/conformance.json\`. Guia: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

Legenda: ✅ adotado e verificado · 🟡 declarado em página ainda não conformante · ⬜ não adotado.
Política: \`legacy\` só aparece aqui; \`migrating\` falha o lint estático; \`conformant\` falha em qualquer item.

${table}

## Lint estático (src/design/ e páginas migradas)

${counts}

## Contraste (WCAG AA) — ${contrastRows.length} pares verificados, ${failing} falhando

Cada acento de agente × tema claro/escuro. Detalhes: \`npm run audit:design -- --contrast\`.
${extra.length ? '\n## Outros achados\n\n' + extra.map((e) => `- ${e}`).join('\n') + '\n' : ''}`
}

export function writeReport(content) {
  const out = join(ROOT, '..', 'docs', 'DESIGN_CONFORMANCE.md')
  writeFileSync(out, content)
  return out
}
