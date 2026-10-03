// @vitest-environment jsdom
// A Nami nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada.
// Cobre o que mais importa para o uso: lançar pela linha rápida (e desfazer), pessoa nunca salva direto,
// pagar conta/fatura, validação do formulário e o primeiro uso sem contas.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const api = vi.hoisted(() => ({
  getAccounts: vi.fn(), getCards: vi.fn(), getCategories: vi.fn(), getPlan: vi.fn(), listTransactions: vi.fn(), suggestEntry: vi.fn(),
  createTransaction: vi.fn(), createInstallment: vi.fn(), createTransfer: vi.fn(), updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(), deleteInstallment: vi.fn(), deleteTransfer: vi.fn(),
  paySubscription: vi.fn(), payCardBill: vi.fn(), skipSubscriptionCycle: vi.fn(),
  exportTransactionsUrl: vi.fn(() => '/api/finances/transactions/export'),
}))
vi.mock('./namiApi', () => ({ namiApi: api }))
vi.mock('../komi/komiApi', () => ({ komiApi: { search: vi.fn(async () => ({ matches: [] })), create: vi.fn() } }))
const createReminder = vi.hoisted(() => vi.fn(async () => ({ status: 'ok', id: 1, duplicate: false })))
vi.mock('../kaguya/kaguyaApi', () => ({ kaguyaApi: { createReminder } }))

import { NamiShell } from './NamiShell'

const ACCOUNTS = [
  { id: 'a1', name: 'Itaú', type: 'corrente', balance_inicial: 0, status: 'ativo' },
  { id: 'a2', name: 'NuConta', type: 'corrente', balance_inicial: 0, status: 'ativo' },
]
const CARDS = [{ id: 'c1', name: 'Nubank', account_id: 'a1', limite: 5000, closing_day: 6, due_day: 13, status: 'ativo' }]
const CATEGORIES = [
  { id: 'Comer Fora', name: 'Comer Fora', icon: '', color: '', kind: 'out' },
  { id: 'Supermercado', name: 'Supermercado', icon: '', color: '', kind: 'out' },
  { id: 'Receita', name: 'Receita', icon: '', color: '', kind: 'in' },
]
const PLAN = {
  month: '2026-10', is_current: true, renda_recebida: 5200, renda_pendente: 0, renda_total: 5200, gasto: 2380.5, agendado: 410, pendente: 640,
  a_sair: 1050, livre: 1769.5, livre_por_dia: 63.2, dias_restantes: 28, estourou: false,
  barra: { gasto: 2380.5, a_sair: 1050, livre: 1769.5 }, saldo_contas: 4120.35,
  a_pagar: [
    { kind: 'conta', id: 's1', name: 'Internet', valor: 119.9, due: '2026-09-30', status: 'atrasada' },
    { kind: 'fatura', id: 'c1', name: 'Fatura Nubank', valor: 1840.9, due: '2026-10-08', status: 'pendente', invoice: '2026-10' },
  ],
  top_categorias: [{ categoria: 'Supermercado', total: 312.4, pct: 100 }],
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockClear())
  api.getAccounts.mockResolvedValue({ accounts: ACCOUNTS })
  api.getCards.mockResolvedValue({ cards: CARDS })
  api.getCategories.mockResolvedValue(CATEGORIES)
  api.getPlan.mockResolvedValue(PLAN)
  api.listTransactions.mockResolvedValue({ transactions: [], has_more: false })
  api.suggestEntry.mockResolvedValue({ suggestions: [] })
  api.createTransaction.mockResolvedValue({ status: 'ok', id: 'tx-1' })
  api.createInstallment.mockResolvedValue({ status: 'ok', group_id: 'g-1' })
  api.createTransfer.mockResolvedValue({ status: 'ok', transfer_id: 't-1' })
  api.updateTransaction.mockResolvedValue({ status: 'ok' })
  api.deleteTransaction.mockResolvedValue({ status: 'ok' })
  api.deleteTransfer.mockResolvedValue({ status: 'ok', deleted: 2 })
  api.paySubscription.mockResolvedValue({ status: 'ok', transaction_id: 'tx-9' })
  api.payCardBill.mockResolvedValue({ status: 'ok', transfer_id: 't-2' })
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><NamiShell /></MemoryRouter>)
  await screen.findAllByText(/1\.769,50/)        // o hero com o "livre pra gastar" (e a legenda da barra) apareceu
  return user
}
const captureInput = () => screen.getByLabelText('Lançar um gasto ou entrada em uma linha')

describe('Início', () => {
  it('mostra o livre do mês, por dia, e o que há para pagar (atrasada em destaque)', async () => {
    await open()
    expect(screen.getByText(/63,20 por dia nos próximos 28 dias/)).toBeTruthy()
    expect(screen.getByText(/Saldo nas contas/)).toBeTruthy()
    const row = screen.getByText('Internet').closest('.ds-lrow') as HTMLElement
    expect(within(row).getByText('Atrasada')).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Paguei' })).toBeTruthy()
    expect(within(screen.getByText('Fatura Nubank').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: 'Pagar' })).toBeTruthy()
  })

  it('primeiro uso, sem contas: convida a cadastrar a primeira', async () => {
    api.getAccounts.mockResolvedValue({ accounts: [] })
    api.getCards.mockResolvedValue({ cards: [] })
    render(<MemoryRouter><NamiShell /></MemoryRouter>)
    expect(await screen.findByText('Comece cadastrando uma conta')).toBeTruthy()
  })

  it('erro ao carregar mostra o estado de erro com "Tentar de novo"', async () => {
    api.getPlan.mockRejectedValue(new Error('offline'))
    render(<MemoryRouter><NamiShell /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})

describe('linha rápida', () => {
  it('"45 ifood @nubank" salva no cartão e o "Desfazer" do aviso apaga exatamente esse lançamento', async () => {
    const user = await open()
    await user.type(captureInput(), '45 ifood @nubank{Enter}')
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledTimes(1))
    expect(api.createTransaction.mock.calls[0][0]).toMatchObject({ name: 'ifood', valor: 45, tipo: 'Despesa', card_id: 'c1', categoria: 'Inbox' })
    expect(api.createTransaction.mock.calls[0][0]).not.toHaveProperty('conta')

    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.deleteTransaction).toHaveBeenCalledWith('tx-1'))
  })

  it('usa a categoria e o cartão do lançamento parecido que já existe', async () => {
    api.suggestEntry.mockResolvedValue({ suggestions: [{ name: 'ifood', tipo: 'Despesa', categoria: 'Comer Fora', valor: 45, conta: 'Nubank', account_id: null, card_id: 'c1' }] })
    const user = await open()
    await user.type(captureInput(), '45 ifood{Enter}')            // sem @: origem padrão (Itaú); categoria vem do histórico
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalled())
    expect(api.createTransaction.mock.calls[0][0]).toMatchObject({ categoria: 'Comer Fora', conta: 'Itaú' })
  })

  it('"1200 tv 10x" cria um parcelamento com o total', async () => {
    const user = await open()
    await user.type(captureInput(), '1200 tv 10x @nubank{Enter}')
    await waitFor(() => expect(api.createInstallment).toHaveBeenCalledTimes(1))
    expect(api.createInstallment.mock.calls[0][0]).toMatchObject({ name: 'tv', valor_total: 1200, num_parcelas: 10, card_id: 'c1' })
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('"+3500 salário @itau" é uma entrada em conta', async () => {
    const user = await open()
    await user.type(captureInput(), '+3500 salário @itau{Enter}')
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalled())
    expect(api.createTransaction.mock.calls[0][0]).toMatchObject({ tipo: 'Receita', valor: 3500, categoria: 'Receita', conta: 'Itaú' })
  })

  it('"+Ana" NUNCA salva direto: abre o formulário preenchido para confirmar a pessoa', async () => {
    const user = await open()
    await user.type(captureInput(), '25 almoço +Ana{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Novo gasto' })).toBeTruthy()
    expect((screen.getByLabelText('Descrição') as HTMLInputElement).value).toBe('almoço')
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('"@nu" é ambíguo (Nubank e NuConta): não chuta, abre o formulário e avisa', async () => {
    const user = await open()
    await user.type(captureInput(), '45 ifood @nu{Enter}')
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(await screen.findByText(/Não achei a conta ou cartão/)).toBeTruthy()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('Shift+Enter sempre abre o formulário, mesmo com tudo certo', async () => {
    const user = await open()
    await user.type(captureInput(), '45 ifood @nubank{Shift>}{Enter}{/Shift}')
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })
})

describe('lembrete na Kaguya', () => {
  it('"Lembrar" numa conta cria a tarefa com o vencimento e o valor, uma vez só', async () => {
    const user = await open()
    const botao = within(screen.getByText('Internet').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: 'Lembrar de Internet na Kaguya' })
    await user.click(botao)
    await waitFor(() => expect(createReminder).toHaveBeenCalledWith({ title: 'Pagar Internet', due_date: '2026-09-30', amount: 119.9 }))
    expect(await screen.findByText('Lembrete criado na Kaguya')).toBeTruthy()
    expect((within(screen.getByText('Internet').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: /Lembrete de Internet criado/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('o título da fatura vem do nome do cartão', async () => {
    const user = await open()
    await user.click(within(screen.getByText('Fatura Nubank').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: /Lembrar de Fatura Nubank/ }))
    await waitFor(() => expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pagar fatura Nubank', amount: 1840.9 })))
  })
})

describe('formulário de lançamento', () => {
  const openForm = async () => {
    const user = await open()
    await user.click(screen.getAllByRole('button', { name: /^Lançar/ })[0])
    return { user, dialog: await screen.findByRole('dialog', { name: 'Novo gasto' }) }
  }

  it('sem valor não salva e mostra o erro no campo certo', async () => {
    const { user, dialog } = await openForm()
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialog).findByText('Informe um valor maior que zero.')).toBeTruthy()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('transferir para um cartão é pagar a fatura (e fecha o formulário ao salvar)', async () => {
    const { user, dialog } = await openForm()
    await user.click(within(dialog).getByRole('button', { name: /Transferência/ }))
    await user.type(within(dialog).getByLabelText('Valor'), '500')
    await user.selectOptions(within(dialog).getByLabelText('Para'), 'card:c1')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createTransfer).toHaveBeenCalledTimes(1))
    expect(api.createTransfer.mock.calls[0][0]).toMatchObject({ from_account: 'Itaú', to_card: 'Nubank', valor: 500 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('parcelas mostram a prévia de cada parcela e do total', async () => {
    const { user, dialog } = await openForm()
    await user.type(within(dialog).getByLabelText('Valor'), '1200')
    const parcelas = within(dialog).getByLabelText('Parcelas')
    await user.clear(parcelas)
    await user.type(parcelas, '10')
    expect(await within(dialog).findByText(/10x de .*120,00 — total .*1\.200,00/)).toBeTruthy()
  })
})

describe('pagar', () => {
  it('"Paguei" numa conta fixa confirma com o valor real e a data de hoje', async () => {
    const user = await open()
    await user.click(within(screen.getByText('Internet').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: 'Paguei' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar Internet' })
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(api.paySubscription).toHaveBeenCalledTimes(1))
    expect(api.paySubscription).toHaveBeenCalledWith('s1', { valor: 119.9, data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), conta: undefined })
  })

  it('"Pular este mês" não lança despesa', async () => {
    const user = await open()
    await user.click(within(screen.getByText('Internet').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: 'Paguei' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pular este mês' }))
    await waitFor(() => expect(api.skipSubscriptionCycle).toHaveBeenCalledWith('s1'))
    expect(api.paySubscription).not.toHaveBeenCalled()
  })

  it('"Pagar" a fatura sai da conta vinculada ao cartão e o aviso desfaz o par', async () => {
    const user = await open()
    await user.click(within(screen.getByText('Fatura Nubank').closest('.ds-lrow') as HTMLElement).getByRole('button', { name: 'Pagar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pagar fatura do Nubank' })
    expect((within(dialog).getByLabelText('Pago com') as HTMLSelectElement).value).toBe('Itaú')   // conta vinculada
    await user.click(within(dialog).getByRole('button', { name: 'Pagar' }))
    await waitFor(() => expect(api.payCardBill).toHaveBeenCalledWith('c1', 1840.9, { data: expect.any(String), fromAccount: 'Itaú' }))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.deleteTransfer).toHaveBeenCalledWith('t-2'))
  })
})

describe('navegação', () => {
  it('abre direto na tela pedida pelo hash (#lancamentos)', async () => {
    window.location.hash = '#lancamentos'
    render(<MemoryRouter><NamiShell /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'Lançamentos' })).toBeTruthy()
  })

  it('o modo privacidade esconde os valores', async () => {
    localStorage.setItem('ds:prefs:nami', JSON.stringify({ hide: true, lastSource: '', art: 'default' }))
    render(<MemoryRouter><NamiShell /></MemoryRouter>)
    await screen.findAllByText(/R\$ •••••/)
    expect(screen.queryAllByText(/1\.769,50/)).toHaveLength(0)
  })
})
