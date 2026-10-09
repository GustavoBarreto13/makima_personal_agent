// @vitest-environment jsdom
// Painel de detalhe — o que vai além do básico: tipo, horário (bloco de tempo), coluna do quadro, local (Onde @), modo da
// repetição e as pessoas da Komi (responsáveis e quem se espera).

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { todayISO } from '../../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listTasks: vi.fn(), getTask: vi.fn(), updateTask: vi.fn(), setTimeBlock: vi.fn(), clearTimeBlock: vi.fn(), listColumns: vi.fn(),
  listContexts: vi.fn(), listPeople: vi.fn(), createPerson: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const TODAY = todayISO()
const base = (over: Record<string, unknown> = {}) => ({
  id: 7, project_id: 1, column_id: null, parent_id: null, title: 'Planejar viagem', description: null, type: 'task', priority: 0, due_date: TODAY, due_time: null, position: 1000, completed_at: null,
  created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: 45, tags: [], subtasks: [], project_name: 'Casa', assignees: [], gtd_status: null, recurrence: null, ...over,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [{ id: 1, name: 'Casa', group_id: null, color: null, icon: null, is_inbox: false, position: 1, has_board: true, open_count: 1, context: 'personal' }], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listTasks.mockResolvedValue([])
  api.getTask.mockResolvedValue(base())
  api.updateTask.mockResolvedValue({ status: 'ok' })
  api.setTimeBlock.mockResolvedValue({ status: 'ok' })
  api.clearTimeBlock.mockResolvedValue({ status: 'ok' })
  api.listColumns.mockResolvedValue([{ id: 10, project_id: 1, name: 'A fazer', position: 1, is_done_column: false }, { id: 12, project_id: 1, name: 'Feito', position: 2, is_done_column: true }])
  api.listContexts.mockResolvedValue([{ id: 3, name: '@casa', icon: null, position: 1 }])
  api.listPeople.mockResolvedValue([{ id: 'p-ana', name: 'Ana Souza', avatar_url: null }, { id: 'p-joao', name: 'João Lima', avatar_url: null }])
  api.createPerson.mockResolvedValue({ id: 'p-novo', name: 'Carla', avatar_url: null })
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.focus.active.mockResolvedValue(null)
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#lista/1/t/7'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  await screen.findByLabelText('Título')
  return user
}

describe('Painel — propriedades extras', () => {
  it('trocar o tipo grava na hora', async () => {
    const user = await open()
    await user.click(within(await screen.findByRole('group', { name: 'Tipo' })).getByRole('button', { name: 'Evento' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { type: 'event' }))
  })

  it('marcar horário cria o bloco no dia do vencimento e tirar libera', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Marcar horário' }))
    await waitFor(() => expect(api.setTimeBlock).toHaveBeenCalled())
    const body = api.setTimeBlock.mock.calls[0][1]
    expect(body.start_at.startsWith(`${TODAY}T09:00:00`)).toBe(true)
    expect(body.end_at.startsWith(`${TODAY}T09:45:00`)).toBe(true) // a estimativa de 45 min vira a duração
  })

  it('com bloco: mostra início e fim e o botão de tirar o horário', async () => {
    api.getTask.mockResolvedValue(base({ start_at: `${TODAY}T14:00:00-03:00`, end_at: `${TODAY}T15:30:00-03:00` }))
    const user = await open()
    await screen.findByText('Vira um bloco no calendário e entra na conta do tempo livre.')
    await user.click(screen.getByRole('button', { name: 'Tirar o horário' }))
    await waitFor(() => expect(api.clearTimeBlock).toHaveBeenCalledWith(7))
  })

  it('sem vencimento o horário pede a data primeiro', async () => {
    api.getTask.mockResolvedValue(base({ due_date: null }))
    await open()
    expect(await screen.findByText('Defina a data de vencimento para marcar um horário.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Marcar horário' })).toBeNull()
  })

  it('coluna do quadro e local gravam; sem quadro a coluna nem aparece', async () => {
    const user = await open()
    await user.selectOptions(await screen.findByLabelText('Coluna do quadro'), '10')
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { column_id: 10 }))
    await user.selectOptions(screen.getByLabelText('Onde (@)'), '3')
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { context_id: 3 }))
    cleanup()
    api.sidebar.mockResolvedValue({ groups: [], projects: [{ id: 1, name: 'Casa', group_id: null, color: null, icon: null, is_inbox: false, position: 1, has_board: false, open_count: 1, context: 'personal' }], filters: [] })
    await open()
    expect(screen.queryByLabelText('Coluna do quadro')).toBeNull()
  })

  it('modo da repetição aparece só em tarefas recorrentes e regrava a regra', async () => {
    api.getTask.mockResolvedValue(base({ recurrence: { active: true, rrule: 'FREQ=WEEKLY', mode: 'fixed' }, recurrence_text: 'toda semana' }))
    const user = await open()
    await user.click(await within(await screen.findByRole('group', { name: 'Modo da repetição' })).findByRole('button', { name: 'Após concluir' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { recurrence: { rrule: 'FREQ=WEEKLY', mode: 'after_completion' } }))
  })
})

describe('Painel — pessoas (Komi)', () => {
  it('buscar, escolher e remover responsáveis', async () => {
    api.getTask.mockResolvedValue(base({ assignees: [{ id: 'p-joao', name: 'João Lima', avatar_url: null }] }))
    const user = await open()
    expect(await screen.findByText('João Lima')).toBeTruthy()
    await user.type(screen.getByLabelText('Buscar pessoa'), 'ana')
    await user.click(await screen.findByRole('option', { name: /Ana Souza/ }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { person_ids: ['p-joao', 'p-ana'] }))
    await user.click(screen.getByRole('button', { name: 'Remover João Lima' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { person_ids: [] }))
  })

  it('pessoa nova é cadastrada na Komi e já vinculada', async () => {
    const user = await open()
    await user.type(await screen.findByLabelText('Buscar pessoa'), 'Carla')
    await user.click(await screen.findByRole('button', { name: /Cadastrar/ }))
    await waitFor(() => expect(api.createPerson).toHaveBeenCalledWith('Carla'))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { person_ids: ['p-novo'] }))
  })

  it('aguardando: escolhe de quem se espera e limpa', async () => {
    api.getTask.mockResolvedValue(base({ gtd_status: 'waiting', waiting_person_id: 'p-ana' }))
    const user = await open()
    const field = (await screen.findByText('Aguardando resposta de')).closest('.ds-field')!
    expect(await within(field as HTMLElement).findByText('Ana Souza')).toBeTruthy()
    await user.click(within(field as HTMLElement).getByRole('button', { name: 'Remover Ana Souza' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(7, { waiting_person_id: null }))
  })

  it('se a Komi estiver fora do ar, o painel continua funcionando', async () => {
    api.listPeople.mockRejectedValue(new Error('HTTP 500'))
    await open()
    expect(await screen.findByLabelText('Buscar pessoa')).toBeTruthy()
  })
})
