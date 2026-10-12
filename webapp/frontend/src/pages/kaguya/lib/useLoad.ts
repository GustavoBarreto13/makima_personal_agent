// Carrega dados de uma tela e devolve os estados do padrão: carregando, erro (com "tentar de novo") e dados.
// Refaz a consulta quando algo em `deps` muda (por exemplo `rev`, que sobe a cada gravação).

import { useCallback, useEffect, useState } from 'react'

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T }

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { state: Loaded<T>; retry: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  // Contador de "tentar de novo": mudar o número força o efeito a rodar outra vez.
  const [tries, setTries] = useState(0)

  useEffect(() => {
    // `live` evita gravar o resultado de uma consulta antiga depois que outra já começou.
    let live = true
    // Recarregar não pisca a tela já pronta: só mostra "carregando" na primeira vez.
    setState((cur) => (cur.status === 'ok' ? cur : { status: 'loading' }))
    load().then((data) => { if (live) setState({ status: 'ok', data }) }).catch(() => { if (live) setState({ status: 'error' }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tries])

  return { state, retry: useCallback(() => { setState({ status: 'loading' }); setTries((n) => n + 1) }, []) }
}

/** Consulta OPCIONAL: se falhar (ou nem existir), devolve o valor padrão — a seção some, o resto da tela continua. */
export const safe = <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(fn).catch(() => fallback)
