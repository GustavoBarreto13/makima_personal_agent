// @vitest-environment jsdom
// “Nova tarefa” (formulário completo) e o detalhe centralizado: os campos viram o corpo da criação e a gravação seguinte, o
// texto do título é lido ao vivo, o Meu Dia e as subtarefas entram, e o detalhe abre ao lado ou no centro conforme a preferência.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { todayISO } from '../../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), setTimeBlock: vi.fn(), addToMyDay: vi.fn(),
  listColumns: vi.fn(), listContexts: vi.fn(), listPeople: vi.fn(), createPerson: vi.fn(), activity: vi.fn(), dependencies: vi.fn(), listKanbanViews: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const TODAY = todayISO()
const projects = [
  { id: 1, name: 'Casa', group_id: null, color: null, icon: null, is_inbox: false, position: 1, has_board: true, open_count: 1, context: 'personal' },
  { id: 2, name: 'Inbox', group_id: null, color: null, icon: null, is_inbox: true, position: 0, has_board: false, open_count: 0, context: 'personal' },
]
const task7 = { id: 7, project_id: 1, column_id: null, parent_id: null, title: 'Planejar viagem', description: null, type: 'task', priority: 0, due_date: TODAY, due_time: null, position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], project_name: 'Casa', assignees: [], gtd_status: null, recurrence: null }

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects, filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listTasks.mockResolvedValue([])
  api.getTask.mockResolvedValue(task7)
  api.createTask.mockResolvedValue({ status: 'ok', id: 99 })
  api.updateTask.mockResolvedValue({ status: 'ok' })
  api.setTimeBlock.mockResolvedValue({ status: 'ok' })
  api.addToMyDay.mockResolvedValue({ status: 'ok' })
  api.listColumns.mockResolvedValue([{ id: 10, project_id: 1, name: 'A fazer', position: 1, is_done_column: false }])
  api.listKanbanViews.mockResolvedValue([])
  api.listContexts.mockResolvedValue([{ id: 3, name: '@casa', icon: null, position: 1 }])
  api.listPeople.mockResolvedValue([])
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.focus.active.mockResolvedValue(null)
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const shell = async (hash = '#hoje') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}
const openNew = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard('n')
  return screen.findByRole('dialog', { name: 'Nova tarefa' })
}

describe('Nova tarefa — formulário completo', () => {
  it('tem tipo, prioridade, data, duração, repetição, etiquetas, pessoas, GTD, local, notas e subtarefas', async () => {
    const user = await shell()
    const dlg = await openNew(user)
    for (const name of ['Título', 'Tipo', 'Prioridade', 'Data', 'Duração', 'Repete', 'Etiquetas', 'Classificação GTD', 'Onde (@)', 'Notas', 'Nova subtarefa']) {
      expect(within(dlg).getAllByLabelText(name).length, name).toBeGreaterThan(0)
    }
    expect(within(dlg).getByRole('button', { name: 'Lista' })).toBeTruthy()
  })

  it('lê os tokens do título ao vivo e usa o que o formulário deixou vazio', async () => {
    const user = await shell()
    const dlg = await openNew(user)
    await user.type(within(dlg).getByLabelText('Título'), 'Reunião !alta hoje #trabalho')
    expect(await within(dlg).findByText('Entendi:')).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Criar tarefa' }))
    await waitFor(() => expect(api.createTask).toHaveBeenCalled())
    expect(api.createTask.mock.calls[0][0]).toMatchObject({ title: 'Reunião', priority: 3, due_date: TODAY, tags: ['trabalho'], type: 'task' })
  })

  it('campos do formulário: tipo, prioridade, duração, local, GTD, Meu Dia e subtarefas', async () => {
    const user = await shell()
    const dlg = await openNew(user)
    await user.type(within(dlg).getByLabelText('Título'), 'Visitar vovó')
    await user.click(within(within(dlg).getByRole('group', { name: 'Tipo' })).getByRole('button', { name: 'Evento' }))
    await user.click(within(within(dlg).getByRole('group', { name: 'Prioridade' })).getByRole('button', { name: 'Média' }))
    await user.selectOptions(within(dlg).getByLabelText('Duração'), '45')
    await user.selectOptions(within(dlg).getByLabelText('Onde (@)'), '3')
    await user.selectOptions(within(dlg).getByLabelText('Classificação GTD'), 'someday')
    await user.click(within(dlg).getByRole('switch', { name: 'Colocar no Meu Dia' }))
    await user.type(within(dlg).getByLabelText('Nova subtarefa'), 'Comprar flores{Enter}')
    await user.click(within(dlg).getByRole('button', { name: 'Criar tarefa' }))
    await waitFor(() => expect(api.addToMyDay).toHaveBeenCalledWith(99))
    expect(api.createTask.mock.calls[0][0]).toMatchObject({ title: 'Visitar vovó', type: 'event', priority: 2 })
    expect(api.updateTask).toHaveBeenCalledWith(99, { duration_min: 45, gtd_status: 'someday', context_id: 3 })
    expect(api.createTask.mock.calls[1][0]).toMatchObject({ title: 'Comprar flores', parent_id: 99 })
  })

  it('com data e horário marcados cria o bloco no calendário', async () => {
    const user = await shell()
    const dlg = await openNew(user)
    await user.type(within(dlg).getByLabelText('Título'), 'Dentista hoje')
    await user.click(within(dlg).getByRole('button', { name: 'Marcar horário' }))
    await user.click(within(dlg).getByRole('button', { name: 'Criar tarefa' }))
    await waitFor(() => expect(api.setTimeBlock).toHaveBeenCalled())
    expect(api.createTask.mock.calls[0][0]).toMatchObject({ title: 'Dentista', due_date: TODAY, due_time: '09:00' })
    expect(api.setTimeBlock.mock.calls[0][0]).toBe(99)
    expect(api.setTimeBlock.mock.calls[0][1].start_at.startsWith(`${TODAY}T09:00:00`)).toBe(true)
  })

  it('não cria sem título', async () => {
    const user = await shell()
    const dlg = await openNew(user)
    expect((within(dlg).getByRole('button', { name: 'Criar tarefa' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.createTask).not.toHaveBeenCalled()
  })
})

describe('Detalhe da tarefa: ao lado ou no centro', () => {
  it('por padrão abre ao lado (painel, sem diálogo)', async () => {
    await shell('#lista/1/t/7')
    await screen.findByLabelText('Título')
    expect(screen.queryByRole('dialog', { name: 'Tarefa' })).toBeNull()
    expect(document.querySelector('.kn-panel')).toBeTruthy()
  })

  it('com a preferência “centro” abre num diálogo', async () => {
    localStorage.setItem('ds:prefs:kaguya', JSON.stringify({ detailMode: 'center' }))
    await shell('#lista/1/t/7')
    const dlg = await screen.findByRole('dialog', { name: 'Tarefa' })
    expect(await within(dlg).findByLabelText('Título')).toBeTruthy()
    expect(document.querySelector('.kn-panel')).toBeNull()
  })

  it('o botão do cabeçalho alterna e lembra a escolha', async () => {
    const user = await shell('#lista/1/t/7')
    await screen.findByLabelText('Título')
    await user.click(screen.getByRole('button', { name: 'Abrir no centro da tela' }))
    expect(await screen.findByRole('dialog', { name: 'Tarefa' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('ds:prefs:kaguya') ?? '{}').detailMode).toBe('center')
    await user.click(screen.getByRole('button', { name: 'Abrir ao lado da lista' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tarefa' })).toBeNull())
  })

  it('no quadro Kanban o detalhe sempre abre no centro', async () => {
    api.listTasks.mockResolvedValue([])
    await shell('#kanban/1/t/7')
    expect(await screen.findByRole('dialog', { name: 'Tarefa' })).toBeTruthy()
  })
})

describe('Nova tarefa e Editar centralizado têm o mesmo layout', () => {
  const labelsOf = (root: HTMLElement) => [...root.querySelectorAll('.kn-tf-fields .ds-field > label, .kn-tf-fields .ds-field > .ds-flabel')].map((l) => l.textContent?.trim() ?? '')

  it('campos à esquerda e notas à direita nos dois, na mesma ordem', async () => {
    const user = await shell()
    const dlg = await openNew(user)
    const novos = labelsOf(dlg)
    expect(dlg.querySelector('.kn-tf-wide > .kn-tf-fields')).toBeTruthy()
    expect(dlg.querySelector('.kn-tf-wide > .kn-tf-side')?.textContent).toContain('Notas')
    cleanup()

    localStorage.setItem('ds:prefs:kaguya', JSON.stringify({ detailMode: 'center' }))
    await shell('#lista/1/t/7')
    const edit = await screen.findByRole('dialog', { name: 'Tarefa' })
    await within(edit).findByLabelText('Título')
    const editar = labelsOf(edit)
    expect(edit.querySelector('.kn-tf-wide > .kn-tf-side')?.textContent).toContain('Notas')

    const comuns = novos.filter((l) => editar.includes(l))
    expect(comuns.length).toBeGreaterThan(8)
    expect(editar.filter((l) => novos.includes(l))).toEqual(comuns)
  })
})
