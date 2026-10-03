// Lançamento: do texto digitado ("45 ifood @nubank") ao pedido certo para a API. Lógica pura, sem React.
//
// O mesmo rascunho (EntryDraft) alimenta a captura rápida da tela inicial e o formulário completo:
//   texto → parser → rascunho → (o usuário confere no formulário, se faltou algo) → pedido à API.

import { createCaptureParser, type CaptureResult } from '../../../design/core/capture'
import { todayISO } from '../../../design/core/format'
import type { Account, Card, Category, EntrySuggestion, Transaction } from '../types'

export type EntryKind = 'gasto' | 'entrada' | 'transferencia'

/** Conta bancária ou cartão — o "de onde saiu" (ou "pra onde foi") de um lançamento. */
export interface Source {
  kind: 'account' | 'card'
  id: string
  name: string
}

export interface EntryDraft {
  kind: EntryKind
  name: string
  valor: number | null
  date: string
  /** '' = ainda sem categoria (sugestão pelo histórico, senão Inbox). */
  categoria: string
  source: Source | null
  /** Só transferência: conta de destino, ou cartão (transferir para um cartão é pagar a fatura). */
  destination: Source | null
  /** 1 = à vista. O valor digitado é sempre o TOTAL. */
  installments: number
  personIds: string[]
  notes: string
}

/**
 * Sintaxe da linha rápida: `45 ifood @nubank` · `1200 tv 10x @nubank` · `ontem 30 uber` · `+3500 salário`
 * · `25 almoço +Ana` · `80 mercado #supermercado`.
 */
export const entryParser = createCaptureParser({
  rules: ['place', 'person', 'tag', 'amount', 'bareAmount', 'income', 'installments', 'date'],
  dateDirection: 'past',
})

export const MAX_INSTALLMENTS = 60

// ── resolução de nomes ───────────────────────────────────────────────────────

/** minúsculas, sem acento, hífen/pontuação virando espaço. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Acha UM item pelo nome digitado: igual, depois começa com, depois contém. Ambíguo (2+) ou sem
 * resultado → null (nunca chuta: "@nu" com "Nubank" e "NuConta" não escolhe um).
 */
export function resolveByName<T extends { name: string }>(text: string, items: T[]): T | null {
  const q = norm(text)
  if (!q) return null
  for (const test of [(n: string) => n === q, (n: string) => n.startsWith(q), (n: string) => n.includes(q)]) {
    const hits = items.filter((it) => test(norm(it.name)))
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) return null
  }
  return null
}

export function toSources(accounts: Account[], cards: Card[]): Source[] {
  return [
    ...accounts.filter((a) => a.status === 'ativo' || a.status === 'ativa').map((a): Source => ({ kind: 'account', id: a.id, name: a.name })),
    ...cards.filter((c) => c.status === 'ativo').map((c): Source => ({ kind: 'card', id: c.id, name: c.name })),
  ]
}

/** Categoria por nome digitado (`#lazer`, `#comer`): aceita o id ou o nome, sem acento. */
export function resolveCategory(text: string, categories: Category[]): Category | null {
  const q = norm(text)
  if (!q) return null
  const byId = categories.find((c) => norm(c.id) === q)
  if (byId) return byId
  return resolveByName(text, categories)
}

// ── captura → rascunho ───────────────────────────────────────────────────────

export interface CaptureContext {
  sources: Source[]
  categories: Category[]
  /** Origem usada quando a linha não traz `@`. */
  defaultSource: Source | null
  today?: string
}

/** O que a captura não conseguiu resolver sozinha — pede o formulário completo. */
export interface CaptureIssues {
  /** "@algo" que não bateu com nenhuma conta/cartão (ou bateu com mais de uma). */
  place?: string
  /** "#algo" que não é categoria. */
  tag?: string
  /** "+Nome": vincular pessoa exige confirmar quem é (smart-match da Komi), então nunca vai direto. */
  people: string[]
}

export function draftFromCapture(r: CaptureResult, ctx: CaptureContext): { draft: EntryDraft; issues: CaptureIssues } {
  const f = r.fields
  const issues: CaptureIssues = { people: [...f.people] }

  let source: Source | null = null
  if (f.place) {
    source = resolveByName(f.place, ctx.sources)
    if (!source) issues.place = f.place
  } else {
    source = ctx.defaultSource
  }

  let categoria = ''
  if (f.tags.length) {
    const cat = resolveCategory(f.tags[0], ctx.categories)
    if (cat) categoria = cat.id
    else issues.tag = f.tags[0]
  }

  const kind: EntryKind = f.income ? 'entrada' : 'gasto'
  return {
    draft: {
      kind,
      name: f.title,
      valor: f.amount,
      date: f.dueDate ?? ctx.today ?? todayISO(),
      categoria,
      // entrada cai numa conta: se a origem inferida for um cartão, deixa para o usuário escolher
      source: kind === 'entrada' && source?.kind === 'card' ? null : source,
      destination: null,
      installments: kind === 'gasto' ? f.installments ?? 1 : 1,
      personIds: [],
      notes: '',
    },
    issues,
  }
}

/** Dá para salvar direto pela linha rápida, sem abrir o formulário? */
export function canSaveQuickly(draft: EntryDraft, issues: CaptureIssues): boolean {
  return validateDraft(draft) === null && !issues.place && !issues.tag && issues.people.length === 0
}

/** Completa categoria e origem a partir de um lançamento parecido que já existe (autocompletar). */
export function applySuggestion(draft: EntryDraft, suggestions: EntrySuggestion[], sources: Source[]): EntryDraft {
  const s = suggestions.find((x) => norm(x.name) === norm(draft.name)) ?? suggestions[0]
  if (!s || draft.kind === 'transferencia') return draft
  const next = { ...draft }
  if (!next.categoria && s.categoria) next.categoria = s.categoria
  if (!next.source) {
    const hit = sources.find((src) => (s.card_id && src.id === s.card_id) || (s.account_id && src.id === s.account_id))
    if (hit && !(draft.kind === 'entrada' && hit.kind === 'card')) next.source = hit
  }
  return next
}

// ── validação ────────────────────────────────────────────────────────────────

export type DraftField = 'valor' | 'name' | 'source' | 'destination' | 'installments'

export interface DraftError {
  /** Campo onde a mensagem aparece. */
  field: DraftField
  message: string
}

/** Primeiro problema do rascunho, com o campo certo, ou null se está tudo certo. */
export function validateDraftField(d: EntryDraft): DraftError | null {
  const bad = (field: DraftField, message: string): DraftError => ({ field, message })
  if (d.valor === null || !(d.valor > 0)) return bad('valor', 'Informe um valor maior que zero.')
  if (d.kind === 'transferencia') {
    if (!d.source || d.source.kind !== 'account') return bad('source', 'Escolha a conta de onde sai o dinheiro.')
    if (!d.destination) return bad('destination', 'Escolha para onde vai o dinheiro.')
    if (d.destination.id === d.source.id) return bad('destination', 'Origem e destino precisam ser diferentes.')
    return null
  }
  if (!d.name.trim()) return bad('name', 'Descreva o lançamento (ex.: mercado, uber, salário).')
  if (!d.source) return bad('source', d.kind === 'entrada' ? 'Escolha a conta que recebeu.' : 'Escolha a conta ou o cartão.')
  if (d.kind === 'entrada' && d.source.kind === 'card') return bad('source', 'Entrada cai numa conta, não num cartão.')
  if (d.installments < 1 || d.installments > MAX_INSTALLMENTS) return bad('installments', `Parcelas: de 1 a ${MAX_INSTALLMENTS}.`)
  if (d.installments > 1 && d.kind !== 'gasto') return bad('installments', 'Só gasto pode ser parcelado.')
  if (d.installments > 1 && d.personIds.length) return bad('installments', 'Compra parcelada não aceita pessoa vinculada.')
  return null
}

/** Primeira mensagem de erro (em português, pronta para o campo) ou null se está tudo certo. */
export function validateDraft(d: EntryDraft): string | null {
  return validateDraftField(d)?.message ?? null
}

/** "10x de R$ 120,00 — total R$ 1.200,00" (a parcela já vem com os centavos que sobram na 1ª). */
export function installmentPreview(total: number, n: number): { each: number; first: number } {
  const each = Math.round((total / n) * 100) / 100
  const first = Math.round((total - each * (n - 1)) * 100) / 100
  return { each, first }
}

// ── rascunho → API ───────────────────────────────────────────────────────────

/** Tipo de operação que o rascunho vira. Serve também para saber como desfazer. */
export type EntryOp =
  | { op: 'transaction'; body: { name: string; valor: number; tipo: 'Despesa' | 'Receita'; categoria: string; conta?: string; card_id?: string; data: string; notes?: string; person_ids?: string[] } }
  | { op: 'installment'; body: { name: string; valor_total: number; num_parcelas: number; conta?: string; card_id?: string; categoria: string; data_inicio: string } }
  | { op: 'transfer'; body: { from_account: string; to_account?: string; to_card?: string; valor: number; data: string; notes?: string } }

export function entryOp(d: EntryDraft): EntryOp {
  const err = validateDraft(d)
  if (err) throw new Error(err)
  const valor = d.valor as number
  const source = d.source as Source
  const origin = source.kind === 'card' ? { card_id: source.id } : { conta: source.name }

  if (d.kind === 'transferencia') {
    const dest = d.destination as Source
    return {
      op: 'transfer',
      body: {
        from_account: source.name, valor, data: d.date, notes: d.notes || undefined,
        ...(dest.kind === 'card' ? { to_card: dest.name } : { to_account: dest.name }),
      },
    }
  }

  const categoria = d.categoria || (d.kind === 'entrada' ? 'Receita' : 'Inbox')
  if (d.kind === 'gasto' && d.installments > 1) {
    return { op: 'installment', body: { name: d.name.trim(), valor_total: valor, num_parcelas: d.installments, ...origin, categoria, data_inicio: d.date } }
  }
  return {
    op: 'transaction',
    body: {
      name: d.name.trim(), valor, tipo: d.kind === 'entrada' ? 'Receita' : 'Despesa', categoria, ...origin, data: d.date,
      notes: d.notes || undefined, person_ids: d.personIds.length ? d.personIds : undefined,
    },
  }
}

export function txToDraft(tx: Transaction, sources: Source[]): EntryDraft {
  const source = sources.find((s) => (tx.card_id && s.id === tx.card_id) || (tx.account_id && s.id === tx.account_id)) ?? null
  return {
    kind: tx.tipo === 'Receita' ? 'entrada' : 'gasto',
    name: tx.name, valor: tx.valor, date: tx.data, categoria: tx.categoria, source, destination: null,
    installments: 1, personIds: (tx.people ?? []).map((p) => p.id), notes: tx.notes ?? '',
  }
}

export function emptyDraft(kind: EntryKind = 'gasto', defaultSource: Source | null = null, today: string = todayISO()): EntryDraft {
  return { kind, name: '', valor: null, date: today, categoria: '', source: defaultSource, destination: null, installments: 1, personIds: [], notes: '' }
}
