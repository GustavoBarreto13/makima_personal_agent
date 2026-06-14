// Toast — notificação flutuante que aparece por 2.5s após ações.
// Animação: toast-in definida no mai.css.

import { IconCheck } from './MaiIcons'

interface Props {
  message: string
}

/** Toast de confirmação — renderizado pela MaiShell quando toast !== null. */
export function Toast({ message }: Props) {
  return (
    <div className="mai-toast">
      <IconCheck />
      {message}
    </div>
  )
}
