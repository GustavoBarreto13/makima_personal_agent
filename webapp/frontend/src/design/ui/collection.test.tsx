// @vitest-environment jsdom
// Extensões retrocompatíveis do DS usadas pela Akane (spec 072): capa em pôster no MediaCard e os ganchos
// `gridClass` / `renderGroupHeader` do CollectionBody. O comportamento padrão não pode mudar para os outros agentes.

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { mockLayoutApis, mockMatchMedia } from '../test-utils'
import { defineCollection } from '../core/collection'
import { useCollection } from '../headless/useCollection'
import { CollectionBody, MediaCard } from '../index'

interface Item { id: string; name: string; month: string }
const ITEMS: Item[] = [{ id: '1', name: 'Duna', month: 'outubro de 2026' }, { id: '2', name: 'Her', month: 'setembro de 2026' }, { id: '3', name: 'Alien', month: 'setembro de 2026' }]
const schema = defineCollection<Item>({
  scope: 'test:colecao',
  search: (i) => [i.name],
  facets: [],
  groups: [{ id: 'month', label: 'Mês', key: (i) => i.month }],
  sorts: [{ id: 'name', label: 'Nome', value: (i) => i.name }],
  defaults: { groupBy: 'month', sortBy: 'name', dir: 'asc' },
})

function Body(props: Partial<Parameters<typeof CollectionBody<Item>>[0]> & { view?: 'grid' | 'list' }) {
  const c = useCollection(schema, ITEMS, { persist: false })
  return <CollectionBody c={c} view="grid" renderCard={(i) => <span key={i.id}>{i.name}</span>} renderRow={(i) => <span key={i.id}>{i.name}</span>} {...props} />
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
afterEach(cleanup)

describe('MediaCard cover="poster"', () => {
  it('capa retangular 2:3 só quando pedida; o padrão continua a faixa baixa', () => {
    const { container, rerender } = render(<MediaCard title="Duna" icon="movie" hue={10} />)
    expect(container.querySelector('.ds-cover')).toBeTruthy()
    expect(container.querySelector('.ds-cover-poster')).toBeNull()
    rerender(<MediaCard title="Duna" icon="movie" hue={10} cover="poster" />)
    expect(container.querySelector('.ds-cover.ds-cover-poster')).toBeTruthy()
  })

  it('com imagem usa a imagem na capa em pôster; o título aparece uma vez só', () => {
    const { container } = render(<MediaCard title="Duna" icon="movie" hue={10} cover="poster" image="http://x/p.jpg" />)
    expect(container.querySelector('.ds-cover-poster img')?.getAttribute('src')).toBe('http://x/p.jpg')
    expect(screen.getAllByText('Duna')).toHaveLength(1)
  })
})

describe('CollectionBody: gridClass e renderGroupHeader', () => {
  it('padrão: grade ds-grid e cabeçalho de grupo com o título e a contagem', () => {
    const { container } = render(<Body />)
    expect(container.querySelector('.ds-grid')).toBeTruthy()
    expect(container.querySelector('.ds-grid-poster')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'setembro de 2026' })).toBeTruthy()
  })

  it('gridClass troca a classe da grade', () => {
    const { container } = render(<Body gridClass="ds-grid-poster" />)
    expect(container.querySelector('.ds-grid-poster')).toBeTruthy()
    expect(container.querySelector('.ds-grid')).toBeNull()
  })

  it('renderGroupHeader substitui o cabeçalho e recebe o nome e a contagem do grupo', () => {
    render(<Body renderGroupHeader={(key, count) => <p>{`cabeçalho ${key}: ${count}`}</p>} />)
    expect(screen.getByText('cabeçalho setembro de 2026: 2')).toBeTruthy()
    expect(screen.getByText('cabeçalho outubro de 2026: 1')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })
})
