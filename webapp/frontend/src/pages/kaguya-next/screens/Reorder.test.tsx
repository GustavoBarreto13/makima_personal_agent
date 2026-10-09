// @vitest-environment jsdom
// Reordenar e aninhar na lista: Alt + setas e o menu da linha (o mesmo que arrastar), o “Desfazer” e a regra de só valer na
// ordem manual e sem agrupar/filtrar. O arrastar com ponteiro usa a mesma lógica pura (lib/reorder.test.ts).

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listTasks: vi.fn(), moveTask: vi.fn(), completed: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const t = (id: number, title: string, over: Record<string, unknown> = {}) => ({ id, project_id: 1, column_id: null, parent_id: null, title, description: null, type: 'task', priority: 0, due_date: null, due_time: null, position: id * 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], ...over })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [{ id: 1, name: 'Casa', group_id: null, color: null, icon: null, is_inbox: false, position: 1, has_board: false, open_count: 3, context: 'personal' }], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.focus.active.mockResolvedValue(null)
  api.listTasks.mockImplementation(async (_id: number, includeCompleted: boolean) => (includeCompleted ? [] : [t(1, 'Primeira'), t(2, 'Segunda'), t(3, 'Terceira')]))
  api.completed.mockResolvedValue({ items: [], total: 0, by_day: {} })
  api.moveTask.mockResolvedValue({ status: 'ok' })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async (hash = '#lista/1') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}
const row = (title: string) => screen.getByText(title).closest('li')!

describe('Reordenar na lista', () => {
  it('cada linha tem a alça de arrastar', async () => {
    await open()
    await screen.findByText('Primeira')
    expect(within(row('Segunda')).getByRole('button', { name: /Arrastar “Segunda”/ })).toBeTruthy()
  })

  it('Alt + ↓ desce a tarefa em foco; Alt + → a torna subtarefa da anterior', async () => {
    const user = await open()
    await screen.findByText('Primeira')
    const tree = screen.getByRole('tree', { name: 'Tarefas' })
    tree.focus()
    await user.keyboard('{ArrowDown}{Alt>}{ArrowDown}{/Alt}')
    await waitFor(() => expect(api.moveTask).toHaveBeenCalledWith(1, { new_parent_id: null, after_id: 2, before_id: 3 }))
    api.moveTask.mockClear()
    await user.keyboard('{ArrowDown}{ArrowDown}{Alt>}{ArrowRight}{/Alt}')
    await waitFor(() => expect(api.moveTask).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ new_parent_id: expect.any(Number) })))
  })

  it('o menu da linha tem subir, descer, indentar e desindentar, com as pontas desabilitadas', async () => {
    const user = await open()
    await screen.findByText('Primeira')
    await user.click(within(row('Primeira')).getByRole('button', { name: /Ações de “Primeira”/ }))
    const menu = await screen.findByRole('menu')
    expect((within(menu).getByRole('menuitem', { name: 'Subir' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(menu).getByRole('menuitem', { name: 'Tornar subtarefa da anterior' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(menu).getByRole('menuitem', { name: 'Descer' }))
    await waitFor(() => expect(api.moveTask).toHaveBeenCalledWith(1, { new_parent_id: null, after_id: 2, before_id: 3 }))
  })

  it('indentar a terceira a torna subtarefa da segunda; o Desfazer devolve ao lugar', async () => {
    const user = await open()
    await screen.findByText('Terceira')
    await user.click(within(row('Terceira')).getByRole('button', { name: /Ações de “Terceira”/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Tornar subtarefa da anterior' }))
    await waitFor(() => expect(api.moveTask).toHaveBeenCalledWith(3, { new_parent_id: 2, after_id: undefined }))
    api.moveTask.mockClear()
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.moveTask).toHaveBeenCalledWith(3, { new_parent_id: null, after_id: 2, before_id: undefined }))
  })

  it('erro ao mover avisa em vez de calar', async () => {
    api.moveTask.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open()
    await screen.findByText('Primeira')
    await user.click(within(row('Segunda')).getByRole('button', { name: /Ações de “Segunda”/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Subir' }))
    expect(await screen.findByText('Não foi possível mover a tarefa.')).toBeTruthy()
  })

  it('fora da ordem manual a alça some (arrastar não faria sentido)', async () => {
    const user = await open()
    await screen.findByText('Primeira')
    expect(screen.getAllByRole('button', { name: /Arrastar/ }).length).toBe(3)
    await user.click(screen.getByRole('button', { name: /^Ordenar:/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Prioridade' }))
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /Arrastar/ }).length).toBe(0))
  })
})
