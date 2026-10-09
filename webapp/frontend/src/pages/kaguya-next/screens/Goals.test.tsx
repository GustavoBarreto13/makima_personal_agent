// @vitest-environment jsdom
// Metas e Experimentos: listas (por área / ativos e concluídos), detalhe (progresso, marcos, movimentos, vínculo,
// revisão), tracker de check-ins e os modais de criar, editar e excluir com confirmação.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { addDaysISO, todayISO } from '../../../design/core/format'
import { deadlineText, metricSummary } from './Goals'
import { expDeadline } from './Experiments'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(),
  goals: {
    list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), del: vi.fn(), addMilestone: vi.fn(), updateMilestone: vi.fn(), delMilestone: vi.fn(),
    link: vi.fn(), unlink: vi.fn(), review: vi.fn(), linkable: vi.fn(), linkProviders: vi.fn(), setMetricMode: vi.fn(), searchLinkItems: vi.fn(), linkExternal: vi.fn(), unlinkExternal: vi.fn(),
  },
  experiments: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), del: vi.fn(), log: vi.fn(), removeLog: vi.fn(), pause: vi.fn(), resume: vi.fn(), review: vi.fn() },
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'
import type { Experiment, Goal } from '../types'

const TODAY = todayISO()
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 1, title: 'Ler 12 livros', why: 'Crescer', life_area: 'Crescimento', metric_target: 12, metric_unit: 'livros', metric_current: 3, metric_mode: 'manual',
  deadline: addDaysISO(TODAY, 40), anti_goals: null, accountability: null, status: 'active', outcome: null, review: null, metric_pct: 25, milestones_total: 2, milestones_done: 1,
  milestones_pct: 50, progress_pct: 38, days_remaining: 40, is_overdue: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  milestones: [{ id: 11, title: 'Terminar o primeiro', done: true }, { id: 12, title: 'Terminar o quinto', done: false }],
  movements: { experiments: [{ id: 5, title: 'Ler 20 min por dia', status: 'active', adherence_pct: 80 }], tasks: [{ id: 9, title: 'Comprar livro', completed: false }], habits: [{ id: 3, name: 'Leitura', consistency: 70 }] },
  ...over,
} as Goal)
const exp = (over: Partial<Experiment> = {}): Experiment => ({
  id: 5, title: 'Vou ler 20 min por dia', why: 'Foco', hypothesis: null, cadence: 'daily', start_date: addDaysISO(TODAY, -5), end_date: addDaysISO(TODAY, 9), status: 'active',
  verdict: null, review: null, goal_id: 1, goal_title: 'Ler 12 livros', periods_done: 4, periods_expected: 5, adherence_pct: 80, logged_current: false, days_remaining: 9, is_overdue: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.goals, api.experiments, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.focus.active.mockResolvedValue(null)
  api.goals.list.mockResolvedValue([goal(), goal({ id: 2, title: 'Meditar', life_area: null, metric_target: null, progress_pct: null }), goal({ id: 3, title: 'Corrida', status: 'closed', outcome: 'achieved', review: 'Foi bom' })])
  api.goals.get.mockResolvedValue(goal())
  api.goals.linkable.mockResolvedValue([{ id: 7, label: 'Meditar 5 min', linked_goal_id: null }, { id: 8, label: 'Outro', linked_goal_id: 99 }])
  api.goals.linkProviders.mockResolvedValue([])
  for (const f of ['create', 'update', 'del', 'addMilestone', 'updateMilestone', 'delMilestone', 'link', 'unlink', 'review', 'setMetricMode']) api.goals[f as 'create'].mockResolvedValue({ status: 'ok', id: 50 })
  api.experiments.list.mockResolvedValue([exp(), exp({ id: 6, title: 'Meditar de manhã', status: 'completed', verdict: 'persist', review: 'Funcionou', logged_current: true })])
  api.experiments.get.mockResolvedValue({ ...exp(), logs: [{ id: 1, period_date: addDaysISO(TODAY, -1), done: true, feeling: 4, note: 'Boa' }] })
  for (const f of ['create', 'update', 'del', 'log', 'removeLog', 'pause', 'resume', 'review']) api.experiments[f as 'create'].mockResolvedValue({ status: 'ok', id: 60 })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async (hash: string) => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaNextShell /></MemoryRouter>)
  return user
}

describe('helpers puros', () => {
  it('resume prazo e métrica', () => {
    expect(deadlineText({ is_overdue: true, days_remaining: -3 })).toBe('atrasada 3d')
    expect(deadlineText({ is_overdue: false, days_remaining: 0 })).toBe('vence hoje')
    expect(deadlineText({ is_overdue: false, days_remaining: 12 })).toBe('faltam 12d')
    expect(metricSummary({ metric_target: 12, metric_current: 3, metric_unit: 'livros', milestones_total: 2, milestones_done: 1 })).toBe('3/12 livros · 1/2 marcos')
    expect(metricSummary({ metric_target: null, metric_current: null, metric_unit: null, milestones_total: 0, milestones_done: 0 })).toBe('')
    expect(expDeadline({ is_overdue: false, days_remaining: 0 })).toBe('termina hoje')
  })
})

describe('Metas', () => {
  it('agrupa as ativas por área (sem área por último) e separa as encerradas', async () => {
    await open('#metas')
    await screen.findByRole('article', { name: 'Ler 12 livros' })
    const sections = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(sections.indexOf('Crescimento')).toBeLessThan(sections.indexOf('Sem área'))
    expect(within(screen.getByRole('region', { name: 'Encerradas' })).getByText('Corrida')).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'Ler 12 livros' })).getByText(/3\/12 livros · 1\/2 marcos · faltam 40d/)).toBeTruthy()
  })

  it('criar meta valida o título, o prazo padrão é daqui a 90 dias', async () => {
    const user = await open('#metas')
    await user.click((await screen.findAllByRole('button', { name: 'Nova meta' }))[0])
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Dê um título à meta.')).toBeTruthy()
    await user.type(screen.getByLabelText('Título'), 'Correr 10 km')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.goals.create).toHaveBeenCalled())
    expect(api.goals.create.mock.calls[0][0]).toMatchObject({ title: 'Correr 10 km', deadline: addDaysISO(TODAY, 90), metric_target: null })
  })

  it('o detalhe edita a métrica, marca marcos e adiciona um novo', async () => {
    const user = await open('#metas/1')
    await screen.findByRole('tab', { name: 'Progresso' })
    const metric = await screen.findByLabelText(/Valor atual/)
    await user.clear(metric)
    await user.type(metric, '5')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.goals.update).toHaveBeenCalledWith(1, { metric_current: 5 }))
    await user.click(screen.getByRole('checkbox', { name: 'Concluir o marco “Terminar o quinto”' }))
    await waitFor(() => expect(api.goals.updateMilestone).toHaveBeenCalledWith(1, 12, { done: true }))
    await user.type(screen.getByLabelText('Novo marco'), 'Terminar o décimo{Enter}')
    await waitFor(() => expect(api.goals.addMilestone).toHaveBeenCalledWith(1, 'Terminar o décimo'))
  })

  it('movimentos: lista, desvincula e vincula (avisando quando o item é de outra meta)', async () => {
    const user = await open('#metas/1')
    await user.click(await screen.findByRole('tab', { name: 'Movimentos' }))
    expect(await screen.findByText('Comprar livro')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Desvincular Comprar livro' }))
    await waitFor(() => expect(api.goals.unlink).toHaveBeenCalledWith(1, 'task', 9))
    await waitFor(() => expect(api.goals.linkable).toHaveBeenCalled())
    await user.selectOptions(await screen.findByLabelText('Item a vincular'), '8')
    expect(screen.getByText(/já pertence a outra meta/)).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Item a vincular'), '7')
    await user.click(screen.getByRole('button', { name: 'Vincular' }))
    await waitFor(() => expect(api.goals.link).toHaveBeenCalledWith(1, 'experiment', 7))
  })

  it('revisão exige desfecho e aprendizado antes de encerrar', async () => {
    const user = await open('#metas/1')
    await user.click(await screen.findByRole('tab', { name: 'Revisão' }))
    await user.click(await screen.findByRole('button', { name: 'Encerrar meta' }))
    expect(api.goals.review).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Atingida' }))
    await user.type(screen.getByLabelText('O que você aprendeu com esta meta?'), 'Consistência vence')
    await user.click(screen.getByRole('button', { name: 'Encerrar meta' }))
    await waitFor(() => expect(api.goals.review).toHaveBeenCalledWith(1, { outcome: 'achieved', review: 'Consistência vence' }))
  })

  it('excluir a meta pede confirmação e volta para a lista', async () => {
    const user = await open('#metas/1')
    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir meta' }))
    expect(api.goals.del).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir meta' }))
    await waitFor(() => expect(api.goals.del).toHaveBeenCalledWith(1))
    await waitFor(() => expect(window.location.hash).toBe('#metas'))
  })

  it('vazio e erro', async () => {
    api.goals.list.mockResolvedValueOnce([])
    await open('#metas')
    expect(await screen.findByText('Nenhuma meta ainda')).toBeTruthy()
    cleanup()
    api.goals.list.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open('#metas')
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByRole('article', { name: 'Ler 12 livros' })).toBeTruthy()
  })
})

describe('Experimentos', () => {
  it('lista ativos com “Fiz hoje” e concluídos com o veredicto', async () => {
    const user = await open('#experimentos')
    const active = await screen.findByRole('article', { name: 'Vou ler 20 min por dia' })
    expect(within(active).getByText('Aderência 80% · 4/5')).toBeTruthy()
    const done = screen.getByRole('region', { name: 'Concluídos' })
    expect(within(done).getByText('Persistir')).toBeTruthy()
    expect(within(done).getByText('“Funcionou”')).toBeTruthy()
    await user.click(within(active).getByRole('button', { name: 'Fiz hoje' }))
    await waitFor(() => expect(api.experiments.log).toHaveBeenCalledWith(5, { period_date: TODAY, done: true }))
  })

  it('criar vincula à meta escolhida', async () => {
    api.goals.list.mockResolvedValue([goal()])
    const user = await open('#experimentos')
    await user.click((await screen.findAllByRole('button', { name: 'Novo experimento' }))[0])
    await user.type(await screen.findByLabelText('Fórmula'), 'Vou caminhar 10 min')
    await user.selectOptions(await screen.findByLabelText('Meta (opcional)'), '1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.experiments.create).toHaveBeenCalled())
    expect(api.experiments.create.mock.calls[0][0]).toMatchObject({ title: 'Vou caminhar 10 min', start_date: TODAY, end_date: addDaysISO(TODAY, 14), cadence: 'daily' })
    await waitFor(() => expect(api.goals.link).toHaveBeenCalledWith(1, 'experiment', 60))
  })

  it('o detalhe mostra o tracker, corrige um check-in e remove outro', async () => {
    const user = await open('#experimentos/5')
    const row = (await screen.findByText('Boa')).closest('tr')!
    expect(within(row).getByText('4/5')).toBeTruthy()
    await user.click(within(row).getByRole('button', { name: /Corrigir o check-in/ }))
    expect((screen.getByLabelText('Nota (opcional)') as HTMLInputElement).value).toBe('Boa')
    await user.click(screen.getByRole('button', { name: 'Salvar check-in' }))
    await waitFor(() => expect(api.experiments.log).toHaveBeenCalledWith(5, { period_date: addDaysISO(TODAY, -1), done: true, feeling: 4, note: 'Boa' }))
    await user.click(within(row).getByRole('button', { name: /Remover o check-in/ }))
    await waitFor(() => expect(api.experiments.removeLog).toHaveBeenCalledWith(5, addDaysISO(TODAY, -1)))
  })

  it('pausar e concluir com revisão', async () => {
    const user = await open('#experimentos/5')
    await user.click(await screen.findByRole('button', { name: 'Pausar' }))
    await waitFor(() => expect(api.experiments.pause).toHaveBeenCalledWith(5))
    await user.click(screen.getByRole('tab', { name: 'Revisão' }))
    await user.click(await screen.findByRole('button', { name: 'Concluir experimento' }))
    expect(api.experiments.review).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Pivotar' }))
    await user.type(screen.getByLabelText('O que você aprendeu com este experimento?'), 'Mudar o horário')
    await user.click(screen.getByRole('button', { name: 'Concluir experimento' }))
    await waitFor(() => expect(api.experiments.review).toHaveBeenCalledWith(5, { verdict: 'pivot', review: 'Mudar o horário' }))
  })
})
