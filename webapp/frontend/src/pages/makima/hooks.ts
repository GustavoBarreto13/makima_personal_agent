// Hooks de "dados vivos" da home: recarregar sozinho ao voltar ao app e a cada minuto, relógio da saudação e a
// contagem do foco andando sem recarregar. Só lógica de tempo — nada de rede aqui (a tela passa o `refresh`).

import { useEffect, useRef, useState } from 'react'
import { remainingNow } from './lib'

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/**
 * Chama `refresh` (recarga silenciosa) ao voltar para a aba/app e a cada `everyMs` enquanto a tela está visível.
 * Em pausa (aba em segundo plano) não gasta rede nem bateria. No app Android, abrir o app de novo dispara o mesmo
 * `visibilitychange` do WebView.
 */
export function useAutoRefresh(refresh: () => void, everyMs = 60_000): void {
  const ref = useRef(refresh)
  ref.current = refresh
  useEffect(() => {
    const onVisible = () => { if (visible()) ref.current() }
    const timer = setInterval(() => { if (visible()) ref.current() }, everyMs)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [everyMs])
}

/** "Agora" que se atualiza a cada minuto e ao voltar ao app — saudação e data não ficam velhas depois da meia-noite. */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = setInterval(tick, everyMs)
    const onVisible = () => { if (visible()) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [everyMs])
  return now
}

/**
 * Segundos restantes de um foco, andando de 1 em 1 s a partir do valor que chegou do servidor.
 * `loadedAt` é o instante em que o dado chegou (muda a cada recarga); ao zerar chama `onZero` uma vez.
 */
export function useFocusCountdown(totalSec: number | null, loadedAt: number, onZero?: () => void): number | null {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const zeroed = useRef(false)
  const cb = useRef(onZero)
  cb.current = onZero
  const left = remainingNow(totalSec, loadedAt, nowMs)

  useEffect(() => {
    zeroed.current = false
    setNowMs(Date.now())
  }, [totalSec, loadedAt])

  useEffect(() => {
    if (totalSec == null) return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [totalSec, loadedAt])

  useEffect(() => {
    if (left === 0 && !zeroed.current) {
      zeroed.current = true
      cb.current?.()
    }
  }, [left])

  return left
}
