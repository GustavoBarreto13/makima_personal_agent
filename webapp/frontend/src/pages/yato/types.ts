/**
 * types.ts — Yato · Viagens (fatia 066)
 *
 * Interfaces TypeScript que espelham os contratos de dados do backend
 * (/api/travel/*, ver specs/066-travel-agent/contracts/api-travel.md).
 */

// ── Enums de domínio ─────────────────────────────────────────────────────────

export type Verdict = 'confirmado' | 'ausente' | 'inconclusivo' | 'pendente' | 'na'

export type CheckKey =
  | 'porte_cidade' | 'uber' | '99' | 'indrive'
  | 'transporte_publico' | 'hospedagem_transfer' | 'deslocamentos'

export type CheckSource =
  | 'simulacao_in_app' | 'pagina_oficial' | 'google_maps' | 'moovit'
  | 'contato_hospedagem' | 'relato_local' | 'outro'

export type TripProfile = 'economia' | 'equilibrado' | 'conforto'

export type TripStatus = 'planejando' | 'confirmada' | 'em_curso' | 'concluida' | 'cancelada'

export type Period = 'manha' | 'tarde' | 'noite'

export type TransportMode =
  | 'a_pe' | 'transporte_publico' | 'app_corrida' | 'taxi' | 'mototaxi' | 'transfer' | 'outro'

export type BudgetCategory =
  | 'transporte_ida' | 'transporte_volta' | 'hospedagem' | 'alimentacao'
  | 'mobilidade_local' | 'passeios' | 'outros'

export type MobilityStrategy =
  | 'caminhavel' | 'transporte_publico' | 'app_corrida'
  | 'taxi_mototaxi' | 'transfer_hospedagem' | 'carro_alugado'

export type CitySize = 'capital' | 'media' | 'pequena'

export type ComfortClass = 'convencional' | 'executivo' | 'semi_leito' | 'leito' | 'leito_cama'

// ── Telas e tweaks (sem persistência no servidor) ───────────────────────────

export type YatoView = 'home' | 'trips' | 'trip' | 'mobility' | 'budget' | 'checklist'

export type ThemeMode = 'dark' | 'light'
export type Accent = 'azul' | 'ouro' | 'carmim' | 'musgo'
export type Density = 'large' | 'medium' | 'compact'
export type TripSort = 'recent' | 'upcoming' | 'title'

export interface Tweaks {
  tema: 'Escuro' | 'Claro'
  acento: 'Azul-cachecol' | 'Ouro' | 'Carmim' | 'Musgo'
  densidade: 'Grande' | 'Médio' | 'Compacto'
  textura: boolean
  ordenacao: 'Data de ida' | 'Criada' | 'Prontidão' | 'Orçamento'
}

export interface NavState {
  view: YatoView
  param: string | null
}

// ── Entidade: Trip ───────────────────────────────────────────────────────────

export interface Trip {
  id: string
  title: string | null
  city: string
  state_uf: string
  start_date: string   // YYYY-MM-DD
  end_date: string     // YYYY-MM-DD
  profile: TripProfile
  status: TripStatus
  notes: string | null
}

// ── Entidade: ItineraryItem (trip_items) ────────────────────────────────────

export interface ItineraryItem {
  id: string
  trip_id?: string
  day_date?: string   // presente em endpoints que não agrupam por dia; ausente dentro de ItineraryDay.items
  period: Period
  start_time: string | null   // HH:MM ou null — nunca inventar
  title: string
  address: string | null
  transport_mode: TransportMode | null
  cost_estimate: number | null
  notes?: string | null
  position: number
}

export interface ItineraryDay {
  day_date: string
  items: ItineraryItem[]
}

// ── Dossiê de mobilidade ─────────────────────────────────────────────────────

export interface MobilityCheck {
  check_key: CheckKey
  verdict: Verdict
  source: CheckSource | null
  evidence: string | null
  checked_at: string | null
}

export interface MobilityDossier {
  id?: string
  city: string
  state_uf: string
  city_size: CitySize | null
  pedestrian_scale: boolean
  summary: string | null
  last_checked_at: string | null
  stale: boolean
}

export interface DossierResponse {
  dossier: MobilityDossier
  checks: MobilityCheck[]
}

export interface MobilityStrategyResponse {
  strategy: MobilityStrategy | null
  pending_checks: CheckKey[]
  rationale: string
}

export interface MobilityApp {
  name: string
  kind: 'app_corrida' | 'transporte_publico' | 'taxi'
  coverage_scope: 'nacional' | 'regiao' | 'uf' | 'cidades'
  url: string | null
  label: string   // "cobertura declarada — confirmar in-app"
}

// ── Checklist ────────────────────────────────────────────────────────────────

export interface TripChecklistItem {
  id: string
  trip_id?: string
  label: string
  category: string | null
  done: boolean
  origin: 'dossie' | 'manual'
  position: number
}

// ── Orçamento e gastos ───────────────────────────────────────────────────────

export interface BudgetItem {
  category: BudgetCategory
  estimated: number
  actual: number
  balance: number
  over_budget: boolean
}

export interface BudgetResponse {
  items: BudgetItem[]
  total_estimated: number
  total_actual: number
  total_balance: number
}

export interface TripExpense {
  id: string
  trip_id?: string
  category: BudgetCategory
  amount: number
  description: string
  date: string
  nami_transaction_id?: string | null
}

export interface ComfortResponse {
  recommended_class: ComfortClass
  rationale: string
  roi_queue: string[]
}

export interface TripReadiness {
  readiness_pct: number
  checklist_done: number
  checklist_total: number
  dossier_pending: number
  budget_defined: boolean
}

// ── Respostas de listagem ────────────────────────────────────────────────────

export interface TripsListResponse {
  trips: Trip[]
  total: number
}

export interface OrphansPendingResponse {
  status: 'orphans_pending'
  orphan_count: number
  orphan_item_ids: string[]
  message: string
}
