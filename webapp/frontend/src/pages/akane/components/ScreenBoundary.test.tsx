// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia } from '../../../design/test-utils'
import { ScreenBoundary } from './ScreenBoundary'

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
afterEach(cleanup)

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('dado inesperado')
  return <p>tela ok</p>
}

describe('ScreenBoundary', () => {
  it('tela que estoura mostra o estado de erro (não derruba o app) e o botão volta ao Início', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onHome = vi.fn()
    render(<ScreenBoundary resetKey="a" onHome={onHome}><Boom explode /></ScreenBoundary>)
    expect(screen.getByText('Algo deu errado nesta tela')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao Início' }))
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('trocar de tela (resetKey) limpa o erro e mostra a tela nova', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ScreenBoundary resetKey="a" onHome={() => {}}><Boom explode /></ScreenBoundary>)
    expect(screen.getByText('Algo deu errado nesta tela')).toBeTruthy()
    rerender(<ScreenBoundary resetKey="b" onHome={() => {}}><Boom explode={false} /></ScreenBoundary>)
    expect(screen.getByText('tela ok')).toBeTruthy()
  })

  it('sem erro, só repassa a tela', () => {
    render(<ScreenBoundary resetKey="a" onHome={() => {}}><Boom explode={false} /></ScreenBoundary>)
    expect(screen.getByText('tela ok')).toBeTruthy()
  })
})
