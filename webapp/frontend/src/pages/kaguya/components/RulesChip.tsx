// Aviso “Regras · N” ao lado do botão de Filtros quando há regras avançadas (E/OU) em vigor: abre o modal e deixa limpar na hora.

import { Chip, IconButton } from '../../../design'
import type { FilterRules } from '../types'

export function RulesChip({ rules, onOpen, onClear }: { rules: FilterRules | null; onOpen: () => void; onClear: () => void }) {
  if (!rules) return null
  return (
    <>
      <Chip on icon="filter" onClick={onOpen}>Regras · {rules.conditions.length}</Chip>
      <IconButton icon="close" size={14} label="Limpar as regras avançadas" onClick={onClear} />
    </>
  )
}
