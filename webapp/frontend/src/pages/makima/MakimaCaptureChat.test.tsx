// @vitest-environment jsdom
// Captura universal (entender → salvar → desfazer) e chat com a Makima (streaming, cartões, erro, desligado).

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import type { CapturePreview, ChatMessage, TodayPayload } from './types'

const api = vi.hoisted(() => ({
  today: vi.fn(), summary: vi.fn(), captureParse: vi.fn(), captureCommit: vi.fn(), captureUndo: vi.fn(), search: vi.fn(),
  chatStatus: vi.fn(), chatHistory: vi.fn(), chatClear: vi.fn(), chatStream: vi.fn(),
}))
vi.mock('./makimaApi', () => ({ makimaApi: api }))

import { MakimaShell } from './MakimaShell'

const EMPTY_DAY: TodayPayload = { date: '2026-11-15', now: { focus: null, next: null }, attention: [], numbers: {} }
const PREVIEW: CapturePreview = {
  kind: 'expense', agent: 'nami', confidence: 'high', title: 'Ifood', summary: 'Gasto de R$ 32 · Ifood · Comer Fora · hoje',
  fields: { name: 'Ifood', valor: 32, tipo: 'Despesa', categoria: 'Comer Fora', data: '2026-11-15' }, people: [], warnings: [],
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.today.mockResolvedValue(EMPTY_DAY)
  api.summary.mockResolvedValue({})
  api.captureParse.mockResolvedValue(PREVIEW)
  api.captureCommit.mockResolvedValue({ status: 'ok', summary: 'Transação criada', undo: { kind: 'expense', id: 'tx1' } })
  api.captureUndo.mockResolvedValue({ status: 'ok' })
  api.chatStatus.mockResolvedValue({ enabled: true })
  api.chatHistory.mockResolvedValue({ messages: [] })
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = (hash = '') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><MakimaShell /></MemoryRouter>)
  return user
}

describe('captura universal', () => {
  it('entende, mostra a prévia, salva com Idempotency-Key e oferece desfazer', async () => {
    const user = open()
    const input = await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' })
    await user.type(input, 'gastei 32 no ifood')
    await user.click(screen.getByRole('button', { name: 'Entender' }))
    expect(await screen.findByText(/Gasto de R\$ 32/)).toBeTruthy()
    expect(api.captureCommit).not.toHaveBeenCalled() // prévia nunca grava

    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.captureCommit).toHaveBeenCalledTimes(1))
    const [kind, fields, people, key] = api.captureCommit.mock.calls[0]
    expect(kind).toBe('expense')
    expect(fields.valor).toBe(32)
    expect(people).toEqual([])
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(8)
    expect(await screen.findByText('Transação criada')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.captureUndo).toHaveBeenCalledWith({ kind: 'expense', id: 'tx1' }))
  })

  it('frase solta avisa que entendeu como tarefa', async () => {
    api.captureParse.mockResolvedValue({ ...PREVIEW, kind: 'task', agent: 'kaguya', confidence: 'low', summary: 'Tarefa · Bla', fields: { title: 'Bla' } })
    const user = open()
    await user.type(await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' }), 'bla')
    await user.click(screen.getByRole('button', { name: 'Entender' }))
    expect(await screen.findByText(/Entendi como tarefa/)).toBeTruthy()
  })

  it('erro ao salvar mantém o texto e mostra a mensagem', async () => {
    api.captureCommit.mockRejectedValue(new Error('O valor precisa ser maior que zero.'))
    const user = open()
    const input = await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' })
    await user.type(input, 'gastei 0')
    await user.click(screen.getByRole('button', { name: 'Entender' }))
    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe('gastei 0')
  })

  it('a captura continua disponível quando o painel do dia falha', async () => {
    api.today.mockRejectedValue(new Error('rede'))
    open()
    expect(await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})

describe('chat com a Makima', () => {
  it('desligado mostra estado vazio explicando', async () => {
    api.chatStatus.mockResolvedValue({ enabled: false })
    open('#conversar')
    expect(await screen.findByText('O chat ainda não está ligado')).toBeTruthy()
  })

  it('mostra o histórico e responde em streaming com cartão de ação', async () => {
    const hist: ChatMessage[] = [{ id: 1, role: 'user', content: 'oi', actions: [] }, { id: 2, role: 'assistant', content: 'Oi! Como posso ajudar?', actions: [] }]
    api.chatHistory.mockResolvedValue({ messages: hist })
    api.chatStream.mockImplementation(async (_msg: string, h: any) => {
      h.onDelta('Lancei ')
      h.onAction({ agent: 'nami', tool: 'create_transaction', label: 'Create transaction' })
      h.onDelta('R$ 32.')
      h.onDone()
    })
    const user = open('#conversar')
    expect(await screen.findByText('Oi! Como posso ajudar?')).toBeTruthy()
    await user.type(screen.getByLabelText('Mensagem para a Makima'), 'lança 32 no ifood')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Lancei R$ 32.')).toBeTruthy()
    expect(screen.getByText(/Nami · Create transaction/)).toBeTruthy()
    expect(api.chatStream.mock.calls[0][0]).toBe('lança 32 no ifood')
  })

  it('falha do Hermes mostra erro com tentar de novo e reenvia a mesma mensagem', async () => {
    api.chatStream.mockImplementationOnce(async (_m: string, h: any) => { h.onError('Não consegui falar com a Makima agora. Tente de novo em instantes.') })
    api.chatStream.mockImplementationOnce(async (_m: string, h: any) => { h.onDelta('Pronto.'); h.onDone() })
    const user = open('#conversar')
    await user.type(await screen.findByLabelText('Mensagem para a Makima'), 'oi')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/Não consegui falar com a Makima/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Pronto.')).toBeTruthy()
    expect(api.chatStream.mock.calls.map((c) => c[0])).toEqual(['oi', 'oi'])
  })
})
