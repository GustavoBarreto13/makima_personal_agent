// Barra "Adicionar tarefa" (topo das listas e do Meu Dia). O modal "Nova tarefa" completo está em NewTaskModal. A captura:
// o texto é lido ao vivo (@lista #etiqueta !prioridade data repetição duração), os chips mostram o que foi entendido
// e Enter cria. Nunca cria tarefa vazia; lista citada que não existe avisa em vez de cair calada na Inbox.

import { QuickCapture, toast } from '../../../design'
import type { CaptureResult } from '../../../design/core/capture'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { captureToTask, taskParser } from '../lib/quickAdd'
import { createTask } from '../lib/actions'

const LEGEND = [
  { kind: 'place' as const, sample: '@lista' }, { kind: 'tag' as const, sample: '#etiqueta' }, { kind: 'priority' as const, sample: '!alta' },
  { kind: 'date' as const, sample: 'amanhã 17h' }, { kind: 'recur' as const, sample: 'toda sexta' }, { kind: 'duration' as const, sample: '45min' },
]

interface Props {
  /** Lista onde cria quando o texto não cita nenhuma (a lista aberta; senão a Inbox). */
  projectId?: number
  /** Vencimento padrão (a tela "Hoje" cria para hoje). */
  due?: string
  /** Cria direto numa coluna do Kanban. */
  columnId?: number
  /** Hora e duração iniciais (vindas do calendário). */
  time?: string
  duration?: number
  /** Também coloca a tarefa no Meu Dia (a tela Meu Dia). */
  myDay?: boolean
  placeholder?: string
  /** Chamado com o id da tarefa criada. */
  onCreated?: (id: number) => void
}

/** Cria a tarefa a partir do que a captura entendeu. Devolve false (mantém o texto) se não havia título. */
export async function createFromCapture(
  r: CaptureResult, ctx: { projects: { id: number; name: string }[]; projectId?: number; columnId?: number; due?: string; time?: string; duration?: number; myDay?: boolean },
): Promise<number | false> {
  const out = captureToTask(r, { projects: ctx.projects, defaultProjectId: ctx.projectId, defaultDue: ctx.due, defaultTime: ctx.time, defaultDuration: ctx.duration })
  if (!out) { toast('Escreva o título da tarefa.', { tone: 'error' }); return false }
  if (out.unknownList) toast(`Não achei a lista “${out.unknownList}”. A tarefa foi para a lista atual.`)
  // Criada pelo “+ Adicionar tarefa” de uma coluna: só vale se a lista não foi trocada por um @lista no texto.
  if (ctx.columnId !== undefined && (out.body.project_id === undefined || out.body.project_id === ctx.projectId)) out.body.column_id = ctx.columnId
  try {
    const id = await createTask(out.body)
    if (ctx.myDay) await kaguyaApi.addToMyDay(id)
    return id
  } catch (e) {
    toast(e instanceof Error && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível criar a tarefa.', { tone: 'error' })
    return false
  }
}

export function QuickAddBar({ projectId, columnId, due, time, duration, myDay, placeholder = 'Adicionar tarefa — Enter para criar', onCreated }: Props) {
  const k = useKaguya()
  return (
    <div className="kn-add">
      <QuickCapture
        parser={taskParser}
        label="Adicionar tarefa"
        placeholder={placeholder}
        legend={LEGEND}
        today={k.today}
        onSubmit={(r) => {
          void createFromCapture(r, { projects: k.projects, projectId: projectId ?? k.inboxId, columnId, due, time, duration, myDay }).then((id) => {
            if (id === false) return
            k.reload()
            toast('Tarefa criada.', { tone: 'success' })
            onCreated?.(id)
          })
        }}
        onExpand={(r) => k.newTask({ projectId, columnId, due, time, duration, title: r.text })}
      />
    </div>
  )
}
