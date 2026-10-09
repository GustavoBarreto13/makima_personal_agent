// Busca da barra do topo: procura em abertas E concluídas (o shell antigo só achava abertas), respeitando o espaço.
// Clicar abre a tarefa no painel. Uma busca só — a paleta (Ctrl+K) usa o mesmo índice local, sem criar nada no Enter.

import { useEffect, useState } from 'react'
import { EmptyState, Input, LoadingState, Modal } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { dueInfo } from '../lib/taskView'
import type { Task } from '../types'

export function SearchModal({ initial, onClose }: { initial: string; onClose: () => void }) {
  const k = useKaguya()
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState<Task[] | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return }
    let live = true
    const t = window.setTimeout(() => {
      kaguyaApi.search(q.trim(), { space: k.space, includeCompleted: true }).then((r) => { if (live) setResults(r) }).catch(() => { if (live) setResults([]) })
    }, 200)
    return () => { live = false; window.clearTimeout(t) }
  }, [q, k.space])

  return (
    <Modal title="Buscar tarefas" size="md" onClose={onClose}>
      <Input aria-label="Buscar" placeholder="Título, notas, etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {q.trim().length >= 2 && results === null && <LoadingState variant="row" count={3} />}
      {results && results.length === 0 && <EmptyState icon="search" title="Nada encontrado" hint="Tente outra palavra. A busca olha títulos, notas e etiquetas, inclusive das concluídas." />}
      {results && results.length > 0 && (
        <ul className="kn-sublist kn-found" aria-label="Resultados">
          {results.slice(0, 30).map((t) => (
            <li key={t.id} className={t.completed_at ? 'kn-done' : ''}>
              <button type="button" className="kn-main" onClick={() => { k.openTask(t.id); onClose() }}>
                <span className="kn-title">{t.title}</span>
                <span className="kn-snippet">{[t.project_name, t.completed_at ? 'concluída' : dueInfo(t, k.today).label].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
