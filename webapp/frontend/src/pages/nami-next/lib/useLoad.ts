// Carrega dados de uma tela e devolve os estados do padrão: carregando, erro (com "tentar de novo") e dados.
// Refaz a consulta quando algo em `deps` muda (por exemplo `nami.rev`, que sobe a cada gravação).

import { useCallback, useEffect, useState } from 'react'

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T }

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { state: Loaded<T>; retry: () => void; refresh: () => void; set: (data: T) => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [tries, setTries] = useState(0)

  useEffect(() => {
    let live = true
    setState((cur) => (cur.status === 'ok' ? cur : { status: 'loading' }))   // recarregar não pisca a tela já pronta
    load().then((data) => { if (live) setState({ status: 'ok', data }) }).catch(() => { if (live) setState({ status: 'error' }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tries])

  return {
    state,
    /** Tentar de novo depois de um erro: volta ao estado de carregamento. */
    retry: useCallback(() => { setState({ status: 'loading' }); setTries((n) => n + 1) }, []),
    /** Atualiza em segundo plano, sem piscar a tela que já está pronta. */
    refresh: useCallback(() => setTries((n) => n + 1), []),
    /** Troca os dados na hora (atualização otimista). */
    set: (data) => setState({ status: 'ok', data }),
  }
}
