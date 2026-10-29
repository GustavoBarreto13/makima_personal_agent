// Unidades de progresso (página, capítulo, volume) e formatos de livro. Espelha `agents/frieren/units.py`:
// mudou lá, mude aqui. Lógica pura (sem React nem rede).

/** Unidade em que um livro é contado (`books.progress_unit`). */
export type ProgressUnit = 'pages' | 'chapters' | 'volumes'

/** Formato do livro (`books.format`). "quadrinho" aparece na tela como "Mangá/HQ". */
export type BookFormat = 'fisico' | 'ebook' | 'audiobook' | 'quadrinho'

export const UNITS: ProgressUnit[] = ['pages', 'chapters', 'volumes']
export const FORMATS: BookFormat[] = ['fisico', 'ebook', 'audiobook', 'quadrinho']

interface UnitInfo {
  singular: string
  plural: string
  abbr: string
  /** Complemento de "Você parou…": "na página", "no capítulo", "no volume". */
  stopped: string
  /** Rótulo do campo de total: "Total de páginas". */
  totalLabel: string
}

const INFO: Record<ProgressUnit, UnitInfo> = {
  pages: { singular: 'página', plural: 'páginas', abbr: 'pág.', stopped: 'na página', totalLabel: 'Total de páginas' },
  chapters: { singular: 'capítulo', plural: 'capítulos', abbr: 'cap.', stopped: 'no capítulo', totalLabel: 'Total de capítulos' },
  volumes: { singular: 'volume', plural: 'volumes', abbr: 'vol.', stopped: 'no volume', totalLabel: 'Total de volumes' },
}

const FORMAT_LABEL: Record<BookFormat, string> = {
  fisico: 'Físico',
  ebook: 'E-book',
  audiobook: 'Audiobook',
  quadrinho: 'Mangá/HQ',
}

// Formato → unidade sugerida ao cadastrar (só um ponto de partida: dá para trocar).
const FORMAT_DEFAULT_UNIT: Record<BookFormat, ProgressUnit> = {
  fisico: 'pages',
  ebook: 'pages',
  audiobook: 'chapters',
  quadrinho: 'chapters',
}

/** Qualquer texto vindo do servidor vira uma unidade válida (desconhecido = página). */
export function asUnit(v: string | null | undefined): ProgressUnit {
  return v === 'chapters' || v === 'volumes' ? v : 'pages'
}

/** Qualquer texto vindo do servidor vira um formato válido (desconhecido = físico). */
export function asFormat(v: string | null | undefined): BookFormat {
  return v === 'ebook' || v === 'audiobook' || v === 'quadrinho' ? v : 'fisico'
}

export const defaultUnitFor = (f: BookFormat): ProgressUnit => FORMAT_DEFAULT_UNIT[f]
export const formatLabel = (f: BookFormat): string => FORMAT_LABEL[f]
export const unitName = (u: ProgressUnit): string => INFO[u].plural
export const unitSingular = (u: ProgressUnit): string => INFO[u].singular
export const stoppedLabel = (u: ProgressUnit): string => INFO[u].stopped
export const totalLabel = (u: ProgressUnit): string => INFO[u].totalLabel
/** Artigo + nome: "a página", "o capítulo", "o volume" (para frases como "até o capítulo 12"). */
export const withArticle = (u: ProgressUnit): string => `${u === 'pages' ? 'a' : 'o'} ${INFO[u].singular}`

/** "1 capítulo", "3 capítulos", "2 vol." (com `abbr`). */
export function unitCount(u: ProgressUnit, n: number, abbr = false): string {
  const i = INFO[u]
  if (abbr) return `${n} ${i.abbr}`
  return `${n} ${n === 1 ? i.singular : i.plural}`
}

/** Prefixo curto de posição para listas: "p. 80", "cap. 12", "vol. 3". */
export function positionLabel(u: ProgressUnit, n: number): string {
  return u === 'pages' ? `p. ${n}` : `${INFO[u].abbr} ${n}`
}

/** Unidade da captura rápida ('page' | 'chapter' | 'volume' | 'ep') → unidade do livro, ou null se não é de livro. */
export function unitFromCapture(u: string): ProgressUnit | null {
  if (u === 'page') return 'pages'
  if (u === 'chapter') return 'chapters'
  if (u === 'volume') return 'volumes'
  return null
}

/** Soma o avanço de várias sessões SEM misturar unidades: "40 pág. · 5 cap." (só as unidades com avanço).
 *  Sem nenhum avanço, devolve "0 pág.". */
export function sumByUnit(items: { unit: ProgressUnit; pages: number }[]): string {
  const totals: Record<ProgressUnit, number> = { pages: 0, chapters: 0, volumes: 0 }
  for (const i of items) totals[i.unit] += i.pages
  const parts = UNITS.filter((u) => totals[u] > 0).map((u) => unitCount(u, totals[u], true))
  return parts.length ? parts.join(' · ') : unitCount('pages', 0, true)
}
