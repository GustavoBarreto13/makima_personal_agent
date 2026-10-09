// @vitest-environment jsdom
// Ajustes: o menu lateral (mostrar/fixar), as abas do celular (até 3), a exibição e a gaveta de Preferências enxuta, que leva
// à página de Ajustes.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn(), update: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.focus.active.mockResolvedValue(null)
  api.schedule.get.mockResolvedValue({ work_days: [1, 2, 3, 4, 5], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const stored = () => JSON.parse(localStorage.getItem('ds:prefs:kaguya') ?? '{}')
const open = async () => {
  window.location.hash = '#ajustes'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Exibição' })
  return user
}

describe('Ajustes', () => {
  it('mostra as quatro seções, com a agenda de trabalho', async () => {
    await open()
    for (const name of ['Exibição', 'Agenda de trabalho', 'Menu lateral', 'Barra do celular']) expect(screen.getByRole('heading', { name })).toBeTruthy()
    expect(await screen.findByRole('group', { name: 'Dias de trabalho' })).toBeTruthy()
  })

  it('esconder e fixar itens do menu', async () => {
    const user = await open()
    const plan = screen.getByRole('group', { name: 'Planejar' })
    await user.click(within(plan).getByRole('switch', { name: 'Mostrar Eisenhower' }))
    await waitFor(() => expect(stored().hiddenNav).toEqual(['eisenhower']))
    await user.click(within(plan).getByRole('button', { name: 'Fixar Calendário' }))
    await waitFor(() => expect(stored().pinnedNav).toEqual(['calendar']))
    expect(within(plan).getByRole('button', { name: 'Desafixar Calendário' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('a barra do celular aceita no máximo 3 abas', async () => {
    const user = await open()
    const tabs = screen.getByRole('group', { name: 'Abas do celular' })
    // O padrão já são 3 (Meu Dia, Inbox, Calendário): tirar uma libera vaga.
    expect(within(tabs).getAllByRole('button', { pressed: true })).toHaveLength(3)
    await user.click(within(tabs).getByRole('button', { name: 'Calendário' }))
    await waitFor(() => expect(stored().mobileTabs).toEqual(['today', 'date:inbox']))
    await user.click(within(tabs).getByRole('button', { name: 'Hábitos' }))
    await user.click(within(tabs).getByRole('button', { name: 'Metas' }))
    expect(stored().mobileTabs).toEqual(['today', 'date:inbox', 'habits'])
  })

  it('abrir a tarefa no centro e o estilo do calendário ficam salvos', async () => {
    const user = await open()
    await user.click(within(screen.getByRole('group', { name: 'Abrir a tarefa' })).getByRole('button', { name: 'No centro' }))
    await user.click(within(screen.getByRole('group', { name: 'Estilo dos eventos' })).getByRole('button', { name: 'Sólido' }))
    await waitFor(() => expect(stored()).toMatchObject({ detailMode: 'center', calVariant: 'helvetico' }))
  })
})

describe('Gaveta de Preferências', () => {
  it('traz só o rápido e leva aos Ajustes', async () => {
    window.location.hash = '#hoje'
    const user = userEvent.setup()
    render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
    await user.keyboard('?')
    const sheet = await screen.findByRole('dialog', { name: 'Preferências' })
    expect(within(sheet).getByText('Largura do conteúdo')).toBeTruthy()
    expect(within(sheet).getByText('Abrir a tarefa')).toBeTruthy()
    expect(within(sheet).queryByText('Dias de trabalho')).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Abrir Ajustes' }))
    await waitFor(() => expect(window.location.hash).toBe('#ajustes'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Preferências' })).toBeNull())
  })
})
