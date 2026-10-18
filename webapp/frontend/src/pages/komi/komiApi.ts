// Camada de API da Komi (Pessoas) — tudo que a tela pede ao servidor passa por aqui.
// Componentes NUNCA chamam fetch direto. `create` e `search` mantêm a assinatura antiga porque
// outras telas (Violet) cadastram pessoas por eles.

import { api } from '../../lib/api'
import type {
  AiSummary, Briefing, Category, DuplicatePair, Group, GeneratedSummary, Interaction, InteractionKind, Memory, MergePreview,
  NoteKind, PersonDetail, PersonInput, PersonNote, PersonRow, Relation, RelationKind, RecordSpace, SummaryState,
} from './types'
import type { StatsPayload } from '../../design/core/stats'

const BASE = '/api/people'

/** O banco tem campo vazio demais para confiar: listas que vêm null viram [], números e textos ficam como estão. */
export function normalizeRow(p: PersonRow): PersonRow {
  return {
    ...p,
    nickname: p.nickname ?? null,
    full_name: p.full_name ?? null,
    aliases: p.aliases ?? [],
    groups: p.groups ?? [],
    dates: p.dates ?? [],
    link_count: p.link_count ?? 0,
    finance_net: p.finance_net ?? 0,
    last_interaction: p.last_interaction ?? null,
    context: p.context ?? 'personal',
    category: p.category ?? 'outros',
  }
}
const q = (params: Record<string, string | number | undefined | null>): string => {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return usable.length ? `?${usable.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : ''
}

/** Perfil: apelidos e datas que vêm null viram listas vazias. */
function normalizeDetail(d: PersonDetail & { status: string }): PersonDetail & { status: string } {
  return {
    ...d,
    perfil: { ...d.perfil, context: d.perfil.context ?? 'personal', category: d.perfil.category ?? 'outros' },
    aliases: d.aliases ?? [],
    datas: (d.datas ?? []).filter((x) => !!x?.date),
  }
}

/** Memória: nenhuma lista pode chegar null nas telas. */
function normalizeMemory(m: Memory & { status: string }): Memory & { status: string } {
  return {
    ...m,
    items: m.items ?? [],
    counts: m.counts ?? {},
    by_context: m.by_context ?? { personal: 0, work: 0 },
    unavailable: m.unavailable ?? [],
  }
}

/** Briefing: blocos vazios viram listas e objetos vazios, para o cartão decidir o que mostrar. */
function normalizeBriefing(b: Briefing & { status: string }): Briefing & { status: string } {
  return {
    ...b,
    dates: b.dates ?? [],
    notes: b.notes ?? {},
    suggestions_pending: b.suggestions_pending ?? 0,
    ai: b.ai ?? null,
    pending: { balance: b.pending?.balance ?? 0, open_tasks: b.pending?.open_tasks ?? 0, waiting: b.pending?.waiting ?? [] },
    contact: { last: b.contact?.last ?? null, days_since: b.contact?.days_since ?? null, recent_interactions: b.contact?.recent_interactions ?? [] },
    relations: b.relations ?? [],
    groups: b.groups ?? [],
  }
}

/** Campos que o servidor aceita ao criar/editar uma pessoa (o formulário manda só o que mudou). */
export type PersonPatch = Partial<Omit<PersonInput, 'birth_day' | 'birth_month' | 'birth_year'>> & {
  birth_day?: number | null
  birth_month?: number | null
  birth_year?: number | null
}

export const komiApi = {
  // ── Pessoas ────────────────────────────────────────────────────────────────
  /** Todas as pessoas vivas, com o que o Início e as coleções precisam. */
  overview: () => api.get<{ people: PersonRow[] }>(`${BASE}/overview`).then((r) => (r.people ?? []).map(normalizeRow)),

  /** Busca por nome, apelido ou nome completo (0, 1 ou várias). */
  search: (text: string) =>
    api.get<{ status: string; matches: { id: string; name: string; relationship: string | null }[] }>(`${BASE}/search${q({ q: text })}`),

  get: (id: string) => api.get<PersonDetail & { status: string }>(`${BASE}/${id}`).then(normalizeDetail),

  /** Cadastra. Devolve o id da pessoa nova. */
  create: (body: PersonPatch & { name: string }) => api.post<{ status: string; id: string }>(`${BASE}/`, body),

  update: (id: string, body: PersonPatch) => api.patch<{ status: string }>(`${BASE}/${id}`, body),

  /** Vai para a lixeira (dá para restaurar). */
  remove: (id: string) => api.del<void>(`${BASE}/${id}`),
  restore: (id: string) => api.post<{ status: string }>(`${BASE}/${id}/restore`, {}),

  addAlias: (id: string, alias: string) => api.post<{ status: string }>(`${BASE}/${id}/aliases`, { alias }),
  removeAlias: (id: string, aliasId: number) => api.del<void>(`${BASE}/${id}/aliases/${aliasId}`),

  // ── Datas importantes (o aniversário é campo da pessoa) ────────────────────
  addDate: (id: string, body: { label: string; date: string; recurring: boolean; remind_days_before: number }) =>
    api.post<{ status: string; id: number }>(`${BASE}/${id}/dates`, body),
  updateDate: (id: string, dateId: number, body: Partial<{ label: string; date: string; recurring: boolean; remind_days_before: number }>) =>
    api.patch<{ status: string }>(`${BASE}/${id}/dates/${dateId}`, body),
  removeDate: (id: string, dateId: number) => api.del<void>(`${BASE}/${id}/dates/${dateId}`),

  // ── Memória, resumo e briefing ─────────────────────────────────────────────
  memory: (id: string, context?: RecordSpace) => api.get<Memory & { status: string }>(`${BASE}/${id}/memory${q({ context })}`).then(normalizeMemory),
  summary: (id: string, context = 'all') => api.get<SummaryState & { status: string }>(`${BASE}/${id}/memory/summary${q({ context })}`),
  /** Pede à IA. Pode demorar e pode falhar (ex.: sem chave): a tela mostra a mensagem. */
  generateSummary: (id: string, context = 'all', force = false) =>
    api.post<GeneratedSummary & { status: string }>(`${BASE}/${id}/memory/summary`, { context, force }),
  briefing: (id: string) => api.get<Briefing & { status: string }>(`${BASE}/${id}/briefing`).then(normalizeBriefing),

  /** Tira a pessoa de um item de outro agente. `undoable` diz se `relink` desfaz. */
  unlink: (id: string, entityType: string, entityId: string) =>
    api.del<{ status: string; removed: number; undoable: boolean }>(`${BASE}/${id}/links/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`),
  relink: (id: string, entityType: string, entityId: string) =>
    api.post<{ status: string }>(`${BASE}/${id}/links`, { entity_type: entityType, entity_id: entityId }),

  // ── Anotações ──────────────────────────────────────────────────────────────
  notes: (id: string, status?: string) => api.get<{ notes: PersonNote[] }>(`${BASE}/${id}/notes${q({ status })}`).then((r) => r.notes ?? []),
  addNote: (id: string, body: { text: string; kind: NoteKind; context?: RecordSpace }) =>
    api.post<{ status: string; id: number }>(`${BASE}/${id}/notes`, body),
  updateNote: (noteId: number, body: Partial<{ text: string; kind: NoteKind; context: RecordSpace }>) =>
    api.patch<{ status: string }>(`${BASE}/notes/${noteId}`, body),
  removeNote: (noteId: number) => api.del<void>(`${BASE}/notes/${noteId}`),
  restoreNote: (noteId: number) => api.post<{ status: string }>(`${BASE}/notes/${noteId}/restore`, {}),
  acceptNote: (noteId: number, body?: { text?: string; kind?: NoteKind }) => api.post<{ status: string }>(`${BASE}/notes/${noteId}/accept`, body ?? {}),
  dismissNote: (noteId: number) => api.post<{ status: string }>(`${BASE}/notes/${noteId}/dismiss`, {}),

  // ── Interações ─────────────────────────────────────────────────────────────
  interactions: (id: string, limit = 100) =>
    api.get<{ interactions: Interaction[] }>(`${BASE}/${id}/interactions${q({ limit })}`).then((r) => r.interactions ?? []),
  addInteraction: (id: string, body: { kind: InteractionKind; happened_at?: string; note?: string; context?: RecordSpace }) =>
    api.post<{ status: string; id: number }>(`${BASE}/${id}/interactions`, body),
  updateInteraction: (interactionId: number, body: Partial<{ kind: InteractionKind; happened_at: string; note: string; context: RecordSpace }>) =>
    api.patch<{ status: string }>(`${BASE}/interactions/${interactionId}`, body),
  removeInteraction: (interactionId: number) => api.del<void>(`${BASE}/interactions/${interactionId}`),
  restoreInteraction: (interactionId: number) => api.post<{ status: string }>(`${BASE}/interactions/${interactionId}/restore`, {}),

  // ── Relacionamentos (a lista configurável) ─────────────────────────────────
  categories: (includeArchived = false) =>
    api.get<{ categories: Category[] }>(`${BASE}/categories${q({ include_archived: includeArchived ? 'true' : undefined })}`).then((r) => r.categories ?? []),
  addCategory: (body: { label: string; icon: string }) => api.post<{ status: string; slug: string }>(`${BASE}/categories`, body),
  updateCategory: (slug: string, body: Partial<{ label: string; icon: string }>) => api.patch<{ status: string }>(`${BASE}/categories/${slug}`, body),
  reorderCategories: (slugs: string[]) => api.post<{ status: string }>(`${BASE}/categories/reorder`, { slugs }),
  archiveCategory: (slug: string, moveTo?: string) => api.post<{ status: string; moved: number }>(`${BASE}/categories/${slug}/archive`, { move_to: moveTo ?? null }),
  unarchiveCategory: (slug: string) => api.post<{ status: string }>(`${BASE}/categories/${slug}/unarchive`, {}),

  // ── Relações entre pessoas e grupos ────────────────────────────────────────
  relationKinds: () => api.get<{ kinds: RelationKind[] }>(`${BASE}/relation-kinds`).then((r) => r.kinds ?? []),
  relations: (id: string) => api.get<{ relations: Relation[] }>(`${BASE}/${id}/relations`).then((r) => r.relations ?? []),
  relate: (id: string, otherId: string, kind: string) => api.post<{ status: string }>(`${BASE}/${id}/relations`, { other_id: otherId, kind }),
  unrelate: (id: string, otherId: string, kind?: string) => api.del<void>(`${BASE}/${id}/relations/${otherId}${q({ kind })}`),
  groups: () => api.get<{ groups: Group[] }>(`${BASE}/groups`).then((r) => r.groups ?? []),
  personGroups: (id: string) => api.get<{ groups: Group[] }>(`${BASE}/${id}/groups`).then((r) => r.groups ?? []),
  addGroup: (name: string) => api.post<{ status: string; id: number }>(`${BASE}/groups`, { name }),
  removeGroup: (groupId: number) => api.del<void>(`${BASE}/groups/${groupId}`),
  addToGroup: (groupId: number, personId: string) => api.post<{ status: string }>(`${BASE}/groups/${groupId}/members`, { person_id: personId }),
  removeFromGroup: (groupId: number, personId: string) => api.del<void>(`${BASE}/groups/${groupId}/members/${personId}`),

  // ── Duplicadas e mesclar ───────────────────────────────────────────────────
  duplicates: () => api.get<{ pairs: DuplicatePair[] }>(`${BASE}/duplicates`).then((r) => r.pairs ?? []),
  mergePreview: (keepId: string, dropId: string) => api.post<MergePreview & { status: string }>(`${BASE}/merge/preview`, { keep_id: keepId, drop_id: dropId }),
  merge: (keepId: string, dropId: string) => api.post<{ status: string; message: string; warnings?: string[] }>(`${BASE}/merge`, { keep_id: keepId, drop_id: dropId }),

  // ── Estatísticas ───────────────────────────────────────────────────────────
  stats: (year: number) => api.get<StatsPayload & { first_year: number }>(`${BASE}/stats${q({ year })}`),

  // ── Foto ───────────────────────────────────────────────────────────────────
  /** Envia a foto (multipart: o `api.post` só fala JSON, então este é o único fetch direto). */
  uploadAvatar: async (file: File): Promise<{ url: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/uploads/avatar`, { method: 'POST', credentials: 'include', body: form })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(typeof err.detail === 'string' ? err.detail : 'Não foi possível enviar a foto.')
    }
    return res.json()
  },
}

export type { AiSummary }
