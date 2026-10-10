// O desenho do formulário de tarefa, igual no “Nova tarefa” e no “Editar tarefa” centralizado: duas colunas — à esquerda os
// campos (na mesma ordem), à direita as notas em Markdown e as subtarefas. No painel lateral (ou no celular) vira uma coluna só.

import type { ReactNode } from 'react'

export function TaskFormLayout({ fields, side, wide = true }: { fields: ReactNode; side: ReactNode; wide?: boolean }) {
  return (
    <div className={`kn-tf${wide ? ' kn-tf-wide' : ''}`}>
      <div className="kn-tf-fields">{fields}</div>
      <div className="kn-tf-side">{side}</div>
    </div>
  )
}
