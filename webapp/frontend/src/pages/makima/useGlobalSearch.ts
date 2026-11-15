// Busca em todos os agentes na paleta Ctrl+K. O provedor da paleta é síncrono, então a busca de rede
// roda com debounce e o resultado entra no provedor quando chega (a paleta pergunta de novo sozinha).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCommandProvider, type CommandProvider } from '../../design/headless/commands'
import { makimaApi } from './makimaApi'
import type { SearchHit } from './types'

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

export function useGlobalSearch(go: (href: string) => void): void {
  const [hits, setHits] = useState<{ q: string; results: SearchHit[] }>({ q: '', results: [] })
  const wanted = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [bump, setBump] = useState(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const provider = useMemo<CommandProvider>(() => ({
    id: 'makima.global',
    search: (q) => {
      const term = q.trim()
      if (term.length < MIN_CHARS) return []
      if (wanted.current !== term) {
        wanted.current = term
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          makimaApi.search(term)
            .then((r) => { if (wanted.current === term) { setHits({ q: term, results: r.results }); setBump((n) => n + 1) } })
            .catch(() => undefined) // sem rede: a paleta segue com comandos e itens do agente aberto
        }, DEBOUNCE_MS)
      }
      // Mostra o que já chegou (mesmo da letra anterior) até a resposta nova entrar.
      return hits.results.map((h) => ({ id: h.id, label: h.label, group: h.group, icon: h.icon === 'person' ? 'person' : h.icon, run: () => go(h.href) }))
    },
  // `bump` força o provedor a ser registrado de novo quando chega resultado novo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [hits, go, bump])

  useCommandProvider(provider)
}
