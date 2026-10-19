// Marcação do texto do diário — espelho de agents/journal/markup.py (spec 076). As regras precisam bater:
//   @[Ana Lima](komi:<id>)        pessoa resolvida na Komi
//   [Matrix](akane:movie:<id>)    referência a item de outro agente
//   @Ana / #tag-com-hifen         legado (pessoa sem ID) e tags
// `segments` quebra o texto em pedaços para desenhar (texto, pessoa, referência, tag).

export const REF_AGENTS = ['kaguya', 'akane', 'frieren', 'marin', 'mai', 'yato'] as const
export type RefAgent = (typeof REF_AGENTS)[number]

const PERSON_TOKEN = /@\[([^\]\n]{1,80})\]\(komi:([\w-]{1,64})\)/g
const REF_TOKEN = new RegExp(String.raw`(?<!@)\[([^\]\n]{1,160})\]\((${REF_AGENTS.join('|')}):([a-z_]{1,24}):([\w-]{1,64})\)`, 'g')
const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ0-9_'
const LEGACY_PERSON = new RegExp(String.raw`(?<![\w@\]])@([${LETTER}]+)`, 'g')
const TAG = new RegExp(String.raw`(?<![\w#&])#([${LETTER}][${LETTER}-]*)`, 'g')

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'person'; name: string; personId: string | null }
  | { type: 'ref'; label: string; agent: RefAgent; entityType: string; entityId: string }
  | { type: 'tag'; tag: string }

interface Hit { start: number; end: number; seg: Segment }

function collect(text: string): Hit[] {
  const hits: Hit[] = []
  const taken: [number, number][] = []
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b)
  const add = (re: RegExp, make: (m: RegExpExecArray) => Segment | null) => {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const s = m.index, e = m.index + m[0].length
      const seg = make(m)
      if (!seg || !free(s, e)) continue
      hits.push({ start: s, end: e, seg })
      taken.push([s, e])
    }
  }
  add(PERSON_TOKEN, (m) => ({ type: 'person', name: m[1].trim(), personId: m[2] }))
  add(REF_TOKEN, (m) => ({ type: 'ref', label: m[1].trim(), agent: m[2] as RefAgent, entityType: m[3], entityId: m[4] }))
  add(LEGACY_PERSON, (m) => ({ type: 'person', name: m[1], personId: null }))
  add(TAG, (m) => {
    const tag = m[1].replace(/-+$/, '')
    return tag ? { type: 'tag', tag } : null
  })
  return hits.sort((a, b) => a.start - b.start)
}

/** O texto em pedaços para desenhar. */
export function segments(text: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  for (const h of collect(text ?? '')) {
    if (h.start > at) out.push({ type: 'text', text: text.slice(at, h.start) })
    out.push(h.seg)
    at = h.end
    // A tag sem o hífen final devolve o hífen como texto.
    if (h.seg.type === 'tag') {
      const raw = text.slice(h.start, h.end)
      const trail = raw.length - 1 - h.seg.tag.length
      if (trail > 0) out.push({ type: 'text', text: '-'.repeat(trail) })
    }
  }
  if (at < (text ?? '').length) out.push({ type: 'text', text: text.slice(at) })
  return out
}

/** Pessoas, referências e tags do texto (sem repetir). */
export function parse(text: string) {
  const segs = segments(text)
  const uniq = <T,>(xs: T[], key: (x: T) => string) => xs.filter((x, i) => xs.findIndex((y) => key(y) === key(x)) === i)
  return {
    people: uniq(segs.filter((s): s is Extract<Segment, { type: 'person' }> => s.type === 'person'), (p) => p.personId ?? p.name),
    refs: uniq(segs.filter((s): s is Extract<Segment, { type: 'ref' }> => s.type === 'ref'), (r) => `${r.agent}:${r.entityType}:${r.entityId}`),
    tags: uniq(segs.filter((s): s is Extract<Segment, { type: 'tag' }> => s.type === 'tag').map((t) => t.tag), (t) => t),
  }
}

/** Texto sem a sintaxe dos tokens: `@[Ana](komi:1)` → `@Ana`; `[Matrix](akane:movie:3)` → `Matrix`. */
export function plainText(text: string): string {
  return segments(text).map((s) => (s.type === 'text' ? s.text : s.type === 'person' ? `@${s.name}` : s.type === 'ref' ? s.label : `#${s.tag}`)).join('')
}

const clean = (s: string) => s.replace(/\[/g, '(').replace(/\]/g, ')').trim()
export const personToken = (name: string, id: string) => `@[${clean(name)}](komi:${id})`
export const refToken = (label: string, agent: string, entityType: string, entityId: string | number) => `[${clean(label)}](${agent}:${entityType}:${entityId})`

/** Palavras do texto já sem a sintaxe. */
export const wordCount = (text: string): number => plainText(text).split(/\s+/).filter(Boolean).length

// ── Texto de exibição (o que aparece no campo enquanto você edita) ─────────────────────────────────
// No campo, `@[Carla](komi:1)` aparece só como `Carla` e `[Matrix](akane:movie:3)` como `Matrix` — o mesmo
// texto que o `RichText` desenha. Cada trecho desses guarda o token original; o resto é texto comum.

export interface DisplayToken { start: number; end: number; raw: string; kind: 'person' | 'ref' }
export interface Display { text: string; tokens: DisplayToken[] }

/** Texto guardado → texto de exibição + onde estão os tokens. */
export function toDisplay(raw: string): Display {
  const src = raw ?? ''
  let text = ''
  const tokens: DisplayToken[] = []
  let at = 0
  for (const h of collect(src)) {
    const s = h.seg
    const label = s.type === 'person' && s.personId ? s.name : s.type === 'ref' ? s.label : null
    if (label === null) continue
    text += src.slice(at, h.start)
    tokens.push({ start: text.length, end: text.length + label.length, raw: src.slice(h.start, h.end), kind: s.type === 'ref' ? 'ref' : 'person' })
    text += label
    at = h.end
  }
  return { text: text + src.slice(at), tokens }
}

/** Texto de exibição → texto guardado (os tokens voltam no lugar dos rótulos). */
export function fromDisplay(d: Display): string {
  let out = ''
  let at = 0
  for (const t of d.tokens) {
    out += d.text.slice(at, t.start) + t.raw
    at = t.end
  }
  return out + d.text.slice(at)
}

/** Troca `[start, end)` do texto de exibição por `ins`. Tokens tocados pelo trecho viram texto comum. */
export function spliceDisplay(d: Display, start: number, end: number, ins: Display): Display {
  const delta = ins.text.length - (end - start)
  const tokens: DisplayToken[] = []
  for (const t of d.tokens) {
    if (t.end <= start) tokens.push(t)
    else if (t.start >= end) tokens.push({ ...t, start: t.start + delta, end: t.end + delta })
  }
  for (const t of ins.tokens) tokens.push({ ...t, start: t.start + start, end: t.end + start })
  tokens.sort((a, b) => a.start - b.start)
  return { text: d.text.slice(0, start) + ins.text + d.text.slice(end), tokens }
}

/**
 * O campo mudou de `prev.text` para `next`: acha o trecho alterado (prefixo e sufixo comuns; `caret`, o cursor depois
 * da mudança, desfaz a ambiguidade de letras repetidas) e aplica. O que foi digitado entra como texto comum.
 */
export function editDisplay(prev: Display, next: string, caret = next.length): Display {
  const a = prev.text
  let s = 0
  const maxS = Math.min(a.length, next.length - Math.min(caret, next.length))
  while (s < maxS && a[a.length - 1 - s] === next[next.length - 1 - s]) s++
  let p = 0
  const maxP = Math.min(a.length - s, next.length - s)
  while (p < maxP && a[p] === next[p]) p++
  return spliceDisplay(prev, p, a.length - s, { text: next.slice(p, next.length - s), tokens: [] })
}

/**
 * Posição no texto de exibição que corresponde a `rendered` caracteres do texto desenhado pelo `RichText`
 * (que mostra o `@Ana` legado sem o `@`). Devolve `null` se `rendered` passar do fim.
 */
export function displayOffsetFromRendered(raw: string, rendered: number): number | null {
  let r = 0
  let d = 0
  for (const s of segments(raw ?? '')) {
    const shown = s.type === 'text' ? s.text.length : s.type === 'person' ? s.name.length : s.type === 'ref' ? s.label.length : s.tag.length + 1
    const lead = s.type === 'person' && !s.personId ? 1 : 0 // o "@" do legado existe no campo, não no desenho
    if (rendered <= r + shown) return d + lead + (rendered - r)
    r += shown
    d += shown + lead
  }
  return rendered === r ? d : null
}

/** O texto que o `RichText` desenha para `raw` (para conferir se o toque caiu no texto certo). */
export const renderedText = (raw: string): string =>
  segments(raw ?? '').map((s) => (s.type === 'text' ? s.text : s.type === 'person' ? s.name : s.type === 'ref' ? s.label : `#${s.tag}`)).join('')
