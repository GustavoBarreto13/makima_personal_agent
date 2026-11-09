// Avisos do PWA no padrão visual do Design System (reaproveita o `.ds-toast`):
//   - "Nova versão disponível" com botão Atualizar;
//   - "Pronto para uso offline" (uma vez, some sozinho);
//   - "Sem conexão" enquanto o aparelho estiver offline;
//   - "N alterações aguardando internet" (escritas guardadas no aparelho) e as que o servidor recusou.
// Fica fora dos shells (montado em main.tsx) para valer em qualquer tela, inclusive no login.

import { useEffect } from 'react'
import { Icon } from '../design/ui/Icon'
import { discardFailedWrites, usePendingWrites } from '../lib/offlineWrites'
import { applyUpdate, dismissPwaNotices, usePwaState } from './register'

/** Quanto tempo o aviso "pronto para uso offline" fica na tela (ms). */
const OFFLINE_READY_MS = 5000

export function PwaPrompt() {
  const { needRefresh, offlineReady, offline } = usePwaState()
  const { pending, failed } = usePendingWrites()

  // O aviso de "pronto offline" é só informativo: some sozinho.
  useEffect(() => {
    if (!offlineReady || needRefresh) return
    const t = setTimeout(dismissPwaNotices, OFFLINE_READY_MS)
    return () => clearTimeout(t)
  }, [offlineReady, needRefresh])

  if (!needRefresh && !offlineReady && !offline && pending === 0 && failed.length === 0) return null

  return (
    // `.ds-toasts` é absoluto dentro dos shells; aqui ancoramos na janela inteira.
    <div className="ds-toasts" style={{ position: 'fixed' }} aria-live="polite">
      {offline && (
        <div className="ds-toast" role="status">
          <span>Sem conexão — mostrando o que está salvo neste aparelho.</span>
        </div>
      )}
      {pending > 0 && (
        <div className="ds-toast" role="status">
          <span>{pending} {pending > 1 ? 'alterações aguardam' : 'alteração aguarda'} a internet para ser enviada{pending > 1 ? 's' : ''}.</span>
        </div>
      )}
      {failed.length > 0 && (
        <div className="ds-toast" role="alert">
          <span>{failed.length} {failed.length > 1 ? 'alterações feitas sem internet foram recusadas' : 'alteração feita sem internet foi recusada'} pelo servidor.</span>
          <button type="button" onClick={discardFailedWrites}>Descartar</button>
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
