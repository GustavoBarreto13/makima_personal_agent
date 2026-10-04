// Escolher os até 4 filmes da vitrine de favoritos (só filmes já vistos podem ser favoritos).

import { useMemo, useState } from 'react'
import { Button, EmptyState, ErrorState, Icon, Input, LoadingState, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import { norm } from '../lib/log'
import { useLoad } from '../lib/useLoad'
import type { FavoriteFilm } from '../types'

const MAX = 4

export function FavoritesPicker({ current, onClose }: { current: FavoriteFilm[]; onClose: () => void }) {
  const akane = useAkane()
  const [picked, setPicked] = useState<string[]>(current.map((f) => f.id))
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const { state, retry } = useLoad(() => akaneApi.list().then((r) => r.movies.filter((m) => m.status === 'watched')), [])

  const shown = useMemo(() => {
    if (state.status !== 'ok') return []
    const n = norm(q)
    return state.data.filter((m) => !n || norm(m.title).includes(n))
  }, [state, q])

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id]))

  const save = async () => {
    setSaving(true)
    try {
      await akaneApi.setFavorites(picked)
      akane.reload()
      toast('Favoritos atualizados', { tone: 'success' })
      onClose()
    } catch {
      toast('Não foi possível salvar os favoritos.', { tone: 'error' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Escolher favoritos"
      onClose={onClose}
      dirty={JSON.stringify(picked) !== JSON.stringify(current.map((f) => f.id))}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Salvar</Button></>}
    >
      <div className="ds-stack">
        <p className="ds-hint">{picked.length} de {MAX} escolhidos. Só filmes que você já viu.</p>
        <Input aria-label="Buscar entre os filmes vistos" placeholder="Buscar pelo título" value={q} onChange={(e) => setQ(e.target.value)} />
        {state.status === 'loading' && <LoadingState variant="row" count={4} />}
        {state.status === 'error' && <ErrorState onRetry={retry} />}
        {state.status === 'ok' && state.data.length === 0 && <EmptyState icon="movie" title="Nenhum filme visto ainda" hint="Logue o primeiro filme para poder escolher favoritos." />}
        {state.status === 'ok' && state.data.length > 0 && (
          <div className="ds-list">
            {shown.map((m) => {
              const on = picked.includes(m.id)
              return (
                <button key={m.id} type="button" className="ds-lrow" aria-pressed={on} onClick={() => toggle(m.id)}>
                  <span className="ds-lead"><Icon name={on ? 'check' : 'movie'} size={18} /></span>
                  <span className="ds-t"><b>{m.title}</b><span>{m.year ?? ''}</span></span>
                </button>
              )
            })}
            {shown.length === 0 && <p className="ds-hint">Nada com esse título.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
