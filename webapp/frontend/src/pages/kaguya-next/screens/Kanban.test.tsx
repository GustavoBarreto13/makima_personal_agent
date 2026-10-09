// @vitest-environment jsdom
// Kanban da lista e quadro do grupo: colunas com contador, cards, filtros, views, estado vazio (criar/copiar colunas),
// modal de coluna (criar e excluir com confirmação), “+ Adicionar tarefa” na coluna e o balde “Sem coluna” do grupo.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listColumns: vi.fn(), listTasks: vi.fn(), listKanbanViews: vi.fn(), kanbanViewBoard: vi.fn(),
  groupBoard: vi.fn(), createColumn: vi.fn(), updateColumn: vi.fn(), deleteColumn: vi.fn(), copyColumns: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(),
  createKanbanView: vi.fn(), getTask: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'
import type { Column, Project, Task } from '../types'

const project = (id: number, name: string, over: Partial<Project> = {}): Project => ({
  id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id, has_board: true, open_count: 0, context: 'personal', ...over,
})
const col = (id: number, name: string, over: Partial<Column> = {}): Column => ({ id, project_id: 1, name, position: id, is_done_column: false, ...over })
const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: 10, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0, due_date: null, due_time: null,
  position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null,
  duration_min: null, tags: [], subtasks: [], project_name: 'Sprint', ...over,
})
const VIEW = { id: 1, name: 'Completa', is_builtin: true, display: { adornos: { capacity_meter: true, subtask_ring: true, summary_footer: true, card_chips: true }, slots: ['abertas', 'tempo_estimado', 'em_andamento'] }, filter: null, position: 0 }

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [{ id: 3, name: 'Sprint', position: 1, context: 'work' }], projects: [project(1, 'Sprint', { group_id: 3 }), project(2, 'Outro', { group_id: 3, has_board: false }), project(9, 'Inbox', { is_inbox: true, has_board: false })], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listKanbanViews.mockResolvedValue([VIEW])
  api.listColumns.mockResolvedValue([col(10, 'A fazer'), col(11, 'Fazendo'), col(12, 'Feito', { is_done_column: true })])
  api.listTasks.mockResolvedValue([
    task({ id: 1, title: 'Escrever spec', priority: 3, duration_min: 90 }),
    task({ id: 2, title: 'Revisar PR', column_id: 11, priority: 1 }),
    task({ id: 3, title: 'Deploy', column_id: 12, completed_at: '2026-06-10T10:00:00-03:00' }),
    task({ id: 4, title: 'Sem coluna', column_id: null }),
  ])
  api.createColumn.mockResolvedValue({ status: 'ok', id: 20 })
  api.deleteColumn.mockResolvedValue({ status: 'ok' })
  api.copyColumns.mockResolvedValue({ status: 'ok' })
  api.createTask.mockResolvedValue({ status: 'ok', id: 77 })
  api.getTask.mockResolvedValue(task({ id: 77 }))
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const at = async (hash: string) => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}
const column = (name: string) => screen.getByRole('region', { name })

describe('Kanban da lista', () => {
  it('mostra as colunas com contador, a órfã na primeira e a concluída na coluna de concluídas', async () => {
    await at('#kanban/1')
    await screen.findByText('Escrever spec')
    expect(within(column('A fazer')).getByText('Escrever spec')).toBeTruthy()
    expect(within(column('A fazer')).getByText('Sem coluna')).toBeTruthy() // órfã acolhida na 1ª coluna
    expect(within(column('A fazer')).getByText('2')).toBeTruthy()
    expect(within(column('Fazendo')).getByText('Revisar PR')).toBeTruthy()
    expect(within(column('Feito')).getByText('Deploy')).toBeTruthy()
    expect(api.listTasks).toHaveBeenCalledWith(1, true)
  })

  it('o rodapé-resumo e a soma de estimativas aparecem', async () => {
    await at('#kanban/1')
    await screen.findByText('Escrever spec')
    expect(screen.getByLabelText('Resumo do quadro')).toBeTruthy()
    expect(within(column('A fazer')).getByText('Σ 1h30')).toBeTruthy()
  })

  it('filtro de prioridade mínima esconde os cards abaixo dela', async () => {
    const user = await at('#kanban/1')
    await screen.findByText('Escrever spec')
    await user.click(screen.getByRole('button', { name: 'Alta' }))
    expect(screen.queryByText('Revisar PR')).toBeNull()
    expect(screen.getByText('Escrever spec')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(screen.getByText('Revisar PR')).toBeTruthy()
  })

  it('clicar no card abre a tarefa no painel', async () => {
    const user = await at('#kanban/1')
    await user.click(await screen.findByText('Revisar PR'))
    expect(window.location.hash).toContain('/t/2')
  })

  it('“+ Adicionar tarefa” numa coluna cria direto nela', async () => {
    const user = await at('#kanban/1')
    await screen.findByText('Revisar PR')
    await user.click(within(column('Fazendo')).getByRole('button', { name: /Adicionar tarefa/ }))
    const input = await screen.findByLabelText('Adicionar tarefa')
    await user.type(input, 'Nova coisa{Enter}')
    await waitFor(() => expect(api.createTask).toHaveBeenCalled())
    expect(api.createTask.mock.calls[0][0]).toMatchObject({ title: 'Nova coisa', project_id: 1, column_id: 11 })
  })

  it('a coluna de concluídas não oferece “Adicionar tarefa”', async () => {
    await at('#kanban/1')
    await screen.findByText('Deploy')
    expect(within(column('Feito')).queryByRole('button', { name: /Adicionar tarefa/ })).toBeNull()
  })

  it('nova coluna e excluir coluna (com confirmação)', async () => {
    const user = await at('#kanban/1')
    await screen.findByText('Revisar PR')
    await user.click(screen.getByRole('button', { name: 'Coluna' }))
    await user.type(await screen.findByLabelText('Nome'), 'Revisão')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createColumn).toHaveBeenCalledWith({ project_id: 1, name: 'Revisão', is_done_column: false }))
    await user.click(screen.getByRole('button', { name: 'Editar a coluna Fazendo' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir coluna' }))
    expect(api.deleteColumn).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir coluna' }))
    await waitFor(() => expect(api.deleteColumn).toHaveBeenCalledWith(11))
  })

  it('nome vazio na coluna avisa sem chamar a API', async () => {
    const user = await at('#kanban/1')
    await screen.findByText('Revisar PR')
    await user.click(screen.getByRole('button', { name: 'Coluna' }))
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Dê um nome à coluna.')).toBeTruthy()
    expect(api.createColumn).not.toHaveBeenCalled()
  })

  it('view: criar uma nova com nome e salvar', async () => {
    const user = await at('#kanban/1')
    await screen.findByText('Revisar PR')
    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.type(await screen.findByLabelText('Nome'), 'Mínima')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createKanbanView).toHaveBeenCalled())
    expect(api.createKanbanView.mock.calls[0][0]).toMatchObject({ name: 'Mínima', filter: null })
  })

  it('sem colunas: convida a criar e permite copiar de outro quadro', async () => {
    api.listColumns.mockResolvedValue([])
    api.listTasks.mockResolvedValue([])
    api.sidebar.mockResolvedValue({ groups: [], projects: [project(1, 'Vazia', { has_board: false }), project(5, 'Modelo')], filters: [] })
    const user = await at('#kanban/1')
    expect(await screen.findByText('Sem quadro ainda')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Copiar colunas de'), '5')
    await user.click(screen.getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(api.copyColumns).toHaveBeenCalledWith(1, 5))
    await user.click(screen.getByRole('button', { name: 'Criar coluna do zero' }))
    expect(await screen.findByText('Nova coluna')).toBeTruthy()
  })

  it('erro ao carregar mostra tentar de novo', async () => {
    api.listColumns.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue([col(10, 'A fazer')])
    api.listTasks.mockResolvedValue([])
    const user = await at('#kanban/1')
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByRole('region', { name: 'A fazer' })).toBeTruthy()
  })
})

describe('Quadro do grupo', () => {
  const BOARD = {
    group: { id: 3, name: 'Sprint' },
    lists: [{ id: 1, name: 'Sprint', color: null, icon: null }, { id: 2, name: 'Outro', color: null, icon: null }],
    columns: [
      { key: 'a fazer', name: 'A fazer', is_done: false, position: 1, members: [{ project_id: 1, column_id: 10 }] },
      { key: 'feito', name: 'Feito', is_done: true, position: 2, members: [{ project_id: 1, column_id: 12 }] },
    ],
    tasks: [task({ id: 1, title: 'Da lista 1' }), task({ id: 5, title: 'Sem quadro', project_id: 2, column_id: null })],
  }

  it('colunas unificadas, nome da lista no card e o balde “Sem coluna”', async () => {
    api.groupBoard.mockResolvedValue(BOARD)
    await at('#grupo/3')
    expect(await screen.findByText('Da lista 1')).toBeTruthy()
    expect(within(column('A fazer')).getByText('1 lista(s)')).toBeTruthy()
    expect(within(column('Sem coluna')).getByText('Sem quadro')).toBeTruthy()
    expect(within(column('Sem coluna')).getByText('Outro')).toBeTruthy()
  })

  it('“+ Adicionar tarefa” restringe a lista às membros da coluna', async () => {
    api.groupBoard.mockResolvedValue(BOARD)
    const user = await at('#grupo/3')
    await screen.findByText('Da lista 1')
    await user.click(within(column('A fazer')).getByRole('button', { name: /Adicionar tarefa/ }))
    const select = await screen.findByLabelText('Lista')
    expect(within(select).queryByRole('option', { name: 'Outro' })).toBeNull()
    expect(within(select).getByRole('option', { name: 'Sprint' })).toBeTruthy()
  })

  it('“Ver como lista” abre a lista do grupo com as tarefas de todas as listas', async () => {
    api.groupBoard.mockResolvedValue(BOARD)
    api.listTasks.mockImplementation(async (id: number) => (id === 1 ? [task({ id: 1, title: 'Da lista 1' })] : [task({ id: 5, project_id: 2, title: 'Da lista 2' })]))
    const user = await at('#grupo/3')
    await screen.findByText('Da lista 1')
    await user.click(screen.getByRole('button', { name: 'Ver como lista' }))
    expect(await screen.findByText('Da lista 2')).toBeTruthy()
    expect(window.location.hash).toBe('#grupo-lista/3')
    expect(api.listTasks).toHaveBeenCalledWith(1, false)
    expect(api.listTasks).toHaveBeenCalledWith(2, false)
  })

  it('grupo sem listas e grupo sem quadros explicam o que fazer', async () => {
    api.groupBoard.mockResolvedValue({ ...BOARD, lists: [], columns: [], tasks: [] })
    await at('#grupo/3')
    expect(await screen.findByText('Grupo vazio')).toBeTruthy()
    cleanup()
    api.groupBoard.mockResolvedValue({ ...BOARD, columns: [], tasks: [] })
    await at('#grupo/3')
    expect(await screen.findByText('Nenhuma lista tem quadro Kanban')).toBeTruthy()
  })
})
