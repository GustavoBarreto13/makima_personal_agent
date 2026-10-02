// Motor de captura rápida — gramática de tokens pt-BR plugável (padrão do quick-add da Kaguya).
// TypeScript puro, sem DOM. Reaproveita parseDate/parseRecur do parser da Kaguya (lib/), então
// datas e recorrência têm paridade por construção (coberta por teste).
//
// Sintaxe compartilhada por todo o app:
//   @nome            contêiner (lista, estante, viagem, conta, local)
//   +nome            pessoa (vínculo Komi)
//   #tag             etiquetas (várias)
//   !alta|!média|!baixa    prioridade
//   hoje, amanhã, sexta, 12/09, 17h, 17:30      data e hora (via parseDate)
//   todo dia 5, toda sexta, a cada 2 dias        recorrência (via parseRecur)
//   ★4.5 | *4.5 | 4.5/5                          nota (0 a 5, meia estrela)
//   R$ 42,90 | R$42,90 | 42,90                   valor
//   ep 12 | ep 3-5 | p. 240 | p240               progresso
//   4x8 · 80kg · 6km · 45min                      séries×repetições, carga, distância, duração
//
// Cada domínio escolhe quais regras valem (rules) — ver `CaptureOptions`.

import { parseDate, WEEKDAY } from '../../lib/parseDate'
import { parseRecur, type ParsedRecur } from '../../lib/parseTask'
import { addDaysISO, fmtDuration, fmtMoney, fmtNumber, fmtRelative, isoDate, parseISODate, snapHalf } from './format'

export type CaptureRuleId =
  | 'place' | 'person' | 'tag' | 'priority' | 'date' | 'recur' | 'rating'
  | 'amount' | 'progress' | 'sets' | 'load' | 'distance' | 'duration'

/** Categoria visual do token (cor no destaque ao vivo). */
export type CaptureKind = 'place' | 'person' | 'tag' | 'priority' | 'date' | 'recur' | 'rating' | 'amount' | 'progress' | 'quantity' | 'duration'

export interface CaptureOptions {
  rules: CaptureRuleId[]
  /**
   * Como resolver dia da semana solto ("sexta"):
   *   'future' (padrão, tarefas): próxima ocorrência futura.
   *   'past' (registros: treino, leitura): ocorrência mais recente; habilita "ontem" e "anteontem".
   */
  dateDirection?: 'future' | 'past'
  /** Aceita hora sem data ("18h"), assumindo hoje. Padrão false (paridade com a Kaguya). */
  orphanTime?: boolean
  /** Data de hoje (testes). Padrão: relógio local. */
  today?: string
}

export interface CaptureFields {
  title: string
  place: string | null
  people: string[]
  tags: string[]
  priority: number | null
  dueDate: string | null
  dueTime: string | null
  recur: ParsedRecur | null
  rating: number | null
  amount: number | null
  progress: { unit: 'ep' | 'page'; from: number | null; to: number } | null
  sets: [number, number] | null
  load: number | null
  distance: number | null
  duration: number | null
}

export interface CaptureToken {
  index: number
  text: string
  start: number
  end: number
  kind: CaptureKind
}

export interface CaptureSegment {
  text: string
  kind: CaptureKind | null
}

export interface CaptureResult {
  text: string
  fields: CaptureFields
  segments: CaptureSegment[]
  /** Somente os tokens reconhecidos (para chips e remoção). */
  tokens: CaptureToken[]
}

export interface CaptureChip {
  id: string
  kind: CaptureKind
  label: string
  /** Índices em `tokens` removidos ao clicar no x do chip. */
  tokenIdx: number[]
  /** Nota, para o UI desenhar estrelas no chip. */
  rating?: number
}

const PRIO: Record<string, number> = { alta: 3, alto: 3, media: 2, 'média': 2, medio: 2, 'médio': 2, baixa: 1, baixo: 1 }

const norm = (s: string): string => s.toLowerCase().replace(/[.,;:!?]+$/, '')
const num = (s: string): number => parseFloat(s.replace(',', '.'))

const RE_TIME = /^(\d{1,2})h(\d{2})?$|^(\d{1,2}):(\d{2})$/i

function emptyFields(): CaptureFields {
  return {
    title: '', place: null, people: [], tags: [], priority: null, dueDate: null, dueTime: null, recur: null,
    rating: null, amount: null, progress: null, sets: null, load: null, distance: null, duration: null,
  }
}

/** Ocorrência mais recente (ou hoje) de um dia da semana (0=dom). */
function previousWeekday(today: string, target: number): string {
  const d = parseISODate(today)
  const back = (d.getDay() - target + 7) % 7
  return addDaysISO(today, -back)
}

export function createCaptureParser(opts: CaptureOptions): (text: string) => CaptureResult {
  const rules = new Set(opts.rules)
  const past = opts.dateDirection === 'past'

  return (text: string): CaptureResult => {
    const today = opts.today ?? isoDate(new Date())
    const fields = emptyFields()
    const words: { text: string; start: number; end: number }[] = []
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) words.push({ text: m[0], start: m.index, end: m.index + m[0].length })

    const kinds: (CaptureKind | null)[] = words.map(() => null)
    const claim = (i: number, kind: CaptureKind) => { kinds[i] = kind }
    const free = (i: number) => i < words.length && kinds[i] === null

    // 1) Recorrência (antes da data: "toda sexta" não pode virar data).
    let recur: ParsedRecur | null = null
    if (rules.has('recur')) {
      const r = parseRecur(words.map((w) => w.text))
      recur = r.recur
      r.consumed.forEach((i) => claim(i, 'recur'))
    }

    // 2) Tokens de uma palavra e de várias palavras (ordem importa: nota antes da data, pois "4/5" é nota).
    for (let i = 0; i < words.length; i++) {
      if (!free(i)) continue
      const t = words[i].text
      let x: RegExpExecArray | null

      if (rules.has('place') && t.startsWith('@') && t.length > 1) { fields.place = t.slice(1).replace(/-/g, ' '); claim(i, 'place'); continue }
      if (rules.has('person') && t.startsWith('+') && t.length > 1) { fields.people.push(t.slice(1).replace(/-/g, ' ')); claim(i, 'person'); continue }
      if (rules.has('tag') && t.startsWith('#') && t.length > 1) {
        const name = t.slice(1).match(/^[\p{L}\p{N}_-]+/u)?.[0]
        if (name) { fields.tags.push(name.toLowerCase()); claim(i, 'tag'); continue }
      }
      if (rules.has('priority') && t.startsWith('!')) {
        const p = PRIO[t.slice(1).toLowerCase()]
        if (p !== undefined) { fields.priority = p; claim(i, 'priority'); continue }
      }
      if (rules.has('rating')) {
        x = /^[★*](\d(?:[.,]\d)?)$/.exec(t) ?? /^(\d(?:[.,]\d)?)\/5$/.exec(t)
        if (x) { const v = snapHalf(num(x[1])); if (v > 0) { fields.rating = v; claim(i, 'rating'); continue } }
      }
      if (rules.has('sets') && (x = /^(\d+)x(\d+)$/i.exec(t))) { fields.sets = [Number(x[1]), Number(x[2])]; claim(i, 'quantity'); continue }
      if (rules.has('load') && (x = /^(\d+(?:[.,]\d+)?)kg$/i.exec(t))) { fields.load = num(x[1]); claim(i, 'quantity'); continue }
      if (rules.has('distance') && (x = /^(\d+(?:[.,]\d+)?)km$/i.exec(t))) { fields.distance = num(x[1]); claim(i, 'quantity'); continue }
      if (rules.has('duration') && (x = /^(\d+)(?:min|')$/i.exec(t))) { fields.duration = Number(x[1]); claim(i, 'duration'); continue }
      if (rules.has('amount')) {
        if ((x = /^R\$(\d+(?:[.,]\d+)?)$/i.exec(t))) { fields.amount = num(x[1]); claim(i, 'amount'); continue }
        if (/^R\$$/i.test(t) && free(i + 1) && /^\d+(?:[.,]\d+)?$/.test(words[i + 1].text)) {
          fields.amount = num(words[i + 1].text); claim(i, 'amount'); claim(i + 1, 'amount'); continue
        }
        if (/^\d+,\d{2}$/.test(t)) { fields.amount = num(t); claim(i, 'amount'); continue }
      }
      if (rules.has('progress')) {
        // "ep12", "p240", "ep3-5"
        if ((x = /^(ep|p)\.?(\d+)(?:-(\d+))?$/i.exec(t))) {
          const unit = x[1].toLowerCase() === 'ep' ? 'ep' : 'page'
          fields.progress = x[3] ? { unit, from: Number(x[2]), to: Number(x[3]) } : { unit, from: null, to: Number(x[2]) }
          claim(i, 'progress'); continue
        }
        // "ep 12", "p. 240", "pág 240"
        if (/^(ep|p\.?|pág\.?|pag\.?)$/i.test(t) && free(i + 1) && (x = /^(\d+)(?:-(\d+))?$/.exec(words[i + 1].text))) {
          const unit = /^ep$/i.test(t) ? 'ep' : 'page'
          fields.progress = x[2] ? { unit, from: Number(x[1]), to: Number(x[2]) } : { unit, from: null, to: Number(x[1]) }
          claim(i, 'progress'); claim(i + 1, 'progress'); continue
        }
      }
    }

    // 3) Data e hora.
    if (rules.has('date')) {
      let ontemDate: string | null = null
      if (past) {
        for (let i = 0; i < words.length; i++) {
          if (!free(i)) continue
          const n = norm(words[i].text)
          if (n === 'ontem') { ontemDate = addDaysISO(today, -1); claim(i, 'date') }
          else if (n === 'anteontem') { ontemDate = addDaysISO(today, -2); claim(i, 'date') }
        }
      }
      const masked = words.map((w, i) => (kinds[i] === null ? w.text : ''))
      const d = parseDate(masked)
      d.consumed.forEach((i) => claim(i, 'date'))
      let dueDate = ontemDate ?? d.dueDate
      let dueTime = d.dueTime
      if (past && !ontemDate && dueDate) {
        // "sexta" solta, em registro: a mais recente (hoje inclusive), não a próxima.
        const idx = [...d.consumed].find((i) => WEEKDAY[norm(words[i].text)] !== undefined && !/^pr[óo]xim/i.test(words[i - 1]?.text ?? ''))
        if (idx !== undefined) dueDate = previousWeekday(today, WEEKDAY[norm(words[idx].text)])
      }
      if (opts.orphanTime && !dueTime) {
        for (let i = 0; i < words.length; i++) {
          if (!free(i)) continue
          const tm = RE_TIME.exec(words[i].text)
          if (tm) {
            const h = Number(tm[1] ?? tm[3]); const mi = Number(tm[2] ?? tm[4] ?? 0)
            if (h < 24 && mi < 60) { dueTime = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; claim(i, 'date'); break }
          }
        }
      }
      fields.dueDate = dueDate
      fields.dueTime = dueTime
    }

    // 4) Recorrência × data explícita (mesma regra da Kaguya): data explícita vira âncora.
    if (recur) {
      if (fields.dueDate) recur = { ...recur, anchor: fields.dueDate }
      else fields.dueDate = recur.anchor
      fields.recur = recur
    }

    // 5) Título = o que sobrou; segmentos para o destaque ao vivo.
    const segments: CaptureSegment[] = []
    const tokens: CaptureToken[] = []
    const titleParts: string[] = []
    let p = 0
    words.forEach((w, i) => {
      if (w.start > p) segments.push({ text: text.slice(p, w.start), kind: null })
      segments.push({ text: w.text, kind: kinds[i] })
      const kind = kinds[i]
      if (kind) tokens.push({ index: i, text: w.text, start: w.start, end: w.end, kind })
      else titleParts.push(w.text)
      p = w.end
    })
    if (p < text.length) segments.push({ text: text.slice(p), kind: null })
    fields.title = titleParts.join(' ').replace(/\s+/g, ' ').trim()

    return { text, fields, segments, tokens }
  }
}

/** Remove tokens do texto (para o x dos chips), arrumando os espaços. */
export function removeTokens(result: CaptureResult, tokenIdx: number[]): string {
  const drop = new Set(tokenIdx.map((i) => result.tokens[i]).filter(Boolean))
  let out = ''
  let p = 0
  for (const tk of result.tokens) {
    if (!drop.has(tk)) continue
    out += result.text.slice(p, tk.start)
    p = tk.end
    while (result.text[p] === ' ') p++
  }
  return (out + result.text.slice(p)).replace(/\s+$/, '')
}

/** Chips de prévia ("o que foi entendido"), legíveis e removíveis. */
export function captureChips(result: CaptureResult, today: string = isoDate(new Date())): CaptureChip[] {
  const { fields: f, tokens } = result
  const idxOf = (kind: CaptureKind, predicate?: (t: CaptureToken) => boolean) =>
    tokens.map((t, i) => (t.kind === kind && (!predicate || predicate(t)) ? i : -1)).filter((i) => i >= 0)
  const chips: CaptureChip[] = []

  if (f.recur) chips.push({ id: 'recur', kind: 'recur', label: f.recur.label, tokenIdx: idxOf('recur') })
  const dateIdx = idxOf('date')
  if (f.dueDate && !f.recur) chips.push({ id: 'date', kind: 'date', label: `${fmtRelative(f.dueDate, today)}${f.dueTime ? ` ${f.dueTime}` : ''}`, tokenIdx: dateIdx })
  else if (f.dueTime && !f.dueDate) chips.push({ id: 'time', kind: 'date', label: f.dueTime, tokenIdx: dateIdx })
  if (f.priority) chips.push({ id: 'priority', kind: 'priority', label: `Prioridade ${f.priority === 3 ? 'alta' : f.priority === 2 ? 'média' : 'baixa'}`, tokenIdx: idxOf('priority') })
  if (f.place) chips.push({ id: 'place', kind: 'place', label: f.place, tokenIdx: idxOf('place') })
  f.people.forEach((p, i) => chips.push({ id: `person-${i}`, kind: 'person', label: p, tokenIdx: [idxOf('person')[i]] }))
  f.tags.forEach((t, i) => chips.push({ id: `tag-${i}`, kind: 'tag', label: `#${t}`, tokenIdx: [idxOf('tag')[i]] }))
  if (f.sets || f.load) {
    const bits = [f.sets ? `${f.sets[0]}×${f.sets[1]}` : '', f.load ? `${fmtNumber(f.load, f.load % 1 ? 1 : 0)} kg` : ''].filter(Boolean)
    chips.push({ id: 'load', kind: 'quantity', label: bits.join(' · '), tokenIdx: idxOf('quantity', (t) => !/km$/i.test(t.text)) })
  }
  if (f.distance) chips.push({ id: 'distance', kind: 'quantity', label: `${fmtNumber(f.distance, f.distance % 1 ? 1 : 0)} km`, tokenIdx: idxOf('quantity', (t) => /km$/i.test(t.text)) })
  if (f.duration) chips.push({ id: 'duration', kind: 'duration', label: fmtDuration(f.duration), tokenIdx: idxOf('duration') })
  if (f.amount !== null) chips.push({ id: 'amount', kind: 'amount', label: fmtMoney(f.amount), tokenIdx: idxOf('amount') })
  if (f.progress) {
    const u = f.progress.unit === 'ep' ? 'ep' : 'p.'
    const label = f.progress.from !== null ? `${u} ${f.progress.from}–${f.progress.to}` : `${u} ${f.progress.to}`
    chips.push({ id: 'progress', kind: 'progress', label, tokenIdx: idxOf('progress') })
  }
  if (f.rating) chips.push({ id: 'rating', kind: 'rating', label: `${f.rating.toFixed(1)} / 5`, tokenIdx: idxOf('rating'), rating: f.rating })
  return chips
}
