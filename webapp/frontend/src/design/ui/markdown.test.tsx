// @vitest-environment jsdom
// MarkdownEditor: leitura renderizada, edição no lugar, checklists clicáveis, callouts e continuação de listas.

import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkdownEditor } from './markdown'

afterEach(cleanup)

/** Controlado como a tela real: guarda o texto e expõe o último commit. */
function Harness({ initial, onCommit }: { initial: string; onCommit?: (v: string) => void }) {
  const [v, setV] = useState(initial)
  return <MarkdownEditor value={v} onChange={setV} onCommit={onCommit} />
}

describe('MarkdownEditor — leitura', () => {
  it('renderiza Markdown (título, negrito, link externo seguro) e mostra a dica de edição', () => {
    render(<MarkdownEditor value={'# Plano\n\nTexto **forte** e [site](https://x.com)'} onChange={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Plano' })).toBeTruthy()
    expect(screen.getByText('forte').tagName).toBe('STRONG')
    const link = screen.getByRole('link', { name: /site/ })
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText('Clique no texto para editar')).toBeTruthy()
  })

  it('vazio mostra o texto de ajuda', () => {
    render(<MarkdownEditor value="" onChange={() => {}} placeholder="Sem notas ainda" />)
    expect(screen.getByText('Sem notas ainda')).toBeTruthy()
  })

  it('checklist: mostra a contagem e marcar reescreve o texto (e salva)', async () => {
    const commit = vi.fn()
    render(<Harness initial={'- [ ] um\n- [x] dois\n- [ ] três'} onCommit={commit} />)
    expect(screen.getByTitle('Checklist').textContent).toBe('1/3')
    const boxes = screen.getAllByRole('checkbox')
    await userEvent.click(boxes[0])
    expect(commit).toHaveBeenCalledWith('- [x] um\n- [x] dois\n- [ ] três')
    expect(screen.getByTitle('Checklist').textContent).toBe('2/3')
  })

  it('"- [ ]" dentro de bloco de código não vira checkbox nem conta', () => {
    render(<MarkdownEditor value={'```\n- [ ] código\n```\n\n- [ ] real'} onChange={() => {}} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByTitle('Checklist').textContent).toBe('0/1')
  })

  it('callout [!WARN] vira aviso com rótulo, sem mostrar o marcador cru', () => {
    const { container } = render(<MarkdownEditor value={'> [!WARN] cuidado com o prazo'} onChange={() => {}} />)
    expect(container.querySelector('blockquote.ds-callout-warn')).toBeTruthy()
    expect(container.textContent).toContain('Atenção')
    expect(container.textContent).not.toContain('[!WARN]')
  })

  it('esquemas perigosos nunca viram href', () => {
    const { container } = render(<MarkdownEditor value="[clique](javascript:alert(1)) e [dados](data:text/html,x)" onChange={() => {}} />)
    for (const a of container.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').not.toMatch(/^(javascript|data):/i)
  })

  it('link de domínio pode ser redesenhado por renderLink', () => {
    render(
      <MarkdownEditor
        value="[@Ana](komi:1)"
        onChange={() => {}}
        renderLink={(href, children) => (href.startsWith('komi:') ? <span data-testid="pessoa">{children}</span> : undefined)}
      />,
    )
    expect(screen.getByTestId('pessoa').textContent).toBe('@Ana')
  })
})

describe('MarkdownEditor — edição', () => {
  it('clicar no texto edita; Ctrl+Enter confirma e volta a ler', async () => {
    const commit = vi.fn()
    render(<Harness initial="olá" onCommit={commit} />)
    await userEvent.click(screen.getByText('olá'))
    const area = screen.getByRole('textbox', { name: 'Notas' })
    await userEvent.type(area, ' mundo')
    fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true })
    expect(commit).toHaveBeenCalledWith('olá mundo')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('olá mundo')).toBeTruthy()
  })

  it('Esc também confirma (nunca perde o que foi digitado)', async () => {
    const commit = vi.fn()
    render(<Harness initial="a" onCommit={commit} />)
    await userEvent.click(screen.getByText('a'))
    await userEvent.type(screen.getByRole('textbox'), 'bc')
    await userEvent.keyboard('{Escape}')
    expect(commit).toHaveBeenCalledWith('abc')
  })

  it('Enter no fim de um item continua a lista; em item vazio sai dela', async () => {
    render(<Harness initial="- um" />)
    await userEvent.click(screen.getByText('um'))
    const area = screen.getByRole('textbox') as HTMLTextAreaElement
    area.setSelectionRange(4, 4)
    fireEvent.keyDown(area, { key: 'Enter' })
    expect(area.value).toBe('- um\n- ')
    area.setSelectionRange(area.value.length, area.value.length)
    fireEvent.keyDown(area, { key: 'Enter' })
    expect(area.value).toBe('- um\n')
  })

  it('Ctrl+B envolve a seleção em negrito e a barra tem os botões de formatação', async () => {
    render(<Harness initial="texto" />)
    await userEvent.click(screen.getByText('texto'))
    const area = screen.getByRole('textbox') as HTMLTextAreaElement
    area.setSelectionRange(0, 5)
    fireEvent.keyDown(area, { key: 'b', ctrlKey: true })
    expect(area.value).toBe('**texto**')
    expect(screen.getByRole('toolbar', { name: 'Formatação' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Checklist/ })).toBeTruthy()
  })
})

describe('MarkdownEditor — menções', () => {
  const people = [{ id: 'p1', label: 'Ana Souza' }, { id: 'p2', label: 'Antônio Lima' }, { id: 'p3', label: 'Bia' }]
  const sources = [
    { trigger: '@' as const, search: (q: string) => people.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())), format: (i: { id: string; label: string }) => `@[${i.label}](komi:${i.id}) ` },
    { trigger: '[[' as const, search: async (q: string) => (q.length < 2 ? [] : [{ id: '12', label: 'Comprar pão' }]), format: (i: { id: string; label: string }) => `[[${i.id}|${i.label}]] ` },
  ]
  function Mentions({ initial = '' }: { initial?: string }) {
    const [v, setV] = useState(initial)
    return <><MarkdownEditor value={v} onChange={setV} startEditing mentions={sources} /><output data-testid="out">{v}</output></>
  }

  it('digitar @ lista as pessoas, as setas navegam e Enter insere a menção', async () => {
    const user = userEvent.setup()
    render(<Mentions />)
    const area = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(area, 'fale com @an')
    const list = await screen.findByRole('listbox', { name: 'Pessoas' })
    expect(list.querySelectorAll('[role="option"]').length).toBe(2)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByTestId('out').textContent).toBe('fale com @[Antônio Lima](komi:p2) ')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Esc fecha a lista sem sair da edição; e-mail não abre a lista', async () => {
    const user = userEvent.setup()
    render(<Mentions />)
    const area = screen.getByRole('textbox')
    await user.type(area, 'oi @bi')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy() // continua editando
    await user.type(area, ' eu@gm')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('[[ busca tarefas e insere [[id|Título]]; o leitor mostra como link de tarefa', async () => {
    const user = userEvent.setup()
    render(<Mentions />)
    // No user-event, `[[` digita UM colchete literal: dois pares digitam o gatilho `[[`.
    await user.type(screen.getByRole('textbox'), 'ver [[[[co')
    const option = await screen.findByRole('option', { name: /Comprar pão/ })
    await user.click(option)
    expect(screen.getByTestId('out').textContent).toBe('ver [[12|Comprar pão]] ')
  })

  it('notas antigas com [[id|Título]] aparecem como link', () => {
    render(<MarkdownEditor value="ver [[12|Comprar pão]]" onChange={() => {}} renderLink={(href, children) => (href.startsWith('task:') ? <button type="button">{children}</button> : undefined)} />)
    expect(screen.getByRole('button', { name: 'Comprar pão' })).toBeTruthy()
  })

  it('sem fontes de menção o @ é só texto', async () => {
    const user = userEvent.setup()
    render(<Harness initial="" />)
    await user.click(screen.getByText('Escreva em Markdown…'))
    await user.type(screen.getByRole('textbox'), '@an')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
