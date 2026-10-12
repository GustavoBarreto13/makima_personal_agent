// Esquemas das coleções da Violet (padrão useCollection: busca + tipo/status + data + 2 ordenações, no mínimo).
//   violet:arquivo   os dias com conteúdo
//   violet:cartas    todas as cartas
//   violet:emocoes   todos os registros emocionais
//   violet:colecao   destaques, ideias, sabedoria, notas, sonhos

import { defineCollection, type CollectionSchema } from '../../../design/core/collection'
import { MONTHS_LONG } from '../../../design/core/format'
import type { CollectionItem, EmotionLog, EntryListItem, Letter } from '../types'
import { DISTORTION_LABEL } from './emotions'
import { FONTS } from './kinds'
import { plainText } from './markup'

const monthLabel = (iso?: string | null) => (iso ? `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : 'Sem data')
const fontOptions = FONTS.map((f) => ({ value: f.value, label: f.label }))

/** Um dia do Arquivo; `hit` marca os que a busca no texto inteiro (servidor) encontrou. */
export type ArchiveItem = EntryListItem & { hit?: string }

export function makeArchiveSchema(): CollectionSchema<ArchiveItem> {
  return defineCollection<ArchiveItem>({
    scope: 'violet:arquivo',
    search: (e) => [plainText(e.excerpt), e.hit ?? ''],
    facets: [
      {
        kind: 'tags', id: 'has', label: 'O dia tem',
        get: (e) => [e.has_highlight && 'destaque', e.has_dream && 'sonho', e.emotion_count > 0 && 'emoção', e.letter_count > 0 && 'carta', e.has_counsel && 'conselho']
          .filter((x): x is string => !!x),
      },
      { kind: 'flag', id: 'fav', label: 'Só dias com favorito', get: (e) => e.has_favorite },
      { kind: 'enum', id: 'font', label: 'Fonte', get: (e) => e.font ?? 'normal', options: fontOptions },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (e) => e.date, buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [{ id: 'month', label: 'Mês', key: (e) => monthLabel(e.date) }],
    sorts: [
      { id: 'date', label: 'Data', value: (e) => e.date },
      { id: 'words', label: 'Palavras', value: (e) => e.word_count },
      { id: 'moments', label: 'Momentos', value: (e) => e.bullet_count },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}

export function makeLettersSchema(letters: Letter[]): CollectionSchema<Letter> {
  const recipients = [...new Set(letters.map((l) => l.recipient))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((value) => ({ value }))
  return defineCollection<Letter>({
    scope: 'violet:cartas',
    search: (l) => [l.recipient, l.title ?? '', plainText(l.body), ...l.people.map((p) => p.name)],
    facets: [
      { kind: 'enum', id: 'status', label: 'Situação', get: (l) => l.status, options: [{ value: 'draft', label: 'Rascunho' }, { value: 'sealed', label: 'Lacrada' }] },
      { kind: 'enum', id: 'recipient', label: 'Para', get: (l) => l.recipient, options: recipients },
      { kind: 'people', id: 'people', label: 'Pessoas', get: (l) => l.people.map((p) => p.id) },
      { kind: 'enum', id: 'font', label: 'Fonte', get: (l) => l.font, options: fontOptions },
      { kind: 'dateRange', id: 'date', label: 'Escrita em', get: (l) => l.date ?? '', buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'month', label: 'Mês', key: (l) => monthLabel(l.date) },
      { id: 'recipient', label: 'Destinatário', key: (l) => l.recipient },
      { id: 'status', label: 'Situação', key: (l) => (l.status === 'sealed' ? 'Lacradas' : 'Rascunhos') },
    ],
    sorts: [
      { id: 'date', label: 'Data', value: (l) => l.date ?? '' },
      { id: 'recipient', label: 'Destinatário', value: (l) => l.recipient.toLowerCase() },
      { id: 'length', label: 'Tamanho', value: (l) => l.body.length },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}

export function makeEmotionsSchema(logs: EmotionLog[]): CollectionSchema<EmotionLog> {
  const names = [...new Set(logs.map((l) => l.emotion_name))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((value) => ({ value }))
  return defineCollection<EmotionLog>({
    scope: 'violet:emocoes',
    search: (l) => [l.emotion_name, l.situation ?? '', l.automatic_thought ?? '', l.adaptive_response ?? ''],
    facets: [
      { kind: 'enum', id: 'emotion', label: 'Emoção', get: (l) => l.emotion_name, options: names },
      { kind: 'range', id: 'intensity', label: 'Intensidade mínima', get: (l) => l.intensity, min: 1, max: 10, step: 1, display: 'slider' },
      { kind: 'flag', id: 'noResponse', label: 'Só sem resposta adaptativa', get: (l) => !l.adaptive_response },
      { kind: 'tags', id: 'distortions', label: 'Distorções', get: (l) => (l.distortions ?? []).map((d) => DISTORTION_LABEL[d] ?? d) },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (l) => l.date ?? '', buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'day', label: 'Dia', key: (l) => l.date ?? 'Sem data' },
      { id: 'month', label: 'Mês', key: (l) => monthLabel(l.date) },
      { id: 'emotion', label: 'Emoção', key: (l) => l.emotion_name },
    ],
    sorts: [
      { id: 'date', label: 'Data', value: (l) => `${l.date ?? ''}${l.created_at}` },
      { id: 'intensity', label: 'Intensidade', value: (l) => l.intensity },
      { id: 'relief', label: 'Alívio', value: (l) => (l.reappraised_intensity == null ? -99 : l.intensity - l.reappraised_intensity) },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}

export function makeBulletsSchema(): CollectionSchema<CollectionItem> {
  return defineCollection<CollectionItem>({
    scope: 'violet:colecao',
    search: (b) => [plainText(b.content)],
    facets: [
      { kind: 'flag', id: 'fav', label: 'Só favoritos', get: (b) => b.favorite },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (b) => b.date, buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
      { kind: 'enum', id: 'font', label: 'Fonte', get: (b) => b.font ?? 'normal', options: fontOptions },
    ],
    groups: [{ id: 'month', label: 'Mês', key: (b) => monthLabel(b.date) }],
    sorts: [
      { id: 'date', label: 'Data', value: (b) => b.date },
      { id: 'length', label: 'Tamanho', value: (b) => b.content.length },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}
