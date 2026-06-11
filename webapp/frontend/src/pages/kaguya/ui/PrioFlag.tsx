// PrioFlag — a "marca de prioridade" (o lacre) à esquerda da tarefa.
// O estilo visual (traço/ponto/fundo) é controlado pelo atributo data-pmark
// no .kg-app (tweak), então aqui só pintamos com a cor da prioridade via classe.

// Nomes legíveis das 4 prioridades (para tooltips/acessibilidade).
export const PRIORITY_LABELS = ['Nenhuma', 'Baixa', 'Média', 'Alta'] as const

interface PrioFlagProps {
  priority: number   // 0..3
  overdue?: boolean  // vencida → trata visualmente como alta (lacre vermelho)
}

/** Marca de prioridade. A cor sai dos tokens --p-low/med/high via a classe kg-prio-N. */
export function PrioFlag({ priority, overdue = false }: PrioFlagProps) {
  // Vencida puxa para o vermelho-lacre independentemente da prioridade nominal.
  const level = overdue ? 3 : priority
  return (
    <span
      className={`kg-prio kg-prio-${level}`}
      title={`Prioridade: ${PRIORITY_LABELS[priority] ?? 'Nenhuma'}`}
      aria-label={`Prioridade ${PRIORITY_LABELS[priority] ?? 'Nenhuma'}`}
    />
  )
}
