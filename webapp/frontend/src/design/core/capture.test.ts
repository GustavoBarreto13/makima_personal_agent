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

describe('registro financeiro (Nami, spec 070)', () => {
  const parse = createCaptureParser({
    rules: ['place', 'person', 'tag', 'amount', 'bareAmount', 'income', 'installments', 'date'],
    dateDirection: 'past',
    today: '2026-10-02',
  })

  it('"45 ifood @nubank": valor solto, descrição e cartão', () => {
    const { fields: f } = parse('45 ifood @nubank')
    expect(f.amount).toBe(45)
    expect(f.title).toBe('ifood')
    expect(f.place).toBe('nubank')
    expect(f.installments).toBeNull()
    expect(f.income).toBe(false)
  })

  it('"1200 tv 10x @nubank": o valor digitado é o TOTAL e 10x são as parcelas', () => {
    const { fields: f } = parse('1200 tv 10x @nubank')
    expect(f.amount).toBe(1200)
    expect(f.installments).toBe(10)
    expect(f.title).toBe('tv')
    expect(f.place).toBe('nubank')
  })

  it('"em 10x" também some do título', () => {
    expect(parse('1200 tv em 10x').fields.title).toBe('tv')
    expect(parse('1200 tv em 10x').fields.installments).toBe(10)
  })

  it('"ontem 30 uber": registro no passado', () => {
    const { fields: f } = parse('ontem 30 uber')
    expect(f.dueDate).toBe('2026-10-01')
    expect(f.amount).toBe(30)
    expect(f.title).toBe('uber')
  })

  it('"+3500 salário" é entrada, e "+" seguido de número não vira pessoa', () => {
    const { fields: f } = parse('+3500 salário')
    expect(f.income).toBe(true)
    expect(f.amount).toBe(3500)
    expect(f.people).toEqual([])
    expect(f.title).toBe('salário')
  })

  it('"+Ana" continua sendo pessoa, mesmo com a regra de entrada ligada', () => {
    const { fields: f } = parse('25 almoço +Ana')
    expect(f.people).toEqual(['Ana'])
    expect(f.income).toBe(false)
    expect(f.amount).toBe(25)
  })

  it.each([
    ['1.299,90 geladeira', 1299.9],
    ['89,9 padaria', 89.9],
    ['12.5 café', 12.5],
    ['1.200 notebook', 1200],      // ponto + 3 dígitos é milhar
    ['R$ 42,90 mercado', 42.9],
    ['R$42 feira', 42],
  ])('valor "%s"', (input, esperado) => {
    expect(parse(input).fields.amount).toBe(esperado)
  })

  it('com mais de um número solto, vale o último e os outros ficam na descrição', () => {
    const { fields: f } = parse('3 cervejas 45')
    expect(f.amount).toBe(45)
    expect(f.title).toBe('3 cervejas')
  })

  it('valor explícito (R$) tem prioridade sobre número solto', () => {
    const { fields: f } = parse('R$ 10 café 3')
    expect(f.amount).toBe(10)
    expect(f.title).toBe('café 3')
  })

  it('"1x" não é parcelamento e "4x8" não é parcela (é série de treino)', () => {
    expect(parse('1x compra 20').fields.installments).toBeNull()
    expect(parse('supino 4x8 30').fields.installments).toBeNull()
    expect(parse('1x compra 20').fields.title).toBe('1x compra')
  })

  it('número dentro de etiqueta não vira valor', () => {
    const { fields: f } = parse('50 teste #2024')
    expect(f.amount).toBe(50)
    expect(f.tags).toEqual(['2024'])
  })

  it('sem as regras novas o comportamento antigo se mantém (paridade com outros agentes)', () => {
    const legacy = createCaptureParser({ rules: ['person', 'amount'], today: '2026-10-02' })
    expect(legacy('+3500 salário').fields.people).toEqual(['3500'])
    expect(legacy('45 ifood').fields.amount).toBeNull()
    expect(legacy('tv 10x').fields.installments).toBeNull()
  })

  it('chips mostram entrada e parcelas já com o valor de cada uma', () => {
    const r = parse('1200 tv 10x')
    const chips = captureChips(r, '2026-10-02')
    // fmtMoney usa espaço não separável depois do "R$" (não quebra linha no meio do valor)
    expect(chips.find((c) => c.id === 'installments')?.label.replace(/ /g, ' ')).toBe('10x · R$ 120,00 cada')
    expect(captureChips(parse('+3500 salário'), '2026-10-02').find((c) => c.id === 'amount')?.label).toContain('Entrada')
  })

  it('remover o chip de parcelas tira "em 10x" do texto', () => {
    const r = parse('1200 tv em 10x @nubank')
    const chip = captureChips(r, '2026-10-02').find((c) => c.id === 'installments')!
    expect(removeTokens(r, chip.tokenIdx)).toBe('1200 tv @nubank')
  })
})
