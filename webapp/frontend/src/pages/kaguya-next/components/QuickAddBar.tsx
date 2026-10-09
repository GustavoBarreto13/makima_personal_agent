// Barra "Adicionar tarefa" (topo das listas e do Meu Dia) e o modal "Nova tarefa". Os dois usam a mesma captura:
// o texto é lido ao vivo (@lista #etiqueta !prioridade data repetição duração), os chips mostram o que foi entendido
// e Enter cria. Nunca cria tarefa vazia; lista citada que não existe avisa em vez de cair calada na Inbox.

import { useState } from 'react'
import { Button, Modal, QuickCapture, Select, Field, toast } from '../../../design'
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
  /** Também coloca a tarefa no Meu Dia (a tela Meu Dia). */
  myDay?: boolean
  placeholder?: string
  /** Chamado com o id da tarefa criada. */
  onCreated?: (id: number) => void
}

/** Cria a tarefa a partir do que a captura entendeu. Devolve false (mantém o texto) se não havia título. */
export async function createFromCapture(
  r: CaptureResult, ctx: { projects: { id: number; name: string }[]; projectId?: number; due?: string; myDay?: boolean },
): Promise<number | false> {
  const out = captureToTask(r, { projects: ctx.projects, defaultProjectId: ctx.projectId, defaultDue: ctx.due })
  if (!out) { toast('Escreva o título da tarefa.', { tone: 'error' }); return false }
  if (out.unknownList) toast(`Não achei a lista “${out.unknownList}”. A tarefa foi para a lista atual.`)
  try {
    const id = await createTask(out.body)
    if (ctx.myDay) await kaguyaApi.addToMyDay(id)
    return id
  } catch (e) {
    toast(e instanceof Error && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível criar a tarefa.', { tone: 'error' })
    return false
  }
}

export function QuickAddBar({ projectId, due, myDay, placeholder = 'Adicionar tarefa — Enter para criar', onCreated }: Props) {
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
          void createFromCapture(r, { projects: k.projects, projectId: projectId ?? k.inboxId, due, myDay }).then((id) => {
            if (id === false) return
            k.reload()
            toast('Tarefa criada.', { tone: 'success' })
            onCreated?.(id)
          })
        }}
        onExpand={(r) => k.newTask({ projectId, due, title: r.fields.title })}
      />
    </div>
  )
}

/** Modal "Nova tarefa": a mesma captura, mais a escolha explícita da lista. */
export function NewTaskModal({ defaults, onClose }: { defaults?: { projectId?: number; due?: string; title?: string }; onClose: () => void }) {
  const k = useKaguya()
  const [projectId, setProjectId] = useState<number | undefined>(defaults?.projectId ?? k.inboxId)
  return (
    <Modal title="Nova tarefa" size="md" onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <Field label="Lista">{(c) => (
        <Select {...c} value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))}>
          {k.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}</Field>
      <QuickAddBar
        projectId={projectId}
        due={defaults?.due}
        placeholder={defaults?.title ? defaults.title : 'Ex.: Enviar relatório @trabalho !alta amanhã 17h'}
        onCreated={(id) => { onClose(); k.openTask(id) }}
      />
    </Modal>
  )
}
