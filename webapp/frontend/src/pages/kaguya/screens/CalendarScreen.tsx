// CalendarScreen (CalendarPro) — orquestra as três visões do Calendar Hub (fatia 019).
// Substitui a tela de calendário anterior (013) por uma que agrega tarefas Kaguya +
// itens cross-agent (Nami/Frieren/Violet via calendar_hub) no mesmo grid visual.
//
// Fluxo principal:
//   1. useMemo calcula a janela (windowStart/End/days) a partir de view+refDate
//   2. useEffect(tasks): chama kaguyaApi.calendar() para tarefas + virtuais de recorrentes
//   3. useEffect(hub):   chama calendarAggregate() para itens cross-agent (Nami, Frieren, etc.)
//   4. useEffect(cals):  chama calendarSources() para a lista de fontes com cores
//   5. Combina tasks + hub items em calEvents[], passa para TimeGrid ou MonthGrid
//   6. CalendarsAside.onSourcesChanged → incrementa sourcesKey → recarrega aggregate
//   7. onEventClick → abre EventPopover ; onEventContextMenu → abre ContextMenu
//   8. onCreateSlot → createTask ; onTimeDrop → updateTask (time-blocking)

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task, CalEvent, Calendar, CalendarItem } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { CalNavBar } from '../components/CalNavBar'
import { TimeGrid } from '../components/TimeGrid'
import { MonthGrid } from '../components/MonthGrid'
import { CalendarsAside } from '../components/CalendarsAside'
import { EventPopover } from '../components/EventPopover'
import { ContextMenu } from '../components/ContextMenu'

// ── Props ────────────────────────────────────────────────────────────────────

// Interface idêntica à CalendarScreen anterior — KaguyaShell não precisa mudar.
interface CalendarProProps {
  reloadKey: number
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Helpers de data ──────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ── Conversão CalendarItem → CalEvent ────────────────────────────────────────

// Converte um item do hub (snake_case, provedores cross-agent) para o formato normalizado
// CalEvent (camelCase) que TimeGrid e MonthGrid consomem.
function hubToCalEvent(item: CalendarItem): CalEvent {
  // `ref_id` é o ID do registro na fonte; prefixamos com o cal para garantir unicidade global
  const id = item.ref_id ? `${item.cal}-${item.ref_id}` : `hub-${item.cal}-${item.date}-${item.title}`
  return {
    id,
    cal: item.cal,
    // `date` é o dia canônico; `start` tem o horário completo quando o evento não é all-day
    day: item.date,
    start: item.start ?? null,
    end: item.end ?? null,
    allDay: item.all_day,
    color: item.color ?? null,
    kind: 'event',       // itens cross-agent são "eventos", não "tasks" (não abrem TaskModal)
    title: item.title,
    deepLink: item.deep_link ?? undefined,
    loc: item.loc ?? undefined,
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function CalendarScreen({ reloadKey, onOpenTask: _onOpenTask, toast }: CalendarProProps) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [refDate, setRefDate] = useState<Date>(() => new Date())
  const [tasks, setTasks] = useState<Task[]>([])
  const [hubItems, setHubItems] = useState<CalendarItem[]>([])
  const [gcalItems, setGcalItems] = useState<CalEvent[]>([])   // Agenda pessoal (Google)
  const [cals, setCals] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(true)
  const [hintVisible, setHintVisible] = useState(false)

  // Incrementado quando o usuário alterna visibilidade/cor de um calendário.
  // Força o re-fetch do aggregate e da lista de fontes.
  const [sourcesKey, setSourcesKey] = useState(0)

  // Popover e context-menu: null = fechado; { ev, pos } = aberto.
  const [popover, setPopover] = useState<{ ev: CalEvent; pos: { x: number; y: number } } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ ev: CalEvent; pos: { x: number; y: number } } | null>(null)

  // ── Janela visível ────────────────────────────────────────────────────────

  const { windowStart, windowEnd, days } = useMemo(() => {
    if (view === 'day') {
      const iso = toISO(refDate)
      return { windowStart: iso, windowEnd: iso, days: [iso] }
    }
    if (view === 'week') {
      const sunday = addDays(refDate, -refDate.getDay())
      const dayList = Array.from({ length: 7 }, (_, i) => toISO(addDays(sunday, i)))
      return { windowStart: dayList[0], windowEnd: dayList[6], days: dayList }
    }
    const firstOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
    const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay())
    const dayList = Array.from({ length: 42 }, (_, i) => toISO(addDays(gridStart, i)))
    return { windowStart: dayList[0], windowEnd: dayList[41], days: dayList }
  }, [view, refDate])

  // ── Carregamento das tarefas Kaguya ──────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await kaguyaApi.calendar(windowStart, windowEnd)
        if (!cancelled) setTasks(result)
      } catch {
        if (!cancelled) toast('Falha ao carregar tarefas.', 'err')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [windowStart, windowEnd, reloadKey, toast])

  // ── Carregamento do aggregate cross-agent ─────────────────────────────────

  // Recarrega sempre que a janela muda, reloadKey muda, ou sourcesKey muda
  // (sourcesKey é incrementado quando o usuário altera prefs de visibilidade/cor).
  useEffect(() => {
    let cancelled = false
    kaguyaApi.calendarAggregate(windowStart, windowEnd)
      .then((res) => { if (!cancelled) setHubItems(res.items) })
      .catch(() => { if (!cancelled) setHubItems([]) })
    return () => { cancelled = true }
  }, [windowStart, windowEnd, reloadKey, sourcesKey])

  // ── Carregamento da lista de fontes (com prefs de cor) ────────────────────

  // Recarrega quando o usuário altera prefs (sourcesKey) para refletir a nova cor.
  useEffect(() => {
    let cancelled = false
    kaguyaApi.calendarSources()
      .then((srcs) => { if (!cancelled) setCals(srcs) })
      .catch(() => { if (!cancelled) setCals([]) })
    return () => { cancelled = true }
  }, [sourcesKey])

  // ── Carregamento da Agenda pessoal Google (eventos gcal diretos) ─────────────
  // Carrega apenas quando o calendário "gcal" está visível nas prefs.
  // Exclui automaticamente "Kaguya — Tarefas" e "TickTick" (feito no backend).

  useEffect(() => {
    const gcalVisible = cals.some((c) => c.id === 'gcal' && c.visible !== false)
    if (!gcalVisible) {
      setGcalItems([])
      return
    }
    let cancelled = false
    kaguyaApi.calendarEvents(windowStart, windowEnd)
      .then((events) => {
        if (cancelled) return
        // Mapeia os eventos Google para o formato CalEvent normalizado (cal="gcal")
        const mapped: CalEvent[] = events.map((ev) => {
          const isAllDay = !ev.start.includes('T')
          return {
            id: `gcal-${ev.id}`,
            cal: 'gcal',
            day: ev.start.slice(0, 10),
            start: isAllDay ? null : ev.start,
            end: isAllDay ? null : ev.end,
            allDay: isAllDay,
            color: null,
            kind: 'event' as const,
            title: ev.summary,
            loc: ev.location || undefined,
          }
        })
        setGcalItems(mapped)
      })
      .catch(() => { if (!cancelled) setGcalItems([]) })
    return () => { cancelled = true }
  }, [windowStart, windowEnd, reloadKey, sourcesKey, cals])

  // ── Dica de uso ───────────────────────────────────────────────────────────

  useEffect(() => {
    setHintVisible(true)
    const t = setTimeout(() => setHintVisible(false), 4200)
    return () => clearTimeout(t)
  }, [])

  // ── Mapeamento Task → CalEvent ────────────────────────────────────────────

  function taskToCalEvent(t: Task): CalEvent | null {
    if (t.start_at) {
      return {
        id: String(t.id),
        cal: 'kaguya',
        day: t.start_at.slice(0, 10),
        start: t.start_at,
        end: t.end_at ?? null,
        allDay: false,
        color: null,
        kind: 'task',
        title: t.title,
        taskId: t.id,
      }
    }
    if (t.due_date) {
      return {
        id: String(t.id),
        cal: 'kaguya',
        day: t.due_date,
        start: null,
        end: null,
        allDay: true,
        color: null,
        kind: 'task',
        title: t.title,
        taskId: t.id,
      }
    }
    return null
  }

  // Eventos combinados: tarefas Kaguya + hub cross-agent + Agenda pessoal Google.
  // Os feeds são concatenados — o grid os ordena por horário internamente.
  const calEvents: CalEvent[] = useMemo(() => {
    const taskEvents = tasks.flatMap((t) => { const e = taskToCalEvent(t); return e ? [e] : [] })
    const hubEvents = hubItems.map(hubToCalEvent)
    return [...taskEvents, ...hubEvents, ...gcalItems]
  }, [tasks, hubItems, gcalItems])

  // ── Navegação ─────────────────────────────────────────────────────────────

  const handleNav = (delta: 1 | -1) => {
    setRefDate((prev) => {
      if (view === 'day') return addDays(prev, delta)
      if (view === 'week') return addDays(prev, delta * 7)
      const m = new Date(prev)
      m.setMonth(m.getMonth() + delta)
      return m
    })
  }

  const handleToday = () => setRefDate(new Date())

  // ── Refresh (pós-edição no popover/menu) ─────────────────────────────────

  // Fecha o popover/menu e dispara re-fetch das tarefas e do aggregate.
  // Definido antes dos outros handlers porque handleCreateSlot depende dele.
  const handleRefresh = useCallback(() => {
    setPopover(null)
    setCtxMenu(null)
    // Força re-fetch: bump sourcesKey não recarrega tarefas diretamente,
    // então fazemos o equivalente ao reloadKey via setTasks([]) seguido de load.
    setTasks((prev) => [...prev])
    setSourcesKey((k) => k + 1)
  }, [])

  // ── Clique em evento → abre EventPopover ────────────────────────────────

  const handleEventClick = useCallback((ev: CalEvent, pos: { x: number; y: number }) => {
    setCtxMenu(null)       // fecha context-menu caso aberto
    setPopover({ ev, pos })
  }, [])

  // ── Clique-direito em evento → abre ContextMenu ───────────────────────────

  const handleEventContextMenu = useCallback((ev: CalEvent, pos: { x: number; y: number }) => {
    setPopover(null)       // fecha popover caso aberto
    setCtxMenu({ ev, pos })
  }, [])

  // ── Criar slot arrastando área vazia → createTask ─────────────────────────

  const handleCreateSlot = useCallback(async (day: string, startISO: string, endISO: string) => {
    try {
      // createTask não aceita start_at/end_at — criamos a tarefa primeiro, depois gravamos o bloco.
      const result = await kaguyaApi.createTask({ title: 'Nova tarefa', due_date: day })
      if (result.id) {
        await kaguyaApi.setTimeBlock(result.id, { start_at: startISO, end_at: endISO })
      }
      handleRefresh()
      toast('Tarefa criada', 'ok')
    } catch {
      toast('Falha ao criar tarefa', 'err')
    }
  }, [toast, handleRefresh])

  // ── Time-blocking via drop de TrayCard ────────────────────────────────────

  const handleTimeDrop = useCallback(async (taskId: number, day: string, startISO: string) => {
    try {
      // Atualiza o due_date para o dia de drop, depois grava o bloco de tempo.
      await kaguyaApi.updateTask(taskId, { due_date: day })
      await kaguyaApi.setTimeBlock(taskId, { start_at: startISO })
      toast('Tarefa movida', 'ok')
    } catch {
      toast('Falha ao mover tarefa', 'err')
    }
  }, [toast])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="calx" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <CalNavBar
        view={view}
        refDate={refDate}
        onViewChange={setView}
        onNav={handleNav}
        onToday={handleToday}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Coluna do grid principal */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {loading && (
            <div style={{ padding: 16, color: 'var(--ink-4)', fontSize: 13 }}>
              Carregando…
            </div>
          )}

          {!loading && (view === 'month'
            ? (
              <MonthGrid
                refDate={refDate}
                events={calEvents}
                cals={cals}
                onDayClick={(d) => {
                  setRefDate(new Date(d + 'T12:00:00'))
                  setView('day')
                }}
              />
            )
            : (
              <TimeGrid
                days={days}
                events={calEvents}
                cals={cals}
                onEventClick={handleEventClick}
                onEventContextMenu={handleEventContextMenu}
                onCreateSlot={handleCreateSlot}
                onTimeDrop={handleTimeDrop}
                onRefresh={handleRefresh}
              />
            )
          )}
        </div>

        {/* Sidebar: mini-mês + lista de fontes com toggle/recolor */}
        <CalendarsAside
          refDate={refDate}
          selectedDate={toISO(refDate)}
          onDayClick={(d) => {
            setRefDate(new Date(d + 'T12:00:00'))
          }}
          // Quando o usuário altera prefs: incrementa sourcesKey para forçar re-fetch
          onSourcesChanged={() => setSourcesKey((k) => k + 1)}
        />
      </div>

      {/* Dica de uso: desaparece após 4,2 s */}
      <div className={`cal-hint${hintVisible ? ' visible' : ''}`}>
        Clique em um horário vazio para criar • Arraste para mover
      </div>

      {/* EventPopover: abre ao clicar num evento */}
      {popover && (
        <EventPopover
          ev={popover.ev}
          cals={cals}
          pos={popover.pos}
          onClose={() => setPopover(null)}
          onRefresh={handleRefresh}
        />
      )}

      {/* ContextMenu: abre com clique-direito num evento */}
      {ctxMenu && (
        <ContextMenu
          ev={ctxMenu.ev}
          cals={cals}
          pos={ctxMenu.pos}
          onClose={() => setCtxMenu(null)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}
