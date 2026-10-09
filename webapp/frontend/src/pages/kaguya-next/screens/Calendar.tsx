// Calendário (Calendar Hub): Dia, Semana e Mês com as tarefas da Kaguya, os eventos do Google e os itens dos outros agentes
// (finanças, livros, diário…) lado a lado. Criar arrastando um horário vazio, mover e redimensionar tarefas e eventos
// (com Desfazer), soltar tarefas da bandeja na grade, arrastar tarefas entre dias no mês, abrir/concluir pelo evento e a
// faixa de expediente (com almoço e as exceções por dia) desenhada na grade. Respeita o espaço Trabalho/Pessoal.

import { useCallback, useMemo, useState } from 'react'
import { ErrorState, IconButton, LoadingState, Page, SegmentedControl, Button, toast } from '../../../design'
import { MONTHS_LONG, WEEKDAYS_SHORT, parseISODate } from '../../../design/core/format'
import { gcalCalendarId, kaguyaApi } from '../api'
import { CalendarSide, type GcalStatus } from '../components/CalendarSide'
import { EventMenu, EventPopover } from '../components/EventPopover'
import { MonthGrid } from '../components/MonthGrid'
import { TimeGrid, type Placement } from '../components/TimeGrid'
import { useKaguya } from '../context'
import {
  gcalToEvent, hubToEvent, isGcalId, isoWeek, localISO, shiftRef, taskToEvent, visibleInSpace, windowFor, workBand, type CalView, type GcalRaw,
} from '../lib/calendar'
import { useLoad } from '../lib/useLoad'
import type { CalEvent, Calendar, Task } from '../types'

const VIEW_KEY = 'kaguya-next:calendar-view'
const reason = (e: unknown, fallback: string) => (e instanceof Error && e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback)

function readView(): CalView {
  try { const v = localStorage.getItem(VIEW_KEY); if (v === 'day' || v === 'week' || v === 'month') return v } catch { /* sem armazenamento */ }
  return 'week'
}

export function title(view: CalView, ref: string): string {
  const d = parseISODate(ref)
  if (view === 'day') return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()].toLowerCase()}`
  return `${MONTHS_LONG[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`
}

export function Calendar() {
  const k = useKaguya()
  const [view, setViewState] = useState<CalView>(readView)
  const [ref, setRef] = useState(k.today)
  const [keyed, setKeyed] = useState(0) // sobe quando algo muda no calendário (cor, visibilidade, mover…)
  const [popover, setPopover] = useState<{ ev: CalEvent; pos: { x: number; y: number } } | null>(null)
  const [menu, setMenu] = useState<{ ev: CalEvent; pos: { x: number; y: number } } | null>(null)
  const [localCals, setLocalCals] = useState<Calendar[] | null>(null) // atualização otimista de cor/visibilidade/contexto

  const win = useMemo(() => windowFor(view, ref), [view, ref])
  const deps = [win.start, win.end, k.rev, keyed, k.space]
  const tasks = useLoad(() => kaguyaApi.calendar(win.start, win.end, undefined, k.space), deps)
  const hub = useLoad(() => kaguyaApi.calendarAggregate(win.start, win.end).then((r) => r.items).catch(() => []), deps)
  const gcal = useLoad<GcalRaw[]>(() => kaguyaApi.calendarEvents(win.start, win.end).catch(() => []), deps)
  const sources = useLoad(() => kaguyaApi.calendarSources().catch(() => [] as Calendar[]), [keyed])
  const status = useLoad<GcalStatus>(() => kaguyaApi.gcalStatus().catch(() => ({ connected: false, reason: 'Erro ao verificar a autenticação' })), [])
  const sched = useLoad(() => kaguyaApi.schedule.get().catch(() => null), [k.rev])
  const overrides = useLoad(() => kaguyaApi.schedule.overrides().catch(() => []), [k.rev])
  const undatedAll = useLoad(() => kaguyaApi.viewTasks('all', k.space).catch(() => [] as Task[]), [k.rev, k.space])

  const cals: Calendar[] = localCals ?? (sources.state.status === 'ok' ? sources.state.data : [])
  const taskList: Task[] = tasks.state.status === 'ok' ? tasks.state.data : []

  const events = useMemo(() => {
    const own = taskList.flatMap((t) => { const e = taskToEvent(t); return e ? [e] : [] })
    const hubEv = (hub.state.status === 'ok' ? hub.state.data : []).map(hubToEvent)
    // O filtro de visibilidade dos calendários Google é local: ligar/desligar é instantâneo e reversível, sem nova consulta.
    const visibleGcal = new Set(cals.filter((c) => isGcalId(c.id) && c.visible !== false).map((c) => c.id))
    const google = (gcal.state.status === 'ok' ? gcal.state.data : []).map(gcalToEvent).filter((e) => visibleGcal.has(e.cal))
    return [...own, ...hubEv, ...google].filter((e) => visibleInSpace(e, k.space, cals))
  }, [taskList, hub.state, gcal.state, cals, k.space])

  const bands = useMemo(() => {
    const prefs = sched.state.status === 'ok' ? sched.state.data : null
    const ov = overrides.state.status === 'ok' ? overrides.state.data : []
    return Object.fromEntries(win.days.map((d) => [d, workBand(d, prefs, ov)]))
  }, [win.days, sched.state, overrides.state])

  const unscheduled = useMemo(() => taskList.filter((t) => t.due_date && win.days.includes(t.due_date) && !t.start_at && !t.due_time && !t.completed_at), [taskList, win.days])
  const undated = useMemo(() => (undatedAll.state.status === 'ok' ? undatedAll.state.data.filter((t) => !t.due_date && !t.completed_at && !t.parent_id).slice(0, 8) : []), [undatedAll.state])

  const setView = (v: CalView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* só não lembra */ } }
  const refresh = useCallback(() => { setPopover(null); setMenu(null); setKeyed((n) => n + 1); k.reload() }, [k])
  const taskById = useCallback((id: number) => taskList.find((t) => t.id === id), [taskList])

  // ── Gravações (com Desfazer) ────────────────────────────────────────────────

  const saveBlock = async (taskId: number, day: string, startMin: number, endMin: number) => {
    await kaguyaApi.updateTask(taskId, { due_date: day })
    await kaguyaApi.setTimeBlock(taskId, { start_at: localISO(day, startMin), end_at: localISO(day, endMin) })
  }
  const restoreTask = async (t: Task | undefined, taskId: number) => {
    if (!t) return
    await kaguyaApi.updateTask(taskId, { due_date: t.due_date ?? null })
    if (t.start_at) await kaguyaApi.setTimeBlock(taskId, { start_at: t.start_at, end_at: t.end_at ?? undefined })
    else await kaguyaApi.clearTimeBlock(taskId)
  }

  const onMove = async (ev: CalEvent, to: Placement, from: Placement) => {
    try {
      if (ev.taskId) {
        const before = taskById(ev.taskId)
        await saveBlock(ev.taskId, to.day, to.startMin, to.endMin)
        toast(`“${ev.title}” movida.`, { tone: 'success', undo: () => { void restoreTask(before, ev.taskId!).then(refresh).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
      } else if (isGcalId(ev.cal)) {
        await kaguyaApi.updateCalendarEvent(ev.id, { start: localISO(to.day, to.startMin), end: localISO(to.day, to.endMin), day: to.day, calendar_id: gcalCalendarId(ev.cal) })
        toast(`“${ev.title}” movido.`, { tone: 'success', undo: () => { void kaguyaApi.updateCalendarEvent(ev.id, { start: localISO(from.day, from.startMin), end: localISO(from.day, from.endMin), day: from.day, calendar_id: gcalCalendarId(ev.cal) }).then(refresh).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
      }
      refresh()
    } catch (e) { toast(reason(e, 'Não foi possível mover.'), { tone: 'error' }); refresh() }
  }

  const onResize = async (ev: CalEvent, to: Placement) => {
    try {
      if (ev.taskId) await kaguyaApi.setTimeBlock(ev.taskId, { start_at: localISO(to.day, to.startMin), end_at: localISO(to.day, to.endMin) })
      else if (isGcalId(ev.cal)) await kaguyaApi.updateCalendarEvent(ev.id, { start: localISO(to.day, to.startMin), end: localISO(to.day, to.endMin), day: to.day, calendar_id: gcalCalendarId(ev.cal) })
      refresh()
    } catch (e) { toast(reason(e, 'Não foi possível redimensionar.'), { tone: 'error' }); refresh() }
  }

  // Soltar uma tarefa num horário da grade: vencimento no dia + bloco de tempo (padrão 30 min).
  const onDropTask = async (taskId: number, day: string, startISO: string) => {
    const before = taskById(taskId)
    try {
      await kaguyaApi.updateTask(taskId, { due_date: day })
      await kaguyaApi.setTimeBlock(taskId, { start_at: startISO })
      toast('Tarefa agendada.', { tone: 'success', undo: () => { void (before ? restoreTask(before, taskId) : kaguyaApi.updateTask(taskId, { due_date: null })).then(refresh).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
      refresh()
    } catch (e) { toast(reason(e, 'Não foi possível agendar.'), { tone: 'error' }) }
  }

  // Soltar uma tarefa num dia do mês: só o vencimento muda (a hora, se houver, fica).
  const onDropDay = async (taskId: number, day: string) => {
    const before = taskById(taskId)
    if (before?.due_date === day) return
    try {
      await kaguyaApi.updateTask(taskId, { due_date: day })
      toast(`Vence em ${day.slice(8)}/${day.slice(5, 7)}.`, { tone: 'success', undo: () => { void kaguyaApi.updateTask(taskId, { due_date: before?.due_date ?? null }).then(refresh).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } })
      refresh()
    } catch (e) { toast(reason(e, 'Não foi possível mudar o dia.'), { tone: 'error' }) }
  }

  const onCreate = (day: string, startISO: string, endISO: string) => {
    const s = new Date(startISO)
    const e = new Date(endISO)
    const pad = (n: number) => String(n).padStart(2, '0')
    k.newTask({ due: day, time: `${pad(s.getHours())}:${pad(s.getMinutes())}`, duration: (e.getTime() - s.getTime()) / 60000 })
  }

  // ── Fontes (otimista: reverte se a gravação falhar) ──────────────────────────

  const patchSource = async (cal: Calendar, patch: Partial<Calendar>, body: { visible?: boolean; color?: string; context?: 'personal' | 'work' }) => {
    const prev = cals
    setLocalCals(cals.map((c) => (c.id === cal.id ? { ...c, ...patch } : c)))
    try { await kaguyaApi.setCalendarPref(cal.id, body); setKeyed((n) => n + 1) } catch (e) { setLocalCals(prev); toast(reason(e, 'Não foi possível salvar.'), { tone: 'error' }) }
  }

  const loading = tasks.state.status === 'loading' || sources.state.status === 'loading'
  const goDay = (iso: string) => { setRef(iso); setView('day') }

  return (
    <Page wide className="kn-page kn-cal">
      <div className="kn-cbar">
        <div className="kn-ctitle">
          <h2>{title(view, ref)}</h2>
          {view === 'week' && <span className="ds-mono">semana {isoWeek(ref)}</span>}
        </div>
        <div className="kn-quick-i">
          <IconButton icon="left" label="Período anterior" onClick={() => setRef(shiftRef(view, ref, -1))} />
          <Button onClick={() => setRef(k.today)}>Hoje</Button>
          <IconButton icon="right" label="Próximo período" onClick={() => setRef(shiftRef(view, ref, 1))} />
        </div>
        <SegmentedControl<CalView> label="Visão do calendário" value={view} onChange={setView} options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]} />
      </div>

      <div className="kn-cbody">
        <div className="kn-cstage">
          {tasks.state.status === 'error' && <ErrorState onRetry={tasks.retry} />}
          {loading && <LoadingState variant="card" count={2} />}
          {!loading && tasks.state.status === 'ok' && (view === 'month' ? (
            <MonthGrid
              days={win.days} refDate={ref} today={k.today} events={events} cals={cals}
              onDay={goDay} onOpen={(ev, pos) => { setMenu(null); setPopover({ ev, pos }) }} onMenu={(ev, pos) => { setPopover(null); setMenu({ ev, pos }) }}
              onDropTask={(id, day) => void onDropDay(id, day)}
            />
          ) : (
            <TimeGrid
              days={win.days} today={k.today} events={events} cals={cals} bands={bands}
              onOpen={(ev, pos) => { setMenu(null); setPopover({ ev, pos }) }} onMenu={(ev, pos) => { setPopover(null); setMenu({ ev, pos }) }}
              onMove={(ev, to, from) => void onMove(ev, to, from)} onResize={(ev, to) => void onResize(ev, to)}
              onCreate={onCreate} onDropTask={(id, day, iso) => void onDropTask(id, day, iso)}
            />
          ))}
          <p className="ds-hint">Arraste um horário vazio para criar · arraste um evento para mover · solte uma tarefa da lateral na grade para agendar.</p>
        </div>
        <CalendarSide
          refDate={ref} today={k.today} onPick={(iso) => setRef(iso)} cals={cals} gcal={status.state.status === 'ok' ? status.state.data : null}
          onToggle={(c) => void patchSource(c, { visible: c.visible === false }, { visible: c.visible === false })}
          onContext={(c) => { const next = c.context === 'work' ? 'personal' : 'work'; void patchSource(c, { context: next }, { context: next }) }}
          onColor={(c, color) => void patchSource(c, { color }, { color })}
          unscheduled={unscheduled} undated={undated} onOpenTask={(id) => k.openTask(id)}
        />
      </div>

      {popover && <EventPopover ev={popover.ev} cals={cals} pos={popover.pos} onClose={() => setPopover(null)} onRefresh={refresh} />}
      {menu && <EventMenu ev={menu.ev} cals={cals} pos={menu.pos} onClose={() => setMenu(null)} onRefresh={refresh} onOpen={() => { setPopover(menu); setMenu(null) }} />}
    </Page>
  )
}
