// Avisos do PWA no padrão visual do Design System (reaproveita o `.ds-toast`):
//   - "Nova versão disponível" com botão Atualizar;
//   - "Pronto para uso offline" (uma vez, some sozinho);
//   - "Sem conexão" enquanto o aparelho estiver offline.
// Fica fora dos shells (montado em main.tsx) para valer em qualquer tela, inclusive no login.

import { useEffect } from 'react'
import { Icon } from '../design/ui/Icon'
import { applyUpdate, dismissPwaNotices, usePwaState } from './register'

/** Quanto tempo o aviso "pronto para uso offline" fica na tela (ms). */
const OFFLINE_READY_MS = 5000

export function PwaPrompt() {
  const { needRefresh, offlineReady, offline } = usePwaState()

  // O aviso de "pronto offline" é só informativo: some sozinho.
  useEffect(() => {
    if (!offlineReady || needRefresh) return
    const t = setTimeout(dismissPwaNotices, OFFLINE_READY_MS)
    return () => clearTimeout(t)
  }, [offlineReady, needRefresh])

  if (!needRefresh && !offlineReady && !offline) return null

  return (
    // `.ds-toasts` é absoluto dentro dos shells; aqui ancoramos na janela inteira.
    <div className="ds-toasts" style={{ position: 'fixed' }} aria-live="polite">
      {offline && (
        <div className="ds-toast" role="status">
          <span>Sem conexão — mostrando o que está salvo neste aparelho.</span>
        </div>
      )}
      {needRefresh && (
        <div className="ds-toast" role="status">
          <span>Nova versão da Makima disponível.</span>
          <button type="button" onClick={applyUpdate}>Atualizar</button>
          <button type="button" className="ds-tx" aria-label="Agora não" onClick={dismissPwaNotices}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {offlineReady && !needRefresh && (
        <div className="ds-toast" role="status">
          <span>Pronto: a Makima já abre sem internet.</span>
        </div>
      )}
    </div>
  )
}
