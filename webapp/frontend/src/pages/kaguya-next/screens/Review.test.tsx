// @vitest-environment jsdom
// Rituais do GTD: processar o Inbox (renomear, mover de lista, decisões, teclas 1–6, pular, fila vazia) e a revisão semanal
// (retomada, passos, listas vencidas pela cadência, aguardando com cobrança, concluir só depois de ver tudo).

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { todayISO } from '../../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), listTasks: vi.fn(), inboxQueue: vi.fn(), processInboxItem: vi.fn(), updateTask: vi.fn(), listContexts: vi.fn(),
  reviewStart: vi.fn(), reviewMarkStep: vi.fn(), reviewComplete: vi.fn(), reviewWaitingOrdered: vi.fn(), builtinTasks: vi.fn(), dueReview: vi.fn(), markProjectReviewed: vi.fn(),
  calendar: vi.fn(), calendarAggregate: vi.fn(), complete: vi.fn(), remove: vi.fn(),
  focus: { active: vi.fn() },
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaNextShell } from '../KaguyaNextShell'

const TODAY = todayISO()
const t = (id: number, title: string, over: Record<string, unknown> = {}) => ({ id, project_id: 9, column_id: null, parent_id: null, title, description: null, type: 'task', priority: 0, due_date: null, due_time: null, position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], ...over })
const proj = (id: number, name: string, over: Record<string, unknown> = {}) => ({ id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id, has_board: false, open_count: 2, context: 'personal', last_reviewed_at: null, ...over })
const STEPS = ['inbox', 'next_actions', 'waiting', 'lists', 'calendar', 'someday']

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  for (const group of [api, api.focus, api.schedule] as Record<string, unknown>[]) {
    Object.values(group).forEach((m) => { if (typeof m === 'function' && 'mockReset' in m) (m as ReturnType<typeof vi.fn>).mockReset() })
  }
  api.sidebar.mockResolvedValue({ groups: [], projects: [proj(9, 'Inbox', { is_inbox: true }), proj(1, 'Casa'), proj(2, 'Trabalho', { context: 'work' })], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 2 })
  api.viewTasks.mockResolvedValue([])
  api.listTasks.mockResolvedValue([])
  api.focus.active.mockResolvedValue(null)
  api.listContexts.mockResolvedValue([{ id: 4, name: '@casa', icon: null, position: 1 }])
  let queue = [t(1, 'Ligar para o banco'), t(2, 'Ideia de app')]
  api.inboxQueue.mockImplementation(async () => ({ items: queue, total: queue.length }))
  api.processInboxItem.mockImplementation(async (id: number) => { queue = queue.filter((x) => x.id !== id); return { status: 'ok' } })
  api.updateTask.mockResolvedValue({ status: 'ok' })
  api.reviewStart.mockResolvedValue({ id: 5, started_at: `${TODAY}T10:00:00-03:00`, steps_seen: [], note: null, resumed: false })
  api.reviewMarkStep.mockImplementation(async (_id: number, step: string) => ({ status: 'ok', steps_seen: [step] }))
  api.reviewComplete.mockResolvedValue({ status: 'ok' })
  api.reviewWaitingOrdered.mockResolvedValue([{ id: 30, title: 'Orçamento', waiting_note: 'do João', waiting_since: null, days_waiting: 9 }, { id: 31, title: 'Resposta do RH', waiting_note: null, waiting_since: null, days_waiting: 2 }])
  api.builtinTasks.mockImplementation(async (key: string) => (key === 'next-actions' ? [t(40, 'Pagar boleto')] : [t(41, 'Aprender violão')]))
  api.dueReview.mockResolvedValue([{ id: 2, name: 'Trabalho', context: 'work', review_interval_days: 7, last_reviewed_at: null, days_overdue: 12 }])
  api.markProjectReviewed.mockResolvedValue({ status: 'ok' })
  api.calendar.mockResolvedValue([t(50, 'Reunião', { due_date: TODAY })])
  api.calendarAggregate.mockResolvedValue({ items: [] })
  api.complete.mockResolvedValue({ status: 'ok' })
  api.remove.mockResolvedValue({ status: 'ok' })
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
const wizard = async () => {
  const user = await open('#visao/inbox')
  await user.click(await screen.findByRole('button', { name: 'Processar o Inbox' }))
  return { user, dialog: await screen.findByRole('dialog', { name: 'Processar o Inbox' }) }
}

describe('Processar o Inbox', () => {
  it('mostra um item por vez com o progresso', async () => {
    const { dialog } = await wizard()
    expect(await within(dialog).findByDisplayValue('Ligar para o banco')).toBeTruthy()
    expect(within(dialog).getByText('1 de 2')).toBeTruthy()
  })

  it('renomear e mover para a lista valem junto com a decisão', async () => {
    const { user, dialog } = await wizard()
    const title = await within(dialog).findByDisplayValue('Ligar para o banco')
    await user.clear(title)
    await user.type(title, 'Ligar para o banco hoje')
    await user.selectOptions(within(dialog).getByLabelText('Mover para a lista'), '1')
    await user.selectOptions(within(dialog).getByLabelText('Onde (@)'), '4')
    await user.click(within(dialog).getByRole('button', { name: /Próxima ação/ }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(1, { title: 'Ligar para o banco hoje' }))
    expect(api.processInboxItem).toHaveBeenCalledWith(1, { decision: 'next_action', project_id: 1, context_id: 4 })
    expect(await within(dialog).findByDisplayValue('Ideia de app')).toBeTruthy()
  })

  it('as teclas 1–6 escolhem a decisão', async () => {
    const { user, dialog } = await wizard()
    await within(dialog).findByDisplayValue('Ligar para o banco')
    await user.keyboard('6')
    await waitFor(() => expect(api.processInboxItem).toHaveBeenCalledWith(1, expect.objectContaining({ decision: 'trash' })))
    await within(dialog).findByDisplayValue('Ideia de app')
    await user.keyboard('3')
    await waitFor(() => expect(api.processInboxItem).toHaveBeenCalledWith(2, expect.objectContaining({ decision: 'someday' })))
  })

  it('digitar um número no título não dispara decisão', async () => {
    const { user, dialog } = await wizard()
    const title = await within(dialog).findByDisplayValue('Ligar para o banco')
    await user.click(title)
    await user.keyboard('5')
    expect(api.processInboxItem).not.toHaveBeenCalled()
  })

  it('aguardando e agendar pedem o detalhe antes de confirmar', async () => {
    const { user, dialog } = await wizard()
    await within(dialog).findByDisplayValue('Ligar para o banco')
    await user.click(within(dialog).getByRole('button', { name: /Aguardando/ }))
    await user.type(await within(dialog).findByLabelText(/Por quem ou o quê/), 'retorno do gerente')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(api.processInboxItem).toHaveBeenCalledWith(1, expect.objectContaining({ decision: 'waiting', waiting_note: 'retorno do gerente' })))
    await within(dialog).findByDisplayValue('Ideia de app')
    await user.click(within(dialog).getByRole('button', { name: /Agendar/ }))
    await user.click(await within(dialog).findByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(api.processInboxItem).toHaveBeenCalledWith(2, expect.objectContaining({ decision: 'schedule', due_date: TODAY })))
  })

  it('pular passa para o próximo sem alterar nada; fila vazia comemora', async () => {
    const { user, dialog } = await wizard()
    await within(dialog).findByDisplayValue('Ligar para o banco')
    await user.click(within(dialog).getByRole('button', { name: 'Pular' }))
    expect(await within(dialog).findByDisplayValue('Ideia de app')).toBeTruthy()
    expect(api.processInboxItem).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /Lixo/ }))
    await waitFor(() => expect(api.processInboxItem).toHaveBeenCalledTimes(1))
  })
})

describe('Revisão semanal', () => {
  const review = async () => {
    const user = await open('#organizar')
    await user.click(await screen.findByRole('button', { name: 'Revisão semanal' }))
    return { user, dialog: await screen.findByRole('dialog', { name: /Revisão semanal/ }) }
  }

  it('abre no primeiro passo pendente e marca o passo como visto', async () => {
    const { dialog } = await review()
    expect(await within(dialog).findByText('Ligar para o banco')).toBeTruthy()
    await waitFor(() => expect(api.reviewMarkStep).toHaveBeenCalledWith(5, 'inbox'))
  })

  it('retomada vai para o primeiro passo não visto', async () => {
    api.reviewStart.mockResolvedValue({ id: 5, started_at: `${TODAY}T10:00:00-03:00`, steps_seen: ['inbox', 'next_actions'], note: null, resumed: true })
    const { dialog } = await review()
    expect(await within(dialog).findByText('Orçamento')).toBeTruthy()
    expect(within(dialog).getByText(/retomada/)).toBeTruthy()
  })

  it('aguardando: destaca o que passou de 7 dias e edita a nota', async () => {
    const { user, dialog } = await review()
    await user.click(await within(dialog).findByRole('button', { name: /3\. Aguardando/ }))
    const row = (await within(dialog).findByText('Orçamento')).closest('li')!
    expect(within(row).getByText('Cobrar')).toBeTruthy()
    expect(within(within(dialog).getByText('Resposta do RH').closest('li')!).queryByText('Cobrar')).toBeNull()
    await user.click(within(row).getByRole('button', { name: /Editar a nota/ }))
    const input = within(dialog).getByLabelText('Nota da espera')
    await user.clear(input)
    await user.type(input, 'cobrar na sexta')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(30, { waiting_note: 'cobrar na sexta' }))
  })

  it('listas: as vencidas pela cadência vêm primeiro e marcam como revisadas', async () => {
    const { user, dialog } = await review()
    await user.click(await within(dialog).findByRole('button', { name: /4\. Listas/ }))
    const first = (await within(dialog).findAllByRole('listitem'))[0]
    expect(within(first).getByText('Trabalho')).toBeTruthy()
    expect(within(first).getByText(/Venceu há 12d \(a cada 7d\)/)).toBeTruthy()
    await user.click(within(first).getByRole('button', { name: 'Marcar Trabalho como revisada' }))
    await waitFor(() => expect(api.markProjectReviewed).toHaveBeenCalledWith(2))
  })

  it('concluir sem ver todos os passos mostra quais faltam', async () => {
    api.reviewComplete.mockResolvedValueOnce({ status: 'ok', error: 'steps_pending', missing: ['calendar', 'someday'] })
    const { user, dialog } = await review()
    await within(dialog).findByText('Ligar para o banco')
    await user.click(within(dialog).getByRole('button', { name: 'Concluir revisão' }))
    expect(await within(dialog).findByText(/Passos ainda não vistos: Calendário, Algum dia\/talvez/)).toBeTruthy()
    api.reviewComplete.mockResolvedValueOnce({ status: 'ok' })
    await user.type(within(dialog).getByLabelText('Nota final (opcional)'), 'bom ritmo')
    await user.click(within(dialog).getByRole('button', { name: 'Concluir revisão' }))
    await waitFor(() => expect(api.reviewComplete).toHaveBeenLastCalledWith(5, 'bom ritmo'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Revisão semanal/ })).toBeNull())
  })

  it('algum dia: promover e navegar entre todos os passos', async () => {
    const { user, dialog } = await review()
    for (const [i, name] of ['Inbox zero', 'Próximas ações', 'Aguardando', 'Listas/projetos', 'Calendário', 'Algum dia/talvez'].entries()) {
      await user.click(await within(dialog).findByRole('button', { name: new RegExp(`${i + 1}\\. ${name}`) }))
    }
    expect(await within(dialog).findByText('Aprender violão')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Promover a próxima ação: Aprender violão' }))
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledWith(41, { gtd_status: 'next_action' }))
    expect(STEPS).toHaveLength(6)
  })
})
