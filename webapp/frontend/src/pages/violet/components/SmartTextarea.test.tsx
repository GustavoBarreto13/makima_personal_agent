// @vitest-environment jsdom
// Editar um momento com chips: o campo mostra só o nome, mas o texto guardado mantém os tokens.

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../violetApi', () => ({ violetApi: { refProviders: vi.fn(async () => []), refSearch: vi.fn() } }))
vi.mock('../lib/people', () => ({ searchPeople: vi.fn(async () => []), createPerson: vi.fn() }))

import { SmartTextarea } from './SmartTextarea'

const RAW = 'ver o doc [Always Lalisa](akane:movie:83) com a @[Carla](komi:26)'

function Harness({ initial, onRaw }: { initial: string; onRaw: (s: string) => void }) {
  const [v, setV] = useState(initial)
  return <SmartTextarea aria-label="Momento" className="vl-bullet-input" value={v} onChange={(s) => { setV(s); onRaw(s) }} />
}

afterEach(cleanup)

describe('SmartTextarea com chips', () => {
  it('mostra o nome bonito e pinta o chip no espelho', () => {
    const { container } = render(<Harness initial={RAW} onRaw={() => {}} />)
    expect((screen.getByLabelText('Momento') as HTMLTextAreaElement).value).toBe('ver o doc Always Lalisa com a Carla')
    expect([...container.querySelectorAll('.vl-smart-chip')].map((m) => m.textContent)).toEqual(['Always Lalisa', 'Carla'])
  })
  it('digitar no fim mantém os tokens', async () => {
    const onRaw = vi.fn()
    render(<Harness initial={RAW} onRaw={onRaw} />)
    const el = screen.getByLabelText('Momento') as HTMLTextAreaElement
    await userEvent.click(el)
    el.setSelectionRange(el.value.length, el.value.length)
    await userEvent.keyboard(' ontem')
    expect(onRaw).toHaveBeenLastCalledWith(`${RAW} ontem`)
  })
  it('Backspace colado no chip apaga o chip inteiro', async () => {
    const onRaw = vi.fn()
    render(<Harness initial={RAW} onRaw={onRaw} />)
    const el = screen.getByLabelText('Momento') as HTMLTextAreaElement
    await userEvent.click(el)
    el.setSelectionRange(el.value.length, el.value.length)
    await userEvent.keyboard('{Backspace}')
    expect(onRaw).toHaveBeenLastCalledWith('ver o doc [Always Lalisa](akane:movie:83) com a ')
    expect(el.value).toBe('ver o doc Always Lalisa com a ')
  })
})
