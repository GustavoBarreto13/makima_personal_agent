// @vitest-environment jsdom
// Compositor de "não dito": exige destinatário, texto e motivo antes de enviar; envia pelo dia e fecha.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { __resetToasts } from '../../../design/headless/toast'

const api = vi.hoisted(() => ({ createUnsaid: vi.fn(), updateUnsaid: vi.fn(), resolveUnsaid: vi.fn(), suggestPeople: vi.fn() }))
vi.mock('../violetApi', () => ({ violetApi: api }))

import { UnsaidComposer } from './UnsaidComposer'

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.suggestPeople.mockResolvedValue({ people: [] }) })
afterEach(() => { cleanup(); __resetToasts() })

describe('UnsaidComposer', () => {
  it('pede o motivo antes de guardar', async () => {
    render(<UnsaidComposer date="2026-11-10" onClose={() => undefined} onSaved={() => undefined} />)
    await userEvent.type(screen.getByPlaceholderText('Quem é?'), 'Bia')
    await userEvent.type(screen.getByLabelText('O que você queria dizer'), 'oi')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/por que você não disse/i)
    expect(api.createUnsaid).not.toHaveBeenCalled()
  })
  it('envia pelo dia e fecha; sem internet (fila) entrega null', async () => {
    api.createUnsaid.mockResolvedValue({ queued: true })
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<UnsaidComposer date="2026-11-10" onClose={onClose} onSaved={onSaved} />)
    await userEvent.type(screen.getByPlaceholderText('Quem é?'), 'Bia')
    await userEvent.type(screen.getByLabelText('O que você queria dizer'), 'oi')
    await userEvent.click(screen.getByRole('radio', { name: /não quero/i }))
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.createUnsaid).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-10', recipient: 'Bia', body: 'oi', reason: 'nao_quero' }))
    expect(onSaved).toHaveBeenCalledWith(null)
  })
})
