// @vitest-environment jsdom
// FilterFacets: o miolo da folha de filtros, com a faceta enum "todas menos estas" (excludable).

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defineCollection } from '../core/collection'
import { useCollection } from '../headless/useCollection'
import { FilterFacets } from './collection'

interface Row { id: number; kind: string }
const rows: Row[] = [{ id: 1, kind: 'a' }, { id: 2, kind: 'b' }, { id: 3, kind: 'c' }]
const schema = defineCollection<Row>({
  scope: 'test:facets', search: (r) => [r.kind],
  facets: [
    { kind: 'enum', id: 'kind', label: 'Tipo', excludable: true, options: [{ value: 'a', label: 'Letra A' }, { value: 'b', label: 'Letra B' }, { value: 'c', label: 'Letra C' }], get: (r) => r.kind },
    { kind: 'enum', id: 'plain', label: 'Simples', options: [{ value: 'a' }], get: (r) => r.kind },
  ],
  groups: [], sorts: [{ id: 'id', label: 'Id', value: (r) => r.id }], defaults: { sortBy: 'id', dir: 'asc' },
})

function Harness() {
  const c = useCollection(schema, rows, { persist: false })
  return (
    <>
      <FilterFacets schema={schema} c={c} items={rows} />
      <output aria-label="ids">{c.result.items.map((r) => r.id).join(',')}</output>
    </>
  )
}
afterEach(cleanup)

describe('FilterFacets', () => {
  it('a faceta excludable oferece "Só estas / Todas menos estas"; a comum não', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Modo: Tipo' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Modo: Simples' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Letra B' }))
    expect(screen.getByLabelText('ids').textContent).toBe('2')
    await user.click(screen.getByRole('button', { name: 'Todas menos estas' }))
    expect(screen.getByLabelText('ids').textContent).toBe('1,3')
  })
})
