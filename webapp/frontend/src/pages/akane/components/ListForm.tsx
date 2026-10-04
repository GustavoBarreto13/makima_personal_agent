// Criar ou editar uma lista de filmes (nome, descrição e se é um ranking).

import { useState } from 'react'
import { Button, Chip, Field, Input, Modal, Textarea } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import type { MovieList } from '../types'

export function ListForm({ list, onClose, onSaved }: {
  list?: Pick<MovieList, 'id' | 'name' | 'description' | 'ranked'>
  onClose: () => void
  /** Chamado depois de criar (com o id novo) ou editar. */
  onSaved?: (id: string) => void
}) {
  const akane = useAkane()
  const [name, setName] = useState(list?.name ?? '')
  const [description, setDescription] = useState(list?.description ?? '')
  const [ranked, setRanked] = useState(list?.ranked ?? false)
  const [error, setError] = useState<{ field: 'name' | 'form'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = name !== (list?.name ?? '') || description !== (list?.description ?? '') || ranked !== (list?.ranked ?? false)

  const save = async () => {
    const n = name.trim()
    if (!n) { setError({ field: 'name', message: 'Dê um nome à lista.' }); return }
    setSaving(true)
    try {
      let id = list?.id ?? ''
      if (list) await akaneApi.updateList(list.id, { name: n, description, ranked })
      else {
        const made = await akaneApi.createList({ name: n, description, ranked })
        if (!made.id) throw new Error('Não foi possível criar a lista.')
        id = made.id
      }
      akane.reload()
      toast(list ? 'Lista atualizada' : 'Lista criada', { tone: 'success' })
      onSaved?.(id)
      onClose()
    } catch (e) {
      setError({ field: 'form', message: e instanceof Error ? e.message : 'Não foi possível salvar.' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title={list ? 'Editar lista' : 'Nova lista'}
      size="sm"
      dirty={dirty}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon="check" disabled={saving} onClick={() => void save()}>Salvar</Button></>}
    >
      <div className="ds-stack">
        <Field label="Nome" error={error?.field === 'name' ? error.message : null}>
          {(a) => <Input {...a} value={name} placeholder="Ex.: Cinema japonês" onChange={(e) => { setName(e.target.value); setError(null) }} />}
        </Field>
        <Field label="Descrição">{(a) => <Textarea {...a} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="Ordem" hint="Num ranking, a posição de cada filme importa (como um top 10).">
          {() => <Chip on={ranked} icon="trophy" aria-pressed={ranked} onClick={() => setRanked((v) => !v)}>É um ranking</Chip>}
        </Field>
        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
