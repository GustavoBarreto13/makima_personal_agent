// Toast de feedback rápido — aparece por 2.5s e desaparece.
// Uso: mostrar confirmação de ações (ex.: "Sessão logada!", "Adicionado à watchlist").

interface ToastProps {
  message: string
}

/** Exibe uma mensagem de feedback no canto inferior central do Shell. */
export function Toast({ message }: ToastProps) {
  return (
    // .ak-toast tem position:fixed, bottom e animação definidos em akane.css
    <div className="ak-toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
