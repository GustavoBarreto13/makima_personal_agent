import { describe, expect, it } from 'vitest'
import { hashFor, routeFromHash, sameScreen, withTask, type Route } from './routes'

describe('rotas por hash da Kaguya', () => {
  it('telas simples', () => {
    expect(routeFromHash('#hoje')).toEqual({ view: 'today' })
    expect(routeFromHash('#calendario')).toEqual({ view: 'calendar' })
    expect(routeFromHash('#concluidas')).toEqual({ view: 'logbook' })
    expect(routeFromHash('#estatisticas')).toEqual({ view: 'stats' })
  })

  it('lista, quadro, grupo e filtro carregam o id', () => {
    expect(routeFromHash('#lista/12')).toEqual({ view: 'list', id: 12 })
    expect(routeFromHash('#kanban/7')).toEqual({ view: 'kanban', id: 7 })
    expect(routeFromHash('#grupo/3')).toEqual({ view: 'group', id: 3 })
    expect(routeFromHash('#grupo-lista/3')).toEqual({ view: 'group-list', id: 3 })
    expect(routeFromHash('#filtro/5')).toEqual({ view: 'filter', id: 5 })
    expect(routeFromHash('#metas')).toEqual({ view: 'goals', id: undefined })
    expect(routeFromHash('#metas/4')).toEqual({ view: 'goals', id: 4 })
  })

  it('visões de data e built-ins GTD', () => {
    expect(routeFromHash('#visao/next7')).toEqual({ view: 'date', key: 'next7' })
    expect(routeFromHash('#visao/inexistente')).toEqual({ view: 'date', key: 'all' })
    expect(routeFromHash('#gtd/next-actions')).toEqual({ view: 'gtd', key: 'next-actions' })
  })

  it('a tarefa aberta no painel é o sufixo /t/<id>', () => {
    expect(routeFromHash('#lista/12/t/88')).toEqual({ view: 'list', id: 12, taskId: 88 })
    expect(routeFromHash('#hoje/t/5')).toEqual({ view: 'today', taskId: 5 })
    expect(routeFromHash('#visao/inbox/t/9')).toEqual({ view: 'date', key: 'inbox', taskId: 9 })
    expect(routeFromHash('#tarefa/42')).toEqual({ view: 'today', taskId: 42 })
  })

  it('nomes do shell antigo e hash vazio/desconhecido caem em valores seguros', () => {
    expect(routeFromHash('#habits')).toEqual({ view: 'habits' })
    expect(routeFromHash('#trash')).toEqual({ view: 'trash' })
    expect(routeFromHash('')).toEqual({ view: 'today' })
    expect(routeFromHash('#qualquer-coisa')).toEqual({ view: 'today' })
    expect(routeFromHash('#lista/abc')).toEqual({ view: 'list', id: undefined })
  })

  it('ida e volta: hashFor ∘ routeFromHash é a identidade', () => {
    const routes: Route[] = [
      { view: 'today' }, { view: 'list', id: 12 }, { view: 'kanban', id: 7 }, { view: 'group', id: 3 },
      { view: 'date', key: 'tomorrow' }, { view: 'gtd', key: 'waiting' }, { view: 'filter', id: 5 }, { view: 'logbook' },
      { view: 'list', id: 12, taskId: 88 }, { view: 'date', key: 'inbox', taskId: 9 }, { view: 'experiments', id: 2 },
    ]
    for (const r of routes) expect(routeFromHash(`#${hashFor(r)}`)).toEqual(r)
  })

  it('sameScreen ignora a tarefa aberta; withTask abre e fecha o painel', () => {
    const lista: Route = { view: 'list', id: 3 }
    expect(sameScreen(lista, { view: 'list', id: 3, taskId: 8 })).toBe(true)
    expect(sameScreen(lista, { view: 'list', id: 4 })).toBe(false)
    expect(withTask(lista, 8)).toEqual({ view: 'list', id: 3, taskId: 8 })
    expect(withTask({ view: 'list', id: 3, taskId: 8 }, undefined)).toEqual(lista)
  })
})
