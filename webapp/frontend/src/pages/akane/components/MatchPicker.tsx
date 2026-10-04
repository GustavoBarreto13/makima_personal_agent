// "Trocar filme": o catálogo ligou o filme ao título errado do TMDB. Busca de novo e aplica o candidato certo
// (só os dados de catálogo mudam; nota, sessões e etiquetas ficam).

import { useEffect, useState } from 'react'
import { Button, Icon, Img, Input, Modal } from '../../../design'
import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import type { Movie, TmdbResult } from '../types'

export function MatchPicker({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const akane = useAkane()
  const [query, setQuery] = useState(movie.title)
  const [results, setResults] = useState<TmdbResult[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setState('ok'); return }
    let live = true
    setState('loading')
    const t = setTimeout(() => {
      akaneApi.tmdbSearch(q).then((r) => { if (live) { setResults(r.results); setState('ok') } }).catch(() => { if (live) setState('error') })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [query])

  const apply = async (r: TmdbResult) => {
    const ok = await confirm({
      title: `Trocar para “${r.title}”?`,
      body: 'Título, ano, direção, gêneros, duração, sinopse e pôster passam a vir deste filme. Sua nota, sessões e etiquetas não mudam.',
      confirmLabel: 'Trocar',
    })
    if (!ok) return
    try {
      await akaneApi.refreshMetadata(movie.id, r.tmdb_id)
      akane.reload()
      toast('Filme atualizado com os dados do TMDB', { tone: 'success' })
      onClose()
    } catch { toast('Não foi possível trocar o filme.', { tone: 'error' }) }
  }

  return (
    <Modal title="Trocar filme" size="md" onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="ds-stack">
        <Input aria-label="Buscar no TMDB" value={query} placeholder="Título do filme" onChange={(e) => setQuery(e.target.value)} />
        <div className="ds-list" aria-busy={state === 'loading'}>
          {results.map((r) => (
            <button key={r.tmdb_id} type="button" className="ds-lrow ax-hit" onClick={() => void apply(r)}>
              <Img src={r.poster_url} ratio="poster" className="ax-mini" fallback={<Icon name="movie" size={16} />} />
              <span className="ds-t"><b>{r.title}</b><span>{[r.year, r.director[0]].filter(Boolean).join(' · ')}</span></span>
              {r.tmdb_id === movie.tmdb_id && <span className="ds-mono">atual</span>}
            </button>
          ))}
          {state === 'ok' && query.trim().length >= 2 && results.length === 0 && <p className="ds-hint">Nenhum filme encontrado. Confira a grafia.</p>}
          {state === 'error' && <p className="ds-hint">A busca não respondeu. Tente de novo em instantes.</p>}
        </div>
      </div>
    </Modal>
  )
}
