// Notificação temporária exibida após ações no catálogo (log, add, sync).
// Aparece na borda inferior da tela e desaparece automaticamente em 2.8s.
// Animação: mr-toast-in (slide-up + fade) definida em marin.css.

import { useEffect } from 'react'

interface ToastProps {
  // Texto a exibir no toast
  message: string
  // Callback chamado após o timeout (para o pai resetar o estado)
  onDismiss?: () => void
}

/**
 * Toast de feedback com auto-dismiss.
 * O pai passa onDismiss para ser notificado quando o toast expira (2.8s).
 */
export function Toast({ message, onDismiss }: ToastProps) {
  // Auto-dismiss após 2.8 segundos
  useEffect(() => {
    if (!onDismiss) return
    const t = setTimeout(onDismiss, 2800)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  return (
    // mr-toast: posição fixa, z-index alto, animação de entrada
    <div className="mr-toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
