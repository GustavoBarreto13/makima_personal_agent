// Recorrentes: contas fixas, assinaturas e entradas (salário) numa lista só. Lógica pura.

import { addDaysISO, isoDate, parseISODate } from '../../../design/core/format'
import { defineCollection, type CollectionSchema } from '../../../design/core/collection'
import type { RecurringKind, RecurringStatusItem } from '../types'

export const KIND_LABEL: Record<RecurringKind, string> = { renda: 'Entradas', conta_fixa: 'Contas fixas', assinatura: 'Assinaturas' }
export const KIND_ONE: Record<RecurringKind, string> = { renda: 'Entrada', conta_fixa: 'Conta fixa', assinatura: 'Assinatura' }
export const STATUS_LABEL: Record<RecurringStatusItem['cycle_status'], string> = { paga: 'Paga', pendente: 'Pendente', atrasada: 'Atrasada', agendada: 'Agendada' }

/** Entradas primeiro, depois contas, depois assinaturas — é a ordem em que o mês "acontece". */
const KIND_RANK: Record<RecurringKind, number> = { renda: 0, conta_fixa: 1, assinatura: 2 }

export const kindOf = (s: { kind?: RecurringKind }): RecurringKind => s.kind ?? 'assinatura'

/** Dia do mês de cobrança: o cadastrado, senão o do próximo vencimento. */
export function dueDay(s: { next_billing_day?: number; next_billing?: string }): number {
  return s.next_billing_day ?? (s.next_billing ? Number(s.next_billing.slice(8, 10)) : 1)
}

/**
 * Próxima data com esse dia do mês, hoje inclusive. Dia 31 em abril vira 30 (último dia do mês).
 * Usada ao cadastrar/editar: o vencimento nasce certo em vez de "1º do mês seguinte".
 */
export function nextBillingDate(day: number, today: string): string {
  const t = parseISODate(today)
  const clamp = (y: number, m: number) => Math.min(day, new Date(y, m + 1, 0).getDate())
  let y = t.getFullYear()
  let m = t.getMonth()
  if (clamp(y, m) < t.getDate()) { m += 1; if (m > 11) { m = 0; y += 1 } }
  return isoDate(new Date(y, m, clamp(y, m)))
}

/** Valor mensal equivalente (anual divide por 12) — base do "custo fixo" e da "renda mensal". */
export const monthlyValue = (s: { valor: number; ciclo: string }): number => (s.ciclo === 'anual' ? s.valor / 12 : s.valor)

export function summarize(items: RecurringStatusItem[]): { custo: number; renda: number; pendentes: number; rendaPendente: number } {
  let custo = 0, renda = 0, pendentes = 0, rendaPendente = 0
  for (const it of items) {
    const waiting = it.cycle_status === 'pendente' || it.cycle_status === 'atrasada'
    if (kindOf(it) === 'renda') { renda += monthlyValue(it); if (waiting) rendaPendente += it.valor }
    else { custo += monthlyValue(it); if (waiting) pendentes += 1 }
  }
  return { custo, renda, pendentes, rendaPendente }
}

export function makeRecurringSchema(today: string): CollectionSchema<RecurringStatusItem> {
  return defineCollection<RecurringStatusItem>({
    scope: 'nami:recorrentes',
    search: (s) => [s.name, s.conta ?? '', s.categoria],
    facets: [
      { kind: 'enum', id: 'kind', label: 'Tipo', get: (s) => kindOf(s), options: (Object.keys(KIND_LABEL) as RecurringKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
      { kind: 'enum', id: 'status', label: 'Neste mês', get: (s) => s.cycle_status, options: (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => ({ value: k, label: STATUS_LABEL[k] })) },
      { kind: 'dateRange', id: 'venc', label: 'Próximo vencimento', get: (s) => s.next_billing ?? addDaysISO(today, 0), buckets: ['all', 'thisYear'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'kind', label: 'Tipo', key: (s) => KIND_LABEL[kindOf(s)] },
      { id: 'status', label: 'Neste mês', key: (s) => STATUS_LABEL[s.cycle_status] },
    ],
    sorts: [
      // tipo + dia do mês: os grupos saem na ordem Entradas → Contas → Assinaturas e, dentro, por dia
      { id: 'venc', label: 'Vencimento', value: (s) => `${KIND_RANK[kindOf(s)]}-${String(dueDay(s)).padStart(2, '0')}` },
      { id: 'valor', label: 'Valor', value: (s) => s.valor },
      { id: 'nome', label: 'Nome', value: (s) => s.name.toLowerCase() },
    ],
    defaults: { groupBy: 'kind', sortBy: 'venc', dir: 'asc' },
  })
}
