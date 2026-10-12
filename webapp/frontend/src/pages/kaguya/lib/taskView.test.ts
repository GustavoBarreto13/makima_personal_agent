import { describe, expect, it } from 'vitest'
import { runCollection, defaultState } from '../../../design/core/collection'
import type { Task } from '../types'
import { makeTasksSchema } from './schemas'
import { deferLabel, dueBucket, dueInfo, flattenTree, followUpDue, fmtMinutes, isDeferred, subtaskProgress } from './taskView'

const TODAY = '2026-06-10' // quarta

const task = (over: Partial<Task> = {}): Task => ({
  id: 1, project_id: 1, column_id: null, parent_id: null, title: 'Tarefa', description: null, type: 'task', priority: 0,
  due_date: null, due_time: null, position: 1000, completed_at: null, created_at: '2026-06-01T10:00:00-03:00',
  my_day_date: null, start_at: null, end_at: null, duration_min: null, tags: [], ...over,
})

describe('dueInfo', () => {
  it('rótulos e tons por distância', () => {
    expect(dueInfo({ due_date: null, due_time: null }, TODAY)).toEqual({ label: '', tone: 'none', days: null })
    expect(dueInfo({ due_date: '2026-06-10', due_time: null }, TODAY)).toMatchObject({ label: 'Hoje', tone: 'today' })
    expect(dueInfo({ due_date: '2026-06-11', due_time: null }, TODAY)).toMatchObject({ label: 'Amanhã', tone: 'soon' })
    expect(dueInfo({ due_date: '2026-06-09', due_time: null }, TODAY)).toMatchObject({ label: 'Ontem', tone: 'overdue', days: -1 })
    expect(dueInfo({ due_date: '2026-06-12', due_time: null }, TODAY)).toMatchObject({ label: 'sex', tone: 'soon' })   // sexta
    expect(dueInfo({ due_date: '2026-06-15', due_time: null }, TODAY).tone).toBe('later')
    expect(dueInfo({ due_date: '2026-06-01', due_time: null }, TODAY).tone).toBe('overdue')
  })

  it('inclui a hora quando existe', () => {
    expect(dueInfo({ due_date: '2026-06-10', due_time: '14:30' }, TODAY).label).toBe('Hoje 14:30')
  })

  it('a virada do dia é local: a mesma data é "hoje" ou "ontem" conforme o relógio recebido', () => {
    expect(dueInfo({ due_date: '2026-06-10', due_time: null }, '2026-06-10').tone).toBe('today')
    expect(dueInfo({ due_date: '2026-06-10', due_time: null }, '2026-06-11').tone).toBe('overdue')
  })
})

describe('adiada, cobrança e subtarefas', () => {
  it('adiada só enquanto start_date está no futuro', () => {
    expect(isDeferred({ start_date: '2026-06-11' }, TODAY)).toBe(true)
    expect(isDeferred({ start_date: '2026-06-10' }, TODAY)).toBe(false)
    expect(isDeferred({ start_date: null }, TODAY)).toBe(false)
    expect(deferLabel({ start_date: '2026-06-11' }, TODAY)).toBe('Volta amanhã')
    expect(deferLabel({ start_date: '2026-06-20' }, TODAY)).toMatch(/^Volta /)
    expect(deferLabel({ start_date: null }, TODAY)).toBe('')
  })

  it('follow-up só vale para tarefa aguardando', () => {
    expect(followUpDue({ gtd_status: 'waiting', follow_up_date: '2026-06-10' }, TODAY)).toBe(true)
    expect(followUpDue({ gtd_status: 'waiting', follow_up_date: '2026-06-11' }, TODAY)).toBe(false)
    expect(followUpDue({ gtd_status: 'next_action', follow_up_date: '2026-06-01' }, TODAY)).toBe(false)
  })

  it('progresso e achatamento da árvore', () => {
    const tree = task({ subtasks: [task({ id: 2, completed_at: 'x', subtasks: [task({ id: 4 })] }), task({ id: 3 })] })
    expect(subtaskProgress(tree)).toEqual({ done: 1, total: 2 })
    expect(subtaskProgress(task())).toBeNull()
    expect(flattenTree([tree]).map((t) => t.id)).toEqual([1, 2, 4, 3])
  })

  it('fmtMinutes', () => {
    expect([fmtMinutes(5), fmtMinutes(60), fmtMinutes(90), fmtMinutes(125)]).toEqual(['5min', '1h', '1h30', '2h05'])
  })
})

describe('esquema da coleção de tarefas', () => {
  const tasks = [
    task({ id: 1, title: 'Relatório', priority: 3, due_date: '2026-06-09', position: 3000, tags: [{ id: 1, name: 'foco', color: null }] }),
    task({ id: 2, title: 'Mercado', priority: 0, due_date: '2026-06-10', position: 1000 }),
    task({ id: 3, title: 'Pagar conta', priority: 2, due_date: null, position: 2000, description: 'boleto', blocked: true }),
    task({ id: 4, title: 'Treino', priority: 1, due_date: '2026-06-20', position: 4000, recurrence: { rrule: 'FREQ=DAILY', mode: 'fixed', anchor_date: null, active: true } }),
  ]
  const run = (patch: (s: ReturnType<typeof defaultState>) => void = () => {}, opts = {}) => {
    const schema = makeTasksSchema({ scope: 't', today: TODAY, ...opts })
    const state = defaultState(schema)
    patch(state)
    return runCollection(schema, state, tasks, TODAY)
  }
  const ids = (r: ReturnType<typeof run>) => r.groups.flatMap((g) => g.items.map((t) => t.id))

  it('ordem manual por padrão (posição), asc', () => {
    expect(ids(run())).toEqual([2, 3, 1, 4])
  })

  it('ordena por vencimento com "sem data" no fim', () => {
    expect(ids(run((s) => { s.sortBy = 'due'; s.dir = 'asc' }))).toEqual([1, 2, 4, 3])
  })

  it('ordena por prioridade (alta primeiro em desc)', () => {
    expect(ids(run((s) => { s.sortBy = 'priority'; s.dir = 'desc' }))).toEqual([1, 3, 4, 2])
  })

  it('busca no título, nas notas e nas etiquetas', () => {
    expect(ids(run((s) => { s.q = 'boleto' }))).toEqual([3])
    expect(ids(run((s) => { s.q = 'foco' }))).toEqual([1])
    expect(ids(run((s) => { s.q = 'treino' }))).toEqual([4])
  })

  it('facetas: faixa de vencimento e flags', () => {
    expect(ids(run((s) => { s.facets.due = { values: { overdue: true } } }))).toEqual([1])
    expect(ids(run((s) => { s.facets.due = { values: { none: true } } }))).toEqual([3])
    expect(ids(run((s) => { s.facets.blocked = { flag: true } }))).toEqual([3])
    expect(ids(run((s) => { s.facets.recurring = { flag: true } }))).toEqual([4])
    expect(ids(run((s) => { s.facets.notes = { flag: true } }))).toEqual([3])
  })

  it('agrupa por vencimento na ordem das faixas e por prioridade', () => {
    const r = run((s) => { s.groupBy = 'due'; s.sortBy = 'due'; s.dir = 'asc' })
    expect(r.groups.map((g) => g.key)).toEqual(['Atrasadas', 'Hoje', 'Depois', 'Sem data'])
    const p = run((s) => { s.groupBy = 'priority'; s.sortBy = 'priority'; s.dir = 'desc' })
    expect(p.groups.map((g) => g.key)).toEqual(['Alta', 'Média', 'Baixa', 'Sem prioridade'])
  })

  it('dueBucket cobre as faixas', () => {
    const b = (d: string | null) => dueBucket({ due_date: d }, TODAY)
    expect([b('2026-06-01'), b('2026-06-10'), b('2026-06-11'), b('2026-06-17'), b('2026-06-18'), b(null)])
      .toEqual(['overdue', 'today', 'tomorrow', 'week', 'later', 'none'])
  })

  it('a faceta Lista só aparece quando há mais de uma lista', () => {
    expect(makeTasksSchema({ scope: 'a', today: TODAY }).facets.some((f) => f.id === 'project')).toBe(false)
    expect(makeTasksSchema({ scope: 'a', today: TODAY, projectNames: { 1: 'A', 2: 'B' } }).facets.some((f) => f.id === 'project')).toBe(true)
  })
})

describe('esquema: Tipo, Lista/Grupo “todas menos estas”, GTD, local e Meu Dia', () => {
  const rows = [
    task({ id: 1, type: 'task', project_id: 1, gtd_status: 'next_action', context_id: 7 }),
    task({ id: 2, type: 'event', project_id: 2, gtd_status: null, my_day_date: '2026-06-09' }),
    task({ id: 3, type: 'birthday', project_id: 3 }),
  ]
  const opts = {
    projectNames: { 1: 'Casa', 2: 'Banco', 3: 'Solta' }, projectGroups: { 1: 10, 2: 10, 3: null }, groupNames: { 10: 'Rotina', 11: 'Outro' }, contextNames: { 7: 'Casa' },
  }
  const ids = (patch: (s: ReturnType<typeof defaultState>) => void, o: object = opts) => {
    const schema = makeTasksSchema({ scope: 't2', today: TODAY, ...o })
    const state = defaultState(schema)
    patch(state)
    return runCollection(schema, state, rows, TODAY).items.map((t) => t.id).sort()
  }

  it('Tipo: tarefa, evento e aniversário', () => {
    expect(ids((s) => { s.facets.type = { values: { birthday: true } } })).toEqual([3])
    expect(ids((s) => { s.facets.type = { values: { task: true, event: true } } })).toEqual([1, 2])
  })
  it('Lista: só estas, ou todas menos estas', () => {
    expect(ids((s) => { s.facets.project = { values: { 1: true, 2: true } } })).toEqual([1, 2])
    expect(ids((s) => { s.facets.project = { values: { 1: true, 2: true }, mode: 'nothas' } })).toEqual([3])
  })
  it('Grupo: por grupo, com “sem grupo”, e também excluível', () => {
    expect(ids((s) => { s.facets.group = { values: { 10: true } } })).toEqual([1, 2])
    expect(ids((s) => { s.facets.group = { values: { none: true } } })).toEqual([3])
    expect(ids((s) => { s.facets.group = { values: { 10: true }, mode: 'nothas' } })).toEqual([3])
  })
  it('Status GTD, Onde (@) e Só no Meu Dia', () => {
    expect(ids((s) => { s.facets.gtd = { values: { next_action: true } } })).toEqual([1])
    expect(ids((s) => { s.facets.gtd = { values: { none: true } } })).toEqual([2, 3])
    expect(ids((s) => { s.facets.context = { values: { 7: true } } })).toEqual([1])
    expect(ids((s) => { s.facets.myday = { flag: true } })).toEqual([2])
  })
  it('sem nomes de listas/grupos/locais as facetas de Lista, Grupo e Onde não existem (tela de uma lista só)', () => {
    const f = makeTasksSchema({ scope: 't3', today: TODAY }).facets.map((x) => x.id)
    expect(f).toContain('type')
    expect(f).not.toContain('project')
    expect(f).not.toContain('group')
    expect(f).not.toContain('context')
  })
})
