// @vitest-environment jsdom
// Cartão de "não dito": o texto começa oculto (borrado), revela ao tocar e o cabeçalho abre o detalhe.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnsaidCard } from './UnsaidCard'
import type { Unsaid } from '../types'

const ITEM: Unsaid = {
  id: 1, page_id: 1, date: '2026-11-10', recipient: 'Bia', body: 'Eu queria pedir desculpas', reason: 'nao_consigo', why: null,
  status: 'kept', outcome_note: null, resolved_at: null, created_at: '2026-11-10T20:00:00-03:00', updated_at: null, people: [],
}

afterEach(cleanup)

describe('UnsaidCard', () => {
  it('começa oculto, revela ao tocar e esconde de novo', async () => {
    render(<UnsaidCard item={ITEM} today="2026-11-10" onOpen={() => undefined} />)
    const body = screen.getByRole('button', { name: /texto oculto/i })
    expect(body.className).toContain('vl-veiled')
    await userEvent.click(body)
    expect(screen.getByRole('button', { name: /esconder o texto/i }).className).not.toContain('vl-veiled')
  })
  it('mostra o motivo e o desfecho; o cabeçalho abre o detalhe', async () => {
    const onOpen = vi.fn()
    render(<UnsaidCard item={{ ...ITEM, status: 'said' }} today="2026-11-10" onOpen={onOpen} />)
    expect(screen.getByText('Não consigo')).toBeTruthy()
    expect(screen.getByText('Acabei falando')).toBeTruthy()
    await userEvent.click(screen.getByText('Para Bia'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
