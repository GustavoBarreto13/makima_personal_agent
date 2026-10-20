// Gerenciar as colunas do quadro de UMA lista num lugar só: renomear, trocar o tipo, marcar a de concluídas,
// excluir, criar e reordenar (arrastando a alça ou pelos botões subir/descer). Nada é gravado até “Salvar”;
// aí o servidor recebe as mudanças em ordem segura (excluir → editar → criar) e, por fim, a ordem final de uma vez.

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { Button, Icon, IconButton, Input, Modal, Select, Toggle, confirm, toast } from '../../../design'
import { kaguyaApi } from '../api'
import { KIND_OPTIONS, initialKindChoice, kindHint, type KindChoice } from '../lib/columnKinds'
import type { Column } from '../types'

const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

/** Uma linha editável: `id` é o da coluna no servidor (`null` = ainda não criada); `key` é estável para a lista. */
interface Row { key: string; id: number | null; name: string; isDone: boolean; kind: KindChoice; orig?: { name: string; isDone: boolean; kind: KindChoice } }

const fromColumn = (c: Column): Row => {
  const kind = initialKindChoice(c.kind)
  return { key: `c${c.id}`, id: c.id, name: c.name, isDone: c.is_done_column, kind, orig: { name: c.name, isDone: c.is_done_column, kind } }
}

function SortableRow({ row, index, total, onChange, onMove, onRemove }: {
  row: Row; index: number; total: number
  onChange: (patch: Partial<Row>) => void; onMove: (to: number) => void; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.key })
  return (
    <li ref={setNodeRef} className="kn-cm-row" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }}>
      <div className="kn-cm-main">
        <button type="button" ref={setActivatorNodeRef} className="kn-cm-grip" aria-label={`Arrastar a coluna ${row.name || 'sem nome'}`} {...attributes} {...listeners}>
          <Icon name="drag" size={16} />
        </button>
        <Input aria-label="Nome da coluna" value={row.name} placeholder="Nome da coluna" onChange={(e) => onChange({ name: e.target.value })} />
        <IconButton icon="up" label="Mover para antes" size={14} disabled={index === 0} onClick={() => onMove(index - 1)} />
        <IconButton icon="down" label="Mover para depois" size={14} disabled={index === total - 1} onClick={() => onMove(index + 1)} />
        <IconButton icon="delete" label={`Excluir a coluna ${row.name || 'sem nome'}`} size={14} onClick={onRemove} />
      </div>
      <div className="kn-cm-opts">
        <Toggle checked={row.isDone} onChange={(v) => onChange({ isDone: v })} label="Concluídas" />
        {!row.isDone && (
          <Select aria-label="Tipo da coluna" value={row.kind} title={kindHint(row.kind)} onChange={(e) => onChange({ kind: e.target.value as KindChoice })}>
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}
      </div>
    </li>
  )
}

export function ColumnsManagerModal({ columns, projectId, onClose, onSaved }: { columns: Column[]; projectId: number; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => columns.map(fromColumn))
  const [removed, setRemoved] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const original = columns.map((c) => c.id).join(',')
  const dirty = removed.length > 0 || rows.map((r) => r.id ?? 'novo').join(',') !== original
    || rows.some((r) => r.id == null || (r.orig && (r.name !== r.orig.name || r.isDone !== r.orig.isDone || r.kind !== r.orig.kind)))

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => {
    if (r.key !== key) return r
    // Só existe uma coluna de concluídas por lista: ligar aqui desliga as outras na tela.
    return { ...r, ...p }
  }).map((r) => (p.isDone && r.key !== key ? { ...r, isDone: false } : r)))
  const move = (from: number, to: number) => setRows((rs) => arrayMove(rs, from, to))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = rows.findIndex((r) => r.key === e.active.id)
    const to = rows.findIndex((r) => r.key === e.over!.id)
    if (from >= 0 && to >= 0) move(from, to)
  }
  const add = () => setRows((rs) => [...rs, { key: `n${Date.now()}${rs.length}`, id: null, name: '', isDone: false, kind: 'auto' }])
  const remove = async (row: Row) => {
    const ok = await confirm({ title: `Excluir a coluna “${row.name || 'sem nome'}”?`, body: 'As tarefas dela não são apagadas: voltam para a primeira coluna do quadro. A exclusão vale ao salvar.', confirmLabel: 'Excluir coluna', danger: true })
    if (!ok) return
    setRows((rs) => rs.filter((r) => r.key !== row.key))
    if (row.id != null) setRemoved((rm) => [...rm, row])
  }

  const save = async () => {
    if (rows.some((r) => !r.name.trim())) { setError('Toda coluna precisa de um nome.'); return }
    setSaving(true)
    setError('')
    try {
      const check = (r: { status?: string; message?: string }) => { if (r.status === 'error') throw new Error(r.message ?? 'Não foi possível salvar as colunas.') }
      for (const r of removed) check(await kaguyaApi.deleteColumn(r.id as number))
      const changed = rows.filter((r) => r.id != null && r.orig && (r.name !== r.orig.name || r.isDone !== r.orig.isDone || r.kind !== r.orig.kind))
      const body = (r: Row) => ({
        name: r.name.trim(), ...(r.isDone !== r.orig?.isDone ? { is_done_column: r.isDone } : {}), ...(r.kind !== r.orig?.kind ? { kind: r.kind } : {}),
      })
      // Primeiro quem deixa de ser “concluídas”, depois quem passa a ser: o servidor só aceita uma por lista.
      for (const r of changed.filter((x) => !x.isDone)) check(await kaguyaApi.updateColumn(r.id as number, body(r)))
      for (const r of changed.filter((x) => x.isDone)) check(await kaguyaApi.updateColumn(r.id as number, body(r)))
      const ids: number[] = []
      for (const r of rows) {
        if (r.id != null) { ids.push(r.id); continue }
        const created = await kaguyaApi.createColumn({ project_id: projectId, name: r.name.trim(), is_done_column: r.isDone, kind: r.isDone ? undefined : r.kind })
        check(created)
        ids.push((created as { id: number }).id)
      }
      if (ids.length > 1) check(await kaguyaApi.reorderColumns(projectId, ids))
      toast('Colunas atualizadas.', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) {
      setError(reason(e, 'Não foi possível salvar as colunas.'))
      onSaved() // algumas mudanças podem ter sido gravadas antes do erro: o quadro recarrega o que é real
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Colunas do quadro"
      size="md"
      dirty={dirty}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" icon="add" onClick={add}>Nova coluna</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      <p className="ds-hint">Arraste pela alça (ou use as setas) para mudar a ordem. As mudanças valem ao salvar.</p>
      {error && <p className="ds-errmsg" role="alert">{error}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <ul className="kn-cm-list">
            {rows.map((r, i) => (
              <SortableRow key={r.key} row={r} index={i} total={rows.length} onChange={(p) => patch(r.key, p)} onMove={(to) => move(i, to)} onRemove={() => void remove(r)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {rows.length === 0 && <p className="ds-hint">Sem colunas: o quadro some. Crie ao menos uma para ativar o Kanban.</p>}
    </Modal>
  )
}
