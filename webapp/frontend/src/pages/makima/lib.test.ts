import { describe, expect, it } from 'vitest'
import { attentionText, DEFAULT_PREFS, greeting, moveWidget, remaining, visibleWidgets, WIDGETS } from './lib'

describe('widgets da home', () => {
  it('mostra todos na ordem padrão', () => {
    expect(visibleWidgets(DEFAULT_PREFS).map((w) => w.id)).toEqual(WIDGETS.map((w) => w.id))
  })

  it('respeita ocultar e reordenar', () => {
    const prefs = { order: ['habitos', 'nami_livre'], hidden: ['nami_livre'] }
    const ids = visibleWidgets(prefs).map((w) => w.id)
    expect(ids[0]).toBe('habitos')
    expect(ids).not.toContain('nami_livre')
  })

  it('widget novo no catálogo entra no fim, mesmo com prefs antigas', () => {
    const ids = visibleWidgets({ order: ['habitos'], hidden: [] }).map((w) => w.id)
    expect(ids).toHaveLength(WIDGETS.length)
    expect(ids[0]).toBe('habitos')
  })

  it('moveWidget troca de lugar e não passa das pontas', () => {
    expect(moveWidget(DEFAULT_PREFS, 'kaguya_hoje', -1)[0]).toBe('kaguya_hoje')
    expect(moveWidget(DEFAULT_PREFS, WIDGETS[0].id, -1)).toEqual(WIDGETS.map((w) => w.id))
  })
})

describe('textos da home', () => {
  it('saudação pela hora local', () => {
    expect([greeting(3), greeting(9), greeting(15), greeting(21)]).toEqual(['Boa madrugada', 'Bom dia', 'Boa tarde', 'Boa noite'])
  })

  it('tempo restante e contagem de atenção', () => {
    expect(remaining(1080)).toBe('18 min')
    expect(remaining(45)).toBe('45 s')
    expect(attentionText(0)).toBe('Nada pede sua atenção agora')
    expect(attentionText(1)).toBe('1 coisa pede atenção')
    expect(attentionText(4)).toBe('4 coisas pedem atenção')
  })
})
