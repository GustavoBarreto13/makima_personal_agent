// Alternar Lista ↔ Quadro ↔ Matriz (Eisenhower): o mesmo controle, no mesmo lugar (topo, à esquerda), nas telas de lista e de quadro, tanto de uma
// lista quanto de um grupo. Uma lista sem quadro oferece "Criar quadro" no lugar de "Quadro".

import { SegmentedControl } from '../../../design'
import { useKaguya } from '../context'

type Side = 'list' | 'board' | 'matrix'

export function ViewSwitch({ side, kind, id, hasBoard = true }: { side: Side; kind: 'list' | 'group'; id: number; hasBoard?: boolean }) {
  const k = useKaguya()
  const go = (to: Side) => {
    if (to === side) return
    if (kind === 'list') k.goto({ view: to === 'board' ? 'kanban' : to === 'matrix' ? 'matrix' : 'list', id })
    else k.goto({ view: to === 'board' ? 'group' : to === 'matrix' ? 'group-matrix' : 'group-list', id })
  }
  return (
    <SegmentedControl<Side>
      label="Ver como"
      className="kn-viewswitch"
      value={side}
      onChange={go}
      options={[{ value: 'list', label: 'Lista', icon: 'list' }, { value: 'board', label: hasBoard ? 'Quadro' : 'Criar quadro', icon: 'kanban' }, { value: 'matrix', label: 'Matriz', icon: 'grid' }]}
    />
  )
}
