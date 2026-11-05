// Testes de lib/deepLink.ts: makima://<agente>/<caminho> → rota do React Router.

import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLink'

describe('parseDeepLink', () => {
  it.each([
    ['makima://kaguya', '/tasks'],
    ['makima://kaguya/', '/tasks'],
    ['makima://nami', '/nami'],
    ['makima://makima', '/'],
    ['makima://frieren/livro/12', '/books#livro/12'],
    ['makima://kaguya/lista/7', '/tasks#lista/7'],
    ['makima://violet/hoje', '/journal#hoje'],
    ['MAKIMA://Yato/viagem/3', '/travel#viagem/3'], // esquema e agente sem diferenciar maiúsculas
  ])('%s → %s', (link, rota) => {
    expect(parseDeepLink(link)).toBe(rota)
  })

  it('ignora query e fragmento que vierem no link', () => {
    expect(parseDeepLink('makima://akane/filme/9?utm=x#abc')).toBe('/movies#filme/9')
  })

  it.each([
    ['https://makima.exemplo.com/tasks'], // esquema errado
    ['javascript:alert(1)'],
    ['makima://'],
    ['makima:///'],
    ['makima://agente-inexistente/x'],
    ['makima://kurisu/x'], // agente ainda "em breve" (sem tela)
    ['makima://kaguya/../../etc/passwd'],
    ['makima://kaguya/<script>'],
    ['makima://kaguya/a b'],
    [`makima://kaguya/${'a'.repeat(400)}`],
  ])('recusa %j', (link) => {
    expect(parseDeepLink(link)).toBeNull()
  })
})
