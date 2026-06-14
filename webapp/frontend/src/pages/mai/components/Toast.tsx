// Toast — notificação flutuante que aparece por 2.5s após ações.
// Animação: toast-in definida no mai.css.

import { useEffect } from 'react'
import { IconCheck } from './MaiIcons'

interface Props {
  message: string
  // Callback chamado após 2.8s para que o pai limpe o estado
  onDismiss?: () => void
}

/** Toast de confirmação — renderizado pela MaiShell quando toast !== null. */
export function Toast({ message, onDismiss }: Props) {
  // Auto-dismiss: chama onDismiss após 2800ms para que o shell limpe o estado
  useEffect(() => {
    if (!onDismiss) return
    const t = setTimeout(onDismiss, 2800)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  return (
    <div className="mai-toast">
      <IconCheck />
      {message}
    </div>
  )
}
