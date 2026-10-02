// @vitest-environment jsdom
// Testes dos hooks do Design System (headless/): tema, atalhos, coleção, captura, preferências, otimista.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia } from '../test-utils'
import { breakpointOf } from './useBreakpoint'
import { useTheme, applyTheme } from './useTheme'
import { useHotkeys } from './useHotkeys'
import { useCollection } from './useCollection'
import { useCapture } from './useCapture'
import { usePrefs } from './usePrefs'
import { runOptimistic } from './optimistic'
import { __resetToasts, useToastItems } from './toast'
import { filterCommands } from './commands'
import { defineCollection, type CollectionSchema } from '../core/collection'
import { createCaptureParser } from '../core/capture'

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); applyTheme('system'); window.history.replaceState(null, '', '/'); mockMatchMedia(false) })

describe('breakpoints do tokens.json (640 · 900 · 1280)', () => {
  it('limites', () => {
    expect(breakpointOf(0)).toBe('sm')
    expect(breakpointOf(639)).toBe('sm')
    expect(breakpointOf(640)).toBe('md')
    expect(breakpointOf(899)).toBe('md')
    expect(breakpointOf(900)).toBe('lg')
    expect(breakpointOf(1279)).toBe('lg')
    expect(breakpointOf(1280)).toBe('xl')
  })
})

describe('useTheme (global: claro, escuro, sistema)', () => {
  it('escolher claro/escuro grava, aplica data-ds-theme no <html> e resolve', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('system')
    act(() => result.current.setPreference('dark'))
    expect(document.documentElement.getAttribute('data-ds-theme')).toBe('dark')
    expect(localStorage.getItem('makima-theme')).toBe('dark')
    expect(result.current.resolved).toBe('dark')
    act(() => result.current.setPreference('light'))
    expect(document.documentElement.getAttribute('data-ds-theme')).toBe('light')
    expect(result.current.resolved).toBe('light')
  })
  it('"sistema" remove o atributo e segue prefers-color-scheme', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('light'))
    act(() => result.current.setPreference('system'))
    expect(document.documentElement.hasAttribute('data-ds-theme')).toBe(false)
    expect(result.current.resolved).toBe('dark')
  })
  it('toggle alterna a partir do tema efetivo', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('light'))
    act(() => result.current.toggle())
    expect(result.current.preference).toBe('dark')
    act(() => result.current.toggle())
    expect(result.current.preference).toBe('light')
  })
})

describe('useHotkeys', () => {
  function Host({ onN, onK, onGH }: { onN: () => void; onK: () => void; onGH: () => void }) {
    useHotkeys([
      { keys: 'n', handler: onN },
      { keys: 'mod+k', global: true, handler: onK },
      { keys: 'g h', handler: onGH },
    ])
    return <input aria-label="campo" />
  }
  it('tecla simples dispara fora de campos e é ignorada dentro deles', async () => {
    const onN = vi.fn()
    render(<Host onN={onN} onK={() => {}} onGH={() => {}} />)
    await userEvent.keyboard('n')
    expect(onN).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByLabelText('campo'))
    await userEvent.keyboard('n')
    expect(onN).toHaveBeenCalledTimes(1)
  })
  it('atalho global (Ctrl+K) funciona até dentro de um campo', async () => {
    const onK = vi.fn()
    render(<Host onN={() => {}} onK={onK} onGH={() => {}} />)
    await userEvent.click(screen.getByLabelText('campo'))
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(onK).toHaveBeenCalledTimes(1)
  })
  it('sequência g + h', async () => {
    const onGH = vi.fn()
    render(<Host onN={() => {}} onK={() => {}} onGH={onGH} />)
    await userEvent.keyboard('gh')
    expect(onGH).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('h')
    expect(onGH).toHaveBeenCalledTimes(1)
  })
})

interface Item { id: number; type: string; date: string }
const schema: CollectionSchema<Item> = defineCollection<Item>({
  scope: 'test:hook',
  search: (i) => [i.type],
  facets: [
    { kind: 'enum', id: 'type', label: 'Tipo', options: [{ value: 'A' }, { value: 'B' }], get: (i) => i.type },
    { kind: 'dateRange', id: 'date', label: 'Período', buckets: ['last30', 'all'], defaultBucket: 'all', get: (i) => i.date },
  ],
  groups: [{ id: 'type', label: 'Tipo', key: (i) => i.type }],
  sorts: [{ id: 'recent', label: 'Recentes', value: (i) => i.date }],
})
const items: Item[] = [{ id: 1, type: 'A', date: '2026-10-01' }, { id: 2, type: 'B', date: '2026-09-01' }, { id: 3, type: 'A', date: '2026-08-01' }]

describe('useCollection', () => {
  it('filtra, conta e gera chips', () => {
    const { result } = renderHook(() => useCollection(schema, items, { today: '2026-10-02' }))
    expect(result.current.result.count).toBe(3)
    act(() => result.current.toggleValue('type', 'A'))
    expect(result.current.result.items.map((i) => i.id)).toEqual([1, 3])
    expect(result.current.chips.map((c) => c.label)).toEqual(['A'])
    act(() => result.current.setBucket('date', 'last30'))
    expect(result.current.result.items.map((i) => i.id)).toEqual([1])
    act(() => result.current.clearAll())
    expect(result.current.hasActive).toBe(false)
  })
  it('persiste filtros, agrupar e ordenar; a busca nunca é persistida', () => {
    const a = renderHook(() => useCollection(schema, items, { today: '2026-10-02' }))
    act(() => { a.result.current.toggleValue('type', 'B'); a.result.current.setGroup('type'); a.result.current.toggleDir(); a.result.current.setQ('xyz') })
    a.unmount()
    const b = renderHook(() => useCollection(schema, items, { today: '2026-10-02' }))
    expect(b.result.current.state.facets.type.values).toEqual({ B: true })
    expect(b.result.current.state.groupBy).toBe('type')
    expect(b.result.current.state.dir).toBe('asc')
    expect(b.result.current.state.q).toBe('')
  })
  it('espelha filtros na URL e restaura a partir dela', () => {
    window.history.replaceState(null, '', '/lista?f.type=A&d=asc')
    const { result } = renderHook(() => useCollection(schema, items, { today: '2026-10-02', syncUrl: true, persist: false }))
    expect(result.current.state.facets.type.values).toEqual({ A: true })
    expect(result.current.state.dir).toBe('asc')
    act(() => result.current.toggleValue('type', 'B'))
    expect(window.location.search).toContain('f.type=')
    expect(window.location.pathname).toBe('/lista')
  })
  it('ignora estado salvo de um esquema antigo', () => {
    localStorage.setItem('ds:collection:test:hook', JSON.stringify({ groupBy: 'removido', sortBy: 'removido' }))
    const { result } = renderHook(() => useCollection(schema, items, { today: '2026-10-02' }))
    expect(result.current.state.groupBy).toBe('none')
    expect(result.current.state.sortBy).toBe('recent')
  })
})

describe('useCapture', () => {
  const parser = createCaptureParser({ rules: ['place', 'tag', 'rating'], today: '2026-10-02' })
  it('texto → campos → chips, e remover um chip edita o texto', () => {
    const { result } = renderHook(() => useCapture(parser, '2026-10-02'))
    act(() => result.current.setText('Supino @Smart-Fit #peito ★4.5'))
    expect(result.current.result.fields).toMatchObject({ title: 'Supino', place: 'Smart Fit', tags: ['peito'], rating: 4.5 })
    expect(result.current.chips.map((c) => c.label)).toEqual(['Smart Fit', '#peito', '4.5 / 5'])
    act(() => result.current.removeChip(result.current.chips[1]))
    expect(result.current.text).toBe('Supino @Smart-Fit ★4.5')
    act(() => result.current.reset())
    expect(result.current.text).toBe('')
  })
})

describe('usePrefs', () => {
  it('persiste por agente, mescla com os padrões', () => {
    const a = renderHook(() => usePrefs('x', { pr: true, kcal: false }))
    act(() => a.result.current[1]({ kcal: true }))
    a.unmount()
    const b = renderHook(() => usePrefs('x', { pr: true, kcal: false, nova: 1 }))
    expect(b.result.current[0]).toEqual({ pr: true, kcal: true, nova: 1 })
    expect(localStorage.getItem('ds:prefs:x')).toContain('kcal')
  })
})

describe('runOptimistic', () => {
  it('sucesso: aplica e mantém', async () => {
    const apply = vi.fn(), rollback = vi.fn()
    const r = await runOptimistic({ apply, rollback, commit: async () => 42 })
    expect(r).toBe(42)
    expect(apply).toHaveBeenCalled()
    expect(rollback).not.toHaveBeenCalled()
  })
  it('falha: reverte e mostra toast de erro', async () => {
    const apply = vi.fn(), rollback = vi.fn()
    const toasts = renderHook(() => useToastItems())
    await act(async () => { await runOptimistic({ apply, rollback, commit: async () => { throw new Error('x') }, errorMessage: 'Não deu' }) })
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(toasts.result.current[0]).toMatchObject({ message: 'Não deu', tone: 'error' })
  })
})

describe('paleta: filtro de comandos', () => {
  const cmds = [{ id: '1', label: 'Registrar treino', run: () => {} }, { id: '2', label: 'Ir para Estatísticas', keywords: 'retrospectiva', run: () => {} }]
  it('ignora acentos e usa palavras-chave', () => {
    expect(filterCommands(cmds, 'estatisticas').map((c) => c.id)).toEqual(['2'])
    expect(filterCommands(cmds, 'retro').map((c) => c.id)).toEqual(['2'])
    expect(filterCommands(cmds, '').length).toBe(2)
    expect(filterCommands(cmds, 'zzz')).toEqual([])
  })
})
