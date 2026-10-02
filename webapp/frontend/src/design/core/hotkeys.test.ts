import { describe, it, expect } from 'vitest'
import { isTypingTarget, matchShortcut, SHORTCUTS, stepSequence, type KeyLike } from './hotkeys'

const ev = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o })

describe('matchShortcut', () => {
  it('mod+k aceita Ctrl (Windows) e ⌘ (Mac)', () => {
    expect(matchShortcut(ev('k', { ctrlKey: true }), 'mod+k')).toBe(true)
    expect(matchShortcut(ev('K', { metaKey: true }), 'mod+k')).toBe(true)
    expect(matchShortcut(ev('k'), 'mod+k')).toBe(false)
  })
  it('tecla simples não dispara com Ctrl', () => {
    expect(matchShortcut(ev('n'), 'n')).toBe(true)
    expect(matchShortcut(ev('n', { ctrlKey: true }), 'n')).toBe(false)
  })
  it('esc casa com Escape; ? casa mesmo vindo com shift', () => {
    expect(matchShortcut(ev('Escape'), 'esc')).toBe(true)
    expect(matchShortcut(ev('?', { shiftKey: true }), '?')).toBe(true)
  })
  it('mod+enter', () => {
    expect(matchShortcut(ev('Enter', { ctrlKey: true }), 'mod+enter')).toBe(true)
    expect(matchShortcut(ev('Enter'), 'mod+enter')).toBe(false)
  })
})

describe('isTypingTarget', () => {
  it('campos de texto bloqueiam atalhos de uma tecla', () => {
    expect(isTypingTarget('INPUT', false)).toBe(true)
    expect(isTypingTarget('TEXTAREA', false)).toBe(true)
    expect(isTypingTarget('DIV', true)).toBe(true)
    expect(isTypingTarget('BUTTON', false)).toBe(false)
  })
})

describe('sequência g + letra', () => {
  it('g seguido de h completa dentro da janela', () => {
    const a = stepSequence({ pending: false, at: 0 }, ev('g'), 1000)
    expect(a.state.pending).toBe(true)
    const b = stepSequence(a.state, ev('h'), 1500)
    expect(b.completed).toBe('h')
    expect(b.state.pending).toBe(false)
  })
  it('expira depois da janela', () => {
    const a = stepSequence({ pending: false, at: 0 }, ev('g'), 1000)
    expect(stepSequence(a.state, ev('h'), 2500).completed).toBeNull()
  })
})

describe('catálogo', () => {
  it('toda ação com atalho tem um comando equivalente (paridade teclado ↔ toque)', () => {
    for (const s of SHORTCUTS) expect(s.command).toMatch(/^[a-z.]+$/)
  })
  it('não há atalhos duplicados', () => {
    const keys = SHORTCUTS.map((s) => s.keys)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
