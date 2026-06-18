// SortableTaskCard — wrapper de drag-and-drop para o TaskCard no Kanban.
// Usa @dnd-kit/sortable para animar a reordenação dentro de colunas:
// quando o card é arrastado, os outros cards deslizam suavemente para abrir
// espaço, sem causar re-renders desnecessários no board inteiro.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskCard } from './TaskCard'
import type { Task } from '../types'

interface SortableTaskCardProps {
  task: Task
  onOpen: (task: Task) => void
  // Quando este card está sendo arrastado, o slot original fica transparente
  // para indicar visualmente "este card está no cursor agora".
  isBeingDragged: boolean
  // Nome da lista (chip de projeto do card glass) + toggles de adornos da view ativa.
  projectName?: string
  showChips?: boolean
  showRing?: boolean
}

export function SortableTaskCard({ task, onOpen, isBeingDragged, projectName, showChips, showRing }: SortableTaskCardProps) {
  // useSortable fornece:
  //   attributes — aria-* para acessibilidade (role, tabIndex, etc.)
  //   listeners   — os event handlers do DnD (pointerdown, etc.) que iniciam o drag
  //   setNodeRef  — ref que diz ao dnd-kit qual elemento DOM é este card
  //   transform   — deslocamento CSS atual (muda enquanto o card desliza para abrir espaço)
  //   transition  — string CSS de animação (ex.: "transform 200ms ease")
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
  })

  const style: React.CSSProperties = {
    // CSS.Transform.toString converte o objeto {x, y, scaleX, scaleY} do dnd-kit
    // para a string CSS "translate3d(x, y, 0) scaleX(sx) scaleY(sy)".
    transform: CSS.Transform.toString(transform),
    // Animação de volta à posição quando outro card é solto.
    transition,
    // O slot original fica semi-transparente enquanto o card está sendo arrastado
    // (o card "real" segue o cursor via DragOverlay no KanbanScreen).
    opacity: isBeingDragged ? 0.35 : 1,
    // Garante que o cursor de arraste apareça em todo o wrapper (não só no TaskCard).
    cursor: isBeingDragged ? 'grabbing' : 'grab',
  }

  return (
    // O div externo recebe os atributos e listeners do dnd-kit.
    // O TaskCard interno é puramente visual (não tem draggable nem onDragStart).
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onOpen={onOpen} projectName={projectName} showChips={showChips} showRing={showRing} />
    </div>
  )
}
