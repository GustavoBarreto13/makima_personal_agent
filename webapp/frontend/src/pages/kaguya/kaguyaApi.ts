// Client tipado do domínio Kaguya — embrulha /api/tasks/* sobre lib/api.ts.
// Componentes NUNCA fazem fetch direto: usam este objeto (cookie de sessão e
// tratamento de erro já resolvidos por lib/api.ts).

import { api } from '../../lib/api'
import type { Sidebar, Task, Column, Tag, TodayResponse, RecurrenceMode, Filter, FilterRules, FilterTasksResponse, Habit, HabitHeatDay, MyDayResponse, Calendar, CalEvent, CalendarPref, AggregateResponse } from './types'

// Regra de recorrência enviada ao backend (a âncora é derivada do due_date lá).
interface RecurrenceInput {
  rrule: string
  mode: RecurrenceMode
}

// Resposta padrão das mutações (as tools retornam {status, ...}).
interface MutationResult {
  status: string
  message?: string
  id?: number
  // complete pode devolver needs_cascade (não é erro: é pedido de confirmação)
  needs_cascade?: boolean
  open_subtasks?: number
  position?: number
  project_id?: number
  // numa recorrente, complete/delete devolvem a próxima ocorrência gerada
  generated_task_id?: number | null
  next_due_date?: string
}

const BASE = '/api/tasks'

export const kaguyaApi = {
  // ── Sidebar / listas / grupos / colunas ──────────────────────────────────
  sidebar: () => api.get<Sidebar>(`${BASE}/sidebar`),

  createProject: (body: { name: string; group_id?: number; color?: string; icon?: string }) =>
    api.post<MutationResult>(`${BASE}/projects`, body),
  updateProject: (id: number, body: Partial<{ name: string; group_id: number; color: string; icon: string; position: number }>) =>
    api.patch<MutationResult>(`${BASE}/projects/${id}`, body),
  deleteProject: (id: number, mode: 'move_to_inbox' | 'delete_tasks') =>
    api.del<MutationResult>(`${BASE}/projects/${id}?mode=${mode}`),

  createGroup: (name: string) => api.post<MutationResult>(`${BASE}/groups`, { name }),
  updateGroup: (id: number, body: Partial<{ name: string; position: number }>) =>
    api.patch<MutationResult>(`${BASE}/groups/${id}`, body),
  deleteGroup: (id: number) => api.del<MutationResult>(`${BASE}/groups/${id}`),

  listColumns: (projectId: number) => api.get<Column[]>(`${BASE}/projects/${projectId}/columns`),
  createColumn: (body: { project_id: number; name: string; is_done_column?: boolean }) =>
    api.post<MutationResult>(`${BASE}/columns`, body),
  updateColumn: (id: number, body: Partial<{ name: string; position: number; is_done_column: boolean }>) =>
    api.patch<MutationResult>(`${BASE}/columns/${id}`, body),
  deleteColumn: (id: number) => api.del<MutationResult>(`${BASE}/columns/${id}`),

  // ── Tarefas ───────────────────────────────────────────────────────────────
  listTasks: (projectId: number, includeCompleted = false) =>
    api.get<Task[]>(`${BASE}?project_id=${projectId}&include_completed=${includeCompleted}`),
  today: () => api.get<TodayResponse>(`${BASE}/today`),
  eisenhower: () => api.get<Task[]>(`${BASE}/eisenhower`),
  search: (q: string) => api.get<Task[]>(`${BASE}/search?q=${encodeURIComponent(q)}`),
  trash: (projectId?: number) =>
    api.get<Task[]>(`${BASE}/trash${projectId ? `?project_id=${projectId}` : ''}`),

  createTask: (body: {
    title: string
    project_id?: number
    parent_id?: number
    priority?: number
    type?: string
    due_date?: string | null
    due_time?: string | null
    description?: string | null
    column_id?: number                  // coluna do Kanban (criar direto numa coluna)
    recurrence?: RecurrenceInput        // recorrência opcional na criação
    tags?: string[]                     // nomes das tags (criadas se não existirem)
  }) => api.post<MutationResult>(BASE, body),

  updateTask: (id: number, body: Partial<{
    title: string; description: string | null; priority: number; type: string
    due_date: string | null; due_time: string | null; project_id: number; column_id: number | null
    recurrence: RecurrenceInput; clear_recurrence: boolean   // anexar/editar/remover regra
    tags: string[]                                           // substitui o conjunto de tags
    duration_min: number | null                              // estimativa de duração (Meu Dia)
  }>) => api.patch<MutationResult>(`${BASE}/${id}`, body),

  // cascade conclui subtarefas; endSeries encerra a série recorrente (não gera a próxima).
  complete: (id: number, cascade = false, endSeries = false) =>
    api.post<MutationResult>(`${BASE}/${id}/complete`, { cascade, end_series: endSeries }),
  reopen: (id: number) => api.post<MutationResult>(`${BASE}/${id}/reopen`, {}),
  reorder: (id: number, body: { after_id?: number; before_id?: number }) =>
    api.post<MutationResult>(`${BASE}/${id}/position`, body),
  // scope: 'this' (só esta ocorrência) | 'series' (a série inteira) — só importa em recorrentes.
  remove: (id: number, scope: 'this' | 'series' = 'this') =>
    api.del<MutationResult>(`${BASE}/${id}?scope=${scope}`),
  restore: (id: number) => api.post<MutationResult>(`${BASE}/${id}/restore`, {}),

  // Atalhos de recorrência (o mesmo efeito de PATCH com recurrence/clear_recurrence).
  setRecurrence: (id: number, body: RecurrenceInput) =>
    api.post<MutationResult>(`${BASE}/${id}/recurrence`, body),
  clearRecurrence: (id: number) => api.del<MutationResult>(`${BASE}/${id}/recurrence`),

  // ── Tags (etiquetas) — fatia 013 ───────────────────────────────────────────
  listTags: () => api.get<Tag[]>(`${BASE}/tags`),
  createTag: (body: { name: string; color?: string }) =>
    api.post<MutationResult>(`${BASE}/tags`, body),
  updateTag: (id: number, body: Partial<{ name: string; color: string }>) =>
    api.patch<MutationResult>(`${BASE}/tags/${id}`, body),
  deleteTag: (id: number) => api.del<MutationResult>(`${BASE}/tags/${id}`),
  // Tarefas abertas que têm uma determinada tag (busca por nome, com ou sem #).
  tasksByTag: (name: string) => api.get<Task[]>(`${BASE}/by-tag?name=${encodeURIComponent(name)}`),

  // ── Smart-lists (filtros salvos) — fatia 013 / P2 ──────────────────────────
  listFilters: () => api.get<Filter[]>(`${BASE}/filters`),
  createFilter: (body: { name: string; rules: FilterRules; default_view?: string; icon?: string | null }) =>
    api.post<MutationResult>(`${BASE}/filters`, body),
  updateFilter: (id: number, body: Partial<{ name: string; rules: FilterRules; default_view: string; icon: string | null; position: number }>) =>
    api.patch<MutationResult>(`${BASE}/filters/${id}`, body),
  deleteFilter: (id: number) => api.del<MutationResult>(`${BASE}/filters/${id}`),
  // Abre uma smart-list salva: {tasks, orphans} (referências órfãs sinalizadas, sem erro).
  filterTasks: (id: number) => api.get<FilterTasksResponse>(`${BASE}/filters/${id}/tasks`),
  // Built-in "Hoje + Vencidas" (não persistida).
  todayOverdue: () => api.get<Task[]>(`${BASE}/filters/today-overdue`),
  // Built-ins GTD adicionais (não persistidos): abre um pela chave (next-actions, waiting…).
  builtinTasks: (key: string) => api.get<Task[]>(`${BASE}/filters/builtin/${encodeURIComponent(key)}/tasks`),

  // ── Calendário (consulta por intervalo) — fatia 013 / P3 ────────────────────
  // Tarefas datadas + ocorrências virtuais das recorrentes na janela [start, end].
  calendar: (start: string, end: string, projectId?: number) =>
    api.get<Task[]>(`${BASE}/calendar?start=${start}&end=${end}${projectId ? `&project_id=${projectId}` : ''}`),

  // ── Meu Dia — fatia 016 ───────────────────────────────────────────────────────
  // Ritual do dia: plano + pendências de ontem + sugestões + capacity.
  myDay: (date?: string) =>
    api.get<MyDayResponse>(`${BASE}/my-day${date ? `?date=${date}` : ''}`),
  // Marca/desmarca a tarefa no Meu Dia de uma data (ausente = hoje).
  addToMyDay: (id: number, date?: string) =>
    api.post<MutationResult>(`${BASE}/${id}/my-day`, date ? { date } : {}),
  removeFromMyDay: (id: number) =>
    api.del<MutationResult>(`${BASE}/${id}/my-day`),
  // Atalho do ritual de pendências: today | tomorrow | later.
  reschedule: (id: number, when: 'today' | 'tomorrow' | 'later') =>
    api.post<MutationResult>(`${BASE}/${id}/reschedule`, { when }),
  // Estimativa de duração (também via updateTask com duration_min).
  setEstimate: (id: number, duration_min: number) =>
    api.patch<MutationResult>(`${BASE}/${id}`, { duration_min }),
  // Bloco de tempo (time-blocking). end_at derivado se ausente.
  setTimeBlock: (id: number, body: { start_at: string; end_at?: string; duration_min?: number }) =>
    api.post<MutationResult>(`${BASE}/${id}/time-block`, body),
  clearTimeBlock: (id: number) =>
    api.del<MutationResult>(`${BASE}/${id}/time-block`),

  // ── Hábitos (Fase 4 / fatia 014) ────────────────────────────────────────────
  listHabits: () => api.get<Habit[]>(`${BASE}/habits`),
  getHabit: (id: number) => api.get<Habit>(`${BASE}/habits/${id}`),
  createHabit: (body: {
    name: string; freq_num?: number; freq_den?: number
    target_value?: number | null; unit?: string | null; icon?: string | null; color?: string | null
  }) => api.post<MutationResult>(`${BASE}/habits`, body),
  updateHabit: (id: number, body: Partial<{
    name: string; freq_num: number; freq_den: number
    target_value: number | null; unit: string | null; icon: string | null; color: string | null
    clear_target: boolean
  }>) => api.patch<MutationResult>(`${BASE}/habits/${id}`, body),
  // Excluir = arquivar (soft delete; o histórico fica).
  deleteHabit: (id: number) => api.del<MutationResult>(`${BASE}/habits/${id}`),
  // Check-in de um dia (date vazio = hoje; value para mensurável). Devolve a força recalculada.
  checkin: (id: number, body: { date?: string; value?: number | null } = {}) =>
    api.post<MutationResult>(`${BASE}/habits/${id}/checkin`, body),
  removeCheckin: (id: number, date?: string) =>
    api.del<MutationResult>(`${BASE}/habits/${id}/checkin${date ? `?date=${date}` : ''}`),
  // Histórico anual (esparso) para o heatmap.
  habitHistory: (id: number, year: number) =>
    api.get<HabitHeatDay[]>(`${BASE}/habits/${id}/history?year=${year}`),

  // ── Calendar Hub — fatia 019 ──────────────────────────────────────────────
  // Fontes registradas no hub (Kaguya, Nami, Frieren, Violet, Akane, gcal)
  // Backend retorna lista direta (não envolvida em { sources: [...] })
  calendarSources: () =>
    api.get<Calendar[]>(`${BASE}/calendar/sources`),

  // Agregação fan-out: itens de todas as fontes visíveis num intervalo
  calendarAggregate: (start: string, end: string, sources?: string[]) => {
    const params = new URLSearchParams({ start, end })
    if (sources?.length) params.set('sources', sources.join(','))
    return api.get<AggregateResponse>(`${BASE}/calendar/aggregate?${params}`)
  },

  // Preferências de visibilidade + cor por calendário
  // Backend retorna lista direta (não envolvida em { prefs: [...] })
  calendarPrefs: () =>
    api.get<CalendarPref[]>(`${BASE}/calendar/prefs`),
  setCalendarPref: (calId: string, patch: Partial<CalendarPref>) =>
    api.patch<MutationResult>(`${BASE}/calendar/prefs/${encodeURIComponent(calId)}`, patch),

  // Calendários reais do Google (excluindo espelho Kaguya e TickTick).
  // Backend retorna lista direta (não envolvida em { calendars: [...] }).
  calendarCalendars: () =>
    api.get<Calendar[]>(`${BASE}/calendar/calendars`),

  // Eventos da Agenda pessoal do Google no intervalo.
  // Backend retorna lista direta de eventos (não envolvida em { events: [...] }).
  // Cada item tem campos: id, summary, start, end, description, location, calendar_id, calendar_name.
  calendarEvents: (start: string, end: string) =>
    api.get<Array<{
      id: string; summary: string; start: string; end: string
      description: string; location: string; attendees: string[]
      link: string; calendar_id: string; calendar_name: string
    }>>(`${BASE}/calendar/events?start=${start}&end=${end}`),

  // CRUD de eventos da Agenda pessoal (só cal="gcal")
  createCalendarEvent: (body: Partial<CalEvent>) =>
    api.post<MutationResult>(`${BASE}/calendar/events`, body),
  updateCalendarEvent: (id: string, body: Partial<CalEvent>) =>
    api.patch<MutationResult>(`${BASE}/calendar/events/${id}`, body),
  deleteCalendarEvent: (id: string) =>
    api.del<MutationResult>(`${BASE}/calendar/events/${id}`),
}

export type { MutationResult }

// Paleta de 10 cores OKLCH para recolorir calendários (usada em CalendarsAside e ContextMenu)
export const CAL_SWATCHES = [
  'oklch(0.70 0.17 52)',    // laranja dourado
  'oklch(0.70 0.18 15)',    // vermelho-rosado
  'oklch(0.68 0.18 330)',   // magenta
  'oklch(0.62 0.18 290)',   // roxo
  'oklch(0.65 0.20 250)',   // azul médio
  'oklch(0.65 0.18 210)',   // azul-celeste
  'oklch(0.72 0.10 184)',   // verde-azulado
  'oklch(0.70 0.14 158)',   // verde
  'oklch(0.72 0.12 90)',    // amarelo-lima
  'oklch(0.58 0.04 0)',     // cinza
] as const
