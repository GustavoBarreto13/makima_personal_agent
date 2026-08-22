/** Toast.tsx — Yato · Viagens (fatia 066). Pill de feedback, auto-dismiss em 2.8s (chamador controla o timer). */

interface ToastProps {
  message: string | null
}

export function Toast({ message }: ToastProps) {
  if (!message) return null
  return <div className="toast">{message}</div>
}
