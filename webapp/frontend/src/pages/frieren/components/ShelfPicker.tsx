// Estantes de um livro (novo: o shell antigo só mostrava as estantes no detalhe, sem deixar mudar dali).
// Marcar/desmarcar grava na hora; cada mudança tem "Desfazer".

import { useState } from 'react'
import { Button, EmptyState, Icon, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import type { Book } from '../types'

export function ShelfPicker({ book, onClose }: { book: Book; onClose: () => void }) {
  const frieren = useFrieren()
  // Cópia local para a marcação responder na hora (o catálogo recarrega por trás).
  const [inShelf, setInShelf] = useState<string[]>(book.shelves)
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (shelfId: string, name: string) => {
    const on = inShelf.includes(shelfId)
    setBusy(shelfId)
    try {
      if (on) await frierenApi.removeFromShelf(shelfId, book.id)
      else await frierenApi.addToShelf(shelfId, book.id)
      setInShelf((cur) => (on ? cur.filter((x) => x !== shelfId) : [...cur, shelfId]))
      frieren.reload()
      const back = () => (on ? frierenApi.addToShelf(shelfId, book.id) : frierenApi.removeFromShelf(shelfId, book.id))
      toast(on ? `Saiu de ${name}` : `Entrou em ${name}`, {
        undo: () => {
          back().then(() => { setInShelf((cur) => (on ? [...cur, shelfId] : cur.filter((x) => x !== shelfId))); frieren.reload() })
            .catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
        },
      })
    } catch { toast('Não foi possível mudar a estante.', { tone: 'error' }) }
    setBusy(null)
  }

  return (
    <Modal title={`Estantes · ${book.title}`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Pronto</Button>}>
      {frieren.shelves.length === 0
        ? (
          <EmptyState
            icon="shelf"
            title="Nenhuma estante ainda"
            hint="Estantes agrupam livros por tema (clássicos, releituras, presentes…)."
            action={<Button icon="add" onClick={() => { onClose(); frieren.goto('shelves') }}>Criar estante</Button>}
          />
        )
        : (
          <div className="ds-list">
            {frieren.shelves.map((s) => {
              const on = inShelf.includes(s.id)
              return (
                <button key={s.id} type="button" className="ds-lrow" aria-pressed={on} disabled={busy === s.id} onClick={() => void toggle(s.id, s.name)}>
                  <span className="ds-lead"><Icon name={on ? 'check' : 'shelf'} size={18} /></span>
                  <span className="ds-t"><b>{s.name}</b>{s.description && <span>{s.description}</span>}</span>
                  <span className="ds-mono">{s.count}</span>
                </button>
              )
            })}
          </div>
        )}
    </Modal>
  )
}
