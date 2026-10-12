// Rotas por hash da Violet (/journal#dia/2026-10-12, /journal#carta/7…). A tela e o item aberto vivem na URL:
// o Voltar do navegador, links salvos (o Calendário e a Komi apontam para #dia/<data>) e o recarregar funcionam.
// O shell antigo guardava tudo só na memória.

export type ViewId =
  | 'write' | 'archive' | 'reflect' | 'insights' | 'letters' | 'emotions' | 'values' | 'people' | 'tags' | 'collection' | 'tutor'

export type CollectionKind = 'highlight' | 'idea' | 'wisdom' | 'note' | 'dream' | 'dreams'

export interface Route {
  view: ViewId
  /** Dia aberto no Escrever (YYYY-MM-DD); sem data = hoje. */
  date?: string
  letterId?: number
  /** Carta nova (composição em tela cheia). */
  newLetter?: boolean
  emotionId?: number
  /** Pessoa aberta: id da Komi ou `nome:<valor>` (menção antiga sem id). */
  person?: string
  tag?: string
  kind?: CollectionKind
  /** Referência aberta (bullets que citam um item de outro agente). */
  ref?: { agent: string; entityType: string; entityId: string }
  /** Revisão semanal aberta (qualquer data da semana) ou a lista de revisões. */
  week?: string
  weeks?: boolean
  /** Avaliação dos Valores: editando (wizard) ou histórico. */
  valuesEdit?: boolean
  valuesHistory?: boolean
}

const PLAIN: Partial<Record<ViewId, string>> = {
  archive: 'arquivo', reflect: 'refletir', insights: 'insights', letters: 'cartas', emotions: 'emocoes', values: 'valores',
  people: 'pessoas', tags: 'tags', tutor: 'tutor',
}

// Nomes aceitos além dos oficiais (variações com acento e os nomes do shell antigo).
const ALIASES: Record<string, string> = {
  escrever: 'hoje', write: 'hoje', journal: 'arquivo', reflect: 'refletir', 'emoções': 'emocoes', emotions: 'emocoes', letters: 'cartas',
  people: 'pessoas', stats: 'insights', 'estatisticas': 'insights', highlights: 'colecao/highlight', ideas: 'colecao/idea',
  wisdom: 'colecao/wisdom', notes: 'colecao/note', dreams: 'sonhos',
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const KINDS: CollectionKind[] = ['highlight', 'idea', 'wisdom', 'note', 'dream']
const toId = (s?: string) => (s && /^\d+$/.test(s) ? Number(s) : undefined)

export function routeFromHash(hash: string, search = ''): Route {
  // Links antigos do Calendário: /journal?date=2026-10-12
  const legacyDate = new URLSearchParams(search).get('date')
  let h = decodeURIComponent(hash.replace(/^#/, ''))
  if (!h && legacyDate && ISO.test(legacyDate)) return { view: 'write', date: legacyDate }
  const first = h.split('/')[0].toLowerCase()
  if (ALIASES[first]) h = ALIASES[first] + h.slice(first.length)
  const parts = h.split('/').filter(Boolean)
  const head = (parts[0] ?? '').toLowerCase()

  if (!head || head === 'hoje') return { view: 'write' }
  if (head === 'dia') return ISO.test(parts[1] ?? '') ? { view: 'write', date: parts[1] } : { view: 'write' }
  if (head === 'carta') {
    if (parts[1] === 'nova') return { view: 'letters', newLetter: true }
    const id = toId(parts[1])
    return id ? { view: 'letters', letterId: id } : { view: 'letters' }
  }
  if (head === 'emocao') { const id = toId(parts[1]); return id ? { view: 'emotions', emotionId: id } : { view: 'emotions' } }
  if (head === 'pessoa' && parts[1]) return { view: 'people', person: parts.slice(1).join('/') }
  if (head === 'tag' && parts[1]) return { view: 'tags', tag: parts.slice(1).join('/') }
  if (head === 'colecao' && KINDS.includes(parts[1] as CollectionKind)) return { view: 'collection', kind: parts[1] as CollectionKind }
  if (head === 'sonhos') return { view: 'collection', kind: 'dreams' }
  if (head === 'ref' && parts.length >= 4) return { view: 'collection', ref: { agent: parts[1], entityType: parts[2], entityId: parts.slice(3).join('/') } }
  if (head === 'refletir') {
    if (parts[1] === 'semana' && ISO.test(parts[2] ?? '')) return { view: 'reflect', week: parts[2] }
    if (parts[1] === 'semanas') return { view: 'reflect', weeks: true }
    return { view: 'reflect' }
  }
  if (head === 'valores') {
    if (parts[1] === 'editar') return { view: 'values', valuesEdit: true }
    if (parts[1] === 'historico') return { view: 'values', valuesHistory: true }
    return { view: 'values' }
  }
  for (const [view, name] of Object.entries(PLAIN)) if (name === head) return { view: view as ViewId }
  return { view: 'write' }
}

export function hashFor(r: Route): string {
  switch (r.view) {
    case 'write': return r.date ? `dia/${r.date}` : 'hoje'
    case 'letters': return r.newLetter ? 'carta/nova' : r.letterId ? `carta/${r.letterId}` : 'cartas'
    case 'emotions': return r.emotionId ? `emocao/${r.emotionId}` : 'emocoes'
    case 'people': return r.person ? `pessoa/${encodeURIComponent(r.person)}` : 'pessoas'
    case 'tags': return r.tag ? `tag/${encodeURIComponent(r.tag)}` : 'tags'
    case 'collection':
      if (r.ref) return `ref/${r.ref.agent}/${r.ref.entityType}/${r.ref.entityId}`
      return r.kind === 'dreams' ? 'sonhos' : `colecao/${r.kind ?? 'highlight'}`
    case 'reflect': return r.week ? `refletir/semana/${r.week}` : r.weeks ? 'refletir/semanas' : 'refletir'
    case 'values': return r.valuesEdit ? 'valores/editar' : r.valuesHistory ? 'valores/historico' : 'valores'
    default: return PLAIN[r.view] ?? 'hoje'
  }
}

/** Qual item do menu acende para a rota. */
export function navIdFor(r: Route): string {
  if (r.view === 'collection') return r.ref ? 'archive' : `col-${r.kind ?? 'highlight'}`
  return r.view
}

/** Link interno de um deep_link de outro agente ("/movies#filme/x") — volta como está para o router. */
export const isInternal = (href: string | null | undefined): href is string => !!href && href.startsWith('/')
