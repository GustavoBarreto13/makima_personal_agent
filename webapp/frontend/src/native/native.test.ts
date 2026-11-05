// @vitest-environment jsdom
// Testes da lógica pura do app Android: botão voltar, privacidade, bloqueio e canais de push.

import { describe, expect, it } from 'vitest'
import { closeTopOverlay, decideBack, hasOpenOverlay } from './backButton'
import { isSensitiveRoute } from './privacy'
import { LOCK_GRACE_MS, shouldLock } from './appLock'
import { DEFAULT_CHANNEL_ID, PUSH_CHANNELS, channelFor } from './pushChannels'
import { parseDeepLink } from '../lib/deepLink'

describe('decideBack', () => {
  it('modal aberto: fecha o modal primeiro', () => {
    expect(decideBack({ overlayOpen: true, canGoBack: true })).toBe('close-overlay')
  })
  it('sem modal e com histórico: volta de tela', () => {
    expect(decideBack({ overlayOpen: false, canGoBack: true })).toBe('history-back')
  })
  it('sem modal e sem histórico: minimiza o app em vez de fechar', () => {
    expect(decideBack({ overlayOpen: false, canGoBack: false })).toBe('minimize')
  })
})

describe('overlay no DOM', () => {
  it('detecta aria-modal e dispara Esc', () => {
    expect(hasOpenOverlay()).toBe(false)
    const d = document.createElement('div')
    d.setAttribute('aria-modal', 'true')
    document.body.appendChild(d)
    expect(hasOpenOverlay()).toBe(true)

    let tecla = ''
    const ouvinte = (e: KeyboardEvent) => { tecla = e.key }
    document.addEventListener('keydown', ouvinte)
    closeTopOverlay()
    document.removeEventListener('keydown', ouvinte)
    expect(tecla).toBe('Escape')
    d.remove()
  })
})

describe('isSensitiveRoute', () => {
  it.each(['/journal', '/journal/x', '/nami', '/nami/contas'])('%s é sensível', (r) => {
    expect(isSensitiveRoute(r)).toBe(true)
  })
  it.each(['/', '/tasks', '/books', '/journalx', '/namix'])('%s não é sensível', (r) => {
    expect(isSensitiveRoute(r)).toBe(false)
  })
})

describe('shouldLock', () => {
  it('abertura a frio sempre bloqueia', () => {
    expect(shouldLock({ lastActiveAt: null, now: 1000 })).toBe(true)
  })
  it('troca rápida de app não bloqueia', () => {
    expect(shouldLock({ lastActiveAt: 0, now: LOCK_GRACE_MS - 1 })).toBe(false)
  })
  it('ficar fora além do prazo bloqueia', () => {
    expect(shouldLock({ lastActiveAt: 0, now: LOCK_GRACE_MS })).toBe(true)
  })
})

describe('canais de push', () => {
  it('agente conhecido usa o próprio canal; desconhecido cai no geral', () => {
    expect(channelFor('Kaguya')).toBe('kaguya')
    expect(channelFor('nami')).toBe('nami')
    expect(channelFor('xpto')).toBe(DEFAULT_CHANNEL_ID)
    expect(channelFor(null)).toBe(DEFAULT_CHANNEL_ID)
  })
  it('Nami, Violet e Lucy escondem o conteúdo na tela de bloqueio (igual ao backend)', () => {
    const privados = PUSH_CHANNELS.filter((c) => c.private).map((c) => c.id).sort()
    expect(privados).toEqual(['lucy', 'nami', 'violet'])
  })
  it('todo canal tem id único', () => {
    const ids = PUSH_CHANNELS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('links dos avisos do servidor', () => {
  // Cada deep link que os scripts do scheduler mandam precisa abrir uma tela de verdade.
  it.each([
    ['makima://kaguya', '/tasks'],
    ['makima://nami', '/nami'],
    ['makima://violet', '/journal'],
    ['makima://makima', '/'],
  ])('%s → %s', (link, rota) => {
    expect(parseDeepLink(link)).toBe(rota)
  })
})
