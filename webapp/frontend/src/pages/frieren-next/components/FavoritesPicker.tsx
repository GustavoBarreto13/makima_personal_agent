// Escolher os até 4 livros da vitrine de favoritos da Início. A ordem da vitrine é a ordem em que você marca.
// Os livros lidos aparecem primeiro, mas qualquer livro do catálogo pode entrar (um favorito pode estar em releitura).

import { useMemo, useState } from 'react'
import { Button, EmptyState, Icon, Input, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { norm } from '../lib/log'
import { STATUS } from '../lib/status'
import type { FavoriteBook } from '../types'

const MAX = 4

export function FavoritesPicker({ current, onClose }: { current: FavoriteBook[]; onClose: () => void }) {
  const frieren = useFrieren()
  const [picked, setPicked] = useState<string[]>(current.map((f) => f.id))
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  // Lidos primeiro (por data de término), depois o resto; a busca filtra por título ou autor.
  const shown = useMemo(() => {
    const n = norm(q)
    return [...frieren.books]
      .sort((a, b) => Number(b.status === 'lido') - Number(a.status === 'lido') || (b.finished ?? '').localeCompare(a.finished ?? ''))
      .filter((b) => !n || norm(b.title).includes(n) || norm(b.author).includes(n))
  }, [frieren.books, q])

  // Marcar além de 4 não faz nada (o contador avisa o limite).
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id]))

  const save = async () => {
    setSaving(true)
    try {
      await frierenApi.setFavorites(picked)
      frieren.reload()
      toast('Favoritos atualizados', { tone: 'success' })
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível salvar os favoritos.', { tone: 'error' })
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
        <p className="ds-hint">{picked.length} de {MAX} escolhidos. A vitrine segue a ordem em que você marca.</p>
        <Input aria-label="Buscar livro" placeholder="Buscar por título ou autor" value={q} onChange={(e) => setQ(e.target.value)} />
        {frieren.books.length === 0
          ? <EmptyState icon="book" title="Nenhum livro ainda" hint="Adicione livros à biblioteca para escolher os favoritos." />
          : (
            <div className="ds-list">
              {shown.map((b) => {
                const pos = picked.indexOf(b.id)
                return (
                  <button key={b.id} type="button" className="ds-lrow" aria-pressed={pos >= 0} onClick={() => toggle(b.id)}>
                    <span className="ds-lead">{pos >= 0 ? <b className="fr-pos">{pos + 1}</b> : <Icon name="book" size={18} />}</span>
                    <span className="ds-t"><b>{b.title}</b><span>{[b.author, STATUS[b.status].label].filter(Boolean).join(' · ')}</span></span>
                    {pos >= 0 && <Icon name="check" size={16} label="Escolhido" />}
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
