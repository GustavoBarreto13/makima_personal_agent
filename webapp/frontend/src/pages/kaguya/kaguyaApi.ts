// Client tipado do domínio Kaguya — embrulha /api/tasks/* sobre lib/api.ts.
// Componentes NUNCA fazem fetch direto: usam este objeto (cookie de sessão e
// tratamento de erro já resolvidos por lib/api.ts).

import { api } from '../../lib/api'
import type { Sidebar, Task, Column, Tag, TodayResponse, RecurrenceMode, Filter, FilterRules, FilterTasksResponse } from './types'

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

  // ── Calendário (consulta por intervalo) — fatia 013 / P3 ────────────────────
  // Tarefas datadas + ocorrências virtuais das recorrentes na janela [start, end].
  calendar: (start: string, end: string, projectId?: number) =>
    api.get<Task[]>(`${BASE}/calendar?start=${start}&end=${end}${projectId ? `&project_id=${projectId}` : ''}`),
}

export type { MutationResult }
