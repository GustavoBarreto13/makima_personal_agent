// Toast pill da seção Nami — aparece na base da tela após ações do usuário.
// Posicionamento, animação e duração (2600 ms) controlados pelo NamiShell pai.

import { Icon } from './icons'

interface ToastProps {
  /** Mensagem a exibir; string vazia = não renderiza */
  message: string
  /** Se true, exibe em vermelho (erro) */
  error?: boolean
}

/**
 * Notificação temporária estilizada conforme design handoff.
 * Usa as classes .toast / .toast-host definidas em nami.css.
 */
export function Toast({ message, error = false }: ToastProps) {
  if (!message) return null

  return (
    // .toast-host: posicionamento fixed no canto inferior direito
    <div className="toast-host">
      <div className={`toast${error ? ' error' : ''}`}>
        {/* Ícone de check (ou x em caso de erro) */}
        <Icon name={error ? 'x' : 'check'} size={15} />
        {message}
      </div>
    </div>
  )
}
