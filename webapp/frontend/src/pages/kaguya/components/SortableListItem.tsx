// SortableListItem — item de lista arrastável na sidebar do Kaguya.
//
// Envolve o botão de navegação de uma lista (emoji + nome + badge de abertas)
// com os recursos de arrasto do @dnd-kit/sortable. O grip (alça) fica oculto
// por padrão e aparece no hover da linha — padrão igual ao botão ⚙ dos grupos.
// O botão de navegação em si continua funcionando normalmente (clique normal).

import type React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Project, KaguyaView } from '../types'
import { Icon } from '../ui/Icons'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SortableListItemProps {
  // A lista (projeto) que este item representa
  project: Project
  // Se esta lista está ativa no momento (para destacar o item)
  isActive: boolean
  // Callback de navegação chamado ao clicar no botão da lista
  onNavigate: (view: KaguyaView, param?: number | null) => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function SortableListItem({ project, isActive, onNavigate }: SortableListItemProps) {

  // O id é prefixado com "proj:" para distinguir de ids de grupos (`group:`)
  // dentro do mesmo DndContext — evita colisão quando os números coincidem.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `proj:${project.id}` })

  // Style com a transformação do dnd-kit durante o arrasto.
  // `isDragging` torna o slot original semi-transparente enquanto o item
  // segue o cursor.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    // Wrapper flex: grip à esquerda (oculto por padrão) + botão de lista.
    // kg-nav-item-row cuida do hover que revela o grip via CSS.
    <div ref={setNodeRef} style={style} className="kg-nav-item-row">

      {/* Alça de arrasto: ÚNICO ponto com os listeners do dnd-kit.
          Oculta por padrão; aparece no hover da linha (.kg-nav-item-row:hover .kg-drag-grip).
          O botão de navegação ao lado continua recebendo cliques normalmente. */}
      <span
        className="kg-drag-grip"
        {...attributes}
        {...listeners}
        aria-label="Arrastar lista"
        title="Arrastar para reordenar"
      >
        <Icon name="grip" size={13} />
      </span>

      {/* Botão de navegação da lista — funciona como clique normal, sem trigger de drag */}
      <button
        type="button"
        className={`kg-nav-item${isActive ? ' active' : ''}`}
        onClick={() => onNavigate('list', project.id)}
      >
        <span className="kg-nav-emoji">{project.icon ?? '•'}</span>
        <span>{project.name}</span>
        {project.open_count > 0 && <span className="kg-nav-count">{project.open_count}</span>}
      </button>
    </div>
  )
}
