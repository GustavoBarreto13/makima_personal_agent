// @vitest-environment jsdom
// Eisenhower: quadrantes derivados de prioridade × urgência, filtro por lista, concluir pelo checkbox e estados vazio/erro.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { addDaysISO, todayISO } from '../../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), eisenhower: vi.fn(), updateTask: vi.fn(), bulk: vi.fn(), getTask: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'
import type { Task } from '../types'

const TODAY = todayISO()
const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: null, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0, due_date: null, due_time: null,
  position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], ...over,
})
const proj = (id: number, name: string) => ({ id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id, has_board: false, open_count: 0, context: 'personal' })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [], projects: [proj(1, 'Casa'), proj(2, 'Banco')], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.eisenhower.mockResolvedValue([
    task({ id: 1, title: 'Declarar imposto', priority: 3, due_date: addDaysISO(TODAY, 1) }),
    task({ id: 2, title: 'Planejar viagem', priority: 2, due_date: addDaysISO(TODAY, 20), project_id: 2 }),
    task({ id: 3, title: 'Responder e-mail', priority: 0, due_date: addDaysISO(TODAY, -1) }),
    task({ id: 4, title: 'Ler artigo' }),
  ])
  api.bulk.mockResolvedValue({ status: 'ok', undo_token: null, changed: 1 })
  api.getTask.mockResolvedValue(task({ id: 1 }))
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#eisenhower'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}
const quad = (name: string) => screen.getByRole('region', { name })

describe('Eisenhower', () => {
  it('distribui as tarefas nos quatro quadrantes', async () => {
    await open()
    await screen.findByText('Declarar imposto')
    expect(within(quad('Faça agora')).getByText('Declarar imposto')).toBeTruthy()
    expect(within(quad('Agende')).getByText('Planejar viagem')).toBeTruthy()
    expect(within(quad('Resolva rápido')).getByText('Responder e-mail')).toBeTruthy()
    expect(within(quad('Depois')).getByText('Ler artigo')).toBeTruthy()
    expect(api.eisenhower).toHaveBeenCalledWith(undefined)
  })

  it('filtra por lista', async () => {
    const user = await open()
    await screen.findByText('Declarar imposto')
    await user.selectOptions(screen.getByLabelText('Filtrar por lista'), '2')
    expect(screen.queryByText('Declarar imposto')).toBeNull()
    expect(screen.getByText('Planejar viagem')).toBeTruthy()
  })

  it('o checkbox conclui sem abrir a tarefa', async () => {
    const user = await open()
    await user.click(await screen.findByRole('checkbox', { name: 'Concluir “Ler artigo”' }))
    await waitFor(() => expect(api.bulk).toHaveBeenCalled())
    expect(window.location.hash).not.toContain('/t/')
  })

  it('clicar no título abre a tarefa', async () => {
    const user = await open()
    await user.click(await screen.findByText('Ler artigo'))
    expect(window.location.hash).toContain('/t/4')
  })

  it('sem tarefas mostra o estado vazio; erro oferece tentar de novo', async () => {
    api.eisenhower.mockResolvedValueOnce([])
    await open()
    expect(await screen.findByText('Nada para priorizar')).toBeTruthy()
    cleanup()
    api.eisenhower.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByText('Declarar imposto')).toBeTruthy()
  })
})
