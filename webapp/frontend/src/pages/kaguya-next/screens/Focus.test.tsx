// @vitest-environment jsdom
// Foco: overview (KPIs, floresta, horas, rankings, padrão de falha, conquistas), troca de período, o widget da sessão
// ativa (tempo derivado de started_at), concluir e desistir (com motivo) e os estados de erro.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { addDaysISO, todayISO } from '../../../design/core/format'
import { periodStart } from './Focus'
import { treeSpecies } from '../components/FocusTree'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listHabits: vi.fn(),
  focus: { active: vi.fn(), prefs: vi.fn(), start: vi.fn(), finish: vi.fn(), cancel: vi.fn(), stats: vi.fn(), heatmap: vi.fn(), achievements: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const TODAY = todayISO()
const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, completed_min: h === 9 ? 50 : 0, completed_n: h === 9 ? 2 : 0, failed_n: h === 22 ? 1 : 0 }))
const stats = (over: Record<string, unknown> = {}) => ({
  totals: { total_min: 125, sessoes: 4 }, by_day: [], by_hour: hours,
  outcome: { completed: 4, cancelled: 1, abandoned: 1, completion_pct: 67, avg_min_before_quit: 8 },
  streak: 3, longest_streak: 5,
  top_tasks: [{ label: 'Escrever spec', total_min: 90, sessoes: 3 }], top_projects: [{ label: 'Sprint', total_min: 125, sessoes: 4 }], top_habits: [], by_context: [],
  recent_reasons: [{ date: TODAY, reason: 'notificação', outcome: 'cancelled' }],
  sessions: [{ id: 1, task_id: null, task_title: 'Escrever spec', habit_id: null, habit_name: null, project_id: 1, project_title: 'Sprint', project_color: null, context: 'work', started_at: `${TODAY}T09:00:00-03:00`, ended_at: `${TODAY}T09:25:00-03:00`, date_local: TODAY, duration_focused_min: 25, duration_planned_min: 25, outcome: 'completed' }],
  ...over,
})
const ACH = [
  { id: 'sessions_1', name: '1 sessão', description: 'Conclua sua primeira sessão', icon: '🌱', axis: 'sessions', unlocked: true, unlocked_at: `${TODAY}T09:30:00-03:00`, progress: 1, target: 1 },
  { id: 'streak_7', name: '7 dias seguidos', description: 'Foque 7 dias seguidos', icon: '🔥', axis: 'streak', unlocked: false, unlocked_at: null, progress: 3, target: 7 },
]
const ACTIVE = (over: Record<string, unknown> = {}) => ({
  id: 5, task_id: 9, task_title: 'Escrever spec', habit_id: null, habit_name: null, project_id: 1, project_title: 'Sprint', project_color: null,
  started_at: new Date(Date.now() - 5 * 60_000).toISOString(), ended_at: null, duration_planned_min: 25, break_planned_min: 5, outcome: null, cancel_reason: null, note: null, ...over,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  Object.values(api.focus).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [], projects: [], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listHabits.mockResolvedValue([])
  api.focus.active.mockResolvedValue(null)
  api.focus.prefs.mockResolvedValue({ focus_min: 25, break_min: 5 })
  api.focus.stats.mockResolvedValue(stats())
  api.focus.heatmap.mockResolvedValue([{ date: TODAY, total_min: 60, sessoes: 2 }])
  api.focus.achievements.mockResolvedValue(ACH)
  api.focus.finish.mockResolvedValue({ status: 'ok', session: { id: 5, duration_focused_min: 25, outcome: 'completed', habit_checked_in: false } })
  api.focus.cancel.mockResolvedValue({ status: 'ok' })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async (hash = '#foco') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}

describe('helpers puros', () => {
  it('a espécie da árvore vem da duração e do desfecho', () => {
    expect(treeSpecies(10, 'completed')).toBe('broto')
    expect(treeSpecies(25, 'completed')).toBe('pequena')
    expect(treeSpecies(50, null)).toBe('media')
    expect(treeSpecies(90, 'completed')).toBe('grande')
    expect(treeSpecies(90, 'cancelled')).toBe('murcha')
    expect(treeSpecies(90, 'abandoned')).toBe('murcha')
  })
  it('o início do período parte do dia local informado', () => {
    expect(periodStart('week', '2026-06-10')).toBe('2026-06-04')
    expect(periodStart('month', '2026-06-10')).toBe('2026-05-12')
    expect(periodStart('year', '2026-06-10')).toBe('2026-01-01')
    expect(periodStart('all', '2026-06-10')).toBe('2000-01-01')
  })
})

describe('Foco — overview', () => {
  it('mostra KPIs, floresta, rankings, padrão de falha e conquistas', async () => {
    await open()
    expect(await screen.findByLabelText('Floresta do período')).toBeTruthy()
    const kpis = screen.getByLabelText('Resumo do período')
    expect(within(kpis).getByText('2h05')).toBeTruthy()
    expect(within(kpis).getByText('67%')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Tarefas' })).toBeTruthy()
    expect(screen.getByText('“notificação”')).toBeTruthy()
    expect(screen.getByText('1/2 conquistadas')).toBeTruthy()
    expect(screen.getByText('3/7')).toBeTruthy()
    expect(api.focus.stats).toHaveBeenCalledWith(addDaysISO(TODAY, -29), TODAY)
  })

  it('trocar o período refaz a consulta com o novo início', async () => {
    const user = await open()
    await screen.findByLabelText('Floresta do período')
    await user.click(screen.getByRole('button', { name: '7 dias' }))
    await waitFor(() => expect(api.focus.stats).toHaveBeenLastCalledWith(addDaysISO(TODAY, -6), TODAY))
  })

  it('sem sessões a floresta explica; erro oferece tentar de novo', async () => {
    api.focus.stats.mockResolvedValueOnce(stats({ sessions: [], top_tasks: [], top_projects: [], recent_reasons: [] }))
    await open()
    expect(await screen.findByText('Nenhuma sessão de foco neste período ainda.')).toBeTruthy()
    cleanup()
    api.focus.stats.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByLabelText('Floresta do período')).toBeTruthy()
  })
})

describe('Foco — sessão', () => {
  it('“Iniciar foco” pergunta alvo e duração e inicia', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Iniciar foco' }))
    expect(await screen.findByRole('dialog', { name: 'Focar' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '50 / 10' }))
    await user.click(screen.getByRole('button', { name: 'Iniciar' }))
    await waitFor(() => expect(api.focus.start).toHaveBeenCalledWith({ task_id: null, habit_id: null, focus_min: 50, break_min: 10, force: false }))
  })

  it('já existe sessão ativa: confirma e reenvia com force', async () => {
    api.focus.start.mockRejectedValueOnce(new Error('já existe uma sessão ativa')).mockResolvedValue(ACTIVE())
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Iniciar foco' }))
    await user.click(await screen.findByRole('button', { name: 'Iniciar' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar e iniciar' }))
    await waitFor(() => expect(api.focus.start).toHaveBeenLastCalledWith(expect.objectContaining({ force: true })))
  })

  it('o widget mostra o tempo restante derivado de started_at e conclui', async () => {
    api.focus.active.mockResolvedValue(ACTIVE())
    const user = await open('#hoje')
    const timer = await screen.findByRole('timer')
    expect(timer.textContent).toMatch(/^(19|20):\d\d$/) // 25min planejados − ~5min decorridos
    expect(screen.getByText('Escrever spec')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Concluir sessão' }))
    await waitFor(() => expect(api.focus.finish).toHaveBeenCalledWith(5))
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull())
  })

  it('desistir mostra a árvore murcha, aceita motivo opcional e cancela', async () => {
    api.focus.active.mockResolvedValue(ACTIVE())
    const user = await open('#hoje')
    await screen.findByRole('timer')
    await user.click(screen.getByRole('button', { name: 'Desistir da sessão' }))
    const dialog = await screen.findByRole('dialog', { name: 'Desistir do foco?' })
    expect(within(dialog).getByRole('img', { name: 'Árvore murcha' })).toBeTruthy()
    await user.type(within(dialog).getByLabelText(/O que te tirou do foco/), 'alguém chamou')
    await user.click(within(dialog).getByRole('button', { name: 'Desistir' }))
    await waitFor(() => expect(api.focus.cancel).toHaveBeenCalledWith(5, 'alguém chamou'))
  })

  it('a fase de pausa começa depois do tempo de foco', async () => {
    api.focus.active.mockResolvedValue(ACTIVE({ started_at: new Date(Date.now() - 27 * 60_000).toISOString() }))
    await open('#hoje')
    const timer = await screen.findByRole('timer')
    expect(timer.getAttribute('aria-label')).toMatch(/^Pausa/)
    await act(async () => {})
  })
})
