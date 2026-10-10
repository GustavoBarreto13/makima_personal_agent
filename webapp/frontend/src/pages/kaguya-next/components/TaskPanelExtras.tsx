// O restante das propriedades da tarefa no painel de detalhe: tipo (tarefa, evento, aniversário), o horário (bloco de tempo
// no calendário: início, fim e, se passar de um dia, a data final), a coluna do Kanban, o local (“Onde @”), como a série
// recorrente se repete (data fixa ou após concluir) e as PESSOAS da Komi — os responsáveis e, quando está aguardando, de
// quem se espera. Cada campo salva sozinho, como o resto do painel.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Field, IconButton, PersonPicker, SegmentedControl, Select, TimePicker, toast, type PersonOption } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { localISO, localDayOf, minToLabel, timeToMin } from '../lib/calendar'
import { safe, useLoad } from '../lib/useLoad'
import type { Column, Person, RecurrenceMode, Task, TaskContext, TaskType } from '../types'

type Save = (p: Parameters<typeof kaguyaApi.updateTask>[1], ok?: string) => Promise<void>

const TYPES: { value: TaskType; label: string }[] = [{ value: 'task', label: 'Tarefa' }, { value: 'event', label: 'Evento' }, { value: 'birthday', label: 'Aniversário' }]
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const reason = (e: unknown) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível salvar.')
const opt = (p: Person): PersonOption => ({ id: p.id, name: p.name, avatar: p.avatar_url })

/** O catálogo da Komi é carregado uma vez por abertura do painel e filtrado aqui (sem acento nem caixa). */
export function usePeople() {
  const { state } = useLoad<Person[]>(() => safe(() => kaguyaApi.listPeople(), []), [])
  const [added, setAdded] = useState<Person[]>([])
  const all = useMemo(() => [...(state.status === 'ok' ? state.data : []), ...added], [state, added])
  const search = useCallback((q: string) => all.filter((p) => norm(p.name).includes(norm(q))).slice(0, 8).map(opt), [all])
  const create = useCallback(async (name: string) => {
    const p = await kaguyaApi.createPerson(name)
    setAdded((cur) => [...cur, p])
    return opt(p)
  }, [])
  return { all, search, create }
}

/** Os campos do painel que vão além do básico, cada um como um bloco solto: quem monta a tela escolhe a ordem. */
export function useTaskExtras(task: Task, save: Save) {
  const k = useKaguya()
  const people = usePeople()
  const project = k.projects.find((p) => p.id === task.project_id)
  const columns = useLoad<Column[]>(() => (project?.has_board ? safe(() => kaguyaApi.listColumns(task.project_id), []) : Promise.resolve([])), [task.project_id, project?.has_board])
  const cols = columns.state.status === 'ok' ? columns.state.data : []
  const contexts = useLoad<TaskContext[]>(() => safe(() => kaguyaApi.listContexts(), []), [])

  // O bloco de tempo vive em start_at/end_at; o dia vem do vencimento (ou do próprio bloco).
  const day = task.due_date ?? (task.start_at ? localDayOf(task.start_at) : null)
  const startMin = task.start_at ? timeToMin(task.start_at) : null
  const endMin = task.end_at ? timeToMin(task.end_at) : null
  const endDay = task.end_at ? localDayOf(task.end_at) : day
  const [endDate, setEndDate] = useState(endDay ?? '')
  useEffect(() => setEndDate(endDay ?? ''), [task.id, task.end_at, task.due_date]) // eslint-disable-line react-hooks/exhaustive-deps

  const block = async (patch: { start?: number | null; end?: number | null; endDay?: string }) => {
    if (!day) { toast('Defina a data de vencimento antes do horário.', { tone: 'error' }); return }
    const s = patch.start === undefined ? startMin : patch.start
    if (s === null) {
      try { await kaguyaApi.clearTimeBlock(task.id); k.reload() } catch (e) { toast(reason(e), { tone: 'error' }) }
      return
    }
    const e: number = patch.end ?? endMin ?? s + (task.duration_min || 30)
    const ed = patch.endDay ?? endDay ?? day
    try {
      await kaguyaApi.setTimeBlock(task.id, { start_at: localISO(day, s), end_at: localISO(ed, ed === day ? Math.max(e, s + 15) : e) })
      k.reload()
    } catch (err) { toast(reason(err), { tone: 'error' }) }
  }

  const assignees: PersonOption[] = (task.assignees ?? []).map((a) => ({ id: a.id, name: a.name, avatar: a.avatar_url }))
  const waitingPerson = task.waiting_person_id ? people.all.find((p) => p.id === task.waiting_person_id) : undefined
  const waitingValue: PersonOption[] = task.waiting_person_id ? [waitingPerson ? opt(waitingPerson) : { id: task.waiting_person_id, name: 'Pessoa da Komi' }] : []
  const ctxs = contexts.state.status === 'ok' ? contexts.state.data : []
  const mode: RecurrenceMode = task.recurrence?.mode ?? 'fixed'

  const type = (
    <Field label="Tipo">{() => (
      <SegmentedControl<TaskType> label="Tipo" value={task.type} options={TYPES} onChange={(v) => void save({ type: v })} />
    )}</Field>
  )

  const time = (
    <Field label="Horário" hint={day ? (startMin === null ? 'Sem horário: aparece como dia inteiro no calendário.' : 'Vira um bloco no calendário e entra na conta do tempo livre.') : 'Defina a data de vencimento para marcar um horário.'}>{() => (
      <div className="kn-quick">
        {startMin !== null && (
          <>
            <TimePicker value={minToLabel(startMin)} onChange={(v) => void block({ start: timeToMin(v) })} />
            <span>até</span>
            <TimePicker value={minToLabel(endMin ?? startMin + (task.duration_min || 30))} onChange={(v) => void block({ end: timeToMin(v) })} />
            {endDate && endDate !== day && <DatePicker value={endDate} onChange={(iso) => { setEndDate(iso); void block({ endDay: iso }) }} />}
            <IconButton icon="close" label="Tirar o horário" onClick={() => void block({ start: null })} />
          </>
        )}
        {startMin === null && day && <Button size="sm" icon="clock" onClick={() => void block({ start: 9 * 60 })}>Marcar horário</Button>}
      </div>
    )}</Field>
  )

  const column = project?.has_board && cols.length > 0 ? (
    <Field label="Coluna do quadro">{(c) => (
      <Select {...c} value={task.column_id ?? ''} onChange={(e) => void save({ column_id: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Sem coluna</option>
        {cols.map((col) => <option key={col.id} value={col.id}>{col.name}{col.is_done_column ? ' (concluídas)' : ''}</option>)}
      </Select>
    )}</Field>
  ) : null

  const where = (
    <Field label="Onde (@)" hint="Onde a tarefa pode ser feita.">{(c) => (
      <Select {...c} value={task.context_id ?? ''} onChange={(e) => void save({ context_id: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Sem local</option>
        {ctxs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
    )}</Field>
  )

  const recurrenceMode = task.recurrence?.active ? (
    <Field label="A série se repete" hint={mode === 'fixed' ? 'A próxima vence na data da regra, mesmo que você atrase.' : 'A próxima conta a partir do dia em que você concluir.'}>{() => (
      <SegmentedControl<RecurrenceMode>
        label="Modo da repetição"
        value={mode}
        options={[{ value: 'fixed', label: 'Data fixa' }, { value: 'after_completion', label: 'Após concluir' }]}
        onChange={(m) => void save({ recurrence: { rrule: task.recurrence!.rrule, mode: m } })}
      />
    )}</Field>
  ) : null

  const peopleField = (
    <Field label="Pessoas" hint="Quem participa ou responde por esta tarefa (cadastro da Komi).">{(c) => (
      <PersonPicker id={c.id} value={assignees} search={people.search} onCreate={people.create} onChange={(list) => void save({ person_ids: list.map((p) => p.id) })} />
    )}</Field>
  )

  const waiting = task.gtd_status === 'waiting' ? (
    <Field label="Aguardando resposta de" hint="Escolha a pessoa para cobrar no dia certo.">{(c) => (
      <PersonPicker id={c.id} value={waitingValue} search={people.search} onCreate={people.create} onChange={(list) => void save({ waiting_person_id: list.length ? list[list.length - 1].id : null })} />
    )}</Field>
  ) : null

  return { type, time, column, where, recurrenceMode, people: peopleField, waiting }
}

/** Todos os extras em sequência (a ordem do painel lateral original). */
export function TaskPanelExtras({ task, save }: { task: Task; save: Save }) {
  const x = useTaskExtras(task, save)
  return <>{x.type}{x.time}<div className="kn-props">{x.column}{x.where}{x.recurrenceMode}</div>{x.people}{x.waiting}</>
}
