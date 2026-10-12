// @vitest-environment jsdom
// Eisenhower: quadrantes derivados de prioridade × urgência, busca/filtros/ordenação, matriz de uma lista e de um grupo (a terceira
// visão ao lado de Lista e Quadro), concluir pelo checkbox e estados vazio/erro.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../../design/test-utils'
import { __resetToasts } from '../../../design/headless/toast'
import { addDaysISO, todayISO } from '../../../design/core/format'

const api = vi.hoisted(() => ({
  sidebar: vi.fn(), viewCounts: vi.fn(), viewTasks: vi.fn(), eisenhower: vi.fn(), taskFilterIds: vi.fn(), updateTask: vi.fn(), bulk: vi.fn(), getTask: vi.fn(), activity: vi.fn(), dependencies: vi.fn(),
  schedule: { get: vi.fn(), overrides: vi.fn() },
}))
vi.mock('../api', () => ({ kaguyaApi: api }))

import { KaguyaShell } from '../KaguyaShell'
import type { Task } from '../types'

const TODAY = todayISO()
const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: null, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0, due_date: null, due_time: null,
  position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], subtasks: [], ...over,
})
const proj = (id: number, name: string) => ({ id, name, group_id: null, color: null, icon: null, is_inbox: false, position: id, has_board: false, open_count: 0, context: 'personal' })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(api).forEach((m) => { if (typeof m === 'function') m.mockReset() })
  Object.values(api.schedule).forEach((m) => m.mockReset())
  api.sidebar.mockResolvedValue({ groups: [], projects: [proj(1, 'Casa'), proj(2, 'Banco')], filters: [] })
  api.viewCounts.mockResolvedValue({ all: 0, today: 0, tomorrow: 0, next7: 0, inbox: 0 })
  api.viewTasks.mockResolvedValue([])
  api.eisenhower.mockResolvedValue([
    task({ id: 1, title: 'Declarar imposto', priority: 3, due_date: addDaysISO(TODAY, 1) }),
    task({ id: 2, title: 'Planejar viagem', priority: 2, due_date: addDaysISO(TODAY, 20), project_id: 2 }),
    task({ id: 3, title: 'Responder e-mail', priority: 0, due_date: addDaysISO(TODAY, -1) }),
    task({ id: 4, title: 'Ler artigo' }),
  ])
  api.bulk.mockResolvedValue({ status: 'ok', undo_token: null, changed: 1 })
  api.getTask.mockResolvedValue(task({ id: 1 }))
  api.activity.mockResolvedValue([])
  api.dependencies.mockResolvedValue({ blocked_by: [], blocking: [], is_blocked: false })
  api.schedule.get.mockResolvedValue({ work_days: [1], work_start: '09:00', work_end: '18:00', lunch_start: null, lunch_end: null, lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' })
  api.schedule.overrides.mockResolvedValue([])
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); window.location.hash = '' })

const open = async () => {
  window.location.hash = '#eisenhower'
  const user = userEvent.setup()
  render(<MemoryRouter><KaguyaShell /></MemoryRouter>)
  return user
}
const quad = (name: string) => screen.getByRole('region', { name })

describe('Eisenhower', () => {
  it('distribui as tarefas nos quatro quadrantes', async () => {
    await open()
    await screen.findByText('Declarar imposto')
    expect(within(quad('Faça agora')).getByText('Declarar imposto')).toBeTruthy()
    expect(within(quad('Agende')).getByText('Planejar viagem')).toBeTruthy()
    expect(within(quad('Resolva rápido')).getByText('Responder e-mail')).toBeTruthy()
    expect(within(quad('Depois')).getByText('Ler artigo')).toBeTruthy()
    expect(api.eisenhower).toHaveBeenCalledWith(undefined)
  })

  it('filtra por lista no menu de Filtros', async () => {
    const user = await open()
    await screen.findByText('Declarar imposto')
    await user.click(screen.getByRole('button', { name: /^Filtros/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Filtros' })).getByRole('button', { name: 'Banco' }))
    expect(screen.queryByText('Declarar imposto')).toBeNull()
    expect(screen.getByText('Planejar viagem')).toBeTruthy()
  })

  it('busca, filtra por prioridade e limpa os filtros', async () => {
    const user = await open()
    await screen.findByText('Declarar imposto')
    await user.type(screen.getByRole('searchbox', { name: 'Buscar na matriz' }), 'viagem')
    expect(screen.queryByText('Declarar imposto')).toBeNull()
    expect(screen.getByText('Planejar viagem')).toBeTruthy()
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar na matriz' }))
    await user.click(screen.getByRole('button', { name: /^Filtros/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Alta' }))
    expect(screen.getByText('Declarar imposto')).toBeTruthy()
    expect(screen.queryByText('Planejar viagem')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Limpar tudo' }))
    expect(screen.getByText('Planejar viagem')).toBeTruthy()
  })

  it('ordena por prioridade (padrão) e deixa trocar a ordenação e a direção', async () => {
    api.eisenhower.mockResolvedValue([
      task({ id: 1, title: 'Zebra', priority: 2, due_date: addDaysISO(TODAY, 20) }),
      task({ id: 2, title: 'Abelha', priority: 3, due_date: addDaysISO(TODAY, 30) }),
    ])
    const user = await open()
    await screen.findByText('Abelha')
    const order = () => within(quad('Agende')).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))
    expect(order()).toEqual(['Concluir “Abelha”', 'Concluir “Zebra”'])
    await user.click(screen.getByRole('button', { name: /^Ordenar:/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Título' }))
    const first = order()
    await user.click(screen.getByRole('button', { name: /^Ordem/ }))
    expect(order()).toEqual([...first].reverse()) // inverter a direção
    expect(new Set(order())).toEqual(new Set(first))
  })

  const openFilters = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /^Filtros/ }))
    return screen.findByRole('dialog', { name: 'Filtros' })
  }

  it('o modal de Filtros tem Tipo, Lista “todas menos estas” e as regras avançadas (E/OU) no mesmo lugar', async () => {
    const user = await open()
    await screen.findByText('Declarar imposto')
    const dlg = await openFilters(user)
    for (const g of ['Tipo', 'Lista', 'Prioridade', 'Vencimento', 'Status GTD']) expect(within(dlg).getByText(g), g).toBeTruthy()
    expect(within(dlg).getByRole('group', { name: 'Modo: Lista' })).toBeTruthy()
    expect(within(dlg).getByRole('heading', { name: 'Regras avançadas (E/OU)' })).toBeTruthy()
    expect(within(dlg).queryByText('Guardar como View')).toBeNull()
  })

  it('filtra por Tipo (tarefa / evento / aniversário)', async () => {
    api.eisenhower.mockResolvedValue([
      task({ id: 1, title: 'Reunião', type: 'event', priority: 3, due_date: addDaysISO(TODAY, 1) }),
      task({ id: 2, title: 'Parabéns Ana', type: 'birthday', priority: 3, due_date: addDaysISO(TODAY, 1) }),
      task({ id: 3, title: 'Relatório', type: 'task', priority: 3, due_date: addDaysISO(TODAY, 1) }),
    ])
    const user = await open()
    await screen.findByText('Reunião')
    const dlg = await openFilters(user)
    await user.click(within(dlg).getByRole('button', { name: 'Aniversário' }))
    expect(screen.queryByText('Reunião')).toBeNull()
    expect(screen.getByText('Parabéns Ana')).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Evento' }))
    expect(screen.getByText('Reunião')).toBeTruthy()
    expect(screen.queryByText('Relatório')).toBeNull()
  })

  it('Lista: “todas menos estas” tira as listas escolhidas', async () => {
    const user = await open()
    await screen.findByText('Declarar imposto')
    const dlg = await openFilters(user)
    await user.click(within(dlg).getByRole('button', { name: 'Todas menos estas' }))
    await user.click(within(dlg).getByRole('button', { name: 'Banco' }))
    expect(screen.queryByText('Planejar viagem')).toBeNull()
    expect(screen.getByText('Declarar imposto')).toBeTruthy()
    await user.click(within(dlg).getByRole('button', { name: 'Só estas' }))
    expect(screen.queryByText('Declarar imposto')).toBeNull()
    expect(screen.getByText('Planejar viagem')).toBeTruthy()
  })

  it('as regras avançadas rodam no servidor, somam com os filtros rápidos e aparecem como “Regras · N”', async () => {
    api.taskFilterIds.mockResolvedValue({ status: 'ok', ids: [2, 3] })
    const user = await open()
    await screen.findByText('Declarar imposto')
    const dlg = await openFilters(user)
    await user.click(within(dlg).getByRole('button', { name: 'Adicionar condição' }))
    await user.click(within(dlg).getByRole('button', { name: 'Aplicar regras' }))
    await waitFor(() => expect(api.taskFilterIds).toHaveBeenCalledWith({ combinator: 'and', conditions: [{ field: 'tag', op: 'has', value: '' }] }, undefined))
    await waitFor(() => expect(screen.queryByText('Declarar imposto')).toBeNull())
    expect(screen.getByText('Planejar viagem')).toBeTruthy()
    // soma com um filtro rápido: só a lista “Casa”
    await user.click(within(dlg).getByRole('button', { name: 'Casa' }))
    expect(screen.queryByText('Planejar viagem')).toBeNull()
    expect(screen.getByText('Responder e-mail')).toBeTruthy()
    // sai do modal: o aviso fica na barra e limpa na hora
    await user.click(within(dlg).getByRole('button', { name: /^Ver/ }))
    expect(screen.getByRole('button', { name: 'Regras · 1' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Limpar as regras avançadas' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Regras · 1' })).toBeNull())
  })

  it('se o servidor recusa as regras, avisa e mostra tudo de novo', async () => {
    api.taskFilterIds.mockRejectedValue(new Error('HTTP 400'))
    const user = await open()
    await screen.findByText('Declarar imposto')
    const dlg = await openFilters(user)
    await user.click(within(dlg).getByRole('button', { name: 'Adicionar condição' }))
    await user.click(within(dlg).getByRole('button', { name: 'Aplicar regras' }))
    expect(await screen.findByText('Não foi possível aplicar as regras.')).toBeTruthy()
    expect(screen.getByText('Declarar imposto')).toBeTruthy()
  })

  it('o checkbox conclui sem abrir a tarefa', async () => {
    const user = await open()
    await user.click(await screen.findByRole('checkbox', { name: 'Concluir “Ler artigo”' }))
    await waitFor(() => expect(api.bulk).toHaveBeenCalled())
    expect(window.location.hash).not.toContain('/t/')
  })

  it('clicar no título abre a tarefa', async () => {
    const user = await open()
    await user.click(await screen.findByText('Ler artigo'))
    expect(window.location.hash).toContain('/t/4')
  })

  it('sem tarefas mostra o estado vazio; erro oferece tentar de novo', async () => {
    api.eisenhower.mockResolvedValueOnce([])
    await open()
    expect(await screen.findByText('Nada para priorizar')).toBeTruthy()
    cleanup()
    api.eisenhower.mockRejectedValueOnce(new Error('HTTP 500'))
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Tentar de novo/i }))
    expect(await screen.findByText('Declarar imposto')).toBeTruthy()
  })
})

describe('Matriz como visão de uma lista e de um grupo', () => {
  beforeEach(() => {
    api.sidebar.mockResolvedValue({
      groups: [{ id: 3, name: 'Casa e banco', position: 1 }, { id: 4, name: 'Outro', position: 2 }],
      projects: [{ ...proj(1, 'Casa'), group_id: 3, has_board: true }, { ...proj(2, 'Banco'), group_id: 3 }, proj(9, 'Solta')],
      filters: [],
    })
    api.eisenhower.mockResolvedValue([
      task({ id: 1, title: 'Declarar imposto', priority: 3, due_date: addDaysISO(TODAY, 1), project_id: 2 }),
      task({ id: 2, title: 'Trocar lâmpada', priority: 2, due_date: addDaysISO(TODAY, 20), project_id: 1 }),
      task({ id: 3, title: 'Tarefa de fora', project_id: 9 }),
    ])
  })
  const openAt = async (hash: string) => {
    window.location.hash = hash
    const user = userEvent.setup()
    render(<MemoryRouter><KaguyaShell /></MemoryRouter>)
    return user
  }

  it('a matriz de uma lista mostra só as tarefas dela, com o seletor Lista · Quadro · Matriz no topo', async () => {
    await openAt('#matriz/2')
    expect(await screen.findByText('Declarar imposto')).toBeTruthy()
    expect(screen.queryByText('Trocar lâmpada')).toBeNull()
    expect(screen.queryByText('Tarefa de fora')).toBeNull()
    const sw = screen.getByRole('group', { name: 'Ver como' })
    expect(sw.closest('.kn-viewbar')).toBeTruthy()
    expect(within(sw).getByRole('button', { name: 'Matriz' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('a matriz de um grupo reúne as listas dele e oferece o filtro por lista', async () => {
    const user = await openAt('#matriz-grupo/3')
    expect(await screen.findByText('Declarar imposto')).toBeTruthy()
    expect(screen.getByText('Trocar lâmpada')).toBeTruthy()
    expect(screen.queryByText('Tarefa de fora')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Filtros/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Filtros' })).getByRole('button', { name: 'Banco' }))
    expect(screen.queryByText('Trocar lâmpada')).toBeNull()
  })

  it('o título segue a lista e o seletor volta para a Lista', async () => {
    const user = await openAt('#matriz/2')
    await screen.findByText('Declarar imposto')
    expect(screen.getByRole('heading', { level: 1, name: 'Banco' })).toBeTruthy()
    await user.click(within(screen.getByRole('group', { name: 'Ver como' })).getByRole('button', { name: 'Lista' }))
    await waitFor(() => expect(window.location.hash).toBe('#lista/2'))
  })

  it('o mesmo modal em toda matriz; Lista e Grupo só onde fazem sentido', async () => {
    const modal = async (hash: string) => {
      const user = await openAt(hash)
      await screen.findByText('Declarar imposto')
      await user.click(screen.getByRole('button', { name: /^Filtros/ }))
      return screen.findByRole('dialog', { name: 'Filtros' })
    }
    // Uma lista só: sem Lista nem Grupo.
    let dlg = await modal('#matriz/2')
    expect(within(dlg).getByText('Tipo')).toBeTruthy()
    expect(within(dlg).queryByRole('group', { name: 'Modo: Lista' })).toBeNull()
    expect(within(dlg).queryByRole('group', { name: 'Modo: Grupo' })).toBeNull()
    expect(within(dlg).getByRole('heading', { name: 'Regras avançadas (E/OU)' })).toBeTruthy()
    cleanup()
    // Um grupo: tem Lista, não tem Grupo.
    dlg = await modal('#matriz-grupo/3')
    expect(within(dlg).getByRole('group', { name: 'Modo: Lista' })).toBeTruthy()
    expect(within(dlg).queryByRole('group', { name: 'Modo: Grupo' })).toBeNull()
    cleanup()
    // Geral: tem os dois.
    dlg = await modal('#eisenhower')
    expect(within(dlg).getByRole('group', { name: 'Modo: Lista' })).toBeTruthy()
    expect(within(dlg).getByRole('group', { name: 'Modo: Grupo' })).toBeTruthy()
  })

  it('abrir uma tarefa na matriz guarda a tarefa na URL da matriz', async () => {
    const user = await openAt('#matriz/2')
    await user.click(await screen.findByText('Declarar imposto'))
    expect(window.location.hash).toBe('#matriz/2/t/1')
  })
})
