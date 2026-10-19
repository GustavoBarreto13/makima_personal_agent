// @vitest-environment jsdom
// Conversa sobre o Conselho do Dia: o fio salvo aparece (com a divisória de "regerado"), a sua mensagem entra na hora,
// a resposta da Violet chega com as citações, e se a Violet falhar o texto volta ao campo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { __resetToasts } from '../../../design/headless/toast'
import type { CounselMessage } from '../types'

const api = vi.hoisted(() => ({ replyCounsel: vi.fn() }))
vi.mock('../violetApi', () => ({ violetApi: api }))

import { CounselThread } from './CounselThread'

const MSGS: CounselMessage[] = [
  { id: 1, role: 'user', content_md: 'Eu precisava terminar o trabalho.', sources: [], created_at: '2026-10-18T22:00:00-03:00' },
  { id: 2, role: 'violet', content_md: 'Precisava mesmo? [1]', sources: [{ n: 1, titulo: 'Sono', fonte: 'sono.md', uri: '' }], created_at: '2026-10-18T22:00:10-03:00' },
  { id: 3, role: 'marker', content_md: 'Conselho regerado', sources: [], created_at: '2026-10-18T22:40:00-03:00' },
]

beforeEach(() => { api.replyCounsel.mockReset() })
afterEach(() => { cleanup(); __resetToasts() })

describe('CounselThread', () => {
  it('mostra o fio salvo com papéis, citação e a divisória de regerado', () => {
    render(<CounselThread date="2026-10-18" messages={MSGS} onChange={() => {}} />)
    expect(screen.getByText('Eu precisava terminar o trabalho.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fonte 1: Sono' })).toBeTruthy()
    expect(screen.getByText('Conselho regerado · 22:40')).toBeTruthy()
  })

  it('envia: a mensagem aparece na hora e a resposta chega pelo onChange', async () => {
    let resolve!: (v: unknown) => void
    api.replyCounsel.mockReturnValue(new Promise((r) => { resolve = r }))
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CounselThread date="2026-10-18" messages={[]} onChange={onChange} />)
    expect(screen.getByText('Quer responder?')).toBeTruthy()
    await user.type(screen.getByLabelText('Responder à Violet'), 'Não concordo')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(api.replyCounsel).toHaveBeenCalledWith('2026-10-18', 'Não concordo')
    expect(screen.getByText('Não concordo')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('A Violet está escrevendo')
    const reply = [
      { id: 4, role: 'user', content_md: 'Não concordo', sources: [], created_at: null },
      { id: 5, role: 'violet', content_md: 'Então me diga por quê.', sources: [], created_at: null },
    ]
    resolve({ status: 'ok', messages: reply })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(reply))
  })

  it('Ctrl+Enter envia', async () => {
    api.replyCounsel.mockResolvedValue({ status: 'ok', messages: [] })
    const user = userEvent.setup()
    render(<CounselThread date="2026-10-18" messages={[]} onChange={() => {}} />)
    await user.type(screen.getByLabelText('Responder à Violet'), 'oi{Control>}{Enter}{/Control}')
    expect(api.replyCounsel).toHaveBeenCalledWith('2026-10-18', 'oi')
  })

  it('se a Violet falhar, o texto volta ao campo', async () => {
    api.replyCounsel.mockRejectedValue(new Error('Não consegui falar com a IA agora.'))
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CounselThread date="2026-10-18" messages={[]} onChange={onChange} />)
    const field = screen.getByLabelText('Responder à Violet') as HTMLTextAreaElement
    await user.type(field, 'Minha resposta')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(field.value).toBe('Minha resposta'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
