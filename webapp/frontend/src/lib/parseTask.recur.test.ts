// Testes do parser de recorrência (fatia 018 — SC-004).
// Cobre cada padrão de FR-005: RRULE/modo/label/âncora corretos.
// Funções puras — não precisam de DOM (sem jsdom).

import { describe, it, expect } from 'vitest'
import { parseTask } from './parseTask'

// ─── helpers para asserções agnósticas de data ───────────────────────────────

// Verifica que o RRULE começa com o prefixo esperado (agnóstico à âncora).
function expectRule(input: string, expectedRrule: string, expectedLabel: string) {
  const p = parseTask(input)
  expect(p.recur).not.toBeNull()
  expect(p.recur!.rule).toBe(expectedRrule)
  expect(p.recur!.mode).toBe('fixed')
  expect(p.recur!.label).toBe(expectedLabel)
  // Âncora deve ser uma data ISO válida ("YYYY-MM-DD").
  expect(p.recur!.anchor).toMatch(/^\d{4}-\d{2}-\d{2}$/)
}

// ─── Padrões de FR-005 ───────────────────────────────────────────────────────

describe('parseTask — recorrência', () => {

  it('todo dia 10 → FREQ=MONTHLY;BYMONTHDAY=10', () => {
    expectRule('pagar aluguel todo dia 10', 'FREQ=MONTHLY;BYMONTHDAY=10', 'todo dia 10')
    const p = parseTask('pagar aluguel todo dia 10')
    // Título limpo não deve conter "todo", "dia", "10".
    expect(p.title).toBe('pagar aluguel')
    // dueDate deve ser preenchida com a âncora derivada.
    expect(p.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('toda sexta → FREQ=WEEKLY;BYDAY=FR', () => {
    expectRule('treinar toda sexta', 'FREQ=WEEKLY;BYDAY=FR', 'toda sexta')
    const p = parseTask('treinar toda sexta')
    expect(p.title).toBe('treinar')
  })

  it('toda segunda → FREQ=WEEKLY;BYDAY=MO', () => {
    expectRule('reunião toda segunda', 'FREQ=WEEKLY;BYDAY=MO', 'toda segunda')
  })

  it('toda quarta → FREQ=WEEKLY;BYDAY=WE', () => {
    expectRule('academia toda quarta', 'FREQ=WEEKLY;BYDAY=WE', 'toda quarta')
  })

  it('todo domingo → FREQ=WEEKLY;BYDAY=SU (apesar de todo/toda)', () => {
    expectRule('ligar para a família todo domingo', 'FREQ=WEEKLY;BYDAY=SU', 'toda domingo')
  })

  it('a cada 2 dias → FREQ=DAILY;INTERVAL=2', () => {
    expectRule('treinar a cada 2 dias', 'FREQ=DAILY;INTERVAL=2', 'a cada 2 dias')
    const p = parseTask('treinar a cada 2 dias')
    expect(p.title).toBe('treinar')
  })

  it('a cada 1 dia → FREQ=DAILY (sem INTERVAL)', () => {
    expectRule('ler a cada 1 dia', 'FREQ=DAILY', 'todo dia')
  })

  it('a cada 7 dias → FREQ=DAILY;INTERVAL=7', () => {
    expectRule('limpar a cada 7 dias', 'FREQ=DAILY;INTERVAL=7', 'a cada 7 dias')
  })

  it('todo mês → FREQ=MONTHLY;BYMONTHDAY=<dia-atual>', () => {
    const p = parseTask('pagar conta todo mês')
    expect(p.recur).not.toBeNull()
    expect(p.recur!.rule).toMatch(/^FREQ=MONTHLY;BYMONTHDAY=\d{1,2}$/)
    expect(p.recur!.label).toBe('todo mês')
    expect(p.title).toBe('pagar conta')
  })

  it('todo ano → FREQ=YEARLY', () => {
    // Input sem "aniversário" para evitar ambiguidade de dois padrões no mesmo texto.
    expectRule('renovar seguro todo ano', 'FREQ=YEARLY', 'todo ano')
    const p = parseTask('renovar seguro todo ano')
    expect(p.title).toBe('renovar seguro')
  })

  it('aniversário (token único) → FREQ=YEARLY', () => {
    const p = parseTask('aniversario da Ana')
    expect(p.recur).not.toBeNull()
    expect(p.recur!.rule).toBe('FREQ=YEARLY')
    expect(p.recur!.label).toBe('todo ano')
    // Título: "da Ana" (sem o token aniversario)
    expect(p.title).toBe('da Ana')
  })

  // ─── Caso de preservação (SC-004: sem recorrência = comportamento atual) ──

  it('texto sem recorrência → recur = null', () => {
    const p = parseTask('comprar leite amanhã !alta')
    expect(p.recur).toBeNull()
    expect(p.dueDate).not.toBeNull()   // data foi processada normalmente
    expect(p.priority).toBe(3)
    expect(p.title).toBe('comprar leite')
  })

  it('texto sem nada → recur null, sem dueDate', () => {
    const p = parseTask('ligar para João')
    expect(p.recur).toBeNull()
    expect(p.dueDate).toBeNull()
    expect(p.title).toBe('ligar para João')
  })

  // ─── Conflito data × recorrência (edge case da spec) ─────────────────────

  it('data explícita + recorrência → recur.anchor = data explícita', () => {
    // "todo dia 5" daria âncora no dia 5, mas "amanhã" é data explícita.
    const p = parseTask('pagar amanhã todo dia 5')
    expect(p.recur).not.toBeNull()
    // A âncora deve ser a data explícita (amanhã = hoje+1 dia), não o dia 5.
    expect(p.recur!.anchor).toBe(p.dueDate)
    // dueDate = data explícita (amanhã).
    expect(p.dueDate).not.toBeNull()
    expect(p.recur!.rule).toBe('FREQ=MONTHLY;BYMONTHDAY=5')
  })

  // ─── Mirror: segmentos tok-recur ─────────────────────────────────────────

  it('tokens de recorrência pintados com tok-recur nos segments', () => {
    const p = parseTask('pagar aluguel todo dia 10 @Finanças')
    // Deve ter segmentos tok-recur para "todo", "dia", "10".
    const recurSegs = p.segments.filter(s => s.cls === 'tok-recur')
    expect(recurSegs.length).toBeGreaterThan(0)
    // Deve ter segmento tok-proj para "@Finanças".
    const projSegs = p.segments.filter(s => s.cls === 'tok-proj')
    expect(projSegs.length).toBe(1)
    // Nenhum token de recorrência deve aparecer no título.
    expect(p.title).toBe('pagar aluguel')
  })

  // ─── Combinações com outros tokens ───────────────────────────────────────

  it('recorrência + prioridade + tag → todos reconhecidos', () => {
    const p = parseTask('reunião toda segunda !alta #trabalho')
    expect(p.recur!.rule).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(p.priority).toBe(3)
    expect(p.tags).toContain('trabalho')
    expect(p.title).toBe('reunião')
  })

  it('recorrência + @lista → reconhecidos sem conflito', () => {
    const p = parseTask('pagar aluguel todo dia 10 @Finanças !alta')
    expect(p.recur!.rule).toBe('FREQ=MONTHLY;BYMONTHDAY=10')
    expect(p.projectToken).toBe('Finanças')
    expect(p.priority).toBe(3)
    expect(p.title).toBe('pagar aluguel')
  })

})
