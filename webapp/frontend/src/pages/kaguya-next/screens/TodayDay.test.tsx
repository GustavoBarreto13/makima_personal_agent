// @vitest-environment jsdom
// Meu Dia, o que vai além do plano: experimentos do dia (Fiz + Desfazer), hábitos (tirar do dia), resumo do foco, a linha do dia
// (blocos de tempo, eventos, liberar horário, escolher calendários) e a alça de arrastar do plano.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { todayISO } from '../../../design/core/format'
import { streakOf } from './Today'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), myDay: vi.fn(), calendarSources: vi.fn(), setCalendarPref: vi.fn(), removeHabitFromMyDay: vi.fn(),
  setTimeBlock: vi.fn(), clearTimeBlock: vi.fn(), listContexts: vi.fn(),
  experiments: { dueToday: vi.fn(), log: vi.fn(), removeLog: vi.fn() },
  focus: { active: vi.fn(), today: vi.fn(), week: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const TODAY = todayISO()
const task = (id: number, title: string, over: Record<string, unknown> = {}) => ({ id, project_id: 1, column_id: null, parent_id: null, title, description: null, type: 'task', priority: 0, due_date: null, due_time: null, position: id * 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: TODAY, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], project_name: 'Casa', ...over })
const cap = { no_plano: 2, estimado_min: 90, agenda_min: 60, livre_min: 300, folga_min: 210, excedeu: false, calendar_ok: true }
const PLANO = [task(1, 'Escrever relatório', { start_at: `${TODAY}T10:00:00-03:00`, end_at: `${TODAY}T11:00:00-03:00`, duration_min: 60 }), task(2, 'Ligar para o banco')]
const day = (over: Record<string, unknown> = {}) => ({
  date: TODAY,
  plano: PLANO,
  plano_work: [], plano_personal: PLANO, pendencias_ontem: [], pendencias_ontem_work: [], pendencias_ontem_personal: [], sugestoes: [], sugestoes_work: [], sugestoes_personal: [],
  capacity: cap, capacity_work: cap, capacity_personal: cap, hide_work: false,
  eventos: [{ id: 'g1', title: 'Dentista', start: `${TODAY}T15:00:00-03:00`, end: `${TODAY}T16:00:00-03:00`, all_day: false, calendar_id: 'c1', calendar_name: 'Pessoal', color: null, context: 'personal', location: 'Rua A, 10' }],
  habitos: [{ id: 5, name: 'Meditar', icon: null, duration_min: 15 }],
  free_time: null,
  ...over,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.experiments, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [{ id: 1, name: 'Casa', group_id: null, color: null, icon: null, is_inbox: false, position: 1, has_board: false, open_count: 0, context: 'personal' }], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.myDay.mockResolvedValue(day())
  api.calendarSources.mockResolvedValue([{ id: 'gcal:c1', account: 'eu', kind: 'integration', name: 'Pessoal', color: 'var(--ds-chart-2)', visible: true }, { id: 'kaguya', account: 'makima', kind: 'base', name: 'Tarefas', color: 'x', visible: true }])
  api.setCalendarPref.mockResolvedValue({ status: 'ok' })
  api.removeHabitFromMyDay.mockResolvedValue({ status: 'ok' })
  api.setTimeBlock.mockResolvedValue({ status: 'ok' })
  api.clearTimeBlock.mockResolvedValue({ status: 'ok' })
  api.experiments.dueToday.mockResolvedValue([{ id: 8, title: 'Vou ler 20 min', cadence: 'daily' }])
  api.experiments.log.mockResolvedValue({ status: 'ok' })
  api.experiments.removeLog.mockResolvedValue({ status: 'ok' })
  api.focus.active.mockResolvedValue(null)
  api.focus.today.mockResolvedValue({ date: TODAY, total_min: 85, sessoes: 3 })
  api.focus.week.mockResolvedValue({ days: [{ date: '2026-06-08', total_min: 0, sessoes: 0 }, { date: '2026-06-09', total_min: 25, sessoes: 1 }, { date: TODAY, total_min: 85, sessoes: 3 }] })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200) })

const open = async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  await screen.findByRole('heading', { level: 2, name: /Bom dia|Boa tarde|Boa noite|Boa madrugada/ })
  return user
}

describe('streakOf', () => {
  it('conta os dias seguidos com foco, de hoje para trás', () => {
    const d = (s: number) => ({ date: 'x', total_min: s * 25, sessoes: s })
    expect(streakOf([d(1), d(0), d(2), d(1)])).toBe(2)
    expect(streakOf([d(1), d(1), d(0)])).toBe(0)
    expect(streakOf([])).toBe(0)
  })
})

describe('Meu Dia — além do plano', () => {
  it('experimentos do dia: “Fiz” registra e tem Desfazer', async () => {
    const user = await open()
    const section = (await screen.findByText('Experimentos de hoje')).closest('section')!
    await user.click(within(section).getByRole('button', { name: 'Fiz' }))
    await waitFor(() => expect(api.experiments.log).toHaveBeenCalledWith(8, { period_date: TODAY, done: true }))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.experiments.removeLog).toHaveBeenCalledWith(8, TODAY))
  })

  it('hábitos do dia: tirar do Meu Dia', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Tirar Meditar do Meu Dia' }))
    await waitFor(() => expect(api.removeHabitFromMyDay).toHaveBeenCalledWith(5))
  })

  it('resumo do foco: tempo, sessões, dias seguidos e uma árvore por dia com foco', async () => {
    await open()
    const sum = await screen.findByLabelText('Foco de hoje')
    expect(within(sum).getByText('1h25')).toBeTruthy()
    expect(within(sum).getByText(/3 sessões/)).toBeTruthy()
    expect(within(sum).getByText('2')).toBeTruthy() // 2 dias seguidos
    expect(within(sum).getAllByRole('img').length).toBe(2)
  })

  it('sem foco nenhum o resumo não aparece', async () => {
    api.focus.today.mockResolvedValue({ date: TODAY, total_min: 0, sessoes: 0 })
    api.focus.week.mockResolvedValue({ days: [{ date: TODAY, total_min: 0, sessoes: 0 }] })
    await open()
    await screen.findByText('Plano de hoje')
    expect(screen.queryByLabelText('Foco de hoje')).toBeNull()
  })

  it('se uma seção opcional falhar, o resto do dia continua', async () => {
    api.experiments.dueToday.mockRejectedValue(new Error('HTTP 500'))
    api.focus.today.mockRejectedValue(new Error('HTTP 500'))
    await open()
    expect(await screen.findByText('Plano de hoje')).toBeTruthy()
    expect(screen.queryByText('Experimentos de hoje')).toBeNull()
  })
})

describe('Meu Dia — linha do dia', () => {
  it('mostra o bloco da tarefa e o evento do Google (com o local abrindo no mapa)', async () => {
    await open()
    const tl = await screen.findByRole('region', { name: 'Linha do dia' })
    expect(within(tl).getByText('Escrever relatório')).toBeTruthy()
    expect(within(tl).getByText('10:00–11:00')).toBeTruthy()
    expect(within(tl).getByText('Dentista')).toBeTruthy()
    expect((within(tl).getByRole('link', { name: 'Rua A, 10' }) as HTMLAnchorElement).href).toContain('google.com/maps')
  })

  it('liberar o horário limpa o bloco e tem Desfazer', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Liberar o horário de Escrever relatório' }))
    await waitFor(() => expect(api.clearTimeBlock).toHaveBeenCalledWith(1))
    await user.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(api.setTimeBlock).toHaveBeenCalledWith(1, { start_at: `${TODAY}T10:00:00-03:00`, end_at: `${TODAY}T11:00:00-03:00` }))
  })

  it('os calendários visíveis se escolhem no botão (só os do Google)', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Calendários/ }))
    const group = await screen.findByRole('group', { name: 'Calendários visíveis' })
    expect(within(group).queryByText('Tarefas')).toBeNull()
    await user.click(within(group).getByRole('checkbox', { name: /Pessoal/ }))
    await waitFor(() => expect(api.setCalendarPref).toHaveBeenCalledWith('gcal:c1', { visible: false }))
  })

  it('cada linha do plano tem a alça de arrastar até um horário', async () => {
    await open()
    expect(await screen.findByRole('button', { name: /Arrastar “Ligar para o banco” até um horário/ })).toBeTruthy()
  })

  it('sem blocos nem eventos a linha do dia ensina a arrastar', async () => {
    api.myDay.mockResolvedValue(day({ plano: [task(2, 'Ligar para o banco')], plano_personal: [task(2, 'Ligar para o banco')], eventos: [] }))
    await open()
    expect(await screen.findByText(/Arraste uma tarefa do plano até uma hora/)).toBeTruthy()
  })
})
