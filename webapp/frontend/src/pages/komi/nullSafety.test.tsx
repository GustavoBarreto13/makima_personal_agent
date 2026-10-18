// @vitest-environment jsdom
// Robustez: o banco da Komi tem MUITO campo vazio (pessoas cadastradas só pelo nome não têm apelido, cidade,
// aniversário; listas vêm null). Estes testes servem payloads cheios de null passando pela camada `komiApi` de
// verdade (só o transporte HTTP é simulado) e abrem cada tela: nenhuma pode cair na rede de segurança
// ("Algo deu errado nesta tela").

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { mockLayoutApis, mockMatchMedia } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }))
vi.mock('../../lib/api', () => ({ api: http }))

import { KomiShell } from './KomiShell'

// Pessoa "pelada": só id e nome — tudo o mais null, inclusive as listas.
const BARE = (id: string, name: string, over: object = {}) => ({
  id, name, nickname: null, full_name: null, relationship: null, category: null, context: null, city: null, avatar_url: null,
  birth_day: null, birth_month: null, birth_year: null, birthday_remind_days: null, aliases: null, groups: null, link_count: null,
  dates: null, finance_net: null, last_interaction: null, ...over,
})
const PEOPLE = [BARE('p1', 'Sem nada'), BARE('p2', 'Com data torta', { birth_day: 31, birth_month: 2, dates: [{ label: 'Estranha', date: '', recurring: null, remind_days_before: null }] })]

const route = (url: string) => {
  if (url === '/api/people/overview') return { status: 'ok', people: PEOPLE }
  if (url.startsWith('/api/people/categories')) return { status: 'ok', categories: [{ slug: 'outros', label: 'Outros', icon: null, position: 0, archived: false, people_count: null }] }
  if (url === '/api/people/duplicates') return { status: 'ok', pairs: null }
  if (url === '/api/people/p1') {
    return { status: 'ok', perfil: { ...BARE('p1', 'Sem nada'), phone: null, email: null, instagram: null, telegram: null, created_at: null, deleted: false }, aliases: null, datas: null }
  }
  if (url === '/api/people/p1/briefing') {
    return {
      status: 'ok', perfil: { id: 'p1', name: 'Sem nada', nickname: null, full_name: null, context: null, city: null, category_label: null },
      birthday: null, dates: null, notes: null, suggestions_pending: null, ai: null, pending: { balance: null, open_tasks: null, waiting: null },
      contact: { last: null, days_since: null, recent_interactions: null }, relations: null, groups: null,
    }
  }
  if (url.startsWith('/api/people/p1/memory/summary')) return { status: 'ok', summary: null, stale: null, generated_at: null }
  if (url.startsWith('/api/people/p1/memory')) return { status: 'ok', items: null, counts: null, by_context: null, unavailable: null }
  if (url.startsWith('/api/people/p1/notes')) return { status: 'ok', notes: null }
  if (url.startsWith('/api/people/p1/interactions')) return { status: 'ok', interactions: null }
  if (url.startsWith('/api/people/p1/relations')) return { status: 'ok', relations: null }
  if (url.startsWith('/api/people/p1/groups')) return { status: 'ok', groups: null }
  if (url === '/api/people/groups') return { status: 'ok', groups: null }
  if (url === '/api/people/relation-kinds') return { status: 'ok', kinds: null }
  if (url.startsWith('/api/people/stats')) {
    return {
      status: 'ok', period: { year: 2026, month: null, label: '2026' }, previous: null, kpis: [], daily: [], monthly: [], monthlyUnit: 'interações',
      distribution: [], rankings: {}, records: [], moments: [], first_year: 2026,
    }
  }
  throw new Error(`rota não simulada: ${url}`)
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(http).forEach((m) => m.mockReset())
  http.get.mockImplementation(async (url: string) => route(url))
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); window.location.hash = '' })

const SCREENS: [string, string | RegExp][] = [
  ['', 'Caderno de bilhetes'],
  ['#pessoas', 'Sem nada'],
  ['#pessoas/outros', 'Sem nada'],
  ['#datas', 'Com data torta'],
  ['#estatisticas', 'Seu ano em contatos'],
  ['#pessoa/p1', 'Sem nada'],
  ['#pessoa/p1/anotacoes', /Nenhuma anotação/],
  ['#pessoa/p1/interacoes', /Nenhum contato registrado/],
  ['#pessoa/p1/datas', /Ainda não cadastrado/],
]

describe('dados vazios não derrubam nenhuma tela', () => {
  it.each(SCREENS)('%s abre sem erro', async (hash, ready) => {
    window.location.hash = hash
    render(<MemoryRouter><KomiShell /></MemoryRouter>)
    expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText('Algo deu errado nesta tela')).toBeNull())
  })
})
