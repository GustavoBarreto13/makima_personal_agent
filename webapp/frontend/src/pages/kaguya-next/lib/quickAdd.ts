// Captura rápida de tarefas: o parser do DS (tokens pt-BR) e o mapeamento do que foi entendido para o corpo da API.
//   @lista   #etiqueta   !alta|!média|!baixa   hoje · amanhã · sexta · 12/09 · 17h   todo dia 5 · toda sexta   45min
// Puro (sem React): a tela só liga o campo a estas funções.

import { createCaptureParser, type CaptureResult } from '../../../design/core/capture'
import type { Project } from '../types'

export const taskParser = createCaptureParser({ rules: ['place', 'tag', 'priority', 'date', 'recur', 'duration'], dateDirection: 'future' })

export interface NewTaskBody {
  title: string
  project_id?: number
  /** Coluna do Kanban (a lista é a do `project_id`). */
  column_id?: number
  priority?: number
  due_date?: string
  due_time?: string
  tags?: string[]
  recurrence?: { rrule: string; mode: 'fixed' | 'after_completion' }
  /** Estimativa em minutos — a API de criação não a aceita; quem chama grava com `updateTask` depois. */
  duration_min?: number
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** A lista citada em `@lista`: nome igual (sem acento/caixa) ou, na falta, o único que COMEÇA com o texto. */
export function resolveProject(token: string | null, projects: Pick<Project, 'id' | 'name'>[]): number | undefined {
  if (!token) return undefined
  const n = norm(token)
  const exact = projects.find((p) => norm(p.name) === n)
  if (exact) return exact.id
  const starts = projects.filter((p) => norm(p.name).startsWith(n))
  return starts.length === 1 ? starts[0].id : undefined
}

export interface CaptureContext {
  projects: Pick<Project, 'id' | 'name'>[]
  /** Lista onde cria quando o texto não cita nenhuma (a lista aberta; senão a Inbox). */
  defaultProjectId?: number
  /** Data padrão quando o texto não cita nenhuma (ex.: a tela "Hoje" cria para hoje). */
  defaultDue?: string
  /** Hora e duração iniciais (criar arrastando um horário no calendário). Valem só quando o texto não traz as suas. */
  defaultTime?: string
  defaultDuration?: number
}

/** Corpo da API a partir do que o parser entendeu; `null` se não sobrou título. */
export function captureToTask(r: CaptureResult, ctx: CaptureContext): { body: NewTaskBody; unknownList: string | null } | null {
  const f = r.fields
  const title = f.title.trim()
  if (!title) return null
  const projectId = resolveProject(f.place, ctx.projects) ?? ctx.defaultProjectId
  const body: NewTaskBody = { title }
  if (projectId !== undefined) body.project_id = projectId
  if (f.priority) body.priority = f.priority
  const due = f.dueDate ?? ctx.defaultDue
  if (due) body.due_date = due
  const time = f.dueTime ?? (f.dueDate ? undefined : ctx.defaultTime)
  if (time && due) body.due_time = time
  if (f.tags.length) body.tags = f.tags
  if (f.recur) body.recurrence = { rrule: f.recur.rule, mode: f.recur.mode }
  const duration = f.duration && f.duration > 0 ? f.duration : ctx.defaultDuration
  if (duration && duration > 0) body.duration_min = Math.round(duration)
  // @lista digitada que não existe: a tarefa cai na lista padrão, mas a tela avisa em vez de calar.
  const unknownList = f.place && resolveProject(f.place, ctx.projects) === undefined ? f.place : null
  return { body, unknownList }
}
