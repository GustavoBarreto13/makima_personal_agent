/**
 * yatoApi.ts — Yato · Viagens (fatia 066)
 *
 * Wrapper tipado sobre os endpoints REST /api/travel/*.
 * Componentes nunca fazem fetch diretamente — usam este objeto (regra §10 do
 * design-guide.md). Espelha o padrão de maiApi.ts.
 */

import { api } from '../../lib/api'
import type {
  Trip, TripsListResponse, TripProfile, TripStatus, TripSort,
  ItineraryDay, ItineraryItem, Period, TransportMode,
  DossierResponse, MobilityStrategyResponse, MobilityApp, Verdict, CheckSource,
  TripChecklistItem, BudgetResponse, BudgetCategory, TripExpense,
  ComfortResponse, ComfortClass, TripReadiness, OrphansPendingResponse,
} from './types'

// ── Bodies de request ────────────────────────────────────────────────────────

export interface CreateTripBody {
  title?: string | null
  city: string
  state_uf: string
  start_date: string
  end_date: string
  profile?: TripProfile
  notes?: string | null
}

export interface UpdateTripBody {
  title?: string | null
  start_date?: string
  end_date?: string
  profile?: TripProfile
  status?: TripStatus
  notes?: string | null
}

export interface ResolveOrphansBody {
  action: 'move' | 'remove'
  item_ids: string[]
  new_day_date?: string
}

export interface AddItineraryItemBody {
  day_date: string
  period: Period
  start_time?: string | null
  title: string
  address?: string | null
  transport_mode?: TransportMode | null
  cost_estimate?: number | null
  notes?: string | null
}

export type UpdateItineraryItemBody = Partial<AddItineraryItemBody> & { position?: number }

export interface UpsertCheckBody {
  verdict: Verdict
  source: CheckSource
  evidence?: string | null
}

export interface AddChecklistItemBody {
  label: string
  category?: string | null
}

export interface UpdateChecklistItemBody {
  done?: boolean
  label?: string
}

export interface BudgetEstimateItem {
  category: BudgetCategory
  estimated: number
}

export interface LogExpenseBody {
  category: BudgetCategory
  amount: number
  description: string
  date?: string
}

interface OkResponse { status: string; [key: string]: unknown }

// ── Objeto de API ─────────────────────────────────────────────────────────

export const yatoApi = {
  // ── Viagens ────────────────────────────────────────────────────────────
  listTrips: (params?: { status?: string; sort?: TripSort; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.sort) q.set('sort', params.sort)
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString() ? `?${q}` : ''
    return api.get<TripsListResponse>(`/api/travel/trips${qs}`)
  },

  // As tools do backend sempre devolvem {"status":"ok", "trip"|"item": {...}}
  // (mesmo padrão de agents/mai/tools.py) — o router é fachada fina e não
  // desembrulha; o client é quem normaliza para o objeto plano.
  createTrip: (body: CreateTripBody) =>
    api.post<{ status: string; trip: Trip }>('/api/travel/trips', body).then(r => r.trip),

  getTrip: (tripId: string) =>
    api.get<{ status: string; trip: Trip }>(`/api/travel/trips/${tripId}`).then(r => r.trip),

  updateTrip: (tripId: string, body: UpdateTripBody) =>
    api.patch<{ status: string; trip: Trip } | OrphansPendingResponse>(`/api/travel/trips/${tripId}`, body)
      .then(res => ('trip' in res ? res.trip : res)),

  resolveOrphans: (tripId: string, body: ResolveOrphansBody) =>
    api.post<OkResponse>(`/api/travel/trips/${tripId}/resolve-orphans`, body),

  deleteTrip: (tripId: string) =>
    api.del<OkResponse>(`/api/travel/trips/${tripId}`),

  // ── Roteiro ──────────────────────────────────────────────────────────────
  listItinerary: (tripId: string) =>
    api.get<{ days: ItineraryDay[] }>(`/api/travel/trips/${tripId}/itinerary`),

  addItineraryItem: (tripId: string, body: AddItineraryItemBody) =>
    api.post<{ status: string; item: ItineraryItem }>(`/api/travel/trips/${tripId}/itinerary`, body).then(r => r.item),

  updateItineraryItem: (itemId: string, body: UpdateItineraryItemBody) =>
    api.patch<{ status: string; item: ItineraryItem }>(`/api/travel/itinerary/${itemId}`, body).then(r => r.item),

  deleteItineraryItem: (itemId: string) =>
    api.del<OkResponse>(`/api/travel/itinerary/${itemId}`),

  // ── Dossiê de mobilidade ─────────────────────────────────────────────────
  getDossier: (uf: string, city: string) =>
    api.get<DossierResponse>(`/api/travel/dossiers/${encodeURIComponent(uf)}/${encodeURIComponent(city)}`),

  upsertCheck: (uf: string, city: string, checkKey: string, body: UpsertCheckBody) =>
    api.put<OkResponse>(
      `/api/travel/dossiers/${encodeURIComponent(uf)}/${encodeURIComponent(city)}/checks/${checkKey}`,
      body,
    ),

  getStrategy: (uf: string, city: string) =>
    api.get<MobilityStrategyResponse>(
      `/api/travel/dossiers/${encodeURIComponent(uf)}/${encodeURIComponent(city)}/strategy`,
    ),

  suggestApps: (params: { uf?: string; city?: string }) => {
    const q = new URLSearchParams()
    if (params.uf) q.set('uf', params.uf)
    if (params.city) q.set('city', params.city)
    return api.get<{ apps: MobilityApp[] }>(`/api/travel/apps?${q}`)
  },

  // ── Conforto (motor puro) ────────────────────────────────────────────────
  getComfort: (params: { hours: number; night?: boolean; profile?: string; has_ride_app?: boolean }) => {
    const q = new URLSearchParams()
    q.set('hours', String(params.hours))
    if (params.night != null) q.set('night', String(params.night))
    if (params.profile) q.set('profile', params.profile)
    if (params.has_ride_app != null) q.set('has_ride_app', String(params.has_ride_app))
    return api.get<ComfortResponse>(`/api/travel/comfort?${q}`)
  },

  // ── Checklist ────────────────────────────────────────────────────────────
  listChecklist: (tripId: string, done?: boolean) =>
    api.get<{ items: TripChecklistItem[] }>(
      `/api/travel/trips/${tripId}/checklist${done != null ? `?done=${done}` : ''}`,
    ),

  addChecklistItem: (tripId: string, body: AddChecklistItemBody) =>
    api.post<{ status: string; item: TripChecklistItem }>(`/api/travel/trips/${tripId}/checklist`, body).then(r => r.item),

  updateChecklistItem: (itemId: string, body: UpdateChecklistItemBody) =>
    api.patch<{ status: string; item: TripChecklistItem }>(`/api/travel/checklist/${itemId}`, body).then(r => r.item),

  regenerateChecklist: (tripId: string) =>
    api.post<{ status: string; added: number; skipped_existing: number }>(
      `/api/travel/trips/${tripId}/checklist/regenerate`, {},
    ),

  deleteChecklistItem: (itemId: string) =>
    api.del<OkResponse>(`/api/travel/checklist/${itemId}`),

  // ── Orçamento e gastos ───────────────────────────────────────────────────
  getBudget: (tripId: string) =>
    api.get<BudgetResponse>(`/api/travel/trips/${tripId}/budget`),

  setBudget: (tripId: string, items: BudgetEstimateItem[]) =>
    api.put<OkResponse>(`/api/travel/trips/${tripId}/budget`, { items }),

  listExpenses: (tripId: string) =>
    api.get<{ expenses: TripExpense[] }>(`/api/travel/trips/${tripId}/expenses`),

  logExpense: (tripId: string, body: LogExpenseBody) =>
    api.post<{ status: string; budget_item: { category: string; actual: number }; nami_transaction_id: string }>(
      `/api/travel/trips/${tripId}/expenses`, body,
    ),

  deleteExpense: (tripId: string, namiTransactionId: string) =>
    api.del<OkResponse>(`/api/travel/trips/${tripId}/expenses/${namiTransactionId}`),

  getReadiness: (tripId: string) =>
    api.get<TripReadiness>(`/api/travel/trips/${tripId}/readiness`),
}

export type { ComfortClass }
