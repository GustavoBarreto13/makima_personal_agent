// O visual do Kanban e do calendário é o do shell antigo e NÃO pode depender dos tokens que a arte Shuchiin sobrescreve:
// ela troca o vidro por "papel quase opaco" (--ds-glass-*), reduz o blur e quadra os cantos (--ds-r-*).
import { describe, expect, it } from 'vitest'
import raw from './legacy.css?raw'

const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

describe('legacy.css (porte do visual antigo)', () => {
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
