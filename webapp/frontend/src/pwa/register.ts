// Registro do service worker (PWA) e estado de "nova versão" / "sem conexão".
//
// O service worker é o "ajudante" que guarda cópias dos arquivos e de algumas leituras da API
// para o app abrir rápido e funcionar sem internet. Usamos `registerType: 'prompt'`: quando sai
// versão nova, o app AVISA e o usuário escolhe quando atualizar (não trocamos a tela do nada
// no meio de uma anotação do diário).

import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'

export interface PwaState {
  /** Há uma versão nova pronta: mostrar o aviso "Atualizar". */
  needRefresh: boolean
  /** O app terminou de guardar o necessário e já abre sem internet (aviso único, discreto). */
  offlineReady: boolean
  /** O navegador está sem conexão agora. */
  offline: boolean
}

let state: PwaState = {
  needRefresh: false,
  offlineReady: false,
  offline: typeof navigator !== 'undefined' ? navigator.onLine === false : false,
}
const listeners = new Set<() => void>()

function set(patch: Partial<PwaState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Hook: estado atual do PWA (re-renderiza quando muda). */
export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Função que aplica a atualização (definida quando o service worker registra). */
let updateSW: ((reload?: boolean) => Promise<void>) | null = null

/** Aplica a versão nova: o service worker novo assume e a página recarrega. */
export function applyUpdate(): void {
  void updateSW?.(true)
}

/** Esconde os avisos sem atualizar (o usuário atualiza depois, na próxima abertura). */
export function dismissPwaNotices(): void {
  set({ needRefresh: false, offlineReady: false })
}

/** Nomes dos caches que guardam respostas da API (dados do usuário) — apagados ao sair. */
export const API_CACHE_NAMES = ['makima-api']

/**
 * Apaga do aparelho as respostas da API guardadas (tarefas, viagens…).
 * Chamado quando o servidor recusa a sessão: assim, depois de sair, ninguém que pegue o
 * aparelho vê dados antigos pelo modo offline.
 */
export async function clearOfflineData(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    await Promise.all(API_CACHE_NAMES.map((name) => caches.delete(name)))
  } catch {
    /* cache indisponível: nada a limpar */
  }
}

/** Liga tudo: registra o service worker (só em produção) e acompanha online/offline. */
export async function initPwa(): Promise<void> {
  if (typeof window === 'undefined') return

  window.addEventListener('online', () => set({ offline: false }))
  window.addEventListener('offline', () => set({ offline: true }))

  // Dentro do app Android o `dist/` já está embutido no APK: o service worker só serviria uma
  // cópia antiga da tela por cima da versão instalada. Atualizar = instalar o APK novo.
  if (Capacitor.isNativePlatform()) return

  // Em `npm run dev` não há service worker (o Vite serve módulos sob demanda): não registrar.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const { registerSW } = await import('virtual:pwa-register')
  updateSW = registerSW({
    onNeedRefresh: () => set({ needRefresh: true }),
    onOfflineReady: () => set({ offlineReady: true }),
  })
}
