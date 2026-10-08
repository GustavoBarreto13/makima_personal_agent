// Testes da auditoria do Design System. Duas metas:
//   1) o repositório está em dia (nenhuma violação real);
//   2) o auditor REPROVA o que deve reprovar (casos negativos): sem isso, "passou" não significa nada.

import { describe, it, expect } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const audit: any = await import(/* @vite-ignore */ new URL('../../scripts/lib/design-audit.mjs', import.meta.url).href)

const rules = (rel: string, content: string, kind: string): string[] => audit.lintSource(rel, content, kind).map((v: { rule: string }) => v.rule)

describe('o repositório está em dia com o padrão', () => {
  it('lint estático: nenhuma violação em src/design/ e nas páginas migradas', () => {
    expect(audit.runLint()).toEqual([])
  })
  it('tokens.css, accents.css e tokens.generated.ts estão em dia com tokens.json e agents.json', () => {
    expect(audit.checkTokensFresh()).toEqual([])
  })
  it('contraste WCAG AA em todos os pares, para cada agente × tema', () => {
    const rows = audit.runContrast()
    expect(rows.length).toBeGreaterThan(200)
    expect(audit.contrastViolations(rows)).toEqual([])
  })
  it('manifesto de conformidade bate com o código', () => {
    expect(audit.runConformance().violations).toEqual([])
  })
})

describe('lint estático reprova o que deve reprovar', () => {
  it('cor literal', () => {
    expect(rules('src/design/ui/x.tsx', 'const a = { color: "#ff0000" }', 'ui')).toContain('no-literal-color')
    expect(rules('src/design/ui/x.tsx', 'const a = "rgb(1,2,3)"', 'ui')).toContain('no-literal-color')
    expect(rules('src/design/extras.css', '.a{color:oklch(0.5 0.1 20)}', 'design')).toContain('no-literal-color')
    // dentro de components.css o oklch decorativo é permitido; hex nunca
    expect(rules('src/design/ui/components.css', '.a{background:oklch(0.5 0.1 20)}', 'components-css')).toEqual([])
    expect(rules('src/design/ui/components.css', '.a{color:#fff}', 'components-css')).toContain('no-literal-color')
    expect(rules('src/design/ui/x.tsx', 'const a = "var(--ds-accent)"', 'ui')).toEqual([])
  })
  it('input de data/hora nativo', () => {
    expect(rules('src/pages/x/A.tsx', '<input type="date" />', 'page')).toContain('no-native-date')
    expect(rules('src/pages/x/A.tsx', '<input type="time" />', 'page')).toContain('no-native-date')
    expect(rules('src/pages/x/A.tsx', '<input type="text" />', 'page')).toEqual([])
  })
  it('diálogos nativos (mas o confirm do padrão é permitido)', () => {
    expect(rules('src/pages/x/A.tsx', 'if (window.confirm("ok")) {}', 'page')).toContain('no-native-dialog')
    expect(rules('src/pages/x/A.tsx', 'alert("oi")', 'page')).toContain('no-native-dialog')
    expect(rules('src/pages/x/A.tsx', 'const ok = await confirm({ title: "x" })', 'page')).toEqual([])
  })
  it('datas em UTC', () => {
    expect(rules('src/pages/x/A.tsx', "const d = new Date('2026-01-01')", 'page')).toContain('no-utc-date')
    expect(rules('src/pages/x/A.tsx', "const d = new Date(s + 'T00:00:00')", 'page')).toContain('no-utc-date')
    expect(rules('src/pages/x/A.tsx', 'const s = new Date().toISOString().slice(0, 10)', 'page')).toContain('no-utc-date')
    expect(rules('src/pages/x/A.tsx', 'const d = parseISODate(s)', 'page')).toEqual([])
  })
  it('emoji como ícone de UI (símbolos tipográficos e ⌘ são permitidos)', () => {
    expect(rules('src/pages/x/A.tsx', '<span>🎯 Metas</span>', 'page')).toContain('no-emoji-ui')
    expect(rules('src/pages/x/A.tsx', '<span>▲ 12% · ★ 4.5 ⌘</span>', 'page')).toEqual([])
  })
  it('z-index literal', () => {
    expect(rules('src/design/ui/x.css', '.a{z-index:50}', 'ui')).toContain('no-literal-z')
    expect(rules('src/design/ui/x.css', '.a{z-index:var(--ds-z-modal)}', 'ui')).toEqual([])
    expect(rules('src/design/ui/x.css', '.a{z-index:2}', 'ui')).toEqual([])
  })
  it('@keyframes fora do motion.css', () => {
    expect(rules('src/design/ui/extras.css', '@keyframes x{from{opacity:0}}', 'ui')).toContain('keyframes-in-motion')
    expect(rules('src/design/motion.css', '@keyframes x{from{opacity:0}}', 'motion-css')).toEqual([])
  })
  it('core/ puro: sem react, DOM nem storage', () => {
    expect(rules('src/design/core/a.ts', "import { useState } from 'react'", 'core')).toContain('core-pure')
    expect(rules('src/design/core/a.ts', 'const v = localStorage.getItem("a")', 'core')).toContain('core-pure')
    expect(rules('src/design/core/a.ts', 'const w = window.innerWidth', 'core')).toContain('core-pure')
    expect(rules('src/design/core/a.ts', '// usa window só em comentário', 'core')).toEqual([])
    expect(rules('src/design/core/a.ts', "const m = 'o window do navegador'", 'core')).toEqual([])
    expect(rules('src/design/core/a.ts', "import { x } from '../ui/Button'", 'core')).toContain('layering')
  })
  it('ui/ nunca chama a rede nem importa API de domínio', () => {
    expect(rules('src/design/ui/a.tsx', 'const r = await fetch("/api/x")', 'ui')).toContain('no-network-in-design')
    expect(rules('src/design/ui/a.tsx', "import { kaguyaApi } from '../../pages/kaguya/kaguyaApi'", 'ui')).toEqual(expect.arrayContaining(['no-network-in-design', 'layering']))
    expect(rules('src/design/headless/a.ts', "import { api } from '../../lib/api'", 'headless')).toContain('no-network-in-design')
  })
  it('ícone de shell em página migrada', () => {
    expect(rules('src/pages/x/A.tsx', "import { Icon } from './ui/Icon'", 'page')).toContain('icons-from-design')
    expect(rules('src/pages/x/A.tsx', "import { Icon } from '../../design'", 'page')).toEqual([])
  })
  it('estilo de arte só declara tokens visuais, nunca layout', () => {
    const bad = `.ds-app[data-ds-art="x"] {\n  display: flex;\n  margin: 8px;\n  --ds-r-md: 6px;\n}`
    const r = audit.lintSource('src/design/art/x.css', bad, 'art')
    expect(r.filter((v: { rule: string }) => v.rule === 'art-no-layout')).toHaveLength(2)
    expect(r[0].message).toMatch(/layout/)
    const good = `/* ok */\n.ds-app[data-ds-art="x"] {\n  --ds-r-md: 6px;\n  --ds-font-display: serif;\n}`
    expect(audit.lintSource('src/design/art/x.css', good, 'art')).toEqual([])
  })
  it('arquivos gerados e testes são ignorados', () => {
    expect(audit.classify('src/design/tokens.css')).toBeNull()
    expect(audit.classify('src/design/core/format.test.ts')).toBeNull()
    expect(audit.classify('src/design/core/format.ts')).toBe('core')
  })
})

describe('contraste WCAG', () => {
  it('preto sobre branco = 21:1; cinza #777 sobre branco reprova AA de texto', () => {
    const w = audit.parseColor('#ffffff')
    expect(audit.contrast(audit.parseColor('#000000'), w)).toBeCloseTo(21, 0)
    expect(audit.contrast(audit.parseColor('#777777'), w)).toBeLessThan(4.5)
    expect(audit.contrast(audit.parseColor('#767676'), w)).toBeGreaterThan(4.5)
  })
  it('compositing de alfa: tint translúcido sobre o card', () => {
    const tint = audit.parseColor('oklch(0.5 0.2 22 / 0.13)')
    expect(tint.a).toBeCloseTo(0.13)
  })
  it('o auditor acusa um par ruim (dark ink-4 fingido)', () => {
    const rows = audit.runContrast()
    const bad = { ...rows[0], ok: false, ratio: 2, min: 4.5, pair: 'par ruim' }
    expect(audit.contrastViolations([bad])[0].rule).toBe('contrast-aa')
  })
})

describe('conformidade: manifesto × código', () => {
  const empty = {
    status: 'conformant', dir: 'src/design/core', shell: 'src/design/core/naoexiste.tsx', art: null, appShell: false, hero: false, theme: false, icons: false,
    collections: [], quickCapture: null, stats: { page: false, metrics: [] }, detail: false, prefs: false, hotkeys: false, mobile: false,
  }
  it('uma página "conformant" sem Hero, sem AppShell e sem arte falha em muitos itens', () => {
    const v = audit.checkPage('falsa', empty, ['pages'])
    const found = v.map((x: { rule: string }) => x.rule)
    expect(found).toEqual(expect.arrayContaining(['manifest-shell', 'manifest-art', 'manifest-item', 'code-appshell', 'stats-metrics']))
  })
  it('páginas legacy e migrating não falham a conformidade', () => {
    expect(audit.checkPage('x', { ...empty, status: 'legacy' })).toEqual([])
    expect(audit.checkPage('x', { ...empty, status: 'migrating' })).toEqual([])
  })
  it('a página /design (referência) está de fato conformante', () => {
    const conf = audit.loadConformance()
    expect(conf.pages.design.status).toBe('conformant')
    expect(audit.checkPage('design', conf.pages.design, conf.statsRequired.design)).toEqual([])
  })
  it('todo agente do registro tem uma entrada no manifesto', () => {
    const conf = audit.loadConformance()
    for (const a of audit.loadAgents()) expect(conf.pages[a.id], a.id).toBeDefined()
  })
  // Migrar uma página é decisão deliberada: ao começar a migrar um agente, acrescente-o aqui.
  // Quem não está na lista continua `legacy` (um agente não "migra sozinho" por engano no manifesto).
  const MIGRATED = new Set(['design', 'nami', 'akane', 'frieren', 'marin'])
  it('só as páginas listadas como migradas saem de legacy', () => {
    const conf = audit.loadConformance()
    for (const [id, p] of Object.entries(conf.pages) as [string, { status: string }][]) {
      if (!MIGRATED.has(id)) expect(p.status, id).toBe('legacy')
    }
  })
})
