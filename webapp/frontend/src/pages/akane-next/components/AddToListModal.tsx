// Adicionar um filme a uma lista existente ou criar uma lista nova já com ele.

import { useState } from 'react'
import { Button, EmptyState, ErrorState, Field, Icon, Input, LoadingState, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import { useLoad } from '../lib/useLoad'

export function AddToListModal({ movieId, title, onClose }: { movieId: string; title: string; onClose: () => void }) {
  const akane = useAkane()
  const { state, retry } = useLoad(() => akaneApi.lists().then((r) => r.lists), [])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const finish = (listName: string) => {
    akane.reload()
    toast(`${title} entrou em “${listName}”`, { tone: 'success' })
    onClose()
  }

  const add = async (listId: string, listName: string) => {
    setBusy(true)
    try { await akaneApi.addToList(listId, movieId); finish(listName) }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível adicionar à lista.'); setBusy(false) }
  }

  const create = async () => {
    const n = name.trim()
    if (!n) { setError('Dê um nome à lista.'); return }
    setBusy(true)
    try {
      const made = await akaneApi.createList({ name: n })
      if (!made.id) throw new Error('Não foi possível criar a lista.')
      await akaneApi.addToList(made.id, movieId)
      finish(n)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar a lista.'); setBusy(false) }
  }

  return (
    <Modal title="Adicionar à lista" size="sm" onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="ds-stack">
        {state.status === 'loading' && <LoadingState variant="row" count={3} />}
        {state.status === 'error' && <ErrorState onRetry={retry} />}
        {state.status === 'ok' && state.data.length === 0 && <EmptyState icon="list" title="Nenhuma lista ainda" hint="Crie a primeira logo abaixo." />}
        {state.status === 'ok' && state.data.length > 0 && (
          <div className="ds-list">
            {state.data.map((l) => (
              <button key={l.id} type="button" className="ds-lrow" disabled={busy} onClick={() => void add(l.id, l.name)}>
                <span className="ds-lead"><Icon name="list" size={18} /></span>
                <span className="ds-t"><b>{l.name}</b><span>{l.count} {l.count === 1 ? 'filme' : 'filmes'}</span></span>
                <Icon name="add" size={16} />
              </button>
            ))}
          </div>
        )}
        <Field label="Ou crie uma lista nova" error={error}>
          {(a) => (
            <div className="ds-inline">
              <Input {...a} value={name} placeholder="Ex.: Cinema japonês" onChange={(e) => { setName(e.target.value); setError(null) }} onKeyDown={(e) => { if (e.key === 'Enter') void create() }} />
              <Button icon="add" disabled={busy} onClick={() => void create()}>Criar e adicionar</Button>
            </div>
          )}
        </Field>
      </div>
    </Modal>
  )
}
