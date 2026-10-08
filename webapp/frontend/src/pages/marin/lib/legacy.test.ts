// Ponte com o shell antigo: preferências e favoritos do navegador (lógica pura).

import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from '../context'
import { legacyFavoriteIds, legacyPrefs } from './legacy'

const store = (data: Record<string, string>) => ({ getItem: (k: string) => data[k] ?? null })

describe('legacyPrefs', () => {
  it('sem nada guardado devolve o padrão', () => {
    expect(legacyPrefs(DEFAULT_PREFS, store({}))).toEqual(DEFAULT_PREFS)
    expect(legacyPrefs(DEFAULT_PREFS, null)).toEqual(DEFAULT_PREFS)
  })
  it('densidade e ordenação do shell antigo viram o ponto de partida', () => {
    const old = JSON.stringify({ tema: 'Claro', acento: 'Neon', densidade: 'Compacto', ordenacao: 'Nota' })
    expect(legacyPrefs(DEFAULT_PREFS, store({ 'mr-tweaks': old }))).toEqual({ ...DEFAULT_PREFS, density: 'compact', sort: 'rating' })
  })
  it('valor desconhecido mantém o padrão e JSON quebrado não estoura', () => {
    expect(legacyPrefs(DEFAULT_PREFS, store({ 'mr-tweaks': JSON.stringify({ densidade: 'Gigante', ordenacao: '?' }) }))).toEqual(DEFAULT_PREFS)
    expect(legacyPrefs(DEFAULT_PREFS, store({ 'mr-tweaks': '{quebrado' }))).toEqual(DEFAULT_PREFS)
  })
})

describe('legacyFavoriteIds', () => {
  it('lê até 4 ids de texto', () => {
    expect(legacyFavoriteIds(store({ 'marin.favorites': JSON.stringify(['a', 'b', 'c', 'd', 'e']) }))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('ignora o que não é lista de texto', () => {
    expect(legacyFavoriteIds(store({ 'marin.favorites': JSON.stringify([1, null, 'ok']) }))).toEqual(['ok'])
    expect(legacyFavoriteIds(store({ 'marin.favorites': '{"a":1}' }))).toEqual([])
    expect(legacyFavoriteIds(store({ 'marin.favorites': 'lixo' }))).toEqual([])
    expect(legacyFavoriteIds(store({}))).toEqual([])
  })
})
