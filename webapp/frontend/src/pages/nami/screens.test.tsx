// @vitest-environment jsdom
// As telas da Nami (cartões, recorrentes, resumo, contas, orçamentos, parcelamentos, empréstimos, lista de compras)
// pelo shell de verdade, com a API simulada: o que o usuário vê e o que cada ação manda para o servidor.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

vi.mock('./namiApi', async () => ({ namiApi: (await import('./testApi')).makeApi() }))
vi.mock('../komi/komiApi', () => ({ komiApi: { search: vi.fn(async () => ({ matches: [] })), create: vi.fn() } }))

import { NamiShell } from './NamiShell'
import { namiApi } from './namiApi'
import { resetApi, type TestApi } from './testApi'

const api = namiApi as unknown as TestApi

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => resetApi(api))
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = (hash: string) => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><NamiShell /></MemoryRouter>)
  return user
}
const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name })
const DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)

describe('Cartões', () => {
  it('mostra a dívida e o limite usado, e abre uma aba por fatura (a atual selecionada)', async () => {
    const user = open('#cartoes')
    await user.click(await screen.findByRole('button', { name: 'Abrir faturas do Nubank' }))
    expect(await screen.findByRole('tab', { name: 'Set/26' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Out/26 · atual' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('iFood')).toBeTruthy()
    expect(screen.getByText(/· parcela$/)).toBeTruthy()            // a compra parcelada vem marcada
  })

  it('"Pagar fatura" sugere o valor da fatura mais antiga em aberto e sai da conta vinculada', async () => {
    const user = open('#cartoes')
    await user.click(await screen.findByRole('button', { name: 'Abrir faturas do Nubank' }))
    await user.click(await screen.findByRole('button', { name: 'Pagar fatura' }))
    const d = await dialog('Pagar fatura do Nubank')
    expect((within(d).getByLabelText('Valor pago') as HTMLInputElement).value).toBe('640,00')   // a atrasada de setembro
    await user.click(within(d).getByRole('button', { name: 'Pagar' }))
    await waitFor(() => expect(api.payCardBill).toHaveBeenCalledWith('c1', 640, { data: DATE, fromAccount: 'Itaú' }))
  })

  it('novo cartão: valida o limite e cadastra com os 5 campos', async () => {
    const user = open('#cartoes')
    await user.click(await screen.findByRole('button', { name: 'Novo cartão' }))
    const d = await dialog('Novo cartão')
    await user.type(within(d).getByLabelText('Nome'), 'Inter')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(await within(d).findByText('Informe o limite do cartão.')).toBeTruthy()
    expect(api.createCard).not.toHaveBeenCalled()
    await user.type(within(d).getByLabelText('Limite'), '2000')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createCard).toHaveBeenCalledWith({ name: 'Inter', account_name: 'Itaú', limite: 2000, closing_day: 6, due_day: 13 }))
  })
})

describe('Recorrentes', () => {
  it('agrupa em Entradas → Contas fixas → Assinaturas', async () => {
    open('#recorrentes')
    await screen.findByText('Freela')
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(/\d+$/, '').trim())
    expect(headings).toEqual(['Entradas', 'Contas fixas', 'Assinaturas'])
    expect(screen.getByText('Recebida')).toBeTruthy()              // salário já entrou
    expect(screen.getByText('Atrasada')).toBeTruthy()              // internet
  })

  it('"Recebi" confirma a entrada com o valor real', async () => {
    const user = open('#recorrentes')
    await user.click(await screen.findByRole('button', { name: 'Recebi' }))
    const d = await dialog('Receber Freela')
    await user.click(within(d).getByRole('button', { name: 'Recebi' }))
    await waitFor(() => expect(api.paySubscription).toHaveBeenCalledWith('r2', { valor: 800, data: DATE, conta: undefined }))
  })

  it('novo recorrente: conta fixa com vencimento calculado e sem lançar sozinho', async () => {
    const user = open('#recorrentes')
    await user.click(await screen.findByRole('button', { name: 'Novo recorrente' }))
    const d = await dialog('Novo recorrente')
    await user.type(within(d).getByLabelText('Nome'), 'Condomínio')
    await user.type(within(d).getByLabelText('Valor esperado'), '450')
    const day = within(d).getByLabelText('Dia do mês')
    await user.clear(day)
    await user.type(day, '10')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createSubscription).toHaveBeenCalledTimes(1))
    expect(api.createSubscription.mock.calls[0][0]).toMatchObject({
      name: 'Condomínio', valor: 450, ciclo: 'mensal', conta: 'Itaú', kind: 'conta_fixa', categoria: 'Moradia', auto_lancar: false,
      next_billing_day: 10, next_billing: expect.stringMatching(/^\d{4}-\d{2}-10$/),
    })
  })

  it('entrada recorrente só aceita conta (não cartão) e vira kind "renda"', async () => {
    const user = open('#recorrentes')
    await user.click(await screen.findByRole('button', { name: 'Novo recorrente' }))
    const d = await dialog('Novo recorrente')
    await user.click(within(d).getByRole('button', { name: /Entrada/ }))
    const options = within(within(d).getByLabelText('Cai em')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Escolha…', 'Itaú', 'NuConta'])      // sem o Nubank
  })
})

describe('Resumo', () => {
  it('mostra a retrospectiva com o patrimônio real e alterna despesas × entradas', async () => {
    const user = open('#resumo')
    expect(await screen.findByText('Seu dinheiro no ano')).toBeTruthy()
    expect(screen.getByText(/Patrimônio líquido hoje/)).toBeTruthy()
    expect(api.getStats).toHaveBeenCalledWith(expect.any(Number))
    expect(screen.getByText('Gastos por mês')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Entradas' }))
    expect(screen.getByText('Entradas por mês')).toBeTruthy()
  })
})

describe('Contas', () => {
  it('mostra o saldo real, a dívida dos cartões e o patrimônio líquido', async () => {
    open('#contas')
    expect(await screen.findAllByText(/4\.120,35/)).not.toHaveLength(0)
    expect(screen.getByText(/2\.279,45/)).toBeTruthy()             // 4.120,35 − 1.840,90
  })

  it('nova conta exige nome e cadastra com saldo inicial', async () => {
    const user = open('#contas')
    await user.click(await screen.findByRole('button', { name: 'Nova conta' }))
    const d = await dialog('Nova conta')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(await within(d).findByText(/Dê um nome à conta/)).toBeTruthy()
    await user.type(within(d).getByLabelText('Nome'), 'Carteira')
    await user.type(within(d).getByLabelText('Saldo inicial'), '150')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createAccount).toHaveBeenCalledWith({ name: 'Carteira', type: 'corrente', balance_inicial: 150 }))
  })
})

describe('Orçamentos', () => {
  it('lê os envelopes do servidor e destaca quem estourou (a tela antiga ficava sempre vazia)', async () => {
    open('#orcamentos')
    expect(await screen.findByText('Estourou')).toBeTruthy()
    expect(screen.getByText(/restam .*187,60/)).toBeTruthy()
    expect(screen.getByText(/estourou .*62,00/)).toBeTruthy()
  })

  it('novo limite não oferece categorias que já têm limite', async () => {
    const user = open('#orcamentos')
    await screen.findByText('Estourou')                              // espera carregar: o botão do carregamento é trocado
    await user.click(screen.getByRole('button', { name: 'Novo limite' }))
    const d = await dialog('Novo limite')
    expect(within(within(d).getByLabelText('Categoria')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Moradia'])
    await user.type(within(d).getByLabelText('Limite do mês'), '300')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createBudget).toHaveBeenCalledWith({ month: expect.stringMatching(/^\d{4}-\d{2}$/), categoria: 'Moradia', limite: 300 }))
  })

  it('remover pede confirmação e o Desfazer recria o limite', async () => {
    const user = open('#orcamentos')
    await user.click(await screen.findByRole('button', { name: 'Remover limite de Lazer' }))
    await user.click(await screen.findByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(api.deleteBudget).toHaveBeenCalledWith(expect.any(String), 'Lazer'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.createBudget).toHaveBeenCalledWith({ month: expect.any(String), categoria: 'Lazer', limite: 400 }))
  })
})

describe('Parcelamentos', () => {
  it('lista a compra, mostra a linha do tempo e cancela só o que falta (com confirmação)', async () => {
    const user = open('#parcelamentos')
    await user.click(await screen.findByText('TV 55"'))
    const d = await dialog('TV 55"')
    expect(await within(d).findByText(/Parcela 1 de 10/)).toBeTruthy()
    await user.click(within(d).getByRole('button', { name: 'Cancelar o que falta' }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar parcelas' }))
    await waitFor(() => expect(api.cancelInstallment).toHaveBeenCalledWith('g1'))
  })
})

describe('Empréstimos', () => {
  it('registra a parcela e simula a quitação', async () => {
    const user = open('#emprestimos')
    await user.click(await screen.findByRole('button', { name: 'Simular' }))
    const d = await dialog('Simular: Carro Onix')
    await user.click(within(d).getByRole('button', { name: 'Simular' }))
    expect(await within(d).findByText(/economiza R\$ 9\.100,00/)).toBeTruthy()
    expect(api.simulatePayoff).toHaveBeenCalledWith('l1')
    const fechar = within(d).getAllByRole('button', { name: 'Fechar' })
    await user.click(fechar[fechar.length - 1])                    // o do rodapé (o X do cabeçalho tem o mesmo nome)
    await user.click(screen.getByRole('button', { name: 'Paguei a parcela' }))
    await waitFor(() => expect(api.payLoanInstallment).toHaveBeenCalledWith('l1'))
  })

  it('aba "Entre pessoas": quem me deve e registrar parcela recebida', async () => {
    const user = open('#emprestimos')
    await user.click(await screen.findByRole('tab', { name: 'Entre pessoas' }))
    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.getByText('Me devem')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Recebi parcela' }))
    await waitFor(() => expect(api.payPersonalLoanInstallment).toHaveBeenCalledWith('pl1'))
  })
})

describe('Lista de compras', () => {
  it('adiciona itens numa frase, marca no carrinho na hora e finaliza no cartão', async () => {
    const user = open('#lista-compras')
    expect(await screen.findByText('Arroz')).toBeTruthy()
    await user.type(screen.getByLabelText('Adicionar itens à lista'), 'pão, ovos')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(api.addShoppingItems).toHaveBeenCalledWith('sl1', 'pão, ovos'))

    await user.click(screen.getByRole('button', { name: 'Colocar Arroz no carrinho' }))
    expect(await screen.findByText(/2 de 2 no carrinho/)).toBeTruthy()        // otimista: sem esperar o servidor
    expect(api.updateShoppingItem).toHaveBeenCalledWith('it1', { checked: true })

    await user.click(screen.getByRole('button', { name: 'Finalizar compra' }))
    const d = await dialog('Finalizar compra')
    await user.selectOptions(within(d).getByLabelText('Pago com'), 'card:c1')
    await user.click(within(d).getByRole('button', { name: 'Lançar gasto' }))
    await waitFor(() => expect(api.finishShopping).toHaveBeenCalledWith('sl1', { valor_total: 64, card_id: 'c1' }))
  })

  it('se o servidor recusar o item marcado, a tela volta ao que era', async () => {
    api.updateShoppingItem.mockRejectedValue(new Error('offline'))
    const user = open('#lista-compras')
    await user.click(await screen.findByRole('button', { name: 'Colocar Arroz no carrinho' }))
    expect(await screen.findByText('Não foi possível marcar o item.')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/1 de 2 no carrinho/)).toBeTruthy())
  })
})

