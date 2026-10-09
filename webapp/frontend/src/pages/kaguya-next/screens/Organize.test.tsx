// @vitest-environment jsdom
// Organizar: criar/editar lista (espaço, revisão, sequencial, arquivar, excluir com escolha), grupo (espaço herdado e aplicar às
// listas), smart-list (regras), locais (Onde @) e reordenar vizinhos pela tela.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), deleteProject: vi.fn(), archiveProject: vi.fn(), restoreProject: vi.fn(),
  createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn(), setGroupContext: vi.fn(), createFilter: vi.fn(), updateFilter: vi.fn(), deleteFilter: vi.fn(),
  listContexts: vi.fn(), createContext: vi.fn(), updateContext: vi.fn(), deleteContext: vi.fn(), listTasks: vi.fn(), filterTasks: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const proj = (id: number, name: string, over: Record<string, unknown> = {}) => ({ id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id * 10, has_board: false, open_count: 3, context: 'personal', ...over })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({
    groups: [{ id: 3, name: 'Sprint', position: 1, context: 'work' }],
    projects: [proj(9, 'Inbox', { is_inbox: true, position: 0 }), proj(1, 'Casa'), proj(2, 'Estudos'), proj(5, 'Backlog', { group_id: 3, context: 'work', sequential: true })],
    filters: [{ id: 7, name: 'Urgentes', icon: null, default_view: 'list', position: 1, rules: { combinator: 'and', conditions: [{ field: 'priority', op: 'gte', value: 3 }] } }],
  })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listTasks.mockResolvedValue([])
  api.focus.active.mockResolvedValue(null)
  api.listContexts.mockResolvedValue([{ id: 1, name: '@casa', icon: null, position: 1 }, { id: 2, name: '@rua', icon: null, position: 2 }])
  for (const f of ['createProject', 'updateProject', 'deleteProject', 'archiveProject', 'createGroup', 'updateGroup', 'deleteGroup', 'createFilter', 'updateFilter', 'deleteFilter', 'createContext', 'updateContext', 'deleteContext']) api[f as 'createProject'].mockResolvedValue({ status: 'ok', id: 50 })
  api.setGroupContext.mockResolvedValue({ status: 'ok', updated: 1 })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async (hash = '#organizar') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}

describe('Organizar', () => {
  it('lista soltas, grupos com suas listas e smart-listas na ordem da barra lateral', async () => {
    await open()
    const loose = await screen.findByRole('region', { name: 'Listas soltas' })
    expect(within(loose).getByText('Casa')).toBeTruthy()
    const group = screen.getByRole('region', { name: 'Grupo Sprint' })
    expect(within(group).getByText('Backlog')).toBeTruthy()
    expect(within(group).getByText('Sequencial')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Smart-listas' })).getByText('Urgentes')).toBeTruthy()
  })

  it('reordenar troca as posições dos vizinhos', async () => {
    const user = await open()
    await screen.findByRole('region', { name: 'Listas soltas' })
    await user.click(screen.getByRole('button', { name: 'Subir Estudos' }))
    await waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(2))
    expect(api.updateProject).toHaveBeenCalledWith(2, { position: 10 })
    expect(api.updateProject).toHaveBeenCalledWith(1, { position: 20 })
  })

  it('o primeiro não sobe e o último não desce', async () => {
    await open()
    await screen.findByRole('region', { name: 'Listas soltas' })
    expect((screen.getByRole('button', { name: 'Subir Casa' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Descer Estudos' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Lista', () => {
  it('criar numa grupo herda o espaço do grupo; revisão e sequencial gravam em seguida', async () => {
    const user = await open()
    await screen.findByRole('region', { name: 'Grupo Sprint' })
    await user.click(within(screen.getByRole('region', { name: 'Grupo Sprint' })).getByRole('button', { name: 'Lista' }))
    await user.type(await screen.findByLabelText('Nome'), 'Sprint 2')
    const space = screen.getByRole('group', { name: 'Espaço da lista' })
    expect(within(space).getByRole('button', { name: 'Trabalho' }).getAttribute('aria-pressed')).toBe('true')
    await user.type(screen.getByLabelText('Revisar a cada (dias)'), '7')
    await user.click(screen.getByRole('switch', { name: /sequencial/ }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith({ name: 'Sprint 2', group_id: 3, context: 'work' }))
    await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith(50, { review_interval_days: 7, sequential: true }))
  })

  it('nome vazio e cadência inválida avisam sem gravar', async () => {
    const user = await open()
    await user.click((await screen.findAllByRole('button', { name: 'Nova lista' }))[0])
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Dê um nome à lista.')).toBeTruthy()
    await user.type(screen.getByLabelText('Nome'), 'X')
    await user.type(screen.getByLabelText('Revisar a cada (dias)'), '0')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('A cadência de revisão precisa ser maior que zero.')).toBeTruthy()
    expect(api.createProject).not.toHaveBeenCalled()
  })

  it('editar pelo botão da lista; excluir pergunta o que fazer com as tarefas', async () => {
    const user = await open('#lista/1')
    await user.click(await screen.findByRole('button', { name: 'Editar lista' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialog = await screen.findByRole('dialog', { name: /Excluir “Casa”\?/ })
    await user.click(within(dialog).getByRole('button', { name: 'Mover tarefas para o Inbox' }))
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith(1, 'move_to_inbox'))
    await waitFor(() => expect(window.location.hash).toBe('#hoje'))
  })

  it('arquivar tem Desfazer e o Inbox não pode ser arquivado nem excluído', async () => {
    const user = await open('#lista/1')
    await user.click(await screen.findByRole('button', { name: 'Editar lista' }))
    await user.click(await screen.findByRole('button', { name: 'Arquivar' }))
    await waitFor(() => expect(api.archiveProject).toHaveBeenCalledWith(1))
    cleanup()
    await open('#lista/9')
    await user.click(await screen.findByRole('button', { name: 'Editar lista' }))
    await screen.findByRole('dialog', { name: 'Editar lista' })
    expect(screen.queryByRole('button', { name: 'Arquivar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
  })
})

describe('Grupo, smart-list e locais', () => {
  it('novo grupo com espaço; aplicar o espaço às listas do grupo; excluir confirma', async () => {
    const user = await open()
    await user.click((await screen.findAllByRole('button', { name: 'Novo grupo' }))[0])
    await user.type(await screen.findByLabelText('Nome'), 'Casa')
    await user.click(within(screen.getByRole('group', { name: 'Espaço do grupo' })).getByRole('button', { name: 'Trabalho' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith('Casa', 'work'))
    cleanup()
    const u2 = await open('#grupo-lista/3')
    await u2.click(await screen.findByRole('button', { name: 'Editar grupo' }))
    await u2.click(await screen.findByRole('button', { name: /Aplicar às 1 listas/ }))
    await waitFor(() => expect(api.setGroupContext).toHaveBeenCalledWith(3, 'work'))
    await u2.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialog = await screen.findByRole('alertdialog')
    await u2.click(within(dialog).getByRole('button', { name: 'Excluir grupo' }))
    await waitFor(() => expect(api.deleteGroup).toHaveBeenCalledWith(3))
  })

  it('smart-list: nome obrigatório, regras e salvar', async () => {
    const user = await open()
    await user.click((await screen.findAllByRole('button', { name: 'Nova smart-list' }))[0])
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Dê um nome à smart-list.')).toBeTruthy()
    await user.type(screen.getByLabelText('Nome'), 'Para hoje')
    await user.selectOptions(screen.getByLabelText('Campo da condição 1'), 'my_day')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createFilter).toHaveBeenCalled())
    expect(api.createFilter.mock.calls[0][0]).toMatchObject({ name: 'Para hoje', rules: { combinator: 'and', conditions: [{ field: 'my_day', op: 'eq', value: true }] } })
  })

  it('editar e excluir uma smart-list existente', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Editar a smart-list Urgentes' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir smart-list' }))
    await waitFor(() => expect(api.deleteFilter).toHaveBeenCalledWith(7))
  })

  it('locais: adicionar, renomear, reordenar e excluir com confirmação', async () => {
    const user = await open()
    await user.click((await screen.findAllByRole('button', { name: 'Onde (@)' }))[0])
    await screen.findByRole('dialog', { name: 'Onde (@)' })
    await user.type(await screen.findByLabelText('Novo local'), '@escritório{Enter}')
    await waitFor(() => expect(api.createContext).toHaveBeenCalledWith({ name: '@escritório' }))
    await user.click(await screen.findByRole('button', { name: 'Descer @casa' }))
    await waitFor(() => expect(api.updateContext).toHaveBeenCalledWith(1, { position: 2 }))
    expect(api.updateContext).toHaveBeenCalledWith(2, { position: 1 })
    await user.click(screen.getByRole('button', { name: 'Excluir @rua' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteContext).toHaveBeenCalledWith(2))
  })
})
