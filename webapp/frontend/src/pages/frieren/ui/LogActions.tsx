// Componente de ações para cada entrada do diário de leitura.
// Exibe dois botões discretos: "editar" (lápis) e "apagar" (lixeira).
// O apagar usa confirmação inline em dois passos para evitar exclusão acidental,
// espelhando o padrão já usado no delete do livro em BookDetail.tsx.

import { useState } from 'react'
import type { ActivityEntry } from '../types'
import { Icon } from './Icons'

// Props do componente LogActions
interface LogActionsProps {
  // Entrada do diário cujas ações serão aplicadas
  entry: ActivityEntry
  // Callback chamado quando o usuário clica em "editar" — abre o EditLogModal
  onEdit: (entry: ActivityEntry) => void
  // Callback chamado quando o usuário confirma o apagar — chama o backend e re-sincroniza
  onDelete: (entry: ActivityEntry) => Promise<void>
}

/**
 * Renderiza os botões de editar e apagar para uma entrada do diário de leitura.
 * O fluxo de apagar tem dois passos:
 *   1. Usuário clica na lixeira → aparecem os botões "Cancelar" e "Confirmar".
 *   2. Usuário confirma → onDelete é chamado e spinner aparece.
 */
export function LogActions({ entry, onEdit, onDelete }: LogActionsProps) {
  // Controla se estamos no passo de confirmação do apagar
  const [confirmando, setConfirmando] = useState(false)
  // Spinner durante a chamada assíncrona ao backend
  const [removendo, setRemovendo] = useState(false)

  // ── Passo de confirmação ────────────────────────────────────────────────────
  if (confirmando) {
    return (
      <div className="log-actions-confirm">
        {/* Pergunta de confirmação — não exibe o ID, só "Apagar este registro?" */}
        <span className="log-actions-confirm-text">Apagar?</span>

        {/* Botão cancelar — volta ao estado normal sem fazer nada */}
        <button
          className="log-action-btn"
          onClick={() => setConfirmando(false)}
          disabled={removendo}
          title="Cancelar"
        >
          {/* Usa o ícone X já existente nos ícones do projeto */}
          <Icon name="x" />
        </button>

        {/* Botão confirmar — chama onDelete e exibe spinner enquanto aguarda */}
        <button
          className="log-action-btn log-action-btn--danger"
          disabled={removendo}
          title="Confirmar exclusão"
          onClick={async () => {
            setRemovendo(true)
            try {
              // Chama o handler do shell que remove no backend e re-sincroniza a UI
              await onDelete(entry)
            } finally {
              // Mesmo em caso de erro, resetamos o estado de confirmação
              setRemovendo(false)
              setConfirmando(false)
            }
          }}
        >
          {/* Mostra texto durante a operação para dar feedback visual */}
          {removendo ? '…' : <Icon name="check" />}
        </button>
      </div>
    )
  }

  // ── Estado normal: botões de editar e apagar ────────────────────────────────
  return (
    <div className="log-actions">
      {/* Botão de editar — abre o EditLogModal com os dados da entrada pré-preenchidos */}
      <button
        className="log-action-btn"
        onClick={() => onEdit(entry)}
        title="Editar registro"
      >
        <Icon name="pencil" />
      </button>

      {/* Botão de apagar — inicia o fluxo de confirmação em dois passos */}
      <button
        className="log-action-btn log-action-btn--danger"
        onClick={() => setConfirmando(true)}
        title="Apagar registro"
      >
        <Icon name="trash" />
      </button>
    </div>
  )
}
