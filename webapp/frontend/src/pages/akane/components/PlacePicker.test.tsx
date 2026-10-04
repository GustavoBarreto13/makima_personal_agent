// @vitest-environment jsdom
// O campo "Onde assisti": busca nos locais, cadastra cinema/streaming na hora e seleciona.

import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WatchLocation } from '../types'

const api = vi.hoisted(() => ({ createWatchLocation: vi.fn() }))
vi.mock('../akaneApi', () => ({ akaneApi: api }))

import { AkaneContext, type AkaneCtx } from '../context'
import { PlacePicker } from './PlacePicker'

const LOCS: WatchLocation[] = [{ id: 'l1', name: 'Cinemark', kind: 'cinema' }, { id: 'l2', name: 'Netflix', kind: 'streaming' }]
const reload = vi.fn()
const onChange = vi.fn()

const ctx = (locations: WatchLocation[]): AkaneCtx => ({
  rev: 0, reload, today: '2026-10-04', route: { view: 'home' }, goto: vi.fn(), locations, prefs: { art: 'noir', layout: 'grid', yearlyGoal: 60 },
  setPrefs: vi.fn(), openLog: vi.fn(), save: vi.fn(), quickLog: vi.fn(),
})

function Harness({ initial = null, initialQuery = '', locations = LOCS, known }: { initial?: string | null; initialQuery?: string; locations?: WatchLocation[]; known?: WatchLocation[] }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <AkaneContext.Provider value={ctx(locations)}>
      <PlacePicker value={value} initialQuery={initialQuery} known={known} onChange={(id) => { onChange(id); setValue(id) }} />
    </AkaneContext.Provider>
  )
}

const field = () => screen.getByLabelText('Buscar ou cadastrar local')

beforeEach(() => {
  reload.mockClear(); onChange.mockClear(); api.createWatchLocation.mockReset()
  api.createWatchLocation.mockImplementation(async (name: string, kind: string) => ({ status: 'ok', created: true, location: { id: 'l-new', name, kind } }))
})
afterEach(cleanup)

describe('PlacePicker', () => {
  it('ao focar lista todos os locais, com o tipo de cada um', async () => {
    render(<Harness />)
    await userEvent.click(field())
    const list = screen.getByRole('listbox', { name: 'Locais' })
    expect(within(list).getByRole('option', { name: /Cinemark.*Cinema/ })).toBeTruthy()
    expect(within(list).getByRole('option', { name: /Netflix.*Streaming/ })).toBeTruthy()
  })

  it('digitar filtra (sem acento nem caixa) e clicar escolhe, mostrando o chip com ×', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'NET')
    expect(screen.queryByRole('option', { name: /Cinemark/ })).toBeNull()
    await userEvent.click(screen.getByRole('option', { name: /Netflix/ }))
    expect(onChange).toHaveBeenCalledWith('l2')
    expect(screen.getByRole('button', { name: 'Remover Netflix' })).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()                          // a lista fecha ao escolher
  })

  it('nome novo oferece cadastrar como Cinema ou Streaming', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'Kinoplex')
    expect(screen.getByText('Cadastrar “Kinoplex” como:')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cinema' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Streaming' })).toBeTruthy()
  })

  it('"Cinema" cadastra na hora com o tipo certo, seleciona o novo e pede a lista nova ao shell', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'Kinoplex')
    await userEvent.click(screen.getByRole('button', { name: 'Cinema' }))
    await waitFor(() => expect(api.createWatchLocation).toHaveBeenCalledWith('Kinoplex', 'cinema'))
    expect(onChange).toHaveBeenCalledWith('l-new')
    expect(reload).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remover Kinoplex' })).toBeTruthy()   // chip já aparece, antes da lista do shell chegar
  })

  it('"Streaming" cadastra como streaming', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'Disney+')
    await userEvent.click(screen.getByRole('button', { name: 'Streaming' }))
    await waitFor(() => expect(api.createWatchLocation).toHaveBeenCalledWith('Disney+', 'streaming'))
    expect(onChange).toHaveBeenCalledWith('l-new')
  })

  it('erro do servidor aparece embaixo do campo e não seleciona nada', async () => {
    api.createWatchLocation.mockRejectedValue(new Error('Esse local ja existe com outro tipo.'))
    render(<Harness />)
    await userEvent.type(field(), 'Kinoplex')
    await userEvent.click(screen.getByRole('button', { name: 'Cinema' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/outro tipo/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('nome igual a um local existente não oferece cadastrar de novo', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'cinemark')
    expect(screen.queryByText(/Cadastrar “/)).toBeNull()
    expect(screen.getByRole('option', { name: /Cinemark/ })).toBeTruthy()
  })

  it('o × limpa o local escolhido', async () => {
    render(<Harness initial="l1" />)
    expect(screen.getByRole('button', { name: 'Remover Cinemark' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remover Cinemark' }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(screen.queryByRole('button', { name: 'Remover Cinemark' })).toBeNull()
  })

  it('o local que o chamador já conhece aparece no chip mesmo sem a lista do shell (sessão em edição)', () => {
    render(<Harness initial="l1" locations={[]} known={[LOCS[0]]} />)
    expect(screen.getByRole('button', { name: 'Remover Cinemark' })).toBeTruthy()
  })

  it('Esc fecha a lista', async () => {
    render(<Harness />)
    await userEvent.click(field())
    expect(screen.getByRole('listbox')).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('abre já com o texto que a linha rápida não reconheceu (@kinoplex) e os botões à mostra', () => {
    render(<Harness initialQuery="kinoplex" />)
    expect((field() as HTMLInputElement).value).toBe('kinoplex')
    expect(screen.getByRole('button', { name: 'Cinema' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Streaming' })).toBeTruthy()
  })

  it('sem nenhum local cadastrado, convida a cadastrar o primeiro', async () => {
    render(<Harness locations={[]} />)
    await userEvent.click(field())
    expect(screen.getByText(/Nenhum local cadastrado ainda/)).toBeTruthy()
  })
})
