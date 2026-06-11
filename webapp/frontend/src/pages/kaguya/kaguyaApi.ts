// Client tipado do domínio Kaguya — embrulha /api/tasks/* sobre lib/api.ts.
// Componentes NUNCA fazem fetch direto: usam este objeto (cookie de sessão e
// tratamento de erro já resolvidos por lib/api.ts).

import { api } from '../../lib/api'
import type { Sidebar, Task, Column, TodayResponse } from './types'

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
  }) => api.post<MutationResult>(BASE, body),

  updateTask: (id: number, body: Partial<{
    title: string; description: string | null; priority: number; type: string
    due_date: string | null; due_time: string | null; project_id: number; column_id: number | null
  }>) => api.patch<MutationResult>(`${BASE}/${id}`, body),

  complete: (id: number, cascade = false) =>
    api.post<MutationResult>(`${BASE}/${id}/complete`, { cascade }),
  reopen: (id: number) => api.post<MutationResult>(`${BASE}/${id}/reopen`, {}),
  reorder: (id: number, body: { after_id?: number; before_id?: number }) =>
    api.post<MutationResult>(`${BASE}/${id}/position`, body),
  remove: (id: number) => api.del<MutationResult>(`${BASE}/${id}`),
  restore: (id: number) => api.post<MutationResult>(`${BASE}/${id}/restore`, {}),
}

export type { MutationResult }
