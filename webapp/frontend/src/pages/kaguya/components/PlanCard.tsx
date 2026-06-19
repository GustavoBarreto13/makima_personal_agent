// PlanCard — card de tarefa no plano do dia (e nas sugestões).
// Versão "plano": arrastável para a timeline (via @dnd-kit, gerenciado pelo TodayScreen).
// Versão "sugestão": botão "+ Puxar" (não-arrastável).
//
// Por que @dnd-kit aqui?
// Antes, o card usava `draggable` nativo do HTML5 e dependia de `onDragStart`
// passado via props. O TodayScreen não passava esse callback, então o arrasto
// simplesmente não funcionava. Com @dnd-kit, o id da tarefa vai via `active.id`
// (context do DndContext do TodayScreen), sem precisar de prop extra.

import { useDraggable } from '@dnd-kit/core'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

interface PlanCardProps {
  task: Task
  isSuggestion?: boolean           // true = sem drag, com botão "+ Puxar"
  // Se este card está sendo arrastado no momento (slot original fica semi-transparente).
  isBeingDragged?: boolean
  onChanged: () => void            // recarrega a tela
  onOpen: (task: Task) => void     // abre o TaskModal
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function PlanCard({ task, isSuggestion, isBeingDragged, onChanged, onOpen, toast }: PlanCardProps) {
  // useDraggable: torna este card uma fonte de arraste do @dnd-kit.
  //   id         — identificador que aparece em active.id no onDragEnd do TodayScreen.
  //   attributes — aria-* de acessibilidade.
  //   listeners  — pointerdown etc. que iniciam o drag (ativa após 5px de movimento).
  //   setNodeRef — diz ao dnd-kit qual elemento DOM é este card.
  // disabled: sugestões NÃO são arrastáveis (o botão "+ Puxar" é o mecanismo delas).
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: !!isSuggestion,
  })

  const pull = async () => {
    try {
      await kaguyaApi.addToMyDay(task.id)
      toast('Adicionada ao Meu Dia.')
      onChanged()
    } catch {
      toast('Não foi possível adicionar.', 'err')
    }
  }

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (task.completed_at) {
        await kaguyaApi.reopen(task.id)
      } else {
        const r = await kaguyaApi.complete(task.id)
        if (r.needs_cascade) {
          if (!window.confirm(`Concluir ${r.open_subtasks} subtarefa(s) também?`)) return
          await kaguyaApi.complete(task.id, true)
        }
      }
      onChanged()
    } catch {
      toast('Não foi possível atualizar.', 'err')
    }
  }

  // Ícone de tipo (event / birthday / task padrão).
  const typeGlyph = task.type === 'event' ? '📅' : task.type === 'birthday' ? '🎂' : ''

  return (
    <div
      // setNodeRef: registra este elemento no dnd-kit como a âncora do drag.
      ref={setNodeRef}
      className={`kg-plan-card${isSuggestion ? ' no-drag' : ''}`}
      data-prio={task.priority}
      // Slot original fica semi-transparente enquanto o card segue o cursor.
      style={{ opacity: isBeingDragged ? 0.35 : 1 }}
      // onClick abre o TaskModal (< 5px de movimento = clique, não arraste).
      onClick={() => onOpen(task)}
      title={task.title}
      // attributes e listeners são espalhados no elemento raiz:
      //   - Sugestões: listeners desativados (disabled=true no useDraggable).
      //   - Plano: listeners ativos, iniciam o drag após 5px de movimento.
      {...attributes}
      {...listeners}
    >
      {/* Checkbox — stopPropagation para não abrir o TaskModal ao clicar */}
      <button
        onClick={toggle}
        style={{
          width: 17, height: 17, borderRadius: '50%', border: '2px solid var(--line)',
          background: task.completed_at ? 'var(--done)' : 'none',
          cursor: 'pointer', flexShrink: 0, marginTop: 2,
        }}
        aria-label="Concluir"
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Título */}
        <div className="kg-plan-card-title">
          {typeGlyph && <span style={{ marginRight: 4 }}>{typeGlyph}</span>}
          {task.title}
        </div>

        {/* Chips: bloco de tempo + projeto */}
        <div className="kg-plan-card-chips">
          {task.start_at && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--kg-deep)' }}>
              {fmtTime(task.start_at)}
              {task.end_at ? `–${fmtTime(task.end_at)}` : ''}
            </span>
          )}
          {task.project_name && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
              {task.project_name}
            </span>
          )}
          {isSuggestion && task.due_date && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--p-high)' }}>
              vence {new Date(task.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* Estimativa à direita */}
      {task.duration_min && !isSuggestion && (
        <span className="kg-plan-card-est">{fmtMin(task.duration_min)}</span>
      )}

      {/* Botão "+ Puxar" nas sugestões (adiciona ao plano do dia) */}
      {isSuggestion && (
        <button className="kg-plan-pull-btn" onClick={(e) => { e.stopPropagation(); pull() }}>
          + Puxar
        </button>
      )}
    </div>
  )
}
