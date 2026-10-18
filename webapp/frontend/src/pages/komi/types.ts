// Tipos da Komi (Pessoas) — espelham o que o backend devolve em /api/people/* (spec 077).
// Os nomes dos campos ficam como o servidor manda (snake_case) para não haver tradução escondida:
// quem lê o código vê o mesmo nome que vê na API.

/** Em que espaço a pessoa vive: pessoal, trabalho ou os dois. */
export type Space = 'personal' | 'work' | 'both'
/** Espaço de um registro (anotação, interação, item da memória): "ambos" nunca é de um registro só. */
export type RecordSpace = 'personal' | 'work'
/** O filtro do topo: tudo ou um espaço. */
export type SpaceFilter = 'all' | RecordSpace

export type InteractionKind = 'mensagem' | 'ligacao' | 'encontro' | 'video' | 'outro'
export type NoteKind = 'presente' | 'gosta' | 'nao_gosta' | 'nota'
export type NoteStatus = 'ativa' | 'sugerida' | 'descartada'

/** Uma pessoa na lista e no resumo do Início (GET /api/people/overview). */
export interface PersonRow {
  id: string
  name: string
  nickname: string | null
  full_name: string | null
  relationship: string | null
  /** Slug do relacionamento (lista configurável). */
  category: string
  context: Space
  city: string | null
  avatar_url: string | null
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
  birthday_remind_days?: number | null
  /** Outras formas de chamar a pessoa (só servem para a busca achar). */
  aliases: string[]
  /** Nomes dos grupos em que a pessoa está ("turma da faculdade"). */
  groups: string[]
  link_count: number
  dates: OtherDate[]
  /** Quanto a pessoa te deve (+) ou você deve a ela (−), vindo da Nami. */
  finance_net: number
  last_interaction: LastContact | null
}

export interface LastContact {
  /** AAAA-MM-DD */
  date: string
  /** "interação", "diário", "tarefa"… */
  kind: string
  text: string
}

/** Data importante que não é o aniversário (casamento, formatura…). */
export interface OtherDate {
  id?: number
  label: string
  /** AAAA-MM-DD */
  date: string
  recurring: boolean
  /** Dias de antecedência do lembrete: 0 = no dia; null ou −1 = sem lembrete. */
  remind_days_before: number | null
}

export interface Alias {
  id: number
  alias: string
}

/** Perfil completo (GET /api/people/{id}). */
export interface PersonProfile {
  id: string
  name: string
  nickname: string | null
  full_name: string | null
  relationship: string | null
  category: string
  context: Space
  phone: string | null
  email: string | null
  instagram: string | null
  telegram: string | null
  city: string | null
  avatar_url: string | null
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
  birthday_remind_days: number | null
  created_at: string
  deleted: boolean
}

export interface PersonDetail {
  perfil: PersonProfile
  aliases: Alias[]
  datas: Required<OtherDate>[]
}

/** Item da Memória: um backlink de qualquer agente ou uma interação. */
export interface MemoryItem {
  entity_type: string
  entity_id: string
  /** Agente de origem ("kaguya", "nami", "komi"…). */
  agent: string
  /** Nome do tipo, escolhido pelo agente ("Tarefas", "Diário"…). */
  label: string
  icon: string
  title: string
  snippet: string
  /** AAAA-MM-DD, ou vazio. */
  date: string
  deep_link: string
  context: RecordSpace
}

export interface Memory {
  items: MemoryItem[]
  counts: Record<string, number>
  by_context: Record<RecordSpace, number>
  /** Agentes que não responderam: a Memória aparece incompleta, avisada. */
  unavailable: string[]
}

export interface SummarySource {
  entity_type: string
  entity_id: string
  agent: string
  title: string
  date: string
  deep_link: string
  context: RecordSpace
}

export interface SummaryPoint {
  texto: string
  fontes: SummarySource[]
}

export interface AiSummary {
  resumo: string
  pontos: SummaryPoint[]
  pendencias: SummaryPoint[]
  sugestoes: { tipo: NoteKind; texto: string; fontes: SummarySource[] }[]
}

export interface SummaryState {
  summary: AiSummary | null
  /** true = a Memória mudou depois que o resumo foi gerado. */
  stale: boolean | null
  generated_at: string | null
}

export interface GeneratedSummary extends SummaryState {
  empty?: boolean
  message?: string
  cached?: boolean
  suggestions_created?: number
}

export interface PersonNote {
  id: number
  person_id: string
  kind: NoteKind
  context: RecordSpace
  text: string
  source: 'manual' | 'ia'
  source_refs: { entity_type: string; entity_id: string; agent: string; title: string; deep_link: string }[]
  status: NoteStatus
  created_at: string
}

export interface Interaction {
  id: number
  person_id: string
  kind: InteractionKind
  context: RecordSpace
  note: string | null
  /** ISO com fuso. */
  happened_at: string
  /** AAAA-MM-DD já no fuso de São Paulo. */
  date: string
}

export interface Category {
  slug: string
  label: string
  /** Nome do ícone do Design System. */
  icon: string
  position: number
  archived: boolean
  people_count: number
}

export interface RelationKind {
  slug: string
  label: string
  inverse_slug: string
}

export interface Relation {
  relation_id: number
  other_id: string
  other_name: string
  avatar_url: string | null
  kind: string
  label: string
}

export interface Group {
  id: number
  name: string
  member_count: number
}

export interface DuplicatePair {
  a: { id: string; name: string; nickname?: string | null }
  b: { id: string; name: string; nickname?: string | null }
  reasons: string[]
  score: number
}

export interface MergePreview {
  keep: { id: string; name: string; nickname: string | null }
  drop: { id: string; name: string; nickname: string | null }
  moves: { links: Record<string, number>; interactions: number; notes: number; dates: number; relations: number; groups: number }
  fill: Record<string, unknown>
  aliases: string[]
  context: Space
  birthday: boolean
}

/** Briefing: o cartão do topo do perfil. */
export interface Briefing {
  perfil: { category_label: string } & Pick<PersonProfile, 'id' | 'name' | 'nickname' | 'full_name' | 'context' | 'city'>
  birthday: { day: number; month: number; year: number | null; next_date: string; in_days: number; turning: number | null } | null
  dates: { label: string; date: string; in_days: number; remind_days_before: number | null }[]
  notes: Partial<Record<NoteKind, { id: number; text: string; context: RecordSpace }[]>>
  suggestions_pending: number
  ai: { resumo: string; stale: boolean | null; generated_at: string | null } | null
  pending: { balance: number; open_tasks: number; waiting: { title?: string; [k: string]: unknown }[] }
  contact: {
    last: LastContact | null
    days_since: number | null
    recent_interactions: { kind: InteractionKind; date: string; note: string | null; context: RecordSpace }[]
  }
  relations: Relation[]
  groups: Group[]
}

/** Dados que o formulário manda ao criar/editar uma pessoa. */
export interface PersonInput {
  name: string
  nickname: string
  full_name: string
  relationship: string
  category: string
  context: Space
  phone: string
  email: string
  instagram: string
  telegram: string
  city: string
  avatar_url: string
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
  /** −1 = sem lembrete. */
  birthday_remind_days: number
}
