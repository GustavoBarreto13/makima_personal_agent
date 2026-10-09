// @vitest-environment jsdom
// Calendário: eventos de tarefa/Google/hub na grade e no mês, navegação e visões, popover (abrir, concluir, duplicar,
// excluir com confirmação), menu de contexto, fontes (visibilidade/contexto/cor), bandejas e soltar tarefa na grade/dia,
// faixa de expediente e o filtro por espaço.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { addDaysISO, todayISO } from '../../../design/core/format'
import { title } from './Calendar'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), calendar: vi.fn(), calendarAggregate: vi.fn(), calendarEvents: vi.fn(), calendarSources: vi.fn(),
  gcalStatus: vi.fn(), setCalendarPref: vi.fn(), updateTask: vi.fn(), setTimeBlock: vi.fn(), clearTimeBlock: vi.fn(), getTask: vi.fn(), bulk: vi.fn(), remove: vi.fn(),
  createCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), updateCalendarEvent: vi.fn(), duplicateTask: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'
import type { Calendar as Cal, Task } from '../types'

const TODAY = todayISO()
const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: null, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0, due_date: null, due_time: null, position: 1000,
  completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], ...over,
})
const cal = (over: Partial<Cal> = {}): Cal => ({ id: 'kaguya', account: 'makima', kind: 'base', name: 'Kaguya · Tarefas', color: 'var(--ds-chart-1)', visible: true, primary: true, ...over })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [{ id: 1, name: 'Casa', group_id: null, color: null, icon: null, is_inbox: false, position: 1, has_board: false, open_count: 0, context: 'personal' }], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([task({ id: 40, title: 'Sem data ainda' })])
  api.focus.active.mockResolvedValue(null)
  api.calendar.mockResolvedValue([
    task({ id: 10, title: 'Reunião', due_date: TODAY, due_time: '10:00', start_at: `${TODAY}T10:00:00-03:00`, end_at: `${TODAY}T11:00:00-03:00` }),
    task({ id: 11, title: 'Pagar luz', due_date: TODAY }),
    task({ id: 12, title: 'Ligar', due_date: addDaysISO(TODAY, 1), series_id: 's1' }),
  ])
  api.calendarAggregate.mockResolvedValue({ items: [{ cal: 'nami', date: TODAY, all_day: true, title: 'Fatura do cartão', kind: 'x', ref_id: '7', deep_link: '/nami' }] })
  api.calendarEvents.mockResolvedValue([{ id: 'g1', summary: 'Dentista', start: `${TODAY}T15:00:00-03:00`, end: `${TODAY}T16:00:00-03:00`, calendar_id: 'c1', calendar_name: 'Pessoal' }])
  api.calendarSources.mockResolvedValue([cal(), cal({ id: 'gcal:c1', account: 'eu@gmail.com', kind: 'integration', name: 'Pessoal', writable: true, context: 'personal' }), cal({ id: 'nami', name: 'Nami', visible: true })])
  api.gcalStatus.mockResolvedValue({ connected: true, reason: null })
  api.setCalendarPref.mockResolvedValue({ status: 'ok' })
  for (const f of ['updateTask', 'setTimeBlock', 'clearTimeBlock', 'remove', 'createCalendarEvent', 'deleteCalendarEvent', 'updateCalendarEvent']) api[f as 'remove'].mockResolvedValue({ status: 'ok', id: 99 })
  api.duplicateTask.mockResolvedValue({ status: 'ok', id: 99 })
  api.bulk.mockResolvedValue({ status: 'ok', undo_token: null, changed: 1 })
  api.getTask.mockImplementation(async (id: number) => task({ id, title: id === 10 ? 'Reunião' : 'Tarefa' }))
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.schedule.get.mockResolvedValue({ work_days: [1, 2, 3, 4, 5, 6, 7], work_start: '09:00', work_end: '18:00', lunch_start: '12:00', lunch_end: '13:00', lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#calendario'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}

describe('título', () => {
  it('mês/ano ou dia da semana', () => {
    expect(title('month', '2026-06-10')).toBe('junho de 2026')
    expect(title('day', '2026-06-10')).toBe('qua, 10 de junho')
  })
})

describe('Calendário — semana', () => {
  it('mostra tarefa com bloco, dia inteiro, evento do Google e item de outro agente', async () => {
    await open()
    expect(await screen.findByRole('button', { name: /Reunião, 10:00 às 11:00/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Pagar luz' }).length).toBeGreaterThan(0) // pílula do dia inteiro (e a bandeja)
    expect(screen.getByRole('button', { name: /Dentista, 15:00 às 16:00/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fatura do cartão' })).toBeTruthy()
    expect(api.calendar).toHaveBeenCalledWith(expect.any(String), expect.any(String), undefined, undefined)
  })

  it('desenha a faixa de expediente e o almoço na coluna de hoje', async () => {
    await open()
    await screen.findByRole('button', { name: /Reunião/ })
    const col = document.querySelector(`.kn-cg-col[data-day="${TODAY}"]`)!
    expect(col.querySelector('.kn-cg-work')).toBeTruthy()
    expect(col.querySelector('.kn-cg-lunch')).toBeTruthy()
  })

  it('navegar muda a janela e “Hoje” volta', async () => {
    const user = await open()
    await screen.findByRole('button', { name: /Reunião/ })
    const calls = api.calendar.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Próximo período' }))
    await waitFor(() => expect(api.calendar.mock.calls.length).toBeGreaterThan(calls))
    const last = () => api.calendar.mock.calls[api.calendar.mock.calls.length - 1][0]
    expect(last()).toBe(addDaysISO(api.calendar.mock.calls[0][0], 7))
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    await waitFor(() => expect(last()).toBe(api.calendar.mock.calls[0][0]))
  })

  it('a visão escolhida fica guardada', async () => {
    const user = await open()
    await screen.findByRole('button', { name: /Reunião/ })
    await user.click(screen.getByRole('button', { name: 'Mês' }))
    expect(await screen.findByRole('grid', { name: 'Mês' })).toBeTruthy()
    expect(localStorage.getItem('kaguya-next:calendar-view')).toBe('month')
  })
})

describe('Calendário — eventos', () => {
  it('o popover abre a tarefa no painel', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Reunião, 10:00/ }))
    const pop = await screen.findByRole('dialog', { name: 'Evento: Reunião' })
    await user.click(within(pop).getByRole('button', { name: 'Abrir tarefa' }))
    expect(window.location.hash).toContain('/t/10')
  })

  it('concluir pelo popover usa a ação em massa (com Desfazer)', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Reunião, 10:00/ }))
    const pop = await screen.findByRole('dialog', { name: 'Evento: Reunião' })
    await user.click(within(pop).getByRole('button', { name: 'Concluir' }))
    await waitFor(() => expect(api.bulk).toHaveBeenCalled())
  })

  it('renomear uma tarefa grava no blur', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Reunião, 10:00/ }))
    const input = await screen.findByLabelText('Título do evento')
    await user.clear(input)
    await user.type(input, 'Reunião de planejamento')
    await user.tab()
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(10, { title: 'Reunião de planejamento' }))
  })

  it('excluir evento do Google pede confirmação', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Dentista, 15:00/ }))
    const pop = await screen.findByRole('dialog', { name: 'Evento: Dentista' })
    await user.click(within(pop).getByRole('button', { name: 'Excluir' }))
    expect(api.deleteCalendarEvent).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteCalendarEvent).toHaveBeenCalledWith('gcal-g1', 'c1'))
  })

  it('item de outro agente é só leitura, com atalho para abrir na origem', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Fatura do cartão' }))
    const pop = await screen.findByRole('dialog', { name: 'Evento: Fatura do cartão' })
    expect(within(pop).queryByRole('button', { name: 'Excluir' })).toBeNull()
    expect(within(pop).getByRole('button', { name: /Abrir em/ })).toBeTruthy()
  })

  it('o clique direito abre o menu com as ações', async () => {
    await open()
    const ev = await screen.findByRole('button', { name: /Reunião, 10:00/ })
    fireEvent.contextMenu(ev)
    const menu = await screen.findByRole('menu', { name: 'Ações de Reunião' })
    expect(within(menu).getByRole('menuitem', { name: 'Duplicar' })).toBeTruthy()
    await userEvent.setup().click(within(menu).getByRole('menuitem', { name: 'Duplicar' }))
    await waitFor(() => expect(api.duplicateTask).toHaveBeenCalledWith(10))
  })
})

describe('Calendário — fontes, bandejas e soltar', () => {
  it('desligar um calendário Google esconde os eventos sem nova consulta e grava a preferência', async () => {
    const user = await open()
    await screen.findByRole('button', { name: /Dentista/ })
    const calls = api.calendarEvents.mock.calls.length
    await user.click(screen.getByRole('checkbox', { name: 'Ocultar Pessoal' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Dentista/ })).toBeNull())
    expect(api.setCalendarPref).toHaveBeenCalledWith('gcal:c1', { visible: false })
    expect(api.calendarEvents.mock.calls.length).toBeLessThanOrEqual(calls + 1)
  })

  it('trocar o contexto Trabalho/Pessoal do calendário Google', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Pessoal: Pessoal \(clique para Trabalho\)/ }))
    await waitFor(() => expect(api.setCalendarPref).toHaveBeenCalledWith('gcal:c1', { context: 'work' }))
  })

  it('falha ao salvar reverte a alteração otimista', async () => {
    api.setCalendarPref.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open()
    await user.click(await screen.findByRole('checkbox', { name: 'Ocultar Pessoal' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Ocultar Pessoal' }).getAttribute('aria-checked')).toBe('true'))
  })

  it('as bandejas listam “Sem horário” e “Sem data”', async () => {
    await open()
    const tray = await screen.findByRole('region', { name: 'Sem horário' })
    expect(within(tray).getByText('Pagar luz')).toBeTruthy()
    expect(within(await screen.findByRole('region', { name: 'Sem data' })).getByText('Sem data ainda')).toBeTruthy()
  })

  it('soltar uma tarefa da bandeja na grade agenda o dia e o horário', async () => {
    await open()
    await screen.findByRole('region', { name: 'Sem horário' })
    const col = document.querySelector(`.kn-cg-col[data-day="${TODAY}"]`)!
    const data = { getData: () => '11', types: ['text/task-id'], dropEffect: 'move' }
    fireEvent.drop(col, { dataTransfer: data, clientY: 0 })
    await waitFor(() => expect(api.setTimeBlock).toHaveBeenCalled())
    expect(api.updateTask).toHaveBeenCalledWith(11, { due_date: TODAY })
  })

  it('no mês, soltar uma tarefa noutro dia muda só o vencimento', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Mês' }))
    const target = addDaysISO(TODAY, 2)
    const cell = (await screen.findAllByRole('gridcell')).find((c) => c.getAttribute('aria-label')?.startsWith(`${Number(target.slice(8))} de`))!
    fireEvent.drop(cell, { dataTransfer: { getData: () => '11', types: ['text/task-id'] } })
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(11, { due_date: target }))
    expect(api.setTimeBlock).not.toHaveBeenCalled()
  })

  it('o espaço Trabalho esconde os itens pessoais (Google pessoal e outros agentes)', async () => {
    localStorage.setItem('ds:prefs:kaguya', JSON.stringify({ space: 'work' }))
    await open()
    await screen.findByRole('button', { name: /Reunião/ })
    expect(screen.queryByRole('button', { name: /Dentista/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fatura do cartão' })).toBeNull()
  })
})
