// Meu Dia: o ritual do dia. Hero com os DOIS tempos livres (trabalho e geral, pela agenda real), experimentos e hábitos do dia,
// o resumo do foco, o plano (dividido em Trabalho | Pessoal ou único, conforme o espaço), pendências de ontem (Hoje · Amanhã ·
// Depois), sugestões a puxar, follow-ups de "aguardando" que chegaram, o modo férias (que esconde o trabalho) e a linha do dia
// (07h–23h) onde se reservam horários arrastando as tarefas do plano. Nada some em relação ao shell antigo.

import { DndContext, DragOverlay, closestCenter, useDraggable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, ErrorState, Hero, Icon, IconButton, LoadingState, Page, ProgressBar, SectionHeader, toast } from '../../../design'
import { fmtDateLong } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { DayTimeline } from '../components/DayTimeline'
import { FocusTree } from '../components/FocusTree'
import { QuickAddBar } from '../components/QuickAddBar'
import { TaskRow } from '../components/TaskRow'
import { useKaguya } from '../context'
import * as act from '../lib/actions'
import { localISO } from '../lib/calendar'
import { useDndSensors } from '../lib/dnd'
import { bucketView, showWorkBucket } from '../lib/freeTime'
import { fmtMinutes } from '../lib/taskView'
import { safe, useLoad } from '../lib/useLoad'
import type { Calendar, ExperimentDue, FocusDayStats, MyDayResponse, Task, TimeBucket } from '../types'

const greeting = (hour: number): string => (hour < 6 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite')
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

function Bucket({ label, icon, bucket }: { label: string; icon: 'work' | 'personal'; bucket: TimeBucket }) {
  const v = bucketView(bucket)
  return (
    <div className="kn-bucket" data-over={v.over || undefined}>
      <div className="kn-bucket-h"><Icon name={icon} size={14} /> <b>{label}</b> <span className="ds-mono">{v.line}</span></div>
      <ProgressBar value={v.pct} label={`${label}: ${v.line}`} />
      <p className="ds-hint">{v.note}</p>
    </div>
  )
}

/** Linha do plano que se arrasta até uma hora da linha do dia (a alça é o único ponto de arraste). */
function PlanRow({ task, children }: { task: Task; children: (p: { rowRef: (n: HTMLLIElement | null) => void; grip: React.ReactNode; dragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const grip = (
    <button type="button" className="kn-grip" aria-label={`Arrastar “${task.title}” até um horário`} {...attributes} {...listeners}>
      <Icon name="drag" size={14} />
    </button>
  )
  return <>{children({ rowRef: setNodeRef, grip, dragging: isDragging })}</>
}

/** Dias seguidos com foco, contando de hoje para trás. */
export const streakOf = (days: FocusDayStats[]): number => {
  let n = 0
  for (let i = days.length - 1; i >= 0 && days[i].sessoes > 0; i--) n++
  return n
}

export function Today() {
  const k = useKaguya()
  const { state, retry } = useLoad(() => kaguyaApi.myDay(), [k.rev])

  if (state.status === 'loading') return <Page wide><LoadingState variant="row" count={5} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>
  return <TodayBody data={state.data} />
}

function TodayBody({ data }: { data: MyDayResponse }) {
  const k = useKaguya()
  const deps = useMemo(() => ({ reload: k.reload }), [k.reload])
  const sensors = useDndSensors()
  const [dragId, setDragId] = useState<number | null>(null)
  // O Modo férias saiu da tela (o espaço Trabalho/Pessoal já cobre). Quem ainda o tinha ligado tem o trabalho escondido
  // pelo servidor sem como desligar: desliga uma vez, em silêncio.
  useEffect(() => { if (data.hide_work) void kaguyaApi.setMyDayPrefs(false).then(k.reload).catch(() => {}) }, [data.hide_work]) // eslint-disable-line react-hooks/exhaustive-deps
  const space = k.prefs.space
  const split = k.prefs.daySplit === 'split' && space === 'all'
  const ft = data.free_time

  // Blocos opcionais: se a consulta falhar, a seção só não aparece (o resto do dia continua).
  const due = useLoad<ExperimentDue[]>(() => safe(() => kaguyaApi.experiments.dueToday(), []), [k.rev])
  const focusToday = useLoad(() => safe(() => kaguyaApi.focus.today(), null), [k.rev])
  const focusWeek = useLoad(() => safe(() => kaguyaApi.focus.week(), null), [k.rev])
  const sources = useLoad<Calendar[]>(() => safe(() => kaguyaApi.calendarSources().then((s) => s.filter((x) => x.id.startsWith('gcal:'))), []), [k.rev])

  // O que mostrar conforme o espaço escolhido: um bloco por espaço (dividido) ou a união (único).
  const pick = <T,>(work: T[], personal: T[], all: T[]): T[] => (space === 'work' ? work : space === 'personal' ? personal : all)
  const plano = pick(data.plano_work, data.plano_personal, data.plano)
  const pendencias = pick(data.pendencias_ontem_work, data.pendencias_ontem_personal, data.pendencias_ontem)
  const sugestoes = pick(data.sugestoes_work, data.sugestoes_personal, data.sugestoes)
  const eventos = space === 'all' ? data.eventos : data.eventos.filter((e) => e.context === space)
  const now = new Date()
  const total = data.capacity.no_plano
  const planAll = data.plano
  const dragged = dragId != null ? planAll.find((t) => t.id === dragId) : undefined
  const fToday = focusToday.state.status === 'ok' ? focusToday.state.data : null
  const fWeek = focusWeek.state.status === 'ok' ? focusWeek.state.data : null
  const hasFocus = !!fToday && (fToday.sessoes > 0 || !!fWeek?.days.some((d) => d.sessoes > 0))

  const move = (t: Task, when: 'today' | 'tomorrow' | 'later') =>
    kaguyaApi.reschedule(t.id, when).then(k.reload).catch(() => toast('Não foi possível mover a tarefa.', { tone: 'error' }))
  const checkin = async (e: ExperimentDue) => {
    try {
      await kaguyaApi.experiments.log(e.id, { period_date: k.today, done: true })
      toast('Experimento registrado.', { tone: 'success', undo: () => { void kaguyaApi.experiments.removeLog(e.id, k.today).then(k.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
      k.reload()
    } catch (err) { toast(reason(err, 'Não foi possível registrar o experimento.'), { tone: 'error' }) }
  }
  const removeHabit = (id: number) => kaguyaApi.removeHabitFromMyDay(id).then(k.reload).catch(() => toast('Não foi possível tirar o hábito do Meu Dia.', { tone: 'error' }))
  const toggleCalendar = (id: string, visible: boolean) => kaguyaApi.setCalendarPref(id, { visible }).then(k.reload).catch(() => toast('Não foi possível mudar o calendário.', { tone: 'error' }))

  // Soltar uma tarefa do plano numa hora reserva o horário (a estimativa vira a duração; sem estimativa, 30 min).
  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null)
    const over = e.over ? String(e.over.id) : ''
    const task = planAll.find((t) => t.id === e.active.id)
    if (!task || !over.startsWith('hour:')) return
    const hour = Number(over.slice(5))
    if (Number.isNaN(hour)) return
    try {
      await kaguyaApi.setTimeBlock(task.id, { start_at: localISO(k.today, hour * 60), duration_min: task.duration_min || 30 })
      toast(`“${task.title}” reservada às ${String(hour).padStart(2, '0')}h.`, {
        tone: 'success',
        undo: () => { void (task.start_at ? kaguyaApi.setTimeBlock(task.id, { start_at: task.start_at, end_at: task.end_at ?? undefined }) : kaguyaApi.clearTimeBlock(task.id)).then(k.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) },
      })
      k.reload()
    } catch (err) { toast(reason(err, 'Não foi possível reservar o horário.'), { tone: 'error' }) }
  }
  const resizeBlock = (t: Task, endISO: string) =>
    kaguyaApi.setTimeBlock(t.id, { start_at: t.start_at!, end_at: endISO }).then(k.reload).catch(() => toast('Não foi possível salvar a duração.', { tone: 'error' }))
  const clearBlock = (t: Task) =>
    kaguyaApi.clearTimeBlock(t.id).then(() => {
      toast('Horário liberado.', { tone: 'success', undo: () => { void kaguyaApi.setTimeBlock(t.id, { start_at: t.start_at!, end_at: t.end_at ?? undefined }).then(k.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
      k.reload()
    }).catch(() => toast('Não foi possível liberar o horário.', { tone: 'error' }))

  const rows = (tasks: Task[], opts: { pending?: boolean; suggestion?: boolean; plan?: boolean } = {}) => (
    <ul className="kn-rows">
      {tasks.map((t) => {
        const row = (dnd?: { rowRef: (n: HTMLLIElement | null) => void; grip: React.ReactNode; dragging: boolean }) => (
          <TaskRow
            key={t.id}
            task={t}
            today={k.today}
            showProject
            active={k.route.taskId === t.id}
            rowRef={dnd?.rowRef}
            grip={dnd?.grip}
            dragging={dnd?.dragging}
            onToggle={() => void act.toggleComplete(deps, t)}
            onOpen={() => k.openTask(t.id)}
            menu={[
              { id: 'open', label: 'Abrir', onSelect: () => k.openTask(t.id) },
              ...(opts.suggestion ? [] : [{ id: 'out', label: 'Tirar do Meu Dia', onSelect: () => void act.removeFromMyDay(deps, [t.id]) }]),
              { id: 'del', label: 'Excluir', onSelect: () => void act.deleteTasks(deps, [t]) },
            ]}
            trailing={opts.pending ? (
              <span className="kn-trail">
                <Button size="sm" onClick={() => void move(t, 'today')}>Hoje</Button>
                <Button size="sm" onClick={() => void move(t, 'tomorrow')}>Amanhã</Button>
                <Button size="sm" variant="ghost" onClick={() => void move(t, 'later')}>Depois</Button>
              </span>
            ) : opts.suggestion ? (
              <Button size="sm" icon="add" onClick={() => void act.addToMyDay(deps, [t.id])}>Puxar</Button>
            ) : undefined}
          />
        )
        return opts.plan ? <PlanRow key={t.id} task={t}>{(p) => row(p)}</PlanRow> : row()
      })}
    </ul>
  )

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setDragId(Number(e.active.id))} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setDragId(null)}>
      <Page wide className="kn-page kn-day-page">
        <Hero
          eyebrow={fmtDateLong(k.today)}
          eyebrowIcon="sun"
          title={`${greeting(now.getHours())}!`}
          meta={
            <div className="kn-herometa">
              <p className="kn-now">
                {total === 0 ? <>Seu dia está <b>em branco</b>.</> : <><b>{total}</b> tarefa{total > 1 ? 's' : ''} no plano · <b>{fmtMinutes(data.capacity.estimado_min)}</b> estimados</>}
              </p>
              {ft ? (
                <div className="kn-buckets">
                  {(space !== 'personal') && showWorkBucket(ft.works, ft.work) && <Bucket label="Trabalho" icon="work" bucket={ft.work} />}
                  {(space !== 'work') && <Bucket label="Livre" icon="personal" bucket={ft.general} />}
                </div>
              ) : (
                <p className="kn-now">Livre hoje: <b>{fmtMinutes(Math.max(0, data.capacity.livre_min))}</b> · {data.capacity.excedeu ? 'plano acima do tempo' : `folga de ${fmtMinutes(Math.max(0, data.capacity.folga_min))}`}</p>
              )}
            </div>
          }
        />

        {hasFocus && fToday && (
          <section className="kn-focussum" aria-label="Foco de hoje">
            <p>
              <Icon name="focus" size={14} /> Focado hoje: <b>{fmtMinutes(fToday.total_min)}</b> · {fToday.sessoes} {fToday.sessoes === 1 ? 'sessão' : 'sessões'}
              {fWeek && streakOf(fWeek.days) > 1 && <> · <b>{streakOf(fWeek.days)}</b> dias seguidos</>}
            </p>
            {fWeek && (
              <div className="kn-focussum-week" title="Últimos 7 dias — uma árvore por dia com foco">
                {fWeek.days.map((d) => (d.sessoes > 0 ? <FocusTree key={d.date} minutes={d.total_min} outcome="completed" size={24} title={`${d.date}: ${d.total_min} min`} /> : <i key={d.date} className="kn-focussum-empty" aria-hidden="true" />))}
              </div>
            )}
          </section>
        )}

        <div className="kn-day">
          <div className="kn-day-main">
            <QuickAddBar due={k.today} myDay placeholder="Adicionar ao Meu Dia — Enter para criar" />

            {due.state.status === 'ok' && due.state.data.length > 0 && (
              <section aria-labelledby="kn-exp">
                <SectionHeader id="kn-exp" title="Experimentos de hoje" mono={`${due.state.data.length}`} />
                <ul className="kn-sublist">
                  {due.state.data.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="kn-main" onClick={() => k.goto({ view: 'experiments', id: e.id })}><span className="kn-title">{e.title}</span></button>
                      <span className="ds-mono">{e.cadence === 'weekly' ? 'semanal' : 'diário'}</span>
                      <Button size="sm" icon="check" onClick={() => void checkin(e)}>Fiz</Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.habitos.length > 0 && (
              <section aria-labelledby="kn-hab">
                <SectionHeader id="kn-hab" title="Hábitos do dia" mono={`${data.habitos.length}`} />
                <ul className="kn-sublist">
                  {data.habitos.map((h) => (
                    <li key={h.id}>
                      <button type="button" className="kn-main" onClick={() => k.goto({ view: 'habits' })}><span className="kn-title">{h.name}</span></button>
                      {h.duration_min != null && <span className="ds-mono">{fmtMinutes(h.duration_min)}</span>}
                      <IconButton icon="close" size={14} label={`Tirar ${h.name} do Meu Dia`} onClick={() => void removeHabit(h.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.pendencias_ontem.length > 0 && pendencias.length > 0 && (
              <section aria-labelledby="kn-pend">
                <SectionHeader id="kn-pend" title="Pendências de ontem" mono={`${pendencias.length}`} />
                {rows(pendencias, { pending: true })}
              </section>
            )}

            <section aria-labelledby="kn-plano">
              <SectionHeader id="kn-plano" title="Plano de hoje" mono={`${plano.length}`} />
              {split ? (
                <div className="kn-day-cols">
                  <div><h3 className="kn-h3"><Icon name="work" size={14} /> Trabalho</h3>{data.plano_work.length ? rows(data.plano_work, { plan: true }) : <p className="ds-hint">Nada de trabalho planejado.</p>}</div>
                  <div><h3 className="kn-h3"><Icon name="personal" size={14} /> Pessoal</h3>{data.plano_personal.length ? rows(data.plano_personal, { plan: true }) : <p className="ds-hint">Nada pessoal planejado.</p>}</div>
                </div>
              ) : plano.length ? rows(plano, { plan: true }) : (
                <EmptyState icon="sun" title="Nada planejado ainda" hint="Puxe uma sugestão abaixo ou adicione uma tarefa na barra. O que você colocar aqui entra na conta do tempo livre." />
              )}
            </section>

            {sugestoes.length > 0 && (
              <section aria-labelledby="kn-sug">
                <SectionHeader id="kn-sug" title="Sugestões" mono="vencem em até 7 dias, ou é hora de cobrar" />
                {rows(sugestoes, { suggestion: true })}
              </section>
            )}

            {eventos.length > 0 && (
              <section aria-labelledby="kn-ev">
                <SectionHeader id="kn-ev" title="Agenda" mono={`${eventos.length}`} />
                <ul className="kn-events">
                  {eventos.map((e) => (
                    <li key={e.id}>
                      <span className="ds-mono">{e.all_day ? 'dia todo' : `${e.start?.slice(11, 16)}–${e.end?.slice(11, 16)}`}</span>
                      <span>{e.title}</span>
                      <span className="kn-proj">{e.calendar_name}{e.context === 'work' ? ' · trabalho' : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="kn-day-side">
            <DayTimeline
              today={k.today}
              plano={planAll}
              eventos={eventos}
              sources={sources.state.status === 'ok' ? sources.state.data : []}
              onToggleCalendar={(id, v) => void toggleCalendar(id, v)}
              onOpen={(id) => k.openTask(id)}
              onResize={(t, end) => void resizeBlock(t, end)}
              onClearBlock={(t) => void clearBlock(t)}
            />
          </aside>
        </div>
      </Page>
      <DragOverlay dropAnimation={null}>{dragged ? <div className="kn-drag-ghost">{dragged.title}</div> : null}</DragOverlay>
    </DndContext>
  )
}
