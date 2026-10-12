// Modal “Nova tarefa”: o formulário completo (o que o shell antigo oferecia) com o texto do título lido ao vivo — digitar
// `@lista #etiqueta !alta amanhã 17h toda sexta 45min` preenche os campos que ficaram vazios, e os chips mostram o que
// foi entendido. À esquerda os campos; à direita as notas em Markdown e as subtarefas. O que a API de criação não aceita
// (estimativa, GTD, local e o bloco de horário) vai numa gravação logo depois da criação, como no shell antigo.

import { useEffect, useMemo, useState } from 'react'
import {
  Button, DatePicker, Field, IconButton, Input, ListPicker, MarkdownEditor, PersonPicker, SegmentedControl, Select, TagInput, TimePicker, toast, Modal, Toggle,
  type PersonOption,
} from '../../../design'
import { captureChips } from '../../../design/core/capture'
import { kaguyaApi } from '../api'
import { useKaguya, type NewTaskDefaults } from '../context'
import { localISO, timeToMin } from '../lib/calendar'
import { DURATIONS } from '../lib/durations'
import { listOptions } from '../lib/listOptions'
import { resolveProject, taskParser } from '../lib/quickAdd'
import { presetLabels, ruleFor, type RecurrencePreset } from '../lib/recurrence'
import { PRIORITY_LABEL } from '../lib/taskView'
import { safe, useLoad } from '../lib/useLoad'
import type { Column, GtdStatus, RecurrenceMode, TaskContext, TaskType } from '../types'
import { TaskFormLayout } from './TaskFormLayout'
import { usePeople } from './TaskPanelExtras'

const TYPES: { value: TaskType; label: string }[] = [{ value: 'task', label: 'Tarefa' }, { value: 'event', label: 'Evento' }, { value: 'birthday', label: 'Aniversário' }]
const GTD: { value: GtdStatus | ''; label: string }[] = [
  { value: '', label: 'Sem classificação' }, { value: 'next_action', label: 'Próxima ação' }, { value: 'waiting', label: 'Aguardando' }, { value: 'someday', label: 'Algum dia' },
]
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)
const colKey = (projectId: number) => `kaguya-next:newtask:col:${projectId}`
const readCol = (projectId: number): number | null => { try { const v = localStorage.getItem(colKey(projectId)); return v ? Number(v) : null } catch { return null } }

export function NewTaskModal({ defaults, onClose }: { defaults?: NewTaskDefaults; onClose: () => void }) {
  const k = useKaguya()
  const targets = defaults?.targets
  const people = usePeople()

  const [title, setTitle] = useState(defaults?.title ?? '')
  const [projectId, setProjectId] = useState<number | undefined>(targets?.[0]?.projectId ?? defaults?.projectId ?? k.inboxId)
  const [projectTouched, setProjectTouched] = useState(false)
  const [columnId, setColumnId] = useState<number | null>(defaults?.columnId ?? null)
  const [type, setType] = useState<TaskType>('task')
  const [priority, setPriority] = useState(0)
  const [due, setDue] = useState(defaults?.due ?? '')
  const [start, setStart] = useState(defaults?.time ?? '')
  const [end, setEnd] = useState('')
  const [duration, setDuration] = useState(defaults?.duration ?? 0)
  const [tags, setTags] = useState<string[]>([])
  const [assignees, setAssignees] = useState<PersonOption[]>([])
  const [repeat, setRepeat] = useState<RecurrencePreset>('none')
  const [mode, setMode] = useState<RecurrenceMode>('fixed')
  const [gtd, setGtd] = useState<GtdStatus | ''>('')
  const [waitNote, setWaitNote] = useState('')
  const [contextId, setContextId] = useState<number | ''>('')
  const [myDay, setMyDay] = useState(!!defaults?.myDay)
  const [subs, setSubs] = useState<string[]>([])
  const [subDraft, setSubDraft] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const project = k.projects.find((p) => p.id === projectId)
  const columns = useLoad<Column[]>(() => (project?.has_board && projectId ? safe(() => kaguyaApi.listColumns(projectId), []) : Promise.resolve([])), [projectId, project?.has_board])
  const cols = columns.state.status === 'ok' ? columns.state.data : []
  const contexts = useLoad<TaskContext[]>(() => safe(() => kaguyaApi.listContexts(), []), [])
  const ctxs = contexts.state.status === 'ok' ? contexts.state.data : []

  // No quadro do grupo cada lista tem a SUA coluna; senão vale a coluna de onde se clicou, ou a última escolhida na lista.
  const targetCol = targets?.find((t) => t.projectId === projectId)?.columnId
  useEffect(() => {
    if (targets) { setColumnId(targetCol ?? null); return }
    if (defaults?.columnId !== undefined && projectId === defaults.projectId) { setColumnId(defaults.columnId); return }
    setColumnId(projectId ? readCol(projectId) : null)
  }, [projectId, targetCol]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => taskParser(title), [title])
  const chips = useMemo(() => captureChips(parsed, k.today), [parsed, k.today])

  const options = useMemo(() => {
    if (targets) return targets.map((t) => ({ id: String(t.projectId), label: t.listName }))
    return listOptions(k.projects, k.groups)
  }, [targets, k.projects, k.groups])

  const dirty = !!(title.trim() || notes.trim() || subs.length || tags.length || assignees.length || due !== (defaults?.due ?? ''))
  const f = parsed.fields
  const effDue = due || f.dueDate || ''

  const create = async () => {
    const cleanTitle = f.title.trim()
    if (!cleanTitle) { toast('Escreva o título da tarefa.', { tone: 'error' }); return }
    const tokenProject = resolveProject(f.place, k.projects)
    const finalProject = projectTouched ? projectId : (tokenProject ?? projectId)
    const finalDue = effDue
    const finalStart = start || (due ? '' : f.dueTime ?? '')
    const finalDuration = duration || (f.duration && f.duration > 0 ? Math.round(f.duration) : 0)
    const finalTags = [...new Set([...tags, ...f.tags])]
    const recurrence = repeat !== 'none' && repeat !== 'custom' && finalDue ? { rrule: ruleFor(repeat, finalDue), mode } : f.recur ? { rrule: f.recur.rule, mode: f.recur.mode } : undefined
    if (repeat !== 'none' && !finalDue) { toast('Defina uma data de vencimento antes de repetir.', { tone: 'error' }); return }
    if (f.place && tokenProject === undefined && !projectTouched) toast(`Não achei a lista “${f.place}”. A tarefa foi para a lista escolhida.`)

    setSaving(true)
    try {
      const body: Parameters<typeof kaguyaApi.createTask>[0] = { title: cleanTitle, type }
      if (finalProject !== undefined) body.project_id = finalProject
      const pr = priority || f.priority || 0
      if (pr) body.priority = pr
      if (finalDue) body.due_date = finalDue
      if (finalStart && finalDue) body.due_time = finalStart
      if (finalTags.length) body.tags = finalTags
      if (assignees.length) body.person_ids = assignees.map((p) => p.id)
      if (notes.trim()) body.description = notes
      if (recurrence) body.recurrence = recurrence
      if (columnId !== null && finalProject === projectId && (project?.has_board || targets)) body.column_id = columnId
      const r = await kaguyaApi.createTask(body)
      const id = r.id as number

      const patch: Parameters<typeof kaguyaApi.updateTask>[1] = {}
      if (finalDuration) patch.duration_min = finalDuration
      if (gtd) patch.gtd_status = gtd
      if (gtd === 'waiting' && waitNote.trim()) patch.waiting_note = waitNote.trim()
      if (contextId !== '') patch.context_id = contextId
      if (Object.keys(patch).length) await kaguyaApi.updateTask(id, patch)

      if (finalStart && finalDue) {
        const s = timeToMin(finalStart)
        const e = end ? Math.max(timeToMin(end), s + 15) : s + (finalDuration || 30)
        await kaguyaApi.setTimeBlock(id, { start_at: localISO(finalDue, s), end_at: localISO(finalDue, e) })
      }
      for (const s of subs) await kaguyaApi.createTask({ title: s, parent_id: id, project_id: finalProject })
      if (myDay) await kaguyaApi.addToMyDay(id)
      if (finalProject && columnId !== null && !targets) { try { localStorage.setItem(colKey(finalProject), String(columnId)) } catch { /* sem armazenamento */ } }

      k.reload()
      toast('Tarefa criada.', { tone: 'success' })
      onClose()
      k.openTask(id)
    } catch (e) {
      toast(reason(e, 'Não foi possível criar a tarefa.'), { tone: 'error' })
    } finally { setSaving(false) }
  }

  const addSub = () => { const t = subDraft.trim(); if (t) { setSubs((s) => [...s, t]); setSubDraft('') } }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void create() } }

  return (
    <Modal
      title="Nova tarefa"
      size="xl"
      dirty={dirty}
      onClose={onClose}
      footer={<>
        <span className="kn-nt-hint ds-hint">Ctrl+Enter para criar</span>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon="add" disabled={saving || !f.title.trim()} onClick={() => void create()}>{saving ? 'Criando…' : 'Criar tarefa'}</Button>
      </>}
    >
      <div onKeyDown={onKey}>
       <TaskFormLayout
        fields={(
         <>
          <Field label="Título" hint={chips.length ? undefined : 'Dica: @lista #etiqueta !alta amanhã 17h toda sexta 45min'}>{(c) => (
            <Input {...c} autoFocus value={title} placeholder="O que precisa ser feito?" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); void create() } }} />
          )}</Field>
          {chips.length > 0 && (
            <p className="kn-nt-chips" aria-live="polite"><span className="ds-hint">Entendi:</span>{chips.map((c) => <span key={c.id} className="kn-tag">{c.label}</span>)}</p>
          )}

          <div className="kn-props">
            <Field label="Lista">{(c) => (
              <ListPicker id={c.id} value={projectId !== undefined ? String(projectId) : null} options={options} onChange={(v) => { setProjectId(Number(v)); setProjectTouched(true) }} />
            )}</Field>
            {(project?.has_board || targets) && (
              targets
                ? null
                : cols.length > 0 && (
                  <Field label="Coluna do quadro">{(c) => (
                    <Select {...c} value={columnId ?? ''} onChange={(e) => setColumnId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Primeira coluna</option>
                      {cols.map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                    </Select>
                  )}</Field>
                )
            )}
          </div>

          <Field label="Tipo">{() => <SegmentedControl<TaskType> label="Tipo" value={type} options={TYPES} onChange={setType} />}</Field>
          <Field label="Prioridade">{() => (
            <SegmentedControl label="Prioridade" value={String(priority)} options={[0, 1, 2, 3].map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] }))} onChange={(v) => setPriority(Number(v))} />
          )}</Field>

          <div className="kn-props">
            <Field label="Data">{(c) => (
              <span className="kn-quick-i">
                <DatePicker id={c.id} value={due} onChange={setDue} />
                {due && <IconButton icon="close" label="Remover data" onClick={() => { setDue(''); setStart(''); setEnd(''); setRepeat('none') }} />}
              </span>
            )}</Field>
            <Field label="Duração">{(c) => (
              <Select {...c} value={DURATIONS.some((d) => d.v === duration) ? duration : 0} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </Select>
            )}</Field>
          </div>

          <Field label="Horário" hint={effDue ? 'Com horário, vira um bloco no calendário.' : 'Escolha a data para marcar um horário.'}>{() => (
            <div className="kn-quick">
              {start ? (
                <>
                  <TimePicker value={start} onChange={setStart} />
                  <span>até</span>
                  <TimePicker value={end || start} onChange={setEnd} />
                  <IconButton icon="close" label="Tirar o horário" onClick={() => { setStart(''); setEnd('') }} />
                </>
              ) : <Button size="sm" icon="clock" disabled={!effDue} onClick={() => setStart('09:00')}>Marcar horário</Button>}
            </div>
          )}</Field>

          <div className="kn-props">
            <Field label="Repete">{(c) => (
              <Select {...c} value={repeat} disabled={!effDue} onChange={(e) => setRepeat(e.target.value as RecurrencePreset)}>
                {presetLabels(effDue || null).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}</Field>
            {repeat !== 'none' && (
              <Field label="A série se repete">{() => (
                <SegmentedControl<RecurrenceMode> label="Modo da repetição" value={mode} options={[{ value: 'fixed', label: 'Data fixa' }, { value: 'after_completion', label: 'Após concluir' }]} onChange={setMode} />
              )}</Field>
            )}
          </div>

          <Field label="Etiquetas">{(c) => <TagInput id={c.id} value={tags} onChange={setTags} />}</Field>
          <Field label="Pessoas" hint="Quem participa ou responde por esta tarefa (cadastro da Komi).">{(c) => (
            <PersonPicker id={c.id} value={assignees} onChange={setAssignees} search={people.search} onCreate={people.create} />
          )}</Field>

          <div className="kn-props">
            <Field label="Classificação GTD">{(c) => (
              <Select {...c} value={gtd} onChange={(e) => setGtd(e.target.value as GtdStatus | '')}>
                {GTD.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}</Field>
            <Field label="Onde (@)" hint="Onde a tarefa pode ser feita.">{(c) => (
              <Select {...c} value={contextId} onChange={(e) => setContextId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Sem local</option>
                {ctxs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}</Field>
          </div>
          {gtd === 'waiting' && (
            <Field label="Aguardando quem/o quê">{(c) => <Input {...c} value={waitNote} placeholder="Ex.: resposta do cliente" onChange={(e) => setWaitNote(e.target.value)} />}</Field>
          )}
          <div className="kn-nt-myday">
            <span>Colocar no Meu Dia</span>
            <Toggle label="Colocar no Meu Dia" checked={myDay} onChange={setMyDay} />
          </div>
         </>
        )}
        side={(
         <>
          <Field label="Notas">{() => <MarkdownEditor value={notes} onChange={setNotes} label="Notas" placeholder="Notas, links e checklists em Markdown…" />}</Field>
          <section aria-label="Subtarefas" className="kn-subs">
            <h3 className="kn-h3">Subtarefas</h3>
            {subs.length > 0 && (
              <ul className="kn-sublist">
                {subs.map((s, i) => (
                  <li key={`${s}-${i}`}>
                    <span className="kn-title">{s}</span>
                    <IconButton icon="close" label={`Remover a subtarefa ${s}`} onClick={() => setSubs((cur) => cur.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ul>
            )}
            <Input aria-label="Nova subtarefa" placeholder="Adicionar subtarefa e Enter" value={subDraft} onChange={(e) => setSubDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); addSub() } }} />
          </section>
         </>
        )}
       />
      </div>
    </Modal>
  )
}
