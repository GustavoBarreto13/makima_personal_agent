// Escolher os até 4 animes da vitrine de favoritos do Início.

import { useMemo, useState } from 'react'
import { Button, EmptyState, Icon, Input, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useMarin } from '../context'
import { norm } from '../lib/log'
import { marinApi } from '../marinApi'
import type { Anime } from '../types'

const MAX = 4

export function FavoritesPicker({ current, onClose }: { current: Anime[]; onClose: () => void }) {
  const marin = useMarin()
  const [picked, setPicked] = useState<string[]>(current.map((a) => a.id))
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  const shown = useMemo(() => {
    const n = norm(q)
    return marin.animes.filter((a) => !n || norm(a.title).includes(n))
  }, [marin.animes, q])

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id]))

  const save = async () => {
    setSaving(true)
    try {
      await marinApi.setFavorites(picked)
      marin.reload()
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
      dirty={JSON.stringify(picked) !== JSON.stringify(current.map((a) => a.id))}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Salvar</Button></>}
    >
      <div className="ds-stack">
        <p className="ds-hint">{picked.length} de {MAX} escolhidos.</p>
        <Input aria-label="Buscar entre os animes" placeholder="Buscar pelo título" value={q} onChange={(e) => setQ(e.target.value)} />
        {marin.animes.length === 0 && <EmptyState icon="anime" title="Nenhum anime ainda" hint="Adicione um anime ao catálogo para poder escolher favoritos." />}
        {marin.animes.length > 0 && (
          <div className="ds-list">
            {shown.map((a) => {
              const on = picked.includes(a.id)
              return (
                <button key={a.id} type="button" className="ds-lrow" aria-pressed={on} onClick={() => toggle(a.id)}>
                  <span className="ds-lead"><Icon name={on ? 'check' : 'anime'} size={18} /></span>
                  <span className="ds-t"><b>{a.title}</b><span>{a.studio}</span></span>
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
