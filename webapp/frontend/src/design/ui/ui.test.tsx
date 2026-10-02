// @vitest-environment jsdom
// Testes dos componentes do Design System: renderização, teclado, acessibilidade (axe) e comportamento.

import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { mockLayoutApis, mockMatchMedia, setMockWidth, stripIds } from '../test-utils'
import {
  AppShell, BackToMakima, Button, ConfirmHost, DataTable, DatePicker, EmptyState, ErrorState, Field, Heatmap, Input, LoadingState, MediaCard, Modal, PersonPicker,
  QuickCapture, RateInput, Stars, StatsPage, Tabs, ToastHost, confirm, createCaptureParser, toast, undoLast, type PersonOption, type StatsPayload,
} from '../index'
import { __resetToasts } from '../headless/toast'

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const violations = async (container: HTMLElement) => {
  const r = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)
}

// ── estrelas ─────────────────────────────────────────────────────────────────

describe('Stars: 0 a 5 com meia estrela', () => {
  const width = (c: HTMLElement) => (c.querySelector('.ds-st-fill') as HTMLElement).style.width

  it('corta a camada preenchida na nota exata', () => {
    const { container } = render(<Stars value={3.5} />)
    expect(screen.getByRole('img', { name: '3.5 de 5' })).toBeTruthy()
    expect(width(container)).toBe('70%')
  })
  it('arredonda para a meia estrela mais próxima (3.7 → 3.5)', () => {
    const { container } = render(<Stars value={3.7} />)
    expect(width(container)).toBe('70%')
  })
  it('sem nota e limites', () => {
    const a = render(<Stars value={0} />)
    expect(screen.getByRole('img', { name: 'sem nota' })).toBeTruthy()
    expect(width(a.container)).toBe('0%')
    a.unmount()
    expect(width(render(<Stars value={9} />).container)).toBe('100%')
    cleanup()
    expect(width(render(<Stars value={null} />).container)).toBe('0%')
  })
  it('cada meio-passo de 0 a 5 renderiza o corte certo', () => {
    for (let v = 0; v <= 5; v += 0.5) {
      const { container, unmount } = render(<Stars value={v} />)
      expect(width(container)).toBe(`${(v / 5) * 100}%`)
      unmount()
    }
  })
})

describe('RateInput', () => {
  const halves = (c: HTMLElement, star: number) => ({
    l: c.querySelectorAll('.ds-rs')[star - 1].querySelector('.ds-h.ds-l') as HTMLElement,
    r: c.querySelectorAll('.ds-rs')[star - 1].querySelector('.ds-h.ds-r') as HTMLElement,
  })

  it('metade esquerda grava n−0.5; direita grava n', () => {
    const onChange = vi.fn()
    const { container } = render(<RateInput value={0} onChange={onChange} />)
    fireEvent.click(halves(container, 3).r)
    fireEvent.click(halves(container, 3).l)
    fireEvent.click(halves(container, 1).l)
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([3, 2.5, 0.5])
  })
  it('passar o mouse mostra prévia sem gravar; sair volta ao valor', () => {
    const onChange = vi.fn()
    const { container } = render(<RateInput value={2} onChange={onChange} />)
    const fill = (n: number) => (container.querySelectorAll('.ds-fw')[n - 1] as HTMLElement).style.width
    fireEvent.mouseEnter(halves(container, 4).l)
    expect(fill(4)).toBe('50%')
    fireEvent.mouseLeave(screen.getByRole('slider'))
    expect(fill(4)).toBe('0%')
    expect(onChange).not.toHaveBeenCalled()
  })
  it('teclado: setas de 0,5 em 0,5, Home, End e números', () => {
    const onChange = vi.fn()
    render(<RateInput value={3} onChange={onChange} />)
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('aria-valuenow')).toBe('3')
    expect(slider.getAttribute('aria-valuetext')).toBe('3.0 de 5')
    for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End', '4']) fireEvent.keyDown(slider, { key: k })
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([3.5, 2.5, 0, 5, 4])
  })
  it('limpar grava 0; sem nota não mostra o botão', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RateInput value={4} onChange={onChange} />)
    fireEvent.click(screen.getByText('limpar'))
    expect(onChange).toHaveBeenCalledWith(0)
    rerender(<RateInput value={0} onChange={onChange} />)
    expect(screen.queryByText('limpar')).toBeNull()
  })
})

// ── formulário ───────────────────────────────────────────────────────────────

describe('Field e campos', () => {
  it('liga label, erro e aria', () => {
    render(<Field label="Título" error="Informe um título">{(a) => <Input {...a} />}</Field>)
    const input = screen.getByLabelText('Título')
    const alert = screen.getByRole('alert')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(alert.id)
    expect(alert.textContent).toBe('Informe um título')
  })
  it('dica aparece quando não há erro', () => {
    render(<Field label="Local" hint="Onde foi">{(a) => <Input {...a} />}</Field>)
    expect(screen.getByText('Onde foi')).toBeTruthy()
    expect(screen.getByLabelText('Local').getAttribute('aria-invalid')).toBeNull()
  })
})

describe('DatePicker (sem input nativo)', () => {
  function Host({ onChange }: { onChange: (v: string) => void }) {
    const [v, setV] = useState('2026-10-02')
    return <DatePicker value={v} onChange={(x) => { setV(x); onChange(x) }} />
  }
  it('abre o calendário, escolhe um dia e fecha', async () => {
    const onChange = vi.fn()
    const { container } = render(<Host onChange={onChange} />)
    expect(container.querySelector('input[type="date"]')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /2 de out/ }))
    const dialog = screen.getByRole('dialog', { name: 'Escolher data' })
    expect(within(dialog).getByText('outubro de 2026')).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: '15' }))
    expect(onChange).toHaveBeenCalledWith('2026-10-15')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('Esc fecha e navega entre meses', async () => {
    render(<Host onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /2 de out/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(screen.getByText('novembro de 2026')).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('PersonPicker (smart-match da Komi)', () => {
  const PEOPLE: PersonOption[] = [{ id: '1', name: 'Ana Souza' }, { id: '2', name: 'Ana Beatriz Lima' }, { id: '3', name: 'Lia Cardoso' }]
  const search = (q: string) => PEOPLE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))

  it('2+ resultados: pede para escolher e nunca vincula sozinho', async () => {
    const onChange = vi.fn()
    render(<PersonPicker value={[]} onChange={onChange} search={search} />)
    await userEvent.type(screen.getByLabelText('Buscar pessoa'), 'Ana')
    expect(await screen.findByText('2 pessoas parecidas. Escolha uma.')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('option', { name: /Ana Beatriz/ }))
    expect(onChange).toHaveBeenCalledWith([PEOPLE[1]])
  })
  it('1 resultado: confirma ("Encontrei …") e só vincula ao clicar', async () => {
    const onChange = vi.fn()
    render(<PersonPicker value={[]} onChange={onChange} search={search} />)
    await userEvent.type(screen.getByLabelText('Buscar pessoa'), 'Lia')
    expect(await screen.findByText('Encontrei Lia Cardoso.')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })
  it('0 resultados: oferece cadastrar', async () => {
    const onChange = vi.fn()
    const onCreate = vi.fn((name: string) => ({ id: 'n', name }))
    render(<PersonPicker value={[]} onChange={onChange} search={search} onCreate={onCreate} />)
    await userEvent.type(screen.getByLabelText('Buscar pessoa'), 'Zeca')
    expect(await screen.findByText('Nenhuma pessoa encontrada.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Cadastrar “Zeca”/ }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ id: 'n', name: 'Zeca' }]))
  })
})

// ── camadas e feedback ───────────────────────────────────────────────────────

describe('Toast e desfazer', () => {
  it('mostra, desfaz pelo botão e some', async () => {
    const undo = vi.fn()
    render(<ToastHost />)
    act(() => { toast('Treino excluído', { undo }) })
    expect(screen.getByText('Treino excluído')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Treino excluído')).toBeNull()
  })
  it('undoLast (Ctrl+Z) desfaz o aviso mais recente', () => {
    const a = vi.fn(), b = vi.fn()
    render(<ToastHost />)
    act(() => { toast('um', { undo: a }); toast('dois', { undo: b }) })
    act(() => { expect(undoLast()).toBe(true) })
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    act(() => { undoLast(); expect(undoLast()).toBe(false) })
  })
  it('erro usa role=alert', () => {
    render(<ToastHost />)
    act(() => { toast('Falhou', { tone: 'error' }) })
    expect(screen.getByRole('alert').textContent).toContain('Falhou')
  })
})

describe('ConfirmHost (substitui window.confirm)', () => {
  it('perigo: o foco inicial é Cancelar; confirmar resolve true', async () => {
    render(<ConfirmHost />)
    let p!: Promise<boolean>
    act(() => { p = confirm({ title: 'Excluir?', body: 'Não dá para desfazer.', confirmLabel: 'Excluir', danger: true }) })
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    expect(document.activeElement).toBe(cancel)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    await expect(p).resolves.toBe(true)
  })
  it('Esc cancela', async () => {
    render(<ConfirmHost />)
    let p!: Promise<boolean>
    act(() => { p = confirm({ title: 'Sair?' }) })
    await userEvent.keyboard('{Escape}')
    await expect(p).resolves.toBe(false)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('Modal', () => {
  it('é um diálogo nomeado, prende o foco e fecha com Esc', async () => {
    const onClose = vi.fn()
    render(<Modal title="Editar treino" onClose={onClose}><input aria-label="campo" /></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Editar treino' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
  it('com alterações pendentes pede confirmação antes de fechar', async () => {
    const onClose = vi.fn()
    render(<><Modal title="Editar" onClose={onClose} dirty><input aria-label="campo" /></Modal><ConfirmHost /></>)
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('Descartar alterações?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('estados', () => {
  it('carregando, vazio e erro', async () => {
    const retry = vi.fn()
    const { unmount } = render(<LoadingState />)
    expect(screen.getByRole('status', { name: 'Carregando…' })).toBeTruthy()
    unmount()
    render(<><EmptyState title="Nenhum treino ainda" hint="Registre o primeiro." /><ErrorState onRetry={retry} /></>)
    expect(screen.getByText('Nenhum treino ainda')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(retry).toHaveBeenCalled()
  })
})

// ── itens, abas e tabela ─────────────────────────────────────────────────────

describe('Tabs, MediaCard e DataTable', () => {
  it('Tabs: setas, Home/End e roving tabindex', () => {
    const tabs = [{ id: 'a', label: 'Visão geral' }, { id: 'b', label: 'Atividade' }, { id: 'c', label: 'Notas' }]
    function Host() { const [v, setV] = useState('a'); return <Tabs tabs={tabs} value={v} onChange={setV} label="Seções" /> }
    render(<Host />)
    const tab = (n: string) => screen.getByRole('tab', { name: n })
    expect(tab('Visão geral').getAttribute('tabindex')).toBe('0')
    expect(tab('Atividade').getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(tab('Atividade').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' })
    expect(tab('Notas').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(tab('Visão geral').getAttribute('aria-selected')).toBe('true')
  })
  it('MediaCard abre com Enter e Espaço', () => {
    const onOpen = vi.fn()
    render(<MediaCard title="Peito e tríceps" icon="workout" hue={300} rating={4.5} onOpen={onOpen} />)
    const card = screen.getByRole('button', { name: 'Peito e tríceps' })
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledTimes(3)
  })
  it('DataTable vira cartões no celular: cada célula tem seu rótulo', () => {
    const { container } = render(<DataTable caption="Treinos" rows={[{ id: 1, t: 'A', n: 3 }]} rowKey={(r) => r.id} columns={[{ id: 't', header: 'Treino', render: (r) => r.t }, { id: 'n', header: 'Nota', render: (r) => r.n }]} />)
    expect(container.querySelector('table')!.getAttribute('data-mobile')).toBe('cards')
    expect([...container.querySelectorAll('td')].map((td) => td.getAttribute('data-label'))).toEqual(['Treino', 'Nota'])
  })
})

// ── mapa de calor por mês (modelo da Frieren) ────────────────────────────────

describe('Heatmap: um bloco por mês', () => {
  it('12 meses, semanas completas, nível e futuro marcados', () => {
    const { container } = render(<Heatmap year={2026} today="2026-10-02" daily={[{ date: '2026-10-01', value: 75 }]} formatValue={(v) => `${v} min`} />)
    const months = container.querySelectorAll('.ds-hm-mo')
    expect(months).toHaveLength(12)
    expect([...container.querySelectorAll('.ds-hm-name')].slice(0, 3).map((n) => n.textContent)).toEqual(['jan', 'fev', 'mar'])
    months.forEach((m) => expect(m.querySelectorAll('.ds-hm-cells > i').length % 7).toBe(0))
    const oct1 = container.querySelector('[title="01/10: 75 min"]')!
    expect(oct1.className).toContain('ds-l3')
    expect(container.querySelector('[title="03/10: sem registro"]')!.className).toContain('ds-fut')
  })
})

// ── captura rápida ───────────────────────────────────────────────────────────

describe('QuickCapture', () => {
  const parser = createCaptureParser({ rules: ['place', 'tag', 'rating', 'sets', 'load', 'date'], dateDirection: 'past', orphanTime: true, today: '2026-10-02' })
  const setup = (submit: (r: unknown) => boolean | void = () => {}) => {
    const onSubmit = vi.fn(submit)
    const onExpand = vi.fn()
    render(<QuickCapture parser={parser} placeholder="Ex.: Supino" label="Registrar treino" onSubmit={onSubmit} onExpand={onExpand} today="2026-10-02" />)
    return { onSubmit, onExpand, input: screen.getByLabelText('Registrar treino') as HTMLInputElement }
  }

  it('mostra chips do que foi entendido e destaca os tokens', async () => {
    const { input } = setup()
    await userEvent.type(input, 'Supino 4x8 80kg @Smart-Fit #peito ★4.5 ontem')
    const chips = within(document.querySelector('.ds-qc-chips') as HTMLElement)
    for (const label of ['Smart Fit', '#peito', '4×8 · 80 kg', 'ontem', '4.5 / 5']) expect(chips.getByText(label, { exact: false })).toBeTruthy()
    expect(document.querySelectorAll('.ds-qc-mirror .ds-tk').length).toBe(6)
  })
  it('remover um chip tira o token do texto', async () => {
    const { input } = setup()
    await userEvent.type(input, 'Supino @Smart-Fit #peito')
    await userEvent.click(screen.getByRole('button', { name: 'Remover Smart Fit' }))
    expect(input.value).toBe('Supino #peito')
  })
  it('Enter salva e limpa; devolver false mantém o texto; Shift+Enter expande', async () => {
    const a = setup()
    await userEvent.type(a.input, 'Supino ★4.5{Enter}')
    expect(a.onSubmit).toHaveBeenCalledTimes(1)
    expect((a.onSubmit.mock.calls[0][0] as { fields: { title: string; rating: number } }).fields).toMatchObject({ title: 'Supino', rating: 4.5 })
    expect(a.input.value).toBe('')
    cleanup()
    const b = setup(() => false)
    await userEvent.type(b.input, 'curto{Enter}')
    expect(b.input.value).toBe('curto')
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    expect(b.onExpand).toHaveBeenCalledTimes(1)
    expect(b.input.value).toBe('')
  })
})

// ── estatísticas ─────────────────────────────────────────────────────────────

describe('StatsPage', () => {
  const payload: StatsPayload = {
    period: { year: 2026, label: '2026, até aqui' },
    previous: { label: '2025' },
    kpis: [{ key: 'a', label: 'Treinos', value: 110, prev: 100 }, { key: 'b', label: 'Nota média', value: 4.2, decimals: 1, prev: 4.0, absoluteDelta: true }],
    daily: [{ date: '2026-10-01', value: 60 }],
    monthly: [{ month: 1, value: 10 }, { month: 2, value: 20 }],
    monthlyUnit: 'treinos',
    distribution: [],
    rankings: { types: { title: 'Tipos', items: [{ label: 'Força', count: 5 }] } },
    records: [{ label: 'Maior sequência', value: '7 dias' }],
    moments: [],
  }
  const page = (p: StatsPayload | null, onYear = () => {}) => (
    <StatsPage payload={p} hero={{ eyebrow: 'Seu ano em treino', summary: <span>resumo</span> }} minYear={2025} maxYear={2026} onYear={onYear} today="2026-10-02" ratings={[5, 4.5, 2.5, 0.5]} />
  )

  it('compõe as seções na ordem do padrão, com delta e histograma completo', () => {
    const { container } = render(page(payload))
    expect(screen.getByText('Seu ano em treino')).toBeTruthy()
    expect(screen.getByText('Dias com registro')).toBeTruthy()
    expect(container.querySelectorAll('.ds-bcol')).toHaveLength(12)
    expect(container.querySelectorAll('.ds-drow')).toHaveLength(10)
    expect(container.querySelector('.ds-delta.ds-up')!.textContent).toContain('10%')
    expect(screen.getByText('Maior sequência')).toBeTruthy()
    const headings = [...container.querySelectorAll('h3')].map((h) => h.textContent)
    expect(headings.indexOf('Dias com registro')).toBeLessThan(headings.indexOf('Ritmo por mês'))
    expect(headings.indexOf('Ritmo por mês')).toBeLessThan(headings.indexOf('Tipos'))
  })
  it('seletor de ano respeita os limites e muda o período', async () => {
    const onYear = vi.fn()
    render(page(payload, onYear))
    expect(screen.getByRole('button', { name: 'Próximo ano' }).hasAttribute('disabled')).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Ano anterior' }))
    expect(onYear).toHaveBeenCalledWith(2025)
  })
  it('período sem registros mostra estado vazio', () => {
    render(page(null))
    expect(screen.getByText('Sem registros em 2026')).toBeTruthy()
  })
})

// ── AppShell ─────────────────────────────────────────────────────────────────

function Shell({ onGoAgent = () => {}, onNavigate = () => {}, primary = () => {}, art }: { onGoAgent?: (r: string, a?: { id: string; name: string }) => void; onNavigate?: (id: string) => void; primary?: () => void; art?: string }) {
  return (
    <AppShell
      embedded
      agent={{ id: 'nami', name: 'Nami', subtitle: 'Finanças' }}
      nav={[{ label: 'Seções', items: [{ id: 'home', label: 'Início', icon: 'home', key: 'h' }, { id: 'list', label: 'Lista', icon: 'list', key: 't' }] }]}
      active="home"
      onNavigate={onNavigate}
      primary={{ label: 'Novo item', icon: 'add', key: 'n', onClick: primary }}
      title="Início"
      subtitle="Hoje"
      search={{ placeholder: 'Buscar itens…', onSubmit: () => {} }}
      onGoAgent={onGoAgent}
      artValue={art}
      preferences={<p>Preferências do agente</p>}
    >
      <p>conteúdo da página</p>
    </AppShell>
  )
}

describe('AppShell', () => {
  it('anatomia fixa: marca, CTA, navegação, voltar à Makima e seletor de agentes', () => {
    render(<Shell />)
    expect(screen.getByRole('link', { name: /Voltar à Makima/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ir para outro agente' })).toBeTruthy()
    const nav = within(screen.getByRole('navigation', { name: 'Seções' }))
    expect(nav.getByRole('button', { name: 'Início' }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('button', { name: 'Lista' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' }).getAttribute('href')).toBe('#ds-content')
    expect(screen.getByRole('main').id).toBe('ds-content')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Início')
  })
  it('celular (< 640px): a sidebar vira gaveta fechada; o menu abre e Esc fecha; barra inferior e FAB existem', async () => {
    setMockWidth(390)
    const { container } = render(<Shell />)
    const side = container.querySelector('aside.ds-side') as HTMLElement
    expect(side.getAttribute('aria-hidden')).toBe('true')
    expect(side.hasAttribute('inert')).toBe(true)
    const bottom = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
    for (const n of ['Início', 'Lista', 'Mais']) expect(bottom.getByRole('button', { name: n })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Novo item' }).length).toBeGreaterThanOrEqual(2)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(side.hasAttribute('inert')).toBe(false)
    expect(container.querySelector('.ds-app')!.className).toContain('ds-drawer-open')
    await userEvent.keyboard('{Escape}')
    expect(container.querySelector('.ds-app')!.className).not.toContain('ds-drawer-open')
  })
  it('Voltar à Makima navega sem recarregar', async () => {
    const onGo = vi.fn()
    render(<Shell onGoAgent={onGo} />)
    await userEvent.click(screen.getByRole('link', { name: /Voltar à Makima/ }))
    expect(onGo).toHaveBeenCalledWith('/', { id: 'makima', name: 'Makima' })
  })
  it('seletor de agentes: lista todos, marca o atual, desabilita os "em breve", teclado e Esc', async () => {
    const onGo = vi.fn()
    render(<Shell onGoAgent={onGo} />)
    const btn = screen.getByRole('button', { name: 'Ir para outro agente' })
    await userEvent.click(btn)
    const menu = screen.getByRole('menu', { name: 'Ir para outro agente' })
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const names = within(menu).getAllByRole('menuitem').map((i) => i.textContent)
    for (const n of ['Nami', 'Kaguya', 'Frieren', 'Akane', 'Marin', 'Mai', 'Komi', 'Violet', 'Yato', 'Kurisu', 'Lucy']) expect(names.some((t) => t?.includes(n)), n).toBe(true)
    const nami = within(menu).getByRole('menuitem', { name: /Nami/ })
    expect(nami.getAttribute('aria-current')).toBe('true')
    expect(nami.textContent).toContain('Aqui')
    expect((within(menu).getByRole('menuitem', { name: /Kurisu/ }) as HTMLButtonElement).disabled).toBe(true)
    // foco inicial no primeiro agente que não é o atual; setas navegam
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: /Kaguya/ }))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: /Frieren/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(btn)
    await userEvent.click(btn)
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Kaguya/ }))
    expect(onGo).toHaveBeenCalledWith('/tasks', expect.objectContaining({ id: 'kaguya' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('atalhos: N aciona o CTA, mas não dentro de um campo; g + t navega', async () => {
    const primary = vi.fn(), onNavigate = vi.fn()
    render(<Shell primary={primary} onNavigate={onNavigate} />)
    await userEvent.keyboard('n')
    expect(primary).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByLabelText('Buscar itens…'))
    await userEvent.keyboard('n')
    expect(primary).toHaveBeenCalledTimes(1)
    ;(document.activeElement as HTMLElement).blur()
    await userEvent.keyboard('gt')
    expect(onNavigate).toHaveBeenCalledWith('list')
  })
  it('Ctrl+K abre a paleta; busca "kag" e Enter navega; Esc fecha', async () => {
    const onGo = vi.fn()
    render(<Shell onGoAgent={onGo} />)
    await userEvent.keyboard('{Control>}k{/Control}')
    const dialog = screen.getByRole('dialog', { name: 'Paleta de comandos' })
    expect(dialog).toBeTruthy()
    await userEvent.type(within(dialog).getByRole('combobox'), 'kag')
    expect(within(dialog).getByRole('option', { name: /Ir para Kaguya/ })).toBeTruthy()
    await userEvent.keyboard('{Enter}')
    expect(onGo).toHaveBeenCalledWith('/tasks', expect.objectContaining({ id: 'kaguya' }))
    expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).toBeNull()
    await userEvent.keyboard('{Control>}k{/Control}{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).toBeNull()
  })
  it('? abre as preferências com tema, densidade, seção do agente e atalhos no padrão Windows', async () => {
    render(<Shell />)
    await userEvent.keyboard('?')
    const dialog = screen.getByRole('dialog', { name: 'Preferências' })
    for (const t of ['Aparência', 'Tema', 'Densidade', 'Reduzir animações', 'Atalhos']) expect(within(dialog).getAllByText(t).length).toBeGreaterThan(0)
    expect(within(dialog).getByText('Preferências do agente')).toBeTruthy()
    expect(within(dialog).getByText('Ctrl+K')).toBeTruthy()
    expect(within(dialog).queryByText(/⌘/)).toBeNull()
  })
  it('Ctrl+Z desfaz a última ação do aviso', async () => {
    const undo = vi.fn()
    render(<Shell />)
    act(() => { toast('Excluído', { undo }) })
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(undo).toHaveBeenCalledTimes(1)
  })
  it('o estilo de arte muda só o visual: a estrutura do DOM é idêntica', () => {
    const a = render(<Shell />)
    const base = stripIds(a.container.innerHTML)
    a.unmount()
    const b = render(<Shell art="caderno" />)
    expect(b.container.querySelector('.ds-app')!.getAttribute('data-ds-art')).toBe('caderno')
    const withArt = stripIds(b.container.innerHTML).replace(' data-ds-art="caderno"', '')
    expect(withArt).toBe(base)
  })
  it('sem violações de acessibilidade (axe)', async () => {
    const { container } = render(<Shell />)
    expect(await violations(container)).toEqual([])
  })
})

describe('acessibilidade dos componentes soltos (axe)', () => {
  it('formulário, estrelas e tabs', async () => {
    const { container } = render(
      <main>
        <h1>Teste</h1>
        <Field label="Título" hint="Obrigatório">{(a) => <Input {...a} />}</Field>
        <RateInput value={3.5} onChange={() => {}} />
        <Stars value={4} />
        <Tabs tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="a" onChange={() => {}} label="Seções" />
        <div role="tabpanel" id="ds-panel-a" aria-labelledby="ds-tab-a">painel</div>
        <Button>Salvar</Button>
        <BackToMakima />
      </main>,
    )
    expect(await violations(container)).toEqual([])
  })
})
