// @vitest-environment jsdom
// Estatísticas da Kaguya: visão geral (StatsPage do DS), planejamento (achados, planejado × feito, empurradas…),
// estado vazio com histórico curto e o erro com "tentar de novo".

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { todayISO } from '../../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), stats: vi.fn(), getTask: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const YEAR = Number(todayISO().slice(0, 4))

const planning = (over: Record<string, unknown> = {}) => ({
  plan: { planned: 40, done: 12, rate: 30, by_weekday: [{ bucket: 'segunda', planned: 10, done: 2, rate: 20 }, { bucket: 'terça', planned: 10, done: 8, rate: 80 }] },
  pushed: { top: [{ task_id: 5, title: 'Declarar imposto', count: 4 }], total_pushes: 4, tasks_pushed: 1 },
  estimates: { n: 8, estimated_min: 240, focused_min: 336, ratio: 1.4, bias_pct: 40 },
  overload: { days_planned: 10, days_over: 5, worst: [{ day: `${YEAR}-03-04`, planned_min: 600, free_min: 480, over_min: 120 }] },
  age: [{ bucket: 'até 1 semana', count: 3 }, { bucket: 'mais de 3 meses', count: 7 }],
  on_time: { on_time: 4, late: 8, no_due: 2, on_time_pct: 33.3 },
  inbox_old: 6, waiting_no_followup: 0,
  weekday: [{ bucket: 'segunda', count: 9 }, { bucket: 'terça', count: 3 }],
  hours: [{ bucket: '09h', count: 5 }, { bucket: '14h', count: 2 }],
  lead_time_days: 3, data_since: `${YEAR}-02-01`,
  insights: [
    { key: 'plan_low', severity: 'alert', text: 'Você conclui só 30% do que coloca no Meu Dia.', action: 'Planeje menos por dia.' },
    { key: 'pushed', severity: 'warn', text: '“Declarar imposto” já foi empurrada 4 vezes.', action: 'Quebre em passos menores.' },
  ],
  ...over,
})

const payload = (p = planning(), completed = 42) => ({
  period: { year: YEAR, month: null, label: String(YEAR) }, previous: { label: String(YEAR - 1) },
  kpis: [{ key: 'completed', label: 'Concluídas', value: completed, prev: 30 }],
  daily: [{ date: `${YEAR}-03-04`, value: 3 }], monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, value: i === 2 ? 3 : 0 })), monthlyUnit: 'tarefas',
  distribution: [{ bucket: 'Alta', count: 4 }], rankings: { lists: { title: 'Concluídas por lista', items: [{ label: 'Sprint', count: 9 }] } },
  records: [{ label: 'Maior sequência de dias com conclusões', value: '5 dias' }], moments: [], planning: p,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [], projects: [], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.stats.mockResolvedValue(payload())
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#estatisticas'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}

describe('Estatísticas', () => {
  it('visão geral usa o StatsPage do DS com o ritmo do ano', async () => {
    await open()
    expect(await screen.findByText('Dias com tarefas concluídas')).toBeTruthy()
    expect(screen.getByText('Concluídas por mês')).toBeTruthy()
    expect(screen.getByText('Concluídas por lista')).toBeTruthy()
    expect(screen.getByText('5 dias')).toBeTruthy()
    expect(api.stats).toHaveBeenCalledWith({ year: YEAR, space: undefined })
  })

  it('planejamento: achados ordenados com a ação, planejado × feito, estimativas e sobrecarga', async () => {
    const user = await open()
    await user.click(await screen.findByRole('tab', { name: 'Planejamento' }))
    expect(await screen.findByText('Você conclui só 30% do que coloca no Meu Dia.')).toBeTruthy()
    expect(screen.getByText('Planeje menos por dia.')).toBeTruthy()
    expect(screen.getByText(/12 de 40/)).toBeTruthy()
    expect(screen.getByText(/40% a mais do que o previsto/)).toBeTruthy()
    expect(screen.getByText(/de 10 dias planejados passaram do tempo livre/)).toBeTruthy()
    expect(screen.getByText(/O histórico de planejamento começa em/)).toBeTruthy()
  })

  it('tarefa empurrada abre a tarefa no painel', async () => {
    const user = await open()
    await user.click(await screen.findByRole('tab', { name: 'Planejamento' }))
    api.getTask.mockResolvedValue({ id: 5, title: 'Declarar imposto', project_id: 1, tags: [], subtasks: [], created_at: '2026-06-01T10:00:00-03:00', priority: 0, due_date: null, due_time: null, completed_at: null, description: null })
    await user.click(await screen.findByRole('button', { name: 'Declarar imposto' }))
    await waitFor(() => expect(window.location.hash).toContain('/t/5'))
  })

  it('sem dados ainda: sem achados explica como destravar', async () => {
    api.stats.mockResolvedValue(payload(planning({ insights: [], plan: { planned: 0, done: 0, rate: null, by_weekday: [] }, pushed: { top: [], total_pushes: 0, tasks_pushed: 0 },
      estimates: { n: 0, estimated_min: 0, focused_min: 0, ratio: null, bias_pct: null }, overload: { days_planned: 0, days_over: 0, worst: [] }, data_since: null })))
    const user = await open()
    await user.click(await screen.findByRole('tab', { name: 'Planejamento' }))
    expect(await screen.findByText('Sem achados por enquanto')).toBeTruthy()
    expect(screen.getByText('Ainda sem tarefas planejadas no período.')).toBeTruthy()
  })

  it('ano sem conclusões mostra o estado vazio do DS', async () => {
    api.stats.mockResolvedValue(payload(planning(), 0))
    await open()
    expect(await screen.findByText(`Sem registros em ${YEAR}`)).toBeTruthy()
  })

  it('erro mostra tentar de novo', async () => {
    api.stats.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue(payload())
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByText('Concluídas por mês')).toBeTruthy()
  })
})
