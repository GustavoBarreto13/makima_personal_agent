// Toast de confirmação flutuante — porte do Toast do design handoff
// (akane/logmodal.jsx): pill escura com ícone de check, some sozinha
// (o timer de 2.5s vive no AkaneShell, que controla a mensagem).

import { Icon } from '../ui/Icon'

interface ToastProps {
  /** Texto da confirmação (ex.: "Filme logado no diário"). */
  message: string
}

/** Exibir a confirmação flutuante na base da tela. */
export function Toast({ message }: ToastProps) {
  return (
    // .toast tem position:fixed, animação toast-in e o visual pill no akane.css
    <div className="ak-toast" role="status" aria-live="polite">
      <Icon name="check" /> {message}
    </div>
  )
}
