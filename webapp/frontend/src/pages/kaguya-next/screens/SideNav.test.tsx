// @vitest-environment jsdom
// Barra lateral: grupos que recolhem (e lembram), o nome do grupo abre o quadro, grupos sem listas aparecem, a lista mostra
// o ícone próprio e não existe mais o item “Visão do grupo”.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listTasks: vi.fn(), groupBoard: vi.fn(), updateProject: vi.fn(), updateGroup: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const P = (id: number, name: string, group_id: number | null, extra: Record<string, unknown> = {}) => ({ id, name, group_id, color: null, icon: null, is_inbox: false, position: id, has_board: false, open_count: 2, context: 'personal', ...extra })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({
    groups: [{ id: 1, name: 'Casa', position: 1 }, { id: 2, name: 'Vazio', position: 2 }],
    projects: [P(5, 'Inbox', null, { is_inbox: true }), P(10, 'Reforma', 1, { icon: '🔨' }), P(11, 'Mercado', 1), P(12, 'Solta', null)],
    filters: [],
  })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listTasks.mockResolvedValue([])
  api.groupBoard.mockResolvedValue({ lists: [], columns: [], tasks: [] })
  api.focus.active.mockResolvedValue(null)
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#hoje'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  await screen.findByRole('button', { name: 'Abrir o quadro de Casa' }, { timeout: 4000 }).catch(() => undefined)
  return user
}
const side = () => screen.getByRole('navigation', { name: 'Seções' })

describe('Barra lateral', () => {
  it('mostra os grupos (até os vazios), as listas dentro deles e o ícone da lista', async () => {
    await open()
    await waitFor(() => expect(within(side()).getByText('Reforma')).toBeTruthy())
    expect(within(side()).getByText('Vazio')).toBeTruthy()
    expect(within(side()).getByText('Mercado')).toBeTruthy()
    expect(within(side()).getByText('Solta')).toBeTruthy()
    expect(within(side()).getByText('🔨')).toBeTruthy()
    expect(within(side()).queryByText('Visão do grupo')).toBeNull()
  })

  it('o nome do grupo abre o quadro dele', async () => {
    const user = await open()
    await user.click(await within(side()).findByTitle('Abrir o quadro de Casa'))
    await waitFor(() => expect(window.location.hash).toBe('#grupo/1'))
  })

  it('recolher o grupo esconde as listas e a escolha fica salva', async () => {
    const user = await open()
    await within(side()).findByText('Reforma')
    await user.click(within(side()).getByRole('button', { name: 'Recolher Casa' }))
    expect(within(side()).queryByText('Reforma')).toBeNull()
    expect(within(side()).getByRole('button', { name: 'Expandir Casa' }).getAttribute('aria-expanded')).toBe('false')
    expect(JSON.parse(localStorage.getItem('ds:prefs:kaguya') ?? '{}').collapsedGroups).toEqual([1])
  })

  it('“Recolher todos” e “Expandir todos”', async () => {
    const user = await open()
    await within(side()).findByText('Reforma')
    await user.click(within(side()).getByRole('button', { name: 'Recolher todos os grupos' }))
    expect(within(side()).queryByText('Reforma')).toBeNull()
    await user.click(within(side()).getByRole('button', { name: 'Expandir todos os grupos' }))
    expect(within(side()).getByText('Reforma')).toBeTruthy()
  })

  it('as visões ganham alça para ordenar', async () => {
    await open()
    await within(side()).findByText('Reforma')
    expect(within(side()).getAllByRole('button', { name: 'Mover na barra lateral' }).length).toBeGreaterThan(4)
  })
})
