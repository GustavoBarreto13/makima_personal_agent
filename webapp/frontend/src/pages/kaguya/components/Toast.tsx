// Toast — feedback efêmero no rodapé. Some sozinho após alguns segundos.

import { useEffect } from 'react'

interface ToastProps {
  message: string
  kind?: 'ok' | 'err'
  onDone: () => void
}

export function Toast({ message, kind = 'ok', onDone }: ToastProps) {
  // Agenda o desaparecimento automático; limpa o timer se o componente sair antes.
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return <div className={`kg-toast${kind === 'err' ? ' err' : ''}`}>{message}</div>
}
