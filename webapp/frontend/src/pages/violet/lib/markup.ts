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
