// @vitest-environment jsdom
// A Kaguya nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada.
// Cobre o que mais importa no uso: Meu Dia com os dois tempos livres, navegar (e a URL), criar pela barra, concluir com
// "Desfazer", abrir o painel e salvar por campo, o espaço Trabalho/Pessoal, excluir com confirmação e a rota por hash.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import { todayISO } from '../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), myDay: vi.fn(), listTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(),
  updateTask: vi.fn(), bulk: vi.fn(), bulkUndo: vi.fn(), setMyDayPrefs: vi.fn(), reschedule: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  search: vi.fn(), addToMyDay: vi.fn(), builtinTasks: vi.fn(), filterTasks: vi.fn(),
  schedule: { get: vi.fn(), overrides: vi.fn(), update: vi.fn(), setOverride: vi.fn(), clearOverride: vi.fn() },
}))
vi.mock('./api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from './KaguyaNextShell'
import type { MyDayResponse, Project, Sidebar, Task, TimeBucket } from './types'

const TODAY = todayISO()

const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: null, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0, due_date: null, due_time: null,
  position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null,
  tags: [], subtasks: [], project_name: 'Inbox', context: 'personal', ...over,
})
const project = (id: number, name: string, context: 'work' | 'personal', over: Partial<Project> = {}): Project => ({
  id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id, has_board: false, open_count: 0, context, ...over,
})

const INBOX = project(1, 'Inbox', 'personal', { is_inbox: true })
const SPRINT = project(2, 'Sprint', 'work')
const CASA = project(3, 'Casa', 'personal')
const SIDEBAR: Sidebar = { groups: [], projects: [INBOX, SPRINT, CASA], filters: [] }

const bucket = (livre: number, estimado: number): TimeBucket => ({ window_min: livre, busy_min: 0, livre_min: livre, estimado_min: estimado, folga_min: livre - estimado, excedeu: estimado > livre })
const CAP = { no_plano: 2, estimado_min: 90, agenda_min: 0, livre_min: 900, folga_min: 810, excedeu: false, calendar_ok: true }

const REPORT = task({ id: 10, title: 'Relatório semanal', project_id: 2, project_name: 'Sprint', context: 'work', priority: 3, my_day_date: TODAY, duration_min: 60 })
const MERCADO = task({ id: 11, title: 'Comprar pão', project_id: 3, project_name: 'Casa', my_day_date: TODAY, duration_min: 30 })

const MYDAY: MyDayResponse = {
  date: TODAY, plano: [REPORT, MERCADO], pendencias_ontem: [], sugestoes: [], capacity: CAP, eventos: [],
  plano_work: [REPORT], plano_personal: [MERCADO], pendencias_ontem_work: [], pendencias_ontem_personal: [], sugestoes_work: [], sugestoes_personal: [],
  capacity_work: CAP, capacity_personal: CAP, hide_work: false, habitos: [],
  free_time: { works: true, work: bucket(480, 60), general: bucket(420, 30), total: bucket(900, 90), calendar_ok: true },
}

const INBOX_TASK = task({ id: 20, title: 'Ligar para o dentista', project_id: 1, project_name: 'Inbox' })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue(SIDEBAR)
  api.viewCounts.mockResolvedValue({ all: 3, today: 1, tomorrow: 0, next7: 2, inbox: 1 })
  api.viewTasks.mockImplementation(async (key: string) => (key === 'inbox' ? [INBOX_TASK] : [REPORT, MERCADO, INBOX_TASK]))
  api.myDay.mockResolvedValue(MYDAY)
  api.listTasks.mockResolvedValue([])
  api.getTask.mockImplementation(async (id: number) => (id === 20 ? INBOX_TASK : id === 10 ? REPORT : MERCADO))
  api.createTask.mockResolvedValue({ status: 'ok', id: 99 })
  api.updateTask.mockResolvedValue({ status: 'ok' })
  api.bulk.mockResolvedValue({ status: 'ok', affected: 1, undo: { kind: 'reopen', ids: [20] } })
  api.bulkUndo.mockResolvedValue({ status: 'ok' })
  api.setMyDayPrefs.mockResolvedValue({ status: 'ok' })
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.search.mockResolvedValue([])
  api.schedule.get.mockResolvedValue({ work_days: [1, 2, 3, 4, 5], work_start: '09:00', work_end: '18:00', lunch_start: '12:00', lunch_end: '13:00', lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  await screen.findByRole('heading', { level: 2, name: /Bom dia|Boa tarde|Boa noite|Boa madrugada/ })
  return user
}
const goInbox = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click((await screen.findAllByRole('button', { name: /Inbox/ }))[0])
  await screen.findByText('Ligar para o dentista')
}

describe('Meu Dia', () => {
  it('mostra o plano dividido em Trabalho e Pessoal e os dois tempos livres', async () => {
    await open()
    expect(screen.getByText('Relatório semanal')).toBeTruthy()
    expect(screen.getByText('Comprar pão')).toBeTruthy()
    expect(screen.getByText(/1h de 8h livres/)).toBeTruthy() // trabalho: 60 estimados de 480 livres
    expect(screen.getByText(/30min de 7h livres/)).toBeTruthy() // geral
  })

  it('tarefa sem trabalho no dia: o balde de trabalho some em dia sem expediente', async () => {
    api.myDay.mockResolvedValue({ ...MYDAY, plano_work: [], plano: [MERCADO], free_time: { ...MYDAY.free_time!, works: false, work: bucket(0, 0) } })
    await open()
    expect(screen.queryByText(/de 0min livres|Trabalho:/)).toBeNull()
  })
})

describe('navegação e URL', () => {
  it('ir para a Inbox troca a tela e grava o hash', async () => {
    const user = await open()
    await goInbox(user)
    expect(window.location.hash).toBe('#visao/inbox')
  })

  it('abrir por hash restaura a tela e o painel da tarefa', async () => {
    window.location.hash = '#visao/inbox/t/20'
    render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
    expect(await screen.findByLabelText('Detalhe da tarefa')).toBeTruthy()
    expect((await screen.findByLabelText('Título')) as HTMLInputElement).toHaveProperty('value', 'Ligar para o dentista')
  })
})

describe('criar, concluir e desfazer', () => {
  it('a barra cria na lista aberta, entende @lista/#etiqueta/!prioridade e avisa', async () => {
    const user = await open()
    await goInbox(user)
    await user.type(screen.getByLabelText('Adicionar tarefa'), 'Enviar proposta @sprint #cliente !alta{Enter}')
    await waitFor(() => expect(api.createTask).toHaveBeenCalled())
    expect(api.createTask.mock.calls[0][0]).toMatchObject({ title: 'Enviar proposta', project_id: 2, tags: ['cliente'], priority: 3 })
    expect(await screen.findByText('Tarefa criada.')).toBeTruthy()
  })

  it('texto sem título não cria nada', async () => {
    const user = await open()
    await goInbox(user)
    await user.type(screen.getByLabelText('Adicionar tarefa'), '#sozinha{Enter}')
    expect(api.createTask).not.toHaveBeenCalled()
    expect(await screen.findByText('Escreva o título da tarefa.')).toBeTruthy()
  })

  it('concluir usa o bulk e o aviso tem Desfazer que chama o undo do servidor', async () => {
    const user = await open()
    await goInbox(user)
    await user.click(screen.getByRole('checkbox', { name: /Concluir “Ligar para o dentista”/ }))
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith([20], 'complete', null))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.bulkUndo).toHaveBeenCalledWith({ kind: 'reopen', ids: [20] }))
  })

  it('excluir pede confirmação antes de gravar', async () => {
    const user = await open()
    await goInbox(user)
    await user.click(screen.getByRole('button', { name: /Ações de “Ligar para o dentista”/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    expect(api.bulk).not.toHaveBeenCalled() // ainda não: a confirmação vem primeiro
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith([20], 'delete', null))
  })
})

describe('painel de detalhe', () => {
  it('abre ao clicar e salva o título por campo, sem botão Salvar', async () => {
    const user = await open()
    await goInbox(user)
    await user.click(screen.getByText('Ligar para o dentista'))
    const title = (await screen.findByLabelText('Título')) as HTMLInputElement
    await user.clear(title)
    await user.type(title, 'Marcar o dentista')
    await user.tab()
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(20, { title: 'Marcar o dentista' }))
    expect(window.location.hash).toBe('#visao/inbox/t/20')
  })

  it('a prioridade grava na hora', async () => {
    const user = await open()
    await goInbox(user)
    await user.click(screen.getByText('Ligar para o dentista'))
    const panel = await screen.findByLabelText('Detalhe da tarefa')
    await user.click(within(panel).getByRole('button', { name: 'Alta' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(20, { priority: 3 }))
  })

  it('fechar o painel tira a tarefa da URL', async () => {
    const user = await open()
    await goInbox(user)
    await user.click(screen.getByText('Ligar para o dentista'))
    await user.click(await screen.findByRole('button', { name: 'Fechar painel' }))
    await waitFor(() => expect(window.location.hash).toBe('#visao/inbox'))
    expect(screen.queryByLabelText('Detalhe da tarefa')).toBeNull()
  })
})

describe('espaço Trabalho/Pessoal', () => {
  it('escolher Trabalho refaz as consultas com space=work e esconde as listas pessoais', async () => {
    const user = await open()
    expect(screen.getAllByRole('button', { name: /Casa/ }).length).toBeGreaterThan(0)
    await user.click(within(screen.getByRole('group', { name: 'Espaço' })).getByRole('button', { name: /Trabalho/ }))
    await waitFor(() => expect(api.viewCounts).toHaveBeenCalledWith('work'))
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Casa/ }).length).toBe(0))
    expect(screen.getAllByRole('button', { name: /Sprint/ }).length).toBeGreaterThan(0)
  })
})
