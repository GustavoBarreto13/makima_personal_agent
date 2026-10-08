// Adicionar anime: busca no MyAnimeList (Jikan) enquanto digita; escolher um resultado cadastra o anime
// (metadados completos, episódios e pôster) e abre a página dele. Quem já está no catálogo só abre a página.

import { useEffect, useState } from 'react'
import { Button, Field, Icon, Img, Input, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useMarin } from '../context'
import { marinApi } from '../marinApi'
import type { SearchResult } from '../types'

const TYPE_LABEL: Record<string, string> = { TV: 'TV', Movie: 'Filme', OVA: 'OVA', Special: 'Especial', ONA: 'ONA', tv: 'TV', movie: 'Filme', ova: 'OVA', special: 'Especial', ona: 'ONA' }

export function AddAnimeForm({ initialTitle = '', onClose }: { initialTitle?: string; onClose: () => void }) {
  const marin = useMarin()
  const [query, setQuery] = useState(initialTitle)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)

  // Busca no Jikan com pausa de meio segundo depois da última tecla (o Jikan tem limite de pedidos por segundo).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setFailed(false); return }
    let live = true
    const t = setTimeout(() => {
      setSearching(true); setFailed(false)
      marinApi.search(q)
        .then((r) => { if (live) setResults(r) })
        .catch(() => { if (live) setFailed(true) })
        .finally(() => { if (live) setSearching(false) })
    }, 500)
    return () => { live = false; clearTimeout(t) }
  }, [query])

  const open = (id: string) => { marin.goto({ view: 'catalog', animeId: id }); onClose() }

  const add = async (r: SearchResult) => {
    if (r.inCatalog && r.localId) { open(r.localId); return }
    setAdding(r.malId)
    try {
      const made = await marinApi.add(r.malId)
      marin.reload()
      toast(`${r.title} adicionado ao catálogo`, { tone: 'success' })
      if (made.id) open(made.id); else onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível adicionar o anime.', { tone: 'error' })
      setAdding(null)
    }
  }

  return (
    <Modal title="Adicionar anime" size="lg" dirty={query.trim() !== initialTitle.trim()} onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="ds-stack">
        <Field label="Título" hint="Busca no MyAnimeList. Escolha o resultado para cadastrar.">
          {(a) => <Input {...a} value={query} autoFocus placeholder="Ex.: Sousou no Frieren" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />}
        </Field>
        <div className="ds-list" aria-label="Resultados da busca" aria-busy={searching}>
          {results.map((r) => (
            <button key={r.malId} type="button" className="ds-lrow mr-hit" disabled={adding !== null} onClick={() => void add(r)}>
              <Img src={r.poster} ratio="poster" className="mr-mini" fallback={<Icon name="anime" size={16} />} />
              <span className="ds-t">
                <b>{r.title}</b>
                <span>{[TYPE_LABEL[r.type] ?? r.type, r.season || (r.year ? String(r.year) : ''), r.episodes ? `${r.episodes} eps` : null, r.score ? `MAL ${r.score.toFixed(1)}` : null].filter(Boolean).join(' · ')}</span>
              </span>
              {r.inCatalog ? <span className="mr-chip">Já na lista <Icon name="right" size={12} /></span> : <Icon name={adding === r.malId ? 'refresh' : 'add'} size={16} />}
            </button>
          ))}
          {!searching && !failed && query.trim().length >= 2 && results.length === 0 && <p className="ds-hint">Nenhum anime encontrado. Confira a grafia.</p>}
          {query.trim().length < 2 && <p className="ds-hint">Digite pelo menos 2 letras.</p>}
          {failed && <p className="ds-hint">A busca não respondeu. Tente de novo em instantes.</p>}
        </div>
      </div>
    </Modal>
  )
}
