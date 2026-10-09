import { describe, expect, it } from 'vitest'
import { assignLanes, gcalToEvent, hubToEvent, isEditable, isoWeek, localISO, minToLabel, shiftRef, snapTo15, taskToEvent, timeToMin, visibleInSpace, windowFor, workBand } from './calendar'
import type { Calendar, CalEvent, SchedulePrefs, Task } from '../types'

const task = (over: Partial<Task> = {}) => ({ id: 1, title: 'T', due_date: null, due_time: null, start_at: null, end_at: null, completed_at: null, ...over }) as Task
const ev = (over: Partial<CalEvent> = {}): CalEvent => ({ id: 'e', cal: 'kaguya', day: '2026-06-10', start: null, end: null, allDay: true, color: null, kind: 'task', title: 'x', ...over })
const prefs: SchedulePrefs = { work_days: [1, 2, 3, 4, 5], work_start: '09:00', work_end: '18:00', lunch_start: '12:00', lunch_end: '13:00', lunch_is_free: false, wake_time: '07:00', sleep_time: '23:00' }

describe('janelas', () => {
  it('a semana vai de domingo a sábado', () => {
    const w = windowFor('week', '2026-06-10') // quarta
    expect(w.days[0]).toBe('2026-06-07')
    expect(w.days[6]).toBe('2026-06-13')
    expect(w.days).toHaveLength(7)
  })
  it('o mês tem 42 dias a partir do domingo que antecede o dia 1', () => {
    const w = windowFor('month', '2026-06-10')
    expect(w.days).toHaveLength(42)
    expect(w.days[0]).toBe('2026-05-31')
    expect(w.days).toContain('2026-06-30')
  })
  it('navegar o mês não pula (31 de março → abril)', () => {
    expect(shiftRef('month', '2026-03-31', 1)).toBe('2026-04-01')
    expect(shiftRef('month', '2026-01-15', -1)).toBe('2025-12-01')
    expect(shiftRef('week', '2026-06-10', 1)).toBe('2026-06-17')
    expect(shiftRef('day', '2026-06-01', -1)).toBe('2026-05-31')
  })
  it('semana ISO pela quinta-feira', () => {
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(isoWeek('2026-06-10')).toBe(24)
    expect(isoWeek('2026-12-31')).toBe(53)
  })
})

describe('horários', () => {
  it('converte datetime com offset e HH:MM em minutos locais', () => {
    expect(timeToMin('14:30')).toBe(870)
    expect(timeToMin('2026-06-10T14:30:00')).toBe(870) // sem offset = local
    expect(timeToMin(null)).toBe(0)
    expect(minToLabel(870)).toBe('14:30')
    expect(snapTo15(52)).toBe(45)
    expect(snapTo15(53)).toBe(60)
  })
  it('localISO monta o instante com offset (nunca UTC puro)', () => {
    expect(localISO('2026-06-10', 870)).toMatch(/^2026-06-10T14:30:00[+-]\d{2}:\d{2}$/)
    expect(new Date(localISO('2026-06-10', 870)).getHours()).toBe(14)
  })
})

describe('eventos', () => {
  it('tarefa vira bloco, ponto no tempo ou dia inteiro; sem data some', () => {
    expect(taskToEvent(task({ start_at: '2026-06-10T14:00:00-03:00', end_at: '2026-06-10T15:00:00-03:00' }))).toMatchObject({ allDay: false, kind: 'task', taskId: 1 })
    expect(taskToEvent(task({ due_date: '2026-06-10', due_time: '09:30' }))).toMatchObject({ allDay: false, start: '2026-06-10T09:30', end: null })
    expect(taskToEvent(task({ due_date: '2026-06-10' }))).toMatchObject({ allDay: true, start: null })
    expect(taskToEvent(task())).toBeNull()
  })
  it('marca concluída e recorrente', () => {
    expect(taskToEvent(task({ due_date: '2026-06-10', completed_at: '2026-06-10T10:00:00Z', series_id: 's1' }))).toMatchObject({ done: true, recurring: true })
  })
  it('o dia de um bloco vem do fuso local, não do dia UTC', () => {
    // 22:30 em UTC-3 é 01:30 UTC do dia seguinte: o dia correto é o local do navegador do instante.
    const e = taskToEvent(task({ start_at: '2026-06-10T22:30:00-03:00' }))!
    const d = new Date('2026-06-10T22:30:00-03:00')
    expect(e.day).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  })
  it('hub e Google viram eventos somente leitura / dia inteiro', () => {
    expect(hubToEvent({ cal: 'nami', date: '2026-06-10', all_day: true, title: 'Fatura', kind: 'x', ref_id: '7' })).toMatchObject({ id: 'nami-7', kind: 'event' })
    expect(gcalToEvent({ id: 'a', summary: 'Aniversário', start: '2026-06-10', end: '2026-06-11', calendar_id: 'c1' })).toMatchObject({ allDay: true, cal: 'gcal:c1', start: null })
    expect(gcalToEvent({ id: 'b', summary: 'Reunião', start: '2026-06-10T10:00:00-03:00', end: '2026-06-10T11:00:00-03:00', calendar_id: 'c1' }).allDay).toBe(false)
  })
})

describe('permissões e espaço', () => {
  const cals = [{ id: 'gcal:w', writable: true, context: 'work' }, { id: 'gcal:r', writable: false }, { id: 'gcal:p', writable: true, context: 'personal' }] as Calendar[]
  it('só tarefas e Google com escrita são editáveis', () => {
    expect(isEditable(ev({ cal: 'kaguya' }), cals)).toBe(true)
    expect(isEditable(ev({ cal: 'gcal:w' }), cals)).toBe(true)
    expect(isEditable(ev({ cal: 'gcal:r' }), cals)).toBe(false)
    expect(isEditable(ev({ cal: 'nami' }), cals)).toBe(false)
  })
  it('o espaço filtra Google pelo contexto e trata os outros agentes como pessoais', () => {
    expect(visibleInSpace(ev({ cal: 'gcal:w' }), 'work', cals)).toBe(true)
    expect(visibleInSpace(ev({ cal: 'gcal:w' }), 'personal', cals)).toBe(false)
    expect(visibleInSpace(ev({ cal: 'gcal:r' }), 'personal', cals)).toBe(true) // sem contexto = pessoal
    expect(visibleInSpace(ev({ cal: 'nami' }), 'work', cals)).toBe(false)
    expect(visibleInSpace(ev({ cal: 'nami' }), undefined, cals)).toBe(true)
    expect(visibleInSpace(ev({ cal: 'kaguya' }), 'work', cals)).toBe(true)
  })
})

describe('faixas de sobreposição', () => {
  const at = (id: string, s: string, e: string | null) => ev({ id, allDay: false, start: `2026-06-10T${s}`, end: e ? `2026-06-10T${e}` : null })
  it('eventos que se tocam dividem a coluna; os separados ficam inteiros', () => {
    const l = assignLanes([at('a', '09:00', '10:00'), at('b', '09:30', '10:30'), at('c', '11:00', '11:30'), ev({ id: 'd' })])
    expect(l.map((x) => [x.ev.id, x.lane, x.totalLanes])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 1]])
  })
  it('sem fim dura 30 minutos', () => {
    expect(assignLanes([at('a', '09:00', null)])[0].endMin - 540).toBe(30)
  })
})

describe('expediente no grid', () => {
  it('dia útil tem faixa e almoço; fim de semana não', () => {
    expect(workBand('2026-06-10', prefs, [])).toEqual({ start: 540, end: 1080, lunch: [720, 780] })
    expect(workBand('2026-06-13', prefs, [])).toBeNull() // sábado
    expect(workBand('2026-06-07', prefs, [])).toBeNull() // domingo (JS 0 → ISO 7)
  })
  it('a exceção do dia vale sobre a regra (sábado trabalhado, folga em dia útil, horário diferente)', () => {
    expect(workBand('2026-06-13', prefs, [{ day: '2026-06-13', works: true, work_start: '10:00', work_end: '14:00', note: null }])).toMatchObject({ start: 600, end: 840, lunch: [720, 780] })
    // O almoço só entra se couber no expediente do dia.
    expect(workBand('2026-06-13', prefs, [{ day: '2026-06-13', works: true, work_start: '09:00', work_end: '11:00', note: null }])?.lunch).toBeNull()
    expect(workBand('2026-06-10', prefs, [{ day: '2026-06-10', works: false, work_start: null, work_end: null, note: null }])).toBeNull()
  })
  it('sem preferências não há faixa', () => {
    expect(workBand('2026-06-10', null, [])).toBeNull()
  })
})
