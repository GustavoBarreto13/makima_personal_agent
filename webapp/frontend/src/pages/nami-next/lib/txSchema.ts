// Esquema da lista de lançamentos (busca + tipo + conta/cartão + categoria + período; 2 ordenações; agrupar por dia/mês/…).
// O período também decide a CONSULTA ao servidor (windowFor): trocar de "30 dias" para "Tudo" busca de novo.

import { addDaysISO, fmtDateLong, fmtRelative } from '../../../design/core/format'
import { defineCollection, type CollectionSchema, type DateBucket } from '../../../design/core/collection'
import { MONTHS_LONG } from '../../../design/core/format'
import type { Category, Transaction } from '../types'
import type { Source } from './entry'

/** Janela de datas que o servidor deve devolver para um período (ISO). */
export function windowFor(bucket: DateBucket, today: string): { start: string; end: string } {
  switch (bucket) {
    case 'last7': return { start: addDaysISO(today, -7), end: today }
    case 'last90': return { start: addDaysISO(today, -90), end: today }
    case 'thisYear': return { start: `${today.slice(0, 4)}-01-01`, end: today }
    case 'all': return { start: '2000-01-01', end: today }
    case 'last30':
    default: return { start: addDaysISO(today, -30), end: today }
  }
}

/** "Hoje", "Ontem" ou "sexta-feira, 2 de outubro". */
export function dayLabel(iso: string, today: string): string {
  const rel = fmtRelative(iso, today)
  const label = rel === 'hoje' || rel === 'ontem' ? rel : fmtDateLong(iso)
  return label[0].toUpperCase() + label.slice(1)
}

export function makeTxSchema(categories: Category[], sources: Source[], today: string): CollectionSchema<Transaction> {
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id
  return defineCollection<Transaction>({
    scope: 'nami:lancamentos',
    search: (t) => [t.name, catName(t.categoria), t.conta, t.notes ?? ''],
    facets: [
      {
        kind: 'enum', id: 'tipo', label: 'Tipo', get: (t) => t.tipo,
        options: [{ value: 'Despesa', label: 'Gastos' }, { value: 'Receita', label: 'Entradas' }, { value: 'Transferencia', label: 'Transferências' }],
      },
      { kind: 'enum', id: 'conta', label: 'Conta ou cartão', get: (t) => t.conta, options: sources.map((s) => ({ value: s.name })) },
      { kind: 'enum', id: 'categoria', label: 'Categoria', get: (t) => t.categoria, options: categories.map((c) => ({ value: c.id, label: c.name })) },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (t) => t.data, buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'last30' },
    ],
    groups: [
      { id: 'day', label: 'Dia', key: (t) => dayLabel(t.data, today) },
      { id: 'month', label: 'Mês', key: (t) => `${MONTHS_LONG[Number(t.data.slice(5, 7)) - 1]} de ${t.data.slice(0, 4)}` },
      { id: 'categoria', label: 'Categoria', key: (t) => catName(t.categoria) },
      { id: 'conta', label: 'Conta ou cartão', key: (t) => t.conta },
    ],
    sorts: [
      { id: 'date', label: 'Data', value: (t) => t.data },
      { id: 'valor', label: 'Valor', value: (t) => Math.abs(t.valor) },
    ],
    defaults: { groupBy: 'day', sortBy: 'date', dir: 'desc' },
  })
}
