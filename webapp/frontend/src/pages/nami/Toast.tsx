// Toast pill da seção Nami — aparece na base da tela após ações do usuário.
// Posicionamento, animação e duração (2600 ms) controlados pelo NamiShell pai.

interface ToastProps {
  message: string  // mensagem a exibir; string vazia = não renderiza
}

/** Notificação temporária estilizada conforme design handoff §4 (FR-021). */
export function Toast({ message }: ToastProps) {
  if (!message) return null

  return (
    <div className="nami-toast visible">
      {/* Ícone de check tangerina */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        style={{ width: 15, height: 15, color: 'var(--tang)', flexShrink: 0 }}>
        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {message}
    </div>
  )
}
