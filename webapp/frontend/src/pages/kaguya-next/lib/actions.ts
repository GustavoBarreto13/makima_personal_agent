// Ações sobre tarefas compartilhadas pelas telas: concluir/reabrir, excluir, mover, Meu Dia, prioridade, data.
// Tudo passa pelo `bulk` do backend (uma transação) e devolve o "Desfazer" do aviso — inclusive para recorrentes,
// onde desfazer a conclusão também remove a ocorrência que ela gerou (o botão antigo de reabrir duplicava a série).

import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { kaguyaApi } from '../api'
import type { BulkAction, BulkUndo, Task } from '../types'
import { flattenTree } from './taskView'

export interface ActionDeps {
  /** Recarrega as telas depois de gravar. */
  reload: () => void
}

/** Subtarefas abertas (qualquer nível) de uma tarefa — pedem confirmação antes de concluir em cascata. */
export const openSubtasks = (task: Task): number => flattenTree(task.subtasks ?? []).filter((t) => !t.completed_at).length

/** Mensagem de erro amigável a partir de qualquer coisa que o `api` lance. */
const reason = (e: unknown): string => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível salvar. Tente de novo.')

/**
 * Aplica uma ação em massa e mostra o aviso com "Desfazer".
 * @returns true se gravou.
 */
export async function runBulk(
  deps: ActionDeps, ids: number[], action: BulkAction, value: unknown, message: string,
): Promise<boolean> {
  try {
    const r = await kaguyaApi.bulk(ids, action, value)
    deps.reload()
    const undo: BulkUndo = r.undo
    toast(message, {
      tone: 'success',
      undo: () => { kaguyaApi.bulkUndo(undo).then(deps.reload).catch(() => toast('Não foi possível desfazer. Confira a tarefa.', { tone: 'error' })) },
    })
    return true
  } catch (e) {
    toast(reason(e), { tone: 'error' })
    return false
  }
}

/** Conclui (ou reabre) uma tarefa. Com subtarefas abertas, confirma antes de concluir tudo. */
export async function toggleComplete(deps: ActionDeps, task: Task): Promise<void> {
  if (task.completed_at) {
    await runBulk(deps, [task.id], 'reopen', null, `“${task.title}” reaberta.`)
    return
  }
  const open = openSubtasks(task)
  if (open > 0) {
    const ok = await confirm({
      title: 'Concluir a tarefa e as subtarefas?',
      body: `“${task.title}” tem ${open} subtarefa${open > 1 ? 's' : ''} aberta${open > 1 ? 's' : ''}. Todas serão concluídas.`,
      confirmLabel: 'Concluir tudo',
    })
    if (!ok) return
  }
  const recurring = !!task.recurrence?.active
  await runBulk(deps, [task.id], 'complete', null, recurring ? `“${task.title}” concluída — a próxima já está agendada.` : `“${task.title}” concluída.`)
}

/** Exclui (vai para a lixeira, com Desfazer). Confirma antes — a regra do padrão para exclusões. */
export async function deleteTasks(deps: ActionDeps, tasks: Task[]): Promise<boolean> {
  if (!tasks.length) return false
  const many = tasks.length > 1
  const withKids = tasks.reduce((n, t) => n + flattenTree(t.subtasks ?? []).length, 0)
  const ok = await confirm({
    title: many ? `Excluir ${tasks.length} tarefas?` : `Excluir “${tasks[0].title}”?`,
    body: withKids ? `As ${withKids} subtarefas também vão para a lixeira. Dá para restaurar de lá.` : 'Ela vai para a lixeira — dá para restaurar de lá.',
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!ok) return false
  return runBulk(deps, tasks.map((t) => t.id), 'delete', null, many ? `${tasks.length} tarefas excluídas.` : `“${tasks[0].title}” excluída.`)
}

export const setPriority = (deps: ActionDeps, ids: number[], priority: number) =>
  runBulk(deps, ids, 'set_priority', priority, ids.length > 1 ? 'Prioridade alterada.' : 'Prioridade alterada.')

export const setDueDate = (deps: ActionDeps, ids: number[], due: string | null) =>
  runBulk(deps, ids, 'set_due_date', due, due ? 'Data alterada.' : 'Data removida.')

export const moveToProject = (deps: ActionDeps, ids: number[], projectId: number, projectName: string) =>
  runBulk(deps, ids, 'set_project', projectId, ids.length > 1 ? `${ids.length} tarefas movidas para ${projectName}.` : `Movida para ${projectName}.`)

export const addToMyDay = (deps: ActionDeps, ids: number[], day?: string) =>
  runBulk(deps, ids, 'add_to_my_day', day ?? null, 'Adicionada ao Meu Dia.')

export const removeFromMyDay = (deps: ActionDeps, ids: number[]) =>
  runBulk(deps, ids, 'remove_from_my_day', null, 'Retirada do Meu Dia.')

export const addTag = (deps: ActionDeps, ids: number[], name: string) =>
  runBulk(deps, ids, 'add_tag', name, `Etiqueta #${name} aplicada.`)

/** Duplica a tarefa (com subtarefas) e avisa. */
export async function duplicate(deps: ActionDeps, task: Task): Promise<number | undefined> {
  try {
    const r = await kaguyaApi.duplicateTask(task.id)
    deps.reload()
    toast(`“${task.title}” duplicada.`, { tone: 'success' })
    return r.id
  } catch (e) {
    toast(reason(e), { tone: 'error' })
    return undefined
  }
}

/** Cria a tarefa e grava a estimativa em seguida (a API de criação não recebe `duration_min`). Devolve o id. */
export async function createTask(body: Parameters<typeof kaguyaApi.createTask>[0] & { duration_min?: number }): Promise<number> {
  const { duration_min, ...payload } = body
  const r = await kaguyaApi.createTask(payload)
  if (r.id && duration_min) await kaguyaApi.updateTask(r.id, { duration_min })
  return r.id as number
}
