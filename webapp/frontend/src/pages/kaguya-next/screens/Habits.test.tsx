// @vitest-environment jsdom
// Hábitos: cartões com consistência/tendência, check-in (sim/não e mensurável), Meu Dia, histórico, criar/editar/arquivar,
// aba de arquivados com restaurar e os estados vazio/erro.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { freqText, heatPoints, scheduleText } from './Habits'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listHabits: vi.fn(), listArchivedHabits: vi.fn(), restoreHabit: vi.fn(), checkin: vi.fn(),
  removeCheckin: vi.fn(), habitHistory: vi.fn(), addHabitToMyDay: vi.fn(), removeHabitFromMyDay: vi.fn(), createHabit: vi.fn(), updateHabit: vi.fn(),
  deleteHabit: vi.fn(), listHabitSourceProviders: vi.fn(),
  focus: { active: vi.fn(), prefs: vi.fn(), start: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'
import type { Habit } from '../types'

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 1, name: 'Meditar', icon: null, color: null, freq_num: 1, freq_den: 1, target_value: null, unit: null, consistency: 72, trend: 'up', recent_done: 10, recent_total: 14,
  done_today: false, source_provider_id: null, done_today_source: null, schedules: [], reminder_lead_min: 0, duration_min: null, in_my_day: false, ...over,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  Object.values(api.focus).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [], projects: [], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.listHabits.mockResolvedValue([habit(), habit({ id: 2, name: 'Ler', target_value: 20, unit: 'páginas', trend: 'down', consistency: 40 })])
  api.listArchivedHabits.mockResolvedValue([])
  api.listHabitSourceProviders.mockResolvedValue([{ id: 'violet', name: 'Diário da Violet' }])
  api.habitHistory.mockResolvedValue([{ date: '2026-06-01', value: null, done: true }])
  api.checkin.mockResolvedValue({ status: 'ok' })
  api.removeCheckin.mockResolvedValue({ status: 'ok' })
  api.addHabitToMyDay.mockResolvedValue({ status: 'ok' })
  api.createHabit.mockResolvedValue({ status: 'ok', id: 9 })
  api.updateHabit.mockResolvedValue({ status: 'ok' })
  api.deleteHabit.mockResolvedValue({ status: 'ok' })
  api.restoreHabit.mockResolvedValue({ status: 'ok' })
  api.focus.active.mockResolvedValue(null)
  api.focus.prefs.mockResolvedValue({ focus_min: 25, break_min: 5 })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#habitos'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}
const card = (name: string) => screen.getByRole('article', { name })

describe('helpers puros', () => {
  it('descreve a frequência e agrupa os alertas por horário', () => {
    expect(freqText(1, 1)).toBe('Todo dia')
    expect(freqText(3, 7)).toBe('3× por semana')
    expect(freqText(1, 2)).toBe('1× a cada 2 dias')
    expect(scheduleText([{ weekday: 'FR', time: '07:00' }, { weekday: 'MO', time: '07:00' }, { weekday: 'SA', time: null }])).toBe('seg/sex 07:00, sáb dia todo')
  })
  it('o mapa de calor usa % da meta (mensurável) ou 100 (sim/não)', () => {
    expect(heatPoints([{ date: '2026-06-01', value: 10, done: false }, { date: '2026-06-02', value: 20, done: true }], 20)).toEqual([{ date: '2026-06-01', value: 50 }, { date: '2026-06-02', value: 100 }])
    expect(heatPoints([{ date: '2026-06-01', value: null, done: true }, { date: '2026-06-02', value: null, done: false }], null)).toEqual([{ date: '2026-06-01', value: 100 }])
  })
})

describe('Hábitos', () => {
  it('lista os cartões com tendência e desempenho recente', async () => {
    await open()
    await screen.findByRole('article', { name: 'Meditar' })
    expect(within(card('Meditar')).getByText('subindo')).toBeTruthy()
    expect(within(card('Meditar')).getByText('10/14 nas últimas 2 semanas')).toBeTruthy()
    expect(within(card('Ler')).getByText(/meta 20 páginas/)).toBeTruthy()
  })

  it('check-in sim/não e desfazer', async () => {
    const user = await open()
    await screen.findByRole('article', { name: 'Meditar' })
    await user.click(within(card('Meditar')).getByRole('button', { name: 'Hoje' }))
    await waitFor(() => expect(api.checkin).toHaveBeenCalledWith(1, {}))
    cleanup()
    api.listHabits.mockResolvedValue([habit({ done_today: true })])
    const u2 = await open()
    await u2.click(await screen.findByRole('button', { name: 'Feito hoje' }))
    await waitFor(() => expect(api.removeCheckin).toHaveBeenCalledWith(1))
  })

  it('mensurável pede o valor e rejeita zero', async () => {
    const user = await open()
    await screen.findByRole('article', { name: 'Ler' })
    const input = within(card('Ler')).getByLabelText('Valor de hoje para Ler')
    await user.click(within(card('Ler')).getByRole('button', { name: 'Marcar' }))
    expect(api.checkin).not.toHaveBeenCalled()
    await user.type(input, '15')
    await user.click(within(card('Ler')).getByRole('button', { name: 'Marcar' }))
    await waitFor(() => expect(api.checkin).toHaveBeenCalledWith(2, { value: 15 }))
  })

  it('Meu Dia e histórico do ano', async () => {
    const user = await open()
    await screen.findByRole('article', { name: 'Meditar' })
    await user.click(within(card('Meditar')).getByRole('button', { name: 'Pôr Meditar no Meu Dia' }))
    await waitFor(() => expect(api.addHabitToMyDay).toHaveBeenCalledWith(1))
    await user.click(within(card('Meditar')).getByRole('button', { name: 'Ver histórico de Meditar' }))
    await waitFor(() => expect(api.habitHistory).toHaveBeenCalled())
    expect(await within(card('Meditar')).findByRole('img', { name: /Check-ins de Meditar/ })).toBeTruthy()
  })

  it('criar um hábito mensurável com alerta de dia inteiro', async () => {
    const user = await open()
    await user.click((await screen.findAllByRole('button', { name: 'Novo hábito' }))[0])
    await user.type(await screen.findByLabelText('Nome'), 'Correr')
    await user.click(screen.getByRole('switch', { name: /mensurável/ }))
    await user.type(screen.getByLabelText('Meta'), '5')
    await user.type(screen.getByLabelText('Unidade'), 'km')
    await user.click(screen.getByRole('button', { name: 'Alerta na Seg' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createHabit).toHaveBeenCalled())
    expect(api.createHabit.mock.calls[0][0]).toMatchObject({ name: 'Correr', freq_num: 1, freq_den: 1, target_value: 5, unit: 'km', schedules: [{ weekday: 'MO', time: null }] })
  })

  it('valida nome vazio e frequência inválida sem chamar a API', async () => {
    const user = await open()
    await user.click((await screen.findAllByRole('button', { name: 'Novo hábito' }))[0])
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Dê um nome ao hábito.')).toBeTruthy()
    await user.type(screen.getByLabelText('Nome'), 'X')
    await user.clear(screen.getByLabelText('Vezes'))
    await user.type(screen.getByLabelText('Vezes'), '9')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/Frequência inválida/)).toBeTruthy()
    expect(api.createHabit).not.toHaveBeenCalled()
  })

  it('editar limpa a meta quando deixa de ser mensurável e arquivar pede confirmação', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Editar Ler' }))
    await user.click(await screen.findByRole('switch', { name: /mensurável/ }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.updateHabit).toHaveBeenCalled())
    expect(api.updateHabit.mock.calls[0][1]).toMatchObject({ clear_target: true, clear_source: true, clear_duration: true, schedules: [] })
    await user.click(await screen.findByRole('button', { name: 'Editar Meditar' }))
    await user.click(await screen.findByRole('button', { name: 'Arquivar' }))
    expect(api.deleteHabit).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Arquivar' }))
    await waitFor(() => expect(api.deleteHabit).toHaveBeenCalledWith(1))
  })

  it('focar abre o formulário já travado no hábito', async () => {
    const user = await open()
    await screen.findByRole('article', { name: 'Meditar' })
    await user.click(within(card('Meditar')).getByRole('button', { name: 'Focar em Meditar' }))
    expect(await screen.findByRole('dialog', { name: 'Focar' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Iniciar' }))
    await waitFor(() => expect(api.focus.start).toHaveBeenCalledWith({ task_id: null, habit_id: 1, focus_min: 25, break_min: 5, force: false }))
  })

  it('arquivados: lista e restaura; vazio explica', async () => {
    const user = await open()
    await user.click(await screen.findByRole('tab', { name: 'Arquivados' }))
    expect(await screen.findByText('Nenhum hábito arquivado')).toBeTruthy()
    cleanup()
    api.listArchivedHabits.mockResolvedValue([{ id: 7, name: 'Yoga', icon: null, archived_at: '2026-05-02T10:00:00-03:00' }])
    const u2 = await open()
    await u2.click(await screen.findByRole('tab', { name: 'Arquivados' }))
    await u2.click(await screen.findByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(api.restoreHabit).toHaveBeenCalledWith(7))
  })

  it('sem hábitos mostra o convite; erro oferece tentar de novo', async () => {
    api.listHabits.mockResolvedValueOnce([])
    await open()
    expect(await screen.findByText('Nenhum hábito ainda')).toBeTruthy()
    cleanup()
    api.listHabits.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByRole('article', { name: 'Meditar' })).toBeTruthy()
  })
})
