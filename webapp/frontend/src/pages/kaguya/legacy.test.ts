// O visual do Kanban e do calendário é o do shell antigo e NÃO pode depender dos tokens que a arte Shuchiin sobrescreve:
// ela troca o vidro por "papel quase opaco" (--ds-glass-*), reduz o blur e quadra os cantos (--ds-r-*).
import { describe, expect, it } from 'vitest'
// @ts-expect-error o projeto não tem os tipos do Node; o teste roda no Node
import { readFileSync, readdirSync, statSync } from 'node:fs'

const css = readFileSync(new URL('./legacy.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('legacy.css (porte do visual antigo)', () => {
  it('o arquivo foi lido', () => { expect(css.length).toBeGreaterThan(2000) })
  it('não usa os tokens de vidro nem de raio que a arte sobrescreve', () => {
    expect(css).not.toMatch(/var\(--ds-glass-/)
    expect(css).not.toMatch(/var\(--ds-r-/)
    expect(css).not.toMatch(/var\(--ds-blur/)
  })
  it('o vidro é translúcido e tem blur de verdade', () => {
    expect(css).toMatch(/--g-bg:\s*color-mix\(in oklab, var\(--ds-card\) 62%/)
    expect(css).toMatch(/backdrop-filter:\s*blur\(18px\) saturate\(1\.4\)/)
  })
  it('os raios são os do antigo', () => {
    expect(css).toMatch(/--kg-r-sm:\s*7px/)
    expect(css).toMatch(/--kg-r-md:\s*12px/)
    expect(css).toMatch(/--kg-r-lg:\s*18px/)
  })
})

// Guarda contra o card da Matriz de Eisenhower que ficou sem estilo quando o Kanban trocou de CSS: toda classe `kn-*` escrita
// num className precisa ter regra em kaguya.css ou legacy.css. As que são só gancho de teste/estado ficam nesta lista.
const HOOKS = new Set(['kn-with-panel', 'kn-hours', 'kn-rank', 'kn-found', 'kn-sn-item', 'kn-completed', 'kn-cal', 'kn-ecard', 'kn-swatches'])
const walk = (dir: URL): string[] =>
  readdirSync(dir).flatMap((n: string) => {
    const u = new URL(n, dir)
    return statSync(u).isDirectory() ? walk(new URL(`${n}/`, dir)) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [u.pathname] : []
  })
describe('classes kn-* usadas nas telas', () => {
  it('todas têm regra de CSS (ou estão na lista de ganchos)', () => {
    const rules = readFileSync(new URL('./kaguya.css', import.meta.url), 'utf8') + css
    const files = walk(new URL('./', import.meta.url))
    expect(files.length).toBeGreaterThan(30)
    const missing = new Set<string>()
    for (const f of files) {
      const src: string = readFileSync(f.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8')
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        for (const c of (m[1] ?? m[2]).match(/kn-[a-z0-9-]+(?![a-z0-9$-])/g) ?? []) {
          if (c.endsWith('-') || c === 'kn-p' || HOOKS.has(c)) continue
          if (!new RegExp(`\\.${c}(?![\\w-])`).test(rules)) missing.add(`${c} (${f.split('kaguya/').pop()})`)
        }
      }
    }
    expect([...missing]).toEqual([])
  })
})
