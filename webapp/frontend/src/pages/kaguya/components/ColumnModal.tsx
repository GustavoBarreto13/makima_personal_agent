// Criar, renomear e excluir uma coluna do Kanban, com o interruptor “coluna de concluídas” (soltar um card nela
// conclui a tarefa; no máximo uma por lista). Excluir NÃO apaga tarefas: elas voltam para a primeira coluna.

import { useState } from 'react'
import { Button, Field, Input, Modal, Select, Toggle, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { KIND_OPTIONS, initialKindChoice, kindHint, type KindChoice } from '../lib/columnKinds'
import type { Column } from '../types'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function ColumnModal({ column, projectId, onClose, onSaved }: { column?: Column; projectId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(column?.name ?? '')
  const [isDone, setIsDone] = useState(column?.is_done_column ?? false)
  // Uma coluna já classificada abre com o tipo dela; sem tipo (ou nova) abre em “Automático”.
  const initialKind = initialKindChoice(column?.kind)
  const [kind, setKind] = useState<KindChoice>(initialKind)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = name !== (column?.name ?? '') || isDone !== (column?.is_done_column ?? false) || kind !== initialKind

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome à coluna.'); return }
    setSaving(true)
    try {
      const r = column
        ? await kaguyaApi.updateColumn(column.id, { name: name.trim(), is_done_column: isDone, ...(kind !== initialKind ? { kind } : {}) })
        : await kaguyaApi.createColumn({ project_id: projectId, name: name.trim(), is_done_column: isDone, kind })
      // Regra do backend: uma coluna de concluídas por lista.
      if (r.status === 'error') { setError(r.message ?? 'Não foi possível salvar a coluna.'); return }
      toast(column ? 'Coluna atualizada.' : 'Coluna criada.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) {
      setError(reason(e, 'Não foi possível salvar a coluna.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!column) return
    const ok = await confirm({
      title: `Excluir a coluna “${column.name}”?`, body: 'As tarefas dela não são apagadas: voltam para a primeira coluna do quadro.', confirmLabel: 'Excluir coluna', danger: true,
    })
    if (!ok) return
    try {
      const r = await kaguyaApi.deleteColumn(column.id)
      if (r.status === 'error') { toast(r.message ?? 'Não foi possível excluir.', { tone: 'error' }); return }
      toast('Coluna excluída.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) {
      toast(reason(e, 'Não foi possível excluir a coluna.'), { tone: 'error' })
    }
  }

  return (
    <Modal
      title={column ? 'Editar coluna' : 'Nova coluna'}
      size="sm"
      dirty={dirty}
      onClose={onClose}
      footer={(
        <>
          {column && <Button variant="danger" icon="delete" onClick={() => void remove()}>Excluir coluna</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <Field label="Nome" error={error || undefined}>{(c) => (
        <Input {...c} autoFocus value={name} placeholder="Ex.: Backlog, Fazendo, Concluído…" onChange={(e) => { setName(e.target.value); setError('') }} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} />
      )}</Field>
      <Toggle checked={isDone} onChange={setIsDone} label="Coluna de concluídas" />
      <p className="ds-hint">Soltar um card aqui marca a tarefa como concluída. No máximo uma por lista.</p>
      {!isDone && (
        <Field label="Tipo da coluna">{(c) => (
          <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as KindChoice)}>
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}</Field>
      )}
      {!isDone && (
        <p className="ds-hint">{kindHint(kind)}</p>
      )}
    </Modal>
  )
}
