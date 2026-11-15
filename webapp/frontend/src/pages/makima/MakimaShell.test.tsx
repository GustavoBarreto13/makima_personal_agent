// @vitest-environment jsdom
// Home "Hoje" de ponta a ponta no jsdom, com a API simulada: título único, blocos, vazio, erro, dados que se
// renovam sozinhos, foco que conta, editor de widgets e a aba Agentes.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import type { HubSummary, TodayPayload } from './types'

const api = vi.hoisted(() => ({ today: vi.fn(), summary: vi.fn(), search: vi.fn() }))
vi.mock('./makimaApi', () => ({ makimaApi: api }))

import { MakimaShell } from './MakimaShell'

const TODAY: TodayPayload = {
  date: '2026-11-15',
  now: { focus: { id: 1, title: 'Relatório Q4', phase: 'foco', remaining_sec: 1080, href: '/tasks#foco' }, next: { title: 'Jantar com Ana', time: '20:30', href: '/tasks' } },
  attention: [
    { id: 'overdue', agent: 'kaguya', tone: 'danger', icon: 'task', label: '2 tarefas vencidas', action: 'Ver', href: '/tasks#hoje' },
    { id: 'pay-conta-1', agent: 'nami', tone: 'warn', icon: 'money', label: 'Luz · R$ 184 · 16/11', action: 'Ver', href: '/nami#recorrentes' },
  ],
  numbers: { nami_livre: { v: 'R$ 1.240', k: 'livre pra gastar' }, kaguya_hoje: { v: '5', k: 'tarefas hoje' }, habitos: null },
}
const SUMMARY: HubSummary = { nami: { stat: { v: '+R$ 2.480', k: 'saldo do mês' }, stat2: { v: '78', k: 'saúde' } }, kaguya: null }

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  api.today.mockReset().mockResolvedValue(TODAY)
  api.summary.mockReset().mockResolvedValue(SUMMARY)
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = ''; vi.useRealTimers() })

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
  })

  it('um título só: a saudação e a data ficam na barra do topo, sem repetir na página', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 21, 30))
    open()
    await screen.findByText('2 tarefas vencidas')
    expect(screen.getAllByText('Boa noite')).toHaveLength(1)
    expect(screen.getAllByText(/15 de novembro/i)).toHaveLength(1)
  })

  it('o aviso mostra a contagem como selo e "Ver" (não "Pagar", que só abre a Nami)', async () => {
    open()
    await screen.findByText('2 tarefas vencidas')
    expect(screen.getByLabelText('2 itens')).toBeTruthy()
    expect(screen.queryByText('Pagar')).toBeNull()
    expect(screen.getAllByText('Ver')).toHaveLength(2)
  })

  it('dia livre: estado vazio que aponta para o campo de registrar', async () => {
    api.today.mockResolvedValue({ date: '2026-11-15', now: { focus: null, next: null }, attention: [], numbers: {} })
    open()
    expect(await screen.findByText('Seu dia está livre')).toBeTruthy()
    expect(screen.getByText(/registre algo no campo acima/i)).toBeTruthy()
  })

  it('erro mostra tentar de novo e recarrega', async () => {
    api.today.mockRejectedValueOnce(new Error('rede'))
    const user = open()
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('2 tarefas vencidas')).toBeTruthy()
    expect(api.today).toHaveBeenCalledTimes(2)
  })
})

describe('dados vivos', () => {
  it('recarrega sozinho ao voltar para o app e não troca dado bom por erro se a recarga falhar', async () => {
    open()
    await screen.findByText('2 tarefas vencidas')
    expect(api.today).toHaveBeenCalledTimes(1)

    api.today.mockRejectedValueOnce(new Error('rede caiu'))
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(api.today).toHaveBeenCalledTimes(2)
    // a recarga falhou, mas o que já estava na tela continua lá
    expect(screen.getByText('2 tarefas vencidas')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()

    api.today.mockResolvedValueOnce({ ...TODAY, attention: [{ ...TODAY.attention[0], label: '3 tarefas vencidas' }] })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(await screen.findByText('3 tarefas vencidas')).toBeTruthy()
  })

  it('a contagem do foco anda sem recarregar', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    api.today.mockResolvedValue({ ...TODAY, now: { focus: { ...TODAY.now.focus!, remaining_sec: 90 }, next: null } })
    open()
    await act(async () => { await Promise.resolve() })
    expect(await screen.findByText(/Foco · 2 min restantes/)).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(31_000) })
    expect(screen.getByText(/Foco · 59 s restantes/)).toBeTruthy()
  })
})

describe('Seus números', () => {
  it('"Editar" abre o editor ali mesmo e ocultar um número o tira da tela', async () => {
    const user = open()
    await screen.findByText('R$ 1.240')
    await user.click(screen.getByRole('button', { name: /Editar/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('switch', { name: 'Mostrar Tarefas de hoje' }))
    await user.click(within(dialog).getByRole('button', { name: 'Pronto' }))
    expect(screen.queryByText('tarefas hoje')).toBeNull()
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
  })
})

describe('aba Agentes', () => {
  it('lista os agentes, mostra o número só quando existe e tem ação rápida curta', async () => {
    open('#agentes')
    expect(await screen.findByText('+R$ 2.480')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir Nami' })).toBeTruthy()
    expect(screen.queryByText('sem número agora')).toBeNull()
    expect(screen.getByRole('button', { name: 'Novo gasto: Nami' })).toBeTruthy()
    // sem campo de busca: a busca de verdade é o ícone do topo / Ctrl+K
    expect(screen.queryByLabelText('Buscar agente ou ação')).toBeNull()
  })

  it('resumo com erro não esconde os agentes', async () => {
    api.summary.mockRejectedValue(new Error('rede'))
    open('#agentes')
    expect(await screen.findByText('Não foi possível carregar os números')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir Kaguya' })).toBeTruthy()
  })
})
