import { describe, it, expect } from 'vitest'
import { captureChips, createCaptureParser, removeTokens } from './capture'
import { addDaysISO, isoDate } from './format'
import { parseTask } from '../../lib/parseTask'

const REAL_TODAY = isoDate(new Date())

describe('paridade com o parseTask da Kaguya (datas, recorrência, prioridade, etiquetas)', () => {
  const parse = createCaptureParser({ rules: ['place', 'tag', 'priority', 'date', 'recur'] })
  const inputs = [
    'comprar pão amanhã 9h #casa !alta',
    'pagar aluguel todo dia 10',
    'treinar toda sexta',
    'reunião @trabalho segunda 14:30 #x',
    'estudar a cada 2 dias',
    'ligar para mãe sexta 17h30 !média',
    'revisar relatório próxima quarta',
    'academia hoje 18h #saude #corpo',
    'pagar fatura 15/11',
    'nota solta sem tokens',
    'ler a cada 1 dia',
    'todo mês pagar condomínio',
    'aniversário da Ana 12/03',
    'reunião 17h',
  ]
  it.each(inputs)('"%s"', (input) => {
    const a = parse(input)
    const b = parseTask(input)
    expect(a.fields.title).toBe(b.title)
    expect(a.fields.dueDate).toBe(b.dueDate)
    expect(a.fields.dueTime).toBe(b.dueTime)
    expect(a.fields.priority).toBe(b.priority)
    expect(a.fields.tags).toEqual(b.tags)
    expect(a.fields.place).toBe(b.projectToken)
    expect(a.fields.recur?.rule ?? null).toBe(b.recur?.rule ?? null)
    expect(a.fields.recur?.label ?? null).toBe(b.recur?.label ?? null)
    expect(a.fields.recur?.anchor ?? null).toBe(b.recur?.anchor ?? null)
  })
})

describe('registro de treino', () => {
  const parse = createCaptureParser({
    rules: ['place', 'tag', 'rating', 'sets', 'load', 'distance', 'duration', 'date'],
    dateDirection: 'past',
    orphanTime: true,
    today: '2026-10-02',
  })

  it('entende série, carga, local, etiqueta, nota, dia e hora', () => {
    const { fields: f } = parse('Supino 4x8 80kg @Smart-Fit #peito ★4.5 hoje 18h')
    expect(f.title).toBe('Supino')
    expect(f.sets).toEqual([4, 8])
    expect(f.load).toBe(80)
    expect(f.place).toBe('Smart Fit')
    expect(f.tags).toEqual(['peito'])
    expect(f.rating).toBe(4.5)
    expect(f.dueDate).toBe(REAL_TODAY)
    expect(f.dueTime).toBe('18:00')
  })

  it('"4/5" é nota (e não 4 de maio) quando a regra de nota está ligada', () => {
    const { fields: f } = parse('Rodagem leve 6km 38min @Ibirapuera ontem 4/5')
    expect(f.rating).toBe(4)
    expect(f.distance).toBe(6)
    expect(f.duration).toBe(38)
    expect(f.dueDate).toBe('2026-10-01')
    expect(f.title).toBe('Rodagem leve')
  })

  it('dia da semana solto é o mais recente, e hoje conta', () => {
    expect(parse('yoga quarta').fields.dueDate).toBe('2026-09-30')
    expect(parse('yoga sexta').fields.dueDate).toBe('2026-10-02')
    expect(parse('yoga anteontem').fields.dueDate).toBe('2026-09-30')
    expect(parse('yoga sábado').fields.dueDate).toBe('2026-09-26')
  })

  it('nota arredonda para a meia estrela', () => {
    expect(parse('treino ★3.7').fields.rating).toBe(3.5)
    expect(parse('treino *5').fields.rating).toBe(5)
    expect(parse('treino ★0').fields.rating).toBeNull()
  })

  it('hora sem data só vale com orphanTime', () => {
    expect(parse('treino 18h').fields.dueTime).toBe('18:00')
    const strict = createCaptureParser({ rules: ['date'] })
    const r = strict('treino 18h')
    expect(r.fields.dueTime).toBeNull()
    expect(r.fields.title).toBe('treino 18h')
  })
})

describe('regras de valor e progresso', () => {
  const money = createCaptureParser({ rules: ['place', 'tag', 'amount', 'date'], dateDirection: 'past', today: '2026-10-02' })
  const media = createCaptureParser({ rules: ['progress', 'rating', 'date'], dateDirection: 'past', today: '2026-10-02' })

  it('valor com R$, com ou sem espaço, e decimal solto', () => {
    expect(money('mercado R$ 87,50 @nubank #alimentação ontem').fields.amount).toBe(87.5)
    expect(money('mercado R$87,50').fields.amount).toBe(87.5)
    expect(money('taxi 42,90').fields.amount).toBe(42.9)
    expect(money('mercado R$ 87,50').fields.title).toBe('mercado')
    expect(money('mercado R$ 87,50 ontem').fields.dueDate).toBe('2026-10-01')
  })

  it('progresso de episódios e páginas', () => {
    expect(media('Duna p. 240').fields.progress).toEqual({ unit: 'page', from: null, to: 240 })
    expect(media('Duna p240').fields.progress).toEqual({ unit: 'page', from: null, to: 240 })
    expect(media('Severance ep 3-5 ★4.5').fields.progress).toEqual({ unit: 'ep', from: 3, to: 5 })
    expect(media('Frieren ep12').fields.progress).toEqual({ unit: 'ep', from: null, to: 12 })
    expect(media('Severance ep 3-5 ★4.5').fields.rating).toBe(4.5)
    expect(media('Severance ep 3-5').fields.title).toBe('Severance')
  })
})

describe('segmentos, chips e remoção', () => {
  const parse = createCaptureParser({ rules: ['place', 'tag', 'rating', 'sets', 'load', 'duration', 'date'], dateDirection: 'past', today: '2026-10-02' })

  it('os segmentos reconstroem o texto original', () => {
    const text = 'Supino   4x8 80kg @Smart-Fit  #peito'
    expect(parse(text).segments.map((s) => s.text).join('')).toBe(text)
  })

  it('chips legíveis e removíveis', () => {
    const r = parse('Supino 4x8 80kg @Smart-Fit #peito ★4.5 ontem')
    const chips = captureChips(r, '2026-10-02')
    expect(chips.map((c) => c.label)).toEqual(['ontem', 'Smart Fit', '#peito', '4×8 · 80 kg', '4.5 / 5'])
    const rate = chips.find((c) => c.kind === 'rating')!
    expect(rate.rating).toBe(4.5)
    expect(removeTokens(r, rate.tokenIdx)).toBe('Supino 4x8 80kg @Smart-Fit #peito ontem')
    const load = chips.find((c) => c.id === 'load')!
    expect(removeTokens(r, load.tokenIdx)).toBe('Supino @Smart-Fit #peito ★4.5 ontem')
  })

  it('texto vazio não gera nada', () => {
    const r = parse('')
    expect(r.tokens).toEqual([])
    expect(captureChips(r)).toEqual([])
    expect(r.fields.title).toBe('')
  })

  it('ontem usa a data injetada', () => {
    expect(parse('treino ontem').fields.dueDate).toBe(addDaysISO('2026-10-02', -1))
  })
})
