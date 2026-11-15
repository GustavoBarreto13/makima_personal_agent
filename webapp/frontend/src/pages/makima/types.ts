// Tipos da home da Makima ("Hoje") — espelham GET /api/hub/today e GET /api/hub/summary.

/** Número já formatado pelo backend (o front só exibe). */
export interface Stat {
  v: string
  k: string
  href?: string
}

/** Resumo por agente (GET /api/hub/summary). `null` = o agente falhou naquele cálculo. */
export type HubSummary = Record<string, { stat: Stat; stat2: Stat } | null>

export interface FocusNow {
  id: number
  title: string
  phase: 'foco' | 'pausa' | null
  remaining_sec: number | null
  href: string
}

export interface NextEvent {
  title: string
  time: string
  href: string
}

export type AttentionTone = 'danger' | 'warn' | 'info'

export interface AttentionItem {
  id: string
  agent: string
  tone: AttentionTone
  label: string
  action: string
  href: string
}

export interface TodayPayload {
  date: string
  now: { focus: FocusNow | null; next: NextEvent | null }
  attention: AttentionItem[]
  numbers: Record<string, Stat | null>
}

// ── Captura universal ──────────────────────────────────────────────────────

export type CaptureKind = 'expense' | 'income' | 'task'

export interface CapturePreview {
  kind: CaptureKind | 'empty'
  agent: 'nami' | 'kaguya' | null
  confidence: 'high' | 'low'
  title: string
  summary: string
  fields: Record<string, unknown>
  people: { id: string; name: string; mention: string }[]
  warnings: string[]
}

export interface CaptureUndo {
  kind: CaptureKind
  id: string
}

// ── Busca global ───────────────────────────────────────────────────────────

export interface SearchHit {
  id: string
  group: string
  agent: string
  label: string
  icon: string
  href: string
}

// ── Chat com o Hermes ──────────────────────────────────────────────────────

export interface ChatAction {
  agent: string | null
  tool: string
  label: string
}

export interface ChatMessage {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  actions: ChatAction[]
  created_at?: string
}
