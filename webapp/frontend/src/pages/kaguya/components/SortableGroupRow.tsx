// SortableGroupRow — linha de grupo arrastável na sidebar do Kaguya.
//
// Usa @dnd-kit/sortable para permitir reordenar grupos entre si.
// Os listeners do dnd-kit ficam EXCLUSIVAMENTE no grip (alça de 6 pontos),
// para que o botão-nome (abre o Kanban do grupo) e o botão ⚙ (editar/excluir
// grupo) continuem funcionando como cliques normais — sem acionar o arrasto.

import type React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Group, KaguyaView } from '../types'
import { Icon } from '../ui/Icons'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SortableGroupRowProps {
  // O grupo que esta linha representa
  group: Group
  // Se o board deste grupo está ativo no momento (para destacar o nome)
  isActive: boolean
  // Se o grupo está colapsado (lista de listas oculta)
  collapsed: boolean
  // Alterna o colapso individual deste grupo
  onToggleCollapse: (id: number) => void
  // Abre o board do grupo (clicar no nome)
  onNavigate: (view: KaguyaView, param?: number | null) => void
  // Abre o modal de renomear/excluir grupo
  onEditGroup: (group: Group) => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export function SortableGroupRow({
  group, isActive, collapsed, onToggleCollapse, onNavigate, onEditGroup,
}: SortableGroupRowProps) {

  // useSortable fornece ref, style e listeners para integrar com o @dnd-kit/core.
  // O id é prefixado com "group:" para distinguir de ids de listas (`proj:`)
  // dentro do mesmo DndContext — evita colisão quando um grupo e uma lista
  // têm o mesmo número de id.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group:${group.id}` })

  // CSS de transform/transition que o dnd-kit calcula durante o arrasto.
  // `isDragging` reduz a opacidade do slot original (o "fantasma" está no cursor).
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    // Wrapper: recebe o ref e o style do dnd-kit.
    // Os listeners NÃO vão aqui — ficam apenas no grip.
    <div ref={setNodeRef} style={style} className="kg-group-row">

      {/* Seta de colapso: fecha/abre a lista de listas do grupo.
          chevron = seta direita (grupo fechado), chevronDown = seta baixo (aberto). */}
      <button
        type="button"
        className="kg-group-caret"
        onClick={() => onToggleCollapse(group.id)}
        aria-label={collapsed ? 'Expandir grupo' : 'Recolher grupo'}
        title={collapsed ? 'Expandir' : 'Recolher'}
      >
        <Icon name={collapsed ? 'chevron' : 'chevronDown'} size={12} />
      </button>

      {/* Nome do grupo: clique abre o Kanban agregado do grupo.
          flex: 1 para o nome ocupar o espaço restante. */}
      <button
        type="button"
        className={`kg-group-label${isActive ? ' active' : ''}`}
        onClick={() => onNavigate('group', group.id)}
        title="Abrir Kanban do grupo"
      >
        {group.name}
      </button>

      {/* Alça de arrasto: ÚNICO ponto com os event listeners do dnd-kit.
          Visível no hover da linha via CSS (.kg-group-row:hover .kg-drag-grip).
          aria-* vêm do `attributes` (acessibilidade nativa do dnd-kit). */}
      <span
        className="kg-drag-grip"
        {...attributes}
        {...listeners}
        aria-label="Arrastar grupo"
        title="Arrastar para reordenar"
      >
        <Icon name="grip" size={14} />
      </span>

      {/* Botão ⚙: aparece no hover (CSS: .kg-group-row:hover .kg-group-edit).
          Chama o modal de renomear/excluir do grupo no shell. */}
      <button
        type="button"
        className="kg-group-edit"
        onClick={() => onEditGroup(group)}
        aria-label="Editar grupo"
        title="Editar grupo"
      >
        <Icon name="settings" size={12} />
      </button>
    </div>
  )
}
