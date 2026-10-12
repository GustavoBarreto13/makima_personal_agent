import { describe, expect, it } from 'vitest'
import { captureToTask, resolveProject, taskParser } from './quickAdd'

const projects = [{ id: 1, name: 'Inbox' }, { id: 2, name: 'Trabalho' }, { id: 3, name: 'Finanças' }, { id: 4, name: 'Financeiro Casa' }]
const parse = (text: string) => taskParser(text)

describe('resolveProject', () => {
  it('igual ignora acento e caixa; prefixo só vale se for único', () => {
    expect(resolveProject('financas', projects)).toBe(3)
    expect(resolveProject('TRAB', projects)).toBe(2)
    expect(resolveProject('finan', projects)).toBeUndefined() // Finanças e Financeiro Casa: ambíguo
    expect(resolveProject('nada', projects)).toBeUndefined()
    expect(resolveProject(null, projects)).toBeUndefined()
  })
})

describe('captureToTask', () => {
  const ctx = { projects, defaultProjectId: 1 }

  it('título limpo, lista, etiqueta, prioridade e duração', () => {
    const r = captureToTask(parse('Enviar relatório @trabalho #urgente !alta 45min'), ctx)!
    expect(r.body).toMatchObject({ title: 'Enviar relatório', project_id: 2, tags: ['urgente'], priority: 3, duration_min: 45 })
    expect(r.unknownList).toBeNull()
  })

  it('sem lista no texto usa a lista padrão; sem título não cria', () => {
    expect(captureToTask(parse('Comprar pão'), ctx)!.body.project_id).toBe(1)
    expect(captureToTask(parse('#sozinha'), ctx)).toBeNull()
    expect(captureToTask(parse('   '), ctx)).toBeNull()
  })

  it('lista citada que não existe avisa e cai na padrão', () => {
    const r = captureToTask(parse('Ligar @fantasma'), ctx)!
    expect(r.unknownList).toBe('fantasma')
    expect(r.body.project_id).toBe(1)
  })

  it('data padrão da tela só vale quando o texto não traz data', () => {
    expect(captureToTask(parse('Pagar conta'), { ...ctx, defaultDue: '2026-06-10' })!.body.due_date).toBe('2026-06-10')
    const withDate = captureToTask(parse('Pagar conta 12/09'), { ...ctx, defaultDue: '2026-06-10' })!
    expect(withDate.body.due_date).toMatch(/-09-12$/)
  })

  it('recorrência vira rrule + modo e define a âncora como vencimento', () => {
    const r = captureToTask(parse('Aluguel todo dia 5'), ctx)!
    expect(r.body.recurrence).toMatchObject({ mode: 'fixed' })
    expect(r.body.recurrence!.rrule).toContain('BYMONTHDAY=5')
    expect(r.body.title).toBe('Aluguel')
  })
})
