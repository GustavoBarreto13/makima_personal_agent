// Componente de notificação temporária ("toast") — aparece na base da tela
// após ações do usuário (ex: "+25 páginas registradas", "Livro terminado").
// Portado do protótipo logmodal.jsx.

import React from 'react'

// Props do Toast
interface ToastProps {
  // Mensagem a exibir. Se vazio, o toast não renderiza nada.
  message: string
}

/**
 * Exibe uma mensagem de feedback breve na base da tela.
 * O controle de visibilidade (temporizador de 2,6 s) fica no shell pai.
 */
export function Toast({ message }: ToastProps) {
  // Não renderiza nada se não houver mensagem
  if (!message) return null

  return (
    // Classe CSS do design system — posicionamento fixo, fundo escuro, animação de entrada
    <div className="fr-toast visible">
      {/* Ícone de check verde para reforçar o feedback positivo */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        style={{ width: 16, height: 16, color: 'var(--teal-bright)', flexShrink: 0 }}
      >
        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {message}
    </div>
  )
}
