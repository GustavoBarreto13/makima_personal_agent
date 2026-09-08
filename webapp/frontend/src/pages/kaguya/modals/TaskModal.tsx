// TaskModal — criar/editar uma tarefa (guia §9.2 + reforma do modal de tarefa).
//
// Anatomia nova:
//   • Zona essencial (sempre visível): título, lista+tipo, prioridade, data
//     início/fim, início·fim·estimativa, tags, pessoas.
//   • Gaveta "Mais opções" (recolhível): repetir, GTD, contexto, sinalizadores.
//   • Coluna direita: editor de notas Markdown (inalterado).
//
// Na CRIAÇÃO o campo de título aceita a mesma sintaxe do quick-add da visão de
// Lista (@lista !alta #tag amanhã 15h toda segunda) — os tokens reconhecidos
// pintam no mirror e preenchem os campos correspondentes automaticamente.

import { useState, useEffect, useMemo } from 'react'
import type { Task, Project, Group, TaskType, RecurrenceMode, Tag, GtdStatus, TaskContext, TaskFocusSummary } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { AvatarStack } from '../components/People'
import { DatePicker } from '../components/DatePicker'
import { TimePicker } from '../components/TimePicker'
import { DURATIONS, snapDuration } from '../lib/durations'
import { localISO } from '../lib/dateUtils'
import { MarkdownNotesEditor } from '../components/MarkdownNotesEditor'
import { PersonSearch } from '../components/PersonSearch'
import { ProjectSelectOptions } from '../components/ProjectSelectOptions'
import { parseTask } from '../../../lib/parseTask'
import { applyStart, applyEnd, applyEstimate, type TimeBlockState } from '../lib/timeBlock'

// Presets de recorrência expostos na UI (mapeiam para RRULE no buildRRule).
type RecurFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
const RECUR_OPTS: { v: RecurFreq; label: string }[] = [
  { v: 'none', label: 'Não repete' }, { v: 'daily', label: 'Diária' },
  { v: 'weekly', label: 'Semanal' }, { v: 'monthly', label: 'Mensal' }, { v: 'yearly', label: 'Anual' },
]

// Deriva o preset a partir de uma RRULE existente (para abrir o modal no estado certo).
function rruleToFreq(rrule?: string | null): RecurFreq {
  if (!rrule) return 'none'
  if (rrule.includes('YEARLY')) return 'yearly'
  if (rrule.includes('MONTHLY')) return 'monthly'
  if (rrule.includes('WEEKLY')) return 'weekly'
  if (rrule.includes('DAILY')) return 'daily'
  return 'none'
}

// Monta a RRULE a partir do preset + data (semanal/mensal derivam o dia da data escolhida).
function buildRRule(freq: RecurFreq, due: string): string | null {
  if (freq === 'daily') return 'FREQ=DAILY'
  if (freq === 'yearly') return 'FREQ=YEARLY'
  if (!due) return null
  const d = new Date(`${due}T00:00:00`)
  if (freq === 'weekly') return `FREQ=WEEKLY;BYDAY=${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getDay()]}`
  if (freq === 'monthly') return `FREQ=MONTHLY;BYMONTHDAY=${d.getDate()}`
  return null
}

// Alvo de coluna para o "+ Adicionar tarefa" do Kanban de grupo: uma lista-membro
// da coluna unificada + o column_id daquela lista. O <select> de Lista fica restrito
// a estes alvos e a escolha define a coluna efetiva na criação.
export interface ColumnTarget {
  projectId: number
  columnId: number
  listName: string
}

interface TaskModalProps {
  mode: 'create' | 'edit'
  task?: Task
  projects: Project[]
  groups: Group[]
  defaultProjectId?: number | null
  defaults?: {
    dueDate?: string
    dueTime?: string
    duration?: number
    columnId?: number             // Kanban de lista: cria direto nesta coluna
    columnTargets?: ColumnTarget[] // Kanban de grupo: lista-alvo escolhida define a coluna
    pickMemoryKey?: string        // localStorage p/ lembrar a lista escolhida (grupo)
  }
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
  onPromote?: (task: Task) => Promise<void>
  onOpenTask?: (task: Task) => void
  onFocus?: (task: Task) => void
}

const PRIORITIES = [
  { v: 0, label: 'Nenhuma', cls: '' }, { v: 1, label: 'Baixa', cls: 'p1' },
  { v: 2, label: 'Média', cls: 'p2' }, { v: 3, label: 'Alta', cls: 'p3' },
]
const TYPES: { v: TaskType; label: string }[] = [
  { v: 'task', label: 'Tarefa' }, { v: 'event', label: 'Evento' }, { v: 'birthday', label: 'Aniversário' },
]
const TAG_COLORS = [
  'oklch(0.62 0.20 25)', 'oklch(0.70 0.16 60)', 'oklch(0.74 0.13 95)', 'oklch(0.62 0.16 150)',
  'oklch(0.60 0.13 230)', 'oklch(0.58 0.20 290)', 'oklch(0.64 0.21 350)',
]

// "HH:MM" → minuto do dia; null se vazio.
function hhmmMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

// Parte de data/hora LOCAL de um ISO 8601 (qualquer offset). Vazio se ausente.
function localDatePart(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localTimePart(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TaskModal({ mode, task, projects, groups, defaultProjectId, defaults, onClose, onSaved, toast, onPromote, onOpenTask, onFocus }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [projectId, setProjectId] = useState<number | null>(task?.project_id ?? defaultProjectId ?? null)
  const [priority, setPriority] = useState(task?.priority ?? 0)
  const [type, setType] = useState<TaskType>(task?.type ?? 'task')
  const [gtdStatus, setGtdStatus] = useState<GtdStatus | null>(task?.gtd_status ?? null)
  const [waitingNote, setWaitingNote] = useState(task?.waiting_note ?? '')
  const [contextId, setContextId] = useState<number | null>(task?.context_id ?? null)
  const [contexts, setContexts] = useState<TaskContext[]>([])
  const [dueDate, setDueDate] = useState(task?.due_date ?? defaults?.dueDate ?? '')
  // Data de fim — deriva da parte de data (local) do end_at do time-block existente.
  const [endDate, setEndDate] = useState(localDatePart(task?.end_at))
  // Hora de início (= due_time) e hora de fim (= parte de hora local do end_at).
  // O time-block nasce no save quando há início+fim, ou quando a data de fim difere.
  const [startTime, setStartTime] = useState(task?.due_time ?? defaults?.dueTime ?? '')
  const [endTime, setEndTime] = useState(localTimePart(task?.end_at))
  const [recurFreq, setRecurFreq] = useState<RecurFreq>(rruleToFreq(task?.recurrence?.rrule))
  const [recurMode, setRecurMode] = useState<RecurrenceMode>(task?.recurrence?.mode ?? 'fixed')
  const [tags, setTags] = useState<string[]>(task?.tags?.map((t) => t.name) ?? [])
  const [newTag, setNewTag] = useState('')
  const [tagCatalog, setTagCatalog] = useState<Tag[]>(task?.tags ?? [])
  const [paletteFor, setPaletteFor] = useState<string | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>(task?.subtasks ?? [])
  const [newSub, setNewSub] = useState('')
  const [saving, setSaving] = useState(false)
  const [duration, setDuration] = useState<number>(snapDuration(task?.duration_min ?? defaults?.duration ?? 0))
  const [personIds, setPersonIds] = useState<string[]>(task?.assignees?.map(a => a.id) ?? [])
  const [askDelete, setAskDelete] = useState(false)
  const [focusSummary, setFocusSummary] = useState<TaskFocusSummary | null>(null)
  const isRecurring = task?.recurrence?.active === true

  // Gaveta "Mais opções" — estado lembrado entre tarefas.
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('kg:taskmodal:more') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('kg:taskmodal:more', moreOpen ? '1' : '0') } catch { /* ignore */ }
  }, [moreOpen])

  // ── Parser do título (só na criação) — igual ao quick-add da Lista ──────────
  const parsedTitle = useMemo(
    () => (mode === 'create' ? parseTask(title) : null),
    [title, mode],
  )

  // Preenche os campos a partir dos tokens reconhecidos. Aditivo: só sobrescreve
  // uma dimensão quando o token dela está presente; nunca zera o que o usuário
  // ajustou à mão e nunca remove tags/pessoas.
  useEffect(() => {
    if (!parsedTitle) return
    if (parsedTitle.priority != null) setPriority(parsedTitle.priority)
    if (parsedTitle.dueDate) setDueDate(parsedTitle.dueDate)
    if (parsedTitle.dueTime) setStartTime(parsedTitle.dueTime)
    if (parsedTitle.tags.length) {
      setTags((prev) => {
        const lower = new Set(prev.map((t) => t.toLowerCase()))
        const add = parsedTitle.tags.filter((t) => !lower.has(t.toLowerCase()))
        return add.length ? [...prev, ...add] : prev
      })
    }
    if (parsedTitle.recur) {
      setRecurFreq(rruleToFreq(parsedTitle.recur.rule))
      setRecurMode(parsedTitle.recur.mode)
    }
    if (parsedTitle.projectToken) {
      const n = parsedTitle.projectToken.toLowerCase()
      const proj = projects.find((p) => p.name.toLowerCase() === n)
        ?? projects.find((p) => p.name.toLowerCase().startsWith(n))
      if (proj) setProjectId(proj.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedTitle])

  const isBirthday = type === 'birthday'

  // ── Coluna-alvo na criação (Kanban) ──────────────────────────────────────────
  // Kanban de grupo: o <select> de Lista fica restrito aos alvos e a lista
  // escolhida (projectId) resolve o column_id. Kanban de lista: coluna fixa.
  const columnTargets = defaults?.columnTargets ?? null
  const effectiveColumnId: number | undefined = columnTargets
    ? columnTargets.find((t) => t.projectId === projectId)?.columnId
    : defaults?.columnId

  // ── Layout do editor de notas (preferência global) ────────────────────────
  const NOTE_MIN = 300, NOTE_MAX = 720, NOTE_DEFAULT = 420
  const [notesCollapsed, setNotesCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('kg:notes:collapsed') === '1' } catch { return false }
  })
  const [noteWidth, setNoteWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('kg:notes:width'))
      if (Number.isFinite(raw) && raw > 0) return Math.min(NOTE_MAX, Math.max(NOTE_MIN, raw))
    } catch { /* ignore */ }
    return NOTE_DEFAULT
  })
  useEffect(() => {
    try { localStorage.setItem('kg:notes:collapsed', notesCollapsed ? '1' : '0') } catch { /* ignore */ }
  }, [notesCollapsed])
  useEffect(() => {
    try { localStorage.setItem('kg:notes:width', String(noteWidth)) } catch { /* ignore */ }
  }, [noteWidth])

  const startResize = (startX: number, baseWidth: number) => {
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(NOTE_MAX, Math.max(NOTE_MIN, baseWidth + (startX - ev.clientX)))
      setNoteWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const openMentionedTask = async (id: number) => {
    try {
      const fetched = await kaguyaApi.getTask(id)
      if (fetched && onOpenTask) {
        onClose()
        onOpenTask(fetched as Task)
      }
    } catch {
      toast('Não foi possível abrir a tarefa referenciada.', 'err')
    }
  }

  useEffect(() => {
    kaguyaApi.listTags().then(setTagCatalog).catch(() => { /* silencioso */ })
    kaguyaApi.listContexts().then(setContexts).catch(() => { /* silencioso */ })
    if (mode === 'edit' && task) {
      kaguyaApi.focus.taskSummary(task.id).then(setFocusSummary).catch(() => { /* silencioso */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Espelhamento início · fim · estimativa ────────────────────────────────
  const tbState = (): TimeBlockState => ({
    startDate: dueDate, endDate, startTime, endTime, durationMin: duration,
  })
  const applyPatch = (patch: ReturnType<typeof applyStart>) => {
    if (patch.startTime != null) setStartTime(patch.startTime)
    if (patch.endTime != null) setEndTime(patch.endTime)
    if (patch.durationMin != null) setDuration(patch.durationMin)
  }
  const onStartTime = (v: string) => applyPatch(applyStart(tbState(), v))
  const onEndTime = (v: string) => applyPatch(applyEnd(tbState(), v))
  const onEstimate = (min: number) => applyPatch(applyEstimate(tbState(), min))

  // Ao mudar a data de início, se a de fim ficaria antes, arrasta-a junto.
  const onStartDate = (iso: string) => {
    setDueDate(iso)
    if (endDate && iso && endDate < iso) setEndDate(iso)
    if (!iso) { setStartTime(''); setEndTime(''); setEndDate('') }
  }
  const onEndDate = (iso: string) => {
    if (iso && dueDate && iso < dueDate) { setEndDate(dueDate); return }
    setEndDate(iso)
  }

  const save = async () => {
    // O título salvo é o texto limpo do parser (tokens fora) na criação.
    const cleanTitle = (parsedTitle ? parsedTitle.title : title).trim()
    if (!cleanTitle) { toast('O título não pode ser vazio.', 'err'); return }
    if (type !== 'birthday' && recurFreq !== 'none' && !dueDate) {
      toast('Recorrência precisa de uma data de vencimento.', 'err'); return
    }
    setSaving(true)
    try {
      const base = {
        title: cleanTitle,
        description: description || null,
        priority,
        type,
        due_date: dueDate || null,
        due_time: startTime || null,
      }
      const rrule = type !== 'birthday' && recurFreq !== 'none' ? buildRRule(recurFreq, dueDate) : null

      let taskId: number | undefined

      if (mode === 'create') {
        const r = await kaguyaApi.createTask({
          ...base,
          project_id: projectId ?? undefined,
          column_id: effectiveColumnId,
          tags,
          person_ids: personIds.length > 0 ? personIds : undefined,
          ...(rrule ? { recurrence: { rrule, mode: recurMode } } : {}),
        })
        taskId = r.id
        toast('Tarefa criada.')

        // GTD/contexto não são aceitos no create_task — aplica num PATCH de
        // follow-up (mesmo padrão do time-block abaixo), só quando algo foi escolhido.
        const gtdPatch: Parameters<typeof kaguyaApi.updateTask>[1] = {}
        if (gtdStatus) gtdPatch.gtd_status = gtdStatus
        if (gtdStatus === 'waiting' && waitingNote.trim()) gtdPatch.waiting_note = waitingNote.trim()
        if (contextId != null) gtdPatch.context_id = contextId
        if (taskId && Object.keys(gtdPatch).length > 0) {
          try { await kaguyaApi.updateTask(taskId, gtdPatch) }
          catch { toast('Classificação GTD não foi salva (o restante foi salvo).', 'err') }
        }

        // Kanban de grupo: lembra a lista usada para pré-selecionar da próxima vez.
        if (defaults?.pickMemoryKey && projectId != null) {
          try { localStorage.setItem(defaults.pickMemoryKey, String(projectId)) } catch { /* ignore */ }
        }
      } else if (task) {
        taskId = task.id
        const upd: Parameters<typeof kaguyaApi.updateTask>[1] = {
          ...base,
          project_id: projectId ?? undefined,
          tags,
          person_ids: personIds,
          duration_min: duration > 0 ? duration : null,
          gtd_status: gtdStatus,
          ...(gtdStatus === 'waiting' ? { waiting_note: waitingNote || null } : {}),
          context_id: contextId,
        }
        if (rrule) upd.recurrence = { rrule, mode: recurMode }
        else if (task.recurrence && type !== 'birthday') upd.clear_recurrence = true
        await kaguyaApi.updateTask(task.id, upd)
        toast('Tarefa atualizada.')
      }

      // ── Bloco de tempo (time-blocking) ────────────────────────────────────
      // Existe um bloco quando há data + (início & fim de hora) OU quando a
      // data de fim difere da de início (evento de vários dias).
      if (taskId) {
        const multiDay = !!(dueDate && endDate && endDate !== dueDate)
        const hasBlock = !!dueDate && ((!!startTime && !!endTime) || multiDay)
        try {
          if (hasBlock) {
            const startMin = startTime ? hhmmMin(startTime)! : 0
            const endMin = endTime ? hhmmMin(endTime)! : (multiDay ? 23 * 60 + 59 : startMin + (duration || 30))
            const startAt = localISO(dueDate, startMin)
            const endAt = localISO(endDate || dueDate, endMin)
            await kaguyaApi.setTimeBlock(taskId, {
              start_at: startAt,
              end_at: endAt,
              ...(duration > 0 ? { duration_min: duration } : {}),
            })
          } else if (duration > 0 && mode === 'create') {
            await kaguyaApi.setEstimate(taskId, duration)
          } else if (duration === 0 && !endTime && !endDate && task?.start_at) {
            await kaguyaApi.clearTimeBlock(taskId)
          }
        } catch {
          toast('Horários não foram salvos (o restante foi salvo).', 'err')
        }
      }

      onSaved()
      onClose()
    } catch {
      toast('Não foi possível salvar.', 'err')
    } finally {
      setSaving(false)
    }
  }

  const endSeries = async () => {
    if (!task) return
    try {
      await kaguyaApi.complete(task.id, true, true)
      toast('Série encerrada.')
      onSaved(); onClose()
    } catch { toast('Falha ao encerrar a série.', 'err') }
  }

  const doDelete = async (scope: 'this' | 'series') => {
    if (!task) return
    try {
      await kaguyaApi.remove(task.id, scope)
      toast('Tarefa excluída.')
      onSaved(); onClose()
    } catch { toast('Falha ao excluir.', 'err') }
  }

  const addTag = () => {
    const name = newTag.trim().replace(/^#+/, '').trim()
    if (!name) return
    if (!tags.some((t) => t.toLowerCase() === name.toLowerCase())) setTags([...tags, name])
    setNewTag('')
  }

  const tagColor = (name: string): string | null => {
    const g = tagCatalog.find((x) => x.name.toLowerCase() === name.toLowerCase())
    return g?.color ?? null
  }

  const setTagColor = async (name: string, color: string) => {
    setPaletteFor(null)
    const colorVal = color || null
    const existing = tagCatalog.find((x) => x.name.toLowerCase() === name.toLowerCase())
    try {
      if (existing) {
        await kaguyaApi.updateTag(existing.id, { color })
        setTagCatalog(tagCatalog.map((x) => (x.id === existing.id ? { ...x, color: colorVal } : x)))
      } else if (color) {
        const r = await kaguyaApi.createTag({ name, color })
        if (r.id) setTagCatalog([...tagCatalog, { id: r.id, name, color: colorVal }])
      }
    } catch {
      toast('Não foi possível mudar a cor da tag.', 'err')
    }
  }

  const addSub = async () => {
    if (!task || !newSub.trim()) return
    try {
      const r = await kaguyaApi.createTask({ title: newSub.trim(), parent_id: task.id })
      setSubtasks([...subtasks, { id: r.id!, title: newSub.trim(), priority: 0, description: null, type: 'task', project_id: task.project_id, column_id: null, parent_id: task.id, due_date: null, due_time: null, position: 0, completed_at: null, created_at: '', my_day_date: null, start_at: null, end_at: null, duration_min: null }])
      setNewSub('')
    } catch { toast('Falha ao adicionar subtarefa.', 'err') }
  }

  const patchSub = async (id: number, patch: Partial<Task>) => {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await kaguyaApi.updateTask(id, patch as never) } catch { toast('Falha ao salvar subtarefa.', 'err') }
  }

  const removeSub = async (id: number) => {
    setSubtasks(subtasks.filter((s) => s.id !== id))
    try { await kaguyaApi.remove(id) } catch { toast('Falha ao excluir subtarefa.', 'err') }
  }

  // Resumo da gaveta "Mais opções".
  const moreSummaryParts: string[] = []
  if (recurFreq !== 'none') moreSummaryParts.push('repete ' + (RECUR_OPTS.find(r => r.v === recurFreq)?.label.toLowerCase() ?? ''))
  if (gtdStatus) moreSummaryParts.push({ next_action: 'próxima ação', waiting: 'aguardando', someday: 'algum dia' }[gtdStatus] ?? '')
  if (contextId) moreSummaryParts.push('contexto')
  const moreSummary = moreSummaryParts.filter(Boolean).join(' · ') || 'nada definido'

  const sameDay = !endDate || endDate === dueDate
  const tbHint = !dueDate
    ? 'Defina uma data para marcar horários. Sem hora, só a estimativa é usada (Meu Dia).'
    : !sameDay
      ? 'Evento de vários dias — início e fim marcam os extremos; a estimativa fica independente.'
      : !startTime
        ? 'Sem hora de início: só a estimativa conta. Escolha um início para virar bloco na agenda.'
        : 'Início/fim e estimativa se espelham (fim − início).'

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className={`kg-modal kg-modal-wide${notesCollapsed ? ' kg-notes-collapsed' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova tarefa' : 'Editar tarefa'}</h3>
          {mode === 'edit' && task && onFocus && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              {focusSummary != null && focusSummary.sessoes > 0 && (
                <span
                  className="kg-page-sub"
                  style={{ fontSize: 11 }}
                  title={`${focusSummary.sessoes} sessão${focusSummary.sessoes === 1 ? '' : 'ões'} concluída${focusSummary.sessoes === 1 ? '' : 's'}`}
                >
                  ⏱ {focusSummary.total_min < 60
                    ? `${focusSummary.total_min}min`
                    : `${Math.floor(focusSummary.total_min / 60)}h${String(focusSummary.total_min % 60).padStart(2, '0')}`} focados
                </span>
              )}
              <button
                className="kg-icon-btn"
                style={{ border: 'none', padding: 4 }}
                onClick={() => onFocus(task)}
                aria-label="Focar nesta tarefa"
                title="Focar nesta tarefa"
              >
                <Icon name="clock" size={15} />
              </button>
            </div>
          )}
          {notesCollapsed && (
            <button
              className={`kg-icon-btn kg-notes-reopen${description.trim() ? ' has-note' : ''}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => setNotesCollapsed(false)}
              aria-label="Mostrar notas"
              title="Mostrar notas"
            >
              <Icon name="note" />
            </button>
          )}
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-split">

          <div className="kg-modal-body">
            {mode === 'edit' && task && task.parent_id !== null && (
              <div className="parent-banner">
                <Icon name="arrowUpRight" size={13} />
                <span>Subtarefa de <b>{task.parent_title ?? `#${task.parent_id}`}</b></span>
                {onPromote && (
                  <button type="button" className="pb-promote" onClick={async () => { await onPromote(task); onClose() }}>
                    Tornar independente
                  </button>
                )}
              </div>
            )}

            {/* ── Título ───────────────────────────────────────────────────── */}
            <div className="kg-field">
              <span className="kg-field-label">Título</span>
              {mode === 'create' && parsedTitle ? (
                <>
                  <div className={`kg-qa-wrap kg-tm-title${title.trim() ? ' typing' : ''}`}>
                    <div className="kg-mirror" aria-hidden="true">
                      {parsedTitle.segments.map((s, i) => <span key={i} className={s.cls}>{s.text}</span>)}
                    </div>
                    <input
                      className="kg-qa-input"
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="O que precisa ser feito? — aceita @lista !alta #tag amanhã 15h"
                    />
                  </div>
                  {(parsedTitle.projectToken || parsedTitle.priority != null || parsedTitle.dueDate || parsedTitle.tags.length > 0 || parsedTitle.recur) && (
                    <span className="kg-tm-title-hint">
                      Reconhecido:{' '}
                      {[
                        parsedTitle.projectToken && `@${parsedTitle.projectToken}`,
                        parsedTitle.priority != null && `prioridade ${['', 'baixa', 'média', 'alta'][parsedTitle.priority]}`,
                        parsedTitle.dueDate && (parsedTitle.dueDate.slice(8) + '/' + parsedTitle.dueDate.slice(5, 7) + (parsedTitle.dueTime ? ` ${parsedTitle.dueTime}` : '')),
                        parsedTitle.recur && `↺ ${parsedTitle.recur.label}`,
                        ...parsedTitle.tags.map((t) => `#${t}`),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </>
              ) : (
                <input className="kg-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />
              )}
            </div>

            {/* ── Lista + Tipo ─────────────────────────────────────────────── */}
            <div className="kg-field-row">
              <div className="kg-field">
                <span className="kg-field-label">Lista</span>
                <select className="kg-select" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}>
                  {columnTargets
                    ? columnTargets.map((t) => <option key={t.projectId} value={t.projectId}>{t.listName}</option>)
                    : <ProjectSelectOptions projects={projects} groups={groups} inbox={{ label: 'Inbox', value: '' }} />}
                </select>
              </div>
              <div className="kg-field">
                <span className="kg-field-label">Tipo</span>
                <div className="kg-segment">
                  {TYPES.map((t) => (
                    <button key={t.v} className={`kg-seg-opt${type === t.v ? ' active' : ''}`} onClick={() => setType(t.v)}>{t.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Prioridade ──────────────────────────────────────────────── */}
            <div className="kg-field">
              <span className="kg-field-label">Prioridade</span>
              <div className="kg-segment">
                {PRIORITIES.map((p) => (
                  <button key={p.v} className={`kg-seg-opt ${p.cls}${priority === p.v ? ' active' : ''}`} onClick={() => setPriority(p.v)}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* ── Data início / fim ───────────────────────────────────────── */}
            <div className="kg-field-row">
              <div className="kg-field">
                <span className="kg-field-label">Data início</span>
                <DatePicker value={dueDate} onChange={onStartDate} placeholder="Sem data" />
              </div>
              <div className="kg-field">
                <span className="kg-field-label">Data fim</span>
                <DatePicker
                  value={endDate}
                  onChange={onEndDate}
                  disabled={!dueDate}
                  placeholder={dueDate ? 'Mesmo dia' : '—'}
                />
              </div>
            </div>

            {/* ── Início · Fim · Estimativa ──────────────────────────────── */}
            <div className="kg-field">
              <span className="kg-field-label">Início · Fim · Estimativa</span>
              <div className="kg-tm-timeblock">
                <TimePicker value={startTime} onChange={onStartTime} disabled={!dueDate} placeholder="Início" />
                <span className="kg-tm-arrow">→</span>
                <TimePicker value={endTime} onChange={onEndTime} disabled={!dueDate || !startTime} placeholder="Fim" />
                <select className="kg-select kg-tm-est" value={duration} onChange={(e) => onEstimate(Number(e.target.value))}>
                  {DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
                </select>
              </div>
              <span className="kg-tm-hint">{tbHint}</span>
            </div>

            {/* ── Tags ────────────────────────────────────────────────────── */}
            <div className="kg-field">
              <span className="kg-field-label">Tags</span>
              <div className="kg-tag-edit">
                {tags.map((t) => {
                  const c = tagColor(t)
                  const chipStyle = c ? { color: c, borderColor: c } : undefined
                  return (
                    <span key={t} className="kg-chip kg-chip-tag kg-tag-chip-edit" style={chipStyle}>
                      <button
                        type="button"
                        className="kg-tag-swatch"
                        style={{ background: c ?? 'transparent' }}
                        onClick={() => setPaletteFor(paletteFor === t ? null : t)}
                        aria-label={`Mudar a cor da tag ${t}`}
                      />
                      #{t}
                      <button className="kg-tag-x" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remover ${t}`}>×</button>
                      {paletteFor === t && (
                        <div className="kg-tag-palette">
                          {TAG_COLORS.map((col) => (
                            <button key={col} type="button" className="kg-tag-palette-opt" style={{ background: col }} onClick={() => setTagColor(t, col)} aria-label={`Definir cor ${col}`} />
                          ))}
                          <button type="button" className="kg-tag-palette-opt kg-tag-palette-none" onClick={() => setTagColor(t, '')} aria-label="Sem cor">×</button>
                        </div>
                      )}
                    </span>
                  )
                })}
                <input
                  className="kg-input kg-tag-input"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Adicionar tag + Enter"
                />
              </div>
            </div>

            {/* ── Pessoas ─────────────────────────────────────────────────── */}
            <div className="kg-field">
              <span className="kg-field-label">Pessoas</span>
              <span className="kg-tm-title-hint">Responsáveis pela tarefa — ou quem vai com você num evento (acompanhantes, participantes).</span>
              <PersonSearch selected={personIds} onChange={setPersonIds} toast={toast} />
            </div>

            {/* ── Gaveta "Mais opções" ───────────────────────────────────── */}
            <div className="kg-tm-more">
              <button type="button" className={`kg-tm-more-head${moreOpen ? ' open' : ''}`} onClick={() => setMoreOpen(!moreOpen)}>
                <Icon name="chevron" size={13} />
                <span className="kg-tm-more-lbl">Mais opções</span>
                <span className="kg-tm-more-summ">{moreSummary}</span>
              </button>

              {moreOpen && (
                <div className="kg-tm-more-body">
                  {/* Repetir */}
                  {isBirthday ? (
                    <div className="kg-field">
                      <span className="kg-field-label">Repetir</span>
                      <div className="kg-hint">🎂 Aniversários repetem todo ano automaticamente.</div>
                    </div>
                  ) : (
                    <div className="kg-field">
                      <span className="kg-field-label">Repetir</span>
                      <div className="kg-segment">
                        {RECUR_OPTS.map((r) => (
                          <button key={r.v} className={`kg-seg-opt${recurFreq === r.v ? ' active' : ''}`} onClick={() => setRecurFreq(r.v)}>{r.label}</button>
                        ))}
                      </div>
                      {recurFreq !== 'none' && (
                        <div className="kg-segment" style={{ marginTop: 6 }}>
                          <button className={`kg-seg-opt${recurMode === 'fixed' ? ' active' : ''}`} onClick={() => setRecurMode('fixed')}>Data fixa</button>
                          <button className={`kg-seg-opt${recurMode === 'after_completion' ? ' active' : ''}`} onClick={() => setRecurMode('after_completion')}>Após concluir</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status GTD — disponível na criação e na edição */}
                  <div className="kg-field">
                    <span className="kg-field-label">Status GTD</span>
                    <div className="kg-segment">
                      <button className={`kg-seg-opt${gtdStatus === null ? ' active' : ''}`} onClick={() => setGtdStatus(null)}>Não classificada</button>
                      <button className={`kg-seg-opt${gtdStatus === 'next_action' ? ' active' : ''}`} onClick={() => setGtdStatus('next_action')}>Próxima ação</button>
                      <button className={`kg-seg-opt${gtdStatus === 'waiting' ? ' active' : ''}`} onClick={() => setGtdStatus('waiting')}>Aguardando</button>
                      <button className={`kg-seg-opt${gtdStatus === 'someday' ? ' active' : ''}`} onClick={() => setGtdStatus('someday')}>Algum dia</button>
                    </div>
                    {gtdStatus === 'waiting' && (
                      <div style={{ marginTop: 8 }}>
                        <input className="kg-input" value={waitingNote} onChange={(e) => setWaitingNote(e.target.value)} placeholder="Por quem/o quê espera (opcional)" />
                        {task?.waiting_since && (
                          <p className="kg-muted" style={{ marginTop: 4 }}>
                            Aguardando desde {new Date(task.waiting_since).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contexto — disponível na criação e na edição */}
                  <div className="kg-field">
                    <span className="kg-field-label">Contexto</span>
                    <select className="kg-select" value={contextId ?? ''} onChange={(e) => setContextId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Sem contexto</option>
                      {contexts.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
                    </select>
                  </div>

                  {/* Sinalizadores — leitura */}
                  <div className="kg-field">
                    <span className="kg-field-label">Sinalizadores</span>
                    <div className="kg-tm-flags">
                      <span className={recurFreq !== 'none' ? 'set' : ''}>Recorrente · {recurFreq !== 'none' ? 'sim' : 'não'}</span>
                      <span className={description.trim() ? 'set' : ''}>Tem descrição · {description.trim() ? 'sim' : 'não'}</span>
                      <span className={(dueDate && startTime && endTime) || (endDate && endDate !== dueDate) ? 'set' : ''}>
                        Vira bloco na agenda · {(dueDate && startTime && endTime) || (endDate && endDate !== dueDate) ? 'sim' : 'não'}
                      </span>
                    </div>
                    {mode === 'create' && (
                      <div className="kg-tm-title-hint" style={{ marginTop: 4 }}>
                        Subtarefas aparecem numa seção própria depois que a tarefa é criada.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Subtarefas (só em edição) ─────────────────────────────── */}
            {mode === 'edit' && task && (
              <div className="kg-field">
                <span className="kg-field-label">Subtarefas</span>
                {subtasks.map((s) => {
                  const PRIO_CYCLE = [0, 1, 2, 3]
                  const nextPrio = PRIO_CYCLE[(PRIO_CYCLE.indexOf(s.priority ?? 0) + 1) % PRIO_CYCLE.length]
                  const PRIO_DOT_COLOR = ['transparent', 'var(--p-low)', 'var(--p-med)', 'var(--p-high)']
                  return (
                    <div key={s.id} className="kg-subedit subtask-card">
                      <button
                        className={`kg-check${s.completed_at ? ' done' : ''}`}
                        style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0 }}
                        onClick={() => patchSub(s.id, { completed_at: s.completed_at ? null : new Date().toISOString() })}
                        aria-label={s.completed_at ? 'Reabrir' : 'Concluir'}
                      >
                        {s.completed_at && <Icon name="check" size={10} />}
                      </button>
                      <span
                        className={`sub-title${s.completed_at ? ' done-text' : ''}`}
                        onClick={() => onOpenTask ? (onClose(), onOpenTask(s)) : undefined}
                      >
                        {s.title}
                      </span>
                      {(s.assignees ?? []).length > 0 && (
                        <AvatarStack assignees={s.assignees ?? []} size={16} max={2} />
                      )}
                      <button
                        className="kg-icon-btn"
                        title={`Prioridade: ${PRIORITIES[s.priority ?? 0]?.label}`}
                        style={{ border: 'none', padding: 4 }}
                        onClick={() => patchSub(s.id, { priority: nextPrio })}
                        aria-label="Ciclar prioridade"
                      >
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: PRIO_DOT_COLOR[s.priority ?? 0] ?? 'var(--line)', border: '1px solid var(--line)' }} />
                      </button>
                      <button className="kg-icon-btn" onClick={() => removeSub(s.id)} aria-label="Excluir subtarefa">
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="kg-input" placeholder="Adicionar subtarefa + Enter…" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub() }} />
                  <button className="kg-btn" onClick={addSub}><Icon name="plus" size={14} /></button>
                </div>
              </div>
            )}
          </div>{/* fim .kg-modal-body */}

          {!notesCollapsed && (
            <>
              <div
                className="kg-split-resize"
                onMouseDown={(e) => { e.preventDefault(); startResize(e.clientX, noteWidth) }}
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar notas"
              />
              <div className="kg-note-pane" style={{ flex: `0 0 ${noteWidth}px` }}>
                <MarkdownNotesEditor
                  value={description}
                  onChange={setDescription}
                  onOpenTask={openMentionedTask}
                  onCollapse={() => setNotesCollapsed(true)}
                />
              </div>
            </>
          )}

        </div>{/* fim .kg-modal-split */}

        <div className="kg-modal-foot">
          {mode === 'edit' && task && !askDelete && (
            <button className="kg-btn kg-btn-ghost kg-btn-danger" style={{ marginRight: 'auto' }} onClick={() => setAskDelete(true)}>
              <Icon name="trash" size={14} /> Excluir
            </button>
          )}
          {askDelete && (
            <div className="kg-del-confirm" style={{ marginRight: 'auto' }}>
              {isRecurring ? (
                <>
                  <span className="kg-hint">Excluir:</span>
                  <button className="kg-btn kg-btn-ghost" onClick={() => doDelete('this')}>Só esta</button>
                  <button className="kg-btn kg-btn-danger" onClick={() => doDelete('series')}>A série inteira</button>
                </>
              ) : (
                <>
                  <span className="kg-hint">Confirmar exclusão?</span>
                  <button className="kg-btn kg-btn-danger" onClick={() => doDelete('this')}>Excluir</button>
                </>
              )}
              <button className="kg-btn kg-btn-ghost" onClick={() => setAskDelete(false)}>Cancelar</button>
            </div>
          )}
          {!askDelete && (
            <>
              {isRecurring && <button className="kg-btn kg-btn-ghost" onClick={endSeries}>Concluir série</button>}
              <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="kg-btn kg-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
