// Criar, renomear e excluir uma coluna do Kanban, com o interruptor “coluna de concluídas” (soltar um card nela
// conclui a tarefa; no máximo uma por lista). Excluir NÃO apaga tarefas: elas voltam para a primeira coluna.

import { useState } from 'react'
import { Button, Field, Input, Modal, Select, Toggle, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import type { Column, ColumnKind } from '../types'

// Tipos que o usuário escolhe (o “concluída” vem do interruptor). `auto` = deduzir pelo nome.
const KIND_OPTIONS: { value: ColumnKind | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Automático (pelo nome)' },
  { value: 'backlog', label: 'Backlog / ideias' },
  { value: 'todo', label: 'A fazer' },
  { value: 'doing', label: 'Em andamento' },
  { value: 'review', label: 'Homologação / revisão' },
  { value: 'blocked', label: 'Bloqueada' },
]
// Tipos cujas tarefas não entram em cobranças (resumo da manhã, Conselho do Dia, alarmes).
const QUIET: (ColumnKind | 'auto')[] = ['backlog', 'review', 'blocked']

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

export function ColumnModal({ column, projectId, onClose, onSaved }: { column?: Column; projectId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(column?.name ?? '')
  const [isDone, setIsDone] = useState(column?.is_done_column ?? false)
  // Uma coluna já classificada abre com o tipo dela; sem tipo (ou nova) abre em “Automático”.
  const initialKind: ColumnKind | 'auto' = column?.kind && column.kind !== 'done' ? column.kind : 'auto'
  const [kind, setKind] = useState<ColumnKind | 'auto'>(initialKind)
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
          <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as ColumnKind | 'auto')}>
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}</Field>
      )}
      {!isDone && (
        <p className="ds-hint">
          {QUIET.includes(kind)
            ? 'Tarefas daqui são tratadas como “esperando”: não entram nas cobranças do resumo da manhã, do Conselho do Dia nem nos alarmes.'
            : kind === 'auto' ? 'Deduzido pelo nome (Homolog, Blocked, Backlog, To Do, Doing…). Nome desconhecido conta como pendência.' : 'Tarefas daqui contam como pendências.'}
        </p>
      )}
    </Modal>
  )
}
