// @vitest-environment jsdom
// Captura universal (entender → revisar/editar → salvar → desfazer, tipo, validação, offline) e chat com a Makima
// (texto formatado, cartões em português, Enter no celular, Parar, histórico que não some, erro e desligado).

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
import { __resetChatCache } from './screens/Chat'

const EMPTY_DAY: TodayPayload = { date: '2026-11-15', now: { focus: null, next: null }, attention: [], numbers: {} }
const CATEGORIES = ['Alimentacao', 'Comer Fora', 'Inbox', 'Receita']
const EXPENSE: CapturePreview = {
  kind: 'expense', agent: 'nami', confidence: 'high', title: 'Ifood', summary: 'Gasto de R$ 32 · Ifood · Comer Fora · hoje',
  fields: { name: 'Ifood', valor: 32, tipo: 'Despesa', categoria: 'Comer Fora', data: '2026-11-15' }, people: [], warnings: [], options: { categories: CATEGORIES },
}
const TASK_LOW: CapturePreview = {
  kind: 'task', agent: 'kaguya', confidence: 'low', title: 'Bla', summary: 'Tarefa · Bla', fields: { title: 'Bla' }, people: [], warnings: [], options: { categories: CATEGORIES },
}
const committed = { queued: false, data: { status: 'ok', summary: 'Transação criada', undo: { kind: 'expense', id: 'tx1' } } }

const setCoarse = (on: boolean) => Object.defineProperty(window, 'matchMedia', {
  writable: true, configurable: true,
  value: (q: string) => ({ matches: on && q.includes('pointer: coarse'), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  __resetChatCache()
  api.today.mockResolvedValue(EMPTY_DAY)
  api.summary.mockResolvedValue({})
  api.captureParse.mockResolvedValue(EXPENSE)
  api.captureCommit.mockResolvedValue(committed)
  api.captureUndo.mockResolvedValue({ status: 'ok' })
  api.chatStatus.mockResolvedValue({ enabled: true })
  api.chatHistory.mockResolvedValue({ messages: [] })
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = ''; mockMatchMedia(false) })

const open = (hash = '') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><MakimaShell /></MemoryRouter>)
  return user
}

const understand = async (user: ReturnType<typeof userEvent.setup>, line: string) => {
  await user.type(await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' }), line)
  await user.click(screen.getByRole('button', { name: 'Entender' }))
  return screen.findByRole('form', { name: 'Revise antes de salvar' })
}

describe('captura universal', () => {
  it('entende, mostra a prévia EDITÁVEL com foco no Salvar, salva e oferece desfazer', async () => {
    const user = open()
    const prev = await understand(user, 'gastei 32 no ifood')
    expect(api.captureCommit).not.toHaveBeenCalled() // a prévia nunca grava
    expect((within(prev).getByLabelText('Descrição') as HTMLInputElement).value).toBe('Ifood')
    expect((within(prev).getByLabelText('Valor') as HTMLInputElement).value).toBe('32,00')
    expect((within(prev).getByLabelText('Categoria') as HTMLSelectElement).value).toBe('Comer Fora')
    const salvar = within(prev).getByRole('button', { name: 'Salvar' })
    await waitFor(() => expect(document.activeElement).toBe(salvar))

    await user.click(salvar)
    await waitFor(() => expect(api.captureCommit).toHaveBeenCalledTimes(1))
    expect(api.captureCommit).toHaveBeenCalledWith('expense', { name: 'Ifood', valor: 32, tipo: 'Despesa', categoria: 'Comer Fora', data: '2026-11-15' }, [])
    expect(await screen.findByText('Transação criada')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.captureUndo).toHaveBeenCalledWith({ kind: 'expense', id: 'tx1' }))
  })

  it('corrige o que foi entendido errado (valor e categoria) antes de salvar', async () => {
    const user = open()
    const prev = await understand(user, 'gastei 32 no ifood')
    const valor = within(prev).getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, '45,50')
    await user.selectOptions(within(prev).getByLabelText('Categoria'), 'Alimentacao')
    await user.click(within(prev).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.captureCommit).toHaveBeenCalled())
    expect(api.captureCommit.mock.calls[0][1]).toMatchObject({ valor: 45.5, categoria: 'Alimentacao' })
  })

  it('frase solta vira tarefa com aviso, e dá para trocar o tipo; gasto sem valor mostra o erro no campo', async () => {
    api.captureParse.mockResolvedValue(TASK_LOW)
    const user = open()
    const prev = await understand(user, 'bla')
    expect(within(prev).getByText(/Não vi um gasto nem uma data/)).toBeTruthy()
    expect(within(prev).queryByLabelText('Valor')).toBeNull()

    await user.click(within(prev).getByRole('button', { name: 'Gasto' }))
    expect(within(prev).getByLabelText('Valor')).toBeTruthy()
    await user.click(within(prev).getByRole('button', { name: 'Salvar' }))
    expect(await within(prev).findByText('Informe o valor.')).toBeTruthy()
    expect(api.captureCommit).not.toHaveBeenCalled()
  })

  it('Esc cancela a prévia e limpa a linha', async () => {
    const user = open()
    const prev = await understand(user, 'gastei 32 no ifood')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('form', { name: 'Revise antes de salvar' })).toBeNull()
    expect((screen.getByLabelText('Registrar qualquer coisa', { selector: 'input' }) as HTMLInputElement).value).toBe('')
    expect(prev.isConnected).toBe(false)
  })

  it('sem internet ao salvar: vai para a fila, sem Desfazer', async () => {
    api.captureCommit.mockResolvedValue({ queued: true })
    const user = open()
    const prev = await understand(user, 'gastei 32 no ifood')
    await user.click(within(prev).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.captureCommit).toHaveBeenCalled())
    expect(screen.queryByRole('form', { name: 'Revise antes de salvar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Desfazer/ })).toBeNull()
  })

  it('sem internet ao entender: oferece guardar a frase como tarefa na fila', async () => {
    api.captureParse.mockRejectedValue(new TypeError('Failed to fetch'))
    api.captureCommit.mockResolvedValue({ queued: true })
    const user = open()
    await user.type(await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' }), 'ligar pro contador')
    await user.click(screen.getByRole('button', { name: 'Entender' }))
    expect(await screen.findByText('Sem conexão para entender a frase.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Guardar como tarefa' }))
    await waitFor(() => expect(api.captureCommit).toHaveBeenCalledWith('task', { title: 'ligar pro contador' }, []))
  })

  it('erro ao salvar mantém a prévia e mostra a mensagem', async () => {
    api.captureCommit.mockRejectedValue(new Error('O valor precisa ser maior que zero.'))
    const user = open()
    const prev = await understand(user, 'gastei 32 no ifood')
    await user.click(within(prev).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('O valor precisa ser maior que zero.')).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Revise antes de salvar' })).toBeTruthy()
  })

  it('a captura continua disponível quando o painel do dia falha', async () => {
    api.today.mockRejectedValue(new Error('rede'))
    open()
    expect(await screen.findByLabelText('Registrar qualquer coisa', { selector: 'input' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})

describe('chat com a Makima', () => {
  const typeIn = async (user: ReturnType<typeof userEvent.setup>, text: string) => user.type(await screen.findByLabelText('Mensagem para a Makima'), text)

  it('desligado mostra estado vazio explicando', async () => {
    api.chatStatus.mockResolvedValue({ enabled: false })
    open('#conversar')
    expect(await screen.findByText('O chat ainda não está ligado')).toBeTruthy()
  })

  it('a resposta chega formatada (negrito e lista), sem asteriscos crus', async () => {
    const hist: ChatMessage[] = [
      { id: 1, role: 'user', content: 'quanto sobra?', actions: [], created_at: '2026-11-15T17:05:00.000Z' },
      { id: 2, role: 'assistant', content: 'Você tem **R$ 1.240** livres.\n- um\n- dois', actions: [], created_at: '2026-11-15T17:05:09.000Z' },
    ]
    api.chatHistory.mockResolvedValue({ messages: hist })
    open('#conversar')
    const log = await screen.findByRole('log')
    await waitFor(() => expect(within(log).getByText('R$ 1.240')).toBeTruthy())
    expect(within(log).getByText('R$ 1.240').tagName).toBe('STRONG')
    expect(within(log).getAllByRole('listitem')).toHaveLength(2)
    expect(log.textContent).not.toContain('**')
    expect(log.querySelectorAll('time').length).toBeGreaterThan(0)
  })

  it('responde em tempo real, com o cartão em português, e a conversa NÃO volta ao histórico antigo ao terminar', async () => {
    api.chatHistory.mockResolvedValue({ messages: [{ id: 1, role: 'assistant', content: 'Oi! Como posso ajudar?', actions: [] }] })
    api.chatStream.mockImplementation(async (_msg: string, h: any) => {
      h.onDelta('Lancei ')
      h.onAction({ agent: 'nami', tool: 'create_transaction', label: 'Create transaction' })
      h.onDelta('R$ 32.')
      h.onDone()
    })
    const user = open('#conversar')
    expect(await screen.findByText('Oi! Como posso ajudar?')).toBeTruthy()
    await typeIn(user, 'lança 32 no ifood')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Lancei R$ 32.')).toBeTruthy()
    expect(screen.getByText('Lançou uma transação')).toBeTruthy()
    expect(screen.getByText('Abrir Nami')).toBeTruthy()
    expect(screen.queryByText(/Create transaction/)).toBeNull()
    // o bug que existiu: ao terminar, o histórico antigo sobrescrevia as mensagens novas
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByText('lança 32 no ifood')).toBeTruthy()
    expect(screen.getByText('Lancei R$ 32.')).toBeTruthy()
  })

  it('no computador Enter envia; no celular Enter quebra a linha e só o botão envia', async () => {
    api.chatStream.mockImplementation(async (_m: string, h: any) => { h.onDelta('ok'); h.onDone() })
    const user = open('#conversar')
    await typeIn(user, 'oi{Enter}')
    await waitFor(() => expect(api.chatStream).toHaveBeenCalledTimes(1))

    cleanup(); api.chatStream.mockClear(); __resetChatCache(); setCoarse(true)
    const user2 = open('#conversar')
    const area = (await screen.findByLabelText('Mensagem para a Makima')) as HTMLTextAreaElement
    await user2.type(area, 'oi{Enter}tudo bem')
    expect(area.value).toBe('oi\ntudo bem')
    expect(api.chatStream).not.toHaveBeenCalled()
    await user2.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(api.chatStream).toHaveBeenCalledWith('oi\ntudo bem', expect.anything(), expect.anything()))
  })

  it('Enviar fica desligado sem texto; durante a resposta o botão vira Parar e a resposta fica marcada como interrompida', async () => {
    api.chatStream.mockImplementation((_m: string, h: any, signal: AbortSignal) => new Promise((_res, rej) => {
      h.onDelta('Parcial')
      signal.addEventListener('abort', () => rej(Object.assign(new Error('abortado'), { name: 'AbortError' })))
    }))
    const user = open('#conversar')
    const enviar = await screen.findByRole('button', { name: 'Enviar' })
    expect((enviar as HTMLButtonElement).disabled).toBe(true)
    await typeIn(user, 'conta uma história')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await user.click(await screen.findByRole('button', { name: 'Parar' }))
    expect(await screen.findByText('Resposta interrompida.')).toBeTruthy()
    expect(screen.getByText('Parcial')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeTruthy()
  })

  it('falha do Hermes mostra erro com tentar de novo e reenvia a mesma mensagem', async () => {
    api.chatStream.mockImplementationOnce(async (_m: string, h: any) => { h.onError('Não consegui falar com a Makima agora. Tente de novo em instantes.') })
    api.chatStream.mockImplementationOnce(async (_m: string, h: any) => { h.onDelta('Pronto.'); h.onDone() })
    const user = open('#conversar')
    await typeIn(user, 'oi')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/Não consegui falar com a Makima/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Pronto.')).toBeTruthy()
    expect(api.chatStream.mock.calls.map((c) => c[0])).toEqual(['oi', 'oi'])
  })

  it('"Limpar conversa" fica longe do botão de enviar e pede confirmação', async () => {
    api.chatHistory.mockResolvedValue({ messages: [{ id: 1, role: 'assistant', content: 'Oi!', actions: [] }] })
    api.chatClear.mockResolvedValue({ status: 'ok', removed: 1 })
    const user = open('#conversar')
    await screen.findByText('Oi!')
    const limpar = screen.getByRole('button', { name: /Limpar conversa/ })
    expect(limpar.closest('form')).toBeNull() // não está dentro do compositor
    await user.click(limpar)
    await user.click(await screen.findByRole('button', { name: 'Limpar' }))
    await waitFor(() => expect(api.chatClear).toHaveBeenCalled())
  })

  it('reabrir a aba mostra a conversa na hora, sem esqueleto', async () => {
    api.chatHistory.mockResolvedValue({ messages: [{ id: 1, role: 'assistant', content: 'Primeira vez', actions: [] }] })
    open('#conversar')
    await screen.findByText('Primeira vez')
    cleanup()
    api.chatHistory.mockImplementation(() => new Promise(() => {})) // servidor lento
    api.chatStatus.mockImplementation(() => new Promise(() => {}))
    open('#conversar')
    expect(screen.getByText('Primeira vez')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Abrindo a conversa…' })).toBeNull()
  })
})
