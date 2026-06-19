// SortableTaskRow — wrapper de drag-and-drop para o TaskRow na tela de Lista.
//
// Funciona como o SortableTaskCard (usado no Kanban), mas envolve o TaskRow
// (linha com checkbox, título editável inline e chips) em vez do TaskCard (card glass).
//
// O @dnd-kit/sortable cuida da animação: quando um item é arrastado, os outros
// deslizam suavemente para abrir espaço, sem re-render do componente pai.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskRow } from './TaskRow'
import type { Task } from '../types'

interface SortableTaskRowProps {
  task: Task
  // Índice numérico para o sistema de foco por teclado (Space/X/Enter/↑↓).
  // Passado de volta no onClick para que o ListScreen atualize focusIdx.
  focusIdx: number
  // Se este índice está focado no momento (para a classe visual de foco).
  isFocused: boolean
  // Callback para atualizar o focusIdx no ListScreen ao clicar nesta linha.
  onFocus: (idx: number) => void
  // Callbacks repassados ao TaskRow.
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  onRename: (task: Task, title: string) => void
  // Quando ESTE item está sendo arrastado, o slot original fica semi-transparente
  // para indicar que ele está "no cursor" via DragOverlay.
  isBeingDragged: boolean
}

export function SortableTaskRow({
  task,
  focusIdx,
  isFocused,
  onFocus,
  onToggle,
  onOpen,
  onRename,
  isBeingDragged,
}: SortableTaskRowProps) {
  // useSortable fornece os mesmos recursos do useDraggable +
  // animação de deslize dos vizinhos (SortableContext cuida disso).
  //   attributes — aria-* para acessibilidade
  //   listeners   — event handlers que iniciam o drag (pointerdown, etc.)
  //   setNodeRef  — diz ao dnd-kit qual elemento DOM representa este item
  //   transform   — deslocamento CSS enquanto o item desliza para abrir espaço
  //   transition  — animação de retorno à posição original
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
  })

  const style: React.CSSProperties = {
    // Converte o objeto de transform do dnd-kit em string CSS válida.
    transform: CSS.Transform.toString(transform),
    // Animação de "fechar o espaço" quando o drag termina.
    transition,
    // Slot original fica semi-transparente enquanto o card segue o cursor.
    opacity: isBeingDragged ? 0.35 : 1,
  }

  return (
    // O div externo recebe os atributos e listeners do dnd-kit (drag handle).
    // A classe de foco do teclado também fica aqui (mesmo comportamento de antes).
    <div
      ref={setNodeRef}
      style={style}
      className={isFocused ? 'kg-list-row--focused' : undefined}
      // Clique na linha (não no checkbox/rename): atualiza o foco pelo teclado.
      onClick={() => onFocus(focusIdx)}
      // Atributos de acessibilidade e listeners de drag do dnd-kit.
      {...attributes}
      {...listeners}
    >
      <TaskRow task={task} onToggle={onToggle} onOpen={onOpen} onRename={onRename} />
    </div>
  )
}
