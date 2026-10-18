// Linha rápida de "registrar contato": "+Bia café ontem", "Caio ligação #trabalho", "+Ana mensagem sobre o presente".
// A pessoa pode vir marcada com + ou ser o começo da frase; o tipo sai das palavras ("café", "liguei", "zap"…),
// a data aceita "ontem", "sexta", "12/09", e #trabalho / #pessoal escolhem o espaço do registro.

import { createCaptureParser, type CaptureResult } from '../../../design/core/capture'
import { norm, resolvePerson } from './people'
import type { InteractionKind, PersonRow, RecordSpace } from '../types'

export const contactParser = createCaptureParser({ rules: ['person', 'tag', 'date'], dateDirection: 'past' })

/** O que a linha rápida entendeu (e o que o formulário recebe para completar). */
export interface ContactDraft {
  personId: string | null
  /** O que foi digitado como nome (para o formulário sugerir quando não achou). */
  typedName: string
  kind: InteractionKind
  /** AAAA-MM-DD */
  date: string
  note: string
  context: RecordSpace | null
}

export const emptyContact = (today: string, personId: string | null = null, context: RecordSpace | null = null): ContactDraft => ({
  personId, typedName: '', kind: 'encontro', date: today, note: '', context,
})

// Palavra → tipo. Compara o texto sem acento; a primeira que bater define o tipo e sai da anotação.
const KIND_WORDS: [InteractionKind, string[]][] = [
  ['video', ['video', 'meet', 'zoom', 'facetime', 'videochamada']],
  ['ligacao', ['ligacao', 'liguei', 'ligou', 'telefonei', 'telefonema', 'chamada']],
  ['mensagem', ['mensagem', 'msg', 'zap', 'whats', 'whatsapp', 'telegram', 'direct', 'dm', 'conversei', 'mandei']],
  ['encontro', ['cafe', 'almoco', 'jantar', 'jantei', 'encontro', 'encontrei', 'visita', 'visitei', 'vi', 'sai', 'saimos', 'happy', 'churrasco', 'festa']],
]

/** Descobre o tipo pelas palavras e devolve o texto que sobrou (a anotação). */
export function kindFromText(text: string): { kind: InteractionKind; rest: string } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  for (const [kind, list] of KIND_WORDS) {
    const hit = words.findIndex((w) => list.includes(norm(w)))
    // Palavras de encontro ("café") fazem parte do que aconteceu: ficam na anotação. As demais só dão o tipo.
    if (hit >= 0) return { kind, rest: (kind === 'encontro' ? words : words.filter((_, i) => i !== hit)).join(' ') }
  }
  return { kind: 'outro', rest: words.join(' ') }
}

/** Transforma a linha rápida num rascunho: acha a pessoa, o tipo, a data, a nota e o espaço. */
export function draftFromCapture(r: CaptureResult, ctx: { today: string; people: PersonRow[]; defaultContext?: RecordSpace | null }): ContactDraft {
  const f = r.fields
  let title = f.title
  let person: PersonRow | null = null
  let typed = ''

  if (f.people.length) {
    typed = f.people[0]
    person = resolvePerson(ctx.people, typed)
  } else {
    // Sem "+": tenta o começo da frase (uma ou duas palavras) como nome.
    const words = title.split(/\s+/).filter(Boolean)
    for (const n of [2, 1]) {
      if (words.length < n) continue
      const found = resolvePerson(ctx.people, words.slice(0, n).join(' '))
      if (found) { person = found; typed = words.slice(0, n).join(' '); title = words.slice(n).join(' '); break }
    }
    if (!person && words.length) typed = words[0]
  }

  const { kind, rest } = kindFromText(title)
  const tag = f.tags.map(norm)
  const context: RecordSpace | null = tag.includes('trabalho') ? 'work' : tag.includes('pessoal') ? 'personal' : ctx.defaultContext ?? null
  return { personId: person?.id ?? null, typedName: typed, kind, date: f.dueDate ?? ctx.today, note: rest, context }
}

/** Dá para salvar direto, sem abrir o formulário? Precisa da pessoa e de uma data que não seja futura. */
export function canSaveQuickly(d: ContactDraft, today: string): boolean {
  return !!d.personId && d.date <= today
}
