// @vitest-environment jsdom
// Telas de registro: Concluídas (por dia), Lixeira (restaurar / excluir de vez / esvaziar com confirmação),
// Arquivadas, Templates e Etiquetas — cada uma com os estados vazio, erro e dados.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), completed: vi.fn(), trashDetailed: vi.fn(), deletedProjects: vi.fn(),
  trashRestore: vi.fn(), trashPurge: vi.fn(), trashEmpty: vi.fn(), restoreDeletedProject: vi.fn(), listArchivedProjects: vi.fn(), restoreProject: vi.fn(),
  templates: vi.fn(), applyTemplate: vi.fn(), deleteTemplate: vi.fn(), tagCounts: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn(), mergeTags: vi.fn(),
  bulk: vi.fn(), getTask: vi.fn(), activity: vi.fn(), dependencies: vi.fn(), search: vi.fn(),
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'
import type { Project, Task } from '../types'

const project = (id: number, name: string, over: Partial<Project> = {}): Project => ({
  id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id, has_board: false, open_count: 0, context: 'personal', ...over,
})
const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: null, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0, due_date: null, due_time: null,
  position: 1000, completed_at: '2026-06-10T15:00:00-03:00', created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null,
  duration_min: null, tags: [], subtasks: [], project_name: 'Inbox', ...over,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [], projects: [project(1, 'Inbox', { is_inbox: true })], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.completed.mockResolvedValue({ items: [], total: 0, by_day: {} })
  api.trashDetailed.mockResolvedValue([])
  api.deletedProjects.mockResolvedValue([])
  api.listArchivedProjects.mockResolvedValue([])
  api.templates.mockResolvedValue([])
  api.tagCounts.mockResolvedValue([])
  api.trashRestore.mockResolvedValue({ status: 'ok', restored: 1 })
  api.trashPurge.mockResolvedValue({ status: 'ok', purged: 1 })
  api.trashEmpty.mockResolvedValue({ status: 'ok', purged: 2 })
  api.restoreProject.mockResolvedValue({ status: 'ok' })
  api.applyTemplate.mockResolvedValue({ status: 'ok', id: 70 })
  api.deleteTemplate.mockResolvedValue({ status: 'ok' })
  api.updateTag.mockResolvedValue({ status: 'ok' })
  api.deleteTag.mockResolvedValue({ status: 'ok' })
  api.mergeTags.mockResolvedValue({ status: 'ok' })
  api.getTask.mockResolvedValue(task({ id: 70, completed_at: null }))
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

describe('Concluídas', () => {
  it('vazio explica; com dados agrupa por dia e mostra a contagem do dia', async () => {
    await at('#concluidas')
    expect(await screen.findByText('Nenhuma tarefa concluída ainda')).toBeTruthy()
    cleanup()
    api.completed.mockResolvedValue({
      items: [{ ...task({ id: 5, title: 'Pagar luz' }), completed_day: '2026-06-10' }, { ...task({ id: 6, title: 'Lavar louça' }), completed_day: '2026-06-10' }, { ...task({ id: 7, title: 'Ler' }), completed_day: '2026-06-09' }],
      total: 3, by_day: { '2026-06-10': 2, '2026-06-09': 1 },
    })
    await at('#concluidas')
    expect(await screen.findByText('Pagar luz')).toBeTruthy()
    expect(screen.getByText('2 concluídas')).toBeTruthy()
    expect(screen.getByText('1 concluída')).toBeTruthy()
  })

  it('erro mostra "tentar de novo"', async () => {
    api.completed.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue({ items: [], total: 0, by_day: {} })
    const user = await at('#concluidas')
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByText('Nenhuma tarefa concluída ainda')).toBeTruthy()
  })
})

describe('Lixeira', () => {
  const ITEM = { ...task({ id: 30, title: 'Rascunho', completed_at: null, deleted_at: '2026-06-09T12:00:00-03:00' }), project_name: 'Inbox', descendants: 2 }

  it('mostra origem, subtarefas e restaura um item', async () => {
    api.trashDetailed.mockResolvedValue([ITEM])
    const user = await at('#lixeira')
    expect(await screen.findByText('Rascunho')).toBeTruthy()
    expect(screen.getByText(/\+2 subtarefas/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(api.trashRestore).toHaveBeenCalledWith([30]))
  })

  it('excluir de vez e esvaziar pedem confirmação antes', async () => {
    api.trashDetailed.mockResolvedValue([ITEM])
    const user = await at('#lixeira')
    await user.click(await screen.findByRole('button', { name: /Excluir “Rascunho” de vez/ }))
    expect(api.trashPurge).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Excluir de vez' }))
    await waitFor(() => expect(api.trashPurge).toHaveBeenCalledWith([30]))
    await user.click(await screen.findByRole('button', { name: 'Esvaziar' }))
    expect(api.trashEmpty).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Esvaziar' }))
    await waitFor(() => expect(api.trashEmpty).toHaveBeenCalled())
  })

  it('vazia mostra o estado vazio', async () => {
    await at('#lixeira')
    expect(await screen.findByText('A lixeira está vazia')).toBeTruthy()
  })
})

describe('Arquivadas, Templates e Etiquetas', () => {
  it('arquivadas restaura a lista', async () => {
    api.listArchivedProjects.mockResolvedValue([{ id: 9, name: 'Antiga', group_id: null, color: null, icon: null, archived_at: '2026-01-01', task_count: 4 }])
    const user = await at('#arquivadas')
    expect(await screen.findByText('4 tarefas')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(api.restoreProject).toHaveBeenCalledWith(9))
  })

  it('templates: usar aplica na lista escolhida e abre a tarefa criada', async () => {
    api.templates.mockResolvedValue([{ id: 4, kind: 'task', name: 'Rotina de viagem', context: 'personal', created_at: '2026-06-01T00:00:00Z' }])
    const user = await at('#templates')
    await screen.findByText('Rotina de viagem')
    await user.click(screen.getByRole('button', { name: 'Usar' }))
    await waitFor(() => expect(api.applyTemplate).toHaveBeenCalledWith(4, { project_id: 1 }))
    await waitFor(() => expect(window.location.hash).toContain('/t/70'))
  })

  it('etiquetas: contagem, renomear, mesclar e excluir (com confirmação)', async () => {
    api.tagCounts.mockResolvedValue([
      { id: 1, name: 'foco', color: null, open_count: 3, total_count: 8 },
      { id: 2, name: 'focus', color: null, open_count: 1, total_count: 1 },
    ])
    const user = await at('#etiquetas')
    expect(await screen.findByText('3 abertas · 8 no total')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Renomear #focus' }))
    const input = screen.getByLabelText('Novo nome da etiqueta')
    await user.clear(input)
    await user.type(input, 'foco-total')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.updateTag).toHaveBeenCalledWith(2, { name: 'foco-total' }))
    await user.selectOptions(screen.getByLabelText('Mesclar #focus em…'), '1')
    await waitFor(() => expect(api.mergeTags).toHaveBeenCalledWith(2, 1))
    await user.click(screen.getByRole('button', { name: 'Excluir #foco' }))
    expect(api.deleteTag).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteTag).toHaveBeenCalledWith(1))
  })
})
