// @vitest-environment jsdom
// Home "Hoje" de ponta a ponta no jsdom, com a API simulada: blocos, vazio, erro e troca de abas.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import type { HubSummary, TodayPayload } from './types'

const api = vi.hoisted(() => ({ today: vi.fn(), summary: vi.fn() }))
vi.mock('./makimaApi', () => ({ makimaApi: api }))

import { MakimaShell } from './MakimaShell'

const TODAY: TodayPayload = {
  date: '2026-11-15',
  now: { focus: { id: 1, title: 'Relatório Q4', phase: 'foco', remaining_sec: 1080, href: '/tasks#foco' }, next: { title: 'Jantar com Ana', time: '20:30', href: '/tasks' } },
  attention: [
    { id: 'overdue', agent: 'kaguya', tone: 'danger', label: '2 tarefas vencidas', action: 'Ver', href: '/tasks#hoje' },
    { id: 'bday-bia', agent: 'komi', tone: 'info', label: 'Aniversário de Bia · amanhã', action: 'Abrir', href: '/people#pessoa/bia' },
  ],
  numbers: { nami_livre: { v: 'R$ 1.240', k: 'livre pra gastar' }, kaguya_hoje: { v: '5', k: 'tarefas hoje' }, habitos: null },
}
const SUMMARY: HubSummary = { nami: { stat: { v: '+R$ 2.480', k: 'saldo do mês' }, stat2: { v: '78', k: 'saúde' } }, kaguya: null }

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  api.today.mockReset().mockResolvedValue(TODAY)
  api.summary.mockReset().mockResolvedValue(SUMMARY)
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = (hash = '') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><MakimaShell /></MemoryRouter>)
  return user
}

describe('Makima · Hoje', () => {
  it('mostra agora, precisa de você e só os números que existem', async () => {
    open()
    expect(await screen.findByText(/Foco · 18 min restantes/)).toBeTruthy()
    expect(screen.getByText('Jantar com Ana')).toBeTruthy()
    expect(screen.getByText('2 tarefas vencidas')).toBeTruthy()
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
    // widget com valor null não aparece
    expect(screen.queryByText('hábitos feitos hoje')).toBeNull()
    expect(screen.getByText(/2 coisas pedem atenção/)).toBeTruthy()
  })

  it('dia livre: estado vazio que convida', async () => {
    api.today.mockResolvedValue({ date: '2026-11-15', now: { focus: null, next: null }, attention: [], numbers: {} })
    open()
    expect(await screen.findByText('Seu dia está livre')).toBeTruthy()
  })

  it('erro mostra tentar de novo e recarrega', async () => {
    api.today.mockRejectedValueOnce(new Error('rede'))
    const user = open()
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('2 tarefas vencidas')).toBeTruthy()
    expect(api.today).toHaveBeenCalledTimes(2)
  })

  it('aba Agentes lista os agentes com número vivo e funciona sem resumo', async () => {
    open('#agentes')
    expect(await screen.findByText('+R$ 2.480')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir Nami' })).toBeTruthy()
    expect(screen.getAllByText('sem número agora').length).toBeGreaterThan(0)
  })

  it('aba Agentes: resumo com erro não esconde os agentes', async () => {
    api.summary.mockRejectedValue(new Error('rede'))
    open('#agentes')
    expect(await screen.findByText('Não foi possível carregar os números')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir Kaguya' })).toBeTruthy()
  })

  it('busca de agente sem resultado mostra o estado vazio', async () => {
    const user = open('#agentes')
    await screen.findByText('+R$ 2.480')
    await user.type(screen.getByLabelText('Buscar agente ou ação'), 'zzzz')
    expect(await screen.findByText('Nenhum agente encontrado')).toBeTruthy()
  })
})
